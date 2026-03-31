import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { N8nApiClient } from '../../src/core/services/n8n-api-client.js';
import { IFolder } from '../../src/core/types.js';
import { buildFolderTree } from '../../src/commands/folders.js';
import { SyncEngine } from '../../src/core/services/sync-engine.js';
import { WorkflowSyncStatus } from '../../src/core/types.js';

// ── N8nApiClient folder helpers ──────────────────────────────────────────────

describe('N8nApiClient.buildFolderPath', () => {
    const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'key' });

    const folders: IFolder[] = [
        { id: 'a', name: 'Finance', parentFolderId: null },
        { id: 'b', name: 'Reports', parentFolderId: 'a' },
        { id: 'c', name: 'Monthly', parentFolderId: 'b' },
        { id: 'd', name: 'Marketing', parentFolderId: null },
    ];

    it('returns null for null/undefined folderId', () => {
        expect(client.buildFolderPath(null, folders)).toBeNull();
        expect(client.buildFolderPath(undefined, folders)).toBeNull();
    });

    it('returns just the folder name for a root folder', () => {
        expect(client.buildFolderPath('a', folders)).toBe('Finance');
        expect(client.buildFolderPath('d', folders)).toBe('Marketing');
    });

    it('builds the full nested path', () => {
        expect(client.buildFolderPath('b', folders)).toBe('Finance/Reports');
        expect(client.buildFolderPath('c', folders)).toBe('Finance/Reports/Monthly');
    });

    it('returns null for an unknown folder ID', () => {
        expect(client.buildFolderPath('unknown', folders)).toBeNull();
    });

    it('guards against circular references', () => {
        const circular: IFolder[] = [
            { id: 'x', name: 'X', parentFolderId: 'y' },
            { id: 'y', name: 'Y', parentFolderId: 'x' },
        ];
        // Should not loop forever; exact return value is not critical
        expect(() => client.buildFolderPath('x', circular)).not.toThrow();
    });
});

// ── buildFolderTree (FoldersCommand helper) ───────────────────────────────────

describe('buildFolderTree', () => {
    it('returns an empty array for an empty folder list', () => {
        expect(buildFolderTree([])).toEqual([]);
    });

    it('places root-level folders at depth 0 (no indent)', () => {
        const folders: IFolder[] = [
            { id: '1', name: 'Alpha', parentFolderId: null },
            { id: '2', name: 'Beta', parentFolderId: null },
        ];
        const tree = buildFolderTree(folders);
        expect(tree).toHaveLength(2);
        expect(tree[0].indent).toBe('');
        expect(tree[1].indent).toBe('');
    });

    it('sorts children alphabetically at each level', () => {
        const folders: IFolder[] = [
            { id: '1', name: 'Zeta', parentFolderId: null },
            { id: '2', name: 'Alpha', parentFolderId: null },
            { id: '3', name: 'Zebra', parentFolderId: '1' },
            { id: '4', name: 'Ant', parentFolderId: '1' },
        ];
        const tree = buildFolderTree(folders);
        // Root level: Alpha first, then Zeta
        expect(tree[0].name).toBe('Alpha');
        expect(tree[1].name).toBe('Zeta');
        // Children of Zeta: Ant first, then Zebra
        expect(tree[2].name).toBe('Ant');
        expect(tree[3].name).toBe('Zebra');
    });

    it('renders nested paths correctly', () => {
        const folders: IFolder[] = [
            { id: 'r', name: 'Root', parentFolderId: null },
            { id: 'c', name: 'Child', parentFolderId: 'r' },
            { id: 'g', name: 'GrandChild', parentFolderId: 'c' },
        ];
        const tree = buildFolderTree(folders);
        expect(tree).toHaveLength(3);
        expect(tree[0].name).toBe('Root');
        expect(tree[1].name).toBe('Child');
        expect(tree[2].name).toBe('GrandChild');
        // Deeper items should have a non-empty indent prefix
        expect(tree[1].indent.length).toBeGreaterThan(0);
        expect(tree[2].indent.length).toBeGreaterThan(tree[1].indent.length);
    });
});

// ── scanWorkflowFiles (WorkflowStateTracker) ─────────────────────────────────
// We test the observable outcome: the tracker picks up files in subdirectories.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { WorkflowStateTracker } from '../../src/core/services/workflow-state-tracker.js';

function makeClient(): N8nApiClient {
    const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'key' });
    vi.spyOn(client, 'getAllWorkflows').mockResolvedValue([]);
    vi.spyOn(client, 'getFolders').mockResolvedValue([]);
    return client;
}

describe('WorkflowStateTracker: recursive file scanning', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('discovers .workflow.ts files in subdirectories', async () => {
        // Create nested structure
        const sub = path.join(tmpDir, 'FolderA', 'SubFolderB');
        fs.mkdirSync(sub, { recursive: true });

        const rootFile = path.join(tmpDir, 'root-workflow.workflow.ts');
        const subFile = path.join(sub, 'nested-workflow.workflow.ts');

        // Minimal valid .workflow.ts content (no @workflow decorator → no ID)
        const content = '// placeholder\n';
        fs.writeFileSync(rootFile, content);
        fs.writeFileSync(subFile, content);

        const tracker = new WorkflowStateTracker(makeClient(), {
            directory: tmpDir,
            syncInactive: true,
            ignoredTags: [],
            projectId: 'proj-1',
        });

        await tracker.refreshLocalState();

        const list = await tracker.getLightweightList();
        const filenames = list.map(w => w.filename);

        expect(filenames).toContain('root-workflow.workflow.ts');
        expect(filenames).toContain('FolderA/SubFolderB/nested-workflow.workflow.ts');
    });

    it('ignores hidden directories (starting with dot)', async () => {
        const hiddenDir = path.join(tmpDir, '.hidden');
        fs.mkdirSync(hiddenDir, { recursive: true });
        fs.writeFileSync(path.join(hiddenDir, 'secret.workflow.ts'), '// ignore me\n');

        const visibleFile = path.join(tmpDir, 'visible.workflow.ts');
        fs.writeFileSync(visibleFile, '// include me\n');

        const tracker = new WorkflowStateTracker(makeClient(), {
            directory: tmpDir,
            syncInactive: true,
            ignoredTags: [],
            projectId: 'proj-1',
        });

        await tracker.refreshLocalState();
        const list = await tracker.getLightweightList();
        const filenames = list.map(w => w.filename);

        expect(filenames).toContain('visible.workflow.ts');
        expect(filenames).not.toContain('.hidden/secret.workflow.ts');
    });
});

describe('SyncEngine folder mirroring', () => {
    it('moves an existing workflow into the folder that matches its local subdirectory', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-sync-engine-'));

        try {
            const localDir = path.join(tmpDir, 'Finance');
            fs.mkdirSync(localDir, { recursive: true });

            const workflowPath = path.join(localDir, 'monthly-report.workflow.ts');
            fs.writeFileSync(workflowPath, `
import { workflow, node } from '@n8n-as-code/transformer';

@workflow({
    id: 'wf-1',
    name: 'Monthly Report',
    active: false
})
export class MonthlyReport {
    @node({
        name: 'Start',
        type: 'n8n-nodes-base.noOp',
        version: 1,
        position: [250, 300]
    })
    Start = {};
}
`, 'utf-8');

            const client = {
                getWorkflow: vi.fn(async () => ({ id: 'wf-1', updatedAt: '2026-03-30T10:00:00.000Z' })),
                updateWorkflow: vi.fn(async (_id: string, workflow: any) => ({
                    id: 'wf-1',
                    name: workflow.name,
                    active: workflow.active ?? false,
                    nodes: workflow.nodes,
                    connections: workflow.connections,
                    settings: workflow.settings ?? {},
                    updatedAt: '2026-03-30T10:05:00.000Z',
                })),
                ensureFolderPath: vi.fn(async () => 'folder-finance'),
                moveWorkflowToFolder: vi.fn(async () => true),
            } as any;

            const watcher = {
                getLastSyncedAt: vi.fn(() => '2026-03-30T10:00:00.000Z'),
                setRemoteHash: vi.fn(),
                finalizeSync: vi.fn(async () => undefined),
            } as any;

            const engine = new SyncEngine(client, watcher, tmpDir, {
                projectId: 'project-1',
                folderSync: true,
            });

            await expect(
                engine.push('Finance/monthly-report.workflow.ts', 'wf-1', WorkflowSyncStatus.TRACKED)
            ).resolves.toBe('wf-1');

            expect(client.ensureFolderPath).toHaveBeenCalledWith('Finance', 'project-1');
            expect(client.moveWorkflowToFolder).toHaveBeenCalledWith('wf-1', 'project-1', 'folder-finance');
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
