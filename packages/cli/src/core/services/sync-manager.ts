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
            
            // Emit specific events for conflicts
            if (data.status === WorkflowSyncStatus.CONFLICT && data.workflowId) {
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
            
            // In the new Git-like architecture, local changes are never auto-pushed.
            // The user must explicitly trigger a Push.
        });

        this.watcher.on('error', (err) => {
            this.emit('error', err);
        });

        this.watcher.on('connection-lost', (err) => {
            this.emit('connection-lost', err);
        });
    }

    /**
     * Lightweight list of workflows with basic status (local only, remote only, both)
     * Does NOT compute hashes, compile TypeScript, or determine detailed status (MODIFIED_LOCALLY, CONFLICT)
     */
    async getWorkflowsLightweight(): Promise<IWorkflowStatus[]> {
        await this.ensureInitialized();
        return await this.watcher!.getLightweightList();
    }

    /**
     * Get status for a single workflow (computes hash and detailed status for this workflow only)
     * Used by pull command to check for local modifications before overwriting
     */
    async getWorkflowStatus(workflowId: string, filename: string): Promise<{
        status: WorkflowSyncStatus;
        localExists: boolean;
        remoteExists: boolean;
        lastSyncedHash?: string;
        localHash?: string;
        remoteHash?: string;
    }> {
        await this.ensureInitialized();
        if (!this.resolutionManager) {
            throw new Error('Resolution manager not initialized');
        }
        return await this.resolutionManager.getWorkflowStatus(workflowId, filename);
    }
    
    /**
     * Get full workflows with organization metadata for display purposes.
     * This returns the actual workflow objects with projectId, isArchived, tags, etc.
     */
    async getWorkflowsWithMetadata(): Promise<IWorkflow[]> {
        await this.ensureInitialized();
        return this.watcher!.getAllWorkflows();
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
     * Fetch remote state for a specific workflow (update internal cache for comparison).
     * This is the manual fetch command that just updates the remote state cache
     * without attempting to pull. Returns true if the workflow exists on remote
     * and cache was updated, false if workflow doesn't exist on remote.
     */
    public async fetch(workflowId: string): Promise<boolean> {
        if (!this.watcher) return false;

        try {
            // Fetch the latest remote state for this specific workflow
            const remoteWf = await this.client.getWorkflow(workflowId);
            if (!remoteWf) {
                this.emit('log', `[SyncManager] Workflow ${workflowId} not found on remote.`);
                return false;
            }

            // Update the watcher's remote state cache for this workflow
            await this.watcher.updateSingleRemoteState(remoteWf);
            
            this.emit('log', `[SyncManager] Fetched remote state for workflow ${workflowId}.`);
            return true;
        } catch (error) {
            this.emit('error', new Error(`Failed to fetch workflow ${workflowId}: ${error}`));
            return false;
        }
    }

    /**
     * Explicit single-workflow pull (user-triggered).
     * Always overwrites local with the latest remote version, regardless of status.
     */
    public async pullOne(workflowId: string): Promise<void> {
        await this.ensureInitialized();
        const filename = this.watcher!.getFilenameForId(workflowId);
        if (!filename) {
            throw new Error(`Workflow ${workflowId} not found in local state`);
        }
        // User-triggered pull always force-pulls (overwrites local regardless of status)
        await this.syncEngine!.forcePull(workflowId, filename);
    }

    /**
     * Explicit single-workflow push (user-triggered).
     * Runs OCC check — throws OccConflictError if remote was modified since last sync.
     */
    public async pushOne(workflowId: string, filename: string): Promise<void> {
        await this.ensureInitialized();
        await this.syncEngine!.push(filename, workflowId, WorkflowSyncStatus.MODIFIED_LOCALLY);
    }

    public async resolveConflict(workflowId: string, filename: string, resolution: 'local' | 'remote'): Promise<void> {
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
