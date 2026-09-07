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
});
