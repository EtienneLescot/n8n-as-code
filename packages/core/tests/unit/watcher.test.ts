import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Watcher } from '../../src/services/watcher.js';
import { N8nApiClient } from '../../src/services/n8n-api-client.js';
import { WorkflowSyncStatus } from '../../src/types.js';

/**
 * Watcher Unit Tests
 * 
 * Tests state observation functionality:
 * - Status calculation (8 statuses from spec)
 * - Local state refresh
 * - Remote state refresh
 * - State persistence
 * - Workflow ID tracking
 */

test('Watcher: Status Calculation Matrix', async (t) => {
    await t.test('EXIST_ONLY_LOCALLY: local exists, no base, no remote', () => {
        // Mock scenario where file exists locally but never synced
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-test-'));
        try {
            const mockClient = {
                getAllWorkflows: async () => []
            } as any;
            
            const watcher = new Watcher(mockClient, {
                directory: tempDir,
                pollIntervalMs: 0,
                syncInactive: true,
                ignoredTags: []
            });
            
            // Create local file
            const testFile = path.join(tempDir, 'test.json');
            fs.writeFileSync(testFile, JSON.stringify({ id: 'test-id', name: 'Test', nodes: [], connections: {} }));
            
            // Manually set local hash (simulating file detection)
            (watcher as any).localHashes.set('test.json', 'local-hash');
            (watcher as any).fileToIdMap.set('test.json', 'test-id');
            
            const status = watcher.calculateStatus('test.json', 'test-id');
            assert.strictEqual(status, WorkflowSyncStatus.EXIST_ONLY_LOCALLY);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    await t.test('EXIST_ONLY_REMOTELY: remote exists, no base, no local', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-test-'));
        try {
            const mockClient = {} as any;
            const watcher = new Watcher(mockClient, {
                directory: tempDir,
                pollIntervalMs: 0,
                syncInactive: true,
                ignoredTags: []
            });
            
            // Set remote hash only
            (watcher as any).remoteHashes.set('test-id', 'remote-hash');
            (watcher as any).idToFileMap.set('test-id', 'test.json');
            
            const status = watcher.calculateStatus('test.json', 'test-id');
            assert.strictEqual(status, WorkflowSyncStatus.EXIST_ONLY_REMOTELY);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    await t.test('IN_SYNC: local and remote hashes match', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-test-'));
        try {
            const mockClient = {} as any;
            const watcher = new Watcher(mockClient, {
                directory: tempDir,
                pollIntervalMs: 0,
                syncInactive: true,
                ignoredTags: []
            });
            
            const sameHash = 'same-hash';
            (watcher as any).localHashes.set('test.json', sameHash);
            (watcher as any).remoteHashes.set('test-id', sameHash);
            (watcher as any).fileToIdMap.set('test.json', 'test-id');
            
            const status = watcher.calculateStatus('test.json', 'test-id');
            assert.strictEqual(status, WorkflowSyncStatus.IN_SYNC);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    await t.test('DELETED_LOCALLY: no local, remote unchanged from base', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-test-'));
        try {
            const mockClient = {} as any;
            const watcher = new Watcher(mockClient, {
                directory: tempDir,
                pollIntervalMs: 0,
                syncInactive: true,
                ignoredTags: []
            });
            
            const baseHash = 'base-hash';
            // Set base state
            const stateFile = path.join(tempDir, '.n8n-state.json');
            fs.writeFileSync(stateFile, JSON.stringify({
                workflows: {
                    'test-id': { lastSyncedHash: baseHash, lastSyncedAt: new Date().toISOString() }
                }
            }));
            
            // Remote unchanged, local deleted
            (watcher as any).remoteHashes.set('test-id', baseHash);
            (watcher as any).idToFileMap.set('test-id', 'test.json');
            // No local hash (file deleted)
            
            const status = watcher.calculateStatus('test.json', 'test-id');
            assert.strictEqual(status, WorkflowSyncStatus.DELETED_LOCALLY);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    await t.test('DELETED_REMOTELY: no remote, local unchanged from base', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-test-'));
        try {
            const mockClient = {} as any;
            const watcher = new Watcher(mockClient, {
                directory: tempDir,
                pollIntervalMs: 0,
                syncInactive: true,
                ignoredTags: []
            });
            
            const baseHash = 'base-hash';
            // Set base state
            const stateFile = path.join(tempDir, '.n8n-state.json');
            fs.writeFileSync(stateFile, JSON.stringify({
                workflows: {
                    'test-id': { lastSyncedHash: baseHash, lastSyncedAt: new Date().toISOString() }
                }
            }));
            
            // Local unchanged, remote deleted
            (watcher as any).localHashes.set('test.json', baseHash);
            (watcher as any).fileToIdMap.set('test.json', 'test-id');
            // No remote hash (deleted)
            
            const status = watcher.calculateStatus('test.json', 'test-id');
            assert.strictEqual(status, WorkflowSyncStatus.DELETED_REMOTELY);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    await t.test('MODIFIED_LOCALLY: local changed, remote unchanged from base', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-test-'));
        try {
            const mockClient = {} as any;
            const watcher = new Watcher(mockClient, {
                directory: tempDir,
                pollIntervalMs: 0,
                syncInactive: true,
                ignoredTags: []
            });
            
            const baseHash = 'base-hash';
            const stateFile = path.join(tempDir, '.n8n-state.json');
            fs.writeFileSync(stateFile, JSON.stringify({
                workflows: {
                    'test-id': { lastSyncedHash: baseHash, lastSyncedAt: new Date().toISOString() }
                }
            }));
            
            (watcher as any).localHashes.set('test.json', 'new-local-hash');
            (watcher as any).remoteHashes.set('test-id', baseHash);
            (watcher as any).fileToIdMap.set('test.json', 'test-id');
            
            const status = watcher.calculateStatus('test.json', 'test-id');
            assert.strictEqual(status, WorkflowSyncStatus.MODIFIED_LOCALLY);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    await t.test('MODIFIED_REMOTELY: remote changed, local unchanged from base', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-test-'));
        try {
            const mockClient = {} as any;
            const watcher = new Watcher(mockClient, {
                directory: tempDir,
                pollIntervalMs: 0,
                syncInactive: true,
                ignoredTags: []
            });
            
            const baseHash = 'base-hash';
            const stateFile = path.join(tempDir, '.n8n-state.json');
            fs.writeFileSync(stateFile, JSON.stringify({
                workflows: {
                    'test-id': { lastSyncedHash: baseHash, lastSyncedAt: new Date().toISOString() }
                }
            }));
            
            (watcher as any).localHashes.set('test.json', baseHash);
            (watcher as any).remoteHashes.set('test-id', 'new-remote-hash');
            (watcher as any).fileToIdMap.set('test.json', 'test-id');
            
            const status = watcher.calculateStatus('test.json', 'test-id');
            assert.strictEqual(status, WorkflowSyncStatus.MODIFIED_REMOTELY);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    await t.test('CONFLICT: both local and remote changed from base', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-test-'));
        try {
            const mockClient = {} as any;
            const watcher = new Watcher(mockClient, {
                directory: tempDir,
                pollIntervalMs: 0,
                syncInactive: true,
                ignoredTags: []
            });
            
            const baseHash = 'base-hash';
            const stateFile = path.join(tempDir, '.n8n-state.json');
            fs.writeFileSync(stateFile, JSON.stringify({
                workflows: {
                    'test-id': { lastSyncedHash: baseHash, lastSyncedAt: new Date().toISOString() }
                }
            }));
            
            (watcher as any).localHashes.set('test.json', 'new-local-hash');
            (watcher as any).remoteHashes.set('test-id', 'new-remote-hash');
            (watcher as any).fileToIdMap.set('test.json', 'test-id');
            
            const status = watcher.calculateStatus('test.json', 'test-id');
            assert.strictEqual(status, WorkflowSyncStatus.CONFLICT);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
});

test('Watcher: State Management', async (t) => {
    await t.test('removeWorkflowState should clean up all tracking', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-test-'));
        try {
            const mockClient = {} as any;
            const watcher = new Watcher(mockClient, {
                directory: tempDir,
                pollIntervalMs: 0,
                syncInactive: true,
                ignoredTags: []
            });
            
            // Setup state
            const stateFile = path.join(tempDir, '.n8n-state.json');
            fs.writeFileSync(stateFile, JSON.stringify({
                workflows: {
                    'test-id': { lastSyncedHash: 'hash', lastSyncedAt: new Date().toISOString() }
                }
            }));
            
            (watcher as any).fileToIdMap.set('test.json', 'test-id');
            (watcher as any).idToFileMap.set('test-id', 'test.json');
            (watcher as any).remoteHashes.set('test-id', 'hash');
            
            // Remove workflow
            await watcher.removeWorkflowState('test-id');
            
            // Verify cleanup
            const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
            assert.strictEqual(state.workflows['test-id'], undefined);
            assert.strictEqual((watcher as any).idToFileMap.has('test-id'), false);
            assert.strictEqual((watcher as any).remoteHashes.has('test-id'), false);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    await t.test('updateWorkflowId should migrate state and mappings', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-test-'));
        try {
            const mockClient = {} as any;
            const watcher = new Watcher(mockClient, {
                directory: tempDir,
                pollIntervalMs: 0,
                syncInactive: true,
                ignoredTags: []
            });
            
            // Setup old state
            const stateFile = path.join(tempDir, '.n8n-state.json');
            fs.writeFileSync(stateFile, JSON.stringify({
                workflows: {
                    'old-id': { lastSyncedHash: 'hash', lastSyncedAt: new Date().toISOString() }
                }
            }));
            
            (watcher as any).fileToIdMap.set('test.json', 'old-id');
            (watcher as any).idToFileMap.set('old-id', 'test.json');
            (watcher as any).remoteHashes.set('old-id', 'hash');
            
            // Update ID
            await watcher.updateWorkflowId('old-id', 'new-id');
            
            // Verify migration
            const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
            assert.strictEqual(state.workflows['old-id'], undefined);
            assert.ok(state.workflows['new-id']);
            assert.strictEqual((watcher as any).fileToIdMap.get('test.json'), 'new-id');
            assert.strictEqual((watcher as any).idToFileMap.get('new-id'), 'test.json');
            assert.strictEqual((watcher as any).remoteHashes.get('new-id'), 'hash');
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
