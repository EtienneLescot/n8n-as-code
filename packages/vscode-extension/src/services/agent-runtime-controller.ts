import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface AgentPromptInput {
    prompt: string;
    workflowId?: string;
    workflowName?: string;
    workflowFilename?: string;
    workspaceRoot?: string;
    nodeContext?: AgentNodeContext;
}

export interface AgentNodeContext {
    name: string;
    type?: string;
    id?: string;
}

export type AgentWorkbenchMessage =
    | { type: 'agent.status'; status: 'idle' | 'running' | 'stopping'; detail?: string }
    | { type: 'agent.message'; role: 'assistant' | 'system' | 'user'; content: string }
    | { type: 'agent.delta'; content: string }
    | { type: 'agent.operation'; label: string; status: 'running' | 'done' | 'error'; detail?: string }
    | { type: 'agent.error'; message: string }
    | { type: 'agent.done' };

export type AgentWorkbenchPostMessage = (message: AgentWorkbenchMessage) => Thenable<boolean>;

export const N8N_AGENT_PROVIDER_SECRET_PREFIX = 'n8n.agent.providerApiKey.';

export function getAgentProviderSecretKey(provider: string): string {
    return `${N8N_AGENT_PROVIDER_SECRET_PREFIX}${provider}`;
}

export class AgentRuntimeController implements vscode.Disposable {
    private activeAbortController: AbortController | undefined;
    private cachedAgentHandle: { key: string; handle: any } | undefined;

    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly outputChannel: vscode.OutputChannel,
    ) {}

    async sendPrompt(input: AgentPromptInput, postMessage: AgentWorkbenchPostMessage): Promise<void> {
        if (this.activeAbortController) {
            await postMessage({
                type: 'agent.error',
                message: 'An agent run is already in progress. Stop it before sending another prompt.',
            });
            return;
        }

        const prompt = input.prompt.trim();
        if (!prompt) {
            return;
        }

        const abortController = new AbortController();
        this.activeAbortController = abortController;

        await postMessage({ type: 'agent.status', status: 'running', detail: 'Preparing n8n agent runtime...' });
        await postMessage({ type: 'agent.operation', label: 'Agent runtime', status: 'running', detail: 'Loading embedded Yagr runtime' });

        try {
            await this.runInitialAgentTurn(input, postMessage, abortController.signal);
            await postMessage({ type: 'agent.operation', label: 'Agent runtime', status: 'done', detail: 'Run completed' });
            await postMessage({ type: 'agent.done' });
        } catch (error: any) {
            const message = error?.message || String(error);
            this.outputChannel.appendLine(`[n8n-agent] Run failed: ${message}`);
            await postMessage({ type: 'agent.operation', label: 'Agent runtime', status: 'error', detail: message });
            await postMessage({ type: 'agent.error', message });
        } finally {
            if (this.activeAbortController === abortController) {
                this.activeAbortController = undefined;
            }
            await postMessage({ type: 'agent.status', status: 'idle' });
        }
    }

    async stop(postMessage: AgentWorkbenchPostMessage): Promise<void> {
        const controller = this.activeAbortController;
        if (!controller) {
            await postMessage({ type: 'agent.status', status: 'idle' });
            return;
        }
        await postMessage({ type: 'agent.status', status: 'stopping', detail: 'Stopping current run...' });
        controller.abort();
    }

    dispose(): void {
        this.activeAbortController?.abort();
        this.activeAbortController = undefined;
    }

    private async runInitialAgentTurn(
        input: AgentPromptInput,
        postMessage: AgentWorkbenchPostMessage,
        signal: AbortSignal,
    ): Promise<void> {
        await this.throwIfAborted(signal);

        const providerRegistry = await this.loadYagrProviderRegistry().catch((error: any) => ({ error: error?.message || String(error) }));
        if ('error' in providerRegistry) {
            await postMessage({
                type: 'agent.message',
                role: 'assistant',
                content: await this.buildScaffoldResponse(input, providerRegistry.error),
            });
            return;
        }

        const providerConfig = await this.getProviderRuntimeConfig(providerRegistry);
        if (!providerConfig.ready) {
            await postMessage({
                type: 'agent.message',
                role: 'assistant',
                content: await this.buildScaffoldResponse(input, providerConfig.reason),
            });
            return;
        }

        await postMessage({ type: 'agent.operation', label: 'Provider', status: 'done', detail: `${providerConfig.provider}${providerConfig.model ? ` / ${providerConfig.model}` : ''}` });
        await postMessage({ type: 'agent.operation', label: 'DeepAgents runtime', status: 'running', detail: `Workspace root: ${input.workspaceRoot || process.cwd()}` });

        const handle = await this.getYagrAgentHandle(providerConfig, input);
        const agent = handle.agent;

        const messages = [{ role: 'user', content: input.prompt }];
        const config = {
            version: 'v2',
            signal,
            configurable: {
                thread_id: input.workflowId ? `workflow:${input.workflowId}` : 'workflow:new',
            },
        } as Record<string, unknown>;

        if (typeof (agent as any).streamEvents === 'function') {
            const stream = (agent as any).streamEvents({ messages }, config);
            const eventRuntime = await import('@yagr/agent/dist/gateway/langgraph-events.js');
            const accumulator = eventRuntime.createRunAccumulator();
            for await (const event of stream) {
                await this.throwIfAborted(signal);
                await eventRuntime.processStreamEvent(event, accumulator, {
                    onTextDelta: async (delta: string) => {
                        await this.throwIfAborted(signal);
                        await postMessage({ type: 'agent.delta', content: delta });
                    },
                    onOperation: async (event: any) => {
                        await postMessage({
                            type: 'agent.operation',
                            label: String(event.label || event.operationId || 'Operation'),
                            status: event.status === 'error' ? 'error' : event.status === 'done' ? 'done' : 'running',
                            detail: this.truncateOperationDetail(event.summary || event.body),
                        });
                    },
                    onUserVisibleUpdate: async (update: any) => {
                        await postMessage({
                            type: 'agent.operation',
                            label: String(update.title || update.phase || 'Progress'),
                            status: update.tone === 'error' ? 'error' : 'running',
                            detail: this.truncateOperationDetail(update.detail),
                        });
                    },
                });
            }
            if (!accumulator.responseText) {
                await postMessage({ type: 'agent.message', role: 'assistant', content: 'The agent completed without producing text.' });
            }
            return;
        }

        const result = await (agent as any).invoke({ messages }, config);
        await postMessage({ type: 'agent.message', role: 'assistant', content: this.extractAgentText(result) });
    }

    private truncateOperationDetail(value: unknown): string | undefined {
        if (typeof value !== 'string') return undefined;
        const normalized = value.trim();
        if (!normalized) return undefined;
        return normalized.length > 500 ? `${normalized.slice(0, 500)}...` : normalized;
    }

    private async loadYagrProviderRegistry(): Promise<typeof import('@yagr/agent/dist/llm/provider-registry.js')> {
        return import('@yagr/agent/dist/llm/provider-registry.js');
    }

    private async getProviderRuntimeConfig(providerRegistry: typeof import('@yagr/agent/dist/llm/provider-registry.js')): Promise<{
        ready: boolean;
        reason?: string;
        provider: string;
        model?: string;
        apiKey?: string;
        baseUrl?: string;
        temperature: number;
    }> {
        const config = vscode.workspace.getConfiguration('n8n.agent');
        const provider = String(config.get<string>('provider') || 'openai');
        const normalizedProvider = providerRegistry.normalizeProviderId(provider);
        if (!normalizedProvider) {
            return {
                ready: false,
                reason: `Provider ${provider} is not supported by the installed Yagr runtime.`,
                provider,
                model: String(config.get<string>('model') || '').trim() || undefined,
                temperature: 0,
            };
        }
        const model = String(config.get<string>('model') || '').trim() || undefined;
        const baseUrl = String(config.get<string>('baseUrl') || '').trim() || undefined;
        const apiKey = await this._context.secrets.get(getAgentProviderSecretKey(normalizedProvider));
        if (normalizedProvider === 'openai-oauth') {
            const accountRuntime = await import('@yagr/agent/dist/llm/openai-account.js');
            const session = await accountRuntime.ensureOpenAiAccountSession().catch(() => undefined);
            if (!session?.accessToken) {
                return {
                    ready: false,
                    reason: 'OpenAI OAuth needs to be reconnected once so n8n-as-code can persist the Codex account session used by the Yagr runtime. Open Settings > Agent Providers, disconnect OpenAI ChatGPT OAuth, then connect it again.',
                    provider: normalizedProvider,
                    model,
                    baseUrl,
                    apiKey,
                    temperature: 0,
                };
            }
        }
        if (providerRegistry.providerRequiresApiKey(normalizedProvider) && !apiKey && normalizedProvider !== 'openai-oauth' && normalizedProvider !== 'copilot-proxy' && normalizedProvider !== 'anthropic-proxy') {
            return {
                ready: false,
                reason: `Missing API key for ${providerRegistry.getProviderDisplayName(normalizedProvider)}. Open Settings > Agent Providers to connect it.`,
                provider: normalizedProvider,
                model,
                baseUrl,
                apiKey,
                temperature: 0,
            };
        }
        return {
            ready: true,
            provider: normalizedProvider,
            model,
            baseUrl,
            apiKey,
            temperature: 0,
        };
    }

    private async getYagrAgentHandle(providerConfig: {
        provider: string;
        model?: string;
        apiKey?: string;
        baseUrl?: string;
    }, input: AgentPromptInput): Promise<any> {
        const rootDir = input.workspaceRoot || process.cwd();
        const [agentFactory, providerRegistry] = await Promise.all([
            import('@yagr/agent/dist/agent-factory.js'),
            import('@yagr/agent/dist/llm/provider-registry.js'),
        ]);
        const memorySources = await this.getWorkspaceMemorySources(rootDir);
        const skillSourcePaths = await this.getWorkspaceSkillSources(rootDir);
        const key = JSON.stringify({
            rootDir,
            provider: providerConfig.provider,
            model: providerConfig.model,
            baseUrl: providerConfig.baseUrl,
            workflowId: input.workflowId || '',
            workflowFilename: input.workflowFilename || '',
            nodeContextName: input.nodeContext?.name || '',
            nodeContextType: input.nodeContext?.type || '',
            nodeContextId: input.nodeContext?.id || '',
            memorySources,
            skillSourcePaths,
        });
        if (this.cachedAgentHandle?.key === key) {
            return this.cachedAgentHandle.handle;
        }

        const credentials = new Map<string, string>();
        await Promise.all(providerRegistry.YAGR_MODEL_PROVIDERS.map(async (provider) => {
            const value = await this._context.secrets.get(getAgentProviderSecretKey(provider));
            if (value) credentials.set(provider, value);
        }));
        const localConfig = {
            provider: providerConfig.provider,
            model: providerConfig.model,
            baseUrl: providerConfig.baseUrl,
        } as any;
        const configStore = {
            getLocalConfig: () => localConfig,
            getApiKey: (provider: string) => credentials.get(provider),
        };
        const handle = await agentFactory.createYagrDeepAgent(configStore as any, {
            provider: providerConfig.provider,
            model: providerConfig.model,
            apiKey: providerConfig.apiKey,
            baseUrl: providerConfig.baseUrl,
        }, undefined, undefined, {
            rootDir,
            memorySources,
            skillSourcePaths,
            systemPrompt: await this.buildSystemPrompt(input),
        });
        this.cachedAgentHandle = { key, handle };
        return handle;
    }

    private async buildSystemPrompt(input: AgentPromptInput): Promise<string> {
        const workflowContext = await this.loadWorkflowContext(input);
        return [
            'You are the embedded n8n-as-code VS Code agent.',
            'You help users design, inspect, validate, and operate n8n workflows from the current workspace.',
            'Your DeepAgents backend working directory is the VS Code workspace root. Treat all relative filesystem tool paths as relative to that home directory.',
            'Use tools only when useful. For questions about the currently selected workflow, first use the provided workflow context below as authoritative.',
            'Do not claim to push workflows, provision credentials, or change n8n runtime state unless a tool explicitly performs that action successfully.',
            input.workspaceRoot ? `Workspace root: ${input.workspaceRoot}` : undefined,
            input.workflowId ? `Current workflow: ${input.workflowName || input.workflowId} (${input.workflowId})` : undefined,
            input.workflowFilename ? `Current workflow file: ${input.workflowFilename}` : undefined,
            this.formatNodeContext(input.nodeContext),
            workflowContext,
        ].filter(Boolean).join('\n');
    }

    private formatNodeContext(nodeContext: AgentNodeContext | undefined): string | undefined {
        if (!nodeContext?.name) {
            return undefined;
        }
        return [
            'Current n8n node detail panel context:',
            `Node name: ${nodeContext.name}`,
            nodeContext.type ? `Node type: ${nodeContext.type}` : undefined,
            nodeContext.id ? `Node ID: ${nodeContext.id}` : undefined,
            'When the user makes an ambiguous node-specific request, assume it refers to this node unless they name another node.',
        ].filter(Boolean).join('\n');
    }

    private async getWorkspaceMemorySources(rootDir: string): Promise<string[]> {
        const candidates = [
            path.join(rootDir, 'AGENTS.md'),
            path.join(rootDir, 'README.md'),
            path.join(rootDir, 'readme.md'),
            path.join(rootDir, '.agents', 'AGENTS.md'),
            path.join(rootDir, '.yagr', 'AGENTS.md'),
        ];
        const existing = await Promise.all(candidates.map(async (candidate) => {
            try {
                const stat = await fs.promises.stat(candidate);
                return stat.isFile() ? candidate : undefined;
            } catch {
                return undefined;
            }
        }));
        return existing.filter((candidate): candidate is string => Boolean(candidate));
    }

    private async getWorkspaceSkillSources(rootDir: string): Promise<string[]> {
        const candidates = [
            path.join(rootDir, '.agents', 'skills'),
            path.join(rootDir, 'skills'),
            path.join(rootDir, 'agent-skills'),
        ];
        const existing = await Promise.all(candidates.map(async (candidate) => {
            try {
                const stat = await fs.promises.stat(candidate);
                return stat.isDirectory() && await this.directoryHasSkill(candidate) ? candidate : undefined;
            } catch {
                return undefined;
            }
        }));
        return existing.filter((candidate): candidate is string => Boolean(candidate));
    }

    private async directoryHasSkill(directoryPath: string): Promise<boolean> {
        const directSkill = path.join(directoryPath, 'SKILL.md');
        try {
            const stat = await fs.promises.stat(directSkill);
            if (stat.isFile()) return true;
        } catch {
            // Check child skill directories below.
        }
        try {
            const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                const stat = await fs.promises.stat(path.join(directoryPath, entry.name, 'SKILL.md')).catch(() => undefined);
                if (stat?.isFile()) return true;
            }
        } catch {
            return false;
        }
        return false;
    }

    private async loadWorkflowContext(input: AgentPromptInput): Promise<string | undefined> {
        if (!input.workflowId && !input.workflowFilename) {
            return 'No workflow is attached. The user may be designing a new workflow.';
        }
        const candidates: string[] = [];
        if (input.workspaceRoot && input.workflowFilename) {
            candidates.push(path.join(input.workspaceRoot, input.workflowFilename));
            candidates.push(path.join(input.workspaceRoot, 'workflows', input.workflowFilename));
        }
        if (input.workspaceRoot && input.workflowId) {
            candidates.push(path.join(input.workspaceRoot, 'workflows', `${input.workflowId}.json`));
        }
        for (const candidate of [...new Set(candidates)]) {
            try {
                const stat = await fs.promises.stat(candidate);
                if (!stat.isFile() || stat.size > 400_000) continue;
                const content = await fs.promises.readFile(candidate, 'utf8');
                return [
                    'Selected workflow JSON context:',
                    '```json',
                    content,
                    '```',
                ].join('\n');
            } catch {
                // Try next candidate.
            }
        }
        return [
            'Selected workflow metadata:',
            `Name: ${input.workflowName || 'unknown'}`,
            `ID: ${input.workflowId || 'not yet available'}`,
            'Workflow JSON was not found in the workspace. Explain only from available metadata and say when JSON details are needed.',
        ].join('\n');
    }

    private extractAgentText(result: unknown): string {
        if (!result || typeof result !== 'object') {
            return typeof result === 'string' ? result : 'The agent completed without producing text.';
        }
        const record = result as Record<string, unknown>;
        const messages = Array.isArray(record.messages) ? record.messages : [];
        const last = messages[messages.length - 1] as Record<string, unknown> | undefined;
        const content = last?.content ?? record.content ?? record.output;
        if (typeof content === 'string') {
            return content;
        }
        if (Array.isArray(content)) {
            return content.map((part) => {
                if (typeof part === 'string') return part;
                if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
                    return (part as Record<string, string>).text;
                }
                return '';
            }).join('');
        }
        return 'The agent completed without producing text.';
    }

    private async buildProviderStatusLine(): Promise<string> {
        const config = vscode.workspace.getConfiguration('n8n.agent');
        const provider = String(config.get<string>('provider') || 'openai');
        const model = String(config.get<string>('model') || '').trim();
        const baseUrl = String(config.get<string>('baseUrl') || '').trim();
        const storedSecret = await this._context.secrets.get(getAgentProviderSecretKey(provider));
        const hasEnvSecret = this.hasProviderEnvironmentSecret(provider);
        const secretState = storedSecret
            ? 'API key stored in VS Code Secret Storage'
            : hasEnvSecret
                ? 'API key available from environment'
                : 'API key not configured yet';
        return `Agent provider: ${provider}${model ? ` / ${model}` : ''}${baseUrl ? ` / ${baseUrl}` : ''}. ${secretState}.`;
    }

    private hasProviderEnvironmentSecret(provider: string): boolean {
        const envKeys: Record<string, string[]> = {
            anthropic: ['ANTHROPIC_API_KEY'],
            openai: ['OPENAI_API_KEY'],
            google: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'],
            mistral: ['MISTRAL_API_KEY'],
            openrouter: ['OPENROUTER_API_KEY'],
            'openai-compatible': ['OPENAI_COMPATIBLE_API_KEY'],
        };
        return (envKeys[provider] ?? []).some((key) => Boolean(process.env[key]?.trim()));
    }

    private async buildScaffoldResponse(input: AgentPromptInput, runtimeError?: string): Promise<string> {
        const workflowLine = input.workflowId
            ? `Current workflow: ${input.workflowName || input.workflowId} (${input.workflowId}).`
            : 'No remote workflow is selected yet.';
        const workspaceLine = input.workspaceRoot
            ? `Workspace: ${input.workspaceRoot}.`
            : 'No workspace root was provided.';
        const runtimeLine = runtimeError
            ? `Embedded Yagr runtime is not loadable yet: ${runtimeError}`
            : 'Embedded Yagr runtime package was detected. Tool and provider execution will be enabled in the next implementation phase.';

        return [
            'The n8n Agent Workbench is wired into the VS Code extension host.',
            workflowLine,
            workspaceLine,
            await this.buildProviderStatusLine(),
            runtimeLine,
            '',
            'This first run intentionally stays read-only: no workflow files, credentials, runtime state, or shell commands were changed.',
        ].join('\n');
    }

    private async throwIfAborted(signal: AbortSignal): Promise<void> {
        if (signal.aborted) {
            throw new Error('Agent run cancelled.');
        }
    }
}
