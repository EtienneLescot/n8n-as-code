import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PreflightNodeValidator } from '../../src/core/services/preflight-node-validator.js';

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);
const TECHNICAL_INDEX = path.resolve(_dirname, '../../../skills/tests/fixtures/gating-nodes.json');

function makeWorkflowFile(name: string, workflow: unknown): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-preflight-'));
    const file = path.join(dir, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(workflow), 'utf8');
    return file;
}

const rlcWorkflow = {
    nodes: [
        {
            id: 'n1', name: 'Test', type: 'n8n-nodes-test.demoRlc', typeVersion: 1,
            position: [0, 0], parameters: { model: { mode: 'list', value: 'gpt-5-mini' } },
        },
    ],
    connections: {},
};

const cleanWorkflow = {
    nodes: [
        {
            id: 'n1', name: 'Test', type: 'n8n-nodes-test.demoRlc', typeVersion: 1,
            position: [0, 0], parameters: { model: { __rl: true, mode: 'list', value: 'gpt-5-mini' } },
        },
    ],
    connections: {},
};

function jsonResponse(payload: unknown, status = 200): Response {
    return {
        ok: status < 400,
        status,
        headers: { get: () => null },
        text: async () => JSON.stringify(payload),
    } as unknown as Response;
}

/** JSON-RPC mock that records every request and validates the tool calls it is asked to make. */
function jsonRpcMock(
    handler: (body: any) => unknown,
    calls: Array<{ method: string; params: any }> = [],
    inits: Array<any> = [],
): typeof fetch {
    return (async (_input: any, init?: any) => {
        inits.push(init);
        const body = JSON.parse(String(init?.body ?? '{}'));
        if (body.method) calls.push({ method: body.method, params: body.params });
        return jsonResponse({ jsonrpc: '2.0', id: body.id ?? 1, result: handler(body) });
    }) as typeof fetch;
}

function assertValidateNodeConfigCall(calls: Array<{ method: string; params: any }>): void {
    const call = calls.find((c) => c.method === 'tools/call');
    expect(call).toBeDefined();
    expect(call!.params.name).toBe('validate_node_config');
    expect(Array.isArray(call!.params.arguments?.nodes)).toBe(true);
    expect(call!.params.arguments.nodes.length).toBeGreaterThan(0);
}

const originalFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe('PreflightNodeValidator', () => {
    it('blocks a workflow file whose node the bundled schema rejects (resource-locator __rl)', async () => {
        const validator = new PreflightNodeValidator({ technicalIndexPath: TECHNICAL_INDEX });
        const outcome = await validator.validateFile(makeWorkflowFile('wf', rlcWorkflow));
        expect(outcome.source).toBe('local');
        expect(outcome.serverAttempted).toBe(false);
        expect(outcome.valid).toBe(false);
        expect(outcome.issues.some((i) => i.errors.some((e) => e.message.includes('__rl')))).toBe(true);
    });

    it('passes a clean workflow file', async () => {
        const validator = new PreflightNodeValidator({ technicalIndexPath: TECHNICAL_INDEX });
        const outcome = await validator.validateFile(makeWorkflowFile('wf', cleanWorkflow));
        expect(outcome.valid).toBe(true);
        expect(outcome.issues).toHaveLength(0);
    });

    it('uses the instance validate_node_config verdict when the MCP endpoint exposes it', async () => {
        const calls: Array<{ method: string; params: any }> = [];
        const inits: Array<any> = [];
        globalThis.fetch = jsonRpcMock((body) => {
            if (body.method === 'tools/list') {
                return { tools: [{ name: 'validate_node_config' }] };
            }
            if (body.method === 'tools/call') {
                return {
                    structuredContent: {
                        results: [
                            { name: 'Test', type: 'n8n-nodes-test.demoRlc', valid: false, errors: [{ path: 'parameters.model', message: 'Validation failed: "parameters.model.__rl" must be "true".' }] },
                        ],
                    },
                };
            }
            return {};
        }, calls, inits);

        const validator = new PreflightNodeValidator({ endpoint: 'https://instance.local/mcp-server/http', token: 'x', technicalIndexPath: TECHNICAL_INDEX });
        const outcome = await validator.validateFile(makeWorkflowFile('wf', cleanWorkflow));
        expect(outcome.source).toBe('server');
        expect(outcome.serverAttempted).toBe(true);
        expect(outcome.serverUnavailableReason).toBeUndefined();
        expect(outcome.valid).toBe(false);
        expect(outcome.issues[0].errors[0].message).toContain('parameters.model.__rl');
        assertValidateNodeConfigCall(calls);
        // Redirects must fail closed: no POST/DELETE may follow a 307/308 to
        // another destination with the session identifier or payload.
        expect(inits.length).toBeGreaterThan(0);
        for (const init of inits) {
            expect(init?.redirect).toBe('error');
        }
    });

    it('validates against the bundled schema (default) when the MCP server lacks validate_node_config', async () => {
        const calls: Array<{ method: string; params: any }> = [];
        globalThis.fetch = jsonRpcMock((body) => {
            if (body.method === 'tools/list') {
                return { tools: [{ name: 'search_workflows' }] };
            }
            if (body.method === 'tools/call') {
                // Any unexpected tool call is a routing regression — fail loudly.
                throw new Error(`unexpected call to ${body.method} (validate_node_config must not be called)`);
            }
            return {};
        }, calls);

        const validator = new PreflightNodeValidator({ endpoint: 'https://instance.local/mcp-server/http', token: 'x', technicalIndexPath: TECHNICAL_INDEX });
        const outcome = await validator.validateFile(makeWorkflowFile('wf', rlcWorkflow));
        expect(outcome.source).toBe('local');
        expect(outcome.serverAttempted).toBe(true);
        expect(outcome.serverUnavailableReason).toContain('does not expose validate_node_config');
        expect(outcome.valid).toBe(false);
        // validate_node_config must never be routed to a server that does not expose it.
        expect(calls.some((c) => c.method === 'tools/call')).toBe(false);
    });

    it('reports a degraded instance check alongside a valid bundled-schema result', async () => {
        const calls: Array<{ method: string; params: any }> = [];
        globalThis.fetch = jsonRpcMock((body) => {
            if (body.method === 'tools/list') {
                return { tools: [] };
            }
            throw new Error(`unexpected call to ${body.method}`);
        }, calls);

        const validator = new PreflightNodeValidator({ endpoint: 'https://instance.local/mcp-server/http', token: 'x', technicalIndexPath: TECHNICAL_INDEX });
        const outcome = await validator.validateFile(makeWorkflowFile('wf', cleanWorkflow));
        expect(outcome.valid).toBe(true);
        expect(outcome.serverAttempted).toBe(true);
        expect(outcome.serverUnavailableReason).toBeDefined();
    });

    it('never sends credentials to plaintext non-loopback endpoints (bundled schema is the default there)', async () => {
        let fetchCalled = false;
        globalThis.fetch = (async () => { fetchCalled = true; return jsonResponse({}); }) as typeof fetch;

        const validator = new PreflightNodeValidator({ endpoint: 'http://n8n.example.com/mcp-server/http', token: 'secret', technicalIndexPath: TECHNICAL_INDEX });
        const outcome = await validator.validateFile(makeWorkflowFile('wf', rlcWorkflow));
        expect(fetchCalled).toBe(false);
        expect(outcome.serverAttempted).toBe(true);
        expect(outcome.serverUnavailableReason).toContain('non-HTTPS');
        expect(outcome.source).toBe('local');
    });

    it('allows plaintext http on loopback endpoints (local self-hosted instances)', async () => {
        const calls: Array<{ method: string; params: any }> = [];
        globalThis.fetch = jsonRpcMock((body) => {
            if (body.method === 'tools/list') return { tools: [{ name: 'validate_node_config' }] };
            if (body.method === 'tools/call') return { structuredContent: { results: [{ name: 'Test', valid: true, errors: [] }] } };
            return {};
        }, calls);

        const validator = new PreflightNodeValidator({ endpoint: 'http://127.0.0.1:5678/mcp-server/http', token: 'x', technicalIndexPath: TECHNICAL_INDEX });
        const outcome = await validator.validateFile(makeWorkflowFile('wf', cleanWorkflow));
        expect(outcome.source).toBe('server');
        expect(outcome.valid).toBe(true);
    });
});
