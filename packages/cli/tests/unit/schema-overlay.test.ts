import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseNodeTypeDefinitions } from '../../src/core/services/node-schema-defs-parser.js';
import { SchemaOverlayManager } from '../../src/core/services/schema-overlay-manager.js';

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);
const DEFS_DIR = path.resolve(_dirname, '../fixtures/mcp-defs');

function defs(name: string): string {
    return fs.readFileSync(path.join(DEFS_DIR, `${name}.txt`), 'utf8');
}

function section(name: string, version: number) {
    const parsed = parseNodeTypeDefinitions(defs(name));
    return parsed.find((s) => s.type.toLowerCase().includes(name.toLowerCase()) && Math.abs(s.version - version) < 0.01);
}

describe('node-schema-defs-parser', () => {
    it('parses memoryBufferWindow v1.4 with customKey gating', () => {
        const s = section('memory', 1.4);
        expect(s).toBeDefined();
        const sessionKey = s!.properties.find((p) => p.name === 'sessionKey');
        expect(sessionKey).toBeDefined();
        expect(sessionKey!.displayOptions?.show?.sessionIdType).toEqual(['customKey']);
        expect(sessionKey!.required).toBe(false);
        const sessionIdType = s!.properties.find((p) => p.name === 'sessionIdType');
        expect(sessionIdType!.default).toBe('fromInput');
    });

    it('parses html v1.2 with operation gating and defaults', () => {
        const s = section('html', 1.2);
        expect(s).toBeDefined();
        const dataPropertyName = s!.properties.find((p) => p.name === 'dataPropertyName');
        expect(dataPropertyName).toBeDefined();
        expect(dataPropertyName!.displayOptions?.show?.operation).toEqual(['extractHtmlContent']);
        expect(dataPropertyName!.default).toBe('data');
        const op = s!.properties.find((p) => p.name === 'operation');
        expect(op!.type).toBe('options');
        expect(op!.options?.map((o) => o.value)).toContain('generateHtmlTemplate');
    });

    it('parses lmChatOpenAi v1.3 resource-locator model and /-rooted gating', () => {
        const s = section('lmchat', 1.3);
        expect(s).toBeDefined();
        const model = s!.properties.find((p) => p.name === 'model');
        expect(model!.type).toBe('resourceLocator');
        const builtInTools = s!.properties.find((p) => p.name === 'builtInTools');
        expect(builtInTools!.displayOptions?.show?.['/responsesApiEnabled']).toEqual([true]);
    });

    it('parses agent v3.1 required text under promptType define', () => {
        const s = section('agent', 3.1);
        expect(s).toBeDefined();
        const promptType = s!.properties.find((p) => p.name === 'promptType');
        expect(promptType!.default).toBe('auto');
        const text = s!.properties.find((p) => p.name === 'text');
        expect(text).toBeDefined();
        expect(text!.required).toBe(true);
        expect(text!.displayOptions?.show?.promptType).toEqual(['define']);
    });

    it('supports one interface and one object type alias with literal unions', () => {
        const parsed = parseNodeTypeDefinitions([
            '## n8n-nodes-base.singleNode (v10)',
            '',
            '```typescript',
            'export interface SingleNodeV10Params {',
            "    mode?: 'one' | 'two';",
            '}',
            '```',
            '',
            '## n8n-nodes-base.aliasNode (v10)',
            '',
            '```typescript',
            'export type AliasNodeV10Params = {',
            "    mode?: 'one' | 'two';",
            '};',
            '```',
        ].join('\n'));

        expect(parsed).toHaveLength(2);
        expect(parsed[0].properties[0].options?.map((option) => option.value)).toEqual(['one', 'two']);
        expect(parsed[1].properties[0].options?.map((option) => option.value)).toEqual(['one', 'two']);
    });

    it('skips definitions with multiple Params variants', () => {
        const parsed = parseNodeTypeDefinitions([
            '## n8n-nodes-base.switch (v22)',
            '',
            '```typescript',
            'export type SwitchV22Params = SwitchV22ExpressionParams | SwitchV22RulesParams;',
            'export interface SwitchV22ExpressionParams {',
            "    mode?: 'expression';",
            '}',
            'export interface SwitchV22RulesParams {',
            "    mode?: 'rules';",
            '}',
            '```',
        ].join('\n'));

        expect(parsed).toEqual([]);
    });
});

describe('SchemaOverlayManager', () => {
    it('materialises a provider sidecar that the validator can merge', async () => {
        const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-'));
        const manager = new SchemaOverlayManager({
            endpoint: 'https://unused.local',
            token: 'x',
            cacheDir,
            client: {
                listTools: async () => [],
                callTool: async (_name: string, args: any) => ({
                    structuredContent: { definitions: defs('memory') },
                }),
            } as any,
        });
        const types = [{ type: '@n8n/n8n-nodes-langchain.memoryBufferWindow', version: '1.4' }];
        const result = await manager.ensureForTypes(types);
        expect(result.overlayPath.endsWith('.schema-overlay.json')).toBe(true);
        expect(result.failed).toEqual([]);
        expect(fs.existsSync(manager.providerFilePath)).toBe(true);

        const provider = JSON.parse(fs.readFileSync(manager.providerFilePath, 'utf8'));
        const entry = provider.nodes['@n8n/n8n-nodes-langchain.memoryBufferWindow'];
        expect(entry).toBeDefined();
        expect(entry.version).toEqual([1.4]);
        const props = entry.schema.properties;
        expect(props.find((p: any) => p.name === 'sessionKey')?.displayOptions?.show?.sessionIdType).toEqual(['customKey']);
    });

    it('does not re-fetch fresh entries (economy)', async () => {
        const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-'));
        let calls = 0;
        const manager = new SchemaOverlayManager({
            endpoint: 'https://unused.local',
            token: 'x',
            cacheDir,
            client: {
                listTools: async () => [],
                callTool: async (_name: string, args: any) => {
                    calls += 1;
                    return { structuredContent: { definitions: defs('memory') } };
                },
            } as any,
        });
        const types = [{ type: '@n8n/n8n-nodes-langchain.memoryBufferWindow', version: '1.4' }];
        await manager.ensureForTypes(types);
        await manager.ensureForTypes(types);
        expect(calls).toBe(1);
        expect(manager.isFresh(types)).toBe(true);
        expect(JSON.parse(fs.readFileSync(path.join(cacheDir, '.schema-overlay.json'), 'utf8')).schemaVersion).toBe(2);
    });

    it('keeps discriminator variants of one type separate (resource/operation identity)', async () => {
        const combo = (resource: string, operation: string, marker: string) => [
            '# TypeScript Type Definitions',
            '',
            '## n8n-nodes-base.gmailTool (v22)',
            '',
            '```typescript',
            `* Discriminator: resource=${resource}, operation=${operation}`,
            'export interface GmailV22Params {',
            `    marker?: '${marker}';`,
            '}',
            '```',
            '',
        ].join('\n');
        const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-'));
        const manager = new SchemaOverlayManager({
            endpoint: 'https://unused.local',
            token: 'x',
            cacheDir,
            client: {
                listTools: async () => [],
                callTool: async () => ({
                    structuredContent: {
                        definitions: `${combo('message', 'get_all', 'getAllMarker')}\n${combo('message', 'send', 'sendMarker')}`,
                    },
                }),
            } as any,
        });
        const getAll = { type: 'n8n-nodes-base.gmailTool', version: '2.2', resource: 'message', operation: 'get_all' };
        const send = { type: 'n8n-nodes-base.gmailTool', version: '2.2', resource: 'message', operation: 'send' };
        const result = await manager.ensureForTypes([getAll, send]);
        expect(result.failed).toEqual([]);

        // Freshness is tracked per full identity, not per type@version.
        expect(manager.isFresh([getAll])).toBe(true);
        expect(manager.isFresh([send])).toBe(true);
        expect(manager.isFresh([{ ...getAll, operation: 'delete' }])).toBe(false);

        const provider = JSON.parse(fs.readFileSync(manager.providerFilePath, 'utf8'));
        const props = provider.nodes['n8n-nodes-base.gmailTool'].schema.properties;
        const getAllProp = props.find((p: any) => p.name === 'marker' && p.displayOptions?.show?.operation?.includes('get_all'));
        const sendProp = props.find((p: any) => p.name === 'marker' && p.displayOptions?.show?.operation?.includes('send'));
        expect(getAllProp).toBeDefined();
        expect(sendProp).toBeDefined();
        // Both variants stay distinguishable: no cross-contamination of conditions.
        expect(getAllProp.displayOptions.show.operation).toEqual(['get_all']);
        expect(sendProp.displayOptions.show.operation).toEqual(['send']);
    });

    it('falls back for the whole type when one discriminator variant is unsupported', async () => {
        const definitions = [
            '# TypeScript Type Definitions',
            '',
            '## n8n-nodes-base.code (v20)',
            '',
            '```typescript',
            'export interface CodeV20Params {',
            "    marker?: 'unrelated';",
            '}',
            '```',
            '',
            '## n8n-nodes-base.gmailTool (v22)',
            '',
            '```typescript',
            '* Discriminator: resource=message, operation=get_all',
            'export interface GmailV22Params {',
            "    marker?: 'getAll';",
            '}',
            '```',
            '',
            '## n8n-nodes-base.gmailTool (v22)',
            '',
            '```typescript',
            '* Discriminator: resource=message, operation=send',
            'export type GmailV22Params = GmailV22SendExpressionParams | GmailV22SendRulesParams;',
            'export interface GmailV22SendExpressionParams {',
            "    marker?: 'sendExpression';",
            '}',
            'export interface GmailV22SendRulesParams {',
            "    marker?: 'sendRules';",
            '}',
            '```',
        ].join('\n');
        const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-'));
        let calls = 0;
        const manager = new SchemaOverlayManager({
            endpoint: 'https://unused.local',
            token: 'x',
            cacheDir,
            client: {
                listTools: async () => [],
                callTool: async () => {
                    calls += 1;
                    return { structuredContent: { definitions } };
                },
            } as any,
        });
        const getAll = { type: 'n8n-nodes-base.gmailTool', version: '2.2', resource: 'message', operation: 'get_all' };
        const send = { type: 'n8n-nodes-base.gmailTool', version: '2.2', resource: 'message', operation: 'send' };
        const code = { type: 'n8n-nodes-base.code', version: '2.0' };

        try {
            const first = await manager.ensureForTypes([getAll, send, code]);
            expect(first.failed).toEqual(['n8n-nodes-base.gmailTool@2.2/message:send']);
            const cache = JSON.parse(fs.readFileSync(path.join(cacheDir, '.schema-overlay.json'), 'utf8'));
            expect(cache.nodes['n8n-nodes-base.gmailTool'].versions['2.2|message|get_all']).toBeDefined();
            let provider = JSON.parse(fs.readFileSync(manager.providerFilePath, 'utf8'));
            expect(provider.nodes['n8n-nodes-base.gmailTool']).toBeUndefined();
            expect(provider.nodes['n8n-nodes-base.code']).toBeDefined();

            const supportedOnly = await manager.ensureForTypes([getAll]);
            expect(supportedOnly.failed).toEqual([]);
            expect(calls).toBe(2);
            provider = JSON.parse(fs.readFileSync(manager.providerFilePath, 'utf8'));
            expect(provider.nodes['n8n-nodes-base.gmailTool']).toBeDefined();
            expect(provider.nodes['n8n-nodes-base.code']).toBeDefined();

            const second = await manager.ensureForTypes([getAll, send, code]);
            expect(second.failed).toEqual(first.failed);
            expect(calls).toBe(4);
            provider = JSON.parse(fs.readFileSync(manager.providerFilePath, 'utf8'));
            expect(provider.nodes['n8n-nodes-base.gmailTool']).toBeUndefined();
            expect(provider.nodes['n8n-nodes-base.code']).toBeDefined();
        } finally {
            fs.rmSync(cacheDir, { recursive: true, force: true });
        }
    });

    it('does not use an incompatible version as a same-type fallback', async () => {
        const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-'));
        const manager = new SchemaOverlayManager({
            endpoint: 'https://unused.local',
            token: 'x',
            cacheDir,
            client: {
                listTools: async () => [],
                callTool: async () => ({
                    structuredContent: {
                        definitions: [
                            '## n8n-nodes-base.switch (v22)',
                            '',
                            '```typescript',
                            'export interface SwitchV22Params {',
                            "    marker?: 'oldVersion';",
                            '}',
                            '```',
                        ].join('\n'),
                    },
                }),
            } as any,
        });

        try {
            const result = await manager.ensureForTypes([{ type: 'n8n-nodes-base.switch', version: '3.2' }]);
            expect(result.failed).toEqual(['n8n-nodes-base.switch@3.2']);
            expect(JSON.parse(fs.readFileSync(manager.providerFilePath, 'utf8')).nodes['n8n-nodes-base.switch']).toBeUndefined();
        } finally {
            fs.rmSync(cacheDir, { recursive: true, force: true });
        }
    });

    it('accepts a generic section for a compatible discriminator request', async () => {
        const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-'));
        const manager = new SchemaOverlayManager({
            endpoint: 'https://unused.local',
            token: 'x',
            cacheDir,
            client: {
                listTools: async () => [],
                callTool: async () => ({
                    structuredContent: {
                        definitions: [
                            '## n8n-nodes-base.gmailTool (v22)',
                            '',
                            '```typescript',
                            'export interface GmailV22Params {',
                            "    marker?: 'generic';",
                            '}',
                            '```',
                        ].join('\n'),
                    },
                }),
            } as any,
        });

        try {
            const result = await manager.ensureForTypes([
                { type: 'n8n-nodes-base.gmailTool', version: '2.2', resource: 'message', operation: 'get_all' },
            ]);
            expect(result.failed).toEqual([]);
            expect(JSON.parse(fs.readFileSync(manager.providerFilePath, 'utf8')).nodes['n8n-nodes-base.gmailTool']).toBeDefined();
        } finally {
            fs.rmSync(cacheDir, { recursive: true, force: true });
        }
    });

    it('does not let a specific operation section cover a templated operation', async () => {
        const definitions = [
            '## n8n-nodes-base.gmailTool (v22)',
            '',
            '```typescript',
            '* Discriminator: resource=message, operation=get_all',
            'export interface GmailV22Params {',
            "    marker?: 'getAll';",
            '}',
            '```',
        ].join('\n');
        const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-'));
        const manager = new SchemaOverlayManager({
            endpoint: 'https://unused.local',
            token: 'x',
            cacheDir,
            client: {
                listTools: async () => [],
                callTool: async () => ({ structuredContent: { definitions } }),
            } as any,
        });
        const descriptors = SchemaOverlayManager.collectNodeTypes({
            nodes: [
                { type: 'n8n-nodes-base.gmailTool', typeVersion: 2.2, parameters: { resource: 'message', operation: 'getAll' } },
                { type: 'n8n-nodes-base.gmailTool', typeVersion: 2.2, parameters: { resource: 'message', operation: '={{ $json.operation }}' } },
            ],
        });

        try {
            const result = await manager.ensureForTypes(descriptors);
            expect(result.failed).toEqual(['n8n-nodes-base.gmailTool@2.2/message']);
            const cache = JSON.parse(fs.readFileSync(path.join(cacheDir, '.schema-overlay.json'), 'utf8'));
            expect(cache.nodes['n8n-nodes-base.gmailTool'].versions['2.2|message|get_all']).toBeDefined();
            expect(cache.nodes['n8n-nodes-base.gmailTool'].versions['2.2|message|']).toBeUndefined();
            expect(JSON.parse(fs.readFileSync(manager.providerFilePath, 'utf8')).nodes['n8n-nodes-base.gmailTool']).toBeUndefined();
        } finally {
            fs.rmSync(cacheDir, { recursive: true, force: true });
        }
    });

    it('does not let a specific resource section cover a templated resource', async () => {
        const definitions = [
            '## n8n-nodes-base.gmailTool (v22)',
            '',
            '```typescript',
            '* Discriminator: resource=message, operation=get_all',
            'export interface GmailV22Params {',
            "    marker?: 'getAll';",
            '}',
            '```',
        ].join('\n');
        const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-'));
        const manager = new SchemaOverlayManager({
            endpoint: 'https://unused.local',
            token: 'x',
            cacheDir,
            client: {
                listTools: async () => [],
                callTool: async () => ({ structuredContent: { definitions } }),
            } as any,
        });
        const descriptors = SchemaOverlayManager.collectNodeTypes({
            nodes: [
                { type: 'n8n-nodes-base.gmailTool', typeVersion: 2.2, parameters: { resource: 'message', operation: 'getAll' } },
                { type: 'n8n-nodes-base.gmailTool', typeVersion: 2.2, parameters: { resource: '={{ $json.resource }}', operation: 'getAll' } },
            ],
        });

        try {
            const result = await manager.ensureForTypes(descriptors);
            expect(result.failed).toEqual(['n8n-nodes-base.gmailTool@2.2:get_all']);
            const cache = JSON.parse(fs.readFileSync(path.join(cacheDir, '.schema-overlay.json'), 'utf8'));
            expect(cache.nodes['n8n-nodes-base.gmailTool'].versions['2.2|message|get_all']).toBeDefined();
            expect(cache.nodes['n8n-nodes-base.gmailTool'].versions['2.2||get_all']).toBeUndefined();
            expect(JSON.parse(fs.readFileSync(manager.providerFilePath, 'utf8')).nodes['n8n-nodes-base.gmailTool']).toBeUndefined();
        } finally {
            fs.rmSync(cacheDir, { recursive: true, force: true });
        }
    });

    it('keeps supported definitions when a response also contains an unsupported union', async () => {
        const definitions = [
            '## n8n-nodes-base.code (v20)',
            '',
            '```typescript',
            'export interface CodeV20Params {',
            "    runOnceForAllItems?: 'true';",
            '}',
            '```',
            '',
            '## n8n-nodes-base.switch (v22)',
            '',
            '```typescript',
            'export type SwitchV22Params = SwitchV22ExpressionParams | SwitchV22RulesParams;',
            'export interface SwitchV22ExpressionParams {',
            "    mode?: 'expression';",
            '}',
            'export interface SwitchV22RulesParams {',
            "    mode?: 'rules';",
            '}',
            '```',
        ].join('\n');
        const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-'));
        const manager = new SchemaOverlayManager({
            endpoint: 'https://unused.local',
            token: 'x',
            cacheDir,
            client: {
                listTools: async () => [],
                callTool: async () => ({ structuredContent: { definitions } }),
            } as any,
        });
        const code = { type: 'n8n-nodes-base.code', version: '2.0' };
        const switchNode = { type: 'n8n-nodes-base.switch', version: '2.2' };

        try {
            const result = await manager.ensureForTypes([code, switchNode]);

            expect(result.failed).toEqual(['n8n-nodes-base.switch@2.2']);
            const provider = JSON.parse(fs.readFileSync(manager.providerFilePath, 'utf8'));
            expect(provider.nodes['n8n-nodes-base.code']).toBeDefined();
            expect(provider.nodes['n8n-nodes-base.switch']).toBeUndefined();
        } finally {
            fs.rmSync(cacheDir, { recursive: true, force: true });
        }
    });

    it('refreshes a schemaVersion 1 cache before validation', async () => {
        const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-'));
        const type = { type: 'n8n-nodes-base.switch', version: '3.2' };
        fs.writeFileSync(
            path.join(cacheDir, '.schema-overlay.json'),
            JSON.stringify({
                schemaVersion: 1,
                ttlMs: 7 * 24 * 60 * 60 * 1000,
                nodes: {
                    'n8n-nodes-base.switch': {
                        type: 'n8n-nodes-base.switch',
                        name: 'switch',
                        version: [3.2],
                        versions: {
                            '3.2||': {
                                fetchedAtMs: Date.now(),
                                properties: [{ name: 'poisoned', type: 'string', required: false }],
                                version: 3.2,
                            },
                        },
                    },
                },
            }),
        );
        fs.writeFileSync(
            `${path.join(cacheDir, '.schema-overlay.json')}.provider.json`,
            JSON.stringify({
                nodes: {
                    'n8n-nodes-base.switch': {
                        type: 'n8n-nodes-base.switch',
                        name: 'switch',
                        version: [3.2],
                        schema: { properties: [{ name: 'poisoned', type: 'string', required: false }] },
                    },
                },
            }),
        );
        let calls = 0;
        const manager = new SchemaOverlayManager({
            endpoint: 'https://unused.local',
            token: 'x',
            cacheDir,
            client: {
                listTools: async () => [],
                callTool: async () => {
                    calls += 1;
                    return {
                        structuredContent: {
                            definitions: [
                                '## n8n-nodes-base.switch (v32)',
                                '',
                                '```typescript',
                                'export type SwitchV32Params = SwitchV32ExpressionParams | SwitchV32RulesParams;',
                                'export interface SwitchV32ExpressionParams {',
                                "    mode?: 'expression';",
                                '}',
                                'export interface SwitchV32RulesParams {',
                                "    mode?: 'rules';",
                                '}',
                                '```',
                            ].join('\n'),
                        },
                    };
                },
            } as any,
        });

        try {
            expect(manager.isFresh([type])).toBe(false);
            const result = await manager.ensureForTypes([type]);

            expect(calls).toBe(2);
            expect(result.failed).toEqual(['n8n-nodes-base.switch@3.2']);
            const cache = JSON.parse(fs.readFileSync(path.join(cacheDir, '.schema-overlay.json'), 'utf8'));
            expect(cache.schemaVersion).toBe(2);
            expect(cache.nodes['n8n-nodes-base.switch']).toBeUndefined();
            const provider = JSON.parse(fs.readFileSync(manager.providerFilePath, 'utf8'));
            expect(provider.nodes['n8n-nodes-base.switch']).toBeUndefined();
        } finally {
            fs.rmSync(cacheDir, { recursive: true, force: true });
        }
    });
});
