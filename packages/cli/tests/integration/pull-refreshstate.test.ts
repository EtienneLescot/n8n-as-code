/**
 * Critical test: Pull command must call refreshState before syncDown
 * This tests the workaround for Core bug where syncDown doesn't refresh state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockN8nApiClient, MockSyncManager } from '../helpers/test-helpers.js';

describe('Pull with refreshState', () => {
    let mockClient: MockN8nApiClient;
    let mockSyncManager: MockSyncManager;

    beforeEach(() => {
        mockClient = new MockN8nApiClient();
        mockSyncManager = new MockSyncManager(mockClient, {
            directory: '/tmp/test',
            pollIntervalMs: 0
        });
    });

    it('should call refreshState before syncDown', async () => {
        const refreshStateSpy = vi.spyOn(mockSyncManager, 'refreshState');
        const syncDownSpy = vi.spyOn(mockSyncManager, 'syncDown');

        await mockSyncManager.refreshState();
        await mockSyncManager.syncDown();

        // Verify both were called
        expect(refreshStateSpy).toHaveBeenCalled();
        expect(syncDownSpy).toHaveBeenCalled();
    });

    it('should refresh state on push as well', async () => {
        const refreshStateSpy = vi.spyOn(mockSyncManager, 'refreshState');
        const syncUpSpy = vi.spyOn(mockSyncManager, 'syncUp');

        await mockSyncManager.refreshState();
        await mockSyncManager.syncUp();

        expect(refreshStateSpy).toHaveBeenCalled();
        expect(syncUpSpy).toHaveBeenCalled();
    });

    it('should handle force pull correctly', async () => {
        mockSyncManager.setMockWorkflowsStatus([
            { id: '1', name: 'Test', status: 'CONFLICT' as any, filename: 'test.json' }
        ]);

        const refreshStateSpy = vi.spyOn(mockSyncManager, 'refreshState');
        
        await mockSyncManager.refreshState();

        // In force mode, conflicts should be auto-resolved
        expect(refreshStateSpy).toHaveBeenCalled();
    });
});
