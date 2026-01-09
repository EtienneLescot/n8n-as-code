import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import deepEqual from 'deep-equal';
import * as chokidar from 'chokidar';
import { N8nApiClient } from './n8n-api-client.js';
import { WorkflowSanitizer } from './workflow-sanitizer.js';
import { createInstanceIdentifier, createFallbackInstanceIdentifier } from './directory-utils.js';
import { StateManager } from './state-manager.js';
import { ISyncConfig, IWorkflow, WorkflowSyncStatus, IWorkflowStatus } from '../types.js';

interface IInstanceConfig {
    instanceIdentifier?: string;
    lastUsed?: string;
}

// Define a simple deepEqual if strict module resolution fails on the import
// For this environment, we'll try to rely on the package, but if it fails we might need a utility.
// Assuming user will install @types/deep-equal or allow implicits.

export class SyncManager extends EventEmitter {
    private client: N8nApiClient;
    private config: ISyncConfig;

    // Maps filename -> Workflow ID
    private fileToIdMap: Map<string, string> = new Map();
    // Maps filePath -> Content (to detect self-written changes)
    private selfWrittenCache: Map<string, string> = new Map();
    // Busy writing flag to avoid loops
    private isWriting = new Set<string>();

    private watcher: chokidar.FSWatcher | null = null;
    private pollInterval: NodeJS.Timeout | null = null;
    private stateManager: StateManager | null = null;

    constructor(client: N8nApiClient, config: ISyncConfig) {
        super();
        this.client = client;
        this.config = config;

        // Create base directory if it doesn't exist
        if (!fs.existsSync(this.config.directory)) {
            fs.mkdirSync(this.config.directory, { recursive: true });
        }
    }

    /**
     * Get the path to the instance configuration file
     */
    private getInstanceConfigPath(): string {
        return path.join(this.config.directory, 'n8n-as-code-instance.json');
    }

    /**
     * Load instance configuration from disk
     */
    private loadInstanceConfig(): IInstanceConfig {
        const configPath = this.getInstanceConfigPath();
        if (fs.existsSync(configPath)) {
            try {
                const content = fs.readFileSync(configPath, 'utf-8');
                return JSON.parse(content);
            } catch (error) {
                console.warn('Could not read instance config, using defaults:', error);
            }
        }
        return {};
    }

    /**
     * Save instance configuration to disk
     */
    private saveInstanceConfig(config: IInstanceConfig): void {
        const configPath = this.getInstanceConfigPath();
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }

    /**
     * Ensure instance identifier is set and persistent
     */
    private async ensureInstanceIdentifier(): Promise<string> {
        // Check if instance identifier is already provided in config
        if (this.config.instanceIdentifier && this.stateManager) {
            return this.config.instanceIdentifier;
        }

        // Try to load from persistent storage
        const instanceConfig = this.loadInstanceConfig();
        if (instanceConfig.instanceIdentifier) {
            this.config.instanceIdentifier = instanceConfig.instanceIdentifier;
            this.stateManager = new StateManager(this.getInstanceDirectory());
            return instanceConfig.instanceIdentifier;
        }

        // Generate new instance identifier
        const newIdentifier = await this.initializeInstanceIdentifier();
        
        // Save to persistent storage
        instanceConfig.instanceIdentifier = newIdentifier;
        instanceConfig.lastUsed = new Date().toISOString();
        this.saveInstanceConfig(instanceConfig);
        
        // Update config
        this.config.instanceIdentifier = newIdentifier;
        this.stateManager = new StateManager(this.getInstanceDirectory());
        
        return newIdentifier;
    }

    private async initializeInstanceIdentifier(): Promise<string> {
        try {
            // Try to get user information for friendly naming
            const user = await this.client.getCurrentUser();
            if (user) {
                // Use host from client configuration
                const host = this.client['client']?.defaults?.baseURL || 'unknown';
                return createInstanceIdentifier(host, user);
            }
        } catch (error) {
            console.warn('Could not get user info for instance identifier:', error);
        }

        // Fallback: use host and API key hash
        const host = this.client['client']?.defaults?.baseURL || 'unknown';
        const apiKey = this.client['client']?.defaults?.headers?.['X-N8N-API-KEY'] || 'unknown';
        return createFallbackInstanceIdentifier(host, String(apiKey));
    }

    public getInstanceDirectory(): string {
        if (!this.config.instanceIdentifier) {
            // This should not happen if callers await ensureInstanceIdentifier
            const instanceConfig = this.loadInstanceConfig();
            if (instanceConfig.instanceIdentifier) {
                this.config.instanceIdentifier = instanceConfig.instanceIdentifier;
            } else {
                throw new Error('Instance identifier not available. Please wait for initialization.');
            }
        }
        return path.join(this.config.directory, this.config.instanceIdentifier);
    }

    private getFilePath(filename: string): string {
        return path.join(this.getInstanceDirectory(), filename);
    }

    private safeName(name: string): string {
        return name.replace(/[\/\\:]/g, '_').replace(/\s+/g, ' ').trim();
    }

    private normalizeContent(content: string): string {
        return content.replace(/\r\n/g, '\n').trim();
    }

    private markAsSelfWritten(filePath: string, content: string) {
        this.selfWrittenCache.set(filePath, this.normalizeContent(content));
    }

    private isSelfWritten(filePath: string, currentContent: string): boolean {
        if (!this.selfWrittenCache.has(filePath)) return false;
        const cached = this.selfWrittenCache.get(filePath);
        const current = this.normalizeContent(currentContent);
        return cached === current;
    }

    async loadRemoteState() {
        this.emit('log', '🔄 [SyncManager] Loading remote state...');
        const remoteWorkflows = await this.client.getAllWorkflows();

        // Populate map
        for (const wf of remoteWorkflows) {
            if (this.shouldIgnore(wf)) continue;
            const filename = `${this.safeName(wf.name)}.json`;
            this.fileToIdMap.set(filename, wf.id);
            console.log(`[DEBUG] Mapped: "${filename}" -> "${wf.id}"`);
        }
        
        console.log(`[DEBUG] Total workflows loaded: ${remoteWorkflows.length}`);
        console.log(`[DEBUG] Total mappings created: ${this.fileToIdMap.size}`);
    }

    /**
     * Retrieves the status of all workflows (local and remote)
     */
    async getWorkflowsStatus(): Promise<IWorkflowStatus[]> {
        await this.ensureInstanceIdentifier();
        await this.loadRemoteState();
        const statuses: IWorkflowStatus[] = [];

        // 1. Check all Remote Workflows (and compare with local)
        // Optimization: We could reuse the list from loadRemoteState if we refactor, but for now we fetch again or cache? 
        // loadRemoteState fetches ALL, so let's rely on fileToIdMap if populated, but we need the ACTIVE status etc.
        // Let's just fetch light payload.
        const remoteWorkflows = await this.client.getAllWorkflows();

        const validRemoteIds = new Set<string>();

        for (const wf of remoteWorkflows) {
            if (this.shouldIgnore(wf)) continue;
            const filename = `${this.safeName(wf.name)}.json`;
            const filePath = this.getFilePath(filename);
            validRemoteIds.add(wf.id);

            let status = WorkflowSyncStatus.SYNCED;

            if (!fs.existsSync(filePath)) {
                status = WorkflowSyncStatus.MISSING_LOCAL;
            } else {
                // Compare content? To be perfectly accurate we need full JSON.
                // This is expensive for a list view. 
                // Strategy: Assume SYNCED unless we detect a file change (mtime > last sync?)
                // For now, let's just return SYNCED or check lightweight via size/hash if we implemented it.
                // Simple approach: Check if file exists. Deep comparison is too heavy for list.
                // EXCEPT: If we implement a quick hash check or just rely on events.
                status = WorkflowSyncStatus.SYNCED;
            }

            statuses.push({
                id: wf.id,
                name: wf.name,
                filename: filename,
                active: wf.active,
                status: status
            });
        }

        // 2. Check Local Files (for Orphans)
        const instanceDirectory = this.getInstanceDirectory();
        if (fs.existsSync(instanceDirectory)) {
            const localFiles = fs.readdirSync(instanceDirectory).filter(f => f.endsWith('.json'));
            for (const file of localFiles) {
                // If not mapped to a remote ID
                // BUT, fileToIdMap might map it.
                // We check if we already added it to statuses via the remote loop
                const alreadyListed = statuses.find(s => s.filename === file);

                if (!alreadyListed) {
                    // It's local but not in the filtered remote list
                    const filePath = this.getFilePath(file);
                    const content = this.readLocalFile(filePath);
                    const name = content?.name || path.parse(file).name;
                    // Only assume missing remote if we are sure we loaded all remotes.
                    // Since we loaded all remotes above, this is MISSING_REMOTE.
                    statuses.push({
                        id: '',
                        name: name,
                        filename: file,
                        active: false,
                        status: WorkflowSyncStatus.MISSING_REMOTE
                    });
                }
            }
        }

        return statuses.sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Scans n8n instance and updates local files (Downstream Sync)
     */
    async syncDown() {
        await this.ensureInstanceIdentifier();
        this.emit('log', '🔄 [SyncManager] Starting Downstream Sync...');
        const remoteWorkflows = await this.client.getAllWorkflows();

        // Sort: Active first to prioritize their naming
        remoteWorkflows.sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1));

        const processedFiles = new Set<string>();

        for (const wf of remoteWorkflows) {
            // Filter
            if (this.shouldIgnore(wf)) continue;

            const filename = `${this.safeName(wf.name)}.json`;

            // Collision check
            if (processedFiles.has(filename)) continue;
            processedFiles.add(filename);

            this.fileToIdMap.set(filename, wf.id);

            // Reuse the conflict-aware logic to prevent accidental overwrites on startup
            await this.pullWorkflowWithConflictResolution(filename, wf.id, wf.updatedAt || wf.createdAt);
        }
    }

    /**
     * Scans n8n instance and updates local files with conflict resolution
     */
    async syncDownWithConflictResolution() {
        await this.ensureInstanceIdentifier();
        const remoteWorkflows = await this.client.getAllWorkflows();

        // Sort: Active first to prioritize their naming
        remoteWorkflows.sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1));

        const processedFiles = new Set<string>();
        let updateCount = 0;
        let newCount = 0;

        for (const wf of remoteWorkflows) {
            // Filter
            if (this.shouldIgnore(wf)) continue;

            const filename = `${this.safeName(wf.name)}.json`;

            // Collision check
            if (processedFiles.has(filename)) continue;
            processedFiles.add(filename);

            this.fileToIdMap.set(filename, wf.id);

            // Use conflict-aware pull logic
            const result = await this.pullWorkflowWithConflictResolution(filename, wf.id, wf.updatedAt || wf.createdAt);
            if (result === 'updated') {
                updateCount++;
            } else if (result === 'new') {
                newCount++;
            }
        }

        if (updateCount > 0 || newCount > 0) {
            const summary = [];
            if (newCount > 0) summary.push(`${newCount} new`);
            if (updateCount > 0) summary.push(`${updateCount} updated`);
            this.emit('log', `📥 [SyncManager] Applied ${summary.join(', ')} workflow(s)`);
        }
    }

    /**
     * Pulls a single workflow by ID and writes to filename
     * @param force If true, overwrites local changes without checking for conflicts
     */
    async pullWorkflow(filename: string, id: string, force: boolean = false) {
        // Fetch full details
        const fullWf = await this.client.getWorkflow(id);
        if (!fullWf) return;

        const cleanRemote = WorkflowSanitizer.cleanForStorage(fullWf);
        const filePath = this.getFilePath(filename);

        if (!force && fs.existsSync(filePath)) {
            const localContent = this.readLocalFile(filePath);
            const localClean = WorkflowSanitizer.cleanForStorage(localContent);
            const isLocalSynced = this.stateManager?.isLocalSynced(id, localClean) ?? false;
            
            if (!isLocalSynced) {
                // Check if remote also changed (Real conflict) OR if we just want to protect local work
                // Here we protect local work regardless if remote changed, because "Pull" implies "Update from Remote"
                // but we shouldn't destroy local work.
                
                // Check if remote is different from local (otherwise no-op)
                if (!deepEqual(localClean, cleanRemote)) {
                     this.emit('conflict', {
                        id,
                        filename,
                        localContent: localClean,
                        remoteContent: cleanRemote
                    });
                    return;
                }
            }
        }

        // Write to disk
        await this.writeLocalFile(filePath, cleanRemote, filename, id);
    }

    /**
     * Pulls a single workflow with conflict resolution
     * @returns 'updated' if file was updated, 'skipped' if no change or conflict, 'new' if file was created
     */
    async pullWorkflowWithConflictResolution(filename: string, id: string, remoteUpdatedAt?: string): Promise<'updated' | 'skipped' | 'new'> {
        // Fetch full details
        const fullWf = await this.client.getWorkflow(id);
        if (!fullWf) return 'skipped';

        const cleanRemote = WorkflowSanitizer.cleanForStorage(fullWf);
        const filePath = this.getFilePath(filename);

        // Check if file exists locally
        if (fs.existsSync(filePath)) {
            const localContent = this.readLocalFile(filePath);
            const localClean = WorkflowSanitizer.cleanForStorage(localContent);

            // 1. Check if Remote is different from our last synced state
            const isRemoteSynced = this.stateManager?.isRemoteSynced(id, cleanRemote) ?? false;
            
            if (isRemoteSynced) {
                // Remote hasn't changed since we last saw it
                return 'skipped';
            }

            // 2. Remote HAS changed. Check if Local has ALSO changed.
            const isLocalSynced = this.stateManager?.isLocalSynced(id, localClean) ?? false;

            if (!isLocalSynced) {
                // BOTH CHANGED -> CONFLICT!
                this.emit('log', `⚠️ [Conflict] Workflow "${filename}" changed both locally and on n8n. Skipping auto-pull.`);
                this.emit('conflict', {
                    id,
                    filename,
                    localContent: localClean,
                    remoteContent: cleanRemote
                });
                return 'skipped';
            }

            // ONLY Remote changed -> Safe to pull
            this.emit('log', `📥 [n8n->Local] Updated: "${filename}" (Remote changes detected)`);
            await this.writeLocalFile(filePath, cleanRemote, filename, id);
            return 'updated';
        } else {
            // File doesn't exist locally - safe to pull
            this.emit('log', `📥 [n8n->Local] New: "${filename}"`);
            await this.writeLocalFile(filePath, cleanRemote, filename, id);
            return 'new';
        }
    }

    /**
     * Writes file to disk only if changed
     */
    private async writeLocalFile(filePath: string, contentObj: any, filename: string, id: string) {
        const contentStr = JSON.stringify(contentObj, null, 2);

        const doWrite = (isNew: boolean) => {
            // this.emit('log', isNew ? `📥 [n8n->Local] New: "${filename}"` : `📥 [n8n->Local] Updated: "${filename}"`);
            this.isWriting.add(filePath);
            this.markAsSelfWritten(filePath, contentStr);
            fs.writeFileSync(filePath, contentStr);
            
            // Update state tracking
            this.stateManager?.updateWorkflowState(id, contentObj);

            this.emit('change', { type: 'remote-to-local', filename, id });
            
            // Release the lock after a short delay to allow FS events to clear
            setTimeout(() => this.isWriting.delete(filePath), 1000);
        };

        if (!fs.existsSync(filePath)) {
            doWrite(true);
            return;
        }

        const localContent = fs.readFileSync(filePath, 'utf8');
        try {
            const localObj = JSON.parse(localContent);
            const cleanLocal = WorkflowSanitizer.cleanForStorage(localObj);

            if (!deepEqual(cleanLocal, contentObj)) {
                doWrite(false);
            }
        } catch (e) {
            // If file is corrupt, overwrite it
            doWrite(false);
        }
    }

    private shouldIgnore(wf: IWorkflow): boolean {
        if (!this.config.syncInactive && !wf.active) return true;
        if (wf.tags) {
            const hasIgnoredTag = wf.tags.some(t => this.config.ignoredTags.includes(t.name.toLowerCase()));
            if (hasIgnoredTag) return true;
        }
        return false;
    }

    /**
     * Uploads local files that don't exist remotely (Upstream Sync - Init)
     */
    async syncUpMissing() {
        await this.ensureInstanceIdentifier();
        this.emit('log', '🔄 [SyncManager] Checking for orphans...');
        const instanceDirectory = this.getInstanceDirectory();
        if (!fs.existsSync(instanceDirectory)) return;
        
        const localFiles = fs.readdirSync(instanceDirectory).filter(f => f.endsWith('.json'));

        for (const file of localFiles) {
            if (this.fileToIdMap.has(file)) continue;

            const filePath = this.getFilePath(file);
            await this.handleLocalFileChange(filePath);
        }
    }

    /**
     * Full Upstream Sync: Updates existing and Creates new.
     */
    async syncUp() {
        await this.ensureInstanceIdentifier();
        this.emit('log', '📤 [SyncManager] Starting Upstream Sync (Push)...');
        const instanceDirectory = this.getInstanceDirectory();
        if (!fs.existsSync(instanceDirectory)) return;
        
        const localFiles = fs.readdirSync(instanceDirectory).filter(f => f.endsWith('.json'));

        for (const file of localFiles) {
            const filePath = this.getFilePath(file);
            await this.handleLocalFileChange(filePath);
        }
    }

    /**
     * Handle FS watcher events
     */
    async handleLocalFileChange(filePath: string) {
        await this.ensureInstanceIdentifier();
        if (!filePath.endsWith('.json')) return;
        if (this.isWriting.has(filePath)) {
            this.emit('log', `[DEBUG] Ignoring FS event (SyncManager is writing): ${path.basename(filePath)}`);
            return;
        }

        // Ignore self-written files to avoid infinite loops
        const rawContent = this.readRawFile(filePath);
        if (!rawContent || this.isSelfWritten(filePath, rawContent)) {
            // this.emit('log', `[DEBUG] Ignoring FS event (Self-written): ${path.basename(filePath)}`);
            return;
        }

        const filename = path.basename(filePath);
        const nameFromFile = path.parse(filename).name;
        const id = this.fileToIdMap.get(filename);

        // Debug: Log mapping information
        this.emit('log', `[DEBUG] handleLocalFileChange: ${filename}`);
        this.emit('log', `[DEBUG] fileToIdMap has ${filename}: ${this.fileToIdMap.has(filename)}`);
        this.emit('log', `[DEBUG] Workflow ID: ${id}`);
        // this.emit('log', `[DEBUG] Current fileToIdMap entries: ${JSON.stringify(Array.from(this.fileToIdMap.entries()))}`);

        const json = JSON.parse(rawContent);
        const payload = WorkflowSanitizer.cleanForPush(json);

        try {
            if (id) {
                // UPDATE
                
                // 1. Fetch current remote state
                const remoteRaw = await this.client.getWorkflow(id);
                if (!remoteRaw) throw new Error('Remote workflow not found');
                
                const remoteClean = WorkflowSanitizer.cleanForStorage(remoteRaw);
                const localClean = WorkflowSanitizer.cleanForStorage(json);

                // 2. Check if Remote is different from our last synced state
                const isRemoteSynced = this.stateManager?.isRemoteSynced(id, remoteClean) ?? false;

                if (!isRemoteSynced) {
                    // CONFLICT! Remote has changed since we last synced.
                    this.emit('log', `⚠️ [Conflict] Remote workflow "${filename}" has been modified on n8n. Push aborted to prevent overwriting.`);
                    this.emit('conflict', {
                        id,
                        filename,
                        localContent: localClean,
                        remoteContent: remoteClean
                    });
                    return;
                }

                // 3. Optimization: Don't push if local matches remote
                if (deepEqual(remoteClean, localClean)) {
                    // No change needed
                    return;
                }

                if (!payload.name) payload.name = nameFromFile;

                this.emit('log', `📤 [Local->n8n] Update: "${filename}" (ID: ${id})`);
                const updatedWf = await this.client.updateWorkflow(id, payload);
                
                if (updatedWf && updatedWf.id) {
                    this.emit('log', `✅ Update OK (ID: ${updatedWf.id})`);
                    // Update last known synced state
                    this.stateManager?.updateWorkflowState(id, localClean);
                } else {
                    this.emit('log', `⚠️  Update returned unexpected response (No ID)`);
                }
                this.emit('change', { type: 'local-to-remote', filename, id });

            } else {
                // CREATE (New file added manually)
                const safePayloadName = this.safeName(payload.name || '');
                if (safePayloadName !== nameFromFile) {
                    this.emit('log', `⚠️  Name mismatch on creation. Using filename: "${nameFromFile}"`);
                    payload.name = nameFromFile;
                } else {
                    payload.name = payload.name || nameFromFile;
                }

                this.emit('log', `✨ [Local->n8n] Create: "${filename}"`);
                const newWf = await this.client.createWorkflow(payload);
                this.emit('log', `✅ Created (ID: ${newWf.id})`);
                this.fileToIdMap.set(filename, newWf.id);
                this.emit('change', { type: 'local-to-remote', filename, id: newWf.id });
            }
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
            this.emit('log', `❌ Sync Up Failed for "${filename}": ${errorMsg}`);
            this.emit('error', `Sync Up Error: ${errorMsg}`);
            
            console.error('Detailed sync error:', {
                filename,
                id,
                status: error.response?.status,
                data: error.response?.data,
                message: error.message,
                stack: error.stack
            });
        }
    }

    private readLocalFile(filePath: string): any {
        try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
    }

    private readRawFile(filePath: string): string | null {
        try { return fs.readFileSync(filePath, 'utf8'); } catch { return null; }
    }

    async startWatch() {
        if (this.watcher || this.pollInterval) return;

        this.emit('log', `🚀 [SyncManager] Starting Watcher (Poll: ${this.config.pollIntervalMs}ms)`);

        // 1. Ensure instance identifier is set (centralized in core)
        await this.ensureInstanceIdentifier();
        const instanceDirectory = this.getInstanceDirectory();
        
        if (!fs.existsSync(instanceDirectory)) {
            fs.mkdirSync(instanceDirectory, { recursive: true });
        }

        // Debug: Show which directory is being watched
        this.emit('log', `👁️  Watching directory: ${instanceDirectory}`);
        
        // List existing workflow files in the directory
        if (fs.existsSync(instanceDirectory)) {
            const files = fs.readdirSync(instanceDirectory).filter(f => f.endsWith('.json'));
            if (files.length > 0) {
                this.emit('log', `📁 Found ${files.length} workflow file(s): ${files.join(', ')}`);
            }
        }

        // 2. Initial Sync
        try {
            await this.syncDown();
            await this.syncUp();
        } catch (e: any) {
            this.emit('error', `Initial sync failed: ${e.message}`);
        }

        // 3. Local FS Watcher - watch instance-specific directory
        this.watcher = chokidar.watch(instanceDirectory, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
        });

        this.watcher
            .on('change', (p: string) => {
                console.log(`[DEBUG] File changed detected: ${p}`);
                this.handleLocalFileChange(p)
            })
            .on('add', (p: string) => {
                console.log(`[DEBUG] File added detected: ${p}`);
                this.handleLocalFileChange(p)
            });

        // 4. Remote Polling Loop with conflict resolution
        if (this.config.pollIntervalMs > 0) {
            this.pollInterval = setInterval(async () => {
                try {
                    await this.syncDownWithConflictResolution();
                } catch (e: any) {
                    this.emit('error', `Remote poll failed: ${e.message}`);
                }
            }, this.config.pollIntervalMs);
        }
    }

    stopWatch() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        this.emit('log', '🛑 [SyncManager] Watcher Stopped.');
    }
}

