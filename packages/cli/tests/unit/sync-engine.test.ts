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
    } as any;

    const engine = new SyncEngine(client, watcher, directory, params.projectId, undefined, {
        folderSync: params.folderSync,
        folderSyncMoveToRoot: params.folderSyncMoveToRoot,
    });

    return { engine, directory, filename, watcher };
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

    it('does NOT retry when n8n returns a generic 400 mentioning only "folder" (regression guard for over-broad match)', async () => {
        vi.spyOn(WorkflowTransformerAdapter, 'compileToJson').mockResolvedValue({
            name: 'Nested Workflow',
            nodes: [{ id: 'n1' }],
            connections: {},
        } as any);
        vi.spyOn(WorkflowTransformerAdapter, 'convertToTypeScript').mockResolvedValue('// generated');

        // A 400 whose body mentions "folder" but not "parentFolderId" / "parentFolder" must NOT be
        // misclassified as "unsupported parentFolderId" — that would silently drop the folder assignment
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
// path used to drop `parentFolderId` on the floor — both because
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
}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-sync-engine-update-'));
    const filename = params.filename ?? 'existing.workflow.ts';
    fs.mkdirSync(path.dirname(path.join(directory, filename)), { recursive: true });
    fs.writeFileSync(path.join(directory, filename), '// workflow source', 'utf8');

    const watcher = {
        finalizeSync: vi.fn(async () => undefined),
        setRemoteHash: vi.fn(),
    } as any;

    // Return undefined from getWorkflow to bypass OCC; tests don't exercise OCC.
    const client = {
        getWorkflow: vi.fn(async () => undefined),
        updateWorkflow: params.updateWorkflow,
        getFolders: params.getFolders,
        createFolder: params.createFolder,
        resolveFolderProjectId: params.resolveFolderProjectId,
    } as any;

    const engine = new SyncEngine(client, watcher, directory, params.projectId, undefined, {
        folderSync: params.folderSync,
        folderSyncMoveToRoot: params.folderSyncMoveToRoot,
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
        // deletes it in the catch block) — so the recorded `calls` would
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
