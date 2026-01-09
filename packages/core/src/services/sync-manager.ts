import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import deepEqual from 'deep-equal';
import * as chokidar from 'chokidar';
import { N8nApiClient } from './n8n-api-client.js';
import { WorkflowSanitizer } from './workflow-sanitizer.js';
import { createInstanceIdentifier, createFallbackInstanceIdentifier } from './directory-utils.js';
import { ISyncConfig, IWorkflow, WorkflowSyncStatus, IWorkflowStatus } from '../types.js';

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

    private watcher: chokidar.FSWatcher | null = null;
    private pollInterval: NodeJS.Timeout | null = null;

    constructor(client: N8nApiClient, config: ISyncConfig) {
        super();
        this.client = client;
        this.config = config;

        // Create base directory if it doesn't exist
        if (!fs.existsSync(this.config.directory)) {
            fs.mkdirSync(this.config.directory, { recursive: true });
        }
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

    private getInstanceDirectory(): string {
        if (!this.config.instanceIdentifier) {
            throw new Error('Instance identifier not available');
        }
        return path.join(this.config.directory, this.config.instanceIdentifier);
    }

    private getFilePath(filename: string): string {
        return path.join(this.getInstanceDirectory(), filename);
    }

    private safeName(name: string): string {
        return name.replace(/[\/\\:]/g, '_').replace(/\s+/g, ' ').trim();
    }

    private markAsSelfWritten(filePath: string, content: string) {
        this.selfWrittenCache.set(filePath, content);
    }

    private isSelfWritten(filePath: string, currentContent: string): boolean {
        if (!this.selfWrittenCache.has(filePath)) return false;
        return this.selfWrittenCache.get(filePath) === currentContent;
    }

    async loadRemoteState() {
        this.emit('log', '🔄 [SyncManager] Loading remote state...');
        const remoteWorkflows = await this.client.getAllWorkflows();

        // Populate map
        for (const wf of remoteWorkflows) {
            if (this.shouldIgnore(wf)) continue;
            const filename = `${this.safeName(wf.name)}.json`;
            this.fileToIdMap.set(filename, wf.id);
        }
    }

    /**
     * Retrieves the status of all workflows (local and remote)
     */
    async getWorkflowsStatus(): Promise<IWorkflowStatus[]> {
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
        if (fs.existsSync(this.config.directory)) {
            const localFiles = fs.readdirSync(this.config.directory).filter(f => f.endsWith('.json'));
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

            // Reuse the single pull logic
            await this.pullWorkflow(filename, wf.id);
        }
    }

    /**
     * Scans n8n instance and updates local files with conflict resolution
     */
    async syncDownWithConflictResolution() {
        this.emit('log', '🔄 [SyncManager] Starting Downstream Sync with Conflict Resolution...');
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

            // Use conflict-aware pull logic
            await this.pullWorkflowWithConflictResolution(filename, wf.id, wf.updatedAt || wf.createdAt);
        }
    }

    /**
     * Pulls a single workflow by ID and writes to filename
     */
    async pullWorkflow(filename: string, id: string) {
        // Fetch full details
        const fullWf = await this.client.getWorkflow(id);
        if (!fullWf) return;

        const cleanRemote = WorkflowSanitizer.cleanForStorage(fullWf);
        const filePath = this.getFilePath(filename);

        // Write to disk
        await this.writeLocalFile(filePath, cleanRemote, filename, id);
    }

    /**
     * Pulls a single workflow with timestamp-based conflict resolution
     */
    async pullWorkflowWithConflictResolution(filename: string, id: string, remoteUpdatedAt?: string) {
        // Fetch full details
        const fullWf = await this.client.getWorkflow(id);
        if (!fullWf) return;

        const cleanRemote = WorkflowSanitizer.cleanForStorage(fullWf);
        const filePath = this.getFilePath(filename);

        // Check if file exists locally
        if (fs.existsSync(filePath)) {
            // Get local file timestamp (in UTC milliseconds)
            const localStats = fs.statSync(filePath);
            const localTimestamp = new Date(localStats.mtime).getTime();
            
            // Get remote timestamp (in UTC milliseconds)
            const remoteTimestampStr = remoteUpdatedAt || fullWf.updatedAt || fullWf.createdAt || '';
            const remoteTimestamp = remoteTimestampStr ? new Date(remoteTimestampStr).getTime() : 0;

            // Resolve conflict based on timestamps
            if (localTimestamp > remoteTimestamp) {
                // Local is newer - skip this pull to avoid overwriting local changes
                this.emit('log', `🔄 [Conflict] Local "${filename}" is newer than remote. Keeping local version.`);
                return;
            } else if (remoteTimestamp > localTimestamp) {
                // Remote is newer - proceed with pull
                this.emit('log', `📥 [n8n->Local] Updated (newer remote): "${filename}"`);
                await this.writeLocalFile(filePath, cleanRemote, filename, id);
            } else {
                // Timestamps are equal - proceed with pull (could be same content)
                await this.writeLocalFile(filePath, cleanRemote, filename, id);
            }
        } else {
            // File doesn't exist locally - safe to pull
            this.emit('log', `📥 [n8n->Local] New: "${filename}"`);
            await this.writeLocalFile(filePath, cleanRemote, filename, id);
        }
    }

    /**
     * Writes file to disk only if changed
     */
    private async writeLocalFile(filePath: string, contentObj: any, filename: string, id: string) {
        const contentStr = JSON.stringify(contentObj, null, 2);

        if (!fs.existsSync(filePath)) {
            this.emit('log', `📥 [n8n->Local] New: "${filename}"`);
            this.markAsSelfWritten(filePath, contentStr);
            fs.writeFileSync(filePath, contentStr);
            this.emit('change', { type: 'remote-to-local', filename, id });
            return;
        }

        const localContent = fs.readFileSync(filePath, 'utf8');
        const localObj = JSON.parse(localContent);
        // We clean the local obj just to be sure we compare apples to apples (though it should be clean)
        const cleanLocal = WorkflowSanitizer.cleanForStorage(localObj);

        if (!deepEqual(cleanLocal, contentObj)) {
            this.emit('log', `📥 [n8n->Local] Updated: "${filename}"`);
            this.markAsSelfWritten(filePath, contentStr);
            fs.writeFileSync(filePath, contentStr);
            this.emit('change', { type: 'remote-to-local', filename, id });
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
        this.emit('log', '🔄 [SyncManager] Checking for orphans...');
        const localFiles = fs.readdirSync(this.config.directory).filter(f => f.endsWith('.json'));

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
        this.emit('log', '📤 [SyncManager] Starting Upstream Sync (Push)...');
        const localFiles = fs.readdirSync(this.config.directory).filter(f => f.endsWith('.json'));

        for (const file of localFiles) {
            const filePath = this.getFilePath(file);
            await this.handleLocalFileChange(filePath);
        }
    }

    /**
     * Handle FS watcher events
     */
    async handleLocalFileChange(filePath: string) {
        if (!filePath.endsWith('.json')) return;

        // Ignore self-written files to avoid infinite loops
        const rawContent = this.readRawFile(filePath);
        if (!rawContent || this.isSelfWritten(filePath, rawContent)) return;

        const filename = path.basename(filePath);
        const nameFromFile = path.parse(filename).name;
        const id = this.fileToIdMap.get(filename);

        const json = JSON.parse(rawContent);
        const payload = WorkflowSanitizer.cleanForPush(json);

        try {
            if (id) {
                // UPDATE
                // Check if actually changed vs remote (Optimization)
                const remoteRaw = await this.client.getWorkflow(id);
                if (remoteRaw) {
                    const remoteClean = WorkflowSanitizer.cleanForStorage(remoteRaw);
                    const localClean = WorkflowSanitizer.cleanForStorage(json);
                    // We use deepEqual here, assuming it's imported or available
                    if (deepEqual(remoteClean, localClean)) return;
                }

                if (!payload.name) payload.name = nameFromFile;

                this.emit('log', `📤 [Local->n8n] Update: "${filename}"`);
                await this.client.updateWorkflow(id, payload);
                this.emit('log', `✅ Update OK`);
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
            this.emit('error', `❌ Sync Up Error: ${error.message}`);
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

        // 1. Initialize instance identifier if not provided
        if (!this.config.instanceIdentifier) {
            this.config.instanceIdentifier = await this.initializeInstanceIdentifier();
            const instanceDirectory = this.getInstanceDirectory();
            if (!fs.existsSync(instanceDirectory)) {
                fs.mkdirSync(instanceDirectory, { recursive: true });
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
        const instanceDirectory = this.getInstanceDirectory();
        this.watcher = chokidar.watch(instanceDirectory, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
        });

        this.watcher
            .on('change', (p: string) => this.handleLocalFileChange(p))
            .on('add', (p: string) => this.handleLocalFileChange(p));

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

