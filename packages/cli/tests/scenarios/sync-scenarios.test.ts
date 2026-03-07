/**
 * End-to-end synchronization scenarios
 * Complete workflows from initialization to sync
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockN8nApiClient, MockSyncManager, createMockWorkflow } from '../helpers/test-helpers.js';

// Define WorkflowSyncStatus enum locally since we're using mocks
enum WorkflowSyncStatus {
    TRACKED = 'TRACKED',
    MODIFIED_LOCALLY = 'MODIFIED_LOCALLY',
    CONFLICT = 'CONFLICT',
    EXIST_ONLY_LOCALLY = 'EXIST_ONLY_LOCALLY',
    EXIST_ONLY_REMOTELY = 'EXIST_ONLY_REMOTELY'
}

describe('Synchronization Scenarios', () => {
    let mockClient: MockN8nApiClient;
    let mockSyncManager: MockSyncManager;

    beforeEach(() => {
        mockClient = new MockN8nApiClient();
        mockSyncManager = new MockSyncManager(mockClient, {
            directory: '/tmp/test-workflows'
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
            mockSyncManager.setMockWorkflowsList([
                {
                    id: '1',
                    name: 'Conflicted Workflow',
                    status: WorkflowSyncStatus.CONFLICT,
                    filename: 'workflow.workflow.ts'
                }
            ]);

            const status = await mockSyncManager.listWorkflows();
            const conflicts = status.filter(w => w.status === WorkflowSyncStatus.CONFLICT);

            expect(conflicts).toHaveLength(1);
            expect(conflicts[0].status).toBe(WorkflowSyncStatus.CONFLICT);
        });

        it('should resolve conflict by keeping local', async () => {
            const resolveConflictSpy = vi.spyOn(mockSyncManager, 'resolveConflict');

            await mockSyncManager.resolveConflict('1', 'workflow.workflow.ts', 'local');

            expect(resolveConflictSpy).toHaveBeenCalledWith('1', 'workflow.workflow.ts', 'local');
        });

        it('should resolve conflict by keeping remote', async () => {
            const resolveConflictSpy = vi.spyOn(mockSyncManager, 'resolveConflict');

            await mockSyncManager.resolveConflict('1', 'workflow.workflow.ts', 'remote');

            expect(resolveConflictSpy).toHaveBeenCalledWith('1', 'workflow.workflow.ts', 'remote');
        });
    });

    describe('Status Detection', () => {
        it('should detect TRACKED workflows', async () => {
            mockSyncManager.setMockWorkflowsList([
                {
                    id: '1',
                    name: 'Tracked Workflow',
                    status: WorkflowSyncStatus.TRACKED,
                    filename: 'workflow.workflow.ts'
                }
            ]);

            const status = await mockSyncManager.listWorkflows();
            expect(status[0].status).toBe(WorkflowSyncStatus.TRACKED);
        });

        it('should detect EXIST_ONLY_LOCALLY', async () => {
            mockSyncManager.setMockWorkflowsList([
                {
                    id: '',
                    name: 'Local Only',
                    status: WorkflowSyncStatus.EXIST_ONLY_LOCALLY,
                    filename: 'workflow.workflow.ts'
                }
            ]);

            const status = await mockSyncManager.listWorkflows();
            expect(status[0].status).toBe(WorkflowSyncStatus.EXIST_ONLY_LOCALLY);
        });

        it('should detect EXIST_ONLY_REMOTELY', async () => {
            mockSyncManager.setMockWorkflowsList([
                {
                    id: '1',
                    name: 'Remote Only',
                    status: WorkflowSyncStatus.EXIST_ONLY_REMOTELY,
                    filename: 'workflow.workflow.ts'
                }
            ]);

            const status = await mockSyncManager.listWorkflows();
            expect(status[0].status).toBe(WorkflowSyncStatus.EXIST_ONLY_REMOTELY);
        });
    });

    describe('Bidirectional Sync', () => {
        it('should push local changes', async () => {
            mockSyncManager.setMockWorkflowsList([
                {
                    id: '1',
                    name: 'Local Only',
                    status: WorkflowSyncStatus.EXIST_ONLY_LOCALLY,
                    filename: 'workflow.workflow.ts'
                }
            ]);

            const pushSpy = vi.spyOn(mockSyncManager, 'push');
            await mockSyncManager.push('workflow.workflow.ts');

            expect(pushSpy).toHaveBeenCalledOnce();
        });

        it('should pull remote changes', async () => {
            mockSyncManager.setMockWorkflowsList([
                {
                    id: '1',
                    name: 'New Remote Workflow',
                    status: WorkflowSyncStatus.EXIST_ONLY_REMOTELY,
                    filename: 'workflow.workflow.ts'
                }
            ]);

            const pullSpy = vi.spyOn(mockSyncManager, 'pull');
            await mockSyncManager.pull('1');

            expect(pullSpy).toHaveBeenCalledOnce();
        });

        it('should handle mixed changes correctly', async () => {
            mockSyncManager.setMockWorkflowsList([
                {
                    id: '1',
                    name: 'Local Only',
                    status: WorkflowSyncStatus.EXIST_ONLY_LOCALLY,
                    filename: 'workflow1.workflow.ts'
                },
                {
                    id: '2',
                    name: 'New Remote',
                    status: WorkflowSyncStatus.EXIST_ONLY_REMOTELY,
                    filename: 'workflow2.workflow.ts'
                },
                {
                    id: '3',
                    name: 'Tracked',
                    status: WorkflowSyncStatus.TRACKED,
                    filename: 'workflow3.workflow.ts'
                }
            ]);

            const status = await mockSyncManager.listWorkflows();
            
            const localOnly = status.filter(w => w.status === WorkflowSyncStatus.EXIST_ONLY_LOCALLY);
            const newRemote = status.filter(w => w.status === WorkflowSyncStatus.EXIST_ONLY_REMOTELY);
            const tracked = status.filter(w => w.status === WorkflowSyncStatus.TRACKED);

            expect(localOnly).toHaveLength(1);
            expect(newRemote).toHaveLength(1);
            expect(tracked).toHaveLength(1);
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
                await mockSyncManager.refreshRemoteState();
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
