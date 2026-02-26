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
            
            // In the git-like architecture, local changes are never auto-pushed.
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
     * Lightweight list of workflows with basic status (local only, remote only, both).
     * Does NOT compute hashes, compile TypeScript, or determine detailed status.
     * This is the primary data source for the VSCode tree view and the CLI `list` command.
     * 
     * Optionally refreshes remote state from the API before listing (default: false
     * to keep it fast). Pass `{ fetchRemote: true }` to force a fresh remote fetch.
     */
    async listWorkflows(options?: { fetchRemote?: boolean }): Promise<IWorkflowStatus[]> {
        await this.ensureInitialized();
        if (options?.fetchRemote) {
            await this.watcher!.refreshRemoteState();
        }
        return await this.watcher!.getLightweightList();
    }

    /**
    * Get detailed status for a single workflow (computes hash and three-way comparison).
     * Used by pull command to check for local modifications before overwriting.
     */
    async getSingleWorkflowDetailedStatus(workflowId: string, filename: string): Promise<{
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
        return await this.resolutionManager.getSingleWorkflowDetailedStatus(workflowId, filename);
    }

    async startWatch() {
        await this.ensureInitialized();
        await this.watcher!.start();
        
        // Create instance config file to mark workspace as initialized
        this.ensureInstanceConfigFile();
        
        this.emit('log', 'Watcher started.');
    }

    /**
     * Refresh the remote state for all workflows from the API.
     * This populates the internal cache so that `listWorkflows()` can return up-to-date status.
     * Emits status change events only when status actually changes.
     */
    async refreshRemoteState(): Promise<void> {
        await this.ensureInitialized();
        await this.watcher!.refreshRemoteState();
    }

    /**
     * Create or update the n8nac-instance.json file.
     * This file marks the workspace as initialized and stores the instance identifier.
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

    public getInstanceDirectory(): string {
        if (!this.watcher) {
            throw new Error('SyncManager not initialized');
        }
        return this.watcher.getDirectory();
    }

    /**
     * Fetch remote state for a specific workflow (update internal cache for comparison).
     * This is the manual fetch command that updates the remote state cache without pulling.
     * Returns true if the workflow exists on remote, false if not found.
     */
    public async fetch(workflowId: string): Promise<boolean> {
        await this.ensureInitialized();

        try {
            const remoteWf = await this.client.getWorkflow(workflowId);
            if (!remoteWf) {
                this.emit('log', `[SyncManager] Workflow ${workflowId} not found on remote.`);
                return false;
            }

            // Update the watcher's remote state cache for this workflow
            await this.watcher!.updateSingleRemoteState(remoteWf);
            
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
    public async pull(workflowId: string): Promise<void> {
        await this.ensureInitialized();
        const filename = this.watcher!.getFilenameForId(workflowId);
        if (!filename) {
            throw new Error(`Workflow ${workflowId} not found in local state. Try 'fetch' first if it only exists remotely.`);
        }
        // User-triggered pull always force-pulls (overwrites local regardless of status)
        await this.syncEngine!.forcePull(workflowId, filename);
    }

    /**
     * Explicit single-workflow push (user-triggered).
     * Runs OCC check — throws OccConflictError if remote was modified since last sync.
     */
    public async push(workflowId: string, filename?: string): Promise<void> {
        await this.ensureInitialized();
        const targetFilename = filename || this.watcher!.getFilenameForId(workflowId);
        if (!targetFilename) {
            throw new Error(`Workflow ${workflowId} not found locally`);
        }
        await this.syncEngine!.push(targetFilename, workflowId, WorkflowSyncStatus.MODIFIED_LOCALLY);
    }

    public async resolveConflict(workflowId: string, filename: string, resolution: 'local' | 'remote'): Promise<void> {
        await this.ensureInitialized();
        if (resolution === 'local') {
            await this.syncEngine!.forcePush(workflowId, filename);
        } else {
            await this.syncEngine!.forcePull(workflowId, filename);
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

    public stopWatch() {
        if (this.watcher) {
            this.watcher.stop();
        }
    }
}
