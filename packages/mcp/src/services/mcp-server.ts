import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest, type ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { N8nAsCodeMcpService, type N8nAsCodeMcpServiceOptions } from './mcp-service.js';

export interface HttpServerOptions {
    port?: number;
    host?: string;
}

export interface SseServerOptions {
    port?: number;
    host?: string;
}

export interface StartServerOptions extends N8nAsCodeMcpServiceOptions {
    http?: HttpServerOptions;
    sse?: SseServerOptions;
}

function asJsonText(data: unknown): string {
    return JSON.stringify(data, null, 2);
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function warnIfNonLoopback(host: string): void {
    if (!LOOPBACK_HOSTS.has(host)) {
        process.stderr.write(
            `⚠ MCP server is listening on a non-loopback interface (${host}) without authentication.\n`,
        );
    }
}

// Idle TTL for stateful HTTP sessions – if a client disconnects without
// sending DELETE /mcp the session is evicted after this period of inactivity.
const SESSION_IDLE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Schemas defined as module-level constants so TypeScript infers each type
// independently. Note: server.tool() triggers TS2589 on the first call due to
// Zod v3 deep type inference in the MCP SDK - this is a known SDK limitation.
const searchKnowledgeSchema = {
    query: z.string().min(1).describe('Natural-language search query, for example "google sheets" or "AI agent".'),
    category: z.string().optional().describe('Optional documentation category filter.'),
    type: z.enum(['node', 'documentation']).optional().describe('Optional result type filter.'),
    limit: z.number().int().min(1).max(25).optional().describe('Maximum number of results to return.'),
};

const getNodeInfoSchema = {
    name: z.string().min(1).describe('Exact or close node name, for example "googleSheets" or "n8n-nodes-base.httpRequest".'),
};

const searchExamplesSchema = {
    query: z.string().min(1).describe('Search query, for example "slack notification" or "invoice processing".'),
    limit: z.number().int().min(1).max(25).optional().describe('Maximum number of workflow examples to return.'),
};

const getExampleInfoSchema = {
    id: z.string().min(1).describe('Workflow example ID from search_n8n_workflow_examples.'),
};

const validateWorkflowSchema = {
    workflowContent: z.string().min(1).describe('Workflow source as JSON or .workflow.ts text.'),
    format: z.enum(['auto', 'json', 'typescript']).optional().describe('Optional workflow format override.'),
};

const searchDocsSchema = {
    query: z.string().min(1).describe('Documentation search query.'),
    category: z.string().optional().describe('Optional documentation category filter.'),
    type: z.enum(['node', 'documentation']).optional().describe('Optional result type filter. Defaults to documentation.'),
    limit: z.number().int().min(1).max(10).optional().describe('Maximum number of pages to return.'),
};

function buildMcpServer(service: N8nAsCodeMcpService): McpServer {
    const server = new McpServer({
        name: 'n8n-as-code',
        version: '1.0.0',
    });

    // Cast to avoid TS2589: Zod v3 deep type inference in @modelcontextprotocol/sdk
    // causes TypeScript to exceed the instantiation depth limit. Handler parameter
    // types are explicitly annotated below for full type safety at the call site.
    const s = server as unknown as {
        tool(name: string, description: string, schema: object, annotations: ToolAnnotations, handler: (args: any) => any): void;
    };

    // All tools operate exclusively on local/bundled data and produce no lasting side effects.
    const localReadOnlyHints: ToolAnnotations = {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    };

    s.tool(
        'search_n8n_knowledge',
        'Search the local n8n-as-code knowledge base for nodes, documentation, and examples.',
        searchKnowledgeSchema,
        localReadOnlyHints,
        async ({ query, category, type, limit }: { query: string; category?: string; type?: 'node' | 'documentation'; limit?: number }) => ({
            content: [{ type: 'text' as const, text: asJsonText(await service.searchKnowledge(query, { category, type, limit })) }],
        }),
    );

    s.tool(
        'get_n8n_node_info',
        'Get the full offline schema and metadata for a specific n8n node.',
        getNodeInfoSchema,
        localReadOnlyHints,
        async ({ name }: { name: string }) => {
            try {
                return {
                    content: [{ type: 'text' as const, text: asJsonText(await service.getNodeInfo(name)) }],
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: 'text' as const, text: error.message }],
                };
            }
        },
    );

    s.tool(
        'search_n8n_workflow_examples',
        'Search the bundled n8n community workflow index for reusable example workflows.',
        searchExamplesSchema,
        localReadOnlyHints,
        async ({ query, limit }: { query: string; limit?: number }) => ({
            content: [{ type: 'text' as const, text: asJsonText(await service.searchExamples(query, limit)) }],
        }),
    );

    s.tool(
        'get_n8n_workflow_example',
        'Get metadata and the raw download URL for a specific community workflow example.',
        getExampleInfoSchema,
        localReadOnlyHints,
        async ({ id }: { id: string }) => {
            try {
                return {
                    content: [{ type: 'text' as const, text: asJsonText(await service.getExampleInfo(id)) }],
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: 'text' as const, text: error.message }],
                };
            }
        },
    );

    s.tool(
        'validate_n8n_workflow',
        'Validate an n8n workflow from JSON or TypeScript content against the bundled schema.',
        validateWorkflowSchema,
        localReadOnlyHints,
        async ({ workflowContent, format }: { workflowContent: string; format?: 'auto' | 'json' | 'typescript' }) => {
            try {
                const result = await service.validateWorkflow({ workflowContent, format });
                return {
                    content: [{ type: 'text' as const, text: asJsonText(result) }],
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: 'text' as const, text: error.message }],
                };
            }
        },
    );

    s.tool(
        'search_n8n_docs',
        'Search bundled n8n documentation pages and return matching excerpts.',
        searchDocsSchema,
        localReadOnlyHints,
        async ({ query, category, type, limit }: { query: string; category?: string; type?: 'node' | 'documentation'; limit?: number }) => ({
            content: [{ type: 'text' as const, text: asJsonText(await service.searchDocs(query, { category, type, limit })) }],
        }),
    );

    return server;
}

async function startHttpServer(service: N8nAsCodeMcpService, httpOptions: HttpServerOptions): Promise<void> {
    const port = httpOptions.port ?? 3000;
    const host = httpOptions.host ?? '127.0.0.1';

    warnIfNonLoopback(host);

    // Map of sessionId -> transport for stateful session management
    const transports = new Map<string, StreamableHTTPServerTransport>();
    const sessionTimers = new Map<string, ReturnType<typeof setTimeout>>();

    function touchSession(sessionId: string): void {
        const existing = sessionTimers.get(sessionId);
        if (existing !== undefined) clearTimeout(existing);
        sessionTimers.set(
            sessionId,
            setTimeout(async () => {
                sessionTimers.delete(sessionId);
                const t = transports.get(sessionId);
                if (t) {
                    transports.delete(sessionId);
                    await t.close();
                }
            }, SESSION_IDLE_TTL_MS),
        );
    }

    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        if (req.url !== '/mcp') {
            res.writeHead(404).end('Not Found');
            return;
        }

        // Parse body for POST requests
        let body: unknown;
        if (req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
                chunks.push(chunk as Buffer);
            }
            const raw = Buffer.concat(chunks).toString('utf8');
            try {
                body = raw ? JSON.parse(raw) : undefined;
            } catch {
                res.writeHead(400).end('Invalid JSON body');
                return;
            }
        }

        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        if (req.method === 'POST') {
            let transport: StreamableHTTPServerTransport;

            if (sessionId && transports.has(sessionId)) {
                transport = transports.get(sessionId)!;
            } else if (!sessionId && isInitializeRequest(body)) {
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (sid) => {
                        transports.set(sid, transport);
                        touchSession(sid);
                    },
                });

                transport.onclose = () => {
                    const sid = transport.sessionId;
                    if (sid) {
                        transports.delete(sid);
                        const timer = sessionTimers.get(sid);
                        if (timer !== undefined) {
                            clearTimeout(timer);
                            sessionTimers.delete(sid);
                        }
                    }
                };

                const server = buildMcpServer(service);
                await server.connect(transport);
            } else {
                const status = sessionId ? 404 : 400;
                const message = sessionId ? 'Session not found' : 'Bad Request: missing session ID';
                res.writeHead(status, { 'Content-Type': 'application/json' }).end(
                    JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }),
                );
                return;
            }

            await transport.handleRequest(req, res, body);
            if (sessionId && transports.has(sessionId)) touchSession(sessionId);
        } else if (req.method === 'GET' || req.method === 'DELETE') {
            if (!sessionId || !transports.has(sessionId)) {
                res.writeHead(sessionId ? 404 : 400).end(sessionId ? 'Session not found' : 'Missing session ID');
                return;
            }
            await transports.get(sessionId)!.handleRequest(req, res);
            if (req.method === 'GET') touchSession(sessionId);
        } else {
            res.writeHead(405).end('Method Not Allowed');
        }
    });

    await new Promise<void>((resolve, reject) => {
        httpServer.listen(port, host, () => resolve());
        httpServer.once('error', reject);
    });

    process.stderr.write(`n8n-as-code MCP server listening on http://${host}:${port}/mcp\n`);

    const shutdown = async () => {
        httpServer.close();
        for (const timer of sessionTimers.values()) clearTimeout(timer);
        sessionTimers.clear();
        for (const [, transport] of transports) {
            await transport.close();
        }
        transports.clear();
        process.exit(0);
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

    // Keep the process alive
    await new Promise<void>(() => {});
}

async function startSseServer(service: N8nAsCodeMcpService, sseOptions: SseServerOptions): Promise<void> {
    const port = sseOptions.port ?? 3000;
    const host = sseOptions.host ?? '127.0.0.1';

    warnIfNonLoopback(host);

    // Map of sessionId -> transport for routing POST messages to the right session
    const transports = new Map<string, SSEServerTransport>();

    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        if (req.url === '/sse' && req.method === 'GET') {
            const transport = new SSEServerTransport('/message', res);
            transports.set(transport.sessionId, transport);

            transport.onclose = () => {
                transports.delete(transport.sessionId);
            };

            const server = buildMcpServer(service);
            await server.connect(transport);
            await transport.start();
        } else if (req.url?.startsWith('/message') && req.method === 'POST') {
            const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
            const sessionId = url.searchParams.get('sessionId') ?? undefined;
            const transport = sessionId ? transports.get(sessionId) : undefined;

            if (!transport) {
                res.writeHead(sessionId ? 404 : 400).end(sessionId ? 'Session not found' : 'Missing sessionId');
                return;
            }

            const chunks: Buffer[] = [];
            for await (const chunk of req) {
                chunks.push(chunk as Buffer);
            }
            const raw = Buffer.concat(chunks).toString('utf8');
            let body: unknown;
            try {
                body = raw ? JSON.parse(raw) : undefined;
            } catch {
                res.writeHead(400).end('Invalid JSON body');
                return;
            }

            await transport.handlePostMessage(req, res, body);
        } else {
            res.writeHead(404).end('Not Found');
        }
    });

    await new Promise<void>((resolve, reject) => {
        httpServer.listen(port, host, () => resolve());
        httpServer.once('error', reject);
    });

    process.stderr.write(`n8n-as-code MCP SSE server listening on http://${host}:${port}/sse\n`);

    const shutdown = async () => {
        httpServer.close();
        for (const [, transport] of transports) {
            await transport.close();
        }
        transports.clear();
        process.exit(0);
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

    // Keep the process alive
    await new Promise<void>(() => {});
}

export async function startN8nAsCodeMcpServer(options: StartServerOptions = {}): Promise<void> {
    const { http: httpOptions, sse: sseOptions, ...serviceOptions } = options;
    const service = new N8nAsCodeMcpService(serviceOptions);

    if (httpOptions) {
        return startHttpServer(service, httpOptions);
    }
    if (sseOptions) {
        return startSseServer(service, sseOptions);
    }
    return startStdioServer(service);
}

async function startStdioServer(service: N8nAsCodeMcpService): Promise<void> {
    const server = buildMcpServer(service);
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
