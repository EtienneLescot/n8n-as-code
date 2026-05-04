import fs from 'fs';
import path from 'path';
import { SyncEngine } from './sync-engine.js';
import { WorkflowStateTracker } from './workflow-state-tracker.js';
import { WorkflowTransformerAdapter } from './workflow-transformer-adapter.js';
import { WorkflowSyncStatus } from '../types.js';

/**
 * Resolution & Validation Manager
 * 
 * Responsibilities:
 * 1. Conflict Resolution (6.1 from spec)
 * 2. Deletion Validation (6.2 from spec)
 * 
 * Bridges user intent with Sync Engine operations
 */
export class ResolutionManager {
    private watcher: WorkflowStateTracker;
    private directory: string;

    constructor(syncEngine: SyncEngine, watcher: WorkflowStateTracker) {
        this.watcher = watcher;
        // Get directory from sync engine (private access)
        this.directory = (syncEngine as any).directory;
    }

    /**
     * Get current status for a workflow
     */
    public async getSingleWorkflowDetailedStatus(workflowId: string, filename: string): Promise<{
        status: WorkflowSyncStatus;
        localExists: boolean;
        remoteExists: boolean;
        lastSyncedHash?: string;
        localHash?: string;
        remoteHash?: string;
    }> {
        // Recompute local hash from disk — do NOT use the in-memory cache which may be
        // stale in VSCode mode (change events are suppressed by the file system watcher).
        const filePath = path.join(this.directory, filename);
        let localHash: string | undefined;
        if (fs.existsSync(filePath)) {
            try {
                const tsContent = fs.readFileSync(filePath, 'utf-8');
                localHash = await WorkflowTransformerAdapter.hashWorkflow(tsContent);
                // Keep cache in sync so calculateStatus() sees the fresh value
                (this.watcher as any).localHashes?.set(filename, localHash);
            } catch {
                // unparseable file — treat as no local hash
            }
        }

        const status = this.watcher.calculateStatus(filename, workflowId);
        const lastSyncedHash = this.watcher.getLastSyncedHash(workflowId);

        // Get remote hash from watcher cache
        const remoteHash = (this.watcher as any).remoteHashes?.get(workflowId);

        return {
            status,
            localExists: !!localHash || fs.existsSync(path.join(this.directory, filename)),
            remoteExists: !!remoteHash || (this.watcher as any).remoteIds?.has(workflowId),
            lastSyncedHash,
            localHash,
            remoteHash
        };
    }
}
