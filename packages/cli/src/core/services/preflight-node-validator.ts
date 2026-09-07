import { WorkflowValidator, ValidationResult } from '@n8n-as-code/skills';
import { TypeScriptParser, WorkflowBuilder } from '@n8n-as-code/transformer';
import { InstanceMcpClient } from './instance-mcp-client.js';

export interface PreflightNodeIssue {
    name: string;
    type: string;
    errors: Array<{ path?: string; message: string }>;
}

export interface PreflightValidationOutcome {
    /**
     * Which schema produced the verdict.
     *  - `server`: the instance's own `validate_node_config` (authoritative for
     *    the instance, immune to bundled-schema drift);
     *  - `local`: the bundled technical index, optionally merged with a
     *    per-instance schema overlay (level 1) — the DEFAULT validation.
     */
    source: 'server' | 'local';
    valid: boolean;
    issues: PreflightNodeIssue[];
    /** True when the instance MCP endpoint was attempted. */
    serverAttempted: boolean;
    /** True when the bundled index was merged with a per-instance schema overlay. */
    overlayUsed: boolean;
    /** Set when the server attempt could not run; the outcome then reflects the local (default) validation. */
    serverUnavailableReason?: string;
    localResult?: ValidationResult;
}

export interface PreflightNodeValidatorOptions {
    /** Native n8n MCP HTTP endpoint of the target instance. */
    endpoint?: string;
    /** Bearer token for the MCP endpoint: the configured native-MCP token, or the environment API key. */
    token?: string;
    timeoutMs?: number;
    /** Explicit technical index path (test seam; defaults to the bundled asset). */
    technicalIndexPath?: string;
    /** Per-instance schema overlay sidecar (custom-nodes shape) merged over the bundled index. */
    customNodesPath?: string | (() => string | undefined);
    /** Optional hook run after compile and before validation (e.g. level-1 overlay sync). */
    beforeValidate?: (workflow: any) => Promise<void>;
}

interface McpToolResult {
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
 *     shape, option values, required parameters). At level 1 the bundled index is
 *     merged with a per-instance schema overlay refreshed from the instance's own
 *     `get_node_types` (see `SchemaOverlayManager`).
 *  2. Instance (upgrade, level ≥ 2): the instance's own `validate_node_config`
 *     is the ground truth — it never drifts from the instance the way the bundled
 *     index (built from the latest n8n GitHub tag) can.
 *
 * A push that would deploy instance-invalid nodes is blocked before any remote
 * write — the same guarantee the n8n UI gives when a workflow cannot be saved.
 */
export class PreflightNodeValidator {
    private readonly technicalIndexPath: string | undefined;
    private readonly customNodesPath: string | (() => string | undefined) | undefined;
    private readonly beforeValidate: ((workflow: any) => Promise<void>) | undefined;
    private readonly server: { endpoint?: string; token?: string; timeoutMs?: number };

    constructor(options: PreflightNodeValidatorOptions = {}) {
        this.technicalIndexPath = options.technicalIndexPath;
        this.customNodesPath = options.customNodesPath;
        this.beforeValidate = options.beforeValidate;
        this.server = {
            endpoint: options.endpoint,
            token: options.token,
            timeoutMs: options.timeoutMs,
        };
    }

    private resolvedCustomNodesPath(): string | undefined {
        const value = this.customNodesPath;
        return typeof value === 'function' ? value() : value;
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

    private async callServerValidate(nodes: any[]): Promise<McpToolResult> {
        const { endpoint, token, timeoutMs = 10000 } = this.server;
        if (!endpoint) throw new Error('No native MCP endpoint configured');

        const client = new InstanceMcpClient({ endpoint, token, timeoutMs });
        const tools = await client.listTools();
        const hasValidator = tools.some((t) => t?.name === 'validate_node_config');
        if (!hasValidator) throw new Error('Instance MCP server does not expose validate_node_config');

        const result = (await client.callTool('validate_node_config', { nodes })) as McpToolResult;
        let structured: any = result?.structuredContent;
        if (!structured && Array.isArray(result?.content)) {
            const textPart = result.content.find((c) => c?.type === 'text' && c?.text)?.text;
            if (textPart) structured = JSON.parse(textPart);
        }
        return { ...result, structuredContent: structured };
    }

    private serverOutcome(result: McpToolResult): PreflightValidationOutcome {
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
            overlayUsed: false,
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
        await this.beforeValidate?.(workflow);

        // Instance path (authoritative upgrade, level ≥ 2).
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
        const customNodesPath = this.resolvedCustomNodesPath();
        const validator = this.technicalIndexPath
            ? new WorkflowValidator(this.technicalIndexPath, customNodesPath)
            : new WorkflowValidator(undefined, customNodesPath);
        const result = await validator.validateWorkflow(workflow, false);
        return {
            source: 'local',
            serverAttempted: false,
            overlayUsed: Boolean(customNodesPath),
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
