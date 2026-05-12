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

test('settings webview store ignores stale snapshots by state version', () => {
    const store = createSettingsWebviewStore();
    store.dispatch(actions.snapshotReceived({ type: 'init', stateVersion: 2, workspace: { activeEnvironmentId: 'env-2' }, global: { instances: [] } }));
    store.dispatch(actions.snapshotReceived({ type: 'init', stateVersion: 1, workspace: { activeEnvironmentId: 'env-1' }, global: { instances: [] } }));

    assert.strictEqual(store.getState().server.workspace.activeEnvironmentId, 'env-2');
});

test('settings webview store keeps pending active environment until matching snapshot arrives', () => {
    const store = createSettingsWebviewStore();
    store.dispatch(actions.snapshotReceived({ type: 'init', stateVersion: 1, workspace: { activeEnvironmentId: 'env-1' }, global: { instances: [] } }));
    store.dispatch(actions.environmentActivationRequested('env-3'));
    store.dispatch(actions.snapshotReceived({ type: 'init', stateVersion: 2, workspace: { activeEnvironmentId: 'env-2' }, global: { instances: [] } }));

    assert.strictEqual(store.getState().ui.pendingActiveEnvironmentId, 'env-3');

    store.dispatch(actions.snapshotReceived({ type: 'init', stateVersion: 3, workspace: { activeEnvironmentId: 'env-3' }, global: { instances: [] } }));

    assert.strictEqual(store.getState().ui.pendingActiveEnvironmentId, undefined);
    assert.strictEqual(store.getState().server.workspace.activeEnvironmentId, 'env-3');
});

test('settings webview store clears pending active environment on errors', () => {
    const store = createSettingsWebviewStore();
    store.dispatch(actions.environmentActivationRequested('env-2'));
    store.dispatch(actions.noticeShown({ tone: 'error', message: 'Pin failed' }));

    assert.strictEqual(store.getState().ui.pendingActiveEnvironmentId, undefined);
});

test('settings webview store clears pending active environment when it disappears', () => {
    const store = createSettingsWebviewStore();
    store.dispatch(actions.environmentActivationRequested('env-2'));
    store.dispatch(actions.snapshotReceived({
        type: 'init',
        stateVersion: 1,
        workspace: { activeEnvironmentId: 'env-1', environments: [{ id: 'env-1' }] },
        global: { instances: [] },
    }));

    assert.strictEqual(store.getState().ui.pendingActiveEnvironmentId, undefined);
});

test('settings webview store ignores stale project load errors', () => {
    const store = createSettingsWebviewStore();
    store.dispatch(actions.environmentDraftOpened({ id: 'new' }));
    store.dispatch(actions.environmentDraftProjectsLoading({ id: 'new', requestKey: 'new-request' }));
    store.dispatch(actions.environmentDraftProjectsReceived({ id: 'new', requestKey: 'old-request', error: 'Old failure' }));

    const draft = store.getState().drafts.environment.new;
    assert.strictEqual(draft.projectsLoading, true);
    assert.strictEqual(draft.projectError, undefined);
});

test('settings webview store applies optimistic environment deletion', () => {
    const store = createSettingsWebviewStore();
    store.dispatch(actions.snapshotReceived({
        type: 'init',
        stateVersion: 1,
        workspace: { activeEnvironmentId: 'env-2', environments: [{ id: 'env-1' }, { id: 'env-2' }] },
        global: { instances: [] },
    }));
    store.dispatch(actions.environmentDeleted('env-2'));

    assert.deepStrictEqual(store.getState().server.workspace.environments.map((environment: any) => environment.id), ['env-1']);
    assert.strictEqual(store.getState().server.workspace.activeEnvironmentId, '');
});

test('settings webview store applies optimistic environment pin', () => {
    const store = createSettingsWebviewStore();
    store.dispatch(actions.snapshotReceived({
        type: 'init',
        stateVersion: 1,
        workspace: { activeEnvironmentId: 'env-1', environments: [{ id: 'env-1' }, { id: 'env-2' }] },
        global: { instances: [] },
    }));
    store.dispatch(actions.environmentActivationRequested('env-2'));
    store.dispatch(actions.environmentPinned('env-2'));

    assert.strictEqual(store.getState().server.workspace.activeEnvironmentId, 'env-2');
    assert.strictEqual(store.getState().ui.pendingActiveEnvironmentId, undefined);
});

test('settings webview store applies optimistic environment save', () => {
    const store = createSettingsWebviewStore();
    store.dispatch(actions.snapshotReceived({
        type: 'init',
        stateVersion: 1,
        workspace: { activeEnvironmentId: '', environments: [] },
        global: { instances: [] },
    }));
    store.dispatch(actions.environmentSaved({ id: 'dev', name: 'Dev', environmentTargetId: 'managed', syncFolder: 'workflows' }));

    assert.strictEqual(store.getState().server.workspace.activeEnvironmentId, 'dev');
    assert.deepStrictEqual(store.getState().server.workspace.environments.map((environment: any) => environment.id), ['dev']);
});

test('settings webview store clears pending environment save on success and error', () => {
    const store = createSettingsWebviewStore();
    store.dispatch(actions.snapshotReceived({
        type: 'init',
        stateVersion: 1,
        workspace: { activeEnvironmentId: '', environments: [] },
        global: { instances: [] },
    }));
    store.dispatch(actions.environmentSaveRequested('new'));
    assert.strictEqual(store.getState().ui.pendingEnvironmentSaves.new, true);

    store.dispatch(actions.environmentSaved({ id: 'dev', name: 'Dev', environmentTargetId: 'managed', syncFolder: 'workflows/dev' }));
    assert.strictEqual(store.getState().ui.pendingEnvironmentSaves.new, undefined);

    store.dispatch(actions.environmentSaveRequested('new'));
    store.dispatch(actions.noticeShown({ tone: 'error', message: 'Invalid config' }));
    assert.deepStrictEqual(store.getState().ui.pendingEnvironmentSaves, {});
});

test('settings webview store removes deleted instance and closes its detail modal', () => {
    const store = createSettingsWebviewStore();
    store.dispatch(actions.snapshotReceived({
        type: 'init',
        stateVersion: 1,
        workspace: { environments: [] },
        global: { instances: [{ id: 'managed-dev', mode: 'managed-local-docker' }] },
    }));
    store.dispatch(actions.modalOpened({ kind: 'managed-detail', instanceId: 'managed-dev' }));
    store.dispatch(actions.instanceDeleted('managed-dev'));

    assert.deepStrictEqual(store.getState().server.global.instances, []);
    assert.strictEqual(store.getState().ui.modal, undefined);
});
