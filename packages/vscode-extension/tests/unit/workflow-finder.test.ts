import test from 'node:test';
import assert from 'node:assert';
import { WorkflowSyncStatus } from 'n8nac';
import { buildWorkflowQuickPickItems, getWorkflowFinderCommand } from '../../src/utils/workflow-finder.js';

test('buildWorkflowQuickPickItems sorts workflows by name and exposes id/filename metadata', () => {
    const items = buildWorkflowQuickPickItems([
        {
            id: 'wf-9',
            name: 'Zulu Flow',
            filename: 'zulu.workflow.ts',
            active: true,
            status: WorkflowSyncStatus.TRACKED,
        },
        {
            id: 'wf-1',
            name: 'Alpha Flow',
            filename: 'nested/alpha.workflow.ts',
            active: false,
            status: WorkflowSyncStatus.EXIST_ONLY_LOCALLY,
        },
    ]);

    assert.deepStrictEqual(items.map(item => item.label), ['Alpha Flow', 'Zulu Flow']);
    assert.strictEqual(items[0].description, 'ID: wf-1');
    assert.strictEqual(items[0].detail, 'nested/alpha.workflow.ts • EXIST_ONLY_LOCALLY');
});

test('getWorkflowFinderCommand opens local files when available and falls back to n8n board for remote-only workflows', () => {
    assert.strictEqual(getWorkflowFinderCommand({
        id: 'wf-2',
        name: 'Local Flow',
        filename: 'local.workflow.ts',
        active: true,
        status: WorkflowSyncStatus.TRACKED,
    }), 'n8n.openJson');

    assert.strictEqual(getWorkflowFinderCommand({
        id: 'wf-3',
        name: 'Remote Flow',
        filename: '',
        active: true,
        status: WorkflowSyncStatus.EXIST_ONLY_REMOTELY,
    }), 'n8n.openBoard');
});
