import test from 'node:test';
import assert from 'node:assert';

import { actions, createSettingsWebviewStore } from '../../src/ui/settings-webview/store.js';

test('settings webview store preserves dirty environment drafts across snapshots', () => {
    const store = createSettingsWebviewStore();
    store.dispatch(actions.environmentDraftOpened({ id: 'new' }));
    store.dispatch(actions.environmentDraftPatched({ id: 'new', patch: { name: 'Dirty draft', syncFolder: 'custom' } }));
    store.dispatch(actions.snapshotReceived({ type: 'init', workspace: { environments: [] }, global: { instances: [] } }));

    const draft = store.getState().drafts.environment.new;
    assert.strictEqual(draft.name, 'Dirty draft');
    assert.strictEqual(draft.syncFolder, 'custom');
});

test('settings webview store selects created managed instance in open environment draft', () => {
    const store = createSettingsWebviewStore();
    store.dispatch(actions.environmentDraftOpened({ id: 'new' }));
    store.dispatch(actions.managedInstanceSelectedForEnvironment({ draftId: 'new', instanceId: 'managed-1' }));

    const draft = store.getState().drafts.environment.new;
    assert.strictEqual(draft.instanceChoice, 'managed:managed-1');
    assert.strictEqual(draft.projectId, 'personal');
    assert.strictEqual(draft.projectName, 'Personal');
});

test('settings webview store selects managed instance in existing environment draft', () => {
    const store = createSettingsWebviewStore();
    store.dispatch(actions.environmentDraftOpened({ id: 'env-1', environment: { id: 'env-1', name: 'Dev', environmentTargetId: 'target-1' } }));
    store.dispatch(actions.managedInstanceSelectedForEnvironment({ draftId: 'env-1', instanceId: 'managed-1' }));

    const draft = store.getState().drafts.environment['env-1'];
    assert.strictEqual(draft.instanceChoice, 'managed:managed-1');
    assert.strictEqual(draft.instanceId, 'managed-1');
});

test('settings webview store tracks managed setup job lifecycle', () => {
    const store = createSettingsWebviewStore();
    store.dispatch(actions.jobReceived({ instanceId: 'managed-1', status: 'installing' }));
    store.dispatch(actions.jobReceived({ instanceId: 'managed-1', status: 'failed', error: 'Docker not found' }));

    assert.strictEqual(store.getState().jobs['managed-1'].status, 'failed');
    assert.strictEqual(store.getState().jobs['managed-1'].error, 'Docker not found');
});

test('settings webview store clears credentials when switching modals', () => {
    const store = createSettingsWebviewStore();
    store.dispatch(actions.credentialsReceived({ username: 'owner', password: 'secret' }));
    store.dispatch(actions.modalOpened({ kind: 'environment' }));

    assert.strictEqual(store.getState().ui.credentials, undefined);
});
