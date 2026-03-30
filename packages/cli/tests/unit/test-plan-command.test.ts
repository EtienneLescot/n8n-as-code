import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestPlanCommand } from '../../src/commands/test-plan.js';
import { ITestPlan } from '../../src/core/types.js';

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

function makeCommand(): TestPlanCommand {
    // Set env vars so BaseCommand constructor does not call process.exit
    process.env.N8N_HOST = 'https://n8n.test';
    process.env.N8N_API_KEY = 'test-key';

    return new TestPlanCommand();
}

const TESTABLE_PLAN: ITestPlan = {
    workflowId: 'wf-1',
    workflowName: 'My Webhook Workflow',
    testable: true,
    reason: null,
    triggerInfo: {
        type: 'webhook',
        nodeId: 'node-1',
        nodeName: 'Webhook',
        webhookPath: 'my-path',
        httpMethod: 'POST',
    },
    endpoints: {
        testUrl: 'https://n8n.test/webhook-test/my-path',
        productionUrl: 'https://n8n.test/webhook/my-path',
    },
    payload: {
        inferred: { body: { email: 'user@example.com' } },
        confidence: 'low',
        fields: [{ path: 'email', source: 'body', example: 'user@example.com', required: true, evidence: [] }],
        notes: ['Payload is inferred heuristically.'],
    },
};

const NON_TESTABLE_PLAN: ITestPlan = {
    workflowId: 'wf-2',
    workflowName: 'Schedule Workflow',
    testable: false,
    reason: 'Trigger type "schedule" cannot be invoked via HTTP.',
    triggerInfo: {
        type: 'schedule',
        nodeId: 'node-1',
        nodeName: 'Schedule Trigger',
    },
    endpoints: {},
    payload: null,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TestPlanCommand.run()', () => {
    let cmd: TestPlanCommand;
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        cmd = makeCommand();
    });

    it('returns exit code 0 for a testable workflow (human output)', async () => {
        vi.spyOn(cmd['client'], 'getTestPlan').mockResolvedValue(TESTABLE_PLAN);

        const code = await cmd.run('wf-1', {});
        expect(code).toBe(0);

        const output = consoleSpy.mock.calls.flat().join(' ');
        expect(output).toMatch(/testable via HTTP/i);
        expect(output).toContain('https://n8n.test/webhook-test/my-path');
        expect(output).toMatch(/manual arm step|Listen for test event|Execute workflow/i);
    });

    it('prints a GET/query hint for GET webhooks', async () => {
        vi.spyOn(cmd['client'], 'getTestPlan').mockResolvedValue({
            ...TESTABLE_PLAN,
            triggerInfo: {
                ...TESTABLE_PLAN.triggerInfo!,
                httpMethod: 'GET',
            },
        });

        const code = await cmd.run('wf-1', {});
        expect(code).toBe(0);

        const output = consoleSpy.mock.calls.flat().join(' ');
        expect(output).toContain('n8nac test wf-1 --query');
        expect(output).toMatch(/maps to query params/i);
    });

    it('returns exit code 1 for a non-testable workflow (human output)', async () => {
        vi.spyOn(cmd['client'], 'getTestPlan').mockResolvedValue(NON_TESTABLE_PLAN);

        const code = await cmd.run('wf-2', {});
        expect(code).toBe(1);

        const output = consoleSpy.mock.calls.flat().join(' ');
        expect(output).toMatch(/not testable via HTTP/i);
    });

    it('returns exit code 0 for a testable workflow (--json output)', async () => {
        vi.spyOn(cmd['client'], 'getTestPlan').mockResolvedValue(TESTABLE_PLAN);

        const code = await cmd.run('wf-1', { json: true });
        expect(code).toBe(0);

        // The first console.log call should be the JSON payload
        const jsonOutput = consoleSpy.mock.calls[0]?.[0];
        expect(jsonOutput).toBeDefined();
        const parsed = JSON.parse(jsonOutput as string);
        expect(parsed.testable).toBe(true);
        expect(parsed.endpoints.testUrl).toBe('https://n8n.test/webhook-test/my-path');
    });

    it('returns exit code 1 for a non-testable workflow (--json output)', async () => {
        vi.spyOn(cmd['client'], 'getTestPlan').mockResolvedValue(NON_TESTABLE_PLAN);

        const code = await cmd.run('wf-2', { json: true });
        expect(code).toBe(1);

        const jsonOutput = consoleSpy.mock.calls[0]?.[0];
        const parsed = JSON.parse(jsonOutput as string);
        expect(parsed.testable).toBe(false);
        expect(parsed.reason).toMatch(/schedule/i);
    });

    it('returns exit code 1 when getTestPlan throws unexpectedly', async () => {
        vi.spyOn(cmd['client'], 'getTestPlan').mockRejectedValue(new Error('Network error'));

        const code = await cmd.run('wf-1', {});
        expect(code).toBe(1);
    });
});
