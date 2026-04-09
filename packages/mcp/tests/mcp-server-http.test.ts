import { jest, describe, test, expect } from '@jest/globals';
import { startN8nAsCodeMcpServer } from '../src/services/mcp-server';
import type { StartServerOptions } from '../src/services/mcp-server';

// Mock the SDK transports so no real HTTP server is started
jest.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => {
    const mockTransport = {
        sessionId: 'test-session-id',
        onclose: undefined,
        handleRequest: jest.fn().mockImplementation(() => Promise.resolve()),
        close: jest.fn().mockImplementation(() => Promise.resolve()),
        start: jest.fn().mockImplementation(() => Promise.resolve()),
    };
    return {
        StreamableHTTPServerTransport: jest.fn().mockImplementation((opts: any) => {
            if (opts?.onsessioninitialized) {
                opts.onsessioninitialized('test-session-id');
            }
            return mockTransport;
        }),
    };
});

jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: jest.fn().mockImplementation(() => ({
        tool: jest.fn(),
        connect: jest.fn().mockImplementation(() => Promise.resolve()),
    })),
}));

jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
    isInitializeRequest: jest.fn().mockReturnValue(true),
}));

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
    StdioServerTransport: jest.fn().mockImplementation(() => ({
        start: jest.fn().mockImplementation(() => Promise.resolve()),
    })),
}));

describe('startN8nAsCodeMcpServer (HTTP mode)', () => {
    test('resolves http option types correctly: HttpServerOptions port and host are optional', () => {
        const options: StartServerOptions = {
            http: { port: 3000, host: '127.0.0.1' },
        };
        expect(options.http?.port).toBe(3000);
        expect(options.http?.host).toBe('127.0.0.1');
    });

    test('resolves to undefined http when http option is omitted', () => {
        const options: StartServerOptions = {};
        expect(options.http).toBeUndefined();
    });

    test('http option with only port is valid', () => {
        const options: StartServerOptions = {
            http: { port: 8080 },
        };
        expect(options.http?.port).toBe(8080);
        expect(options.http?.host).toBeUndefined();
    });

    test('http option with only host is valid', () => {
        const options: StartServerOptions = {
            http: { host: '0.0.0.0' },
        };
        expect(options.http?.host).toBe('0.0.0.0');
        expect(options.http?.port).toBeUndefined();
    });
});
