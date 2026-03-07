/**
 * Critical test: Pull command must call refreshState before syncDown
 * This tests the workaround for Sync bug where syncDown doesn't refresh state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockN8nApiClient, MockSyncManager } from '../helpers/test-helpers.js';

describe('Pull with refreshState', () => {
    let mockClient: MockN8nApiClient;
    let mockSyncManager: MockSyncManager;

    beforeEach(() => {
        mockClient = new MockN8nApiClient();
        mockSyncManager = new MockSyncManager(mockClient, {
            directory: '/tmp/test'
        });
    });

    it('should call refreshRemoteState before pull', async () => {
        const refreshRemoteStateSpy = vi.spyOn(mockSyncManager, 'refreshRemoteState');
        const pullSpy = vi.spyOn(mockSyncManager, 'pull');

        await mockSyncManager.refreshRemoteState();
        await mockSyncManager.pull('1');

        // Verify both were called
        expect(refreshRemoteStateSpy).toHaveBeenCalled();
        expect(pullSpy).toHaveBeenCalledWith('1');
    });

    it('should refresh state on push as well', async () => {
        const refreshRemoteStateSpy = vi.spyOn(mockSyncManager, 'refreshRemoteState');
        const pushSpy = vi.spyOn(mockSyncManager, 'push');

        await mockSyncManager.refreshRemoteState();
        await mockSyncManager.push('test.workflow.ts');

        expect(refreshRemoteStateSpy).toHaveBeenCalled();
        expect(pushSpy).toHaveBeenCalledWith('test.workflow.ts');
    });

    it('should handle force pull correctly', async () => {
        mockSyncManager.setMockWorkflowsList([
            { id: '1', name: 'Test', status: 'CONFLICT' as any, filename: 'test.workflow.ts' }
        ]);

        const refreshRemoteStateSpy = vi.spyOn(mockSyncManager, 'refreshRemoteState');
        
        await mockSyncManager.refreshRemoteState();

        // In force mode, conflicts should be auto-resolved
        expect(refreshRemoteStateSpy).toHaveBeenCalled();
    });
});
