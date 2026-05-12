import test from 'node:test';
import assert from 'node:assert';
import { configureStore } from '@reduxjs/toolkit';

import { actions, store as sharedStore } from '../../src/ui/settings-webview/store.js';

function resetSharedStore() {
    sharedStore.dispatch(actions.snapshotReceived(undefined));
    sharedStore.dispatch(actions.jobsReceived({}));
}

test('settings webview store preserves dirty environment drafts across snapshots', () => {
    resetSharedStore();
    sharedStore.dispatch(actions.environmentDraftOpened({ id: 'new' }));
    sharedStore.dispatch(actions.environmentDraftPatched({ id: 'new', patch: { name: 'Dirty draft', syncFolder: 'custom' } }));
    sharedStore.dispatch(actions.snapshotReceived({ type: 'init', workspace: { environments: [] }, global: { instances: [] } }));

    const draft = sharedStore.getState().drafts.environment.new;
    assert.strictEqual(draft.name, 'Dirty draft');
    assert.strictEqual(draft.syncFolder, 'custom');
});

test('settings webview store selects created managed instance in open environment draft', () => {
    resetSharedStore();
    sharedStore.dispatch(actions.environmentDraftOpened({ id: 'new' }));
    sharedStore.dispatch(actions.managedInstanceSelectedForEnvironment({ draftId: 'new', instanceId: 'managed-1' }));

    const draft = sharedStore.getState().drafts.environment.new;
    assert.strictEqual(draft.instanceChoice, 'managed:managed-1');
    assert.strictEqual(draft.projectId, 'personal');
    assert.strictEqual(draft.projectName, 'Personal');
});

test('settings webview store tracks managed setup job lifecycle', () => {
    resetSharedStore();
    sharedStore.dispatch(actions.jobReceived({ instanceId: 'managed-1', status: 'installing' }));
    sharedStore.dispatch(actions.jobReceived({ instanceId: 'managed-1', status: 'failed', error: 'Docker not found' }));

    assert.strictEqual(sharedStore.getState().jobs['managed-1'].status, 'failed');
    assert.strictEqual(sharedStore.getState().jobs['managed-1'].error, 'Docker not found');
});
