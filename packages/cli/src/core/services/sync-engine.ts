import fs from 'fs';
import path from 'path';
import { N8nApiClient } from './n8n-api-client.js';
import { WorkflowTransformerAdapter } from './workflow-transformer-adapter.js';
import { HashUtils } from './hash-utils.js';
import { WorkflowStateTracker } from './workflow-state-tracker.js';
import { SyncEventJournal } from './sync-event-journal.js';
import { WorkflowSyncStatus, IWorkflow, IFolder } from '../types.js';
import { ensureParentDirectory, normalizeWorkflowRelativePath, workflowRelativePathToAbsolute } from './workflow-path-utils.js';

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
    private watcher: WorkflowStateTracker;
    private directory: string;
    private projectId: string;
    private syncEventJournal: SyncEventJournal | undefined;
    private folderSync: boolean;
    /**
     * In-flight `createFolder` requests, keyed by
     * `${projectId}::${parentFolderId ?? ''}::${name}`.
     *
     * Multiple concurrent `push()` calls that need the same parent folder
     * (e.g. `AI Chat/x.workflow.ts` and `AI Chat/y.workflow.ts`) deduplicate
     * their `createFolder` round-trips through this map so we never POST
     * twice for the same folder — even if two invocations interleave after
     * `getFolders` returns an empty array.
     */
    private inFlightFolderCreates: Map<string, Promise<IFolder>> = new Map();
    private folderSyncMoveToRoot: boolean;
    /** Guards the "folders unavailable" warning so a bulk push logs it once. */
    private folderUnavailableWarned = false;

    constructor(
        client: N8nApiClient,
        watcher: WorkflowStateTracker,
        directory: string,
        projectId: string,
        syncEventJournal?: SyncEventJournal,
        options?: { folderSync?: boolean; folderSyncMoveToRoot?: boolean },
    ) {
        this.client = client;
        this.watcher = watcher;
        this.directory = directory;
        this.projectId = projectId;
        this.syncEventJournal = syncEventJournal;
        this.folderSync = options?.folderSync ?? false;
        this.folderSyncMoveToRoot = options?.folderSyncMoveToRoot ?? false;
    }

    /**
     * PULL Strategy: Remote -> Local
     * Based on spec 5.2 PULL Strategy table
     */
    public async pull(workflowId: string, filename: string, status: WorkflowSyncStatus): Promise<void> {
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
                    // No action per spec
                    break;

                default:
                    console.warn(`[SyncEngine] Unhandled status ${status} for PULL operation`);
                    break;
        }
    }

    /**
     * PUSH Strategy: Local -> Remote
     * Based on spec 5.3 PUSH Strategy table
     */
    public async push(filename: string, workflowId?: string, status?: WorkflowSyncStatus): Promise<string> {
        // If we have an ID, we ALWAYS try to update first (robustness for git-like sync)
            if (workflowId) {
                try {
                    // PUT to API (Update)
                    // We bypass OCC check if the status is EXIST_ONLY_LOCALLY (meaning we think it's new but it might not be)
                    const skipOcc = status === WorkflowSyncStatus.EXIST_ONLY_LOCALLY;
                    const updateUpdatedAt = await this.executeUpdate(workflowId, filename, skipOcc);
                    
                    // Update lastSyncedHash via finalizeSync
                    await this.watcher.finalizeSync(workflowId, updateUpdatedAt);
                    this.recordPushSuccess(workflowId, filename, updateUpdatedAt);
                    return workflowId;
                } catch (error: any) {
                    // If it's a 404 or we truly think it's local-only, fall through to create
                    const isNotFound = error.response?.status === 404 || error.message?.includes('404') || error.message?.includes('Not Found');
                    if (!isNotFound && status !== WorkflowSyncStatus.EXIST_ONLY_LOCALLY) {
                        throw error;
                    }
                    console.log(`[SyncEngine] Workflow ${workflowId} not found or treating as new, falling back to Create`);
                }
            }

            // No ID or Update failed with 404 -> POST to API (Create)
            const { id: newWorkflowId, updatedAt } = await this.executeCreate(filename);
            
            // Initialize lastSyncedHash via finalizeSync
            await this.watcher.finalizeSync(newWorkflowId, updatedAt);
            this.recordPushSuccess(newWorkflowId, filename, updatedAt);
            return newWorkflowId;
    }

    /**
     * Force PULL - overwrite local with remote (for conflict resolution)
     */
    public async forcePull(workflowId: string, filename: string): Promise<void> {
        const updatedAt = await this.executePull(workflowId, filename);
        await this.watcher.finalizeSync(workflowId, updatedAt);
    }

    /**
     * Force PUSH - overwrite remote with local (for conflict resolution and restoration)
     * If workflow doesn't exist on remote, creates it
     */
    public async forcePush(workflowId: string, filename: string): Promise<string> {
        let finalWorkflowId = workflowId;
        let finalUpdatedAt: string | undefined;

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
        this.recordPushSuccess(finalWorkflowId, filename, finalUpdatedAt);
        return finalWorkflowId;
    }

    /**
     * Delete remote workflow (for deletion validation)
     * Note: The Watcher already archived the remote content when it detected the local deletion
     */
    public async deleteRemote(workflowId: string, filename: string): Promise<void> {
        // Delete from API — State removal is handled by caller (ResolutionManager)
        await this.client.deleteWorkflow(workflowId);
    }

    private async executePull(workflowId: string, filename: string): Promise<string | undefined> {
        const fullWf = await this.client.getWorkflow(workflowId);
        if (!fullWf) {
            throw new Error(`Workflow ${workflowId} not found on remote.`);
        }

        // Convert to TypeScript
        const tsCode = await WorkflowTransformerAdapter.convertToTypeScript(fullWf, {
            format: true,
            commentStyle: 'verbose'
        });
        
        const filePath = workflowRelativePathToAbsolute(this.directory, filename);
        ensureParentDirectory(filePath);
        fs.writeFileSync(filePath, tsCode, 'utf-8');

        // Update Watcher's remote hash cache since we just fetched the workflow
        // This ensures finalizeSync has the remote hash
        const hash = await WorkflowTransformerAdapter.hashWorkflow(tsCode);
        this.watcher.setRemoteHash(workflowId, hash);
        
        // Return the updatedAt timestamp so finalizeSync can store it
        return fullWf.updatedAt;
    }

    private async executeUpdate(workflowId: string, filename: string, skipOcc = false): Promise<string | undefined> {
        const filePath = workflowRelativePathToAbsolute(this.directory, filename);
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

        // Folder-aware move: when folderSync is enabled and `filename` lives under a
        // nested folder path, mirror the create-path logic and forward parentFolderId
        // to n8n so the existing workflow actually moves to that folder on update.
        // Mirrors inferParentFolderIdFromFilename() usage in executeCreate().
        const inferredParentFolderId = await this.inferParentFolderIdFromFilename(filename);
        // `null` is meaningful here (move to project root), so only skip on undefined.
        if (inferredParentFolderId !== undefined) {
            localWf.parentFolderId = inferredParentFolderId;
        }

        let updatedWf: IWorkflow;
        try {
            updatedWf = await this.client.updateWorkflow(workflowId, localWf);
        } catch (error: any) {
            // Retry without parentFolderId when n8n rejects it as an unknown field.
            // Workflow placement via the public API only exists from n8n 2.32; older
            // instances 400 on the field. Same fallback used by executeCreate().
            if (localWf.parentFolderId === undefined || !this.isUnsupportedParentFolderError(error)) throw error;
            console.warn(`[SyncEngine] n8n rejected parentFolderId while updating "${filename}" (folder placement needs n8n 2.32+); retrying without folder assignment.`);
            // parentFolderId is a known IWorkflow field; strip it without an `any` cast.
            delete localWf.parentFolderId;
            updatedWf = await this.client.updateWorkflow(workflowId, localWf);
        }

        if (!updatedWf?.id || updatedWf.id !== workflowId || !Array.isArray(updatedWf.nodes)) {
            throw new Error('Failed to update remote workflow: n8n did not return an updated workflow payload');
        }

        // Block push for archived workflows - n8n API returns 400 and this would cause
        // confusing behavior for the user. Archiving is an n8n-side operation only.
        if (updatedWf.isArchived) {
            throw new Error(
                `Push blocked for "${filename}": the workflow is archived on n8n. ` +
                `Archived workflows cannot receive updates via API. ` +
                `Unarchive the workflow in the n8n UI first, then push again.`
            );
        }

        // CRITICAL: Write the API response back to local file to ensure consistency
        // This ensures local and remote have identical content after push
        // Convert the updated workflow back to TypeScript
        const tsCode = await WorkflowTransformerAdapter.convertToTypeScript(updatedWf, {
            format: true,
            commentStyle: 'verbose'
        });
        ensureParentDirectory(filePath);
        fs.writeFileSync(filePath, tsCode, 'utf-8');

        // Update Watcher's remote hash cache with the updated workflow
        const hash = await WorkflowTransformerAdapter.hashWorkflow(tsCode);
        this.watcher.setRemoteHash(workflowId, hash);
        
        return updatedWf.updatedAt;
    }

    private recordPushSuccess(workflowId: string, filename: string, remoteUpdatedAt?: string): void {
        try {
            this.syncEventJournal?.append({
                op: 'workflow.push',
                status: 'success',
                workflowId,
                filename,
                remoteChanged: true,
                remoteUpdatedAt,
            });
        } catch (error: any) {
            console.warn(`[SyncEngine] Failed to write sync event journal: ${error?.message || error}`);
        }
    }

    private async executeCreate(filename: string): Promise<{ id: string, updatedAt?: string }> {
        const filePath = workflowRelativePathToAbsolute(this.directory, filename);
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

        if (this.projectId && this.projectId !== 'personal') {
            localWf.projectId = this.projectId;
        }

        const inferredParentFolderId = await this.inferParentFolderIdFromFilename(filename);
        // `null` is meaningful here (create at project root), so only skip on undefined.
        if (inferredParentFolderId !== undefined) {
            localWf.parentFolderId = inferredParentFolderId;
        }

        let newWf: IWorkflow;
        try {
            newWf = await this.client.createWorkflow(localWf);
        } catch (error: any) {
            if (localWf.parentFolderId === undefined || !this.isUnsupportedParentFolderError(error)) throw error;
            console.warn(`[SyncEngine] n8n rejected parentFolderId while creating "${filename}" (folder placement needs n8n 2.32+); retrying without folder assignment.`);
            // parentFolderId is a known IWorkflow field; strip it without an `any` cast.
            delete localWf.parentFolderId;
            newWf = await this.client.createWorkflow(localWf);
        }
        if (!newWf || !newWf.id) {
            throw new Error('Failed to create remote workflow');
        }

        // Update local file with new ID and clean metadata
        // Convert the new workflow back to TypeScript
        const tsCode = await WorkflowTransformerAdapter.convertToTypeScript(newWf, {
            format: true,
            commentStyle: 'verbose'
        });
        ensureParentDirectory(filePath);
        fs.writeFileSync(filePath, tsCode, 'utf-8');

        return { id: newWf.id, updatedAt: newWf.updatedAt };
    }

    /**
     * Maps a workflow-relative filename to the n8n folder it should live in.
     *
     * Three distinct outcomes, matching n8n's own `parentFolderId` semantics:
     * - `string`   — put the workflow in that folder (creating folders as needed)
     * - `null`     — move it to the project root (only when folderSyncMoveToRoot is on)
     * - `undefined` — say nothing, leave the workflow where n8n has it
     */
    private async inferParentFolderIdFromFilename(filename: string): Promise<string | null | undefined> {
        if (!this.folderSync) return undefined;
        const normalized = normalizeWorkflowRelativePath(filename);
        const segments = normalized.split('/');
        if (segments.length <= 1) {
            // Flat local path. Only claim the project root when the repository is
            // configured as the source of truth, otherwise a push would silently
            // undo folders someone created in the n8n UI.
            return this.folderSyncMoveToRoot ? null : undefined;
        }

        // Soft capability check: N8nApiClient exposes these methods, but mocks in
        // unit tests may not. Skip folder inference gracefully rather than throw.
        if (typeof this.client.getFolders !== 'function' || typeof this.client.createFolder !== 'function') {
            return undefined;
        }

        // `GET /projects/:id/folders` needs a real project id: it does not accept the
        // `personal` alias that folder creation does, and `GET /api/v1/projects` is
        // Enterprise-gated. resolveFolderProjectId() reads it off a workflow instead.
        const projectId = typeof this.client.resolveFolderProjectId === 'function'
            ? await this.client.resolveFolderProjectId(this.projectId)
            : (this.projectId && this.projectId !== 'personal' ? this.projectId : null);
        if (!projectId) {
            this.warnFoldersUnavailable('could not determine which n8n project this instance syncs to');
            return undefined;
        }

        const folderSegments = segments.slice(0, -1);
        let folders: IFolder[];
        try {
            folders = await this.client.getFolders(projectId);
        } catch (error: any) {
            // 403 = the instance has no `feat:folders` licence (an unregistered
            // Community instance); 404 = n8n predates the folder endpoints.
            // Neither is a reason to fail the push — place the workflow flat.
            if (![403, 404].includes(error?.response?.status)) throw error;
            this.warnFoldersUnavailable(
                error?.response?.status === 403
                    ? 'the n8n instance reports no folder support (register the Community instance to unlock folders)'
                    : 'this n8n version has no folder API (needs n8n 2.19+, and 2.32+ to place workflows)'
            );
            return undefined;
        }

        let parentFolderId: string | null = null;
        for (const segment of folderSegments) {
            const folder = await this.ensureFolder(folders, projectId, segment, parentFolderId);
            parentFolderId = folder.id;
        }

        return parentFolderId ?? undefined;
    }

    /** Logs the "folderSync is on but unusable" warning at most once per engine. */
    private warnFoldersUnavailable(reason: string): void {
        if (this.folderUnavailableWarned) return;
        this.folderUnavailableWarned = true;
        console.warn(`[SyncEngine] folderSync is enabled but ${reason}. Workflows will be pushed without folder assignment.`);
    }

    /**
     * Returns the folder named `name` under `parentFolderId`, creating it if
     * missing. Concurrent calls for the same `(projectId, parentFolderId, name)`
     * triple share a single in-flight `createFolder` promise so we never POST
     * twice for the same folder.
     */
    private async ensureFolder(
        folders: IFolder[],
        projectId: string,
        name: string,
        parentFolderId: string | null,
    ): Promise<IFolder> {
        const existing = folders.find(
            (candidate) => candidate.name === name && (candidate.parentFolderId ?? null) === parentFolderId,
        );
        if (existing) return existing;

        const key = `${projectId}::${parentFolderId ?? ''}::${name}`;
        const inFlight = this.inFlightFolderCreates.get(key);
        if (inFlight) return inFlight;

        const promise = this.client
            .createFolder(projectId, { name, parentFolderId })
            .then((created) => {
                folders.push(created);
                return created;
            })
            .finally(() => {
                this.inFlightFolderCreates.delete(key);
            });
        this.inFlightFolderCreates.set(key, promise);
        return promise;
    }

    /**
     * Returns true when n8n rejected the create call specifically because it
     * does not understand the `parentFolderId` field — in which case we retry
     * without it so the sync still completes against older n8n instances.
     *
     * Tightened from the original `'folder'` substring match (which would have
     * silently swallowed unrelated 400/404 errors) to require either a
     * structured `parentFolderId` / `parentFolder` field in the response body,
     * or a message that explicitly mentions one of those tokens.
     */
    private isUnsupportedParentFolderError(error: any): boolean {
        const status = error?.response?.status;
        if (![400, 404, 422].includes(status)) return false;

        const PARENT_FOLDER_PATTERN = /(parentfolderid|parent folder id|parentfolder)/i;
        const PARENT_FOLDER_KEYS = new Set(['parentfolderid', 'parentfolder']);
        // n8n 2.19-2.31 licenses folders but its workflow schema has no `parentFolderId`
        // yet, and AJV's `additionalProperties: false` rejects it *without naming the
        // field*: `request/body must NOT have additional properties`. The patterns above
        // never match that, so the push aborted instead of degrading, leaving an orphaned
        // folder behind. Reported with live captures on #527 by @Happily-Coding.
        //
        // Safe to treat as an unsupported-`parentFolderId` signal: this matcher is only
        // consulted when we just added `parentFolderId` to an otherwise-valid payload, and
        // the retry strips only that field. If some *other* unknown property were the real
        // cause, the retry fails again and the error surfaces as before -- nothing is hidden.
        const GENERIC_ADDITIONAL_PROPERTY_PATTERN = /must not have additional properties/i;

        const data = error?.response?.data;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            for (const key of Object.keys(data)) {
                if (PARENT_FOLDER_KEYS.has(key.toLowerCase())) return true;
            }
            const dataMessage = String(data.message ?? '').toLowerCase();
            if (PARENT_FOLDER_PATTERN.test(dataMessage)) return true;
            if (GENERIC_ADDITIONAL_PROPERTY_PATTERN.test(dataMessage)) return true;
            return false;
        }

        const errorMessage = String(error?.message ?? '').toLowerCase();
        return PARENT_FOLDER_PATTERN.test(errorMessage)
            || GENERIC_ADDITIONAL_PROPERTY_PATTERN.test(errorMessage);
    }

    private readTypeScriptFile(filePath: string): string | null {
        try {
            return fs.readFileSync(filePath, 'utf8');
        } catch {
            return null;
        }
    }
}
