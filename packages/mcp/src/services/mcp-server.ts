import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest, type ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { N8nAsCodeMcpService, type N8nAsCodeMcpServiceOptions } from './mcp-service.js';
import { NATIVE_MCP_READ_ONLY_TOOL_MAP } from './native-mcp-tools.js';
import { createTelemetryClient, classifyTelemetryError, type TelemetryClient } from '@n8n-as-code/telemetry';

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

function isLoopbackHost(host: string): boolean {
    return LOOPBACK_HOSTS.has(host);
}

function warnIfNonLoopback(host: string): void {
    if (!isLoopbackHost(host)) {
        process.stderr.write(
            `⚠ MCP server is listening on a non-loopback interface (${host}) without authentication.\n`,
        );
    }
}

function warnNativeMcpDisabledForRemoteTransport(host: string): void {
    process.stderr.write(
        `Native n8n MCP live tools are disabled on non-loopback interface (${host}). Set N8NAC_NATIVE_MCP_ALLOW_REMOTE=1 only when the MCP transport is authenticated.\n`,
    );
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

const nativeMcpStatusSchema = {
    includeTools: z.boolean().optional().describe('When true, connect to the native n8n MCP server and include discovered tools and capabilities.'),
};

const searchLiveWorkflowsSchema = {
    query: z.string().optional().describe('Optional workflow search query.'),
    projectId: z.string().optional().describe('Optional n8n project ID filter.'),
    limit: z.number().int().min(1).max(200).optional().describe('Maximum number of workflows to return.'),
};

const getLiveWorkflowDetailsSchema = {
    workflowId: z.string().min(1).describe('n8n workflow ID.'),
};

const searchLiveProjectsSchema = {
    query: z.string().optional().describe('Optional project search query.'),
    type: z.string().optional().describe('Optional project type filter, when supported by the native server.'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of projects to return.'),
};

const searchLiveFoldersSchema = {
    projectId: z.string().min(1).describe('n8n project ID.'),
    query: z.string().optional().describe('Optional folder search query.'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of folders to return.'),
};

const listLiveCredentialsSchema = {
    query: z.string().optional().describe('Optional credential name search query.'),
    type: z.string().optional().describe('Optional credential type filter.'),
    projectId: z.string().optional().describe('Optional project ID filter.'),
    onlySharedWithMe: z.boolean().optional().describe('When supported, exclude global credentials and list only credentials shared with the user.'),
    limit: z.number().int().min(1).max(200).optional().describe('Maximum number of credentials to return.'),
};

const searchLiveExecutionsSchema = {
    workflowId: z.string().min(1).describe('n8n workflow ID.'),
    status: z.array(z.string()).optional().describe('Optional execution statuses.'),
    startedAfter: z.string().optional().describe('Optional ISO timestamp lower bound.'),
    startedBefore: z.string().optional().describe('Optional ISO timestamp upper bound.'),
    lastId: z.string().optional().describe('Optional pagination cursor.'),
    limit: z.number().int().min(1).max(200).optional().describe('Maximum number of executions to return.'),
};

const getLiveExecutionSchema = {
    workflowId: z.string().min(1).describe('n8n workflow ID.'),
    executionId: z.string().min(1).describe('n8n execution ID.'),
    includeData: z.boolean().optional().describe('Include execution data. Requires N8NAC_NATIVE_MCP_ALLOW_EXECUTION_DATA=1 because payloads may contain sensitive data.'),
    nodeNames: z.array(z.string()).optional().describe('Optional node-name filter for execution data.'),
    truncateData: z.boolean().optional().describe('Ask n8n to truncate large execution payloads when supported.'),
};

const nativeSdkReferenceSchema = {
    section: z.enum(['patterns', 'expressions', 'functions', 'rules', 'import', 'guidelines', 'design', 'all']).optional().describe('SDK reference section to retrieve.'),
};

const nativeSearchNodesSchema = {
    queries: z.array(z.string().min(1)).min(1).max(10).describe('Node search queries, for example ["gmail", "send email"].'),
};

const nativeNodeTypeDescriptorSchema = z.object({
    nodeId: z.string().min(1),
    version: z.number().optional(),
    resource: z.string().optional(),
    operation: z.string().optional(),
    mode: z.string().optional(),
}).passthrough();

const nativeGetNodeTypesSchema = {
    nodeIds: z.array(z.union([z.string().min(1), nativeNodeTypeDescriptorSchema])).min(1).max(50).describe('Native node IDs or descriptor objects returned by search_n8n_native_nodes.'),
};

const nativeValidateWorkflowCodeSchema = {
    code: z.string().min(1).describe('Complete n8n native workflow builder TypeScript/JavaScript code.'),
};

interface BuildMcpServerOptions {
    allowNativeMcpTools?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function asNativeMcpContent(value: unknown) {
    if (Array.isArray(value)) return value as any;
    return [{ type: 'text' as const, text: asJsonText(value) }];
}

function nativeToolResponse(service: N8nAsCodeMcpService, nativeToolName: string, args: Record<string, unknown>) {
    return service.callNativeMcpTool(nativeToolName, args).then((result) => {
        if (isRecord(result) && result.isError === true) {
            return { isError: true, content: asNativeMcpContent(result.content ?? result) };
        }
        return { content: [{ type: 'text' as const, text: asJsonText(result) }] };
    }).catch((error: any) => ({
        isError: true,
        content: [{ type: 'text' as const, text: error?.message || String(error) }],
    }));
}

function nativeExecutionToolResponse(service: N8nAsCodeMcpService, args: Record<string, unknown>) {
    const nextArgs = { ...args };
    if (!service.allowsNativeMcpExecutionData()) {
        if (nextArgs.includeData === true) {
            return Promise.resolve({
                isError: true,
                content: [{ type: 'text' as const, text: 'Native execution data access is disabled. Set N8NAC_NATIVE_MCP_ALLOW_EXECUTION_DATA=1 to enable includeData.' }],
            });
        }
        nextArgs.includeData = false;
    }
    return nativeToolResponse(service, NATIVE_MCP_READ_ONLY_TOOL_MAP.getLiveExecution, nextArgs);
}

function buildMcpServer(service: N8nAsCodeMcpService, telemetry: TelemetryClient, options: BuildMcpServerOptions = {}): McpServer {
    const server = new McpServer({
        name: 'n8n-as-code',
        version: '1.0.0',
    });
    const allowNativeMcpTools = options.allowNativeMcpTools ?? true;

    // Cast to avoid TS2589: Zod v3 deep type inference in @modelcontextprotocol/sdk
    // causes TypeScript to exceed the instantiation depth limit. Handler parameter
    // types are explicitly annotated below for full type safety at the call site.
    const s = server as unknown as {
        tool(name: string, description: string, schema: object, annotations: ToolAnnotations, handler: (args: any) => any): void;
    };

    const trackTool = (toolName: string, handler: (args: any) => any) => async (args: any) => {
        const startedAt = Date.now();
        try {
            const result = await handler(args);
            const isError = Boolean((result as any)?.isError);
            telemetry.track('mcp_tool_called', {
                tool_name: toolName,
                outcome: isError ? 'failure' : 'success',
                duration_ms: Date.now() - startedAt,
                limit: typeof args?.limit === 'number' ? args.limit : undefined,
                format: typeof args?.format === 'string' ? args.format : undefined,
                error_category: isError ? 'unknown_error' : undefined,
            });
            telemetry.trackActive({ activation_source_event: 'mcp_tool_called' });
            return result;
        } catch (error) {
            telemetry.track('mcp_tool_called', {
                tool_name: toolName,
                outcome: 'failure',
                duration_ms: Date.now() - startedAt,
                limit: typeof args?.limit === 'number' ? args.limit : undefined,
                format: typeof args?.format === 'string' ? args.format : undefined,
                error_category: classifyTelemetryError(error),
            });
            telemetry.trackActive({ activation_source_event: 'mcp_tool_called' });
            throw error;
        }
    };

    // All tools operate exclusively on local/bundled data and produce no lasting side effects.
    const localReadOnlyHints: ToolAnnotations = {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    };

    const nativeReadOnlyHints: ToolAnnotations = {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
    };

    s.tool(
        'search_n8n_knowledge',
        'Search the local n8n-as-code knowledge base for nodes, documentation, and examples.',
        searchKnowledgeSchema,
        localReadOnlyHints,
        trackTool('search_n8n_knowledge', async ({ query, category, type, limit }: { query: string; category?: string; type?: 'node' | 'documentation'; limit?: number }) => ({
            content: [{ type: 'text' as const, text: asJsonText(await service.searchKnowledge(query, { category, type, limit })) }],
        })),
    );

    s.tool(
        'get_n8n_node_info',
        'Get the full offline schema and metadata for a specific n8n node.',
        getNodeInfoSchema,
        localReadOnlyHints,
        trackTool('get_n8n_node_info', async ({ name }: { name: string }) => {
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
        }),
    );

    s.tool(
        'search_n8n_workflow_examples',
        'Search the bundled n8n community workflow index for reusable example workflows.',
        searchExamplesSchema,
        localReadOnlyHints,
        trackTool('search_n8n_workflow_examples', async ({ query, limit }: { query: string; limit?: number }) => ({
            content: [{ type: 'text' as const, text: asJsonText(await service.searchExamples(query, limit)) }],
        })),
    );

    s.tool(
        'get_n8n_workflow_example',
        'Get metadata and the raw download URL for a specific community workflow example.',
        getExampleInfoSchema,
        localReadOnlyHints,
        trackTool('get_n8n_workflow_example', async ({ id }: { id: string }) => {
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
        }),
    );

    s.tool(
        'validate_n8n_workflow',
        'Validate an n8n workflow from JSON or TypeScript content against the bundled schema.',
        validateWorkflowSchema,
        localReadOnlyHints,
        trackTool('validate_n8n_workflow', async ({ workflowContent, format }: { workflowContent: string; format?: 'auto' | 'json' | 'typescript' }) => {
            try {
                const result = await service.validateWorkflow({ workflowContent, format });
                telemetry.track('workflow_validated', {
                    source: 'mcp',
                    format: format ?? 'auto',
                    valid: Boolean((result as any)?.valid),
                    error_count: Array.isArray((result as any)?.errors) ? (result as any).errors.length : undefined,
                    warning_count: Array.isArray((result as any)?.warnings) ? (result as any).warnings.length : undefined,
                });
                return {
                    content: [{ type: 'text' as const, text: asJsonText(result) }],
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: 'text' as const, text: error.message }],
                };
            }
        }),
    );

    s.tool(
        'search_n8n_docs',
        'Search bundled n8n documentation pages and return matching excerpts.',
        searchDocsSchema,
        localReadOnlyHints,
        trackTool('search_n8n_docs', async ({ query, category, type, limit }: { query: string; category?: string; type?: 'node' | 'documentation'; limit?: number }) => ({
            content: [{ type: 'text' as const, text: asJsonText(await service.searchDocs(query, { category, type, limit })) }],
        })),
    );

    s.tool(
        'get_n8n_native_mcp_status',
        'Inspect optional native n8n MCP assist configuration and, when requested, discovered native tools. Does not mutate n8n.',
        nativeMcpStatusSchema,
        nativeReadOnlyHints,
        trackTool('get_n8n_native_mcp_status', async ({ includeTools }: { includeTools?: boolean }) => ({
            content: [{ type: 'text' as const, text: asJsonText(await service.getNativeMcpStatus({ includeTools })) }],
        })),
    );

    if (service.isNativeMcpConfigured() && allowNativeMcpTools) {
        s.tool(
            'search_n8n_live_workflows',
            'Search workflows on the configured native n8n MCP server. Read-only; returns live previews from the n8n instance.',
            searchLiveWorkflowsSchema,
            nativeReadOnlyHints,
            trackTool('search_n8n_live_workflows', (args: Record<string, unknown>) => nativeToolResponse(service, NATIVE_MCP_READ_ONLY_TOOL_MAP.searchLiveWorkflows, args)),
        );

        s.tool(
            'get_n8n_live_workflow_details',
            'Get sanitized live workflow details from the configured native n8n MCP server. Read-only; credentials are not returned by n8n.',
            getLiveWorkflowDetailsSchema,
            nativeReadOnlyHints,
            trackTool('get_n8n_live_workflow_details', (args: Record<string, unknown>) => nativeToolResponse(service, NATIVE_MCP_READ_ONLY_TOOL_MAP.getLiveWorkflowDetails, args)),
        );

        s.tool(
            'search_n8n_live_projects',
            'Search n8n projects through the configured native MCP server. Read-only.',
            searchLiveProjectsSchema,
            nativeReadOnlyHints,
            trackTool('search_n8n_live_projects', (args: Record<string, unknown>) => nativeToolResponse(service, NATIVE_MCP_READ_ONLY_TOOL_MAP.searchLiveProjects, args)),
        );

        s.tool(
            'search_n8n_live_folders',
            'Search n8n folders in a project through the configured native MCP server. Read-only.',
            searchLiveFoldersSchema,
            nativeReadOnlyHints,
            trackTool('search_n8n_live_folders', (args: Record<string, unknown>) => nativeToolResponse(service, NATIVE_MCP_READ_ONLY_TOOL_MAP.searchLiveFolders, args)),
        );

        s.tool(
            'list_n8n_live_credentials',
            'List accessible n8n credential metadata through the native MCP server. Read-only; secrets are never returned by n8n.',
            listLiveCredentialsSchema,
            nativeReadOnlyHints,
            trackTool('list_n8n_live_credentials', (args: Record<string, unknown>) => nativeToolResponse(service, NATIVE_MCP_READ_ONLY_TOOL_MAP.listLiveCredentials, args)),
        );

        s.tool(
            'search_n8n_live_executions',
            'Search live n8n execution metadata through the native MCP server. Read-only but may reveal operational metadata.',
            searchLiveExecutionsSchema,
            nativeReadOnlyHints,
            trackTool('search_n8n_live_executions', (args: Record<string, unknown>) => nativeToolResponse(service, NATIVE_MCP_READ_ONLY_TOOL_MAP.searchLiveExecutions, args)),
        );

        s.tool(
            'get_n8n_live_execution',
            'Get a live n8n execution through the native MCP server. Read-only; includeData requires N8NAC_NATIVE_MCP_ALLOW_EXECUTION_DATA=1.',
            getLiveExecutionSchema,
            nativeReadOnlyHints,
            trackTool('get_n8n_live_execution', (args: Record<string, unknown>) => nativeExecutionToolResponse(service, args)),
        );

        s.tool(
            'get_n8n_native_sdk_reference',
            'Get n8n native workflow-builder SDK reference through the native MCP server. Read-only.',
            nativeSdkReferenceSchema,
            nativeReadOnlyHints,
            trackTool('get_n8n_native_sdk_reference', (args: Record<string, unknown>) => nativeToolResponse(service, NATIVE_MCP_READ_ONLY_TOOL_MAP.getNativeSdkReference, args)),
        );

        s.tool(
            'search_n8n_native_nodes',
            'Search live n8n node definitions through the native MCP server. Read-only complement to the bundled n8n-as-code node knowledge.',
            nativeSearchNodesSchema,
            nativeReadOnlyHints,
            trackTool('search_n8n_native_nodes', (args: Record<string, unknown>) => nativeToolResponse(service, NATIVE_MCP_READ_ONLY_TOOL_MAP.searchNativeNodes, args)),
        );

        s.tool(
            'get_n8n_native_node_types',
            'Get live native TypeScript definitions for n8n nodes through the native MCP server. Read-only.',
            nativeGetNodeTypesSchema,
            nativeReadOnlyHints,
            trackTool('get_n8n_native_node_types', (args: Record<string, unknown>) => nativeToolResponse(service, NATIVE_MCP_READ_ONLY_TOOL_MAP.getNativeNodeTypes, args)),
        );

        s.tool(
            'validate_n8n_native_workflow_code',
            'Validate n8n native workflow-builder TypeScript/JavaScript code through the native MCP server. Read-only validation only; does not create or update workflows.',
            nativeValidateWorkflowCodeSchema,
            nativeReadOnlyHints,
            trackTool('validate_n8n_native_workflow_code', (args: Record<string, unknown>) => nativeToolResponse(service, NATIVE_MCP_READ_ONLY_TOOL_MAP.validateNativeWorkflowCode, args)),
        );
    }

    return server;
}

async function startHttpServer(service: N8nAsCodeMcpService, httpOptions: HttpServerOptions, telemetry: TelemetryClient): Promise<void> {
    const port = httpOptions.port ?? 3000;
    const host = httpOptions.host ?? '127.0.0.1';
    const allowNativeMcpTools = isLoopbackHost(host) || service.canExposeNativeMcpRemotely();

    warnIfNonLoopback(host);
    if (service.isNativeMcpConfigured() && !allowNativeMcpTools) warnNativeMcpDisabledForRemoteTransport(host);

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

                const server = buildMcpServer(service, telemetry, { allowNativeMcpTools });
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
        await telemetry.flush();
        process.exit(0);
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

    // Keep the process alive
    await new Promise<void>(() => {});
}

async function startSseServer(service: N8nAsCodeMcpService, sseOptions: SseServerOptions, telemetry: TelemetryClient): Promise<void> {
    const port = sseOptions.port ?? 3000;
    const host = sseOptions.host ?? '127.0.0.1';
    const allowNativeMcpTools = isLoopbackHost(host) || service.canExposeNativeMcpRemotely();

    warnIfNonLoopback(host);
    if (service.isNativeMcpConfigured() && !allowNativeMcpTools) warnNativeMcpDisabledForRemoteTransport(host);

    // Map of sessionId -> transport for routing POST messages to the right session
    const transports = new Map<string, SSEServerTransport>();

    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        if (req.url === '/sse' && req.method === 'GET') {
            const transport = new SSEServerTransport('/message', res);
            transports.set(transport.sessionId, transport);

            transport.onclose = () => {
                transports.delete(transport.sessionId);
            };

            const server = buildMcpServer(service, telemetry, { allowNativeMcpTools });
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
        await telemetry.flush();
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
    const telemetry = createTelemetryClient({ facade: 'mcp' });

    if (httpOptions) {
        telemetry.track('mcp_server_started', {
            transport: 'http',
            host_type: LOOPBACK_HOSTS.has(httpOptions.host ?? '127.0.0.1') ? 'loopback' : 'non_loopback',
            port_configured: httpOptions.port !== undefined,
        });
        return startHttpServer(service, httpOptions, telemetry);
    }
    if (sseOptions) {
        telemetry.track('mcp_server_started', {
            transport: 'sse',
            host_type: LOOPBACK_HOSTS.has(sseOptions.host ?? '127.0.0.1') ? 'loopback' : 'non_loopback',
            port_configured: sseOptions.port !== undefined,
        });
        return startSseServer(service, sseOptions, telemetry);
    }
    telemetry.track('mcp_server_started', { transport: 'stdio' });
    return startStdioServer(service, telemetry);
}

async function startStdioServer(service: N8nAsCodeMcpService, telemetry: TelemetryClient): Promise<void> {
    const server = buildMcpServer(service, telemetry);
    const transport = new StdioServerTransport();
    let flushPromise: Promise<void> | undefined;
    let resolveClosed: () => void;
    const closed = new Promise<void>((resolve) => {
        resolveClosed = resolve;
    });

    const flushOnce = (): Promise<void> => {
        flushPromise ??= telemetry.flush(1000);
        return flushPromise!;
    };

    const flushAndResolve = async (): Promise<void> => {
        await flushOnce();
        resolveClosed();
    };

    transport.onclose = () => {
        void flushAndResolve();
    };

    const shutdown = async () => {
        await transport.close();
        await flushAndResolve();
        process.exit(0);
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

    await server.connect(transport);
    await closed;
}
