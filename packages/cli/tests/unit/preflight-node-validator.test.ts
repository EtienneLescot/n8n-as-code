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

function jsonResponse(payload: unknown): Response {
    return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify(payload),
    } as unknown as Response;
}

function jsonRpcMock(handler: (body: any) => unknown): typeof fetch {
    return (async (_input: any, init?: any) => {
        const body = JSON.parse(String(init?.body ?? '{}'));
        return jsonResponse({ jsonrpc: '2.0', id: body.id ?? 1, result: handler(body) });
    }) as typeof fetch;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe('PreflightNodeValidator', () => {
    it('blocks a workflow file whose node the local schema rejects (resource-locator __rl)', async () => {
        const validator = new PreflightNodeValidator({ technicalIndexPath: TECHNICAL_INDEX });
        const outcome = await validator.validateFile(makeWorkflowFile('wf', rlcWorkflow));
        expect(outcome.source).toBe('local');
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
        });

        const validator = new PreflightNodeValidator({ endpoint: 'http://127.0.0.1:5678/mcp-server/http', token: 'x', technicalIndexPath: TECHNICAL_INDEX });
        const outcome = await validator.validateFile(makeWorkflowFile('wf', cleanWorkflow));
        expect(outcome.source).toBe('server');
        expect(outcome.valid).toBe(false);
        expect(outcome.issues[0].errors[0].message).toContain('parameters.model.__rl');
    });

    it('falls back to the local schema when the MCP server lacks validate_node_config', async () => {
        globalThis.fetch = jsonRpcMock((body) => {
            if (body.method === 'tools/list') {
                return { tools: [{ name: 'search_workflows' }] };
            }
            return {};
        });

        const validator = new PreflightNodeValidator({ endpoint: 'http://127.0.0.1:5678/mcp-server/http', token: 'x', technicalIndexPath: TECHNICAL_INDEX });
        const outcome = await validator.validateFile(makeWorkflowFile('wf', rlcWorkflow));
        expect(outcome.source).toBe('local');
        expect(outcome.valid).toBe(false);
        expect(outcome.skippedReason).toContain('does not expose validate_node_config');
    });
});
