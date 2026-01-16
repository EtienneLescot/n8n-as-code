import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Watcher } from '../../src/services/watcher.js';
import { WorkflowSyncStatus } from '../../src/types.js';

/**
 * Watcher Robustness & Stability Tests
 * 
 * Focuses on:
 * 1. Initialization behavior (isInitializing flag)
 * 2. Event stability (no redundant statusChange events)
 * 3. Connection loss detection
 * 4. Advanced detection (state fallback)
 */

test('Watcher Robustness: Initialization Silence', async (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-robustness-'));
    
    try {
        const mockClient = {
            getAllWorkflows: async () => [
                { id: 'wf-1', name: 'Test Workflow', updatedAt: '2026-01-16T10:00:00Z' }
            ],
            getWorkflow: async () => ({
                id: 'wf-1',
                name: 'Test Workflow',
                nodes: [],
                connections: {},
                settings: {}
            })
        } as any;

        const watcher = new Watcher(mockClient, {
            directory: tempDir,
            pollIntervalMs: 0,
            syncInactive: true,
            ignoredTags: []
        });

        let eventsCount = 0;
        watcher.on('statusChange', () => {
            eventsCount++;
        });

        // Manually trigger what start() does but without chokidar
        (watcher as any).isInitializing = true;
        await watcher.refreshRemoteState();
        await watcher.refreshLocalState();
        (watcher as any).isInitializing = false;

        // Verification: No statusChange events should have been emitted during start()
        // thanks to the isInitializing flag.
        assert.strictEqual(eventsCount, 0, 'Should not emit events during initialization');
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('Watcher Robustness: Event Stability', async (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-robustness-'));
    
    try {
        const mockWorkflow = { id: 'wf-1', name: 'Test Workflow', updatedAt: '2026-01-16T10:00:00Z' };
        const mockClient = {
            getAllWorkflows: async () => [mockWorkflow],
            getWorkflow: async () => ({ ...mockWorkflow, nodes: [], connections: {}, settings: {} })
        } as any;

        const watcher = new Watcher(mockClient, {
            directory: tempDir,
            pollIntervalMs: 0,
            syncInactive: true,
            ignoredTags: []
        });

        // Manually set as initialized (as start() would do)
        (watcher as any).isInitializing = false;

        let eventsCount = 0;
        watcher.on('statusChange', () => {
            eventsCount++;
        });

        // Trigger manual remote refresh
        // The first refresh AFTER initialization will emit because lastKnownStatuses
        // was not populated during init (broadcastStatus returns early when isInitializing is true).
        await watcher.refreshRemoteState();
        assert.strictEqual(eventsCount, 1, 'Should emit first detection event after init');

        // Trigger again with no changes
        // This time it should NOT emit because lastKnownStatuses is now populated.
        await watcher.refreshRemoteState();
        assert.strictEqual(eventsCount, 1, 'Should NOT emit redundant event when status is stable');
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('Watcher Robustness: Connection Loss Handling', async (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-robustness-'));
    
    try {
        let shouldFail = false;
        const mockClient = {
            getAllWorkflows: async () => {
                if (shouldFail) {
                    const err = new Error('fetch failed');
                    (err as any).code = 'ECONNREFUSED';
                    throw err;
                }
                return [];
            }
        } as any;

        const watcher = new Watcher(mockClient, {
            directory: tempDir,
            pollIntervalMs: 0,
            syncInactive: true,
            ignoredTags: []
        });

        // Manually set as initialized
        (watcher as any).isConnected = true;

        let connectionLostEmitted = false;
        watcher.on('connection-lost', () => {
            connectionLostEmitted = true;
        });

        // Simulate failure
        shouldFail = true;
        try {
            await watcher.refreshRemoteState();
        } catch (e) {
            // Error is expected and re-thrown by refreshRemoteState
        }

        assert.strictEqual((watcher as any).isConnected, false, 'isConnected should be false after failure');
        assert.strictEqual(connectionLostEmitted, true, 'connection-lost event should be emitted');
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('Watcher Robustness: Local Delete Detection (State Fallback)', async (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-robustness-'));
    
    try {
        const mockClient = {
            getWorkflow: async () => ({ id: 'wf-1', name: 'Test', nodes: [], connections: {}, settings: {} })
        } as any;

        const watcher = new Watcher(mockClient, {
            directory: tempDir,
            pollIntervalMs: 0,
            syncInactive: true,
            ignoredTags: []
        });

        // Manually setup state file (simulating existing sync history)
        const stateFile = path.join(tempDir, '.n8n-state.json');
        const lastSyncedHash = 'some-hash';
        fs.writeFileSync(stateFile, JSON.stringify({
            workflows: {
                'wf-1': { lastSyncedHash, lastSyncedAt: new Date().toISOString() }
            }
        }));

        // Simulate memory loss (e.g. extension restart) - no internal mapping yet
        // but remote hash is known
        (watcher as any).remoteHashes.set('wf-1', lastSyncedHash);
        (watcher as any).idToFileMap.set('wf-1', 'Test.json');

        // Trigger local delete on a file that wasn't in memory mapping but is in state
        await (watcher as any).onLocalDelete(path.join(tempDir, 'Test.json'));

        // Verify status
        const status = watcher.calculateStatus('Test.json', 'wf-1');
        assert.strictEqual(status, WorkflowSyncStatus.DELETED_LOCALLY, 'Should detect deletion via state fallback');
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
