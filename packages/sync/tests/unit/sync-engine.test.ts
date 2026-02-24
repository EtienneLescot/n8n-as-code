import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SyncEngine } from '../../src/services/sync-engine.js';
import { Watcher } from '../../src/services/watcher.js';
import { WorkflowSyncStatus } from '../../src/types.js';

test('SyncEngine: Optimistic Concurrency Control (OCC)', async (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-engine-occ-'));
    
    try {
        // Create a dummy workflow file
        const workflowId = 'wf-1';
        const filename = 'Test.workflow.ts';
        const filePath = path.join(tempDir, filename);
        
        fs.writeFileSync(filePath, `
import { workflow, node } from '@n8n-as-code/transformer';

@workflow({
    name: 'Test Workflow',
    connections: {}
})
export class TestWorkflow {
    id = '${workflowId}';
    
    @node({
        name: 'When clicking "Execute Workflow"',
        type: 'n8n-nodes-base.manualTrigger',
        version: 1,
        position: [0, 0]
    })
    manualTrigger = {
        parameters: {}
    };
}
        `, 'utf-8');

        // Mock N8nApiClient
        const mockClient = {
            getWorkflow: async (id: string) => {
                if (id === workflowId) {
                    return {
                        id: workflowId,
                        name: 'Test Workflow',
                        updatedAt: '2026-02-24T12:00:00.000Z', // Remote is newer
                        nodes: [],
                        connections: {}
                    };
                }
                return null;
            },
            updateWorkflow: async () => {
                return { id: workflowId, updatedAt: '2026-02-24T12:05:00.000Z' };
            }
        } as any;

        // Mock Watcher
        const mockWatcher = {
            getLastSyncedAt: (id: string) => {
                if (id === workflowId) {
                    return '2026-02-24T10:00:00.000Z'; // Local is older
                }
                return undefined;
            },
            markSyncInProgress: () => {},
            markSyncComplete: () => {},
            pauseObservation: () => {},
            resumeObservation: () => {},
            finalizeSync: async () => {},
            setRemoteHash: () => {}
        } as unknown as Watcher;

        const syncEngine = new SyncEngine(mockClient, mockWatcher, tempDir);

        // Attempt to push
        let errorThrown = false;
        try {
            await syncEngine.push(filename, workflowId, WorkflowSyncStatus.MODIFIED_LOCALLY);
        } catch (error: any) {
            errorThrown = true;
            assert.match(error.message, /Push rejected for "Test.workflow.ts"/);
            assert.match(error.message, /modified in the n8n UI/);
        }

        assert.strictEqual(errorThrown, true, 'Should throw OCC conflict error');

    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('SyncEngine: OCC allows push if remote is older or equal', async (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-engine-occ-2-'));
    
    try {
        const workflowId = 'wf-2';
        const filename = 'Test2.workflow.ts';
        const filePath = path.join(tempDir, filename);
        
        fs.writeFileSync(filePath, `
import { workflow, node } from '@n8n-as-code/transformer';

@workflow({
    name: 'Test Workflow 2',
    connections: {}
})
export class TestWorkflow2 {
    id = '${workflowId}';
    
    @node({
        name: 'When clicking "Execute Workflow"',
        type: 'n8n-nodes-base.manualTrigger',
        version: 1,
        position: [0, 0]
    })
    manualTrigger = {
        parameters: {}
    };
}
        `, 'utf-8');

        let updateCalled = false;

        const mockClient = {
            getWorkflow: async (id: string) => {
                if (id === workflowId) {
                    return {
                        id: workflowId,
                        name: 'Test Workflow 2',
                        updatedAt: '2026-02-24T10:00:00.000Z', // Remote is same as local
                        nodes: [
                            {
                                parameters: {},
                                id: 'node-1',
                                name: 'When clicking "Execute Workflow"',
                                type: 'n8n-nodes-base.manualTrigger',
                                typeVersion: 1,
                                position: [0, 0]
                            }
                        ],
                        connections: {}
                    };
                }
                return null;
            },
            updateWorkflow: async () => {
                updateCalled = true;
                return { 
                    id: workflowId,
                    name: 'Test Workflow 2',
                    updatedAt: '2026-02-24T12:05:00.000Z',
                    nodes: [
                        {
                            parameters: {},
                            id: 'node-1',
                            name: 'When clicking Execute Workflow',
                            type: 'n8n-nodes-base.manualTrigger',
                            typeVersion: 1,
                            position: [0, 0]
                        }
                    ],
                    connections: {}
                };
            }
        } as any;

        const mockWatcher = {
            getLastSyncedAt: (id: string) => {
                if (id === workflowId) {
                    return '2026-02-24T10:00:00.000Z'; // Local is same
                }
                return undefined;
            },
            markSyncInProgress: () => {},
            markSyncComplete: () => {},
            pauseObservation: () => {},
            resumeObservation: () => {},
            finalizeSync: async () => {},
            setRemoteHash: () => {}
        } as unknown as Watcher;

        const syncEngine = new SyncEngine(mockClient, mockWatcher, tempDir);

        // Attempt to push
        await syncEngine.push(filename, workflowId, WorkflowSyncStatus.MODIFIED_LOCALLY);

        assert.strictEqual(updateCalled, true, 'Should call updateWorkflow when OCC passes');

    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
