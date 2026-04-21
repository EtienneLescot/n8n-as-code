import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncEngine } from '../../src/core/services/sync-engine.js';
import { WorkflowTransformerAdapter } from '../../src/core/services/workflow-transformer-adapter.js';

function createEngine(params: { projectId: string; createWorkflow: ReturnType<typeof vi.fn> }) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-sync-engine-'));
    const filename = 'new.workflow.ts';
    fs.writeFileSync(path.join(directory, filename), '// workflow source', 'utf8');

    const watcher = {
        finalizeSync: vi.fn(async () => undefined),
    } as any;

    const client = {
        createWorkflow: params.createWorkflow,
    } as any;

    const engine = new SyncEngine(client, watcher, directory, params.projectId);

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
});
