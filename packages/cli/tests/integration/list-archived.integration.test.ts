/**
 * Integration tests for --include-archived and --only-archived.
 *
 * Exercises the full SyncManager → WorkflowStateTracker chain with a
 * real N8nApiClient-compatible mock, covering all three filter modes.
 *
 * Compared to the unit tests in workflow-state-tracker.test.ts, these
 * go through SyncManager.listWorkflows() (the path used by the CLI),
 * not directly through getLightweightList().
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { SyncManager } from '../../src/core/services/sync-manager.js';
import { WorkflowStateTracker } from '../../src/core/services/workflow-state-tracker.js';
import { ConfigService } from '../../src/services/config-service.js';

// ---------------------------------------------------------------------------
// Mock N8nApiClient — implements the surface used by WorkflowStateTracker
// ---------------------------------------------------------------------------

const REMOTE_WORKFLOWS = [
    { id: 'wf-active-1', name: 'Active Alpha', active: true, isArchived: false, shared: [{ projectId: 'personal-project', projectName: 'Personal' }] },
    { id: 'wf-active-2', name: 'Active Beta', active: true, isArchived: false, shared: [{ projectId: 'personal-project', projectName: 'Personal' }] },
    { id: 'wf-archived-1', name: 'Archived Gamma', active: false, isArchived: true, shared: [{ projectId: 'personal-project', projectName: 'Personal' }] },
];

class MockN8nApiClientForArchive extends EventEmitter {
    constructor() {
        super();
    }

    async getAllWorkflows(_projectId?: string): Promise<any[]> {
        return REMOTE_WORKFLOWS;
    }

    async testConnection(): Promise<boolean> {
        return true;
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

function createSyncManagerWithMockClient(workspaceDir: string): SyncManager {
    const configService = new ConfigService(workspaceDir);
    configService.saveLocalConfig({
        host: 'http://localhost:5678',
        syncFolder: workspaceDir,
        projectId: 'personal-project',
        projectName: 'Personal',
        instanceIdentifier: 'local_1234_etienne_test',
    }, { instanceName: 'Test' });
    configService.saveApiKey('http://localhost:5678', 'test-api-key');

    const mockClient = new MockN8nApiClientForArchive();
    return new SyncManager(mockClient as any, {
        directory: workspaceDir,
        syncInactive: false,
        ignoredTags: [],
        projectId: 'personal-project',
        projectName: 'Personal',
        instanceIdentifier: 'test_instance',
    });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
    vi.resetAllMocks();
});

afterEach(() => {
    for (const dir of tempDirs) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
});

// ---------------------------------------------------------------------------
// Tests — full SyncManager.listWorkflows() → getLightweightList() chain
// ---------------------------------------------------------------------------

describe('SyncManager listWorkflows archive filtering', () => {

    it('excludes archived workflows by default', async () => {
        const workspaceDir = createTempDir('n8nac-it-archive-');
        const syncManager = createSyncManagerWithMockClient(workspaceDir);

        const results = await syncManager.listWorkflows({ fetchRemote: true });
        const names = results.map(w => w.name);

        expect(names).toContain('Active Alpha');
        expect(names).toContain('Active Beta');
        expect(names).not.toContain('Archived Gamma');
    });

    it('includes archived workflows with includeArchived', async () => {
        const workspaceDir = createTempDir('n8nac-it-archive-');
        const syncManager = createSyncManagerWithMockClient(workspaceDir);

        const results = await syncManager.listWorkflows({ fetchRemote: true, includeArchived: true });
        const names = results.map(w => w.name);

        expect(names).toContain('Active Alpha');
        expect(names).toContain('Active Beta');
        expect(names).toContain('Archived Gamma');
    });

    it('shows only archived workflows with onlyArchived', async () => {
        const workspaceDir = createTempDir('n8nac-it-archive-');
        const syncManager = createSyncManagerWithMockClient(workspaceDir);

        const results = await syncManager.listWorkflows({ fetchRemote: true, onlyArchived: true });
        const names = results.map(w => w.name);

        expect(names).not.toContain('Active Alpha');
        expect(names).not.toContain('Active Beta');
        expect(names).toContain('Archived Gamma');
    });

    it('correctly sets isArchived and active flags on all returned workflows', async () => {
        const workspaceDir = createTempDir('n8nac-it-archive-');
        const syncManager = createSyncManagerWithMockClient(workspaceDir);

        const results = await syncManager.listWorkflows({ fetchRemote: true, includeArchived: true });

        const active1 = results.find(w => w.id === 'wf-active-1');
        const active2 = results.find(w => w.id === 'wf-active-2');
        const archived = results.find(w => w.id === 'wf-archived-1');

        expect(active1?.isArchived).toBe(false);
        expect(active1?.active).toBe(true);
        expect(active2?.isArchived).toBe(false);
        expect(active2?.active).toBe(true);
        expect(archived?.isArchived).toBe(true);
        expect(archived?.active).toBe(false);
    });

    it('flags are correctly stored in remoteActive and remoteArchived caches', async () => {
        const workspaceDir = createTempDir('n8nac-it-archive-');
        const syncManager = createSyncManagerWithMockClient(workspaceDir);

        // Populate caches
        await syncManager.listWorkflows({ fetchRemote: true, includeArchived: true });

        // Call again without fetchRemote — should still filter correctly using cached flags
        const results = await syncManager.listWorkflows({ fetchRemote: false, onlyArchived: true });
        const names = results.map(w => w.name);

        expect(names).not.toContain('Active Alpha');
        expect(names).toContain('Archived Gamma');
    });
});
