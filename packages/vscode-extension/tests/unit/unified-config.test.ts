import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildUnifiedWorkspaceConfig } from '../../src/utils/unified-config.js';

test('buildUnifiedWorkspaceConfig regenerates stale instanceIdentifier from current instance settings', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-unified-config-'));
    const unifiedPath = path.join(workspaceRoot, 'n8nac-config.json');

    fs.writeFileSync(unifiedPath, JSON.stringify({
        host: 'http://localhost:5678',
        syncFolder: 'workflows',
        projectId: 'project-1',
        projectName: 'Personal',
        instanceIdentifier: 'local_5678_old_user'
    }, null, 2));

    const unified = await buildUnifiedWorkspaceConfig({
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
                    email: 'etienne@example.com',
                    firstName: 'Etienne',
                    lastName: 'Lescot'
                };
            }
        }
    });

    assert.strictEqual(unified.instanceIdentifier, 'etiennel_cloud_etienne_l');
    assert.strictEqual(unified.activeInstanceId, unified.instances[0].id);
    assert.strictEqual(unified.instances[0].name, 'Cloud');
    assert.strictEqual(unified.instances[0].instanceIdentifier, 'etiennel_cloud_etienne_l');
});

test('buildUnifiedWorkspaceConfig clears instanceIdentifier when credentials are incomplete', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-unified-config-'));
    const unifiedPath = path.join(workspaceRoot, 'n8nac-config.json');

    fs.writeFileSync(unifiedPath, JSON.stringify({
        version: 2,
        activeInstanceId: 'prod',
        instances: [
            {
                id: 'prod',
                name: 'Production',
                host: 'https://etiennel.app.n8n.cloud',
                syncFolder: 'workflows',
                projectId: 'project-1',
                projectName: 'Personal',
                instanceIdentifier: 'etiennel_cloud_etienne_l'
            }
        ],
        host: 'https://etiennel.app.n8n.cloud',
        syncFolder: 'workflows',
        projectId: 'project-1',
        projectName: 'Personal',
        instanceIdentifier: 'etiennel_cloud_etienne_l'
    }, null, 2));

    const unified = await buildUnifiedWorkspaceConfig({
        workspaceRoot,
        host: '',
        apiKey: '',
        syncFolder: 'workflows',
        projectId: 'project-1',
        projectName: 'Personal',
        instanceId: 'prod',
        instanceName: 'Production'
    });

    assert.strictEqual(unified.instanceIdentifier, undefined);
    assert.strictEqual(unified.instances[0].instanceIdentifier, undefined);
});

test('buildUnifiedWorkspaceConfig preserves the instance library while updating the active profile', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-unified-config-'));
    const unifiedPath = path.join(workspaceRoot, 'n8nac-config.json');

    fs.writeFileSync(unifiedPath, JSON.stringify({
        version: 2,
        activeInstanceId: 'prod',
        instances: [
            {
                id: 'test',
                name: 'Test',
                host: 'https://test.example.com',
                syncFolder: 'workflows-test',
                projectId: 'project-test',
                projectName: 'Test'
            },
            {
                id: 'prod',
                name: 'Production',
                host: 'https://prod.example.com',
                syncFolder: 'workflows-prod',
                projectId: 'project-prod',
                projectName: 'Production'
            }
        ],
        host: 'https://prod.example.com',
        syncFolder: 'workflows-prod',
        projectId: 'project-prod',
        projectName: 'Production'
    }, null, 2));

    const unified = await buildUnifiedWorkspaceConfig({
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
    });

    assert.strictEqual(unified.instances.length, 2);
    assert.strictEqual(unified.syncFolder, 'n8n/workflows');
    assert.strictEqual(unified.projectId, undefined);
    assert.strictEqual(unified.projectName, undefined);
});
