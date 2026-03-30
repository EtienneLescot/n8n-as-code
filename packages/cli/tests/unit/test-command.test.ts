import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestCommand } from '../../src/commands/test.js';
import { ITestResult } from '../../src/core/types.js';

// ── Mock ora (suppress spinner output) ────────────────────────────────────────
vi.mock('ora', () => ({
    default: () => ({
        start: () => ({ stop: vi.fn(), fail: vi.fn() }),
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCommand(): TestCommand {
    // Set env vars so BaseCommand constructor does not call process.exit
    process.env.N8N_HOST = 'https://n8n.test';
    process.env.N8N_API_KEY = 'test-key';

    const cmd = new TestCommand();
    return cmd;
}

function makeResult(overrides: Partial<ITestResult>): ITestResult {
    return {
        success: false,
        triggerInfo: null,
        errorClass: null,
        ...overrides,
    };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TestCommand.run()', () => {
    let cmd: TestCommand;
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        cmd = makeCommand();
    });

    it('returns exit code 1 for invalid --data JSON', async () => {
        const code = await cmd.run('wf-1', { data: 'not-json' });
        expect(code).toBe(1);
    });

    it('returns exit code 1 for invalid --query JSON', async () => {
        const code = await cmd.run('wf-1', { query: 'not-json' });
        expect(code).toBe(1);
    });

    it('returns exit code 1 for non-object --data JSON', async () => {
        const code = await cmd.run('wf-1', { data: '["x"]' });
        expect(code).toBe(1);
    });

    it('returns exit code 1 for non-object --query JSON', async () => {
        const code = await cmd.run('wf-1', { query: '"x"' });
        expect(code).toBe(1);
    });

    it('returns exit code 0 on success (2xx)', async () => {
        vi.spyOn(cmd['client'], 'testWorkflow').mockResolvedValue(
            makeResult({
                success: true,
                statusCode: 200,
                errorClass: null,
            })
        );

        const code = await cmd.run('wf-1', {});
        expect(code).toBe(0);
    });

    it('returns exit code 0 for Class A (config-gap)', async () => {
        vi.spyOn(cmd['client'], 'testWorkflow').mockResolvedValue(
            makeResult({
                success: false,
                errorClass: 'config-gap',
                errorMessage: 'Credentials are missing',
                statusCode: 401,
            })
        );

        const code = await cmd.run('wf-1', {});
        expect(code).toBe(0);

        // Must mention configuration gap in output
        const output = consoleSpy.mock.calls.flat().join(' ');
        expect(output).toMatch(/configuration gap/i);
    });

    it('returns exit code 1 for Class B (wiring-error)', async () => {
        vi.spyOn(cmd['client'], 'testWorkflow').mockResolvedValue(
            makeResult({
                success: false,
                errorClass: 'wiring-error',
                errorMessage: "Can't get data for expression",
                statusCode: 500,
            })
        );

        const code = await cmd.run('wf-1', {});
        expect(code).toBe(1);

        const output = consoleSpy.mock.calls.flat().join(' ');
        expect(output).toMatch(/wiring error/i);
    });

    it('returns exit code 0 for schedule / non-HTTP trigger (errorClass null)', async () => {
        vi.spyOn(cmd['client'], 'testWorkflow').mockResolvedValue(
            makeResult({
                success: false,
                errorClass: null,
                errorMessage: 'Trigger type "schedule" cannot be called via HTTP.',
                notes: ['Use the n8n UI to activate the workflow.'],
            })
        );

        const code = await cmd.run('wf-1', {});
        expect(code).toBe(0);
    });

    it('returns exit code 1 when testWorkflow throws unexpectedly', async () => {
        vi.spyOn(cmd['client'], 'testWorkflow').mockRejectedValue(new Error('Network error'));

        const code = await cmd.run('wf-1', {});
        expect(code).toBe(1);
    });

    it('passes --data JSON and --prod flag to testWorkflow', async () => {
        const spy = vi.spyOn(cmd['client'], 'testWorkflow').mockResolvedValue(
            makeResult({ success: true, errorClass: null })
        );

        await cmd.run('wf-1', { data: '{"key":"value"}', prod: true });

        expect(spy).toHaveBeenCalledWith('wf-1', { data: { key: 'value' }, query: undefined, prod: true });
    });

    it('passes explicit --query JSON to testWorkflow', async () => {
        const spy = vi.spyOn(cmd['client'], 'testWorkflow').mockResolvedValue(
            makeResult({ success: true, errorClass: null })
        );

        await cmd.run('wf-1', { query: '{"chatInput":"hello"}' });

        expect(spy).toHaveBeenCalledWith('wf-1', {
            data: {},
            query: { chatInput: 'hello' },
            prod: false,
        });
    });
});
