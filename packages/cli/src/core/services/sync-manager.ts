import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import { N8nApiClient } from './n8n-api-client.js';
import { StateManager } from './state-manager.js';
import { WorkflowStateTracker } from './workflow-state-tracker.js';
import { SyncEngine } from './sync-engine.js';
import { ResolutionManager } from './resolution-manager.js';
import { ISyncConfig, IWorkflow, WorkflowSyncStatus, IWorkflowStatus } from '../types.js';
import { createProjectSlug } from './directory-utils.js';
import { WorkspaceSetupService } from './workspace-setup-service.js';

export class SyncManager extends EventEmitter {
    private client: N8nApiClient;
    private config: ISyncConfig;
    private stateManager: StateManager | null = null;
    private watcher: WorkflowStateTracker | null = null;
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
        this.watcher = new WorkflowStateTracker(this.client, {
            directory: instanceDir,
            syncInactive: true,
            ignoredTags: [],
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
        // Always scan local files so that idToFileMap is rebuilt from the @workflow({ id })
        // decorator in each file. This correctly handles renames (the new filename is found
        // via its ID) without relying on a persisted filename in .n8n-state.json.
        await this.watcher!.refreshLocalState();
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
     * Create or update the n8nac-config.json file.
     * This stores the instance identifier for the workspace.
     */
    private ensureInstanceConfigFile() {
        if (!this.config.instanceConfigPath || !this.config.instanceIdentifier) {
            return;
        }

        let existing: any = {};
        try {
            if (fs.existsSync(this.config.instanceConfigPath)) {
                const content = fs.readFileSync(this.config.instanceConfigPath, 'utf-8');
                existing = JSON.parse(content);
            }
        } catch (error) {
            // Ignore parse errors and recreate
        }

        const configData = {
            ...existing,
            instanceIdentifier: existing.instanceIdentifier || this.config.instanceIdentifier,
            // Preserve existing syncFolder if present; otherwise store current directory (relative to cwd)
            syncFolder: existing.syncFolder || (path.isAbsolute(this.config.directory) 
                ? path.relative(process.cwd(), this.config.directory) 
                : this.config.directory)
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

    public getInstanceDirectory(): string {
        if (!this.watcher) {
            throw new Error('SyncManager not initialized');
        }
        return this.watcher.getDirectory();
    }

    public getFilenameForId(id: string): string | undefined {
        if (!this.watcher) return undefined;
        return this.watcher.getFilenameForId(id);
    }

    /** Expose the underlying API client (used by CliApi to call testWorkflow). */
    public getApiClient(): N8nApiClient {
        return this.client;
    }

    /**
     * Populate the local hashes cache by scanning the local directory.
     * Must be called before getSingleWorkflowDetailedStatus() in CLI mode
     * (the watcher only scans automatically when start() is called).
     */
    public async refreshLocalState(): Promise<void> {
        await this.ensureInitialized();
        await this.watcher!.refreshLocalState();
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

    public getWorkflowIdForFilename(filename: string): string | undefined {
        return this.watcher?.getWorkflowIdForFilename(filename);
    }

    /**
     * Explicit single-workflow push (user-triggered).
     *
     * Handles three scenarios automatically:
     *  1. Brand-new local file (no ID yet)  → CREATE on remote (POST)
     *  2. EXIST_ONLY_LOCALLY with an ID     → CREATE on remote (POST) — e.g. remote was deleted
     *  3. Known on both sides               → UPDATE on remote (PUT, with OCC check)
     *
     * @param filename - Filename inside the active sync scope
     */
    public async push(filename: string): Promise<string> {
        await this.ensureInitialized();

        const target = this.resolvePushTarget(filename);
        const targetFilename = target.filename;
        const filePath = target.filePath;

        if (!fs.existsSync(filePath)) {
            throw new Error(
                `Cannot push workflow "${targetFilename}": local file not found in the active sync scope. ` +
                `Run 'n8nac list' to verify the workflow exists locally.`
            );
        }

        // Rebuild file<->id mappings from the current local files before resolving
        // the workflow ID so first-run pushes and post-rename pushes do not create
        // duplicate remote workflows from stale watcher state.
        await this.watcher!.refreshLocalState();

        const effectiveId = this.watcher!.getWorkflowIdForFilename(targetFilename);

        if (!effectiveId) {
            // Case 1: brand-new workflow (no ID mapping yet) — let SyncEngine create it
            return await this.syncEngine!.push(targetFilename, undefined, undefined);
        }

        // Case 2 & 3: workflow has an ID locally
        // Ensure we know if it exists on remote (git-like sync starts with empty cache)
        if (!this.watcher!.isRemoteKnown(effectiveId)) {
            await this.fetch(effectiveId);
        }

        if (!this.watcher!.isRemoteKnown(effectiveId)) {
            // Truly doesn't exist on remote → create
            return await this.syncEngine!.push(targetFilename, effectiveId, WorkflowSyncStatus.EXIST_ONLY_LOCALLY);
        }

        // Known on both sides → update (with OCC check)
        return await this.syncEngine!.push(targetFilename, effectiveId, WorkflowSyncStatus.TRACKED);
    }

    public resolvePushTarget(filename: string): { filename: string; filePath: string; absolutePath: string; } {
        if (!this.watcher) {
            throw new Error('SyncManager not initialized');
        }

        const trimmed = filename.trim();
        if (!trimmed) {
            throw new Error('Missing workflow file path. Use `n8nac push <relative/path/to/workflow.workflow.ts>`.');
        }

        const syncScopeDir = path.resolve(this.watcher.getDirectory());
        const hasPathSeparator = trimmed.includes('/') || trimmed.includes('\\');
        if (!path.isAbsolute(trimmed) && !hasPathSeparator) {
            const scopeRelativeToCwd = path.relative(process.cwd(), syncScopeDir);
            const suggestedPath = scopeRelativeToCwd === '' ? `./${trimmed}` : path.join(scopeRelativeToCwd, trimmed);
            throw new Error(
                `Cannot push "${trimmed}": use the full relative path to the workflow file, not a bare filename.\n` +
                `Example: n8nac push ${this.quoteShellArg(suggestedPath)}`
            );
        }

        // Always resolve relative paths from cwd — never silently prefix the sync scope dir.
        // This forces callers to provide the full relative path, eliminating any ambiguity
        // between a bare filename and a file that happens to exist at the workspace root.
        const candidatePath = path.isAbsolute(trimmed)
            ? trimmed
            : path.resolve(process.cwd(), trimmed);

        const absolutePath = path.resolve(candidatePath);
        const normalizedScopeDir = this.resolveExistingPath(syncScopeDir);
        const normalizedAbsolutePath = this.resolveExistingPath(absolutePath);
        const relativePath = path.relative(normalizedScopeDir, normalizedAbsolutePath);

        if (
            relativePath === '..' ||
            relativePath.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relativePath)
        ) {
            const scopeRelativeToCwd = path.relative(process.cwd(), normalizedScopeDir);
            const basename = path.basename(trimmed);
            const scopeLabel = scopeRelativeToCwd === '' ? './' : `${scopeRelativeToCwd}${path.sep}`;
            const suggestedPath = scopeRelativeToCwd === '' ? `./${basename}` : path.join(scopeRelativeToCwd, basename);
            throw new Error(
                `Cannot push "${trimmed}": path is not within the active sync scope.\n` +
                `Active sync scope : ${scopeLabel}\n` +
                `Expected path form: ${suggestedPath}\n` +
                `Run               : n8nac push ${this.quoteShellArg(suggestedPath)}\n\n` +
                `Tip: read \`workflowDir\` from the active instance in \`n8nac-config.json\` to ` +
                `get the exact relative path where workflow files must be created and pushed from.`
            );
        }

        return {
            filename: path.basename(normalizedAbsolutePath),
            filePath: path.join(syncScopeDir, path.basename(normalizedAbsolutePath)),
            absolutePath: normalizedAbsolutePath
        };
    }

    private resolveExistingPath(targetPath: string): string {
        try {
            return fs.realpathSync.native(targetPath);
        } catch {
            return path.resolve(targetPath);
        }
    }

    private quoteShellArg(value: string): string {
        return `'${value.replace(/'/g, `'\\''`)}'`;
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
}
