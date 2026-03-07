import { describe, it, expect } from 'vitest';
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
});
