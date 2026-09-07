import { WorkflowValidator, ValidationResult } from '@n8n-as-code/skills';
import { TypeScriptParser, WorkflowBuilder } from '@n8n-as-code/transformer';

export interface PreflightNodeIssue {
    name: string;
    type: string;
    errors: Array<{ path?: string; message: string }>;
}

export interface PreflightValidationOutcome {
    /** Which source produced the verdict: the instance MCP server, or the local schema. */
    source: 'server' | 'local' | 'unavailable';
    valid: boolean;
    issues: PreflightNodeIssue[];
    /** Local-only details when the server path was unavailable (reachability, tool missing). */
    skippedReason?: string;
    localResult?: ValidationResult;
}

export interface ServerValidatorOptions {
    /** Native n8n MCP HTTP endpoint. When unset no server validation is attempted. */
    endpoint?: string;
    /** Bearer token for the MCP endpoint. When unset the environment API key is used. */
    token?: string;
    /** Fallback bearer for self-hosted instances whose MCP server accepts the API key. */
    fallbackToken?: string;
    timeoutMs?: number;
}

interface McpResult {
    structuredContent?: { results?: Array<{ name?: string; type?: string; valid?: boolean; errors?: Array<{ path?: string; message?: string }> }> };
    content?: Array<{ type?: string; text?: string }>;
    isError?: boolean;
}

/**
 * Compiles a local workflow file (`.workflow.ts` or JSON) into the workflow JSON
 * shape n8n's `validate_node_config` RPC expects, and validates it.
 *
 * Validation order mirrors n8n itself:
 *  1. Server path — when the active environment exposes a native n8n MCP server
 *     with a `validate_node_config` tool, the instance schema is the ground
 *     truth (it never drifts from the instance like locally bundled schemas do).
 *  2. Local path — the bundled technical node index, which catches the
 *     display-option gating and resource-locator shape errors n8n's server
 *     validator reports (same error phrasing).
 *
 * A push that would deploy server-invalid nodes is blocked before any remote
 * write; this is the same guarantee the n8n UI gives when a workflow cannot be
 * saved with invalid parameters.
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

    private async callServerValidate(nodes: any[]): Promise<McpResult> {
        const { endpoint, token, fallbackToken, timeoutMs = 10000 } = this.server;
        if (!endpoint) throw new Error('No native MCP endpoint configured');

        let sessionId: string | undefined;
        const rpc = async (payload: Record<string, unknown>, expectResult = true): Promise<any> => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const headers: Record<string, string> = {
                    Accept: 'application/json, text/event-stream',
                    'Content-Type': 'application/json',
                    'mcp-protocol-version': '2024-11-05',
                    'User-Agent': 'n8n-as-code-preflight',
                };
                if (token || fallbackToken) headers.Authorization = `Bearer ${token || fallbackToken}`;
                if (sessionId) headers['mcp-session-id'] = sessionId;

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                });
                if (!response.ok) {
                    throw new Error(`Native MCP HTTP ${response.status} ${response.statusText}`);
                }
                sessionId = response.headers.get('mcp-session-id') || sessionId;
                const text = await response.text();
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
                return expectResult ? data.result : data;
            } finally {
                clearTimeout(timer);
            }
        };

        try {
            const init = await rpc({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'n8n-as-code', version: '1.0.0' } },
            });
            sessionId = sessionId || init?.sessionId;

            const toolList: any = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
            const tools: any[] = Array.isArray(toolList?.tools) ? toolList.tools : [];
            const hasValidator = tools.some((t) => t?.name === 'validate_node_config');
            if (!hasValidator) throw new Error('Instance MCP server does not expose validate_node_config');

            const result: any = await rpc({
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
            // Best-effort session close; a failure here must not mask validation results.
            if (sessionId) {
                try {
                    await rpc({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, false);
                } catch { /* already closed */ }
            }
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

        // 1. Server-authoritative path (when an MCP endpoint is available).
        if (this.server.endpoint) {
            try {
                const payload = this.buildNodePayload(workflow);
                const result = await this.callServerValidate(payload);
                return this.serverOutcome(result);
            } catch (error: any) {
                // Fall through to the local schema — the server may be an older
                // build without validate_node_config, or MCP may be disabled.
                const skippedReason = error?.message || String(error);
                const local = await this.validateWorkflowJson(workflow);
                return {
                    ...local,
                    source: 'local',
                    skippedReason: `Server-side validation unavailable (${skippedReason}).`,
                };
            }
        }

        // 2. Local schema path (always available; bundled technical node index).
        const local = await this.validateWorkflowJson(workflow);
        return { ...local, source: 'local' };
    }

    private async validateWorkflowJson(workflow: any): Promise<PreflightValidationOutcome> {
        const validator = this.technicalIndexPath
            ? new WorkflowValidator(this.technicalIndexPath)
            : new WorkflowValidator();
        const result = await validator.validateWorkflow(workflow, false);
        return {
            source: 'local',
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
