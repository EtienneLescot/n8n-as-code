import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import deepEqual from 'deep-equal';
import * as chokidar from 'chokidar';
import { N8nApiClient } from './n8n-api-client.js';
import { WorkflowSanitizer } from './workflow-sanitizer.js';
import { createInstanceIdentifier, createFallbackInstanceIdentifier } from './directory-utils.js';
import { StateManager } from './state-manager.js';
import { TrashService } from './trash-service.js';
import { ISyncConfig, IWorkflow, WorkflowSyncStatus, IWorkflowStatus } from '../types.js';

interface IInstanceConfig {
    instanceIdentifier?: string;
    lastUsed?: string;
}

export class SyncManager extends EventEmitter {
    private client: N8nApiClient;
    private config: ISyncConfig;

    // Maps filename -> Workflow ID
    private fileToIdMap: Map<string, string> = new Map();
    // Maps filePath -> Content (to detect self-written changes)
    private selfWrittenCache: Map<string, string> = new Map();
    // Busy writing flag to avoid loops
    private isWriting = new Set<string>();
    // Pending deletions (IDs) to prevent immediate re‑download
    private pendingDeletions = new Set<string>();

    private watcher: chokidar.FSWatcher | null = null;
    private pollInterval: NodeJS.Timeout | null = null;
    private stateManager: StateManager | null = null;
    private trashService: TrashService | null = null;

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
        if (this.config.instanceConfigPath) {
            return this.config.instanceConfigPath;
        }
        return path.join(this.config.directory, 'n8n-as-code-instance.json');
    }

    /**
     * Load instance configuration from disk
     */
    private loadInstanceConfig(): IInstanceConfig {
        // Try explicit/configured path first
        let configPath = this.getInstanceConfigPath();

        // If not found at configured path, try legacy path (inside sync directory)
        if (!fs.existsSync(configPath) && this.config.instanceConfigPath) {
            const legacyPath = path.join(this.config.directory, 'n8n-as-code-instance.json');
            if (fs.existsSync(legacyPath)) {
                configPath = legacyPath;
            }
        }

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
            this.trashService = new TrashService(this.getInstanceDirectory());
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
        this.trashService = new TrashService(this.getInstanceDirectory());

        return newIdentifier;
    }

    private async initializeInstanceIdentifier(): Promise<string> {
        const host = this.client['client']?.defaults?.baseURL || 'unknown';

        try {
            // Try to get user information for friendly naming
            const user = await this.client.getCurrentUser();
            if (user) {
                // Use host from client configuration
                return createInstanceIdentifier(host, user);
            }
        } catch (error) {
            console.warn('Could not get user info for instance identifier:', error);
        }

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
        }
        console.log(`[DEBUG] loadRemoteState populated ${this.fileToIdMap.size} entries`);
    }

    /**
     * Retrieves the status of all workflows (local and remote)
     */
    async getWorkflowsStatus(): Promise<IWorkflowStatus[]> {
        await this.ensureInstanceIdentifier();
        await this.loadRemoteState();
        const statuses: IWorkflowStatus[] = [];

        // 1. Check all Remote Workflows (and compare with local)
        const remoteWorkflows = await this.client.getAllWorkflows();

        for (const wf of remoteWorkflows) {
            if (this.shouldIgnore(wf)) continue;
            const filename = `${this.safeName(wf.name)}.json`;
            const filePath = this.getFilePath(filename);

            let status = WorkflowSyncStatus.SYNCED;

            if (!fs.existsSync(filePath)) {
                status = WorkflowSyncStatus.MISSING_LOCAL;
            } else {
                // Check modifications using state tracking
                const localContent = this.readLocalFile(filePath);
                const localClean = WorkflowSanitizer.cleanForStorage(localContent);
                const remoteClean = WorkflowSanitizer.cleanForStorage(wf);

                const isLocalSynced = this.stateManager?.isLocalSynced(wf.id, localClean) ?? true;
                const isRemoteSynced = this.stateManager?.isRemoteSynced(wf.id, remoteClean) ?? true;

                if (isLocalSynced && isRemoteSynced) {
                    status = WorkflowSyncStatus.SYNCED;
                } else if (!isLocalSynced && !isRemoteSynced) {
                    status = WorkflowSyncStatus.CONFLICT;
                } else if (!isLocalSynced) {
                    status = WorkflowSyncStatus.LOCAL_MODIFIED;
                } else if (!isRemoteSynced) {
                    status = WorkflowSyncStatus.REMOTE_MODIFIED;
                }
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
            const localFiles = fs.readdirSync(instanceDirectory).filter(f => f.endsWith('.json') && !f.startsWith('.'));
            for (const file of localFiles) {
                const alreadyListed = statuses.find(s => s.filename === file);

                if (!alreadyListed) {
                    const filePath = this.getFilePath(file);
                    const content = this.readLocalFile(filePath);
                    const name = content?.name || path.parse(file).name;
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

    private formatSummary(counts: { new?: number, updated?: number, conflict?: number, upToDate?: number }): string {
        const summary = [];
        if (counts.new && counts.new > 0) summary.push(`${counts.new} new`);
        if (counts.updated && counts.updated > 0) summary.push(`${counts.updated} updated`);
        if (counts.conflict && counts.conflict > 0) summary.push(`${counts.conflict} conflicts`);
        if (counts.upToDate && counts.upToDate > 0) summary.push(`${counts.upToDate} up-to-date`);
        return summary.length > 0 ? summary.join(', ') : 'No changes';
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
        const counts = { updated: 0, new: 0, upToDate: 0, conflict: 0 };

        for (const wf of remoteWorkflows) {
            if (this.shouldIgnore(wf)) continue;

            const filename = `${this.safeName(wf.name)}.json`;

            if (processedFiles.has(filename)) continue;
            processedFiles.add(filename);

            this.fileToIdMap.set(filename, wf.id);

            const result = await this.pullWorkflowWithConflictResolution(filename, wf.id, wf.updatedAt || wf.createdAt);

            if (result === 'updated') counts.updated++;
            else if (result === 'new') counts.new++;
            else if (result === 'up-to-date') counts.upToDate++;
            else if (result === 'conflict') counts.conflict++;
        }

        // 3. Process remote deletions
        const deletionCounts = await this.processRemoteDeletions(remoteWorkflows);

        this.emit('log', `📥 [SyncManager] Sync complete: ${this.formatSummary(counts)}${deletionCounts > 0 ? `, ${deletionCounts} remote deleted` : ''}`);
    }

    /**
     * Identifies and handles workflows deleted on n8n but still present locally and tracked in state
     */
    private async processRemoteDeletions(remoteWorkflows: IWorkflow[]): Promise<number> {
        if (!this.stateManager || !this.trashService) return 0;

        const remoteIds = new Set(remoteWorkflows.map(wf => wf.id));
        const trackedIds = this.stateManager.getTrackedWorkflowIds();
        let deletedCount = 0;

        for (const id of trackedIds) {
            if (!remoteIds.has(id)) {
                // Workflow deleted remotely!
                const state = this.stateManager.getWorkflowState(id);
                if (!state) continue;

                // Find local file for this ID
                const filename = Array.from(this.fileToIdMap.entries())
                    .find(([_, fid]) => fid === id)?.[0];

                if (filename) {
                    const filePath = this.getFilePath(filename);
                    if (fs.existsSync(filePath)) {
                        this.emit('log', `🗑️ [Remote->Local] Remote workflow deleted: "${filename}". Moving local file to .archive`);
                        await this.trashService.archiveFile(filePath, filename);
                        this.stateManager.removeWorkflowState(id);
                        this.fileToIdMap.delete(filename);
                        this.emit('change', { type: 'remote-deletion', filename, id });
                        deletedCount++;
                    }
                } else {
                    // ID tracked but no file found? Just clean state
                    this.stateManager.removeWorkflowState(id);
                }
            }
        }
        return deletedCount;
    }

    /**
     * Scans n8n instance and updates local files with conflict resolution
     */
    async syncDownWithConflictResolution() {
        await this.ensureInstanceIdentifier();
        const remoteWorkflows = await this.client.getAllWorkflows();

        remoteWorkflows.sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1));

        const processedFiles = new Set<string>();
        const counts = { updated: 0, new: 0, upToDate: 0, conflict: 0 };

        for (const wf of remoteWorkflows) {
            if (this.shouldIgnore(wf)) continue;

            const filename = `${this.safeName(wf.name)}.json`;

            if (processedFiles.has(filename)) continue;
            processedFiles.add(filename);

            this.fileToIdMap.set(filename, wf.id);

            const result = await this.pullWorkflowWithConflictResolution(filename, wf.id, wf.updatedAt || wf.createdAt);
            if (result === 'updated') counts.updated++;
            else if (result === 'new') counts.new++;
            else if (result === 'up-to-date') counts.upToDate++;
            else if (result === 'conflict') counts.conflict++;
        }

        // 3. Process remote deletions
        await this.processRemoteDeletions(remoteWorkflows);

        if (counts.updated > 0 || counts.new > 0 || counts.conflict > 0) {
            this.emit('log', `📥 [SyncManager] Applied: ${this.formatSummary({ new: counts.new, updated: counts.updated, conflict: counts.conflict })}`);
        }
    }

    /**
     * Pulls a single workflow by ID and writes to filename
     * @param force If true, overwrites local changes without checking for conflicts
     */
    async pullWorkflow(filename: string, id: string, force: boolean = false) {
        const fullWf = await this.client.getWorkflow(id);
        if (!fullWf) return;

        const cleanRemote = WorkflowSanitizer.cleanForStorage(fullWf);
        const filePath = this.getFilePath(filename);

        if (!force && fs.existsSync(filePath)) {
            const localContent = this.readLocalFile(filePath);
            const localClean = WorkflowSanitizer.cleanForStorage(localContent);
            const isLocalSynced = this.stateManager?.isLocalSynced(id, localClean) ?? false;

            if (!isLocalSynced) {
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

        await this.writeLocalFile(filePath, cleanRemote, filename, id);
    }

    /**
     * Pulls a single workflow with conflict resolution
     * @returns 'updated' if file was updated, 'skipped' if no change or conflict, 'new' if file was created
     */
    async pullWorkflowWithConflictResolution(filename: string, id: string, remoteUpdatedAt?: string): Promise<'updated' | 'skipped' | 'new' | 'up-to-date' | 'conflict'> {
        // Skip if this workflow is pending deletion (user hasn't decided yet)
        if (this.pendingDeletions.has(id)) {
            console.log(`[DEBUG] Skipping pull for ${filename} because ID ${id} is pending deletion`);
            return 'skipped';
        }

        const fullWf = await this.client.getWorkflow(id);
        if (!fullWf) return 'skipped';

        const cleanRemote = WorkflowSanitizer.cleanForStorage(fullWf);
        const filePath = this.getFilePath(filename);

        if (fs.existsSync(filePath)) {
            const localContent = this.readLocalFile(filePath);
            const localClean = WorkflowSanitizer.cleanForStorage(localContent);

            const isRemoteSynced = this.stateManager?.isRemoteSynced(id, cleanRemote) ?? false;

            if (isRemoteSynced) {
                return 'up-to-date';
            }

            const isLocalSynced = this.stateManager?.isLocalSynced(id, localClean) ?? false;

            if (!isLocalSynced) {
                this.emit('log', `⚠️ [Conflict] Workflow "${filename}" changed both locally and on n8n. Skipping auto-pull.`);
                this.emit('conflict', {
                    id,
                    filename,
                    localContent: localClean,
                    remoteContent: cleanRemote
                });
                return 'conflict';
            }

            this.emit('log', `📥 [n8n->Local] Updated: "${filename}" (Remote changes detected)`);
            await this.writeLocalFile(filePath, cleanRemote, filename, id);
            return 'updated';
        } else {
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
            this.isWriting.add(filePath);
            this.markAsSelfWritten(filePath, contentStr);

            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(filePath, contentStr);
            this.stateManager?.updateWorkflowState(id, contentObj);
            this.emit('change', { type: 'remote-to-local', filename, id });

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

        const localFiles = fs.readdirSync(instanceDirectory).filter(f => f.endsWith('.json') && !f.startsWith('.'));

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

        const localFiles = fs.readdirSync(instanceDirectory).filter(f => f.endsWith('.json') && !f.startsWith('.'));
        const counts = { updated: 0, created: 0, upToDate: 0, conflict: 0 };

        for (const file of localFiles) {
            const filePath = this.getFilePath(file);
            const result = await this.handleLocalFileChange(filePath, true);
            if (result === 'updated') counts.updated++;
            else if (result === 'created') counts.created++;
            else if (result === 'up-to-date') counts.upToDate++;
            else if (result === 'conflict') counts.conflict++;
        }

        this.emit('log', `📤 [SyncManager] Push complete: ${this.formatSummary(counts)}`);
    }

    /**
     * Handles local file deletion (detected by watcher)
     */
    async handleLocalFileDeletion(filePath: string) {
        const filename = path.basename(filePath);
        if (!filename.endsWith('.json') || filename.startsWith('.n8n-state')) return;

        console.log(`[DEBUG] handleLocalFileDeletion called for ${filename}`);
        console.log(`[DEBUG] fileToIdMap entries: ${Array.from(this.fileToIdMap.entries()).map(([f, i]) => `${f}=${i}`).join(', ')}`);

        const id = this.fileToIdMap.get(filename);
        if (id) {
            this.pendingDeletions.add(id);
            this.emit('log', `🗑️ [Local->Remote] Local file deleted: "${filename}". (ID: ${id})`);
            this.emit('local-deletion', { id, filename, filePath });
        } else {
            console.log(`[DEBUG] No ID found for ${filename} in fileToIdMap`);
        }
    }

    /**
     * Actually deletes the remote workflow and cleans up local state
     */
    async deleteRemoteWorkflow(id: string, filename: string): Promise<boolean> {
        try {
            // First archive the remote version locally for safety
            const remoteWf = await this.client.getWorkflow(id);
            if (remoteWf && this.trashService) {
                await this.trashService.archiveWorkflow(remoteWf, filename);
            }

            const success = await this.client.deleteWorkflow(id);
            if (success) {
                this.stateManager?.removeWorkflowState(id);
                this.fileToIdMap.delete(filename);
                this.pendingDeletions.delete(id);
                this.emit('log', `✅ [n8n] Workflow ${id} deleted successfully.`);
                return true;
            }
            return false;
        } catch (error: any) {
            this.emit('log', `❌ Failed to delete remote workflow ${id}: ${error.message}`);
            return false;
        }
    }

    /**
     * Restore a deleted local file from remote
     */
    async restoreLocalFile(id: string, filename: string): Promise<boolean> {
        try {
            const remoteWf = await this.client.getWorkflow(id);
            if (!remoteWf) throw new Error('Remote workflow not found');

            const cleanRemote = WorkflowSanitizer.cleanForStorage(remoteWf);
            const filePath = this.getFilePath(filename);

            await this.writeLocalFile(filePath, cleanRemote, filename, id);
            this.pendingDeletions.delete(id);
            this.emit('log', `✅ [Local] Workflow "${filename}" restored from n8n.`);
            return true;
        } catch (error: any) {
            this.emit('log', `❌ Failed to restore local file ${filename}: ${error.message}`);
            return false;
        }
    }

    /**
     * Handle FS watcher events
     */
    async handleLocalFileChange(filePath: string, silent: boolean = false): Promise<'updated' | 'created' | 'up-to-date' | 'conflict' | 'skipped'> {
        await this.ensureInstanceIdentifier();
        const filename = path.basename(filePath);
        if (!filename.endsWith('.json') || filename.startsWith('.n8n-state')) return 'skipped';

        if (this.isWriting.has(filePath)) {
            return 'skipped';
        }

        const rawContent = this.readRawFile(filePath);
        if (!rawContent) {
            return 'skipped';
        }

        if (this.isSelfWritten(filePath, rawContent)) {
            return 'skipped';
        }

        const id = this.fileToIdMap.get(filename);
        const nameFromFile = path.parse(filename).name;

        let json;
        try {
            json = JSON.parse(rawContent);
        } catch (e) {
            return 'skipped'; // Invalid JSON
        }
        const payload = WorkflowSanitizer.cleanForPush(json);

        if (this.config.syncMode === 'manual') {
            this.emit('change', { type: 'local-modification', filename, id });
            return 'skipped';
        }

        try {
            if (id) {
                const remoteRaw = await this.client.getWorkflow(id);
                if (!remoteRaw) throw new Error('Remote workflow not found');

                const remoteClean = WorkflowSanitizer.cleanForStorage(remoteRaw);
                const localClean = WorkflowSanitizer.cleanForStorage(json);

                const workflowState = this.stateManager?.getWorkflowState(id);

                if (workflowState) {
                    const isRemoteSynced = this.stateManager?.isRemoteSynced(id, remoteClean);
                    if (!isRemoteSynced) {
                        this.emit('log', `⚠️ [Conflict] Remote workflow "${filename}" has been modified on n8n. Push aborted to prevent overwriting.`);
                        this.emit('conflict', { id, filename, localContent: localClean, remoteContent: remoteClean });
                        return 'conflict';
                    }
                }

                if (deepEqual(remoteClean, localClean)) {
                    return 'up-to-date';
                }

                if (!payload.name) payload.name = nameFromFile;

                this.emit('log', `📤 [Local->n8n] Update: "${filename}" (ID: ${id})`);
                const updatedWf = await this.client.updateWorkflow(id, payload);

                if (updatedWf && updatedWf.id) {
                    this.emit('log', `✅ Update OK (ID: ${updatedWf.id})`);
                    this.stateManager?.updateWorkflowState(id, localClean);
                    this.emit('change', { type: 'local-to-remote', filename, id });
                    return 'updated';
                } else {
                    return 'skipped';
                }

            } else {
                const safePayloadName = this.safeName(payload.name || '');
                if (safePayloadName !== nameFromFile) {
                    if (!silent) this.emit('log', `⚠️  Name mismatch on creation. Using filename: "${nameFromFile}"`);
                    payload.name = nameFromFile;
                } else {
                    payload.name = payload.name || nameFromFile;
                }

                this.emit('log', `✨ [Local->n8n] Create: "${filename}"`);
                const newWf = await this.client.createWorkflow(payload);
                this.emit('log', `✅ Created (ID: ${newWf.id})`);
                this.fileToIdMap.set(filename, newWf.id);
                this.emit('change', { type: 'local-to-remote', filename, id: newWf.id });
                return 'created';
            }
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
            this.emit('log', `❌ Sync Up Failed for "${filename}": ${errorMsg}`);
            this.emit('error', `Sync Up Error: ${errorMsg}`);
            return 'skipped';
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
        await this.ensureInstanceIdentifier();
        const instanceDirectory = this.getInstanceDirectory();

        if (!fs.existsSync(instanceDirectory)) {
            fs.mkdirSync(instanceDirectory, { recursive: true });
        }

        const isAuto = this.config.syncMode !== 'manual';

        if (isAuto) {
            await this.syncDown();
            await this.syncUp();
        } else {
            await this.loadRemoteState();
        }

        console.log(`[DEBUG] startWatch: fileToIdMap size = ${this.fileToIdMap.size}`);
        console.log(`[DEBUG] entries: ${Array.from(this.fileToIdMap.entries()).map(([f, i]) => `${f}=${i}`).join(', ')}`);

        this.watcher = chokidar.watch(instanceDirectory, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
        });

        this.watcher
            .on('change', (p: string) => this.handleLocalFileChange(p))
            .on('add', (p: string) => this.handleLocalFileChange(p))
            .on('unlink', (p: string) => this.handleLocalFileDeletion(p));

        if (isAuto && this.config.pollIntervalMs > 0) {
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

    /**
     * Get list of workflows that are tracked but missing locally
     */
    async getLocalDeletions(): Promise<{ id: string, filename: string }[]> {
        if (!this.stateManager) return [];

        // Ensure map is populated from remote
        await this.loadRemoteState();

        const trackedIds = this.stateManager.getTrackedWorkflowIds();
        const deletions: { id: string, filename: string }[] = [];

        for (const id of trackedIds) {
            const filename = Array.from(this.fileToIdMap.entries())
                .find(([_, fid]) => fid === id)?.[0];

            if (filename) {
                const filePath = this.getFilePath(filename);
                if (!fs.existsSync(filePath)) {
                    deletions.push({ id, filename });
                }
            }
        }
        return deletions;
    }
}
