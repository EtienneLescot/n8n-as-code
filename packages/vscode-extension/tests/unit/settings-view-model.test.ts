import test from 'node:test';
import assert from 'node:assert';

import { buildEnvironmentInstanceChoices, environmentManagedInstanceStatus, instanceDisplayType, managedInstanceUiStatus } from '../../src/ui/settings-view-model.js';

test('settings view model normalizes managed and connected instance labels', () => {
    assert.strictEqual(instanceDisplayType({ mode: 'managed-local-docker' }), 'managed instance');
    assert.strictEqual(instanceDisplayType({ mode: 'existing' }), 'connected instance');
});

test('settings view model orders create choices before deduped saved instances', () => {
    const choices = buildEnvironmentInstanceChoices([
        { id: 'target-managed', name: 'Local', kind: 'managed-instance', managedInstanceId: 'managed-1' },
        { id: 'target-cloud', name: 'Dev cloud', kind: 'external-instance', url: 'https://dev.example.com/' },
    ], [
        { id: 'managed-1', name: 'managed', mode: 'managed-local-docker' },
        { id: 'cloud', name: 'Dev cloud duplicate', mode: 'existing', host: 'https://dev.example.com' },
    ]);

    assert.deepStrictEqual(choices.slice(0, 2).map((choice) => choice.label), ['New connected instance', 'New managed instance']);
    assert.ok(choices.some((choice) => choice.label === 'Local - managed instance'));
    assert.strictEqual(choices.filter((choice) => choice.mode === 'connected').length, 1);
    assert.ok(!choices.some((choice) => choice.label.includes('existing')));
});

test('settings view model prefers setup job status for managed instances', () => {
    const status = managedInstanceUiStatus({ id: 'managed-1', mode: 'managed-local-docker', runtimeStatus: 'ready', displayUrl: 'http://localhost:5678' }, {
        instanceId: 'managed-1',
        status: 'installing',
    });

    assert.strictEqual(status.label, 'Installing');
    assert.strictEqual(status.canCreateEnvironment, true);
    assert.strictEqual(status.canCancel, true);
});

test('settings view model reuses managed status for environment badges', () => {
    const status = environmentManagedInstanceStatus(
        { id: 'env', name: 'Dev', managedInstanceId: 'managed-1' },
        undefined,
        [{ id: 'managed-1', mode: 'managed-local-docker', runtimeStatus: 'stopped' }],
        {},
    );

    assert.strictEqual(status?.label, 'Stopped');
});
