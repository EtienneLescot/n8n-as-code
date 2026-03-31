import test from 'node:test';
import assert from 'node:assert';

import { buildConfigurationInitState } from '../../src/ui/configuration-state.js';

function normalizeHost(host: string): string {
    return host.endsWith('/') ? host.slice(0, -1) : host;
}

test('buildConfigurationInitState prefers the active instance config and config-scoped api key', () => {
    const state = buildConfigurationInitState({
        workspaceConfig: {
            activeInstanceId: 'prod',
            instances: [
                {
                    id: 'prod',
                    name: 'Production',
                    host: 'https://prod.example.com/',
                    syncFolder: 'workflows',
                    projectId: 'project-1',
                    projectName: 'Production',
                },
            ],
        },
        activeInstance: {
            id: 'prod',
            name: 'Production',
            host: 'https://prod.example.com/',
            syncFolder: 'workflows',
            projectId: 'project-1',
            projectName: 'Production',
        },
        resolved: {
            activeInstanceId: 'prod',
            activeInstanceName: 'Production',
            host: 'https://legacy.example.com',
            apiKey: 'legacy-key',
            projectId: 'legacy-project',
            projectName: 'Legacy',
            syncFolder: 'legacy-workflows',
        },
        getApiKey: (host, instanceId) => {
            assert.strictEqual(host, 'https://prod.example.com/');
            assert.strictEqual(instanceId, 'prod');
            return 'config-key';
        },
        normalizeHost,
    });

    assert.strictEqual(state.activeInstanceId, 'prod');
    assert.strictEqual(state.config.instanceId, 'prod');
    assert.strictEqual(state.config.host, 'https://prod.example.com');
    assert.strictEqual(state.config.apiKey, 'config-key');
    assert.strictEqual(state.instances[0].apiKey, 'config-key');
});

test('buildConfigurationInitState falls back to resolved config when no active instance is available', () => {
    const state = buildConfigurationInitState({
        workspaceConfig: {
            activeInstanceId: undefined,
            instances: [],
        },
        activeInstance: undefined,
        resolved: {
            activeInstanceId: '',
            activeInstanceName: '',
            host: 'https://test.example.com/',
            apiKey: 'resolved-key',
            projectId: 'project-2',
            projectName: 'Personal',
            syncFolder: 'n8n/workflows',
        },
        getApiKey: () => undefined,
        normalizeHost,
    });

    assert.strictEqual(state.activeInstanceId, '');
    assert.strictEqual(state.activeInstanceName, '');
    assert.strictEqual(state.config.host, 'https://test.example.com');
    assert.strictEqual(state.config.apiKey, 'resolved-key');
    assert.strictEqual(state.config.projectName, 'Personal');
    assert.deepStrictEqual(state.instances, []);
});
