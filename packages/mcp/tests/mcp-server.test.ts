import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { N8nAsCodeMcpService } from '../src/services/mcp-service';

/**
 * These assert the payloads the MCP tools actually return, against fixture assets.
 *
 * They used to spy on the argv handed to a spawned CLI, which asserted the shape of an
 * implementation detail and would have kept passing while the returned data was wrong —
 * `examples search` silently returned `[]` in production for exactly that reason.
 */

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(_dirname, '../../skills/tests/fixtures');

describe('N8nAsCodeMcpService', () => {
    let tempDir: string;
    let service: N8nAsCodeMcpService;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-mcp-'));
        service = new N8nAsCodeMcpService({ cwd: tempDir, assetsDir: FIXTURES });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('searches the local knowledge base', async () => {
        const results: any = await service.searchKnowledge('gmail', { limit: 5 });

        expect(Array.isArray(results.results)).toBe(true);
        expect(results.results.length).toBeGreaterThan(0);
        expect(results.results.length).toBeLessThanOrEqual(5);
    });

    test('returns node info as a bare object, not an array', async () => {
        const node: any = await service.getNodeInfo('gmail');

        expect(Array.isArray(node)).toBe(false);
        expect(node.name).toBe('gmail');
        expect(node.type).toBe('n8n-nodes-base.gmail');
    });

    test('looks up several nodes in one call', async () => {
        const result: any = await service.getNodeInfo(['gmail', 'httpRequest']);

        expect(result.nodes.map((n: any) => n.name).sort()).toEqual(['gmail', 'httpRequest']);
        expect(result.notFound).toEqual([]);
        expect(result.inexactMatches).toEqual([]);
    });

    test('a batch reports the names it could not resolve rather than dropping them', async () => {
        // Returning only what resolved lets a typo look like a node with no parameters.
        const result: any = await service.getNodeInfo(['gmail', 'definitelyNotANode']);

        expect(result.nodes).toHaveLength(1);
        expect(result.notFound).toEqual(['definitelyNotANode']);
    });

    test('a compact batch carries the misses as a comment line', async () => {
        const compact: any = await service.getNodeInfo(['gmail', 'definitelyNotANode'], { compact: true });

        expect(compact).toContain('// not found: definitelyNotANode');
        expect(compact).toContain('n8n-nodes-base.gmail');
    });

    test('compact returns a bounded projection, not the full schema', async () => {
        const full: any = await service.getNodeInfo('gmail');
        const compact: any = await service.getNodeInfo('gmail', { compact: true });

        expect(typeof compact).toBe('string');
        expect(compact).toContain('n8n-nodes-base.gmail');
        expect(compact.length).toBeLessThan(JSON.stringify(full).length);
        // Bounded regardless of node size. The fixture nodes are small; against the real
        // ontology this is the difference between ~0.4KB and ~127KB for gmail.
        expect(compact.length).toBeLessThan(4000);
    });

    test('compact joins several nodes into one document', async () => {
        const compact: any = await service.getNodeInfo(['gmail', 'httpRequest'], { compact: true });

        expect(compact).toContain('n8n-nodes-base.gmail');
        expect(compact).toContain('n8n-nodes-base.httpRequest');
    });

    test('reports every missing name when none of them resolve', async () => {
        await expect(service.getNodeInfo(['nopeOne', 'nopeTwo']))
            .rejects.toThrow("Node 'nopeOne', 'nopeTwo' not found.");
    });

    test('resolves a node through the same fuzzy match the CLI uses', async () => {
        const node: any = await service.getNodeInfo('Gmail');

        expect(node.type).toBe('n8n-nodes-base.gmail');
    });

    test('throws with the CLI wording when a node does not exist', async () => {
        await expect(service.getNodeInfo('definitelyNotANode'))
            .rejects.toThrow("Node 'definitelyNotANode' not found.");
    });

    test('searches bundled workflow examples and actually finds them', async () => {
        const examples: any = await service.searchExamples('slack', 5);

        expect(examples.length).toBeGreaterThan(0);
        expect(examples[0].name).toBe('Slack Alert Workflow');
    });

    test('searches docs and unwraps the results array', async () => {
        const docs: any = await service.searchDocs('gmail', { limit: 3 });

        expect(Array.isArray(docs)).toBe(true);
    });

    test('returns workflow example info with a raw URL', async () => {
        const example: any = await service.getExampleInfo('916');

        expect(example.name).toBe('Slack Alert Workflow');
        expect(example.rawUrl).toContain('workflows/slack-alert-workflow/workflow.json');
    });

    test('reports a missing workflow example instead of returning undefined', async () => {
        await expect(service.getExampleInfo('does-not-exist'))
            .rejects.toThrow('Workflow with ID "does-not-exist" not found.');
    });

    test('validates workflow content passed as JSON text', async () => {
        const result: any = await service.validateWorkflow({
            workflowContent: JSON.stringify({
                nodes: [
                    {
                        id: '1',
                        name: 'Webhook',
                        type: 'n8n-nodes-base.webhook',
                        typeVersion: 2.1,
                        position: [100, 100],
                        parameters: {},
                    },
                ],
                connections: {},
            }),
        });

        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('warnings');
    });

    test('rejects malformed JSON workflow content', async () => {
        await expect(service.validateWorkflow({ workflowContent: '{ not json' }))
            .rejects.toThrow(/Invalid JSON workflow content/);
    });

    test('returns an invalid workflow as a normal result rather than throwing', async () => {
        const result: any = await service.validateWorkflow({
            workflowContent: JSON.stringify({ nodes: 'not-an-array', connections: {} }),
        });

        expect(result.valid).toBe(false);
    });
});
