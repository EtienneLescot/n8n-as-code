import test from 'node:test';
import assert from 'node:assert';
import { StateManager } from '../../src/services/state-manager.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

test('StateManager: updateWorkflowState should save hash to file', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-test-'));
    const stateManager = new StateManager(tempDir);
    const mockWorkflow = { name: 'Test', nodes: [], connections: {} };

    try {
        stateManager.updateWorkflowState('wf-1', mockWorkflow);
        
        const stateFile = path.join(tempDir, '.n8n-state.json');
        assert.strictEqual(fs.existsSync(stateFile), true);
        
        const content = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
        assert.ok(content.workflows['wf-1']);
        assert.strictEqual(content.workflows['wf-1'].lastSyncedHash, StateManager.computeHash(mockWorkflow));
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('StateManager: isLocalSynced should detect changes', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-test-'));
    const stateManager = new StateManager(tempDir);
    const mockWorkflow = { name: 'Test', nodes: [], connections: {} };

    try {
        stateManager.updateWorkflowState('wf-1', mockWorkflow);
        
        // Matches
        assert.strictEqual(stateManager.isLocalSynced('wf-1', mockWorkflow), true);
        
        // Different
        const modified = { ...mockWorkflow, name: 'Changed' };
        assert.strictEqual(stateManager.isLocalSynced('wf-1', modified), false);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('StateManager: removeWorkflowState should delete workflow from state', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-test-'));
    const stateManager = new StateManager(tempDir);
    const mockWorkflow = { name: 'Test', nodes: [], connections: {} };

    try {
        stateManager.updateWorkflowState('wf-1', mockWorkflow);
        assert.ok(stateManager.getWorkflowState('wf-1'));

        stateManager.removeWorkflowState('wf-1');
        assert.strictEqual(stateManager.getWorkflowState('wf-1'), undefined);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('StateManager: getTrackedWorkflowIds should return all IDs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-test-'));
    const stateManager = new StateManager(tempDir);

    try {
        stateManager.updateWorkflowState('wf-1', { name: 'WF 1' });
        stateManager.updateWorkflowState('wf-2', { name: 'WF 2' });

        const ids = stateManager.getTrackedWorkflowIds();
        assert.strictEqual(ids.length, 2);
        assert.ok(ids.includes('wf-1'));
        assert.ok(ids.includes('wf-2'));
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});


