import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadProjectsForConfigurationWebview } from '../../src/ui/configuration-webview-projects.js';

test('loadProjects resolves managed environment targets before stale host payloads', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-webview-projects-'));
    fs.writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
        version: 4,
        activeEnvironmentId: 'y1-env',
        environmentTargets: [{
            id: 'y1',
            name: 'Y1',
            kind: 'managed-instance',
            managedInstanceId: 'n8n-manager-y1-adad2306',
        }],
        environments: [{
            id: 'y1-env',
            name: 'Y1',
            environmentTargetId: 'y1',
            syncFolder: 'workflows/y1',
        }],
    }, null, 2));

    const workspaceCalls: unknown[] = [];
    const globalCalls: unknown[] = [];
    const workspaceFacade = {
        async listProjects(input: unknown) {
            workspaceCalls.push(input);
            return [{ id: 'workspace-project', name: 'Workspace Project' }];
        },
    };
    const globalFacade = {
        async listProjects(input: unknown) {
            globalCalls.push(input);
            return [{ id: 'personal', name: 'Personal', type: 'personal' }];
        },
    };

    const message = await loadProjectsForConfigurationWebview({
        type: 'loadProjects',
        scope: 'environment',
        requestId: 7,
        environmentTargetId: 'y1',
        host: 'http://127.0.0.1:5678',
        apiKey: '',
    }, {
        workspaceRoot,
        workspaceFacade,
        globalFacade,
    });

    assert.deepStrictEqual(workspaceCalls, []);
    assert.strictEqual(globalCalls.length, 1);
    assert.deepStrictEqual(globalCalls[0], {
        workspaceRoot: undefined,
        instanceId: 'n8n-manager-y1-adad2306',
        syncFolderDefault: 'workspace',
        consumer: 'vscode',
        autoStart: true,
    });
    assert.strictEqual(message.type, 'projectsLoaded');
    assert.strictEqual(message.scope, 'environment');
    assert.strictEqual(message.requestId, 7);
    assert.deepStrictEqual(message.projects.map((project) => project.id), ['personal']);
});

test('loadProjects keeps distinct personal projects selectable', async () => {
    const workspaceFacade = {
        async listProjects() {
            return [
                { id: 'project-alice', name: 'Alice', type: 'personal' },
                { id: 'project-bob', name: 'Bob', type: 'personal' },
            ];
        },
    };
    const globalFacade = {
        async listProjects() {
            return [];
        },
    };

    const message = await loadProjectsForConfigurationWebview({
        type: 'loadProjects',
        scope: 'workspace',
        requestId: 8,
    }, {
        workspaceFacade,
        globalFacade,
    });

    assert.deepStrictEqual(message.projects.map((project) => project.id), ['project-alice', 'project-bob']);
    assert.deepStrictEqual(message.projects.map((project) => project.name), ['Personal', 'Personal']);
    assert.deepStrictEqual(message.projects.map((project) => project.displayName), ['Personal - Alice', 'Personal - Bob']);
});
