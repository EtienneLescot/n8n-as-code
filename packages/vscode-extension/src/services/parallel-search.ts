import type * as vscode from 'vscode';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';

export const PARALLEL_SEARCH_URL = 'https://search.parallel.ai/mcp';
export const PARALLEL_SEARCH_USER_AGENT = 'n8n-as-code/agent-workbench';

/** Read the resource's search preference and VS Code's workspace trust boundary. */
export function isWorkbenchWebSearchEnabled(rootDir: string, host: Pick<typeof vscode, 'workspace' | 'Uri'>): boolean {
    return host.workspace.isTrusted
        && host.workspace.getConfiguration('n8n.agent', host.Uri.file(rootDir)).get<boolean>('webSearch.enabled', true);
}

/** Load anonymous search/fetch tools; conversation context comes from each invocation. */
export async function createParallelSearchTools(signal?: AbortSignal) {
    signal?.throwIfAborted();
    const client = new MultiServerMCPClient({
        mcpServers: {
            parallel: {
                transport: 'http',
                url: PARALLEL_SEARCH_URL,
                headers: { 'User-Agent': PARALLEL_SEARCH_USER_AGENT },
                automaticSSEFallback: false,
                defaultToolTimeout: 30_000,
            },
        },
        prefixToolNameWithServerName: true,
        useStandardContentBlocks: true,
        beforeToolCall: (request, _state, config) => {
            const sessionId = config.configurable?.thread_id;
            if (typeof sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
                throw new Error('Web search requires a Workbench conversation.');
            }
            const args = request.args as Record<string, unknown>;
            // These are runtime metadata, never model-selected tool arguments.
            delete args.model_name;
            for (const key of Object.keys(args)) {
                if (args[key] == null) delete args[key];
            }
            if (request.name === 'web_fetch') {
                if (!Array.isArray(args.urls) || !args.urls.length || args.urls.length > 20
                    || args.urls.some((value) => {
                        try {
                            const url = new URL(String(value));
                            return !['http:', 'https:'].includes(url.protocol) || Boolean(url.username || url.password);
                        } catch { return true; }
                    })) {
                    throw new Error('Web fetch requires 1–20 HTTP or HTTPS URLs without embedded credentials.');
                }
            }
            return { args: { ...args, session_id: sessionId } };
        },
    });
    const load = async () => {
        const tools = (await client.getTools()).filter((tool) => ['parallel__web_search', 'parallel__web_fetch'].includes(tool.name));
        // The adapter simplifies nullable union schemas and can discard their value types.
        // Keep the server's original JSON schema so models see the actual argument contract.
        const connection = await client.getClient('parallel');
        if (!connection) throw new Error('Web search MCP connection unavailable.');
        const definitions = await connection.listTools();
        for (const tool of tools) {
            const definition = definitions.tools.find((entry) => `parallel__${entry.name}` === tool.name);
            if (definition) tool.schema = structuredClone(definition.inputSchema);
            // The Workbench owns conversation identity; do not ask the model to invent it.
            const schema = tool.schema as { properties?: Record<string, unknown>; required?: string[] };
            if (schema.properties) {
                delete schema.properties.session_id;
                delete schema.properties.model_name;
                schema.required = schema.required?.filter((key) => !['session_id', 'model_name'].includes(key));
            }
        }
        return { tools, client };
    };
    const loading = load();
    const deadline = AbortSignal.any([AbortSignal.timeout(10_000), ...(signal ? [signal] : [])]);
    let onAbort: () => void = () => undefined;
    try {
        return await Promise.race([loading, new Promise<never>((_resolve, reject) => {
            onAbort = () => reject(deadline.reason);
            deadline.addEventListener('abort', onAbort, { once: true });
            if (deadline.aborted) onAbort();
        })]);
    } catch (error) {
        // A connection can finish after cancellation; close it once discovery settles too.
        void loading.finally(() => client.close()).catch(() => undefined);
        await client.close().catch(() => undefined);
        throw error;
    } finally {
        deadline.removeEventListener('abort', onAbort);
    }
}
