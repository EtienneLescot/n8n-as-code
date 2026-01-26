import test from 'node:test';
import assert from 'node:assert';
import { StateManager } from '../../src/services/state-manager.js';
import { HashUtils } from '../../src/services/hash-utils.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

test('StateManager: getWorkflowState should return saved state', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-test-'));
    
    // Create state file manually
    const stateFile = path.join(tempDir, '.n8n-state.json');
    const mockWorkflow = { name: 'Test', nodes: [], connections: {} };
    const hash = HashUtils.computeHash(mockWorkflow);
    
    fs.writeFileSync(stateFile, JSON.stringify({
        workflows: {
            'wf-1': {
                lastSyncedHash: hash,
                lastSyncedAt: '2024-01-01T00:00:00.000Z'
            }
        }
    }));

    const stateManager = new StateManager(tempDir);

    try {
        const state = stateManager.getWorkflowState('wf-1');
        assert.ok(state);
        assert.strictEqual(state!.lastSyncedHash, hash);
        assert.strictEqual(state!.lastSyncedAt, '2024-01-01T00:00:00.000Z');
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('StateManager: isSynced should detect changes', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-test-'));
    
    // Create state file manually
    const stateFile = path.join(tempDir, '.n8n-state.json');
    const mockWorkflow = { name: 'Test', nodes: [], connections: {} };
    const hash = HashUtils.computeHash(mockWorkflow);
    
    fs.writeFileSync(stateFile, JSON.stringify({
        workflows: {
            'wf-1': {
                lastSyncedHash: hash,
                lastSyncedAt: '2024-01-01T00:00:00.000Z'
            }
        }
    }));

    const stateManager = new StateManager(tempDir);

    try {
        // Matches
        assert.strictEqual(stateManager.isSynced('wf-1', hash), true);

        // Different
        const modified = { ...mockWorkflow, name: 'Changed' };
        const modifiedHash = HashUtils.computeHash(modified);
        assert.strictEqual(stateManager.isSynced('wf-1', modifiedHash), false);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('StateManager: getTrackedWorkflowIds should return all IDs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-test-'));
    
    // Create state file manually
    const stateFile = path.join(tempDir, '.n8n-state.json');
    
    fs.writeFileSync(stateFile, JSON.stringify({
        workflows: {
            'wf-1': {
                lastSyncedHash: 'hash-1',
                lastSyncedAt: '2024-01-01T00:00:00.000Z'
            },
            'wf-2': {
                lastSyncedHash: 'hash-2',
                lastSyncedAt: '2024-01-01T00:00:00.000Z'
            }
        }
    }));

    const stateManager = new StateManager(tempDir);

    try {
        const ids = stateManager.getTrackedWorkflowIds();
        assert.strictEqual(ids.length, 2);
        assert.ok(ids.includes('wf-1'));
        assert.ok(ids.includes('wf-2'));
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('StateManager: should handle missing state file', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-test-'));
    const stateManager = new StateManager(tempDir);

    try {
        // No state file exists
        const state = stateManager.getWorkflowState('wf-1');
        assert.strictEqual(state, undefined);
        
        const ids = stateManager.getTrackedWorkflowIds();
        assert.strictEqual(ids.length, 0);
        
        assert.strictEqual(stateManager.isSynced('wf-1', 'any-hash'), false);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
