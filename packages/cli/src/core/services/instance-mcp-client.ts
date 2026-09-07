import fs from 'node:fs';

/** Loopback hostnames on which plaintext http is acceptable (local dev/self-hosted instances). */
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

export function isInstanceMcpSchemeAllowed(endpoint: string): boolean {
    try {
        const parsed = new URL(endpoint);
        if (parsed.protocol === 'https:') return true;
        if (parsed.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(parsed.hostname)) return true;
        return false;
    } catch {
        return false;
    }
}

export interface InstanceMcpClientOptions {
    endpoint: string;
    token?: string;
    timeoutMs?: number;
}

/**
 * Minimal streamable-HTTP MCP client for single tool calls against an n8n
 * instance MCP server: initialize → notifications/initialized → tools/list or
 * tools/call → authenticated DELETE to release the session. Mirrors
 * `NativeMcpHttpClient` and refuses to send credentials to plaintext
 * non-loopback endpoints.
 */
export class InstanceMcpClient {
    private readonly options: InstanceMcpClientOptions;

    constructor(options: InstanceMcpClientOptions) {
        this.options = options;
    }

    async listTools(): Promise<Array<{ name: string; description?: string }>> {
        this.logCall('tools/list');
        const result = (await this.call('tools/list', {})) as { tools?: Array<{ name: string; description?: string }> };
        return Array.isArray(result?.tools) ? result.tools : [];
    }

    async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
        this.logCall(`tools/call:${name}`);
        return this.call('tools/call', { name, arguments: args });
    }

    /**
     * Benchmark instrumentation: when N8NAC_MCP_CALL_LOG points at a file, every
     * MCP call is appended as one JSON line so runs can be audited for call
     * economy (level 1 vs level 2) without a network proxy.
     */
    private logCall(kind: string): void {
        const target = process.env.N8NAC_MCP_CALL_LOG;
        if (!target) return;
        try {
            fs.appendFileSync(target, `${JSON.stringify({ at: new Date().toISOString(), kind })}\n`, 'utf8');
        } catch {
            // instrumentation must never break the call
        }
    }

    private async call(method: string, params: Record<string, unknown>): Promise<unknown> {
        const { endpoint, token, timeoutMs = 10000 } = this.options;
        if (!isInstanceMcpSchemeAllowed(endpoint)) {
            throw new Error(`Refusing to send credentials to a non-HTTPS endpoint (${endpoint}); only loopback http is allowed.`);
        }

        let sessionId: string | undefined;
        const post = async (payload: Record<string, unknown>, expectResponse = true): Promise<any> => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const headers: Record<string, string> = {
                    Accept: 'application/json, text/event-stream',
                    'Content-Type': 'application/json',
                    'mcp-protocol-version': '2024-11-05',
                    'User-Agent': 'n8n-as-code-preflight',
                };
                if (token) headers.Authorization = `Bearer ${token}`;
                if (sessionId) headers['mcp-session-id'] = sessionId;

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                    // Fail closed on redirects: a cross-origin 307/308 would
                    // otherwise forward the POST body, the session identifier
                    // and (same-origin) auth headers to another destination.
                    redirect: 'error',
                });
                const text = await response.text();
                sessionId = response.headers.get('mcp-session-id') || sessionId;

                if (!response.ok) {
                    throw new Error(`Native MCP HTTP ${response.status} ${response.statusText}: ${text.slice(0, 200)}`);
                }
                if (!expectResponse || !text.trim()) {
                    return undefined;
                }

                let data: any;
                try {
                    data = JSON.parse(text);
                } catch {
                    for (const line of text.split(/\r?\n/)) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('data:')) {
                            try { data = JSON.parse(trimmed.slice(5).trim()); break; } catch { /* keep scanning */ }
                        }
                    }
                }
                if (!data) throw new Error(`Unparseable native MCP response: ${text.slice(0, 200)}`);
                if (data.error) throw new Error(`Native MCP RPC error (${data.error.code}): ${data.error.message}`);
                return data?.result;
            } catch (error: any) {
                if (error?.name === 'AbortError') {
                    throw new Error(`Native MCP request timed out after ${timeoutMs}ms`);
                }
                throw error;
            } finally {
                clearTimeout(timer);
            }
        };

        const close = async (): Promise<void> => {
            if (!sessionId) return;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const headers: Record<string, string> = {
                    'mcp-protocol-version': '2024-11-05',
                    'User-Agent': 'n8n-as-code-preflight',
                    'mcp-session-id': sessionId,
                };
                if (token) headers.Authorization = `Bearer ${token}`;
                await fetch(endpoint, { method: 'DELETE', headers, signal: controller.signal, redirect: 'error' });
            } catch {
                // Best-effort cleanup; must never mask the tool result.
            } finally {
                clearTimeout(timer);
            }
        };

        try {
            const init = await post({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'n8n-as-code', version: '1.0.0' } },
            });
            sessionId = sessionId || init?.sessionId;
            await post({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, false).catch(() => undefined);

            const payload: Record<string, unknown> = { jsonrpc: '2.0', id: 2, method, params };
            return await post(payload);
        } finally {
            await close();
        }
    }
}
