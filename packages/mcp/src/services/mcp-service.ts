import { readFileSync, statSync } from 'fs';
import { join } from 'path';
import type {
    CustomNodesResolution,
    KnowledgeSearch,
    NodeSchemaProvider,
    WorkflowRegistry,
    WorkflowValidator,
} from '@n8n-as-code/skills';
import { NativeMcpHttpClient } from './native-mcp-client.js';
import { loadNativeMcpConfig, redactNativeMcpConfig, type NativeMcpConfig, type NativeMcpWorkspaceConfigInput } from './native-mcp-config.js';
import {
    buildNativeMcpCapabilities,
    missingNativeMcpTools,
    summarizeNativeMcpTools,
    type NativeMcpToolSummary,
} from './native-mcp-tools.js';

export interface N8nAsCodeMcpServiceOptions {
    cwd?: string;
    /** Override the generated knowledge assets directory. Tests point this at fixtures. */
    assetsDir?: string;
    nativeMcpEnv?: NodeJS.ProcessEnv;
    nativeMcpWorkspace?: NativeMcpWorkspaceConfigInput;
}

export interface ValidateWorkflowOptions {
    workflowContent: string;
    format?: 'auto' | 'json' | 'typescript';
}

/** @deprecated The MCP server no longer shells out to the CLI. Retained as public API. */
export interface CliExecutionResult {
    command: string[];
    cwd: string;
    exitCode: number;
    success: boolean;
    stdout: string;
    stderr: string;
    parsedJson?: unknown;
}

function detectWorkflowFormat(workflowContent: string, format: 'auto' | 'json' | 'typescript' = 'auto'): boolean {
    if (format === 'typescript') {
        return true;
    }

    if (format === 'json') {
        return false;
    }

    const trimmed = workflowContent.trim();
    return trimmed.startsWith('import ')
        || trimmed.startsWith('@workflow')
        || trimmed.includes('export class');
}

export class N8nAsCodeMcpService {
    readonly cwd: string;
    private readonly nativeMcpConfig: NativeMcpConfig;
    private readonly assetsDirOverride?: string;

    // Local knowledge services, loaded once and kept warm for the life of the server.
    // Per-service rather than one bundle: a node lookup must not pay for the workflow
    // example index, and only the validator drags in ts-morph.
    private provider?: Promise<NodeSchemaProvider>;
    private knowledge?: Promise<KnowledgeSearch>;
    private registry?: Promise<WorkflowRegistry>;
    private validator?: Promise<WorkflowValidator>;
    private assetsDir?: string;
    private providerKey?: string;
    private validatorKey?: string;

    constructor(options: N8nAsCodeMcpServiceOptions = {}) {
        this.cwd = options.cwd || process.cwd();
        this.assetsDirOverride = options.assetsDir;
        this.nativeMcpConfig = loadNativeMcpConfig(options.nativeMcpEnv, {
            cwd: this.cwd,
            environmentNameOrId: options.nativeMcpEnv?.N8NAC_ENVIRONMENT,
            workspace: options.nativeMcpWorkspace,
        });
    }

    isNativeMcpEnabled(): boolean {
        return this.nativeMcpConfig.enabled;
    }

    isNativeMcpConfigured(): boolean {
        return this.nativeMcpConfig.enabled && Boolean(this.nativeMcpConfig.endpoint);
    }

    canExposeNativeMcpRemotely(): boolean {
        return this.nativeMcpConfig.allowRemoteExposure;
    }

    allowsNativeMcpExecutionData(): boolean {
        return this.nativeMcpConfig.allowExecutionData;
    }

    async getNativeMcpStatus(options: { includeTools?: boolean } = {}) {
        const config = redactNativeMcpConfig(this.nativeMcpConfig);
        const status: {
            config: ReturnType<typeof redactNativeMcpConfig>;
            connection: {
                checked: boolean;
                ok?: boolean;
                error?: string;
            };
            tools?: {
                count: number;
                names: string[];
                missingReadOnlyTools: string[];
            };
            capabilities?: ReturnType<typeof buildNativeMcpCapabilities>;
        } = {
            config,
            connection: { checked: false },
        };

        if (!this.nativeMcpConfig.enabled) {
            status.connection.error = 'Native n8n MCP assist is disabled. Configure it for the active n8nac environment with `n8nac native-mcp configure`, or set N8NAC_NATIVE_MCP_ENABLED=1.';
            return status;
        }

        if (!this.nativeMcpConfig.endpoint) {
            status.connection.error = 'Native n8n MCP endpoint is not configured. Set it with `n8nac native-mcp configure --url <url>`, or set N8N_NATIVE_MCP_URL or N8NAC_NATIVE_MCP_URL.';
            return status;
        }

        if (!options.includeTools) {
            return status;
        }

        status.connection.checked = true;

        try {
            const tools = await this.listNativeMcpTools();
            status.connection.ok = true;
            status.tools = {
                count: tools.length,
                names: tools.map((tool) => tool.name),
                missingReadOnlyTools: missingNativeMcpTools(tools),
            };
            status.capabilities = buildNativeMcpCapabilities(tools);
        } catch (error: any) {
            status.connection.ok = false;
            status.connection.error = error?.message || String(error);
        }

        return status;
    }

    private async getAssetsDir(): Promise<string> {
        if (this.assetsDir === undefined) {
            const { resolveSkillsAssetsDir } = await import('@n8n-as-code/skills');
            this.assetsDir = this.assetsDirOverride ?? resolveSkillsAssetsDir();
        }
        return this.assetsDir;
    }

    /**
     * Resolved against this service's cwd, not the process cwd. The spawn path used to get
     * this right by accident, by passing `cwd` to the child process.
     */
    /**
     * Identity of the current custom-nodes file, so a resident server notices edits.
     *
     * The server outlives the files it reads: in an editor it can run for days while
     * `n8nac-custom-nodes.json` is added or changed. Memoizing the provider forever made
     * those edits invisible until restart.
     */
    private customNodesFingerprint(resolvedPath?: string): string {
        if (!resolvedPath) return 'none';
        try {
            const stat = statSync(resolvedPath);
            return `${resolvedPath}:${stat.mtimeMs}:${stat.size}`;
        } catch {
            return `${resolvedPath}:missing`;
        }
    }

    /** Cheap: reads one small JSON, so it is re-read per call rather than memoized. */
    private async getCustomNodes(): Promise<CustomNodesResolution> {
        const { resolveCustomNodesConfig } = await import('@n8n-as-code/skills');
        return resolveCustomNodesConfig(this.cwd);
    }

    private async getProvider(): Promise<NodeSchemaProvider> {
        const customNodes = await this.getCustomNodes();
        const key = this.customNodesFingerprint(customNodes.resolvedPath);

        if (!this.provider || this.providerKey !== key) {
            this.providerKey = key;
            this.provider = Promise.all([import('@n8n-as-code/skills'), this.getAssetsDir()])
                .then(([{ NodeSchemaProvider }, assetsDir]) =>
                    new NodeSchemaProvider(join(assetsDir, 'n8n-nodes-technical.json'), customNodes.resolvedPath));
        }
        return this.provider;
    }

    private getKnowledge(): Promise<KnowledgeSearch> {
        if (!this.knowledge) {
            this.knowledge = Promise.all([
                import('@n8n-as-code/skills'),
                this.getAssetsDir(),
            ]).then(([{ KnowledgeSearch }, assetsDir]) =>
                new KnowledgeSearch(join(assetsDir, 'n8n-knowledge-index.json')));
        }
        return this.knowledge;
    }

    private getRegistry(): Promise<WorkflowRegistry> {
        if (!this.registry) {
            this.registry = Promise.all([
                import('@n8n-as-code/skills'),
                this.getAssetsDir(),
            ]).then(([{ WorkflowRegistry }, assetsDir]) =>
                // Pass the path explicitly: the no-argument constructor self-resolves and,
                // on a miss, returns an empty index instead of failing.
                new WorkflowRegistry(join(assetsDir, 'workflows-index.json')));
        }
        return this.registry;
    }

    private async getValidator(): Promise<WorkflowValidator> {
        const customNodes = await this.getCustomNodes();
        const key = this.customNodesFingerprint(customNodes.resolvedPath);

        if (!this.validator || this.validatorKey !== key) {
            this.validatorKey = key;
            this.validator = Promise.all([import('@n8n-as-code/skills'), this.getAssetsDir()])
                .then(([{ WorkflowValidator }, assetsDir]) =>
                    new WorkflowValidator(join(assetsDir, 'n8n-nodes-technical.json'), customNodes.resolvedPath));
        }
        return this.validator;
    }

    private createNativeMcpClient(): NativeMcpHttpClient {
        if (!this.nativeMcpConfig.enabled) {
            throw new Error('Native n8n MCP assist is disabled. Configure it for the active n8nac environment with `n8nac native-mcp configure`, or set N8NAC_NATIVE_MCP_ENABLED=1.');
        }
        if (!this.nativeMcpConfig.endpoint) {
            throw new Error('Native n8n MCP endpoint is not configured. Set it with `n8nac native-mcp configure --url <url>`, or set N8N_NATIVE_MCP_URL or N8NAC_NATIVE_MCP_URL.');
        }
        return new NativeMcpHttpClient(this.nativeMcpConfig);
    }

    async listNativeMcpTools(): Promise<NativeMcpToolSummary[]> {
        const result = await this.createNativeMcpClient().listTools();
        return summarizeNativeMcpTools(result.tools);
    }

    async callNativeMcpTool(toolName: string, args: Record<string, unknown> = {}): Promise<unknown> {
        return this.createNativeMcpClient().callTool(toolName, args);
    }

    async searchKnowledge(query: string, options: { category?: string; type?: 'node' | 'documentation'; limit?: number } = {}) {
        // The limit is passed explicitly: KnowledgeSearch defaults to 20 while the CLI's
        // --limit defaults to 10, so omitting it would silently double every result set.
        return (await this.getKnowledge()).searchAll(query, {
            category: options.category,
            type: options.type,
            limit: options.limit ?? 10,
        });
    }

    /**
     * One node or several, full schema or the CLI's compact projection.
     *
     * Compact matters: the full schema for `gmail` is ~127KB against ~0.5KB compact, and
     * an agent given only the full projection will reach for the CLI instead.
     *
     * The batch form always answers `{ nodes, notFound, inexactMatches }`. Returning only
     * what resolved would let a typo look like a node with no parameters, and a fuzzy hit
     * look like confirmation that the name was right. The single-name form keeps its
     * original shape.
     */
    async getNodeInfo(name: string | string[], options: { compact?: boolean } = {}) {
        const batch = Array.isArray(name);
        const names = batch ? name : [name];
        const { resolveNode, suggestNodes, TypeScriptFormatter } = await import('@n8n-as-code/skills');
        const provider = await this.getProvider();

        const found: any[] = [];
        const notFound: string[] = [];
        const inexactMatches: Array<{ requested: string; resolvedTo: string }> = [];

        for (const candidate of names) {
            const resolution = resolveNode(provider, candidate);
            if (!resolution) {
                notFound.push(candidate);
                continue;
            }
            if (!resolution.exact) {
                inexactMatches.push({ requested: candidate, resolvedTo: resolution.matchedName });
            }
            found.push(resolution.schema);
        }

        if (found.length === 0) {
            const suggestions = suggestNodes(provider, names[0]);
            throw new Error(`Node '${notFound.join("', '")}' not found.`
                + (suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : ''));
        }

        const render = (schema: any) => TypeScriptFormatter.generateCompactNodeDoc({
            name: schema.name,
            type: schema.type,
            displayName: schema.displayName,
            description: schema.description,
            version: schema.version,
            properties: schema.schema?.properties || [],
            parameterGating: schema.parameterGating,
        });

        if (options.compact) {
            const notes = [
                ...inexactMatches.map((m) => `// note: '${m.requested}' resolved to '${m.resolvedTo}'`),
                ...(notFound.length > 0 ? [`// not found: ${notFound.join(', ')}`] : []),
            ];
            return [...notes, ...found.map(render)].join('\n\n');
        }

        if (batch) return { nodes: found, notFound, inexactMatches };
        // The CLI announces a fuzzy hit on stderr. MCP has no stderr channel, so it rides
        // the payload — otherwise the single-name form is the one shape where landing on a
        // different node reads as confirmation that the requested name was right.
        return inexactMatches.length > 0
            ? { ...found[0], resolvedFrom: inexactMatches[0].requested }
            : found[0];
    }

    async searchDocs(query: string, options: {
        category?: string;
        type?: 'node' | 'documentation';
        limit?: number;
    } = {}) {
        const result: any = await (await this.getKnowledge()).searchAll(query, {
            category: options.category,
            type: options.type ?? 'documentation',
            limit: options.limit ?? 10,
        });
        return Array.isArray(result?.results) ? result.results : result;
    }

    async searchExamples(query: string, limit: number = 10) {
        return (await this.getRegistry()).search(query, limit);
    }

    async getExampleInfo(id: string) {
        const registry = await this.getRegistry();
        const workflow = registry.getById(id);
        if (!workflow) {
            throw new Error(`Workflow with ID "${id}" not found.`);
        }
        return { ...workflow, rawUrl: registry.getRawUrl(workflow) };
    }

    async validateWorkflow({ workflowContent, format = 'auto' }: ValidateWorkflowOptions) {
        const isTypeScript = detectWorkflowFormat(workflowContent, format);
        let parsed: any = workflowContent;

        if (!isTypeScript) {
            try {
                parsed = JSON.parse(workflowContent);
            } catch (error: any) {
                throw new Error(`Invalid JSON workflow content: ${error.message}`);
            }
        }

        return (await this.getValidator()).validateWorkflow(parsed, isTypeScript);
    }

    readWorkflowFile(path: string) {
        return readFileSync(path, 'utf8');
    }
}
