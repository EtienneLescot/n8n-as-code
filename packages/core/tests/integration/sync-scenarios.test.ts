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
dotenv.config({ path: path.join(process.cwd(), '.env.test') });

const host = process.env.N8N_HOST || 'http://localhost:5678';
const apiKey = process.env.N8N_API_KEY || '';

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
    if (!apiKey) return;
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
    } catch (e) {
        throw e;
    }
});

test('Integration Scenarios', async (t) => {
    if (!testWorkflowId) return;

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
});
