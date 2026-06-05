import type { NativeMcpConfig } from './native-mcp-config.js';

interface JsonRpcRequest {
    jsonrpc: '2.0';
    id?: number;
    method: string;
    params?: Record<string, unknown>;
}

interface JsonRpcResponse {
    jsonrpc?: '2.0';
    id?: number;
    result?: unknown;
    error?: { code?: number; message?: string; data?: unknown };
}

interface NativeMcpPostResult {
    result?: unknown;
    sessionId?: string;
}

export interface NativeMcpListToolsResult {
    tools: Array<Record<string, unknown>>;
}

function excerpt(value: string, maxLength = 500): string {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function parseSseJsonMessages(text: string): JsonRpcResponse[] {
    const messages: JsonRpcResponse[] = [];
    const dataLines: string[] = [];

    for (const line of text.split(/\r?\n/)) {
        if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
            continue;
        }
        if (line.trim() === '' && dataLines.length > 0) {
            const data = dataLines.join('\n');
            dataLines.length = 0;
            try {
                messages.push(JSON.parse(data) as JsonRpcResponse);
            } catch {
                // Ignore non-JSON SSE frames.
            }
        }
    }

    if (dataLines.length > 0) {
        try {
            messages.push(JSON.parse(dataLines.join('\n')) as JsonRpcResponse);
        } catch {
            // Ignore non-JSON SSE frames.
        }
    }

    return messages;
}

function parseJsonRpcResponse(text: string, contentType: string | null): JsonRpcResponse {
    const trimmed = text.trim();
    if (!trimmed) return {};

    if (contentType?.includes('text/event-stream') || trimmed.startsWith('event:') || trimmed.startsWith('data:')) {
        const messages = parseSseJsonMessages(trimmed);
        const response = [...messages].reverse().find((message) => message.result !== undefined || message.error !== undefined);
        if (!response) {
            throw new Error(`Native MCP returned an SSE response without a JSON-RPC result: ${excerpt(trimmed)}`);
        }
        return response;
    }

    const parsed = JSON.parse(trimmed) as JsonRpcResponse | JsonRpcResponse[];
    if (Array.isArray(parsed)) {
        const response = parsed.find((message) => message.result !== undefined || message.error !== undefined);
        if (!response) return {};
        return response;
    }
    return parsed;
}

export class NativeMcpHttpClient {
    private nextId = 1;

    constructor(private readonly config: NativeMcpConfig) {}

    async listTools(): Promise<NativeMcpListToolsResult> {
        return this.withSession(async (sessionId) => {
            const tools: Array<Record<string, unknown>> = [];
            let cursor: string | undefined;

            do {
                const params = cursor ? { cursor } : undefined;
                const result = await this.rpc('tools/list', params, sessionId) as Record<string, unknown>;
                const pageTools = Array.isArray(result?.tools) ? result.tools as Array<Record<string, unknown>> : [];
                tools.push(...pageTools);
                cursor = typeof result?.nextCursor === 'string' ? result.nextCursor : undefined;
            } while (cursor);

            return { tools };
        });
    }

    async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
        return this.withSession((sessionId) => this.rpc('tools/call', { name, arguments: args }, sessionId));
    }

    private async withSession<T>(callback: (sessionId?: string) => Promise<T>): Promise<T> {
        const sessionId = await this.initialize();
        try {
            return await callback(sessionId);
        } finally {
            await this.close(sessionId).catch(() => undefined);
        }
    }

    private async initialize(): Promise<string | undefined> {
        const init = await this.post({
            jsonrpc: '2.0',
            id: this.nextId++,
            method: 'initialize',
            params: {
                protocolVersion: this.config.protocolVersion,
                capabilities: {},
                clientInfo: {
                    name: 'n8n-as-code',
                    version: '1.0.0',
                },
            },
        });

        await this.post({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
            params: {},
        }, init.sessionId, false);

        return init.sessionId;
    }

    private rpc(method: string, params: Record<string, unknown> | undefined, sessionId?: string): Promise<unknown> {
        return this.post({
            jsonrpc: '2.0',
            id: this.nextId++,
            method,
            params,
        }, sessionId).then((response) => response.result);
    }

    private async post(payload: JsonRpcRequest, sessionId?: string, expectResponse = true): Promise<NativeMcpPostResult> {
        if (!this.config.endpoint) {
            throw new Error('Native n8n MCP endpoint is not configured. Set N8N_NATIVE_MCP_URL and N8NAC_NATIVE_MCP_ENABLED=1.');
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

        try {
            const headers: Record<string, string> = {
                Accept: 'application/json, text/event-stream',
                'Content-Type': 'application/json',
                'User-Agent': 'n8n-as-code',
            };
            if (this.config.token) {
                headers.Authorization = `Bearer ${this.config.token}`;
            }
            if (sessionId) {
                headers['mcp-session-id'] = sessionId;
            }

            const response = await fetch(this.config.endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal,
            });

            const text = await response.text();
            const nextSessionId = response.headers.get('mcp-session-id') || sessionId;

            if (!response.ok) {
                throw new Error(`Native MCP request failed (${response.status} ${response.statusText}): ${excerpt(text)}`);
            }

            if (!expectResponse || !text.trim()) {
                return { sessionId: nextSessionId };
            }

            const message = parseJsonRpcResponse(text, response.headers.get('content-type'));
            if (message.error) {
                throw new Error(message.error.message || `Native MCP JSON-RPC error ${message.error.code ?? 'unknown'}`);
            }

            return { result: message.result, sessionId: nextSessionId };
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                throw new Error(`Native MCP request timed out after ${this.config.timeoutMs}ms`);
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    private async close(sessionId?: string): Promise<void> {
        if (!this.config.endpoint || !sessionId) return;
        const headers: Record<string, string> = { 'User-Agent': 'n8n-as-code', 'mcp-session-id': sessionId };
        if (this.config.token) {
            headers.Authorization = `Bearer ${this.config.token}`;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
        try {
            await fetch(this.config.endpoint, { method: 'DELETE', headers, signal: controller.signal });
        } finally {
            clearTimeout(timeout);
        }
    }
}
