import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutionCommand } from '../../src/commands/execution.js';

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

function makeCommand(): ExecutionCommand {
    process.env.N8N_HOST = 'https://n8n.test';
    process.env.N8N_API_KEY = 'test-key';
    return new ExecutionCommand();
}

describe('ExecutionCommand', () => {
    let cmd: ExecutionCommand;
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
            throw new Error(`process.exit:${code ?? 0}`);
        }) as never);
        cmd = makeCommand();
    });

    it('prints JSON execution lists for agents and scripts', async () => {
        vi.spyOn(cmd['client'], 'listExecutions').mockResolvedValue({
            data: [
                {
                    id: '42',
                    finished: true,
                    mode: 'webhook',
                    retryOf: null,
                    retrySuccessId: null,
                    startedAt: '2026-03-30T10:00:00.000Z',
                    stoppedAt: '2026-03-30T10:00:01.000Z',
                    workflowId: '7',
                    waitTill: null,
                    status: 'error',
                },
            ],
            nextCursor: null,
        } as any);

        await cmd.list({ workflowId: '7', limit: 5, json: true });

        expect(logSpy).toHaveBeenCalledWith(JSON.stringify({
            data: [
                {
                    id: '42',
                    finished: true,
                    mode: 'webhook',
                    retryOf: null,
                    retrySuccessId: null,
                    startedAt: '2026-03-30T10:00:00.000Z',
                    stoppedAt: '2026-03-30T10:00:01.000Z',
                    workflowId: '7',
                    waitTill: null,
                    status: 'error',
                },
            ],
            nextCursor: null,
        }, null, 2));
    });

    it('prints JSON for a single execution', async () => {
        vi.spyOn(cmd['client'], 'getExecution').mockResolvedValue({
            id: '42',
            finished: true,
            mode: 'webhook',
            retryOf: null,
            retrySuccessId: null,
            startedAt: '2026-03-30T10:00:00.000Z',
            stoppedAt: '2026-03-30T10:00:01.000Z',
            workflowId: '7',
            waitTill: null,
            status: 'error',
            data: { resultData: { error: { message: 'OpenAI quota exceeded' } } },
        } as any);

        await cmd.get('42', { includeData: true });

        expect(logSpy).toHaveBeenCalledWith(JSON.stringify({
            id: '42',
            finished: true,
            mode: 'webhook',
            retryOf: null,
            retrySuccessId: null,
            startedAt: '2026-03-30T10:00:00.000Z',
            stoppedAt: '2026-03-30T10:00:01.000Z',
            workflowId: '7',
            waitTill: null,
            status: 'error',
            data: { resultData: { error: { message: 'OpenAI quota exceeded' } } },
        }, null, 2));
    });

    it('surfaces execution lookup failures with backend details', async () => {
        vi.spyOn(cmd['client'], 'getExecution').mockRejectedValue({
            response: {
                status: 404,
                data: { message: 'Not Found' },
            },
        });

        await expect(cmd.get('999', { includeData: true })).rejects.toThrow('process.exit:1');
        expect(errorSpy).toHaveBeenCalledWith('❌ Failed to fetch execution 999: HTTP 404: Not Found');
    });
});
