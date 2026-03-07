import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import { SyncManager } from '../../src/core/services/sync-manager.js';
import { MockN8nApiClient } from '../helpers/test-helpers.js';

describe('SyncManager push filename contract', () => {
    function createSyncManager() {
        return new SyncManager(new MockN8nApiClient() as any, {
            directory: '/tmp/n8nac-sync-manager-test',
            syncInactive: true,
            ignoredTags: [],
            projectId: 'project-1',
            projectName: 'Personal',
            instanceIdentifier: 'local_5678_test',
        });
    }

    it('accepts a plain workflow filename', () => {
        const manager = createSyncManager();
        expect((manager as any).normalizePushFilename('my-workflow.workflow.ts')).toBe('my-workflow.workflow.ts');
    });

    it('rejects absolute paths', () => {
        const manager = createSyncManager();
        expect(() => (manager as any).normalizePushFilename('/tmp/my-workflow.workflow.ts')).toThrow(/Use only the workflow filename/);
    });

    it('rejects nested relative paths', () => {
        const manager = createSyncManager();
        expect(() => (manager as any).normalizePushFilename('nested/my-workflow.workflow.ts')).toThrow(/Use only the workflow filename/);
    });

    it('rejects empty filenames', () => {
        const manager = createSyncManager();
        expect(() => (manager as any).normalizePushFilename('   ')).toThrow(/Missing filename/);
    });

    it('refreshes local state before resolving workflow id during push', async () => {
        const manager = createSyncManager();
        const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-sync-manager-'));
        const workflowFilename = 'existing.workflow.ts';

        fs.writeFileSync(path.join(workspaceDir, workflowFilename), '// workflow placeholder', 'utf-8');

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

        await expect(manager.push(workflowFilename)).resolves.toBe('wf-123');

        expect(refreshLocalState).toHaveBeenCalledOnce();
        expect(getWorkflowIdForFilename).toHaveBeenCalledWith(workflowFilename);
        expect(refreshLocalState.mock.invocationCallOrder[0]).toBeLessThan(getWorkflowIdForFilename.mock.invocationCallOrder[0]);
        expect(push).toHaveBeenCalledWith(workflowFilename, 'wf-123', expect.any(String));
    });
});
