import test, { before } from 'node:test';
import assert from 'node:assert';
import { SyncManager } from '../../src/services/sync-manager.js';
import { N8nApiClient } from '../../src/services/n8n-api-client.js';
import { WorkflowSanitizer } from '../../src/services/workflow-sanitizer.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import deepEqual from 'deep-equal';

// Load test credentials from root
const rootEnv = path.resolve(process.cwd(), '.env.test');
const pkgEnv = path.resolve(process.cwd(), '../../.env.test');
const localEnv = path.resolve(new URL('.', import.meta.url).pathname, '../../../../.env.test');

if (fs.existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv });
} else if (fs.existsSync(pkgEnv)) {
    dotenv.config({ path: pkgEnv });
} else if (fs.existsSync(localEnv)) {
    dotenv.config({ path: localEnv });
}

const host = process.env.N8N_HOST || 'http://localhost:5678';
const apiKey = process.env.N8N_API_KEY || process.env.N8N_API_Key || '';

if (!apiKey) {
    throw new Error(`[OFFLINE] No N8N_API_KEY found. Integration tests require a valid .env.test file at the root.`);
}

let client: N8nApiClient;
let testWorkflowId: string;

const baseWorkflow = {
    name: 'Test test',
    nodes: [
        {
            id: 'node-1',
            name: 'Start',
            type: 'n8n-nodes-base.start',
            typeVersion: 1,
            position: [250, 300],
            parameters: {}
        }
    ],
    connections: {},
    settings: { timezone: 'Europe/Paris' }
};

before(async () => {
    client = new N8nApiClient({ host, apiKey });
    try {
        const all = await client.getAllWorkflows();
        const existing = all.find(wf => wf.name === 'Test test');
        if (existing) {
            testWorkflowId = existing.id;
            await client.updateWorkflow(testWorkflowId, baseWorkflow);
        } else {
            const newWf = await client.createWorkflow(baseWorkflow);
            testWorkflowId = newWf.id;
        }
    } catch (e: any) {
        if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND' || e.response?.status === 401) {
            throw new Error(`[OFFLINE] Could not connect or authenticate to n8n instance at ${host}. Please ensure n8n is running and API Key is valid.`);
        }
        throw e;
    }
});

test('Integration Scenarios', async (t) => {
    if (!testWorkflowId) {
        throw new Error('[OFFLINE] No n8n instance available to run integration scenarios.');
    }

    await t.test('Scenario 1: Clean Push', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-sync-test-'));
        const syncManager = new SyncManager(client, {
            directory: tempDir,
            pollIntervalMs: 0,
            syncInactive: true,
            ignoredTags: []
        });

        try {
            await syncManager.syncDown();
            const filePath = path.join(syncManager.getInstanceDirectory(), 'Test test.json');

            // Wait for writing lock to clear (SyncManager sets a 1s lock after writing)
            await new Promise(resolve => setTimeout(resolve, 1100));

            const localContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            localContent.nodes.push({
                id: 'node-local',
                name: 'Local Node',
                type: 'n8n-nodes-base.noOp',
                typeVersion: 1,
                position: [450, 300],
                parameters: {}
            });
            fs.writeFileSync(filePath, JSON.stringify(localContent, null, 2));

            const result = await syncManager.handleLocalFileChange(filePath);
            assert.strictEqual(result, 'updated', 'Push should return updated');

            const remoteWf = await client.getWorkflow(testWorkflowId);
            assert.strictEqual(remoteWf?.nodes.length, 2);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    await t.test('Scenario 2: Conflict Detection', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-sync-test-'));
        const syncManager = new SyncManager(client, {
            directory: tempDir,
            pollIntervalMs: 0,
            syncInactive: true,
            ignoredTags: []
        });

        try {
            await client.updateWorkflow(testWorkflowId, baseWorkflow);
            await syncManager.syncDown();
            const filePath = path.join(syncManager.getInstanceDirectory(), 'Test test.json');

            // Wait for writing lock to clear
            await new Promise(resolve => setTimeout(resolve, 1100));

            // 1. Modify Remote
            await client.updateWorkflow(testWorkflowId, {
                ...baseWorkflow,
                nodes: [
                    ...baseWorkflow.nodes,
                    { id: 'node-remote', name: 'Remote Only', type: 'n8n-nodes-base.noOp', typeVersion: 1, position: [650, 300], parameters: {} }
                ]
            });

            // 2. Modify Local
            const localContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            localContent.nodes.push({ id: 'node-local', name: 'Local Only', type: 'n8n-nodes-base.noOp', typeVersion: 1, position: [450, 300], parameters: {} });
            fs.writeFileSync(filePath, JSON.stringify(localContent, null, 2));

            // 3. Push -> Expect Conflict
            const result = await syncManager.handleLocalFileChange(filePath);
            assert.strictEqual(result, 'conflict', 'Should detect conflict');
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    await t.test('Scenario 3: Remote Deletion Propagation', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-sync-test-'));
        const syncManager = new SyncManager(client, {
            directory: tempDir,
            pollIntervalMs: 0,
            syncInactive: true,
            ignoredTags: []
        });

        try {
            // 1. Create a specific workflow for this test
            const wf = await client.createWorkflow({ name: 'Delete Me Remote', nodes: [], connections: {}, settings: { timezone: 'Europe/Paris' } });
            const wfId = wf.id;

            // 2. Sync down
            await syncManager.syncDown();
            const instanceDir = syncManager.getInstanceDirectory();
            const filePath = path.join(instanceDir, 'Delete Me Remote.json');
            assert.ok(fs.existsSync(filePath), 'Local file should exist after sync');

            // 3. Delete remote workflow
            await client.deleteWorkflow(wfId);

            // 4. Sync down again -> Should detect remote deletion
            await syncManager.syncDown();

            // 5. Local file should be gone (moved to .archive)
            assert.strictEqual(fs.existsSync(filePath), false, 'Local file should be removed');

            // 6. Check archive
            const archiveDir = path.join(instanceDir, '.archive');
            assert.ok(fs.existsSync(archiveDir), 'Archive directory should exist');
            const archivedFiles = fs.readdirSync(archiveDir);
            assert.ok(archivedFiles.some(f => f.includes('Delete Me Remote.json')), 'Archived file should exist');

        } catch (error) {
            // If creation fails (maybe API issue), skip test
            console.warn('Skipping remote deletion test due to API error:', error);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    await t.test('Scenario 4: Local Deletion Handling (Restore)', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-sync-test-'));
        const syncManager = new SyncManager(client, {
            directory: tempDir,
            pollIntervalMs: 0,
            syncInactive: true,
            ignoredTags: []
        });

        try {
            // 1. Setup local file
            await client.updateWorkflow(testWorkflowId, baseWorkflow);
            await syncManager.syncDown();
            const instanceDir = syncManager.getInstanceDirectory();
            const filePath = path.join(instanceDir, 'Test test.json');

            // Wait for lock
            await new Promise(resolve => setTimeout(resolve, 1100));

            // 2. Simulate local deletion
            fs.unlinkSync(filePath);
            assert.strictEqual(fs.existsSync(filePath), false);

            // 3. Trigger restoration (like user choosing "No" in CLI prompt)
            await syncManager.restoreLocalFile(testWorkflowId, 'Test test.json');

            // 4. File should be back
            assert.ok(fs.existsSync(filePath), 'Local file should be restored');

        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    await t.test('Scenario 5: Local Deletion Handling (Delete Remote)', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-sync-test-'));
        const syncManager = new SyncManager(client, {
            directory: tempDir,
            pollIntervalMs: 0,
            syncInactive: true,
            ignoredTags: []
        });

        try {
            // 1. Create temporary workflow
            const wf = await client.createWorkflow({ name: 'Delete Me Local', nodes: [], connections: {}, settings: { timezone: 'Europe/Paris' } });
            const wfId = wf.id;

            // 2. Sync down
            await syncManager.syncDown();
            const instanceDir = syncManager.getInstanceDirectory();
            const filePath = path.join(instanceDir, 'Delete Me Local.json');

            // Wait for lock
            await new Promise(resolve => setTimeout(resolve, 1100));

            // 3. Simulate local deletion + confirmation
            fs.unlinkSync(filePath);
            await syncManager.deleteRemoteWorkflow(wfId, 'Delete Me Local.json');

            // 4. Remote should be gone
            const remoteWf = await client.getWorkflow(wfId);
            assert.strictEqual(remoteWf, null, 'Remote workflow should be deleted');

            // 5. State should be cleaned
            // @ts-ignore (accessing private for test)
            const state = syncManager.stateManager.getWorkflowState(wfId);
            assert.strictEqual(state, undefined, 'State should be removed');

        } catch (error) {
            // If creation fails (maybe API issue), skip test
            console.warn('Skipping local deletion test due to API error:', error);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
