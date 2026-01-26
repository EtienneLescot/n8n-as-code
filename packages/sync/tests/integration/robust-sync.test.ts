import test, { before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import { SyncManager } from '../../src/services/sync-manager.js';
import { N8nApiClient } from '../../src/services/n8n-api-client.js';
import { WorkflowSyncStatus } from '../../src/types.js';

/**
 * Robust Synchronization Integration Tests
 * 
 * This suite replaces the legacy end-to-end tests. It follows the 3-way merge 
 * specification and covers real-world robustness scenarios.
 */

// Load test credentials
const envPaths = [
    path.resolve(process.cwd(), '.env.test'),
    path.resolve(process.cwd(), '../../.env.test'),
    path.resolve(new URL('.', import.meta.url).pathname, '../../../../.env.test')
];

for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        break;
    }
}

const host = process.env.N8N_HOST || 'http://localhost:5678';
const apiKey = process.env.N8N_API_KEY || '';

if (!apiKey) {
    console.error('[ERROR] N8N_API_KEY not found. Integration tests require a valid .env.test file.');
}

const TEST_WORKFLOW_NAME = 'Robust E2E Test Workflow';

test('Robust Integration Suite', { skip: !apiKey }, async (t) => {
    let client: N8nApiClient;
    let tempDir: string;
    let syncManager: SyncManager;

    before(async () => {
        client = new N8nApiClient({ host, apiKey });
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-robust-suite-'));
        
        // Cleanup
        try {
            const all = await client.getAllWorkflows();
            for (const wf of all) {
                if (wf.name === TEST_WORKFLOW_NAME) {
                    await client.deleteWorkflow(wf.id);
                }
            }
        } catch (e) {}
    });

    after(async () => {
        if (syncManager) {
            syncManager.stopWatch();
            await (syncManager as any).watcher?.watcher?.close();
        }
        if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    });

    await t.test('1. PULL Strategy - EXIST_ONLY_REMOTELY', async () => {
        syncManager = new SyncManager(client, {
            directory: tempDir,
            pollIntervalMs: 0,
            syncInactive: true,
            ignoredTags: [],
            instanceIdentifier: 'e2e-test'
        });

        await syncManager.startWatch();

        // Create remote
        const wf = await client.createWorkflow({
            name: TEST_WORKFLOW_NAME,
            nodes: [],
            connections: {},
            settings: { timezone: 'Europe/Paris' }
        });

        await syncManager.refreshState();
        let statuses = await syncManager.getWorkflowsStatus();
        let status = statuses.find(s => s.id === wf.id);
        assert.strictEqual(status?.status, WorkflowSyncStatus.EXIST_ONLY_REMOTELY);

        // Pull
        await syncManager.syncDown();
        
        const filePath = path.join(syncManager.getInstanceDirectory(), `${TEST_WORKFLOW_NAME}.json`);
        assert.ok(fs.existsSync(filePath), 'File should be downloaded');
        
        await syncManager.refreshState();
        statuses = await syncManager.getWorkflowsStatus();
        assert.strictEqual(statuses.find(s => s.id === wf.id)?.status, WorkflowSyncStatus.IN_SYNC);
    });

    await t.test('2. PUSH Strategy - MODIFIED_LOCALLY', async () => {
        const instanceDir = syncManager.getInstanceDirectory();
        const filePath = path.join(instanceDir, `${TEST_WORKFLOW_NAME}.json`);
        
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        content.nodes = [{ id: '1', name: 'New Node', type: 'n8n-nodes-base.noOp', typeVersion: 1, position: [0,0], parameters: {} }];
        content.connections = {};
        content.settings = { timezone: 'Europe/Paris' };
        
        // Wait to ensure timestamp change
        await new Promise(resolve => setTimeout(resolve, 1100));
        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));

        await syncManager.refreshState();
        const statuses = await syncManager.getWorkflowsStatus();
        const testWf = statuses.find(s => s.name === TEST_WORKFLOW_NAME);
        assert.strictEqual(testWf?.status, WorkflowSyncStatus.MODIFIED_LOCALLY);

        // Push
        await syncManager.syncUp();

        const remoteWf = await client.getWorkflow(testWf!.id);
        assert.strictEqual(remoteWf!.nodes[0].name, 'New Node');
        
        await syncManager.refreshState();
        const finalStatuses = await syncManager.getWorkflowsStatus();
        assert.strictEqual(finalStatuses.find(s => s.id === testWf!.id)?.status, WorkflowSyncStatus.IN_SYNC);
    });

    await t.test('3. CONFLICT - Detection and KEEP_REMOTE', async () => {
        const statuses = await syncManager.getWorkflowsStatus();
        const testWf = statuses.find(s => s.name === TEST_WORKFLOW_NAME);
        const instanceDir = syncManager.getInstanceDirectory();
        const filePath = path.join(instanceDir, `${TEST_WORKFLOW_NAME}.json`);

        await new Promise(resolve => setTimeout(resolve, 1100));

        // Modify remote
        await client.updateWorkflow(testWf!.id, {
            name: TEST_WORKFLOW_NAME,
            nodes: [{ id: '1', name: 'Remote', type: 'n8n-nodes-base.noOp', typeVersion: 1, position: [0,0], parameters: {} }],
            connections: {},
            settings: { timezone: 'Europe/Paris' }
        });

        // Modify local
        const localContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        localContent.nodes = [{ id: '1', name: 'Local', type: 'n8n-nodes-base.noOp', typeVersion: 1, position: [0,0], parameters: {} }];
        fs.writeFileSync(filePath, JSON.stringify(localContent, null, 2));

        await syncManager.refreshState();
        const statusesConflict = await syncManager.getWorkflowsStatus();
        assert.strictEqual(statusesConflict.find(s => s.id === testWf!.id)?.status, WorkflowSyncStatus.CONFLICT);

        // Resolve KEEP_REMOTE
        await syncManager.resolveConflict(testWf!.id, `${TEST_WORKFLOW_NAME}.json`, 'remote');

        const updatedLocal = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        assert.strictEqual(updatedLocal.nodes[0].name, 'Remote', 'Local should be overwritten by remote content');
        
        await syncManager.refreshState();
        assert.strictEqual((await syncManager.getWorkflowsStatus()).find(s => s.id === testWf!.id)?.status, WorkflowSyncStatus.IN_SYNC);
    });

    await t.test('4. DELETED_LOCALLY - Detection and Restore', async () => {
        const statuses = await syncManager.getWorkflowsStatus();
        const testWf = statuses.find(s => s.name === TEST_WORKFLOW_NAME);
        const instanceDir = syncManager.getInstanceDirectory();
        const filePath = path.join(instanceDir, `${TEST_WORKFLOW_NAME}.json`);

        // Delete local
        fs.unlinkSync(filePath);

        await syncManager.refreshState();
        assert.strictEqual((await syncManager.getWorkflowsStatus()).find(s => s.id === testWf!.id)?.status, WorkflowSyncStatus.DELETED_LOCALLY);

        // Restore (using force pull since archive might not have settled in test)
        await syncManager.resolveConflict(testWf!.id, `${TEST_WORKFLOW_NAME}.json`, 'remote');

        assert.ok(fs.existsSync(filePath), 'File should be restored');
        await syncManager.refreshState();
        assert.strictEqual((await syncManager.getWorkflowsStatus()).find(s => s.id === testWf!.id)?.status, WorkflowSyncStatus.IN_SYNC);
    });

    await t.test('5. DELETED_REMOTELY - Detection and Confirm', async () => {
        // Ensure state is clean for this test
        await syncManager.refreshState();
        const statuses = await syncManager.getWorkflowsStatus();
        const testWf = statuses.find(s => s.name === TEST_WORKFLOW_NAME);
        assert.ok(testWf, 'Workflow should exist');
        
        const instanceDir = syncManager.getInstanceDirectory();
        const filePath = path.join(instanceDir, `${TEST_WORKFLOW_NAME}.json`);

        // 1. Delete remote
        await client.deleteWorkflow(testWf.id);

        // 2. Verify DELETED_REMOTELY
        // Note: We use a small delay to ensure hashes are calculated correctly
        await new Promise(resolve => setTimeout(resolve, 500));
        await syncManager.refreshState();
        
        const statusObj = (await syncManager.getWorkflowsStatus()).find(s => s.id === testWf.id);
        assert.strictEqual(statusObj?.status, WorkflowSyncStatus.DELETED_REMOTELY);

        // 3. Confirm (should archive local and remove from state)
        await syncManager.confirmDeletion(testWf.id, `${TEST_WORKFLOW_NAME}.json`);

        assert.ok(!fs.existsSync(filePath), 'Local file should be removed');
        await syncManager.refreshState();
        assert.ok(!(await syncManager.getWorkflowsStatus()).find(s => s.id === testWf.id), 'Should be removed from list');
    });
});
