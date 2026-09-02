import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncCommand } from '../../src/commands/sync.js';
import { SyncManager } from '../../src/core/services/sync-manager.js';
import { WorkflowSyncStatus } from '../../src/core/types.js';
import { installV4WorkspaceFixture } from '../helpers/v4-workspace-fixture.js';

installV4WorkspaceFixture();

// ── Mock ora (suppress spinner output) ────────────────────────────────────────
vi.mock('ora', () => ({
    default: () => ({
        start: () => ({
            stop: vi.fn(),
            fail: vi.fn(),
            succeed: vi.fn(),
        }),
    }),
}));

// ── Mock chalk (return plain strings so assertions are readable) ──────────────
vi.mock('chalk', () => {
    const identity = (s: string) => s;
    const proxy: any = new Proxy(identity, {
        get: (_target, prop) => {
            if (prop === 'level') return 0;
            return proxy;
        },
        apply: (_target, _this, args) => args[0],
    });
    return { default: proxy };
});

describe('SyncCommand exit codes on conflict', () => {
    let cmd: SyncCommand;
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
            throw new Error(`process.exit:${code ?? 0}`);
        }) as never);

        cmd = new SyncCommand();
    });

    describe('pushOne', () => {
        it('exits 1 when conflict is detected before push', async () => {
            vi.spyOn(SyncManager.prototype, 'refreshLocalState').mockResolvedValue(undefined as any);
            vi.spyOn(SyncManager.prototype, 'resolvePushTarget').mockReturnValue({
                filename: 'my-workflow.workflow.ts',
                sourceDirectory: '/fake/dir',
                resolvedPath: '/fake/dir/my-workflow.workflow.ts',
            } as any);
            vi.spyOn(SyncManager.prototype, 'getWorkflowIdForFilename').mockReturnValue('wf-123');
            vi.spyOn(SyncManager.prototype, 'fetch').mockResolvedValue(true as any);
            vi.spyOn(SyncManager.prototype, 'getSingleWorkflowDetailedStatus').mockResolvedValue({
                status: WorkflowSyncStatus.CONFLICT,
            } as any);
            const recordPushRejectedSpy = vi.spyOn(SyncManager.prototype, 'recordWorkflowPushRejected').mockResolvedValue(undefined as any);

            await expect(cmd.pushOne('workflows/dev/my-workflow.workflow.ts')).rejects.toThrow('process.exit:1');

            expect(recordPushRejectedSpy).toHaveBeenCalledWith('my-workflow.workflow.ts', 'wf-123', 'Conflict detected before push');
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Conflict detected for workflow wf-123'));
        });

        it('exits 1 when push throws "modified in the n8n UI" error', async () => {
            vi.spyOn(SyncManager.prototype, 'refreshLocalState').mockResolvedValue(undefined as any);
            vi.spyOn(SyncManager.prototype, 'resolvePushTarget').mockReturnValue({
                filename: 'my-workflow.workflow.ts',
                sourceDirectory: '/fake/dir',
                resolvedPath: '/fake/dir/my-workflow.workflow.ts',
            } as any);
            vi.spyOn(SyncManager.prototype, 'getWorkflowIdForFilename').mockReturnValue('wf-123');
            vi.spyOn(SyncManager.prototype, 'fetch').mockResolvedValue(true as any);
            vi.spyOn(SyncManager.prototype, 'getSingleWorkflowDetailedStatus').mockResolvedValue({
                status: WorkflowSyncStatus.MODIFIED_LOCALLY,
            } as any);
            vi.spyOn(SyncManager.prototype, 'push').mockRejectedValue(new Error('Workflow was modified in the n8n UI since last sync'));

            await expect(cmd.pushOne('workflows/dev/my-workflow.workflow.ts')).rejects.toThrow('process.exit:1');
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Conflict detected: Workflow was modified in the n8n UI since last sync'));
        });

        it('returns workflowId and does not exit on successful push', async () => {
            vi.spyOn(SyncManager.prototype, 'refreshLocalState').mockResolvedValue(undefined as any);
            vi.spyOn(SyncManager.prototype, 'resolvePushTarget').mockReturnValue({
                filename: 'my-workflow.workflow.ts',
                sourceDirectory: '/fake/dir',
                resolvedPath: '/fake/dir/my-workflow.workflow.ts',
            } as any);
            vi.spyOn(SyncManager.prototype, 'getWorkflowIdForFilename').mockReturnValue('wf-123');
            vi.spyOn(SyncManager.prototype, 'fetch').mockResolvedValue(true as any);
            vi.spyOn(SyncManager.prototype, 'getSingleWorkflowDetailedStatus').mockResolvedValue({
                status: WorkflowSyncStatus.MODIFIED_LOCALLY,
            } as any);
            vi.spyOn(SyncManager.prototype, 'push').mockResolvedValue('wf-123');

            const result = await cmd.pushOne('workflows/dev/my-workflow.workflow.ts');
            expect(result).toBe('wf-123');
        });
    });

    describe('pullOne', () => {
        it('exits 1 when conflict status is detected before pull', async () => {
            vi.spyOn(SyncManager.prototype, 'refreshLocalState').mockResolvedValue(undefined as any);
            vi.spyOn(SyncManager.prototype, 'fetch').mockResolvedValue(true as any);
            vi.spyOn(SyncManager.prototype, 'getFilenameForId').mockReturnValue('my-workflow.workflow.ts');
            vi.spyOn(SyncManager.prototype, 'getSingleWorkflowDetailedStatus').mockResolvedValue({
                status: WorkflowSyncStatus.CONFLICT,
            } as any);

            await expect(cmd.pullOne('wf-123')).rejects.toThrow('process.exit:1');
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Conflict detected for workflow wf-123'));
        });

        it('exits 1 when local changes conflict before pull', async () => {
            vi.spyOn(SyncManager.prototype, 'refreshLocalState').mockResolvedValue(undefined as any);
            vi.spyOn(SyncManager.prototype, 'fetch').mockResolvedValue(true as any);
            vi.spyOn(SyncManager.prototype, 'getFilenameForId').mockReturnValue('my-workflow.workflow.ts');
            vi.spyOn(SyncManager.prototype, 'getSingleWorkflowDetailedStatus').mockResolvedValue({
                status: WorkflowSyncStatus.TRACKED,
                localHash: 'hash-local',
                lastSyncedHash: 'hash-synced',
            } as any);

            await expect(cmd.pullOne('wf-123')).rejects.toThrow('process.exit:1');
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Conflict detected for workflow wf-123'));
        });

        it('pulls successfully without exiting when no conflict', async () => {
            vi.spyOn(SyncManager.prototype, 'refreshLocalState').mockResolvedValue(undefined as any);
            vi.spyOn(SyncManager.prototype, 'fetch').mockResolvedValue(true as any);
            vi.spyOn(SyncManager.prototype, 'getFilenameForId').mockReturnValue('my-workflow.workflow.ts');
            vi.spyOn(SyncManager.prototype, 'getSingleWorkflowDetailedStatus').mockResolvedValue({
                status: WorkflowSyncStatus.TRACKED,
                localHash: 'hash-same',
                lastSyncedHash: 'hash-same',
            } as any);
            const pullSpy = vi.spyOn(SyncManager.prototype, 'pull').mockResolvedValue({} as any);

            await cmd.pullOne('wf-123');
            expect(pullSpy).toHaveBeenCalledWith('wf-123');
        });
    });
});
