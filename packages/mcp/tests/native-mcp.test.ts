import { describe, test, expect, afterEach, jest } from '@jest/globals';
import { NativeMcpHttpClient } from '../src/services/native-mcp-client';
import { loadNativeMcpConfig, redactNativeMcpConfig } from '../src/services/native-mcp-config';
import { N8nAsCodeMcpService } from '../src/services/mcp-service';

describe('native n8n MCP config', () => {
    test('is disabled by default even when no endpoint is configured', () => {
        const config = loadNativeMcpConfig({});

        expect(config.enabled).toBe(false);
        expect(config.mode).toBe('off');
        expect(config.allowMutations).toBe(false);
        expect(config.allowPublish).toBe(false);
        expect(config.allowDestructive).toBe(false);
        expect(config.requireSyncBack).toBe(true);
    });

    test('reads optional assist settings from environment variables', () => {
        const config = loadNativeMcpConfig({
            N8NAC_NATIVE_MCP_ENABLED: '1',
            N8NAC_NATIVE_MCP_MODE: 'assist',
            N8N_NATIVE_MCP_URL: 'https://n8n.example.test/mcp-server/http?token=secret',
            N8N_NATIVE_MCP_TOKEN: 'secret-token',
            N8NAC_NATIVE_MCP_TIMEOUT_MS: '1234',
        });

        expect(config.enabled).toBe(true);
        expect(config.mode).toBe('assist');
        expect(config.endpoint).toBe('https://n8n.example.test/mcp-server/http?token=secret');
        expect(config.token).toBe('secret-token');
        expect(config.timeoutMs).toBe(1234);
    });

    test('redacts endpoint query strings and token presence', () => {
        const redacted = redactNativeMcpConfig(loadNativeMcpConfig({
            N8NAC_NATIVE_MCP_ENABLED: 'true',
            N8N_NATIVE_MCP_URL: 'https://user:pass@n8n.example.test/mcp-server/http?access_token=secret',
            N8N_NATIVE_MCP_TOKEN: 'secret-token',
        }));

        expect(redacted.endpoint).toBe('https://redacted:redacted@n8n.example.test/mcp-server/http?redacted');
        expect(redacted.tokenConfigured).toBe(true);
    });
});

describe('native n8n MCP service status', () => {
    test('reports disabled status without attempting a connection', async () => {
        const service = new N8nAsCodeMcpService({ nativeMcpEnv: {} });

        const status = await service.getNativeMcpStatus({ includeTools: true });

        expect(status.config.enabled).toBe(false);
        expect(status.connection.checked).toBe(false);
        expect(status.connection.error).toContain('disabled');
    });

    test('reports missing endpoint before attempting tool discovery', async () => {
        const service = new N8nAsCodeMcpService({
            nativeMcpEnv: { N8NAC_NATIVE_MCP_ENABLED: '1' },
        });

        const status = await service.getNativeMcpStatus({ includeTools: true });

        expect(status.config.enabled).toBe(true);
        expect(status.config.configured).toBe(false);
        expect(status.connection.checked).toBe(false);
        expect(status.connection.error).toContain('endpoint');
    });
});

describe('NativeMcpHttpClient', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('initializes a streamable HTTP session and lists tools', async () => {
        const responses = [
            new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18' } }), {
                status: 200,
                headers: { 'mcp-session-id': 'session-1', 'content-type': 'application/json' },
            }),
            new Response('', { status: 202 }),
            new Response(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'search_workflows' }] } }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }),
            new Response('', { status: 202 }),
        ];
        const calls: Array<{ init?: RequestInit }> = [];
        jest.spyOn(globalThis, 'fetch').mockImplementation(async (_input: any, init?: RequestInit) => {
            calls.push({ init });
            const response = responses.shift();
            if (!response) throw new Error('Unexpected fetch call');
            return response;
        });

        const client = new NativeMcpHttpClient(loadNativeMcpConfig({
            N8NAC_NATIVE_MCP_ENABLED: '1',
            N8N_NATIVE_MCP_URL: 'https://n8n.example.test/mcp-server/http',
            N8N_NATIVE_MCP_TOKEN: 'secret-token',
        }));

        const result = await client.listTools();

        expect(result.tools).toEqual([{ name: 'search_workflows' }]);
        expect(calls).toHaveLength(4);
        expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
        expect((calls[2].init?.headers as Record<string, string>)['mcp-session-id']).toBe('session-1');
        expect(calls[3].init?.method).toBe('DELETE');
    });
});
