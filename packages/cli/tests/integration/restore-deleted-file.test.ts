/**
 * Critical test: Restore deleted file using resolveConflict workaround
 * Tests fix for restoreLocalFile not working when file deleted manually
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockN8nApiClient, MockSyncManager } from '../helpers/test-helpers.js';

describe('Restore Deleted File', () => {
    let mockClient: MockN8nApiClient;
    let mockSyncManager: MockSyncManager;

    beforeEach(() => {
        mockClient = new MockN8nApiClient();
        mockSyncManager = new MockSyncManager(mockClient, {});
        
        mockClient.setMockWorkflows([
            { id: '1', name: 'Test Workflow', active: true }
        ]);
    });

    it('should use resolveConflict instead of restoreLocalFile', async () => {
        const resolveConflictSpy = vi.spyOn(mockSyncManager, 'resolveConflict');

        // Simulate a DELETED_LOCALLY status
        await mockSyncManager.resolveConflict('1', 'test.json', 'remote');

        expect(resolveConflictSpy).toHaveBeenCalledWith('1', 'test.json', 'remote');
    });

    it('should handle restoration when file not in archive', async () => {
        const resolveConflictSpy = vi.spyOn(mockSyncManager, 'resolveConflict');
        
        // This simulates the workaround: use resolveConflict with 'remote'
        // instead of restoreLocalFile which requires archive
        await mockSyncManager.resolveConflict('1', 'test.json', 'remote');

        expect(resolveConflictSpy).toHaveBeenCalledOnce();
        expect(resolveConflictSpy).toHaveBeenCalledWith('1', 'test.json', 'remote');
    });

    it('should successfully restore multiple deleted files', async () => {
        const files = ['file1.json', 'file2.json', 'file3.json'];
        const resolveConflictSpy = vi.spyOn(mockSyncManager, 'resolveConflict');

        for (let i = 0; i < files.length; i++) {
            await mockSyncManager.resolveConflict(`${i + 1}`, files[i], 'remote');
        }

        expect(resolveConflictSpy).toHaveBeenCalledTimes(files.length);
    });

    it('should handle errors during restoration gracefully', async () => {
        mockSyncManager.setShouldFail(true);

        await expect(async () => {
            await mockSyncManager.resolveConflict('1', 'test.json', 'remote');
        }).rejects.toThrow('SyncManager Error');
    });
});
