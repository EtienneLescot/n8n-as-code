import * as vscode from 'vscode';

export interface AgentPromptInput {
    prompt: string;
    workflowId?: string;
    workflowName?: string;
    workspaceRoot?: string;
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
    private cachedRuntime: Awaited<ReturnType<typeof this.loadYagrRuntime>> | undefined;

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

        const runtime = await this.loadYagrRuntime().catch((error: any) => ({ error: error?.message || String(error) }));
        if ('error' in runtime) {
            await postMessage({
                type: 'agent.message',
                role: 'assistant',
                content: await this.buildScaffoldResponse(input, runtime.error),
            });
            return;
        }

        await this.throwIfAborted(signal);

        const providerConfig = await this.getProviderRuntimeConfig(runtime);
        if (!providerConfig.ready) {
            await postMessage({
                type: 'agent.message',
                role: 'assistant',
                content: await this.buildScaffoldResponse(input, providerConfig.reason),
            });
            return;
        }

        await postMessage({ type: 'agent.operation', label: 'Provider', status: 'done', detail: `${providerConfig.provider}${providerConfig.model ? ` / ${providerConfig.model}` : ''}` });
        await postMessage({ type: 'agent.operation', label: 'DeepAgents runtime', status: 'running', detail: 'Streaming response' });

        const model = runtime.createLangChainChatModel(providerConfig);
        const agent = runtime.createDeepAgentRuntime({
            model,
            tools: [],
            systemPrompt: this.buildSystemPrompt(input),
        });

        const messages = [{ role: 'user', content: input.prompt }];
        const config = { version: 'v2', signal } as Record<string, unknown>;

        if (typeof (agent as any).streamEvents === 'function') {
            const stream = (agent as any).streamEvents({ messages }, config);
            const accumulator = await runtime.consumeLangGraphStream(stream, {
                onTextDelta: async (delta: string) => {
                    await this.throwIfAborted(signal);
                    await postMessage({ type: 'agent.delta', content: delta });
                },
                onOperation: async (event: any) => {
                    await postMessage({
                        type: 'agent.operation',
                        label: String(event.label || event.operationId || 'Operation'),
                        status: event.status === 'error' ? 'error' : event.status === 'done' ? 'done' : 'running',
                        detail: event.summary || event.body,
                    });
                },
            });
            if (!accumulator.responseText) {
                await postMessage({ type: 'agent.message', role: 'assistant', content: 'The agent completed without producing text.' });
            }
            return;
        }

        const result = await (agent as any).invoke({ messages }, config);
        await postMessage({ type: 'agent.message', role: 'assistant', content: this.extractAgentText(result) });
    }

    private async loadYagrRuntime(): Promise<typeof import('@yagr/runtime')> {
        if (!this.cachedRuntime) {
            this.cachedRuntime = await import('@yagr/runtime');
        }
        return this.cachedRuntime;
    }

    private async getProviderRuntimeConfig(runtime: typeof import('@yagr/runtime')): Promise<{
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
        const normalizedProvider = runtime.normalizeProviderId(provider) || 'openai';
        const model = String(config.get<string>('model') || '').trim() || undefined;
        const baseUrl = String(config.get<string>('baseUrl') || '').trim() || undefined;
        const apiKey = await this._context.secrets.get(getAgentProviderSecretKey(normalizedProvider));
        const resolved = runtime.resolveProviderRuntimeConfig({
            provider: normalizedProvider,
            model,
            baseUrl,
            apiKey,
            temperature: 0,
        });

        if (runtime.providerRequiresApiKey(resolved.provider) && !resolved.apiKey) {
            return {
                ...resolved,
                ready: false,
                reason: `Missing API key for ${runtime.getRuntimeProviderLabel(resolved.provider)}. Run "n8n Agent: Set Provider API Key" or configure the provider environment variable.`,
            };
        }

        return { ...resolved, ready: true };
    }

    private buildSystemPrompt(input: AgentPromptInput): string {
        return [
            'You are the embedded n8n-as-code VS Code agent.',
            'You help users design, inspect, validate, and operate n8n workflows from the current workspace.',
            'This runtime phase is chat-only: do not claim to have edited files, pushed workflows, provisioned credentials, run commands, or changed n8n runtime state.',
            'When the user asks for an action that requires tools, explain the intended safe next steps and mention that tool execution will require approval once enabled.',
            input.workspaceRoot ? `Workspace root: ${input.workspaceRoot}` : undefined,
            input.workflowId ? `Current workflow: ${input.workflowName || input.workflowId} (${input.workflowId})` : undefined,
        ].filter(Boolean).join('\n');
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
