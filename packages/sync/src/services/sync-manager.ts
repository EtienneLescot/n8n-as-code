import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import { N8nApiClient } from './n8n-api-client.js';
import { StateManager } from './state-manager.js';
import { Watcher } from './watcher.js';
import { SyncEngine } from './sync-engine.js';
import { ResolutionManager } from './resolution-manager.js';
import { ISyncConfig, IWorkflow, WorkflowSyncStatus, IWorkflowStatus } from '../types.js';
import { createProjectSlug } from './directory-utils.js';
import { WorkspaceSetupService } from './workspace-setup-service.js';

export class SyncManager extends EventEmitter {
    private client: N8nApiClient;
    private config: ISyncConfig;
    private stateManager: StateManager | null = null;
    private watcher: Watcher | null = null;
    private syncEngine: SyncEngine | null = null;
    private resolutionManager: ResolutionManager | null = null;

    constructor(client: N8nApiClient, config: ISyncConfig) {
        super();
        this.client = client;
        this.config = config;

        if (!fs.existsSync(this.config.directory)) {
            fs.mkdirSync(this.config.directory, { recursive: true });
        }
    }

    private async ensureInitialized() {
        if (this.watcher) return;

        // Build project-scoped directory: baseDir/instanceId/projectSlug
        const projectSlug = createProjectSlug(this.config.projectName);
        const instanceDir = path.join(
            this.config.directory, 
            this.config.instanceIdentifier || 'default',
            projectSlug
        );
        
        if (!fs.existsSync(instanceDir)) {
            fs.mkdirSync(instanceDir, { recursive: true });
        }

        // Write TypeScript support files (.d.ts + tsconfig.json) so .workflow.ts
        // files have no red errors without requiring a local npm install.
        try {
            WorkspaceSetupService.ensureWorkspaceFiles(instanceDir);
        } catch (err: any) {
            console.warn('[SyncManager] Could not write workspace TypeScript stubs:', err.message);
        }

        this.stateManager = new StateManager(instanceDir);
        this.watcher = new Watcher(this.client, {
            directory: instanceDir,
            syncInactive: this.config.syncInactive,
            ignoredTags: this.config.ignoredTags,
            projectId: this.config.projectId
        });

        this.syncEngine = new SyncEngine(this.client, this.watcher, instanceDir);
        this.resolutionManager = new ResolutionManager(this.syncEngine, this.watcher, this.client);

        this.watcher.on('statusChange', (data) => {
            console.log(`[SyncManager] 📨 Received statusChange event:`, data);
            this.emit('change', data);
            
            // Emit specific events for deletions and conflicts
            if (data.status === WorkflowSyncStatus.DELETED_LOCALLY && data.workflowId) {
                this.emit('local-deletion', {
                    id: data.workflowId,
                    filename: data.filename
                });
            } else if (data.status === WorkflowSyncStatus.CONFLICT && data.workflowId) {
                // Fetch remote content for conflict notification
                this.client.getWorkflow(data.workflowId).then(remoteContent => {
                    this.emit('conflict', {
                        id: data.workflowId!,
                        filename: data.filename,
                        remoteContent
                    });
                }).catch(err => {
                    console.error(`[SyncManager] Failed to fetch remote content for conflict: ${err.message}`);
                });
            }
            
            // Auto-sync in auto mode
            if (this.config.syncMode === 'auto') {
                console.log(`[SyncManager] Auto mode enabled, calling handleAutoSync...`);
                this.handleAutoSync(data).catch(err => {
                    console.error('[SyncManager] Auto-sync error:', err);
                    this.emit('error', `Auto-sync failed: ${err.message}`);
                });
            } else {
                console.log(`[SyncManager] Manual mode, skipping auto-sync`);
            }
        });

        this.watcher.on('error', (err) => {
            this.emit('error', err);
        });

        this.watcher.on('connection-lost', (err) => {
            this.emit('connection-lost', err);
        });
    }

    async getWorkflowsStatus(): Promise<IWorkflowStatus[]> {
        await this.ensureInitialized();
        // Return status from watcher
        return await this.watcher!.getStatusMatrix();
    }
    
    /**
     * Get full workflows with organization metadata for display purposes.
     * This returns the actual workflow objects with projectId, isArchived, tags, etc.
     */
    async getWorkflowsWithMetadata(): Promise<IWorkflow[]> {
        await this.ensureInitialized();
        return this.watcher!.getAllWorkflows();
    }

    async syncDown() {
        await this.ensureInitialized();
        const statuses = await this.getWorkflowsStatus();
        for (const s of statuses) {
            if (s.status === WorkflowSyncStatus.EXIST_ONLY_REMOTELY ||
                s.status === WorkflowSyncStatus.MODIFIED_REMOTELY) {
                await this.syncEngine!.pull(s.id, s.filename, s.status);
            }
            // DELETED_REMOTELY requires user confirmation via confirmDeletion()
            // Per spec 5.2: "Halt. Trigger Deletion Validation."
        }
    }

    async syncUp() {
        await this.ensureInitialized();
        const statuses = await this.getWorkflowsStatus();
        for (const s of statuses) {
            if (s.status === WorkflowSyncStatus.EXIST_ONLY_LOCALLY || s.status === WorkflowSyncStatus.MODIFIED_LOCALLY) {
                await this.syncEngine!.push(s.filename, s.id, s.status);
            } else if (s.status === WorkflowSyncStatus.DELETED_LOCALLY) {
                // Per spec: Halt and trigger deletion validation
                throw new Error(`Local deletion detected for workflow "${s.filename}". Use confirmDeletion() to proceed with remote deletion or restoreWorkflow() to restore the file.`);
            }
        }
    }

    async startWatch() {
        await this.ensureInitialized();
        await this.watcher!.start();
        
        // Create instance config file to mark workspace as initialized
        this.ensureInstanceConfigFile();
        
        this.emit('log', 'Watcher started.');
    }

    /**
     * Create or update the n8nac-instance.json file
     * This file marks the workspace as initialized and stores the instance identifier
     */
    private ensureInstanceConfigFile() {
        if (!this.config.instanceConfigPath || !this.config.instanceIdentifier) {
            return;
        }

        const configData = {
            instanceIdentifier: this.config.instanceIdentifier,
            directory: this.config.directory,
            lastSync: new Date().toISOString()
        };

        try {
            fs.writeFileSync(
                this.config.instanceConfigPath,
                JSON.stringify(configData, null, 2),
                'utf-8'
            );
        } catch (error) {
            console.warn(`[SyncManager] Failed to write instance config file: ${error}`);
        }
    }

    /**
     * Handle automatic synchronization based on status changes
     * Only triggered in auto mode
     */
    private async handleAutoSync(data: { filename: string; workflowId?: string; status: WorkflowSyncStatus }) {
        const { filename, workflowId, status } = data;
        
        console.log(`[SyncManager] 🤖 handleAutoSync called for ${filename}, status: ${status}`);
        
        try {
            switch (status) {
                case WorkflowSyncStatus.MODIFIED_LOCALLY:
                case WorkflowSyncStatus.EXIST_ONLY_LOCALLY:
                    // Auto-push local changes
                    this.emit('log', `🔄 Auto-sync: Pushing "${filename}"...`);
                    console.log(`[SyncManager] Pushing ${filename}...`);
                    await this.syncEngine!.push(filename, workflowId, status);
                    this.emit('log', `✅ Auto-sync: Pushed "${filename}"`);
                    console.log(`[SyncManager] ✅ Push complete for ${filename}`);
                    // Emit event to notify that remote was updated (for webview reload)
                    if (workflowId) {
                        this.emit('remote-updated', { workflowId, filename });
                    }
                    break;
                    
                case WorkflowSyncStatus.MODIFIED_REMOTELY:
                case WorkflowSyncStatus.EXIST_ONLY_REMOTELY:
                    // Auto-pull remote changes
                    if (workflowId) {
                        this.emit('log', `🔄 Auto-sync: Pulling "${filename}"...`);
                        await this.syncEngine!.pull(workflowId, filename, status);
                        this.emit('log', `✅ Auto-sync: Pulled "${filename}"`);
                    }
                    break;
                    
                case WorkflowSyncStatus.CONFLICT:
                    // Conflicts require manual resolution
                    this.emit('log', `⚠️ Conflict detected for "${filename}". Manual resolution required.`);
                    // conflict event is handled in ensureInitialized above
                    break;
                    
                case WorkflowSyncStatus.DELETED_LOCALLY:
                case WorkflowSyncStatus.DELETED_REMOTELY:
                    // Deletions require manual confirmation
                    // Note: local-deletion event is already emitted by the Watcher
                    // We don't re-emit it here to avoid duplicates
                    this.emit('log', `🗑️ Deletion detected for "${filename}". Manual confirmation required.`);
                    break;
                    
                case WorkflowSyncStatus.IN_SYNC:
                    // Already in sync, nothing to do
                    break;
            }
        } catch (error: any) {
            this.emit('error', `Auto-sync failed for "${filename}": ${error.message}`);
        }
    }

    public async stop() {
        await this.watcher?.stop();
        this.emit('log', 'Watcher stopped.');
    }

    public async forceRefresh() {
        await this.watcher!.refreshRemoteState();
    }

    public getInstanceDirectory(): string {
        if (!this.watcher) {
            throw new Error('SyncManager not initialized');
        }
        return this.watcher.getDirectory();
    }

    /**
     * Fetches a specific workflow from the remote instance and pulls it locally
     * ONLY IF the local file has not been modified since the last sync.
     * This is used for the "Pull-on-Focus" feature to keep the local code in sync
     * with UI changes without overwriting local work.
     */
    public async fetchAndPullIfSafe(workflowId: string): Promise<boolean> {
        if (!this.watcher || !this.syncEngine) return false;

        try {
            // 1. Fetch the latest remote state for this specific workflow
            const remoteWf = await this.client.getWorkflow(workflowId);
            if (!remoteWf) {
                this.emit('log', `[SyncManager] Workflow ${workflowId} not found on remote.`);
                return false;
            }

            // 2. Update the watcher's remote state cache for this workflow
            // This is a targeted version of refreshRemoteState
            await this.watcher.updateSingleRemoteState(remoteWf);

            // 3. Get the current status matrix to check for conflicts
            const statuses = await this.watcher.getStatusMatrix();
            const status = statuses.find(s => s.id === workflowId);

            if (!status) return false;

            // 4. Decide whether to pull based on status
            if (status.status === WorkflowSyncStatus.MODIFIED_REMOTELY) {
                this.emit('log', `[SyncManager] Auto-pulling ${workflowId} (modified remotely, local is safe).`);
                await this.syncEngine.pull(workflowId, status.filename, status.status);
                return true;
            } else if (status.status === WorkflowSyncStatus.CONFLICT) {
                this.emit('log', `[SyncManager] Conflict detected for ${workflowId} on focus. Auto-pull aborted.`);
                // We don't pull, but we might want to emit an event so the UI can show a warning
                this.emit('conflict-detected', { workflowId, name: remoteWf.name });
                return false;
            }

            return false; // Was already in sync or other state
        } catch (error) {
            this.emit('error', new Error(`Failed to fetch and pull workflow ${workflowId}: ${error}`));
            return false;
        }
    }

    public async pullAll() {
        await this.ensureInitialized();
        const statuses = await this.getWorkflowsStatus();
        for (const s of statuses) {
            if (s.status === WorkflowSyncStatus.EXIST_ONLY_REMOTELY ||
                s.status === WorkflowSyncStatus.MODIFIED_REMOTELY) {
                await this.syncEngine!.pull(s.id, s.filename, s.status);
            }
        }
    }

    public async pushAll() {
        await this.ensureInitialized();
        const statuses = await this.getWorkflowsStatus();
        for (const s of statuses) {
            if (s.status === WorkflowSyncStatus.EXIST_ONLY_LOCALLY || s.status === WorkflowSyncStatus.MODIFIED_LOCALLY) {
                await this.syncEngine!.push(s.filename, s.id, s.status);
            }
        }
    }

    public async resolveConflict(workflowId: string, filename: string, resolution: 'local' | 'remote') {
        await this.ensureInitialized();
        if (resolution === 'local') {
            await this.syncEngine!.forcePush(workflowId, filename);
        } else {
            await this.syncEngine!.forcePull(workflowId, filename);
        }
    }

    async deleteRemoteWorkflows(ids: string[]): Promise<void> {
        await this.ensureInitialized();
        for (const id of ids) {
            try {
                const filename = this.watcher!.getFilenameForId(id);
                if (filename) {
                    await this.syncEngine!.deleteRemote(id, filename);
                    await this.watcher!.removeWorkflowState(id);
                }
            } catch (error: any) {
                this.emit('error', new Error(`Failed to delete remote workflow ${id}: ${error.message}`));
            }
        }
    }

    public async deleteRemoteWorkflow(workflowId: string, filename: string): Promise<boolean> {
        await this.ensureInitialized();
        try {
            await this.syncEngine!.deleteRemote(workflowId, filename);
            await this.watcher!.removeWorkflowState(workflowId);
            return true;
        } catch (error: any) {
            this.emit('error', new Error(`Failed to delete remote workflow ${workflowId}: ${error.message}`));
            return false;
        }
    }

    public async confirmDeletion(workflowId: string, filename: string): Promise<boolean> {
        return this.deleteRemoteWorkflow(workflowId, filename);
    }

    public async restoreRemoteWorkflow(workflowId: string, filename: string): Promise<boolean> {
        await this.ensureInitialized();
        try {
            await this.syncEngine!.forcePush(workflowId, filename);
            return true;
        } catch (error: any) {
            this.emit('error', new Error(`Failed to restore remote workflow ${workflowId}: ${error.message}`));
            return false;
        }
    }

    public async restoreLocalFile(workflowId: string, filename: string): Promise<boolean> {
        await this.ensureInitialized();
        try {
            return await this.syncEngine!.restoreFromArchive(filename);
        } catch (error: any) {
            this.emit('error', new Error(`Failed to restore local file ${filename}: ${error.message}`));
            return false;
        }
    }

    public async handleLocalFileChange(filePath: string): Promise<void> {
        await this.ensureInitialized();
        // The watcher handles local file changes automatically via chokidar
        // This method is kept for compatibility with the VS Code extension
        // which might want to explicitly trigger a check
    }

    public stopWatch() {
        if (this.watcher) {
            this.watcher.stop();
        }
    }
}
