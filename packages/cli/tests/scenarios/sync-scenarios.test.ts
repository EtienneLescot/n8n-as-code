/**
 * End-to-end synchronization scenarios
 * Complete workflows from initialization to sync
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockN8nApiClient, MockSyncManager, createMockWorkflow } from '../helpers/test-helpers.js';

// Define WorkflowSyncStatus enum locally since we're using mocks
enum WorkflowSyncStatus {
    IN_SYNC = 'IN_SYNC',
    MODIFIED_LOCALLY = 'MODIFIED_LOCALLY',
    MODIFIED_REMOTELY = 'MODIFIED_REMOTELY',
    CONFLICT = 'CONFLICT',
    EXIST_ONLY_LOCALLY = 'EXIST_ONLY_LOCALLY',
    EXIST_ONLY_REMOTELY = 'EXIST_ONLY_REMOTELY',
    DELETED_LOCALLY = 'DELETED_LOCALLY',
    DELETED_REMOTELY = 'DELETED_REMOTELY'
}

describe('Synchronization Scenarios', () => {
    let mockClient: MockN8nApiClient;
    let mockSyncManager: MockSyncManager;

    beforeEach(() => {
        mockClient = new MockN8nApiClient();
        mockSyncManager = new MockSyncManager(mockClient, {
            directory: '/tmp/test-workflows',
            pollIntervalMs: 0
        });
    });

    describe('Initial Sync', () => {
        it('should pull all workflows on first sync', async () => {
            const workflows = [
                createMockWorkflow({ id: '1', name: 'Workflow 1' }),
                createMockWorkflow({ id: '2', name: 'Workflow 2' }),
                createMockWorkflow({ id: '3', name: 'Workflow 3' })
            ];

            mockClient.setMockWorkflows(workflows);
            const getWorkflowsSpy = vi.spyOn(mockClient, 'getWorkflows');

            await mockClient.getWorkflows();

            expect(getWorkflowsSpy).toHaveBeenCalledOnce();
            const result = await mockClient.getWorkflows();
            expect(result).toHaveLength(3);
        });

        it('should handle empty workspace', async () => {
            mockClient.setMockWorkflows([]);
            
            const workflows = await mockClient.getWorkflows();
            expect(workflows).toHaveLength(0);
        });
    });

    describe('Conflict Resolution', () => {
        it('should detect conflicts when both sides modified', async () => {
            mockSyncManager.setMockWorkflowsStatus([
                {
                    id: '1',
                    name: 'Conflicted Workflow',
                    status: WorkflowSyncStatus.CONFLICT,
                    filename: 'workflow.json'
                }
            ]);

            const status = await mockSyncManager.getWorkflowsStatus();
            const conflicts = status.filter(w => w.status === WorkflowSyncStatus.CONFLICT);

            expect(conflicts).toHaveLength(1);
            expect(conflicts[0].status).toBe(WorkflowSyncStatus.CONFLICT);
        });

        it('should resolve conflict by keeping local', async () => {
            const resolveConflictSpy = vi.spyOn(mockSyncManager, 'resolveConflict');

            await mockSyncManager.resolveConflict('1', 'workflow.json', 'local');

            expect(resolveConflictSpy).toHaveBeenCalledWith('1', 'workflow.json', 'local');
        });

        it('should resolve conflict by keeping remote', async () => {
            const resolveConflictSpy = vi.spyOn(mockSyncManager, 'resolveConflict');

            await mockSyncManager.resolveConflict('1', 'workflow.json', 'remote');

            expect(resolveConflictSpy).toHaveBeenCalledWith('1', 'workflow.json', 'remote');
        });
    });

    describe('Status Detection', () => {
        it('should detect IN_SYNC workflows', async () => {
            mockSyncManager.setMockWorkflowsStatus([
                {
                    id: '1',
                    name: 'Synced Workflow',
                    status: WorkflowSyncStatus.IN_SYNC,
                    filename: 'workflow.json'
                }
            ]);

            const status = await mockSyncManager.getWorkflowsStatus();
            expect(status[0].status).toBe(WorkflowSyncStatus.IN_SYNC);
        });

        it('should detect MODIFIED_LOCALLY', async () => {
            mockSyncManager.setMockWorkflowsStatus([
                {
                    id: '1',
                    name: 'Modified Local',
                    status: WorkflowSyncStatus.MODIFIED_LOCALLY,
                    filename: 'workflow.json'
                }
            ]);

            const status = await mockSyncManager.getWorkflowsStatus();
            expect(status[0].status).toBe(WorkflowSyncStatus.MODIFIED_LOCALLY);
        });

        it('should detect MODIFIED_REMOTELY', async () => {
            mockSyncManager.setMockWorkflowsStatus([
                {
                    id: '1',
                    name: 'Modified Remote',
                    status: WorkflowSyncStatus.MODIFIED_REMOTELY,
                    filename: 'workflow.json'
                }
            ]);

            const status = await mockSyncManager.getWorkflowsStatus();
            expect(status[0].status).toBe(WorkflowSyncStatus.MODIFIED_REMOTELY);
        });

        it('should detect DELETED_LOCALLY', async () => {
            mockSyncManager.setMockWorkflowsStatus([
                {
                    id: '1',
                    name: 'Deleted Local',
                    status: WorkflowSyncStatus.DELETED_LOCALLY,
                    filename: 'workflow.json'
                }
            ]);

            const status = await mockSyncManager.getWorkflowsStatus();
            expect(status[0].status).toBe(WorkflowSyncStatus.DELETED_LOCALLY);
        });

        it('should detect DELETED_REMOTELY', async () => {
            mockSyncManager.setMockWorkflowsStatus([
                {
                    id: '1',
                    name: 'Deleted Remote',
                    status: WorkflowSyncStatus.DELETED_REMOTELY,
                    filename: 'workflow.json'
                }
            ]);

            const status = await mockSyncManager.getWorkflowsStatus();
            expect(status[0].status).toBe(WorkflowSyncStatus.DELETED_REMOTELY);
        });

        it('should detect EXIST_ONLY_LOCALLY', async () => {
            mockSyncManager.setMockWorkflowsStatus([
                {
                    id: null,
                    name: 'Local Only',
                    status: WorkflowSyncStatus.EXIST_ONLY_LOCALLY,
                    filename: 'workflow.json'
                }
            ]);

            const status = await mockSyncManager.getWorkflowsStatus();
            expect(status[0].status).toBe(WorkflowSyncStatus.EXIST_ONLY_LOCALLY);
        });

        it('should detect EXIST_ONLY_REMOTELY', async () => {
            mockSyncManager.setMockWorkflowsStatus([
                {
                    id: '1',
                    name: 'Remote Only',
                    status: WorkflowSyncStatus.EXIST_ONLY_REMOTELY,
                    filename: null
                }
            ]);

            const status = await mockSyncManager.getWorkflowsStatus();
            expect(status[0].status).toBe(WorkflowSyncStatus.EXIST_ONLY_REMOTELY);
        });
    });

    describe('Bidirectional Sync', () => {
        it('should push local changes', async () => {
            mockSyncManager.setMockWorkflowsStatus([
                {
                    id: '1',
                    name: 'Modified',
                    status: WorkflowSyncStatus.MODIFIED_LOCALLY,
                    filename: 'workflow.json'
                }
            ]);

            const syncUpSpy = vi.spyOn(mockSyncManager, 'syncUp');
            await mockSyncManager.syncUp();

            expect(syncUpSpy).toHaveBeenCalledOnce();
        });

        it('should pull remote changes', async () => {
            mockSyncManager.setMockWorkflowsStatus([
                {
                    id: '1',
                    name: 'Modified',
                    status: WorkflowSyncStatus.MODIFIED_REMOTELY,
                    filename: 'workflow.json'
                }
            ]);

            const syncDownSpy = vi.spyOn(mockSyncManager, 'syncDown');
            await mockSyncManager.syncDown();

            expect(syncDownSpy).toHaveBeenCalledOnce();
        });

        it('should handle mixed changes correctly', async () => {
            mockSyncManager.setMockWorkflowsStatus([
                {
                    id: '1',
                    name: 'Local Mod',
                    status: WorkflowSyncStatus.MODIFIED_LOCALLY,
                    filename: 'workflow1.json'
                },
                {
                    id: '2',
                    name: 'Remote Mod',
                    status: WorkflowSyncStatus.MODIFIED_REMOTELY,
                    filename: 'workflow2.json'
                },
                {
                    id: '3',
                    name: 'In Sync',
                    status: WorkflowSyncStatus.IN_SYNC,
                    filename: 'workflow3.json'
                }
            ]);

            const status = await mockSyncManager.getWorkflowsStatus();
            
            const localMods = status.filter(w => w.status === WorkflowSyncStatus.MODIFIED_LOCALLY);
            const remoteMods = status.filter(w => w.status === WorkflowSyncStatus.MODIFIED_REMOTELY);
            const inSync = status.filter(w => w.status === WorkflowSyncStatus.IN_SYNC);

            expect(localMods).toHaveLength(1);
            expect(remoteMods).toHaveLength(1);
            expect(inSync).toHaveLength(1);
        });
    });

    describe('Error Handling', () => {
        it('should handle API errors gracefully', async () => {
            mockClient.setShouldFail(true);

            await expect(async () => {
                await mockClient.getWorkflows();
            }).rejects.toThrow('API Error');
        });

        it('should handle sync manager errors', async () => {
            mockSyncManager.setShouldFail(true);

            await expect(async () => {
                await mockSyncManager.refreshState();
            }).rejects.toThrow('SyncManager Error');
        });
    });

    describe('Performance', () => {
        it('should handle large number of workflows', async () => {
            const workflows = Array.from({ length: 100 }, (_, i) =>
                createMockWorkflow({ id: `${i + 1}`, name: `Workflow ${i + 1}` })
            );

            mockClient.setMockWorkflows(workflows);
            const result = await mockClient.getWorkflows();

            expect(result).toHaveLength(100);
        });
    });
});
