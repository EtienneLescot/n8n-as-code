import fs from 'fs';
import path from 'path';
import { N8nApiClient } from './n8n-api-client.js';
import { WorkflowSanitizer } from './workflow-sanitizer.js';
import { HashUtils } from './hash-utils.js';
import { Watcher } from './watcher.js';
import { WorkflowSyncStatus, IWorkflow } from '../types.js';

/**
 * Sync Engine - State Mutation Component
 * 
 * Responsibilities:
 * 1. Execute PULL/PUSH operations based on status
 * 2. Follow strategy tables from SPECS/REFACTO_CORE.md
 * 3. Call Watcher.finalizeSync after successful operations
 * 4. Handle archive operations
 * 
 * Stateless regarding history - never writes to state file directly
 */
export class SyncEngine {
    private client: N8nApiClient;
    private watcher: Watcher;
    private directory: string;
    private archiveDirectory: string;

    constructor(
        client: N8nApiClient,
        watcher: Watcher,
        directory: string
    ) {
        this.client = client;
        this.watcher = watcher;
        this.directory = directory;
        this.archiveDirectory = path.join(directory, '.archive');

        if (!fs.existsSync(this.archiveDirectory)) {
            fs.mkdirSync(this.archiveDirectory, { recursive: true });
        }
    }

    /**
     * PULL Strategy: Remote -> Local
     * Based on spec 5.2 PULL Strategy table
     */
    public async pull(workflowId: string, filename: string, status: WorkflowSyncStatus): Promise<void> {
        // Mark sync in progress to prevent race conditions
        this.watcher.markSyncInProgress(workflowId);
        this.watcher.pauseObservation(workflowId);
        
        try {
            switch (status) {
                case WorkflowSyncStatus.EXIST_ONLY_REMOTELY:
                    // Download Remote JSON -> Write to disk
                    await this.executePull(workflowId, filename);
                    // Initialize lastSyncedHash via finalizeSync
                    await this.watcher.finalizeSync(workflowId);
                    break;

                case WorkflowSyncStatus.MODIFIED_REMOTELY:
                    // Download Remote JSON -> Overwrite local file
                    await this.executePull(workflowId, filename);
                    // Update lastSyncedHash via finalizeSync
                    await this.watcher.finalizeSync(workflowId);
                    break;

                case WorkflowSyncStatus.DELETED_REMOTELY:
                    // Move local file to archive
                    await this.archive(filename);
                    // Remove from state (handled by watcher after observation resumes)
                    // Watcher will detect file deletion and update status
                    break;

                case WorkflowSyncStatus.CONFLICT:
                    // Halt - trigger conflict resolution
                    throw new Error(`Conflict detected for workflow ${workflowId}. Use resolveConflict instead.`);

                case WorkflowSyncStatus.DELETED_LOCALLY:
                    // No action per spec
                    break;

                case WorkflowSyncStatus.EXIST_ONLY_LOCALLY:
                case WorkflowSyncStatus.IN_SYNC:
                case WorkflowSyncStatus.MODIFIED_LOCALLY:
                    // No action per spec
                    break;

                default:
                    console.warn(`[SyncEngine] Unhandled status ${status} for PULL operation`);
                    break;
            }
        } finally {
            this.watcher.markSyncComplete(workflowId);
            this.watcher.resumeObservation(workflowId);
        }
    }

    /**
     * PUSH Strategy: Local -> Remote
     * Based on spec 5.3 PUSH Strategy table
     */
    public async push(filename: string, workflowId?: string, status?: WorkflowSyncStatus): Promise<string> {
        if (workflowId) {
            this.watcher.markSyncInProgress(workflowId);
            this.watcher.pauseObservation(workflowId);
        }

        try {
            // If no workflowId, treat as EXIST_ONLY_LOCALLY
            if (!workflowId || status === WorkflowSyncStatus.EXIST_ONLY_LOCALLY) {
                // POST to API (Create)
                const newWorkflowId = await this.executeCreate(filename);
                // Initialize lastSyncedHash via finalizeSync
                await this.watcher.finalizeSync(newWorkflowId);
                return newWorkflowId;
            }

            // With workflowId and status
            switch (status) {
                case WorkflowSyncStatus.MODIFIED_LOCALLY:
                    // PUT to API (Update)
                    await this.executeUpdate(workflowId, filename);
                    // Update lastSyncedHash via finalizeSync
                    await this.watcher.finalizeSync(workflowId);
                    return workflowId;

                case WorkflowSyncStatus.DELETED_LOCALLY:
                    // Step 1: Archive Remote to _archive/
                    await this.archive(filename);
                    // Step 2: Trigger Deletion Validation (caller should handle)
                    // Note: Actual API deletion happens in ResolutionManager
                    throw new Error(`Local deletion detected for workflow ${workflowId}. Use confirmDeletion instead.`);

                case WorkflowSyncStatus.CONFLICT:
                    // Halt - trigger conflict resolution
                    throw new Error(`Conflict detected for workflow ${workflowId}. Use resolveConflict instead.`);

                case WorkflowSyncStatus.EXIST_ONLY_REMOTELY:
                case WorkflowSyncStatus.IN_SYNC:
                case WorkflowSyncStatus.MODIFIED_REMOTELY:
                case WorkflowSyncStatus.DELETED_REMOTELY:
                    // No action per spec
                    return workflowId;

                default:
                    console.warn(`[SyncEngine] Unhandled status ${status} for PUSH operation`);
                    return workflowId;
            }
        } finally {
            if (workflowId) {
                this.watcher.markSyncComplete(workflowId);
                this.watcher.resumeObservation(workflowId);
            }
        }
    }

    /**
     * Force PULL - overwrite local with remote (for conflict resolution)
     */
    public async forcePull(workflowId: string, filename: string): Promise<void> {
        this.watcher.markSyncInProgress(workflowId);
        this.watcher.pauseObservation(workflowId);
        
        try {
            await this.executePull(workflowId, filename);
            await this.watcher.finalizeSync(workflowId);
        } finally {
            this.watcher.markSyncComplete(workflowId);
            this.watcher.resumeObservation(workflowId);
        }
    }

    /**
     * Force PUSH - overwrite remote with local (for conflict resolution and restoration)
     * If workflow doesn't exist on remote, creates it
     */
    public async forcePush(workflowId: string, filename: string): Promise<string> {
        this.watcher.markSyncInProgress(workflowId);
        this.watcher.pauseObservation(workflowId);
        
        let finalWorkflowId = workflowId;
        
        try {
            // Try to update first
            try {
                await this.executeUpdate(workflowId, filename);
            } catch (error: any) {
                // If update fails with 404, create the workflow instead
                if (error.response?.status === 404 || error.message?.includes('404') || error.message?.includes('Not Found')) {
                    console.log(`[SyncEngine] Workflow ${workflowId} not found, creating new workflow`);
                    const newWorkflowId = await this.executeCreate(filename);
                    
                    // Migrate state from old ID to new ID
                    if (newWorkflowId !== workflowId) {
                        await this.watcher.updateWorkflowId(workflowId, newWorkflowId);
                        finalWorkflowId = newWorkflowId;
                    }
                } else {
                    throw error;
                }
            }
            
            await this.watcher.finalizeSync(finalWorkflowId);
            return finalWorkflowId;
        } finally {
            this.watcher.markSyncComplete(finalWorkflowId);
            this.watcher.resumeObservation(finalWorkflowId);
        }
    }

    /**
     * Delete remote workflow (for deletion validation)
     * Note: The Watcher already archived the remote content when it detected the local deletion
     */
    public async deleteRemote(workflowId: string, filename: string): Promise<void> {
        this.watcher.markSyncInProgress(workflowId);
        this.watcher.pauseObservation(workflowId);
        
        try {
            // Delete from API
            await this.client.deleteWorkflow(workflowId);
            
            // Archive local file if it still exists (edge case - shouldn't happen for DELETED_LOCALLY)
            await this.archive(filename);
            
            // Note: State removal will be handled by caller (ResolutionManager)
        } finally {
            this.watcher.markSyncComplete(workflowId);
            this.watcher.resumeObservation(workflowId);
        }
    }

    /**
     * Restore from archive (for deletion validation)
     * Moves the file from archive back to workflows directory
     * Then DELETES the archive file (no need to keep it after restoration)
     */
    public async restoreFromArchive(filename: string): Promise<boolean> {
        const archiveFiles = fs.readdirSync(this.archiveDirectory);
        const matchingArchives = archiveFiles.filter(f => f.includes(filename));
        
        if (matchingArchives.length === 0) {
            return false;
        }

        // Get most recent archive
        const mostRecent = matchingArchives.sort().reverse()[0];
        const archivePath = path.join(this.archiveDirectory, mostRecent);
        const targetPath = path.join(this.directory, filename);

        // Read content from archive
        const content = fs.readFileSync(archivePath, 'utf-8');
        
        // Write to target location
        fs.writeFileSync(targetPath, content);
        
        // Delete the archive file (no need to keep it after restoration)
        fs.unlinkSync(archivePath);
        
        return true;
    }

    private async executePull(workflowId: string, filename: string): Promise<void> {
        const fullWf = await this.client.getWorkflow(workflowId);
        if (!fullWf) {
            // Workflow might have been deleted (DELETED_REMOTELY case)
            // Check if local file exists - if so, archive it
            const filePath = path.join(this.directory, filename);
            if (fs.existsSync(filePath)) {
                await this.archive(filename);
                // Don't throw - archiving is the expected behavior for DELETED_REMOTELY
                return;
            }
            throw new Error(`Remote workflow ${workflowId} not found during pull`);
        }

        const clean = WorkflowSanitizer.cleanForStorage(fullWf);
        const filePath = path.join(this.directory, filename);
        fs.writeFileSync(filePath, JSON.stringify(clean, null, 2));

        // Update Watcher's remote hash cache since we just fetched the workflow
        // This ensures finalizeSync has the remote hash
        const hash = HashUtils.computeHash(clean);
        this.watcher.setRemoteHash(workflowId, hash);
    }

    private async executeUpdate(workflowId: string, filename: string): Promise<void> {
        const filePath = path.join(this.directory, filename);
        const localWf = this.readJsonFile(filePath);
        if (!localWf) {
            throw new Error('Local file not found during push');
        }

        const payload = WorkflowSanitizer.cleanForPush(localWf);
        const updatedWf = await this.client.updateWorkflow(workflowId, payload);

        if (!updatedWf) {
            throw new Error('Failed to update remote workflow');
        }

        // CRITICAL: Write the API response back to local file to ensure consistency
        // This ensures local and remote have identical content after push
        const clean = WorkflowSanitizer.cleanForStorage(updatedWf);
        fs.writeFileSync(filePath, JSON.stringify(clean, null, 2));

        // Update Watcher's remote hash cache with the updated workflow
        const hash = HashUtils.computeHash(clean);
        this.watcher.setRemoteHash(workflowId, hash);
    }

    private async executeCreate(filename: string): Promise<string> {
        const filePath = path.join(this.directory, filename);
        const localWf = this.readJsonFile(filePath);
        if (!localWf) {
            throw new Error('Local file not found during creation');
        }

        const payload = WorkflowSanitizer.cleanForPush(localWf);
        if (!payload.name) {
            payload.name = path.parse(filename).name;
        }

        const newWf = await this.client.createWorkflow(payload);
        if (!newWf || !newWf.id) {
            throw new Error('Failed to create remote workflow');
        }

        // Update local file with new ID
        localWf.id = newWf.id;
        fs.writeFileSync(filePath, JSON.stringify(localWf, null, 2));

        return newWf.id;
    }

    public async archive(filename: string): Promise<void> {
        const filePath = path.join(this.directory, filename);
        if (fs.existsSync(filePath)) {
            const archivePath = path.join(this.archiveDirectory, `${Date.now()}_${filename}`);
            fs.renameSync(filePath, archivePath);
        }
    }

    private readJsonFile(filePath: string): any {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {
            return null;
        }
    }
}