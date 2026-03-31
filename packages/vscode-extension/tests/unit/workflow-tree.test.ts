import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowSyncStatus } from 'n8nac';
import { buildWorkflowTree, getWorkflowFolderPath } from '../../src/utils/workflow-tree.js';

test('getWorkflowFolderPath prefers folderPath and falls back to filename directories', async (t) => {
    await t.test('returns explicit folderPath when available', () => {
        const result = getWorkflowFolderPath({
            id: '1',
            name: 'Remote Workflow',
            filename: 'ignored.workflow.ts',
            folderPath: 'Finance/Reports',
            status: WorkflowSyncStatus.TRACKED,
            active: true,
        } as any);

        assert.equal(result, 'Finance/Reports');
    });

    await t.test('derives the folder path from nested filenames', () => {
        const result = getWorkflowFolderPath({
            id: '2',
            name: 'Local Workflow',
            filename: 'Ops/Daily/run.workflow.ts',
            status: WorkflowSyncStatus.TRACKED,
            active: true,
        } as any);

        assert.equal(result, 'Ops/Daily');
    });
});

test('buildWorkflowTree groups workflows into nested folders and sorts them', () => {
    const tree = buildWorkflowTree([
        {
            id: 'wf-3',
            name: 'Z Root',
            filename: 'z-root.workflow.ts',
            status: WorkflowSyncStatus.TRACKED,
            active: true,
        } as any,
        {
            id: 'wf-2',
            name: 'Quarterly Report',
            filename: 'Finance/Reports/quarterly.workflow.ts',
            status: WorkflowSyncStatus.TRACKED,
            active: true,
        } as any,
        {
            id: 'wf-1',
            name: 'Monthly Report',
            folderPath: 'Finance/Reports',
            filename: 'monthly.workflow.ts',
            status: WorkflowSyncStatus.TRACKED,
            active: true,
        } as any,
        {
            id: 'wf-4',
            name: 'A Root',
            filename: 'a-root.workflow.ts',
            status: WorkflowSyncStatus.TRACKED,
            active: true,
        } as any,
    ]);

    assert.deepEqual(tree.workflows.map((workflow) => workflow.name), ['A Root', 'Z Root']);
    assert.equal(tree.folders.length, 1);
    assert.equal(tree.folders[0].name, 'Finance');
    assert.equal(tree.folders[0].folders.length, 1);
    assert.equal(tree.folders[0].folders[0].name, 'Reports');
    assert.deepEqual(
        tree.folders[0].folders[0].workflows.map((workflow) => workflow.name),
        ['Monthly Report', 'Quarterly Report']
    );
});
