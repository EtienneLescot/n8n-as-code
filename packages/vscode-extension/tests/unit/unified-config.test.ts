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
});

test('buildUnifiedWorkspaceConfig removes instanceIdentifier when credentials are incomplete', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-unified-config-'));
    const unifiedPath = path.join(workspaceRoot, 'n8nac-config.json');

    fs.writeFileSync(unifiedPath, JSON.stringify({
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
        projectName: 'Personal'
    });

    assert.strictEqual(unified.instanceIdentifier, undefined);
});

test('buildUnifiedWorkspaceConfig omits empty project fields instead of persisting empty strings', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-unified-config-'));
    const unifiedPath = path.join(workspaceRoot, 'n8nac-config.json');

    fs.writeFileSync(unifiedPath, JSON.stringify({
        host: 'https://etiennel.app.n8n.cloud',
        syncFolder: 'workflows',
        projectId: 'project-1',
        projectName: 'Personal'
    }, null, 2));

    const unified = await buildUnifiedWorkspaceConfig({
        workspaceRoot,
        host: 'https://etiennel.app.n8n.cloud',
        apiKey: 'api-key',
        syncFolder: 'workflows',
        projectId: '',
        projectName: '',
        client: {
            async getCurrentUser() {
                return {
                    email: 'etienne@example.com'
                };
            }
        }
    });

    assert.strictEqual('projectId' in unified, false);
    assert.strictEqual('projectName' in unified, false);
});