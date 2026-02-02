import fs from 'fs';
import path from 'path';
import { SyncEngine } from './sync-engine.js';
import { Watcher } from './watcher.js';
import { WorkflowSanitizer } from './workflow-sanitizer.js';
import { HashUtils } from './hash-utils.js';
import { WorkflowSyncStatus } from '../types.js';
import { N8nApiClient } from './n8n-api-client.js';

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
    private syncEngine: SyncEngine;
    private watcher: Watcher;
    private client: N8nApiClient;
    private directory: string;

    constructor(syncEngine: SyncEngine, watcher: Watcher, client: N8nApiClient) {
        this.syncEngine = syncEngine;
        this.watcher = watcher;
        this.client = client;
        // Get directory from sync engine (private access)
        this.directory = (syncEngine as any).directory;
    }

    /**
     * 6.1 Conflict Resolution - KEEP LOCAL
     *
     * Action: Force PUSH (Overwrite Remote with Local)
     * Commit: Update lastSyncedHash = LocalHash. Status becomes IN_SYNC.
     */
    public async keepLocal(workflowId: string, filename: string): Promise<string> {
        const finalWorkflowId = await this.syncEngine.forcePush(workflowId, filename);
        // Note: forcePush already calls watcher.finalizeSync
        return finalWorkflowId;
    }

    /**
     * 6.1 Conflict Resolution - KEEP REMOTE
     * 
     * Action: Force PULL (Overwrite Local with Remote)
     * Commit: Update lastSyncedHash = RemoteHash. Status becomes IN_SYNC.
     */
    public async keepRemote(workflowId: string, filename: string): Promise<void> {
        await this.syncEngine.forcePull(workflowId, filename);
        // Note: forcePull already calls watcher.finalizeSync
    }

    /**
     * 6.1 Conflict Resolution - SHOW DIFF
     * 
     * Opens diff editor (implementation depends on UI layer)
     * Returns diff data for UI to display
     */
    public async showDiff(workflowId: string, filename: string): Promise<{
        localContent: any;
        remoteContent: any;
        localHash: string;
        remoteHash: string;
    }> {
        // Get local content
        const filePath = path.join(this.directory, filename);
        const localContent = this.readJsonFile(filePath);
        
        // Get remote content
        const remoteContent = await this.client.getWorkflow(workflowId);
        
        if (!localContent || !remoteContent) {
            throw new Error('Cannot show diff: missing local or remote content');
        }

        // Clean for display
        const cleanLocal = WorkflowSanitizer.cleanForStorage(localContent);
        const cleanRemote = WorkflowSanitizer.cleanForStorage(remoteContent);

        // Compute hashes (must match Watcher semantics)
        const localHash = HashUtils.computeHash(WorkflowSanitizer.cleanForHash(localContent));
        const remoteHash = HashUtils.computeHash(WorkflowSanitizer.cleanForHash(remoteContent));

        return {
            localContent: cleanLocal,
            remoteContent: cleanRemote,
            localHash,
            remoteHash
        };
    }

    /**
     * 6.2 Deletion Validation - CONFIRM DELETION
     *
     * Case Deleted Locally: Send DELETE to API -> Remove from state
     * Case Deleted Remotely: Move local file to .trash/ -> Remove from state
     */
    public async confirmDeletion(
        workflowId: string,
        filename: string,
        deletionType: 'local' | 'remote'
    ): Promise<void> {
        if (deletionType === 'local') {
            // Local file was deleted, confirm remote deletion
            await this.syncEngine.deleteRemote(workflowId, filename);
            // Remove from state
            await this.watcher.removeWorkflowState(workflowId);
        } else {
            // Remote workflow was deleted, confirm local archiving
            await this.syncEngine.archive(filename);
            // Remove from state
            await this.watcher.removeWorkflowState(workflowId);
        }
    }

    /**
     * 6.2 Deletion Validation - RESTORE WORKFLOW
     *
     * Case Deleted Locally: Move file from .trash/ to workflows/
     * Case Deleted Remotely: Force PUSH (Re-create on Remote)
     */
    public async restoreWorkflow(
        workflowId: string,
        filename: string,
        deletionType: 'local' | 'remote'
    ): Promise<string> {
        if (deletionType === 'local') {
            // Restore from archive
            const restored = await this.syncEngine.restoreFromArchive(filename);
            if (!restored) {
                throw new Error(`Cannot restore ${filename}: not found in archive`);
            }
            // Watcher will detect file addition and update status
            return workflowId;
        } else {
            // Re-create on remote (force push)
            const finalWorkflowId = await this.syncEngine.forcePush(workflowId, filename);
            return finalWorkflowId;
        }
    }

    /**
     * Get current status for a workflow
     */
    public async getWorkflowStatus(workflowId: string, filename: string): Promise<{
        status: WorkflowSyncStatus;
        localExists: boolean;
        remoteExists: boolean;
        lastSyncedHash?: string;
        localHash?: string;
        remoteHash?: string;
    }> {
        const status = this.watcher.calculateStatus(filename, workflowId);
        const lastSyncedHash = this.watcher.getLastSyncedHash(workflowId);
        
        // Get local hash
        const filePath = path.join(this.directory, filename);
        const localContent = this.readJsonFile(filePath);
        const localHash = localContent ? 
            HashUtils.computeHash(WorkflowSanitizer.cleanForHash(localContent)) : 
            undefined;

        // Get remote hash from watcher cache
        const remoteHash = (this.watcher as any).remoteHashes?.get(workflowId);

        return {
            status,
            localExists: !!localContent,
            remoteExists: !!remoteHash,
            lastSyncedHash,
            localHash,
            remoteHash
        };
    }

    private readJsonFile(filePath: string): any {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {
            return null;
        }
    }
}