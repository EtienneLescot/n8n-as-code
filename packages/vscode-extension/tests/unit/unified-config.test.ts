import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildUnifiedWorkspaceConfig } from '../../src/utils/unified-config.js';

function writeManagerConfig(instances: any[], activeInstanceId = instances[0]?.id): string {
    const managerHome = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-unified-manager-home-'));
    fs.writeFileSync(path.join(managerHome, 'instances.json'), JSON.stringify({
        version: 1,
        activeInstanceId,
        defaultSyncFolder: 'workflows',
        instances,
    }, null, 2));
    return managerHome;
}

async function withManagerHome<T>(managerHome: string, callback: () => Promise<T> | T): Promise<T> {
    const previous = process.env.N8N_MANAGER_HOME;
    process.env.N8N_MANAGER_HOME = managerHome;
    try {
        return await callback();
    } finally {
        if (previous === undefined) {
            delete process.env.N8N_MANAGER_HOME;
        } else {
            process.env.N8N_MANAGER_HOME = previous;
        }
    }
}

test('buildUnifiedWorkspaceConfig regenerates stale instanceIdentifier from current instance settings', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-unified-config-'));
    const unifiedPath = path.join(workspaceRoot, 'n8nac-config.json');
    const managerHome = writeManagerConfig([{
        id: 'current',
        name: 'Local',
        mode: 'existing',
        baseUrl: 'http://localhost:5678',
        instanceIdentifier: 'local_5678_old_user',
        defaultProject: {
            id: 'project-1',
            name: 'Personal',
        },
    }], 'current');

    fs.writeFileSync(unifiedPath, JSON.stringify({
        version: 3,
        activeInstanceId: 'current',
        syncFolder: 'workflows',
        projectId: 'project-1',
        projectName: 'Personal',
    }, null, 2));

    const unified = await withManagerHome(managerHome, () => buildUnifiedWorkspaceConfig({
        workspaceRoot,
        host: 'https://etiennel.app.n8n.cloud',
        apiKey: 'api-key',
        syncFolder: 'workflows',
        projectId: 'project-1',
        projectName: 'Personal',
        instanceName: 'Cloud',
        client: {
            async getCurrentUser() {
                return {
                    id: 'user-1',
                    email: 'etienne@example.com',
                    firstName: 'Etienne',
                    lastName: 'Lescot'
                };
            }
        }
    }));

    assert.strictEqual(unified.instanceIdentifier, 'n8n_c6c289e49e_etienne_l');
    assert.strictEqual(unified.activeInstanceId, unified.instances[0].id);
    assert.strictEqual(unified.instances[0].name, 'Cloud');
    assert.strictEqual(unified.instances[0].instanceIdentifier, 'n8n_c6c289e49e_etienne_l');
});

test('buildUnifiedWorkspaceConfig clears instanceIdentifier when credentials are incomplete', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-unified-config-'));
    const unifiedPath = path.join(workspaceRoot, 'n8nac-config.json');
    const managerHome = writeManagerConfig([{
        id: 'prod',
        name: 'Production',
        mode: 'existing',
        baseUrl: 'https://etiennel.app.n8n.cloud',
        instanceIdentifier: 'etiennel_cloud_etienne_l',
        defaultProject: {
            id: 'project-1',
            name: 'Personal',
        },
    }], 'prod');

    fs.writeFileSync(unifiedPath, JSON.stringify({
        version: 3,
        activeInstanceId: 'prod',
        syncFolder: 'workflows',
        projectId: 'project-1',
        projectName: 'Personal',
    }, null, 2));

    const unified = await withManagerHome(managerHome, () => buildUnifiedWorkspaceConfig({
        workspaceRoot,
        host: '',
        apiKey: '',
        syncFolder: 'workflows',
        projectId: 'project-1',
        projectName: 'Personal',
        instanceId: 'prod',
        instanceName: 'Production'
    }));

    assert.strictEqual(unified.instanceIdentifier, undefined);
    assert.strictEqual(unified.instances[0].instanceIdentifier, undefined);
});

test('buildUnifiedWorkspaceConfig preserves global instances while updating the active profile', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-unified-config-'));
    const unifiedPath = path.join(workspaceRoot, 'n8nac-config.json');
    const managerHome = writeManagerConfig([
        {
            id: 'test',
            name: 'Test',
            mode: 'existing',
            baseUrl: 'https://test.example.com',
            defaultProject: {
                id: 'project-test',
                name: 'Test',
            },
        },
        {
            id: 'prod',
            name: 'Production',
            mode: 'existing',
            baseUrl: 'https://prod.example.com',
            defaultProject: {
                id: 'project-prod',
                name: 'Production',
            },
        }
    ], 'prod');

    fs.writeFileSync(unifiedPath, JSON.stringify({
        version: 3,
        activeInstanceId: 'prod',
        syncFolder: 'workflows-prod',
        projectId: 'project-prod',
        projectName: 'Production'
    }, null, 2));

    const unified = await withManagerHome(managerHome, () => buildUnifiedWorkspaceConfig({
        workspaceRoot,
        host: 'https://prod.example.com',
        apiKey: 'api-key',
        syncFolder: 'n8n/workflows',
        projectId: '',
        projectName: '',
        instanceId: 'prod',
        instanceName: 'Production',
        client: {
            async getCurrentUser() {
                return {
                    email: 'etienne@example.com'
                };
            }
        }
    }));

    assert.strictEqual(unified.instances.length, 2);
    assert.strictEqual(unified.syncFolder, 'n8n/workflows');
    assert.strictEqual(unified.projectId, undefined);
    assert.strictEqual(unified.projectName, undefined);
});
