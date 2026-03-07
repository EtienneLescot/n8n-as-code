import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import { SyncManager } from '../../src/core/services/sync-manager.js';
import { MockN8nApiClient } from '../helpers/test-helpers.js';

describe('SyncManager push filename contract', () => {
    function createSyncManager(syncDir: string) {
        return new SyncManager(new MockN8nApiClient() as any, {
            directory: syncDir,
            syncInactive: true,
            ignoredTags: [],
            projectId: 'project-1',
            projectName: 'Personal',
            instanceIdentifier: 'local_5678_test',
        });
    }

    it('accepts a workflow file path within the sync scope', () => {
        const syncDir = path.resolve('/tmp/n8nac-sync-manager-test');
        const manager = createSyncManager(syncDir);
        
        // Mock the watcher as it's null by default in the constructor
        (manager as any).watcher = {
            getDirectory: () => syncDir
        };

        const filePath = path.join(syncDir, 'my-workflow.workflow.ts');
        expect((manager as any).normalizePushFilename(filePath)).toBe('my-workflow.workflow.ts');
    });

    it('rejects paths outside the sync scope', () => {
        const syncDir = path.resolve('/tmp/n8nac-sync-manager-test');
        const manager = createSyncManager(syncDir);
        
        // Mock the watcher
        (manager as any).watcher = {
            getDirectory: () => syncDir
        };

        const outsidePath = '/tmp/outside-workflow.workflow.ts';
        expect(() => (manager as any).normalizePushFilename(outsidePath))
            .toThrow(/outside the active sync scope/);
    });

    it('rejects empty paths', () => {
        const syncDir = path.resolve('/tmp/n8nac-sync-manager-test');
        const manager = createSyncManager(syncDir);
        
        // Mock the watcher
        (manager as any).watcher = {
            getDirectory: () => syncDir
        };

        expect(() => (manager as any).normalizePushFilename('   ')).toThrow(/Missing workflow file path/);
    });

    it('refreshes local state before resolving workflow id during push', async () => {
        const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-sync-manager-'));
        const manager = createSyncManager(workspaceDir);
        const workflowFilename = 'existing.workflow.ts';
        const fullPath = path.join(workspaceDir, workflowFilename);

        fs.writeFileSync(fullPath, '// workflow placeholder', 'utf-8');

        const refreshLocalState = vi.fn(async () => undefined);
        const getWorkflowIdForFilename = vi.fn(() => 'wf-123');
        const isRemoteKnown = vi.fn(() => true);
        const push = vi.fn(async () => 'wf-123');

        (manager as any).ensureInitialized = vi.fn(async () => undefined);
        (manager as any).watcher = {
            getDirectory: () => workspaceDir,
            refreshLocalState,
            getWorkflowIdForFilename,
            isRemoteKnown,
        };
        (manager as any).syncEngine = { push };

        // We must pass the full path or a relative path that resolves into workspaceDir
        await expect(manager.push(fullPath)).resolves.toBe('wf-123');

        expect(refreshLocalState).toHaveBeenCalledOnce();
        expect(getWorkflowIdForFilename).toHaveBeenCalledWith(workflowFilename);
        expect(refreshLocalState.mock.invocationCallOrder[0]).toBeLessThan(getWorkflowIdForFilename.mock.invocationCallOrder[0]);
        expect(push).toHaveBeenCalledWith(workflowFilename, 'wf-123', expect.any(String));
    });
});
