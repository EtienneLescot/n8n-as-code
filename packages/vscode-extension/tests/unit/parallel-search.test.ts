import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';
import { AgentRuntimeController } from '../../src/services/agent-runtime-controller.js';
import { isWorkbenchWebSearchEnabled, PARALLEL_SEARCH_URL, PARALLEL_SEARCH_USER_AGENT } from '../../src/services/parallel-search.js';

// Scripted inference, real Workbench resolver, DeepAgents tool dispatch and HTTP MCP adapter.
class SearchModel extends BaseChatModel {
    actions: Array<{ name: string; args: Record<string, unknown> }> = [];
    boundTools: string[] = [];
    observedResults: string[] = [];
    searchEachTurn = false;
    _llmType() { return 'scripted-search'; }
    bindTools(tools: Array<{ name: string }>) { this.boundTools = tools.map((t) => t.name); return this; }
    async _generate(messages: BaseMessage[]): Promise<ChatResult> {
        const result = [...messages].reverse().find((m) => m instanceof ToolMessage);
        if (result) this.observedResults.push(JSON.stringify(result.content));
        const action = this.searchEachTurn
            ? (messages.at(-1) instanceof ToolMessage ? undefined : search())
            : this.actions.shift();
        const message = action ? new AIMessage({ content: '', tool_calls: [{ ...action, id: randomUUID(), type: 'tool_call' }] })
            : new AIMessage({ content: result ? `Source: ${JSON.stringify(result.content)}` : 'Ready.', additional_kwargs: { phase: 'final' }, response_metadata: { phase: 'final' } });
        return { generations: [{ message, text: String(message.content) }] };
    }
}

const search = () => ({ name: 'parallel__web_search', args: { objective: 'Find current Webhook documentation', search_queries: ['n8n webhook documentation'], session_id: 'model-chosen-value' } });
const fetchPage = (url = 'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/') => ({ name: 'parallel__web_fetch', args: { urls: [url] } });

async function fixture() {
    const requests: Array<{ url: string; headers: Headers; body: any }> = [];
    const serverRequests: Array<{ method: string; authorization?: string }> = [];
    let mode: 'ok' | 'quota' | 'error' | 'slow' | 'discovery-slow' | 'discovery-error' = 'ok';
    const server = http.createServer(async (req, res) => {
        if (req.method !== 'POST') { res.writeHead(405).end(); return; }
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(Buffer.concat(chunks).toString());
        serverRequests.push({ method: body.method, authorization: req.headers.authorization });
        if (!('id' in body)) { res.writeHead(202).end(); return; }
        if (body.method === 'initialize' && mode === 'discovery-error') { res.writeHead(503).end('Unavailable'); return; }
        if (body.method === 'initialize' && mode === 'discovery-slow') await new Promise((resolve) => setTimeout(resolve, 300));
        if (body.method === 'tools/call' && mode === 'slow') await new Promise((resolve) => setTimeout(resolve, 300));
        const reply = (result: unknown) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
        if (body.method === 'initialize') reply({ protocolVersion: body.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'parallel-fixture', version: '1.0.0' } });
        else if (body.method === 'tools/list') reply({ tools: [
            { name: 'web_search', description: 'Search public web documentation.', inputSchema: { type: 'object', properties: { objective: { type: 'string' }, search_queries: { type: 'array', items: { type: 'string' } }, session_id: { type: 'string' }, model_name: { type: 'string' } }, required: ['objective', 'search_queries'] } },
            { name: 'web_fetch', description: 'Fetch public HTTP pages.', inputSchema: { type: 'object', properties: { objective: { anyOf: [{ type: 'string' }, { type: 'null' }] }, urls: { type: 'array', items: { type: 'string' } }, session_id: { type: 'string' } }, required: ['urls'] } },
        ] });
        else if (body.method === 'tools/call') {
            if (mode === 'error') { res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32603, message: 'Search backend unavailable' } })); return; }
            reply({ content: [{ type: 'text', text: mode === 'quota' ? 'Free anonymous quota exceeded' : body.params.name === 'web_search' ? 'Webhook documentation https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/' : 'Webhook supports GET and POST. https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/' }], ...(mode === 'quota' ? { isError: true } : {}) });
        } else reply({});
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
        const request = new Request(input, init);
        if (request.url === PARALLEL_SEARCH_URL) {
            const body = request.method === 'POST' ? await request.clone().json() : undefined;
            requests.push({ url: request.url, headers: request.headers, body });
            return originalFetch(new Request(`http://127.0.0.1:${address.port}/mcp`, request));
        }
        return originalFetch(input, init);
    };
    const preferences: { enabled?: boolean; trusted: boolean } = { trusted: true };
    const host = { Uri: { file: (fsPath: string) => ({ fsPath }) }, workspace: { get isTrusted() { return preferences.trusted; }, getConfiguration: (section: string, uri: any) => {
            assert.equal(section, 'n8n.agent'); assert.ok(uri.fsPath);
            return { get: (key: string, fallback: boolean) => { assert.equal(key, 'webSearch.enabled'); return preferences.enabled ?? fallback; } };
        } } };
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-search-'));
    const state = new Map<string, unknown>();
    const memento = { get: (key: string, fallback: unknown) => state.has(key) ? state.get(key) : fallback, update: async (key: string, value: unknown) => { state.set(key, value); } };
    const model = new SearchModel({});
    const controller = new AgentRuntimeController({ globalStorageUri: { fsPath: path.join(root, 'storage') }, globalState: memento, workspaceState: memento, secrets: { get: async () => undefined } } as any, { appendLine: () => undefined } as any);
    (controller as any).getWorkbenchWebSearchHost = async () => host;
    (controller as any).getProviderRuntimeConfig = async () => ({ ready: true, provider: 'openai-compatible', model: 'scripted-search', temperature: 0 });
    (controller as any).createLangChainModel = async () => model;
    (controller as any).resolveContextWindow = async () => 200_000;
    const workspaceRoot = path.join(root, 'workspace'); fs.mkdirSync(workspaceRoot);
    const send = async (sessionId?: string) => {
        const messages: any[] = [];
        await controller.sendPrompt({ prompt: 'Research current webhook docs and cite sources.', workspaceRoot, sessionId }, async (m) => { messages.push(m); return true; });
        assert.equal(messages.some((m) => m.type === 'agent.error'), false, JSON.stringify(messages));
        const final = messages.findLast((m) => m.type === 'agent.streamEvent' && m.event.type === 'final');
        assert.ok(final, JSON.stringify(messages));
        return final.event;
    };
    return { requests, serverRequests, preferences, model, controller, workspaceRoot, host, send, nativeUrl: `http://127.0.0.1:${address.port}/mcp`, setMode: (next: typeof mode) => { mode = next; }, close: async () => {
        await (controller as any).cachedAgentHandle?.handle?.mcpClient?.close();
        controller.dispose(); await (controller as any).flushSessionWrites();
        globalThis.fetch = originalFetch;
        server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
        fs.rmSync(root, { recursive: true, force: true });
    } };
}

function calls(f: Awaited<ReturnType<typeof fixture>>) { return f.requests.filter((r) => r.body?.method === 'tools/call').map((r) => r.body.params); }

test('fresh no-key Workbench dispatches search/fetch and consumes cited results across turns and new chats', { timeout: 120_000 }, async () => {
    const f = await fixture();
    try {
        assert.equal(isWorkbenchWebSearchEnabled(f.workspaceRoot, f.host as any), true);
        f.model.actions.push(search(), fetchPage());
        const first = await f.send();
        assert.match(first.response, /Webhook supports GET and POST/);
        assert.ok(f.model.observedResults.some((r) => r.includes('https://docs.n8n.io/')));
        const handle = (f.controller as any).cachedAgentHandle.handle;
        f.model.actions.push(search()); await f.send(first.sessionId);
        assert.equal((f.controller as any).cachedAgentHandle.handle, handle);
        assert.equal(calls(f).length, 3);
        assert.equal(new Set(calls(f).map((c) => c.arguments.session_id)).size, 1);
        assert.equal(calls(f)[0].arguments.session_id, first.sessionId);
        assert.notEqual(first.sessionId, 'model-chosen-value');
        // Rotate through the production new-chat operation.
        const next = await f.controller.createSession({ workspaceRoot: f.workspaceRoot });
        f.model.actions.push(search()); await f.send(next.activeSessionId);
        assert.notEqual(calls(f).at(-1).arguments.session_id, first.sessionId);
        for (const r of f.requests) {
            assert.equal(r.url, PARALLEL_SEARCH_URL);
            assert.equal(r.headers.get('User-Agent'), PARALLEL_SEARCH_USER_AGENT);
            assert.equal(r.headers.has('Authorization'), false);
        }
        assert.ok(f.requests.some((r) => r.body?.method === 'initialize'));
        assert.ok(f.requests.some((r) => r.body?.method === 'tools/list'));
    } finally { await f.close(); }
});

test('disabled search and untrusted workspaces make no Parallel connection; next turn drops cached search tools', { timeout: 120_000 }, async () => {
    const f = await fixture();
    try {
        f.preferences.enabled = false; await f.send();
        assert.equal(f.requests.length, 0); assert.equal(f.model.boundTools.includes('parallel__web_search'), false);
        f.preferences.enabled = true; f.preferences.trusted = false; await f.send();
        assert.equal(f.requests.length, 0);
        f.preferences.trusted = true; const session = await f.send();
        assert.ok(f.model.boundTools.includes('parallel__web_search'));
        const count = f.requests.length; f.preferences.enabled = false;
        await f.send(session.sessionId);
        assert.equal(f.requests.length, count); assert.equal(f.model.boundTools.includes('parallel__web_search'), false);
    } finally { await f.close(); }
});

test('shared cached MCP client isolates interleaved conversation IDs and retains them on errors/retries', { timeout: 120_000 }, async () => {
    const f = await fixture();
    try {
        const a = await f.send(); const b = await f.controller.createSession({ workspaceRoot: f.workspaceRoot });
        const handle = (f.controller as any).cachedAgentHandle.handle;
        f.model.searchEachTurn = true;
        const beforeConcurrent = calls(f).length;
        await Promise.all([f.send(a.sessionId), f.send(b.activeSessionId)]);
        const conversationCalls = calls(f).slice(beforeConcurrent);
        assert.deepEqual(conversationCalls.map((c) => c.arguments.session_id).sort(), [a.sessionId, b.activeSessionId].sort());
        assert.equal((f.controller as any).cachedAgentHandle.handle, handle);
        f.model.searchEachTurn = false;
        const beforeDirect = calls(f).length;
        const tools = (await (f.controller as any).createWorkbenchMcpTools(f.workspaceRoot));
        try {
            const tool = tools.tools.find((t: any) => t.name === 'parallel__web_search');
            const invoke = (id: string) => tool.invoke(search().args, { configurable: { thread_id: id } });
            await Promise.all([invoke(a.sessionId), invoke(b.activeSessionId), invoke(a.sessionId), invoke(b.activeSessionId)]);
            assert.deepEqual(calls(f).slice(beforeDirect).map((c) => c.arguments.session_id).sort(), [a.sessionId, a.sessionId, b.activeSessionId, b.activeSessionId].sort());
            f.setMode('quota'); await assert.rejects(invoke(a.sessionId), /quota/);
            f.setMode('error'); await assert.rejects(invoke(a.sessionId), /unavailable/);
            f.setMode('ok'); await invoke(a.sessionId);
            assert.ok(calls(f).slice(-3).every((c) => c.arguments.session_id === a.sessionId));
            await assert.rejects(tool.invoke(search().args), /conversation/);
            assert.equal((f.controller as any).cachedAgentHandle.handle, handle);
        } finally { await tools.client.close(); }
    } finally { await f.close(); }
});

test('MCP caller validates fetch URLs and propagates timeouts and cancellation', { timeout: 120_000 }, async () => {
    const f = await fixture();
    try {
        const session = await f.send();
        const tools = await (f.controller as any).createWorkbenchMcpTools(f.workspaceRoot);
        try {
            const tool = tools.tools.find((t: any) => t.name === 'parallel__web_fetch');
            assert.deepEqual(tool.schema.properties.objective.anyOf, [{ type: 'string' }, { type: 'null' }]);
            assert.equal('session_id' in tool.schema.properties, false);
            const config = { configurable: { thread_id: session.sessionId } };
            const count = calls(f).length;
            for (const url of ['file:///etc/passwd', 'ftp://example.com', 'not a URL', 'https://secret@example.com']) await assert.rejects(tool.invoke(fetchPage(url).args, config), /HTTP or HTTPS/);
            assert.equal(calls(f).length, count);
            f.setMode('slow');
            await assert.rejects(tool.invoke(fetchPage().args, { ...config, timeout: 20 }), /timed out|timeout/i);
            const abort = new AbortController();
            const pending = tool.invoke(fetchPage().args, { ...config, signal: abort.signal });
            setTimeout(() => abort.abort(), 30);
            await assert.rejects(pending, /abort/i);
        } finally { await tools.client.close(); }
    } finally { await f.close(); }
});


test('Parallel tools coexist with saved native MCP configuration without renaming native tools', { timeout: 120_000 }, async () => {
    const f = await fixture();
    try {
        // The native environment resolver is a boundary here; both MCP loaders and requests are real.
        const saved = { id: 'native-n8n-dev', name: 'Dev', transport: 'http', url: f.nativeUrl, headers: { Authorization: 'Bearer saved-native-token' }, timeoutMs: 5000 };
        (f.controller as any).resolveNativeN8nMcpServer = async () => saved;
        f.model.actions.push(search()); const session = await f.send();
        assert.ok(f.model.boundTools.includes('web_search'));
        assert.ok(f.model.boundTools.includes('parallel__web_search'));
        assert.deepEqual(saved.headers, { Authorization: 'Bearer saved-native-token' });
        assert.ok(f.serverRequests.some((r) => r.method === 'tools/list' && r.authorization === 'Bearer saved-native-token'));
        assert.ok(f.serverRequests.some((r) => r.method === 'tools/call' && !r.authorization));
        f.preferences.enabled = false; await f.send(session.sessionId);
        assert.ok(f.model.boundTools.includes('web_search'));
        assert.equal(f.model.boundTools.includes('parallel__web_search'), false);
    } finally { await f.close(); }
});


test('failed discovery leaves local tools usable and cancellation interrupts search setup', { timeout: 120_000 }, async () => {
    const f = await fixture();
    try {
        f.setMode('discovery-error'); await f.send();
        assert.equal(f.model.boundTools.includes('parallel__web_search'), false);
        assert.ok(f.model.boundTools.includes('read_file'));
        f.setMode('discovery-slow');
        const abort = new AbortController();
        const pending = (f.controller as any).createWorkbenchMcpTools(f.workspaceRoot, abort.signal);
        setTimeout(() => abort.abort(), 30);
        await assert.rejects(pending, /abort/i);
        // Allow the delayed fixture connection to settle and be closed by the loader.
        await new Promise((resolve) => setTimeout(resolve, 350));
    } finally { await f.close(); }
});
