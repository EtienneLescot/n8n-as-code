import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncEngine } from '../../src/core/services/sync-engine.js';
import { WorkflowTransformerAdapter } from '../../src/core/services/workflow-transformer-adapter.js';

function createEngine(params: {
    projectId: string;
    createWorkflow: ReturnType<typeof vi.fn>;
    filename?: string;
    folderSync?: boolean;
    folderSyncMoveToRoot?: boolean;
    getFolders?: ReturnType<typeof vi.fn>;
    createFolder?: ReturnType<typeof vi.fn>;
    resolveFolderProjectId?: ReturnType<typeof vi.fn>;
    publishWorkflowVersion?: ReturnType<typeof vi.fn>;
    onPublishState?: (report: any) => void;
}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-sync-engine-'));
    const filename = params.filename ?? 'new.workflow.ts';
    fs.mkdirSync(path.dirname(path.join(directory, filename)), { recursive: true });
    fs.writeFileSync(path.join(directory, filename), '// workflow source', 'utf8');

    const watcher = {
        finalizeSync: vi.fn(async () => undefined),
    } as any;

    const client = {
        createWorkflow: params.createWorkflow,
        getFolders: params.getFolders,
        createFolder: params.createFolder,
        resolveFolderProjectId: params.resolveFolderProjectId,
        publishWorkflowVersion: params.publishWorkflowVersion ?? vi.fn(async () => null),
    } as any;

    const engine = new SyncEngine(client, watcher, directory, params.projectId, undefined, {
        folderSync: params.folderSync,
        folderSyncMoveToRoot: params.folderSyncMoveToRoot,
        onPublishState: params.onPublishState,
    });

    return { engine, directory, filename, watcher, client };
}

describe('SyncEngine create payload projectId behavior', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('sends configured shared projectId in create payload', async () => {
        const compileSpy = vi.spyOn(WorkflowTransformerAdapter, 'compileToJson').mockResolvedValue({
            name: 'New Workflow',
            nodes: [{ id: 'n1' }],
            connections: {},
        } as any);
        vi.spyOn(WorkflowTransformerAdapter, 'convertToTypeScript').mockResolvedValue('// generated');

        const createWorkflow = vi.fn(async (payload) => ({ ...payload, id: 'wf-1', updatedAt: '2026-04-21T00:00:00.000Z' }));
        const { engine, filename, watcher } = createEngine({
            projectId: 'shared-project-123',
            createWorkflow,
        });

        await expect(engine.push(filename)).resolves.toBe('wf-1');

        expect(compileSpy).toHaveBeenCalledOnce();
        expect(createWorkflow).toHaveBeenCalledWith(expect.objectContaining({
            projectId: 'shared-project-123',
        }));
        expect(watcher.finalizeSync).toHaveBeenCalledWith('wf-1', '2026-04-21T00:00:00.000Z');
    });

    it('omits projectId when resolved projectId is personal placeholder', async () => {
        vi.spyOn(WorkflowTransformerAdapter, 'compileToJson').mockResolvedValue({
            name: 'New Workflow',
            nodes: [{ id: 'n1' }],
            connections: {},
        } as any);
        vi.spyOn(WorkflowTransformerAdapter, 'convertToTypeScript').mockResolvedValue('// generated');

        const createWorkflow = vi.fn(async (payload) => ({ ...payload, id: 'wf-2' }));
        const { engine, filename } = createEngine({
            projectId: 'personal',
            createWorkflow,
        });

        await expect(engine.push(filename)).resolves.toBe('wf-2');

        expect(createWorkflow).toHaveBeenCalledWith(expect.not.objectContaining({
            projectId: expect.anything(),
        }));
    });

    it('sets parentFolderId on create for nested folderSync paths', async () => {
        vi.spyOn(WorkflowTransformerAdapter, 'compileToJson').mockResolvedValue({
            name: 'Nested Workflow',
            nodes: [{ id: 'n1' }],
            connections: {},
        } as any);
        vi.spyOn(WorkflowTransformerAdapter, 'convertToTypeScript').mockResolvedValue('// generated');

        const createWorkflow = vi.fn(async (payload) => ({ ...payload, id: 'wf-nested' }));
        const getFolders = vi.fn(async () => [
            { id: 'folder-ai-chat', name: 'Ai Chat', parentFolderId: null },
        ]);
        const createFolder = vi.fn(async (_projectId, payload) => ({
            id: 'folder-file-processing',
            name: payload.name,
            parentFolderId: payload.parentFolderId,
        }));

        const { engine, filename } = createEngine({
            projectId: 'project-1',
            createWorkflow,
            filename: 'Ai Chat/File Processing/new.workflow.ts',
            folderSync: true,
            getFolders,
            createFolder,
        });

        await expect(engine.push(filename)).resolves.toBe('wf-nested');

        expect(createFolder).toHaveBeenCalledWith('project-1', {
            name: 'File Processing',
            parentFolderId: 'folder-ai-chat',
        });
        expect(createWorkflow).toHaveBeenCalledWith(expect.objectContaining({
            parentFolderId: 'folder-file-processing',
        }));
    });

    it('retries create without parentFolderId when n8n rejects it as an unknown field', async () => {
        vi.spyOn(WorkflowTransformerAdapter, 'compileToJson').mockResolvedValue({
            name: 'Nested Workflow',
            nodes: [{ id: 'n1' }],
            connections: {},
        } as any);
        vi.spyOn(WorkflowTransformerAdapter, 'convertToTypeScript').mockResolvedValue('// generated');

        const folderError: any = new Error('Request failed with status code 400');
        folderError.response = {
            status: 400,
            data: { message: "property 'parentFolderId' should not exist" },
        };
        // Snapshot each call's payload at call time. SyncEngine mutates the same
        // localWf object between calls (sets parentFolderId, then deletes it in
        // the catch block), so a live reference inspected via mock.calls[0][0]
        // would reflect the post-mutation state and miss parentFolderId.
        const callSnapshots: any[] = [];
        const createWorkflow = vi.fn()
            .mockImplementationOnce(async (payload) => {
                callSnapshots.push({ ...payload });
                throw folderError;
            })
            .mockImplementationOnce(async (payload) => {
                callSnapshots.push({ ...payload });
                return { ...payload, id: 'wf-fallback' };
            });
        const getFolders = vi.fn(async () => []);
        const createFolder = vi.fn(async (_projectId, payload) => ({
            id: 'folder-x',
            name: payload.name,
            parentFolderId: payload.parentFolderId,
        }));

        const { engine, filename } = createEngine({
            projectId: 'project-1',
            createWorkflow,
            filename: 'X/new.workflow.ts',
            folderSync: true,
            getFolders,
            createFolder,
        });

        await expect(engine.push(filename)).resolves.toBe('wf-fallback');

        expect(createWorkflow).toHaveBeenCalledTimes(2);
        expect(callSnapshots).toHaveLength(2);
        expect(callSnapshots[0]).toEqual(expect.objectContaining({ parentFolderId: 'folder-x' }));
        expect(callSnapshots[1]).not.toHaveProperty('parentFolderId');
    });

    // The test above mocks an error that NAMES the field. Real n8n 2.19-2.31 licenses
    // folders but has no `parentFolderId` in its workflow schema, and AJV rejects it
    // without naming anything: "request/body must NOT have additional properties".
    // That body matched none of the patterns, so push aborted instead of degrading and
    // left an orphaned folder -- green CI, broken live. Captured on a real 2.25.6
    // instance and reported on #527 by @Happily-Coding.
    it('retries create without parentFolderId on n8n\'s generic additional-properties 400', async () => {
        vi.spyOn(WorkflowTransformerAdapter, 'compileToJson').mockResolvedValue({
            name: 'Nested Workflow',
            nodes: [{ id: 'n1' }],
            connections: {},
        } as any);
        vi.spyOn(WorkflowTransformerAdapter, 'convertToTypeScript').mockResolvedValue('// generated');

        const genericError: any = new Error('Request failed with status code 400');
        genericError.response = {
            status: 400,
            // verbatim from n8n 2.25.6
            data: { message: 'request/body must NOT have additional properties' },
        };
        const callSnapshots: any[] = [];
        const createWorkflow = vi.fn()
            .mockImplementationOnce(async (payload) => {
                callSnapshots.push({ ...payload });
                throw genericError;
            })
            .mockImplementationOnce(async (payload) => {
                callSnapshots.push({ ...payload });
                return { ...payload, id: 'wf-generic-fallback' };
            });

        const { engine, filename } = createEngine({
            projectId: 'project-1',
            createWorkflow,
            filename: 'X/new.workflow.ts',
            folderSync: true,
            getFolders: vi.fn(async () => []),
            createFolder: vi.fn(async (_projectId, payload) => ({
                id: 'folder-x', name: payload.name, parentFolderId: payload.parentFolderId,
            })),
        });

        await expect(engine.push(filename)).resolves.toBe('wf-generic-fallback');
        expect(createWorkflow).toHaveBeenCalledTimes(2);
        expect(callSnapshots[0]).toEqual(expect.objectContaining({ parentFolderId: 'folder-x' }));
        expect(callSnapshots[1]).not.toHaveProperty('parentFolderId');
    });

    it('does NOT retry when n8n returns a generic 400 mentioning only "folder" (regression guard for over-broad match)', async () => {
        vi.spyOn(WorkflowTransformerAdapter, 'compileToJson').mockResolvedValue({
            name: 'Nested Workflow',
            nodes: [{ id: 'n1' }],
            connections: {},
        } as any);
        vi.spyOn(WorkflowTransformerAdapter, 'convertToTypeScript').mockResolvedValue('// generated');

        // A 400 whose body mentions "folder" but not "parentFolderId" / "parentFolder" must NOT be
        // misclassified as "unsupported parentFolderId" â€” that would silently drop the folder assignment
        // on n8n instances that DO support it.
        const genericFolderError: any = new Error('Request failed with status code 400');
        genericFolderError.response = {
            status: 400,
            data: { message: 'A folder with this name already exists in another project' },
        };
        const createWorkflow = vi.fn().mockRejectedValue(genericFolderError);
        const getFolders = vi.fn(async () => []);
        const createFolder = vi.fn(async (_projectId, payload) => ({
            id: 'folder-x',
            name: payload.name,
            parentFolderId: payload.parentFolderId,
        }));

        const { engine, filename } = createEngine({
            projectId: 'project-1',
            createWorkflow,
            filename: 'X/new.workflow.ts',
            folderSync: true,
            getFolders,
            createFolder,
        });

        await expect(engine.push(filename)).rejects.toBe(genericFolderError);
        expect(createWorkflow).toHaveBeenCalledTimes(1);
        expect(createFolder).toHaveBeenCalledTimes(1);
    });

    it('deduplicates concurrent createFolder requests for the same parent folder', async () => {
        vi.spyOn(WorkflowTransformerAdapter, 'compileToJson').mockResolvedValue({
            name: 'Concurrent Workflow',
            nodes: [{ id: 'n1' }],
            connections: {},
        } as any);
        vi.spyOn(WorkflowTransformerAdapter, 'convertToTypeScript').mockResolvedValue('// generated');

        const createWorkflow = vi.fn(async (payload: any) => ({
            ...payload,
            id: payload.name === 'x' ? 'wf-x' : 'wf-y',
        }));

        let createFolderCalls = 0;
        const createFolder = vi.fn(async (_projectId: string, payload: { name: string; parentFolderId: string | null }) => {
            createFolderCalls++;
            // Yield to the event loop so the second push() can enter ensureFolder() before this resolves.
            await new Promise((resolve) => setTimeout(resolve, 5));
            return {
                id: `folder-${payload.name}-${createFolderCalls}`,
                name: payload.name,
                parentFolderId: payload.parentFolderId,
            };
        });
        const getFolders = vi.fn(async () => []);

        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-sync-engine-concurrent-'));
        const filenameX = 'Shared/Parent/x.workflow.ts';
        const filenameY = 'Shared/Parent/y.workflow.ts';
        fs.mkdirSync(path.join(directory, 'Shared', 'Parent'), { recursive: true });
        fs.writeFileSync(path.join(directory, filenameX), '// x', 'utf8');
        fs.writeFileSync(path.join(directory, filenameY), '// y', 'utf8');

        const watcher = { finalizeSync: vi.fn(async () => undefined) } as any;
        const client = { createWorkflow, getFolders, createFolder } as any;
        const engine = new SyncEngine(client, watcher, directory, 'project-1', undefined, { folderSync: true });

        await Promise.all([engine.push(filenameX), engine.push(filenameY)]);

        // Both pushes share the "Shared" folder creation (parent null) and the
        // "Parent" folder creation (parent = Shared). With the in-flight promise
        // map, each folder must be created exactly once.
        const sharedFolderCalls = createFolder.mock.calls.filter((call) => call[1].name === 'Shared');
        const parentFolderCalls = createFolder.mock.calls.filter((call) => call[1].name === 'Parent');
        expect(sharedFolderCalls).toHaveLength(1);
        expect(parentFolderCalls).toHaveLength(1);
    });
});


// ---------------------------------------------------------------------------
// Update path: folder-aware move (PR review fix for Codex P2 finding)
// ---------------------------------------------------------------------------
//
// Mirrors the create-path folderSync tests but for executeUpdate(). The update
// path used to drop `parentFolderId` on the floor â€” both because
// `inferParentFolderIdFromFilename` was only called from executeCreate(), and
// because `N8nApiClient.cleanWorkflowUpdatePayload()` did not include
// `parentFolderId` in its allowedKeys set. Both are fixed; these tests guard
// the contract.
// ---------------------------------------------------------------------------

function updateEngine(params: {
    projectId: string;
    updateWorkflow: ReturnType<typeof vi.fn>;
    filename?: string;
    folderSync?: boolean;
    folderSyncMoveToRoot?: boolean;
    getFolders?: ReturnType<typeof vi.fn>;
    createFolder?: ReturnType<typeof vi.fn>;
    resolveFolderProjectId?: ReturnType<typeof vi.fn>;
    workflowId?: string;
    getPublishedVersion?: ReturnType<typeof vi.fn>;
    publishWorkflowVersion?: ReturnType<typeof vi.fn>;
    onPublishState?: (report: any) => void;
}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-sync-engine-update-'));
    const filename = params.filename ?? 'existing.workflow.ts';
    fs.mkdirSync(path.dirname(path.join(directory, filename)), { recursive: true });
    fs.writeFileSync(path.join(directory, filename), '// workflow source', 'utf8');

    const watcher = {
        finalizeSync: vi.fn(async () => undefined),
        setRemoteHash: vi.fn(),
        // No sync base recorded, so the OCC check passes whatever `getWorkflow`
        // returns — tests that stub it for other reasons stay unaffected.
        getLastSyncedAt: vi.fn(() => undefined),
    } as any;

    // Return undefined from getWorkflow to bypass OCC; tests don't exercise OCC.
    const client = {
        getWorkflow: vi.fn(async () => undefined),
        updateWorkflow: params.updateWorkflow,
        getFolders: params.getFolders,
        createFolder: params.createFolder,
        resolveFolderProjectId: params.resolveFolderProjectId,
        // Unpublished by default: most update tests are about the payload, and an
        // unpublished workflow is the case where the push touches nothing else.
        getPublishedVersion: params.getPublishedVersion ?? vi.fn(async () => ({ published: false })),
        publishWorkflowVersion: params.publishWorkflowVersion ?? vi.fn(async () => null),
    } as any;

    const engine = new SyncEngine(client, watcher, directory, params.projectId, undefined, {
        folderSync: params.folderSync,
        folderSyncMoveToRoot: params.folderSyncMoveToRoot,
        onPublishState: params.onPublishState,
    });

    return {
        engine,
        directory,
        filename,
        watcher,
        client,
        workflowId: params.workflowId ?? 'wf-existing',
    };
}

describe('SyncEngine update payload folderSync behavior', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('sets parentFolderId on update for nested folderSync paths (move into folder)', async () => {
        vi.spyOn(WorkflowTransformerAdapter, 'compileToJson').mockResolvedValue({
            name: 'Existing Workflow',
            nodes: [{ id: 'n1' }],
            connections: {},
        } as any);
        vi.spyOn(WorkflowTransformerAdapter, 'convertToTypeScript').mockResolvedValue('// generated');

        const updateWorkflow = vi.fn(async (id, payload) => ({
            ...payload,
            id,
            updatedAt: '2026-06-23T00:00:00.000Z',
        }));
        const getFolders = vi.fn(async () => [
            { id: 'folder-ai-chat', name: 'Ai Chat', parentFolderId: null },
        ]);
        const createFolder = vi.fn(async (_projectId, payload) => ({
            id: 'folder-file-processing',
            name: payload.name,
            parentFolderId: payload.parentFolderId,
        }));

        const { engine, filename, workflowId } = updateEngine({
            projectId: 'project-1',
            updateWorkflow,
            filename: 'Ai Chat/File Processing/existing.workflow.ts',
            folderSync: true,
            getFolders,
            createFolder,
            workflowId: 'wf-existing',
        });

        await expect(engine.push(filename, workflowId)).resolves.toBe(workflowId);

        expect(updateWorkflow).toHaveBeenCalledTimes(1);
        expect(updateWorkflow).toHaveBeenCalledWith(workflowId, expect.objectContaining({
            parentFolderId: 'folder-file-processing',
        }));
    });

    it('does NOT send parentFolderId on update when filename has no nested folder', async () => {
        vi.spyOn(WorkflowTransformerAdapter, 'compileToJson').mockResolvedValue({
            name: 'Existing Workflow',
            nodes: [{ id: 'n1' }],
            connections: {},
        } as any);
        vi.spyOn(WorkflowTransformerAdapter, 'convertToTypeScript').mockResolvedValue('// generated');

        const updateWorkflow = vi.fn(async (id, payload) => ({
            ...payload,
            id,
            updatedAt: '2026-06-23T00:00:00.000Z',
        }));
        // folderSync: true but flat filename -> inferParentFolderIdFromFilename
        // short-circuits before calling getFolders.
        const getFolders = vi.fn(async () => []);
        const createFolder = vi.fn(async () => ({ id: 'unused', name: 'unused', parentFolderId: null }));

        const { engine, filename, workflowId } = updateEngine({
            projectId: 'project-1',
            updateWorkflow,
            filename: 'existing.workflow.ts',
            folderSync: true,
            getFolders,
            createFolder,
            workflowId: 'wf-existing',
        });

        await expect(engine.push(filename, workflowId)).resolves.toBe(workflowId);

        expect(getFolders).not.toHaveBeenCalled();
        expect(updateWorkflow).toHaveBeenCalledTimes(1);
        expect(updateWorkflow).toHaveBeenCalledWith(
            workflowId,
            expect.not.objectContaining({ parentFolderId: expect.anything() }),
        );
    });

    // Update-side twin of the create-side generic-400 case: n8n 2.19-2.31 rejects the
    // unknown `parentFolderId` without naming it, so the retry never fired and the push
    // aborted. Real body captured on 2.25.6, reported on #527 by @Happily-Coding.
    it('retries update without parentFolderId on n8n\'s generic additional-properties 400', async () => {
        vi.spyOn(WorkflowTransformerAdapter, 'compileToJson').mockResolvedValue({
            name: 'Existing Workflow',
            nodes: [{ id: 'n1' }],
            connections: {},
        } as any);
        vi.spyOn(WorkflowTransformerAdapter, 'convertToTypeScript').mockResolvedValue('// generated');

        const genericError: any = new Error('Request failed with status code 400');
        genericError.response = {
            status: 400,
            data: { message: 'request/body must NOT have additional properties' },
        };

        const callSnapshots: Array<{ id: string; payload: any }> = [];
        const updateWorkflow = vi.fn(async (id: string, payload: any) => {
            callSnapshots.push({ id, payload: { ...payload } });
            if (callSnapshots.length === 1) throw genericError;
            return { ...payload, id, updatedAt: '2026-06-23T00:00:00.000Z' };
        });

        const { engine, filename, workflowId } = updateEngine({
            projectId: 'project-1',
            updateWorkflow,
            filename: 'Reports/existing.workflow.ts',
            folderSync: true,
            getFolders: vi.fn(async () => []),
            createFolder: vi.fn(async (_projectId, payload) => ({
                id: 'folder-x', name: payload.name, parentFolderId: payload.parentFolderId,
            })),
        });

        await engine.push(filename, workflowId);

        expect(updateWorkflow).toHaveBeenCalledTimes(2);
        expect(callSnapshots[0].payload).toEqual(expect.objectContaining({ parentFolderId: 'folder-x' }));
        expect(callSnapshots[1].payload).not.toHaveProperty('parentFolderId');
    });

    it('retries update without parentFolderId when n8n rejects it as an unknown field', async () => {
        vi.spyOn(WorkflowTransformerAdapter, 'compileToJson').mockResolvedValue({
            name: 'Existing Workflow',
            nodes: [{ id: 'n1' }],
            connections: {},
        } as any);
        vi.spyOn(WorkflowTransformerAdapter, 'convertToTypeScript').mockResolvedValue('// generated');

        // First call rejects with a 400 mentioning parentFolderId; second call
        // (without parentFolderId) succeeds.
        const folderError: any = new Error('Request failed with status code 400');
        folderError.response = {
            status: 400,
            data: { message: "property 'parentFolderId' should not exist" },
        };

        // Snapshot each call's payload at call time. Vitest's vi.fn() records
        // arguments by live reference, and SyncEngine mutates the same localWf
        // between the two updateWorkflow calls (sets parentFolderId, then
        // deletes it in the catch block) â€” so the recorded `calls` would
        // reflect the post-mutation object by the time the assertion runs.
        // Capturing { ...payload } at each call preserves call-time state.
        // Same pattern as the create-side fix in commit c801ff43.
        const callSnapshots: Array<{ id: string; payload: any }> = [];
        const updateWorkflow = vi.fn(async (id: string, payload: any) => {
            callSnapshots.push({ id, payload: { ...payload } });
            if (callSnapshots.length === 1) throw folderError;
            return { ...payload, id, updatedAt: '2026-06-23T00:00:00.000Z' };
        });
        const getFolders = vi.fn(async () => []);
        const createFolder = vi.fn(async (_projectId, payload) => ({
            id: 'folder-x',
            name: payload.name,
            parentFolderId: payload.parentFolderId,
        }));

        const { engine, filename, workflowId } = updateEngine({
            projectId: 'project-1',
            updateWorkflow,
            filename: 'X/existing.workflow.ts',
            folderSync: true,
            getFolders,
            createFolder,
            workflowId: 'wf-existing',
        });

        await expect(engine.push(filename, workflowId)).resolves.toBe(workflowId);

        expect(updateWorkflow).toHaveBeenCalledTimes(2);
        expect(callSnapshots[0].id).toBe(workflowId);
        expect(callSnapshots[0].payload).toEqual(expect.objectContaining({ parentFolderId: 'folder-x' }));
        expect(callSnapshots[1].payload).not.toHaveProperty('parentFolderId');
    });

    it('does NOT retry when n8n returns a generic 400 mentioning only "folder" (regression guard)', async () => {
        vi.spyOn(WorkflowTransformerAdapter, 'compileToJson').mockResolvedValue({
            name: 'Existing Workflow',
            nodes: [{ id: 'n1' }],
            connections: {},
        } as any);
        vi.spyOn(WorkflowTransformerAdapter, 'convertToTypeScript').mockResolvedValue('// generated');

        // A 400 mentioning "folder" but NOT "parentFolderId" / "parentFolder"
        // must NOT be misclassified as "unsupported parentFolderId". Doing so
        // would silently drop the folder assignment on n8n instances that DO
        // support it (the same regression the create-side fix addresses).
        const genericFolderError: any = new Error('Request failed with status code 400');
        genericFolderError.response = {
            status: 400,
            data: { message: 'A folder with this name already exists in another project' },
        };
        const updateWorkflow = vi.fn().mockRejectedValue(genericFolderError);
        const getFolders = vi.fn(async () => []);
        const createFolder = vi.fn(async (_projectId, payload) => ({
            id: 'folder-x',
            name: payload.name,
            parentFolderId: payload.parentFolderId,
        }));

        const { engine, filename, workflowId } = updateEngine({
            projectId: 'project-1',
            updateWorkflow,
            filename: 'X/existing.workflow.ts',
            folderSync: true,
            getFolders,
            createFolder,
            workflowId: 'wf-existing',
        });

        await expect(engine.push(filename, workflowId)).rejects.toBe(genericFolderError);
        expect(updateWorkflow).toHaveBeenCalledTimes(1);
        expect(createFolder).toHaveBeenCalledTimes(1);
    });
});


// ---------------------------------------------------------------------------
// Push-authoritative folder placement on API-key-only instances
// ---------------------------------------------------------------------------
//
// n8n's public API lets us WRITE a workflow's folder (2.32+) but never READ it
// back: `parentFolderId` is writeOnly and no endpoint maps workflows to folders.
// So push is the only direction that can carry folder intent, and it must behave
// predictably on a Community instance holding nothing but an API key:
//   - resolve the project id without the Enterprise-gated projects API
//   - degrade to a flat push (never fail) when folders are unlicensed/absent
//   - only claim the project root when explicitly told to
// ---------------------------------------------------------------------------

describe('SyncEngine folder placement without session auth', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves a real project id when configured with the personal placeholder', async () => {
        vi.spyOn(WorkflowTransformerAdapter, 'compileToJson').mockResolvedValue({
            name: 'Nested Workflow',
            nodes: [{ id: 'n1' }],
            connections: {},
        } as any);
        vi.spyOn(WorkflowTransformerAdapter, 'convertToTypeScript').mockResolvedValue('// generated');

        const createWorkflow = vi.fn(async (payload) => ({ ...payload, id: 'wf-nested' }));
        const getFolders = vi.fn(async () => [
            { id: 'folder-reports', name: 'Reports', parentFolderId: null },
        ]);
        const createFolder = vi.fn();
        // GET /api/v1/projects is Enterprise-gated, so the client reads the id off
        // a workflow's shared[] instead.
        const resolveFolderProjectId = vi.fn(async () => 'personal-project-abc');

        const { engine, filename } = createEngine({
            projectId: 'personal',
            createWorkflow,
            filename: 'Reports/new.workflow.ts',
            folderSync: true,
            getFolders,
            createFolder,
            resolveFolderProjectId,
        });

        await expect(engine.push(filename)).resolves.toBe('wf-nested');

        expect(resolveFolderProjectId).toHaveBeenCalledWith('personal');
        expect(getFolders).toHaveBeenCalledWith('personal-project-abc');
        expect(createFolder).not.toHaveBeenCalled();
        expect(createWorkflow).toHaveBeenCalledWith(expect.objectContaining({
            parentFolderId: 'folder-reports',
        }));
    });

    it('pushes flat instead of failing when the folders API is unlicensed (403)', async () => {
        vi.spyOn(WorkflowTransformerAdapter, 'compileToJson').mockResolvedValue({
            name: 'Nested Workflow',
            nodes: [{ id: 'n1' }],
            connections: {},
        } as any);
        vi.spyOn(WorkflowTransformerAdapter, 'convertToTypeScript').mockResolvedValue('// generated');

        const createWorkflow = vi.fn(async (payload) => ({ ...payload, id: 'wf-flat' }));
        // Unregistered Community instance: no `feat:folders`, so the folder
        // endpoints answer 403.
        const getFolders = vi.fn().mockRejectedValue({ response: { status: 403, data: { message: 'Plan lacks license for this feature' } } });
        const createFolder = vi.fn();

        const { engine, filename } = createEngine({
            projectId: 'project-1',
            createWorkflow,
            filename: 'Reports/new.workflow.ts',
            folderSync: true,
            getFolders,
            createFolder,
        });

        await expect(engine.push(filename)).resolves.toBe('wf-flat');

        expect(createFolder).not.toHaveBeenCalled();
        expect(createWorkflow).toHaveBeenCalledTimes(1);
        expect(createWorkflow).toHaveBeenCalledWith(expect.not.objectContaining({
            parentFolderId: expect.anything(),
        }));
    });

    it('moves a workflow to the project root only when folderSyncMoveToRoot is on', async () => {
        vi.spyOn(WorkflowTransformerAdapter, 'compileToJson').mockResolvedValue({
            name: 'Existing Workflow',
            nodes: [{ id: 'n1' }],
            connections: {},
        } as any);
        vi.spyOn(WorkflowTransformerAdapter, 'convertToTypeScript').mockResolvedValue('// generated');

        const payloads: any[] = [];
        const updateWorkflow = vi.fn(async (id, payload) => {
            payloads.push({ ...payload });
            return { ...payload, id, updatedAt: '2026-07-23T00:00:00.000Z' };
        });
        const getFolders = vi.fn(async () => []);

        const { engine, filename, workflowId } = updateEngine({
            projectId: 'project-1',
            updateWorkflow,
            filename: 'existing.workflow.ts',
            folderSync: true,
            folderSyncMoveToRoot: true,
            getFolders,
            workflowId: 'wf-existing',
        });

        await expect(engine.push(filename, workflowId)).resolves.toBe(workflowId);

        // null (not undefined) is what tells n8n to move the workflow out of its
        // folder; a flat local file with the flag off leaves the remote untouched.
        expect(getFolders).not.toHaveBeenCalled();
        expect(payloads).toHaveLength(1);
        expect(payloads[0]).toHaveProperty('parentFolderId', null);
    });

    it('does not send a root move when the workflow already lives in a local folder', async () => {
        vi.spyOn(WorkflowTransformerAdapter, 'compileToJson').mockResolvedValue({
            name: 'Existing Workflow',
            nodes: [{ id: 'n1' }],
            connections: {},
        } as any);
        vi.spyOn(WorkflowTransformerAdapter, 'convertToTypeScript').mockResolvedValue('// generated');

        const payloads: any[] = [];
        const updateWorkflow = vi.fn(async (id, payload) => {
            payloads.push({ ...payload });
            return { ...payload, id, updatedAt: '2026-07-23T00:00:00.000Z' };
        });
        const getFolders = vi.fn(async () => [
            { id: 'folder-reports', name: 'Reports', parentFolderId: null },
        ]);
        const createFolder = vi.fn();

        const { engine, filename, workflowId } = updateEngine({
            projectId: 'project-1',
            updateWorkflow,
            filename: 'Reports/existing.workflow.ts',
            folderSync: true,
            folderSyncMoveToRoot: true,
            getFolders,
            createFolder,
            workflowId: 'wf-existing',
        });

        await expect(engine.push(filename, workflowId)).resolves.toBe(workflowId);

        expect(payloads[0]).toHaveProperty('parentFolderId', 'folder-reports');
    });
});

/**
 * n8n 2.x publishing model.
 *
 * A workflow is a draft (its content) plus a pointer to the version production
 * runs. `PUT /workflows/:id` rewrites the draft and, when the workflow is
 * published, drags the pointer along with no opt-out — so a push to a published
 * workflow is a save *and* a publish. That stays the default; it is announced
 * up front, and `--draft` opts into putting the pointer back (#563).
 */
describe('SyncEngine publish handling on push', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    function mockTransformer() {
        vi.spyOn(WorkflowTransformerAdapter, 'compileToJson').mockResolvedValue({
            name: 'Existing Workflow',
            nodes: [{ id: 'n1' }],
            connections: {},
        } as any);
        vi.spyOn(WorkflowTransformerAdapter, 'convertToTypeScript').mockResolvedValue('// generated');
    }

    const updateOk = () => vi.fn(async (id, payload) => ({
        ...payload,
        id,
        updatedAt: '2026-07-01T00:00:00.000Z',
    }));

    const publishedAt = (versionId?: string) => vi.fn(async () => ({ published: true, versionId }));

    it('releases the pushed content by default on a published workflow', async () => {
        mockTransformer();

        const publishWorkflowVersion = vi.fn(async () => null);
        const reports: any[] = [];
        const { engine, filename, workflowId } = updateEngine({
            projectId: 'project-1',
            updateWorkflow: updateOk(),
            getPublishedVersion: publishedAt('v-live'),
            publishWorkflowVersion,
            onPublishState: (r) => reports.push(r),
        });

        await expect(engine.push(filename, workflowId)).resolves.toBe(workflowId);

        // The PUT already published; nothing is undone behind the user's back.
        expect(publishWorkflowVersion).not.toHaveBeenCalled();
        expect(reports).toEqual([expect.objectContaining({ outcome: 'goes-live', workflowId })]);
    });

    // "Your push changed production" after the fact is a notification, not a
    // warning. The whole point of the default path is that it is announced.
    it('announces going live before the update lands', async () => {
        mockTransformer();

        const updateWorkflow = updateOk();
        let updatesAtAnnounce: number | undefined;
        const { engine, filename, workflowId } = updateEngine({
            projectId: 'project-1',
            updateWorkflow,
            getPublishedVersion: publishedAt('v-live'),
            onPublishState: () => { updatesAtAnnounce = updateWorkflow.mock.calls.length; },
        });

        await engine.push(filename, workflowId);

        expect(updatesAtAnnounce).toBe(0);
        expect(updateWorkflow).toHaveBeenCalledTimes(1);
    });

    it('re-pins the previously published version with --draft', async () => {
        mockTransformer();

        const publishWorkflowVersion = vi.fn(async () => ({ id: 'wf-existing', updatedAt: '2026-07-01T00:00:05.000Z' }));
        const reports: any[] = [];
        const { engine, filename, workflowId } = updateEngine({
            projectId: 'project-1',
            updateWorkflow: updateOk(),
            getPublishedVersion: publishedAt('v-live'),
            publishWorkflowVersion,
            onPublishState: (r) => reports.push(r),
        });

        await expect(engine.push(filename, workflowId, undefined, { draft: true })).resolves.toBe(workflowId);

        expect(publishWorkflowVersion).toHaveBeenCalledWith(workflowId, 'v-live');
        expect(reports).toEqual([
            expect.objectContaining({ outcome: 'restores', versionId: 'v-live', workflowId }),
        ]);
    });

    // The pointer has to be read before the PUT — afterwards it already names
    // the version we just uploaded, so restoring it would be a no-op.
    it('reads the published version before updating', async () => {
        mockTransformer();

        const updateWorkflow = updateOk();
        const getPublishedVersion = publishedAt('v-live');
        const { engine, filename, workflowId } = updateEngine({
            projectId: 'project-1',
            updateWorkflow,
            getPublishedVersion,
            publishWorkflowVersion: vi.fn(async () => null),
        });

        await engine.push(filename, workflowId, undefined, { draft: true });

        expect(getPublishedVersion.mock.invocationCallOrder[0])
            .toBeLessThan(updateWorkflow.mock.invocationCallOrder[0]);
    });

    // Re-pinning touches the workflow again, so the PUT's timestamp is stale by
    // the time the push ends. Recording it would make the next push believe the
    // workflow had been edited in the n8n UI.
    it('records the post-restore updatedAt as the sync base', async () => {
        mockTransformer();

        const { engine, filename, workflowId, watcher } = updateEngine({
            projectId: 'project-1',
            updateWorkflow: updateOk(),
            getPublishedVersion: publishedAt('v-live'),
            publishWorkflowVersion: vi.fn(async () => ({ id: 'wf-existing', updatedAt: '2026-07-01T00:00:05.000Z' })),
        });

        await engine.push(filename, workflowId, undefined, { draft: true });

        expect(watcher.finalizeSync).toHaveBeenCalledWith(workflowId, '2026-07-01T00:00:05.000Z');
    });

    it('falls back to a fresh read when the activate response carries no timestamp', async () => {
        mockTransformer();

        const { engine, filename, workflowId, watcher, client } = updateEngine({
            projectId: 'project-1',
            updateWorkflow: updateOk(),
            getPublishedVersion: publishedAt('v-live'),
            publishWorkflowVersion: vi.fn(async () => null),
        });
        client.getWorkflow = vi.fn(async () => ({ id: workflowId, updatedAt: '2026-07-01T00:00:09.000Z' }));

        await engine.push(filename, workflowId, undefined, { draft: true });

        expect(watcher.finalizeSync).toHaveBeenCalledWith(workflowId, '2026-07-01T00:00:09.000Z');
    });

    it('leaves an unpublished workflow alone', async () => {
        mockTransformer();

        const publishWorkflowVersion = vi.fn(async () => null);
        const reports: any[] = [];
        const { engine, filename, workflowId } = updateEngine({
            projectId: 'project-1',
            updateWorkflow: updateOk(),
            getPublishedVersion: vi.fn(async () => ({ published: false })),
            publishWorkflowVersion,
            onPublishState: (r) => reports.push(r),
        });

        await engine.push(filename, workflowId);

        expect(publishWorkflowVersion).not.toHaveBeenCalled();
        expect(reports).toEqual([expect.objectContaining({ outcome: 'not-published' })]);
    });

    it('reports unknown when the published version cannot be read', async () => {
        mockTransformer();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const updateWorkflow = updateOk();
        const reports: any[] = [];
        const { engine, filename, workflowId } = updateEngine({
            projectId: 'project-1',
            updateWorkflow,
            getPublishedVersion: vi.fn(async () => { throw new Error('ECONNRESET'); }),
            onPublishState: (r) => reports.push(r),
        });

        // A failed pre-read must not block a default push: the PUT that follows
        // would fail on the same transport if the instance were unreachable.
        await expect(engine.push(filename, workflowId)).resolves.toBe(workflowId);

        expect(updateWorkflow).toHaveBeenCalledTimes(1);
        expect(reports).toEqual([expect.objectContaining({ outcome: 'unknown' })]);
    });

    // `--draft` is a promise about production. When it cannot be kept, refusing
    // costs nothing (the PUT has not happened) and silently doing the opposite
    // is the worst available option.
    it('refuses --draft when the published version cannot be read', async () => {
        mockTransformer();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const updateWorkflow = updateOk();
        const { engine, filename, workflowId } = updateEngine({
            projectId: 'project-1',
            updateWorkflow,
            getPublishedVersion: vi.fn(async () => { throw new Error('ECONNRESET'); }),
        });

        await expect(engine.push(filename, workflowId, undefined, { draft: true }))
            .rejects.toThrow(/could not be read/);
        expect(updateWorkflow).not.toHaveBeenCalled();
    });

    // n8n 1.x has no version pointer: an active workflow runs the content it
    // holds, so there is nothing to restore and `--draft` cannot be honoured.
    it('refuses --draft on an instance without a version pointer', async () => {
        mockTransformer();

        const updateWorkflow = updateOk();
        const { engine, filename, workflowId } = updateEngine({
            projectId: 'project-1',
            updateWorkflow,
            getPublishedVersion: publishedAt(undefined),
        });

        await expect(engine.push(filename, workflowId, undefined, { draft: true }))
            .rejects.toThrow(/n8n 1\.x/);
        expect(updateWorkflow).not.toHaveBeenCalled();
    });

    it('still pushes to an unversioned instance without --draft', async () => {
        mockTransformer();

        const updateWorkflow = updateOk();
        const reports: any[] = [];
        const { engine, filename, workflowId } = updateEngine({
            projectId: 'project-1',
            updateWorkflow,
            getPublishedVersion: publishedAt(undefined),
            onPublishState: (r) => reports.push(r),
        });

        await expect(engine.push(filename, workflowId)).resolves.toBe(workflowId);

        expect(updateWorkflow).toHaveBeenCalledTimes(1);
        expect(reports).toEqual([expect.objectContaining({ outcome: 'goes-live' })]);
    });

    // Restoration is a compensating call, not an atomic one. When it fails the
    // pushed content stays live, so the push must not report success.
    it('fails loudly when the published version cannot be restored', async () => {
        mockTransformer();

        const { engine, filename, workflowId, watcher } = updateEngine({
            projectId: 'project-1',
            updateWorkflow: updateOk(),
            getPublishedVersion: publishedAt('v-live'),
            publishWorkflowVersion: vi.fn(async () => { throw new Error('403 Forbidden'); }),
        });

        const push = () => engine.push(filename, workflowId, undefined, { draft: true });
        await expect(push()).rejects.toThrow(/now live in production/);
        await expect(push()).rejects.toThrow(/v-live/);
        expect(watcher.finalizeSync).not.toHaveBeenCalled();
    });

    // n8n creates workflows unpublished, so a create never touches production
    // and neither mode has anything to publish or restore.
    it('never publishes a newly created workflow', async () => {
        vi.spyOn(WorkflowTransformerAdapter, 'compileToJson').mockResolvedValue({
            name: 'New Workflow',
            nodes: [{ id: 'n1' }],
            connections: {},
        } as any);
        vi.spyOn(WorkflowTransformerAdapter, 'convertToTypeScript').mockResolvedValue('// generated');

        const publishWorkflowVersion = vi.fn(async () => null);
        const { engine, filename } = createEngine({
            projectId: 'personal',
            createWorkflow: vi.fn(async (payload) => ({ ...payload, id: 'wf-new' })),
            publishWorkflowVersion,
        });

        await expect(engine.push(filename)).resolves.toBe('wf-new');
        await expect(engine.push(filename, undefined, undefined, { draft: true })).resolves.toBe('wf-new');

        expect(publishWorkflowVersion).not.toHaveBeenCalled();
    });
});

