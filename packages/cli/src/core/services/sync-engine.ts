import fs from 'fs';
import path from 'path';
import { N8nApiClient } from './n8n-api-client.js';
import { WorkflowTransformerAdapter } from './workflow-transformer-adapter.js';
import { HashUtils } from './hash-utils.js';
import { Watcher } from './watcher.js';
import { WorkflowSyncStatus, IWorkflow } from '../types.js';

/**
 * Sync Engine - State Mutation Component
 * 
 * Responsibilities:
 * 1. Execute PULL/PUSH operations based on status
 * 2. Call Watcher.finalizeSync after successful operations
 * 3. Handle archive operations
 * 
 * Stateless regarding history - never writes to state file directly
 */
export class SyncEngine {
    private client: N8nApiClient;
    private watcher: Watcher;
    private directory: string;

    constructor(
        client: N8nApiClient,
        watcher: Watcher,
        directory: string
    ) {
        this.client = client;
        this.watcher = watcher;
        this.directory = directory;
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
                    const pullUpdatedAt1 = await this.executePull(workflowId, filename);
                    // Initialize lastSyncedHash via finalizeSync
                    await this.watcher.finalizeSync(workflowId, pullUpdatedAt1);
                    break;

                case WorkflowSyncStatus.CONFLICT:
                    // Halt - trigger conflict resolution
                    throw new Error(`Conflict detected for workflow ${workflowId}. Use resolveConflict instead.`);

                case WorkflowSyncStatus.EXIST_ONLY_LOCALLY:
                case WorkflowSyncStatus.TRACKED:
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
        // If workflow has an ID, pause observation by ID
        if (workflowId) {
            this.watcher.markSyncInProgress(workflowId);
            this.watcher.pauseObservation(workflowId);
        } else {
            // If no ID yet (new workflow), pause observation by filename
            this.watcher.pauseObservationByFilename(filename);
        }

        try {
            // If no workflowId, treat as EXIST_ONLY_LOCALLY
            if (!workflowId || status === WorkflowSyncStatus.EXIST_ONLY_LOCALLY) {
                // POST to API (Create)
                const { id: newWorkflowId, updatedAt } = await this.executeCreate(filename);
                // Initialize lastSyncedHash via finalizeSync
                await this.watcher.finalizeSync(newWorkflowId, updatedAt);
                return newWorkflowId;
            }

            // With workflowId and status
            switch (status) {
                case WorkflowSyncStatus.MODIFIED_LOCALLY:
                    // PUT to API (Update)
                    const updateUpdatedAt = await this.executeUpdate(workflowId, filename);
                    // Update lastSyncedHash via finalizeSync
                    await this.watcher.finalizeSync(workflowId, updateUpdatedAt);
                    return workflowId;

                case WorkflowSyncStatus.CONFLICT:
                    // Halt - trigger conflict resolution
                    throw new Error(`Conflict detected for workflow ${workflowId}. Use resolveConflict instead.`);

                case WorkflowSyncStatus.EXIST_ONLY_REMOTELY:
                case WorkflowSyncStatus.TRACKED:
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
            } else {
                // Resume observation by filename if no ID (new workflow case)
                this.watcher.resumeObservationByFilename(filename);
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
            const updatedAt = await this.executePull(workflowId, filename);
            await this.watcher.finalizeSync(workflowId, updatedAt);
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
        let finalUpdatedAt: string | undefined;
        
        try {
            // Try to update first, bypassing OCC (this is an explicit force operation)
            try {
                finalUpdatedAt = await this.executeUpdate(workflowId, filename, true);
            } catch (error: any) {
                // If update fails with 404, create the workflow instead
                if (error.response?.status === 404 || error.message?.includes('404') || error.message?.includes('Not Found')) {
                    console.log(`[SyncEngine] Workflow ${workflowId} not found, creating new workflow`);
                    const { id: newWorkflowId, updatedAt } = await this.executeCreate(filename);
                    finalUpdatedAt = updatedAt;
                    
                    // Migrate state from old ID to new ID
                    if (newWorkflowId !== workflowId) {
                        await this.watcher.updateWorkflowId(workflowId, newWorkflowId);
                        finalWorkflowId = newWorkflowId;
                    }
                } else {
                    throw error;
                }
            }
            
            await this.watcher.finalizeSync(finalWorkflowId, finalUpdatedAt);
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
            // Note: State removal will be handled by caller (ResolutionManager)
        } finally {
            this.watcher.markSyncComplete(workflowId);
            this.watcher.resumeObservation(workflowId);
        }
    }

    private async executePull(workflowId: string, filename: string): Promise<string | undefined> {
        const fullWf = await this.client.getWorkflow(workflowId);
        if (!fullWf) {
            // Workflow was deleted remotely — nothing to pull
            return;
        }

        // Convert to TypeScript
        const tsCode = await WorkflowTransformerAdapter.convertToTypeScript(fullWf, {
            format: true,
            commentStyle: 'verbose'
        });
        
        const filePath = path.join(this.directory, filename);
        fs.writeFileSync(filePath, tsCode, 'utf-8');

        // Update Watcher's remote hash cache since we just fetched the workflow
        // This ensures finalizeSync has the remote hash
        const hash = await WorkflowTransformerAdapter.hashWorkflow(tsCode);
        this.watcher.setRemoteHash(workflowId, hash);
        
        // Return the updatedAt timestamp so finalizeSync can store it
        return fullWf.updatedAt;
    }

    private async executeUpdate(workflowId: string, filename: string, skipOcc = false): Promise<string | undefined> {
        const filePath = path.join(this.directory, filename);
        const tsContent = this.readTypeScriptFile(filePath);
        if (!tsContent) {
            throw new Error('Local file not found during push');
        }

        // Optimistic Concurrency Control (OCC) — skipped for force operations
        if (!skipOcc) {
            const currentRemoteWf = await this.client.getWorkflow(workflowId);
            if (currentRemoteWf && currentRemoteWf.updatedAt) {
                const lastSyncedAt = this.watcher.getLastSyncedAt(workflowId);
                if (lastSyncedAt && new Date(currentRemoteWf.updatedAt) > new Date(lastSyncedAt)) {
                    throw new Error(
                        `Push rejected for "${filename}": The workflow was modified in the n8n UI ` +
                        `since your last sync. Please run 'pull' to merge the remote changes first.`
                    );
                }
            }
        }

        // Compile TypeScript to JSON for API
        const localWf = await WorkflowTransformerAdapter.compileToJson(tsContent);

        // Guard against empty compile result caused by parse errors (e.g. non-ASCII
        // characters like → in the class name cause ts-morph to silently drop the
        // class body, resulting in a 0-node workflow that would wipe the remote).
        if (!localWf.nodes || localWf.nodes.length === 0) {
            throw new Error(
                `Refusing to push "${filename}": the compiled workflow has 0 nodes. ` +
                `This usually means the TypeScript class name contains an invalid character ` +
                `(e.g. → U+2192 is not a valid identifier). ` +
                `Rename the class to a plain ASCII identifier and try again.`
            );
        }

        const updatedWf = await this.client.updateWorkflow(workflowId, localWf);

        if (!updatedWf) {
            throw new Error('Failed to update remote workflow');
        }

        // CRITICAL: Write the API response back to local file to ensure consistency
        // This ensures local and remote have identical content after push
        // Convert the updated workflow back to TypeScript
        const tsCode = await WorkflowTransformerAdapter.convertToTypeScript(updatedWf, {
            format: true,
            commentStyle: 'verbose'
        });
        fs.writeFileSync(filePath, tsCode, 'utf-8');

        // Update Watcher's remote hash cache with the updated workflow
        const hash = await WorkflowTransformerAdapter.hashWorkflow(tsCode);
        this.watcher.setRemoteHash(workflowId, hash);
        
        return updatedWf.updatedAt;
    }

    private async executeCreate(filename: string): Promise<{ id: string, updatedAt?: string }> {
        const filePath = path.join(this.directory, filename);
        const tsContent = this.readTypeScriptFile(filePath);
        if (!tsContent) {
            throw new Error('Local file not found during creation');
        }

        // Compile TypeScript to JSON for API
        const localWf = await WorkflowTransformerAdapter.compileToJson(tsContent);

        // Guard: refuse to create a workflow with 0 nodes (parse error protection)
        if (!localWf.nodes || localWf.nodes.length === 0) {
            throw new Error(
                `Refusing to create "${filename}": the compiled workflow has 0 nodes. ` +
                `This usually means the TypeScript class name contains an invalid character ` +
                `(e.g. → U+2192 is not a valid identifier). ` +
                `Rename the class to a plain ASCII identifier and try again.`
            );
        }

        if (!localWf.name) {
            localWf.name = path.parse(filename).name.replace('.workflow', '');
        }

        const newWf = await this.client.createWorkflow(localWf);
        if (!newWf || !newWf.id) {
            throw new Error('Failed to create remote workflow');
        }

        // Update local file with new ID and clean metadata
        // Convert the new workflow back to TypeScript
        const tsCode = await WorkflowTransformerAdapter.convertToTypeScript(newWf, {
            format: true,
            commentStyle: 'verbose'
        });
        fs.writeFileSync(filePath, tsCode, 'utf-8');

        return { id: newWf.id, updatedAt: newWf.updatedAt };
    }

    private readTypeScriptFile(filePath: string): string | null {
        try {
            return fs.readFileSync(filePath, 'utf8');
        } catch {
            return null;
        }
    }
}