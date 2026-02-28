import test from 'node:test';
import assert from 'node:assert';
import {
    store,
    setWorkflows,
    addConflict,
    removeConflict,
    selectAllWorkflows
} from '../../src/services/workflow-store.js';
import { WorkflowSyncStatus } from 'n8nac';

/**
 * UI State Synchronization Tests (Redux Store)
 * 
 * Verifies that the store correctly manages workflow states and reactive updates.
 */

test('Extension Store: Workflow Management', async (t) => {
    await t.test('setWorkflows should populate the store', () => {
        const mockWorkflows = [
            { id: '1', name: 'Wf 1', filename: 'Wf 1.json', status: WorkflowSyncStatus.TRACKED, active: true },
            { id: '2', name: 'Wf 2', filename: 'Wf 2.json', status: WorkflowSyncStatus.MODIFIED_LOCALLY, active: true }
        ];

        store.dispatch(setWorkflows(mockWorkflows));

        const state = store.getState();
        assert.strictEqual(state.workflows.allIds.length, 2);
        assert.strictEqual(state.workflows.byId['1'].name, 'Wf 1');
        assert.strictEqual(state.workflows.byId['2'].name, 'Wf 2');
        
        const all = selectAllWorkflows(state);
        assert.strictEqual(all.length, 2);
    });

    // Note: addPendingDeletion and removePendingDeletion tests removed
    // as deletion tracking is no longer part of the git-like sync pattern

    await t.test('addConflict should track conflicts with remote content', () => {
        const mockConflict = {
            id: '2',
            filename: 'Wf 2.json',
            remoteContent: { name: 'Remote version' }
        };

        store.dispatch(addConflict(mockConflict));

        const state = store.getState();
        assert.ok(state.conflicts.byWorkflowId['2']);
        assert.strictEqual(state.conflicts.byWorkflowId['2'].remoteContent.name, 'Remote version');

        store.dispatch(removeConflict('2'));
        const stateAfter = store.getState();
        assert.strictEqual(stateAfter.conflicts.byWorkflowId['2'], undefined);
    });
});
