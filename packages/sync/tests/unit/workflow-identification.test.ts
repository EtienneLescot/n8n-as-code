import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Watcher } from '../../src/services/watcher.js';
import { WorkflowSyncStatus } from '../../src/types.js';

/**
 * Test suite for workflow identification improvements
 * Tests the fix for issues with filename vs workflow.name vs workflow.id
 */

test('Case 1: Filename != workflow.name - should correctly identify workflow', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-test-'));
    
    try {
        // Create local file with mismatched filename and name
        const filename = 'Toto.json';
        const workflow = {
            id: '123',
            name: 'tutu',
            active: true,
            nodes: [],
            connections: {}
        };
        
        fs.writeFileSync(
            path.join(testDir, filename),
            JSON.stringify(workflow, null, 2)
        );

        // Mock N8nApiClient
        const mockClient = {
            getAllWorkflows: async () => [
                { id: '123', name: 'tutu', active: true, updatedAt: '2024-01-01T00:00:00.000Z' }
            ],
            getWorkflow: async (id: string) => workflow,
            createWorkflow: async () => ({}),
            updateWorkflow: async () => ({}),
            deleteWorkflow: async () => {}
        };

        const watcher = new Watcher(mockClient as any, {
            directory: testDir,
            pollIntervalMs: 0,
            syncInactive: true,
            ignoredTags: []
        });

        await watcher.start();
        await watcher.refreshLocalState();
        await watcher.refreshRemoteState();

        const statuses = watcher.getStatusMatrix();
        
        // Should find the workflow by ID, not by name
        const foundWorkflow = statuses.find(s => s.id === '123');
        assert.ok(foundWorkflow, 'Workflow should be found');
        assert.strictEqual(foundWorkflow?.filename, 'Toto.json', 'Should use actual filename, not generate from name');
        
        watcher.stop();
    } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
    }
});

test('Case 2: Workflow created without ID - should detect as EXIST_ONLY_LOCALLY', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-test-'));
    
    try {
        // Create local file WITHOUT id (as AI would do)
        const filename = 'NewWorkflow.json';
        const workflowWithoutId = {
            name: 'NewWorkflow',
            active: true,
            nodes: [],
            connections: {}
        };
        
        fs.writeFileSync(
            path.join(testDir, filename),
            JSON.stringify(workflowWithoutId, null, 2)
        );

        // Mock N8nApiClient - no remote workflows
        const mockClient = {
            getAllWorkflows: async () => [],
            getWorkflow: async (id: string) => null,
            createWorkflow: async () => ({}),
            updateWorkflow: async () => ({}),
            deleteWorkflow: async () => {}
        };

        const watcher = new Watcher(mockClient as any, {
            directory: testDir,
            pollIntervalMs: 0,
            syncInactive: true,
            ignoredTags: []
        });

        await watcher.start();
        await watcher.refreshLocalState();

        const statuses = watcher.getStatusMatrix();
        
        // Should be detected as EXIST_ONLY_LOCALLY
        const foundWorkflow = statuses.find(s => s.filename === filename);
        assert.ok(foundWorkflow, 'Workflow should be found');
        assert.strictEqual(foundWorkflow?.status, WorkflowSyncStatus.EXIST_ONLY_LOCALLY, 'Should be marked as local-only');
        
        watcher.stop();
    } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
    }
});

test('Case 3: Workflow renamed in n8n UI - should find by ID', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-test-'));
    
    try {
        // Create local file with original name
        const filename = 'OldName.json';
        const workflow = {
            id: '789',
            name: 'OldName',
            active: true,
            nodes: [],
            connections: {}
        };
        
        fs.writeFileSync(
            path.join(testDir, filename),
            JSON.stringify(workflow, null, 2)
        );

        // Initialize state
        const stateFile = path.join(testDir, '.n8n-state.json');
        fs.writeFileSync(stateFile, JSON.stringify({
            workflows: {
                '789': {
                    lastSyncedHash: 'somehash',
                    lastSyncedAt: '2024-01-01T00:00:00.000Z'
                }
            }
        }));

        // Mock remote workflow with NEW name
        const renamedWorkflow = {
            id: '789',
            name: 'NewName',
            active: true,
            nodes: [],
            connections: {}
        };
        
        const mockClient = {
            getAllWorkflows: async () => [
                { id: '789', name: 'NewName', active: true, updatedAt: '2024-01-02T00:00:00.000Z' }
            ],
            getWorkflow: async (id: string) => renamedWorkflow,
            createWorkflow: async () => ({}),
            updateWorkflow: async () => ({}),
            deleteWorkflow: async () => {}
        };

        const watcher = new Watcher(mockClient as any, {
            directory: testDir,
            pollIntervalMs: 0,
            syncInactive: true,
            ignoredTags: []
        });

        await watcher.start();
        await watcher.refreshLocalState();
        await watcher.refreshRemoteState();

        const statuses = watcher.getStatusMatrix();
        const foundWorkflow = statuses.find(s => s.id === '789');
        
        // Should still find the workflow by ID, using the existing filename
        assert.ok(foundWorkflow, 'Workflow should be found by ID');
        assert.strictEqual(foundWorkflow?.filename, 'OldName.json', 'Should NOT try to use NewName.json');
        
        watcher.stop();
    } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
    }
});

test('Case 4: File renamed locally - should find workflow by ID scan', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-test-'));
    
    try {
        // Start with workflow in state
        const stateFile = path.join(testDir, '.n8n-state.json');
        fs.writeFileSync(stateFile, JSON.stringify({
            workflows: {
                'abc123': {
                    lastSyncedHash: 'somehash',
                    lastSyncedAt: '2024-01-01T00:00:00.000Z'
                }
            }
        }));

        // Create file with NEW name but OLD id
        const newFilename = 'RenamedFile.json';
        const workflow = {
            id: 'abc123',
            name: 'SomeName',
            active: true,
            nodes: [],
            connections: {}
        };
        
        fs.writeFileSync(
            path.join(testDir, newFilename),
            JSON.stringify(workflow, null, 2)
        );

        const mockClient = {
            getAllWorkflows: async () => [
                { id: 'abc123', name: 'SomeName', active: true, updatedAt: '2024-01-01T00:00:00.000Z' }
            ],
            getWorkflow: async (id: string) => workflow,
            createWorkflow: async () => ({}),
            updateWorkflow: async () => ({}),
            deleteWorkflow: async () => {}
        };

        const watcher = new Watcher(mockClient as any, {
            directory: testDir,
            pollIntervalMs: 0,
            syncInactive: true,
            ignoredTags: []
        });

        await watcher.start();
        await watcher.refreshLocalState();
        await watcher.refreshRemoteState();

        const statuses = watcher.getStatusMatrix();
        const foundWorkflow = statuses.find(s => s.id === 'abc123');
        
        // Should find workflow and update mapping to new filename
        assert.ok(foundWorkflow, 'Workflow should be found by scanning for ID');
        assert.strictEqual(foundWorkflow?.filename, 'RenamedFile.json', 'Should use the new filename');
        
        watcher.stop();
    } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
    }
});

test('Case 5: Pause observation by filename for workflows without ID', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-test-'));
    
    try {
        const filename = 'TestWorkflow.json';
        const workflow = {
            name: 'TestWorkflow',
            active: true,
            nodes: [],
            connections: {}
        };
        
        fs.writeFileSync(
            path.join(testDir, filename),
            JSON.stringify(workflow, null, 2)
        );

        const mockClient = {
            getAllWorkflows: async () => [],
            getWorkflow: async (id: string) => null,
            createWorkflow: async () => ({}),
            updateWorkflow: async () => ({}),
            deleteWorkflow: async () => {}
        };

        const watcher = new Watcher(mockClient as any, {
            directory: testDir,
            pollIntervalMs: 0,
            syncInactive: true,
            ignoredTags: []
        });

        await watcher.start();
        
        // Test pause by filename
        watcher.pauseObservationByFilename(filename);
        
        // Modify file while paused
        const modifiedWorkflow = { ...workflow, name: 'Modified' };
        fs.writeFileSync(
            path.join(testDir, filename),
            JSON.stringify(modifiedWorkflow, null, 2)
        );
        
        // Small delay to ensure file watcher would have triggered
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Resume observation
        watcher.resumeObservationByFilename(filename);
        
        // The watcher should have the pause/resume methods available
        assert.ok(typeof watcher.pauseObservationByFilename === 'function', 'pauseObservationByFilename should exist');
        assert.ok(typeof watcher.resumeObservationByFilename === 'function', 'resumeObservationByFilename should exist');
        
        watcher.stop();
    } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
    }
});

test('Case 6: File rename detection during watch - should not trigger delete/create events', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-test-'));
    
    try {
        // Create initial file with workflow ID
        const oldFilename = 'OldName.json';
        const workflow = {
            id: 'test123',
            name: 'Test Workflow',
            active: true,
            nodes: [],
            connections: {}
        };
        
        fs.writeFileSync(
            path.join(testDir, oldFilename),
            JSON.stringify(workflow, null, 2)
        );

        // Initialize state
        const stateFile = path.join(testDir, '.n8n-state.json');
        fs.writeFileSync(stateFile, JSON.stringify({
            workflows: {
                'test123': {
                    lastSyncedHash: 'somehash',
                    lastSyncedAt: '2024-01-01T00:00:00.000Z'
                }
            }
        }));

        const mockClient = {
            getAllWorkflows: async () => [
                { id: 'test123', name: 'Test Workflow', active: true, updatedAt: '2024-01-01T00:00:00.000Z' }
            ],
            getWorkflow: async (id: string) => workflow,
            createWorkflow: async () => ({}),
            updateWorkflow: async () => ({}),
            deleteWorkflow: async () => {}
        };

        const watcher = new Watcher(mockClient as any, {
            directory: testDir,
            pollIntervalMs: 0,
            syncInactive: true,
            ignoredTags: []
        });

        await watcher.start();
        await watcher.refreshLocalState();
        await watcher.refreshRemoteState();

        // Track status changes
        const statusChanges: Array<{filename: string, workflowId?: string, status: WorkflowSyncStatus}> = [];
        watcher.on('statusChange', (event) => {
            console.log(`[Test] statusChange: ${event.filename}, ${event.workflowId}, ${event.status}`);
            statusChanges.push(event);
        });

        // Track rename events
        const renameEvents: Array<{workflowId: string, oldFilename: string, newFilename: string}> = [];
        watcher.on('fileRenamed', (event) => {
            console.log(`[Test] fileRenamed: ${event.oldFilename} -> ${event.newFilename} for ${event.workflowId}`);
            renameEvents.push(event);
        });

        // Simulate file rename (delete old file, create new file)
        const newFilename = 'NewName.json';
        console.log(`[Test] Deleting file: ${oldFilename}`);
        fs.unlinkSync(path.join(testDir, oldFilename));
        
        // Wait for file watcher to detect deletion (chokidar has 500ms debounce)
        await new Promise(resolve => setTimeout(resolve, 600));
        
        console.log(`[Test] Creating file: ${newFilename}`);
        // Create new file with same workflow ID
        fs.writeFileSync(
            path.join(testDir, newFilename),
            JSON.stringify(workflow, null, 2)
        );
        
        // Wait for rename detection timeout (1000ms) plus file watcher debounce (600ms)
        console.log(`[Test] Waiting for rename detection...`);
        await new Promise(resolve => setTimeout(resolve, 1700));

        console.log(`[Test] Test assertions...`);
        // Check that we got a rename event, not delete/create status changes
        assert.strictEqual(renameEvents.length, 1, `Should detect rename event (got ${renameEvents.length})`);
        assert.strictEqual(renameEvents[0].workflowId, 'test123', 'Rename event should have correct workflow ID');
        assert.strictEqual(renameEvents[0].oldFilename, oldFilename, 'Rename event should have old filename');
        assert.strictEqual(renameEvents[0].newFilename, newFilename, 'Rename event should have new filename');

        // Check that we didn't get DELETED_LOCALLY status
        const deletedStatus = statusChanges.find(s => s.status === WorkflowSyncStatus.DELETED_LOCALLY);
        assert.ok(!deletedStatus, `Should not trigger DELETED_LOCALLY status during rename (got ${statusChanges.length} status changes)`);

        // Check that mappings are updated
        const fileToIdMap = watcher.getFileToIdMap();
        assert.strictEqual(fileToIdMap.get(newFilename), 'test123', 'New filename should map to workflow ID');
        assert.ok(!fileToIdMap.get(oldFilename), 'Old filename should no longer map to workflow ID');

        console.log(`[Test] Test passed!`);
        watcher.stop();
    } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
    }
});

test('Case 7: File rename with fs.renameSync - should detect rename event', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-test-'));
    
    try {
        // Create initial file with workflow ID
        const oldFilename = 'OldName.json';
        const workflow = {
            id: 'test456',
            name: 'Test Workflow',
            active: true,
            nodes: [],
            connections: {}
        };
        
        fs.writeFileSync(
            path.join(testDir, oldFilename),
            JSON.stringify(workflow, null, 2)
        );

        // Initialize state
        const stateFile = path.join(testDir, '.n8n-state.json');
        fs.writeFileSync(stateFile, JSON.stringify({
            workflows: {
                'test456': {
                    lastSyncedHash: 'somehash',
                    lastSyncedAt: '2024-01-01T00:00:00.000Z'
                }
            }
        }));

        const mockClient = {
            getAllWorkflows: async () => [
                { id: 'test456', name: 'Test Workflow', active: true, updatedAt: '2024-01-01T00:00:00.000Z' }
            ],
            getWorkflow: async (id: string) => workflow,
            createWorkflow: async () => ({}),
            updateWorkflow: async () => ({}),
            deleteWorkflow: async () => {}
        };

        const watcher = new Watcher(mockClient as any, {
            directory: testDir,
            pollIntervalMs: 0,
            syncInactive: true,
            ignoredTags: []
        });

        await watcher.start();
        await watcher.refreshLocalState();
        await watcher.refreshRemoteState();

        // Track status changes
        const statusChanges: Array<{filename: string, workflowId?: string, status: WorkflowSyncStatus}> = [];
        watcher.on('statusChange', (event) => {
            console.log(`[Test] statusChange: ${event.filename}, ${event.workflowId}, ${event.status}`);
            statusChanges.push(event);
        });

        // Track rename events
        const renameEvents: Array<{workflowId: string, oldFilename: string, newFilename: string}> = [];
        watcher.on('fileRenamed', (event) => {
            console.log(`[Test] fileRenamed: ${event.oldFilename} -> ${event.newFilename} for ${event.workflowId}`);
            renameEvents.push(event);
        });

        // Simulate file rename using fs.renameSync (real rename operation)
        const newFilename = 'NewName.json';
        console.log(`[Test] Renaming file with fs.renameSync: ${oldFilename} -> ${newFilename}`);
        fs.renameSync(
            path.join(testDir, oldFilename),
            path.join(testDir, newFilename)
        );
        
        // Wait for file watcher to detect rename (increased timeout for rename detection)
        console.log(`[Test] Waiting for rename detection...`);
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log(`[Test] Test assertions...`);
        // Check that we got a rename event
        assert.strictEqual(renameEvents.length, 1, `Should detect rename event (got ${renameEvents.length})`);
        assert.strictEqual(renameEvents[0].workflowId, 'test456', 'Rename event should have correct workflow ID');
        assert.strictEqual(renameEvents[0].oldFilename, oldFilename, 'Rename event should have old filename');
        assert.strictEqual(renameEvents[0].newFilename, newFilename, 'Rename event should have new filename');

        // Check that we didn't get DELETED_LOCALLY status
        const deletedStatus = statusChanges.find(s => s.status === WorkflowSyncStatus.DELETED_LOCALLY);
        assert.ok(!deletedStatus, `Should not trigger DELETED_LOCALLY status during rename (got ${statusChanges.length} status changes)`);

        // Check that mappings are updated
        const fileToIdMap = watcher.getFileToIdMap();
        assert.strictEqual(fileToIdMap.get(newFilename), 'test456', 'New filename should map to workflow ID');
        assert.ok(!fileToIdMap.get(oldFilename), 'Old filename should no longer map to workflow ID');

        console.log(`[Test] Test passed!`);
        watcher.stop();
    } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
    }
});
