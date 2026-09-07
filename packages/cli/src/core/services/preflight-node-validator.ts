import { WorkflowValidator, ValidationResult } from '@n8n-as-code/skills';
import { TypeScriptParser, WorkflowBuilder } from '@n8n-as-code/transformer';

export interface PreflightNodeIssue {
    name: string;
    type: string;
    errors: Array<{ path?: string; message: string }>;
}

export interface PreflightValidationOutcome {
    /**
     * Which schema produced the verdict.
     *  - `server`: the instance's own `validate_node_config` (authoritative for the
     *    instance, immune to bundled-schema drift);
     *  - `local`: the bundled technical node index — the DEFAULT validation, which
     *    runs whenever no instance MCP endpoint is reachable.
     */
    source: 'server' | 'local';
    valid: boolean;
    issues: PreflightNodeIssue[];
    /** True when an instance MCP endpoint was available and attempted. */
    serverAttempted: boolean;
    /** Set when the server attempt could not run; the outcome then reflects the local (default) validation. */
    serverUnavailableReason?: string;
    localResult?: ValidationResult;
}

export interface ServerValidatorOptions {
    /** Native n8n MCP HTTP endpoint of the target instance. */
    endpoint?: string;
    /** Bearer token for the MCP endpoint: the configured native-MCP token, or the environment API key. */
    token?: string;
    timeoutMs?: number;
}

/** Loopback hostnames on which plaintext http is acceptable (local dev/self-hosted instances). */
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isSchemeAllowed(endpoint: string): boolean {
    try {
        const parsed = new URL(endpoint);
        if (parsed.protocol === 'https:') return true;
        if (parsed.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(parsed.hostname)) return true;
        return false;
    } catch {
        return false;
    }
}

interface McpResult {
    structuredContent?: { results?: Array<{ name?: string; type?: string; valid?: boolean; errors?: Array<{ path?: string; message?: string }> }> };
    content?: Array<{ type?: string; text?: string }>;
    isError?: boolean;
}

/**
 * Compiles a local workflow file (`.workflow.ts` or JSON) into the workflow JSON
 * shape n8n's `validate_node_config` RPC expects, and validates it before push.
 *
 * Validation model — local first, instance as the authoritative upgrade:
 *  1. Local (default): the bundled technical node index runs the server-equivalent
 *     gating rules (display-option gating with schema defaults, resource-locator
 *     shape, option values, required parameters). Always available, no network.
 *  2. Instance (upgrade): when the environment reaches an n8n MCP server exposing
 *     `validate_node_config`, the instance's own schema is the ground truth — it
 *     never drifts from the instance the way the bundled index (built from the
 *     latest n8n GitHub tag) can. The same API key authenticates on self-hosted
 *     instances with the MCP server enabled; n8n Cloud needs its dedicated
 *     instance-level MCP token.
 *
 * A push that would deploy instance-invalid nodes is blocked before any remote
 * write — the same guarantee the n8n UI gives when a workflow cannot be saved.
 */
export class PreflightNodeValidator {
    private readonly technicalIndexPath: string | undefined;
    private readonly server: ServerValidatorOptions;

    constructor(options: { technicalIndexPath?: string } & ServerValidatorOptions = {}) {
        this.technicalIndexPath = options.technicalIndexPath;
        const { technicalIndexPath: _ignored, ...server } = options;
        this.server = server;
    }

    private async compileWorkflowFile(filePath: string): Promise<any> {
        const content = await import('node:fs/promises').then((fs) => fs.readFile(filePath, 'utf8'));
        if (/\.json$/i.test(filePath)) {
            return JSON.parse(content);
        }
        const parser = new TypeScriptParser();
        const ast = await parser.parseCode(content);
        return new WorkflowBuilder().build(ast);
    }

    /**
     * Build the `validate_node_config` node payload, attaching the subnode
     * map (model/memory/tools) n8n derives from AI connections to each node.
     */
    private buildNodePayload(workflow: any): any[] {
        const nodes: any[] = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
        const connections = workflow?.connections && typeof workflow.connections === 'object' ? workflow.connections : {};

        const incoming: Record<string, Record<string, any[]>> = {};
        for (const [sourceName, connGroups] of Object.entries<any>(connections)) {
            const source = nodes.find((n) => n.name === sourceName);
            if (!source) continue;
            for (const [connType, targetGroups] of Object.entries<any>(connGroups ?? {})) {
                if (!Array.isArray(targetGroups)) continue;
                for (const group of targetGroups) {
                    if (!Array.isArray(group)) continue;
                    for (const target of group) {
                        if (!target || typeof target.node !== 'string' || connType === 'main') continue;
                        if (!incoming[target.node]) incoming[target.node] = {};
                        if (!incoming[target.node][connType]) incoming[target.node][connType] = [];
                        if (!incoming[target.node][connType].includes(source)) {
                            incoming[target.node][connType].push(source);
                        }
                    }
                }
            }
        }

        const isWiredAsTool = (nodeName: string): boolean => {
            for (const connMap of Object.values(incoming)) {
                if ((connMap as any).ai_tool?.some((n: any) => n.name === nodeName)) return true;
            }
            return false;
        };

        return nodes.map((n) => {
            const item: any = {
                name: n.name,
                type: n.type,
                typeVersion: n.typeVersion || 1,
                parameters: n.parameters || {},
                isToolNode: isWiredAsTool(n.name) || (typeof n.type === 'string' && n.type.toLowerCase().includes('tool')),
            };

            const inc = incoming[n.name] || {};
            const isAgentLike = typeof n.type === 'string' && n.type.includes('agent');
            const hasAiInputs = ['ai_languageModel', 'ai_memory', 'ai_tool'].some((t) => (inc as any)[t]?.length);
            if (isAgentLike || hasAiInputs) {
                const subnodes: Record<string, any> = {};
                if ((inc as any).ai_languageModel?.[0]) {
                    const first = (inc as any).ai_languageModel[0];
                    subnodes.model = { type: first.type, version: first.typeVersion || 1 };
                }
                if ((inc as any).ai_memory?.[0]) {
                    const first = (inc as any).ai_memory[0];
                    subnodes.memory = { type: first.type, version: first.typeVersion || 1 };
                }
                if ((inc as any).ai_tool?.length) {
                    subnodes.tools = (inc as any).ai_tool.map((t: any) => ({ type: t.type, version: t.typeVersion || 1 }));
                }
                item.subnodes = subnodes;
            }
            return item;
        });
    }

    /**
     * Minimal streamable-HTTP MCP client for one validate_node_config round trip:
     * initialize → notifications/initialized → tools/list → tools/call, then an
     * authenticated DELETE to release the session (mirrors NativeMcpHttpClient).
     */
    private async callServerValidate(nodes: any[]): Promise<McpResult> {
        const { endpoint, token, timeoutMs = 10000 } = this.server;
        if (!endpoint) throw new Error('No native MCP endpoint configured');
        if (!isSchemeAllowed(endpoint)) {
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
                return data.result;
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
                await fetch(endpoint, { method: 'DELETE', headers, signal: controller.signal });
            } catch {
                // Best-effort cleanup; a failure here must not mask validation results.
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

            // Completes the MCP handshake; its response is an empty notification.
            await post({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, false).catch(() => undefined);

            const toolList: any = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
            const tools: any[] = Array.isArray(toolList?.tools) ? toolList.tools : [];
            const hasValidator = tools.some((t) => t?.name === 'validate_node_config');
            if (!hasValidator) throw new Error('Instance MCP server does not expose validate_node_config');

            const result: any = await post({
                jsonrpc: '2.0',
                id: 3,
                method: 'tools/call',
                params: { name: 'validate_node_config', arguments: { nodes } },
            });

            let structured: any = result?.structuredContent;
            if (!structured && Array.isArray(result?.content)) {
                const textPart = result.content.find((c: any) => c?.type === 'text' && c?.text)?.text;
                if (textPart) structured = JSON.parse(textPart);
            }
            return { ...result, structuredContent: structured };
        } finally {
            await close();
        }
    }

    private serverOutcome(result: McpResult): PreflightValidationOutcome {
        const results = result.structuredContent?.results;
        if (!Array.isArray(results)) {
            const errorText = Array.isArray(result?.content)
                ? result.content.filter((c) => c?.type === 'text').map((c) => c.text).join('\n')
                : '';
            throw new Error(`validate_node_config returned no per-node results${errorText ? `: ${errorText.slice(0, 300)}` : ''}`);
        }
        const invalid = results.filter((r) => r.valid !== true);
        return {
            source: 'server',
            serverAttempted: true,
            valid: invalid.length === 0,
            issues: invalid.map((r) => ({
                name: String(r.name ?? '?'),
                type: String(r.type ?? '?'),
                errors: (r.errors ?? [])
                    .filter((e): e is { path?: string; message: string } => typeof e?.message === 'string')
                    .map((e) => ({ path: e.path, message: e.message })),
            })),
        };
    }

    /**
     * Validate a local workflow file before it is pushed. Never throws for
     * validation findings — it returns them. Throws only on workflow compile
     * failures, which the caller should let surface (the push itself would fail).
     */
    async validateFile(filePath: string): Promise<PreflightValidationOutcome> {
        const workflow = await this.compileWorkflowFile(filePath);

        // Instance path (authoritative upgrade) — attempted whenever an endpoint is
        // reachable; the instance's own schema never drifts from the instance.
        if (this.server.endpoint) {
            try {
                const payload = this.buildNodePayload(workflow);
                const result = await this.callServerValidate(payload);
                return this.serverOutcome(result);
            } catch (error: any) {
                // The instance may run an n8n build without validate_node_config,
                // MCP may be disabled, or the endpoint may reject the token —
                // fall through to the bundled-schema (default) validation.
                const reason = error?.message || String(error);
                const local = await this.validateWorkflowJson(workflow);
                return {
                    ...local,
                    serverAttempted: true,
                    serverUnavailableReason: reason,
                };
            }
        }

        // Bundled-schema path (default) — always available, no network required.
        const local = await this.validateWorkflowJson(workflow);
        return { ...local, serverAttempted: false };
    }

    private async validateWorkflowJson(workflow: any): Promise<PreflightValidationOutcome> {
        const validator = this.technicalIndexPath
            ? new WorkflowValidator(this.technicalIndexPath)
            : new WorkflowValidator();
        const result = await validator.validateWorkflow(workflow, false);
        return {
            source: 'local',
            serverAttempted: false,
            valid: result.valid,
            issues: result.errors.map((e) => ({
                name: e.nodeName ?? 'unknown',
                type: 'unknown',
                errors: [{ path: e.path, message: e.message }],
            })),
            localResult: result,
        };
    }
}
