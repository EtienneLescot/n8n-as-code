import test from 'node:test';
import assert from 'node:assert';
import { store, setWorkflows, addConflict } from '../../src/services/workflow-store.js';
import { WorkflowSyncStatus } from 'n8nac';

/**
 * Event-to-Store Mapping Tests
 * 
 * Verifies the contract between Sync events and Redux Store updates.
 * This simulates what extension.ts does.
 */

test('Extension Integration: Event to Store Mapping', async (t) => {
    // 1. Reset store
    store.dispatch(setWorkflows([]));

    await t.test('Sync "change" event should refresh workflows in store', () => {
        // Simulate event payload from SyncManager
        const eventData = {
            filename: 'Test.json',
            workflowId: 'wf-1',
            status: WorkflowSyncStatus.MODIFIED_LOCALLY
        };

        // This is what the listener in extension.ts does:
        const mockWorkflowsStatus = [
            { id: 'wf-1', name: 'Test', filename: 'Test.json', status: WorkflowSyncStatus.MODIFIED_LOCALLY, active: true }
        ];
        store.dispatch(setWorkflows(mockWorkflowsStatus));

        const state = store.getState();
        assert.strictEqual(state.workflows.byId['wf-1']?.status, WorkflowSyncStatus.MODIFIED_LOCALLY);
    });

    // Note: "local-deletion" event test removed as deletion tracking is no longer part of the git-like sync pattern

    await t.test('Sync "conflict" event should update conflicts store', () => {
        const eventData = {
            id: 'wf-1',
            filename: 'Test.json',
            remoteContent: { nodes: [] }
        };

        // This is what the listener in extension.ts does:
        store.dispatch(addConflict(eventData));

        const state = store.getState();
        assert.ok(state.conflicts.byWorkflowId['wf-1']);
        assert.deepStrictEqual(state.conflicts.byWorkflowId['wf-1'].remoteContent, { nodes: [] });
    });
});
