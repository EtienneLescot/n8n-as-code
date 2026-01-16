import { SyncEngine } from './sync-engine.js';
import { Watcher } from './watcher.js';
import { WorkflowSyncStatus } from '../types.js';

export class ResolutionManager {
    private syncEngine: SyncEngine;
    private watcher: Watcher;

    constructor(syncEngine: SyncEngine, watcher: Watcher) {
        this.syncEngine = syncEngine;
        this.watcher = watcher;
    }

    /**
     * 6.1 Conflict Resolution - KEEP LOCAL
     */
    public async keepLocal(workflowId: string, filename: string) {
        // Force PUSH
        await this.syncEngine.push(filename, workflowId, WorkflowSyncStatus.MODIFIED_LOCALLY);
    }

    /**
     * 6.1 Conflict Resolution - KEEP REMOTE
     */
    public async keepRemote(workflowId: string, filename: string) {
        // Force PULL
        await this.syncEngine.pull(workflowId, filename, WorkflowSyncStatus.MODIFIED_REMOTELY);
    }

    /**
     * 6.2 Deletion Validation - CONFIRM DELETION (Local deletion -> Remote delete)
     */
    public async confirmRemoteDeletion(workflowId: string, filename: string, client: any) {
        // As per spec 5.3 PUSH Strategy DELETED_LOCALLY:
        // Step 1: Archive Remote (SyncEngine does this or we do it here)
        // Step 2: Delete from API

        // Let's assume the API client is passed or available
        await client.deleteWorkflow(workflowId);
        // Commit removal from state (or let Watcher handle it? Spec says Sync Engine requests State Manager to commit)
        // In a DELETE case, we remove from state.
    }

    /**
     * 6.2 Deletion Validation - RESTORE WORKFLOW
     */
    public async restoreWorkflow(workflowId: string, filename: string) {
        // Force PUSH to re-create on remote if deleted remotely
        // Or move from archive to workflows if deleted locally
    }
}
