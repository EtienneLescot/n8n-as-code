import test from 'node:test';
import assert from 'node:assert';
import { 
    store, 
    setWorkflows, 
    addPendingDeletion, 
    removePendingDeletion,
    addConflict,
    removeConflict,
    selectAllWorkflows
} from '../../src/services/workflow-store.js';
import { WorkflowSyncStatus } from '@n8n-as-code/sync';

/**
 * UI State Synchronization Tests (Redux Store)
 * 
 * Verifies that the store correctly manages workflow states and reactive updates.
 */

test('Extension Store: Workflow Management', async (t) => {
    await t.test('setWorkflows should populate the store', () => {
        const mockWorkflows = [
            { id: '1', name: 'Wf 1', filename: 'Wf 1.json', status: WorkflowSyncStatus.IN_SYNC, active: true },
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

    await t.test('addPendingDeletion should track workflows being deleted', () => {
        store.dispatch(addPendingDeletion('1'));
        
        const state = store.getState();
        assert.ok(state.pendingDeletions.workflowIds.includes('1'), 'Should contain workflow 1');
        
        store.dispatch(removePendingDeletion('1'));
        const stateAfter = store.getState();
        assert.ok(!stateAfter.pendingDeletions.workflowIds.includes('1'), 'Should not contain workflow 1');
    });

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
