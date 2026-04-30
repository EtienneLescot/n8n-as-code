import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagCommand } from '../../src/commands/tag.js';

vi.mock('chalk', () => {
    const identity = (s: string) => s;
    const proxy: any = new Proxy(identity, {
        get: (_target, prop) => {
            if (prop === 'level') return 0;
            return proxy;
        },
        apply: (_target, _this, args) => args[0],
    });
    return { default: proxy };
});

function makeCommand(): TagCommand {
    process.env.N8N_HOST = 'https://n8n.test';
    process.env.N8N_API_KEY = 'test-key';
    return new TagCommand();
}

describe('TagCommand', () => {
    let cmd: TagCommand;
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
            throw new Error(`process.exit:${code ?? 0}`);
        }) as never);
        cmd = makeCommand();
    });

    it('attaches an existing tag to a remote workflow without dropping existing tags', async () => {
        vi.spyOn(cmd['client'], 'getWorkflowTags').mockResolvedValue([
            { id: 'tag-existing', name: 'existing' },
        ]);
        vi.spyOn(cmd['client'], 'getTags').mockResolvedValue([
            { id: 'tag-existing', name: 'existing' },
            { id: 'tag-new', name: 'new-tag' },
        ]);
        vi.spyOn(cmd['client'], 'createTag');
        const updateSpy = vi.spyOn(cmd['client'], 'updateWorkflowTags').mockResolvedValue([
            { id: 'tag-existing', name: 'existing' },
            { id: 'tag-new', name: 'new-tag' },
        ]);

        await cmd.attach('wf-1', 'new-tag', { json: true });

        expect(cmd['client'].createTag).not.toHaveBeenCalled();
        expect(updateSpy).toHaveBeenCalledWith('wf-1', [
            { id: 'tag-existing', name: 'existing' },
            { id: 'tag-new', name: 'new-tag' },
        ]);
        expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({
            workflowId: 'wf-1',
            changed: true,
        });
    });

    it('creates a tag before attaching when it does not exist yet', async () => {
        vi.spyOn(cmd['client'], 'getWorkflowTags').mockResolvedValue([]);
        vi.spyOn(cmd['client'], 'getTags').mockResolvedValue([]);
        vi.spyOn(cmd['client'], 'createTag').mockResolvedValue({ id: 'tag-created', name: 'created-tag' });
        const updateSpy = vi.spyOn(cmd['client'], 'updateWorkflowTags').mockResolvedValue([
            { id: 'tag-created', name: 'created-tag' },
        ]);

        await cmd.attach('wf-1', 'created-tag');

        expect(cmd['client'].createTag).toHaveBeenCalledWith('created-tag');
        expect(updateSpy).toHaveBeenCalledWith('wf-1', [
            { id: 'tag-created', name: 'created-tag' },
        ]);
    });

    it('does not update tags when attaching a tag already present on the workflow', async () => {
        vi.spyOn(cmd['client'], 'getWorkflowTags').mockResolvedValue([
            { id: 'tag-existing', name: 'Existing' },
        ]);
        vi.spyOn(cmd['client'], 'updateWorkflowTags');

        await cmd.attach('wf-1', 'existing', { json: true });

        expect(cmd['client'].updateWorkflowTags).not.toHaveBeenCalled();
        expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({
            workflowId: 'wf-1',
            changed: false,
        });
    });

    it('detaches only the requested tag from a remote workflow', async () => {
        vi.spyOn(cmd['client'], 'getWorkflowTags').mockResolvedValue([
            { id: 'tag-keep', name: 'keep' },
            { id: 'tag-remove', name: 'remove-me' },
        ]);
        const updateSpy = vi.spyOn(cmd['client'], 'updateWorkflowTags').mockResolvedValue([
            { id: 'tag-keep', name: 'keep' },
        ]);

        await cmd.detach('wf-1', 'remove-me', { json: true });

        expect(updateSpy).toHaveBeenCalledWith('wf-1', [
            { id: 'tag-keep', name: 'keep' },
        ]);
        expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({
            workflowId: 'wf-1',
            changed: true,
        });
    });

    it('lists remote workflows with an exact tag', async () => {
        vi.spyOn(cmd as any, 'getSyncConfig').mockResolvedValue({
            projectId: 'project-1',
        });
        vi.spyOn(cmd['client'], 'getAllWorkflows').mockResolvedValue([
            {
                id: 'wf-1',
                name: 'Tagged',
                active: true,
                nodes: [],
                connections: {},
                tags: [{ id: 'tag-target', name: 'target' }],
            },
            {
                id: 'wf-2',
                name: 'Other',
                active: false,
                nodes: [],
                connections: {},
                tags: [{ id: 'tag-other', name: 'other' }],
            },
        ]);

        await cmd.workflows('target', { json: true });

        const parsed = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
        expect(parsed).toHaveLength(1);
        expect(parsed[0]).toMatchObject({ id: 'wf-1', name: 'Tagged' });
    });
});
