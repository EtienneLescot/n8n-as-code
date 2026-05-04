import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

export interface AgentPromptInput {
    prompt: string;
    workflowId?: string;
    workflowName?: string;
    workflowFilename?: string;
    workflowFilePath?: string;
    workspaceRoot?: string;
    nodeContext?: AgentNodeContext;
    sessionId?: string;
}

const ENVIRONMENT_DETAILS_BLOCK_PATTERN = /<environment_details>[\s\S]*?<\/environment_details>/gi;
const UNATTACHED_WORKFLOW_SCOPE_KEY = '__unattached__';
const DEFAULT_CONTEXT_WINDOW_TOKENS = 200_000;

export interface AgentNodeContext {
    name: string;
    type?: string;
    id?: string;
}

export type AgentReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface AgentContextUsage {
    promptTokens: number;
    completionTokens: number;
    contextWindowTokens: number;
    fillPercent: number;
    source: 'api' | 'estimated';
}

export interface AgentCheckpointSummary {
    id: string;
    sessionId: string;
    createdAt: string;
    messageCount: number;
    summary?: string;
}

export interface AgentCompactionSummary {
    summary: string;
    source: 'llm' | 'fallback';
    messagesCompacted: number;
    preservedRecentMessages: number;
    estimatedTokens?: number;
    thresholdTokens?: number;
    fallbackReason?: string;
}

export interface AgentSessionSummary {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
    isActive: boolean;
    isClosed: boolean;
    checkpointCount: number;
    workflowId?: string;
    workflowLabel: string;
    totalCompactions: number;
}

export type AgentTimelineEntry =
    | { kind: 'user-message'; id: string; text: string; timestamp: number }
    | { kind: 'system-notice'; id: string; text: string; timestamp: number }
    | { kind: 'assistant-body'; id: string; text: string; streaming: boolean; finalState?: string }
    | {
        kind: 'operation';
        id: string;
        tone: 'info' | 'success' | 'error';
        title: string;
        detail?: string;
        category?: string;
        status?: 'running' | 'done' | 'error';
        body?: string;
        summary?: string;
        startedAt?: number;
        endedAt?: number;
    }
    | { kind: 'compaction'; id: string; timestamp: number; event: AgentCompactionSummary }
    | { kind: 'context-usage'; id: string; timestamp: number; usage: AgentContextUsage };

export interface AgentSessionState {
    sessionId: string;
    title: string;
    entries: AgentTimelineEntry[];
    checkpoints: AgentCheckpointSummary[];
    contextUsage?: AgentContextUsage;
    lastCompaction?: AgentCompactionSummary;
    totalCompactions: number;
    workflowId?: string;
    workflowLabel: string;
}

export interface AgentWorkbenchState {
    workflow: {
        id?: string;
        name?: string;
        filename?: string;
    };
    provider: string;
    model?: string;
    baseUrl?: string;
    reasoningEffort?: AgentReasoningEffort;
    supportsReasoningEffort: boolean;
    currentNodeContext?: AgentNodeContext;
    activeSessionId: string;
    sessions: AgentSessionSummary[];
    session: AgentSessionState;
    isRunning: boolean;
}

export interface AgentRunResult {
    workflowChanged: boolean;
}

export type AgentStreamEvent =
    | { type: 'start'; sessionId: string; message: string }
    | { type: 'progress'; tone: 'info' | 'success' | 'error'; title: string; detail?: string; phase?: string }
    | {
        type: 'operation';
        operationId: string;
        label: string;
        category: string;
        status: 'running' | 'done' | 'error';
        body?: string;
        summary?: string;
        startedAt: number;
        endedAt?: number;
    }
    | { type: 'text-delta'; delta: string }
    | { type: 'compaction'; summary: string; source: 'llm' | 'fallback'; messagesCompacted: number; preservedRecentMessages: number; estimatedTokens?: number; thresholdTokens?: number; fallbackReason?: string }
    | AgentContextUsageEvent
    | { type: 'final'; sessionId: string; response: string; finalState: string }
    | { type: 'error'; error: string };

type AgentContextUsageEvent = { type: 'context-usage'; promptTokens: number; completionTokens: number; contextWindowTokens: number; fillPercent: number; source: 'api' | 'estimated' };

export type AgentWorkbenchMessage =
    | { type: 'agent.status'; status: 'idle' | 'running' | 'stopping'; detail?: string }
    | { type: 'agent.state'; state: AgentWorkbenchState }
    | { type: 'agent.streamEvent'; event: AgentStreamEvent }
    | { type: 'agent.error'; message: string }
    | { type: 'agent.done' };

export type AgentWorkbenchPostMessage = (message: AgentWorkbenchMessage) => Thenable<boolean>;

export const N8N_AGENT_PROVIDER_SECRET_PREFIX = 'n8n.agent.providerApiKey.';

export function getAgentProviderSecretKey(provider: string): string {
    return `${N8N_AGENT_PROVIDER_SECRET_PREFIX}${provider}`;
}

type DeepAgentSessionScope = {
    kind: string;
    key: string;
};

type DeepAgentSessionRecord = {
    id: string;
    createdAt: string;
    updatedAt: string;
    title: string;
    closedAt?: string;
    scope?: DeepAgentSessionScope;
};

type SessionSummary = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
};

type SessionCheckpointMetadata = {
    id: string;
    sessionId: string;
    createdAt: string;
    messageCount: number;
    summary?: string;
};

type WebUiSession = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    displayThread?: unknown[];
};

type SessionServiceHandle = {
    list(): SessionSummary[];
    get(id: string): DeepAgentSessionRecord | undefined;
    getOrCreateForScope(scope: DeepAgentSessionScope, options?: { title?: string }): DeepAgentSessionRecord;
    rotateForScope(scope: DeepAgentSessionScope, options?: { title?: string }): DeepAgentSessionRecord;
    getActiveForScope(scope: DeepAgentSessionScope): DeepAgentSessionRecord | undefined;
    listForScope(scope: DeepAgentSessionScope): DeepAgentSessionRecord[];
    ensure(sessionId: string, options?: { title?: string; scope?: DeepAgentSessionScope }): DeepAgentSessionRecord;
    touch(sessionId: string, options?: { title?: string; closed?: boolean }): DeepAgentSessionRecord | undefined;
    delete(id: string): Promise<void>;
    setCheckpointer(checkpointer: unknown): void;
    buildSessionConfig(sessionId: string): Record<string, unknown>;
    listCheckpoints(sessionId: string): Promise<SessionCheckpointMetadata[]>;
    saveCheckpoint(sessionId: string, options?: { payloadState?: unknown | null }): Promise<SessionCheckpointMetadata>;
    restoreCheckpoint(sessionId: string, checkpointId: string): Promise<{ payloadState: unknown | null }>;
    deleteCheckpoint(sessionId: string, checkpointId: string): Promise<void>;
    syncDisplayThread(sessionId: string, displayThread: unknown[]): void;
    clearDisplayThread(sessionId: string): void;
    setTitle(sessionId: string, title: string): void;
    readDisplaySession(sessionId: string): WebUiSession | undefined;
};

type SessionRuntime = {
    service: SessionServiceHandle;
    deriveSessionTitle: (text: string, fallback?: string) => string;
};

type ProviderRuntimeConfig = {
    ready: boolean;
    reason?: string;
    provider: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    reasoningEffort?: AgentReasoningEffort;
    temperature: number;
};

type CompactionState = {
    lastCompaction: AgentCompactionSummary | null;
    compactionHistory: AgentCompactionSummary[];
    totalCompactions: number;
};

export class AgentRuntimeController implements vscode.Disposable {
    private activeRun: { abortController: AbortController; sessionId: string } | undefined;
    private cachedAgentHandle: { key: string; handle: any } | undefined;
    private sessionRuntimePromise: Promise<SessionRuntime> | undefined;

    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly outputChannel: vscode.OutputChannel,
    ) {}

    async getWorkbenchState(input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        const scope = this.getSessionScope(input);
        const sessions = await this.getSessionRuntime();
        const activeRecord = sessions.service.getActiveForScope(scope) || sessions.service.getOrCreateForScope(scope, {
            title: this.getDefaultSessionTitle(input.workflowName),
        });
        const session = await this.buildSessionState(activeRecord.id, input);
        const providerConfig = await this.describeProviderRuntimeConfig();
        return {
            workflow: {
                id: input.workflowId,
                name: input.workflowName,
                filename: input.workflowFilename,
            },
            provider: providerConfig.provider,
            model: providerConfig.model,
            baseUrl: providerConfig.baseUrl,
            reasoningEffort: providerConfig.reasoningEffort,
            supportsReasoningEffort: providerConfig.provider === 'openai-oauth',
            currentNodeContext: input.nodeContext,
            activeSessionId: activeRecord.id,
            sessions: await this.listSessionSummaries(scope, activeRecord.id),
            session,
            isRunning: this.activeRun?.sessionId === activeRecord.id,
        };
    }

    async createSession(input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        const scope = this.getSessionScope(input);
        const sessions = await this.getSessionRuntime();
        sessions.service.rotateForScope(scope, {
            title: this.getDefaultSessionTitle(input.workflowName),
        });
        return this.getWorkbenchState(input);
    }

    async selectSession(sessionId: string, input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        const sessions = await this.getSessionRuntime();
        sessions.service.ensure(sessionId, { scope: this.getSessionScope(input) });
        return this.getWorkbenchState(input);
    }

    async renameSession(sessionId: string, title: string, input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        const trimmed = title.trim();
        if (!trimmed) {
            throw new Error('Session title is required.');
        }
        const sessions = await this.getSessionRuntime();
        sessions.service.touch(sessionId, { title: trimmed });
        sessions.service.setTitle(sessionId, trimmed);
        return this.getWorkbenchState(input);
    }

    async deleteSession(sessionId: string, input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        const scope = this.getSessionScope(input);
        const sessions = await this.getSessionRuntime();
        const active = sessions.service.getActiveForScope(scope)?.id;
        await sessions.service.delete(sessionId);
        if (active === sessionId) {
            sessions.service.getOrCreateForScope(scope, { title: this.getDefaultSessionTitle(input.workflowName) });
        }
        return this.getWorkbenchState(input);
    }

    async attachSessionToCurrentWorkflow(sessionId: string, input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        const scope = this.getSessionScope(input);
        if (!input.workflowId) {
            throw new Error('Open a workflow before attaching a session.');
        }
        const sessions = await this.getSessionRuntime();
        sessions.service.ensure(sessionId, { scope });
        return this.getWorkbenchState(input);
    }

    async detachSession(sessionId: string, input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        const currentScope = this.getSessionScope(input);
        const sessions = await this.getSessionRuntime();
        sessions.service.ensure(sessionId, { scope: this.getUnattachedSessionScope() });
        if (sessions.service.getActiveForScope(currentScope)?.id === sessionId) {
            sessions.service.getOrCreateForScope(currentScope, { title: this.getDefaultSessionTitle(input.workflowName) });
        }
        return this.getWorkbenchState(input);
    }

    async saveCheckpoint(sessionId: string, input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        const sessions = await this.getSessionRuntime();
        const handle = await this.ensureAgentHandleWithCheckpoint(input);
        await sessions.service.saveCheckpoint(sessionId, {
            payloadState: handle.compactionService.getState(sessionId),
        });
        const entries = this.readSessionEntries(sessions.service, sessionId);
        this.writeSessionEntries(sessions.service, sessionId, [
            ...entries,
            this.createSystemNotice('Checkpoint saved.'),
        ]);
        return this.getWorkbenchState(input);
    }

    async restoreCheckpoint(sessionId: string, checkpointId: string, input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        const sessions = await this.getSessionRuntime();
        const handle = await this.ensureAgentHandleWithCheckpoint(input);
        const result = await sessions.service.restoreCheckpoint(sessionId, checkpointId);
        sessions.service.clearDisplayThread(sessionId);
        if (this.isCompactionState(result.payloadState)) {
            handle.compactionService.setState(sessionId, result.payloadState);
        } else {
            handle.compactionService.reset(sessionId);
        }
        this.writeSessionEntries(sessions.service, sessionId, [
            this.createSystemNotice(`Restored checkpoint ${checkpointId}.`),
        ]);
        return this.getWorkbenchState(input);
    }

    async deleteCheckpoint(sessionId: string, checkpointId: string, input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        const sessions = await this.getSessionRuntime();
        await sessions.service.deleteCheckpoint(sessionId, checkpointId);
        return this.getWorkbenchState(input);
    }

    async compactSession(sessionId: string, input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        const sessions = await this.getSessionRuntime();
        const handle = await this.ensureAgentHandleWithCheckpoint(input);
        const entries = this.readSessionEntries(sessions.service, sessionId);
        const compactableEntries = entries.filter((entry) => entry.kind !== 'context-usage' && entry.kind !== 'compaction');
        if (compactableEntries.length <= 8) {
            return this.getWorkbenchState(input);
        }

        const preservedRecentMessages = 8;
        const retained = compactableEntries.slice(-preservedRecentMessages);
        const compacted = compactableEntries.slice(0, -preservedRecentMessages);
        const summary = this.buildFallbackCompactionSummary(compacted);
        const event: AgentCompactionSummary = {
            summary,
            source: 'fallback',
            messagesCompacted: compacted.length,
            preservedRecentMessages: retained.length,
            estimatedTokens: Math.ceil(compacted.map((entry) => this.getEntryText(entry)).join('\n').length / 4),
        };

        await handle.compactionService.notifyCompaction(sessionId, event);
        const latestUsage = [...entries].reverse().find((entry): entry is Extract<AgentTimelineEntry, { kind: 'context-usage' }> => entry.kind === 'context-usage');
        this.writeSessionEntries(sessions.service, sessionId, [
            ...(latestUsage ? [latestUsage] : []),
            { kind: 'compaction', id: randomUUID(), timestamp: Date.now(), event },
            ...retained,
        ]);
        await sessions.service.saveCheckpoint(sessionId, {
            payloadState: handle.compactionService.getState(sessionId),
        }).catch((error: any) => {
            this.outputChannel.appendLine(`[n8n-agent] Manual compaction checkpoint failed: ${error?.message || String(error)}`);
        });
        return this.getWorkbenchState(input);
    }

    async sendPrompt(input: AgentPromptInput, postMessage: AgentWorkbenchPostMessage): Promise<AgentRunResult> {
        if (this.activeRun) {
            await postMessage({
                type: 'agent.error',
                message: 'An agent run is already in progress. Stop it before sending another prompt.',
            });
            return { workflowChanged: false };
        }

        const prompt = input.prompt.trim();
        if (!prompt) {
            return { workflowChanged: false };
        }

        const sessions = await this.getSessionRuntime();
        const scope = this.getSessionScope(input);
        const activeRecord = input.sessionId
            ? sessions.service.ensure(input.sessionId, { scope, title: this.getDefaultSessionTitle(input.workflowName) })
            : (sessions.service.getActiveForScope(scope) || sessions.service.getOrCreateForScope(scope, {
                title: this.getDefaultSessionTitle(input.workflowName),
            }));

        const abortController = new AbortController();
        this.activeRun = { abortController, sessionId: activeRecord.id };

        const derivedTitle = activeRecord.title === 'New conversation'
            ? sessions.deriveSessionTitle(prompt, this.getDefaultSessionTitle(input.workflowName))
            : activeRecord.title;
        sessions.service.touch(activeRecord.id, { title: derivedTitle });
        sessions.service.setTitle(activeRecord.id, derivedTitle);

        let entries = this.readSessionEntries(sessions.service, activeRecord.id);
        entries = [...entries, { kind: 'user-message', id: randomUUID(), text: prompt, timestamp: Date.now() }];

        await postMessage({ type: 'agent.status', status: 'running', detail: 'Preparing n8n agent runtime...' });
        await postMessage({ type: 'agent.streamEvent', event: { type: 'start', sessionId: activeRecord.id, message: prompt } });

        try {
            const runResult = await this.runInitialAgentTurn({ ...input, sessionId: activeRecord.id }, entries, postMessage, abortController.signal);
            entries = runResult.entries;
            this.writeSessionEntries(sessions.service, activeRecord.id, entries);
            await postMessage({ type: 'agent.state', state: await this.getWorkbenchState({ ...input, sessionId: activeRecord.id }) });
            await postMessage({ type: 'agent.done' });
            return { workflowChanged: runResult.workflowChanged };
        } catch (error: any) {
            const message = error?.message || String(error);
            this.outputChannel.appendLine(`[n8n-agent] Run failed: ${message}`);
            const failedEntries = [...entries, this.createSystemNotice(`Run failed: ${message}`)];
            this.writeSessionEntries(sessions.service, activeRecord.id, failedEntries);
            await postMessage({ type: 'agent.streamEvent', event: { type: 'error', error: message } });
            await postMessage({ type: 'agent.error', message });
            await postMessage({ type: 'agent.state', state: await this.getWorkbenchState({ ...input, sessionId: activeRecord.id }) });
            return { workflowChanged: false };
        } finally {
            if (this.activeRun?.abortController === abortController) {
                this.activeRun = undefined;
            }
            await postMessage({ type: 'agent.status', status: 'idle' });
        }
    }

    async stop(postMessage: AgentWorkbenchPostMessage): Promise<void> {
        const activeRun = this.activeRun;
        if (!activeRun) {
            await postMessage({ type: 'agent.status', status: 'idle' });
            return;
        }
        await postMessage({ type: 'agent.status', status: 'stopping', detail: 'Stopping current run...' });
        activeRun.abortController.abort();
    }

    dispose(): void {
        this.activeRun?.abortController.abort();
        this.activeRun = undefined;
    }

    private async runInitialAgentTurn(
        input: AgentPromptInput,
        initialEntries: AgentTimelineEntry[],
        postMessage: AgentWorkbenchPostMessage,
        signal: AbortSignal,
    ): Promise<{ entries: AgentTimelineEntry[]; workflowChanged: boolean }> {
        await this.throwIfAborted(signal);

        const providerRegistry = await this.loadYagrProviderRegistry().catch((error: any) => ({ error: error?.message || String(error) }));
        if ('error' in providerRegistry) {
            return {
                entries: [
                    ...initialEntries,
                    this.createSystemNotice(await this.buildScaffoldResponse(input, providerRegistry.error)),
                ],
                workflowChanged: false,
            };
        }

        const providerConfig = await this.getProviderRuntimeConfig(providerRegistry);
        if (!providerConfig.ready) {
            return {
                entries: [
                    ...initialEntries,
                    this.createSystemNotice(await this.buildScaffoldResponse(input, providerConfig.reason)),
                ],
                workflowChanged: false,
            };
        }

        const handle = await this.getYagrAgentHandle(providerConfig, input);
        const sessions = await this.getSessionRuntime();
        sessions.service.setCheckpointer(handle.checkpointer);
        const agent = handle.agent;
        const messages = [{ role: 'user', content: await this.buildInvocationPrompt(input) }];
        const config = {
            ...sessions.service.buildSessionConfig(input.sessionId || ''),
            signal,
        } as Record<string, unknown>;

        let entries = [...initialEntries];
        const contextWindow = await this.resolveContextWindow(providerConfig.provider, providerConfig.model, providerConfig.apiKey, providerConfig.baseUrl);
        const estimatedPromptTokens = Math.ceil(messages[0].content.length / 4);
        const initialUsage: AgentContextUsageEvent = {
            type: 'context-usage',
            promptTokens: estimatedPromptTokens,
            completionTokens: 0,
            contextWindowTokens: contextWindow,
            fillPercent: Math.round((estimatedPromptTokens / contextWindow) * 100),
            source: 'estimated',
        };
        entries = this.applyStreamEvent(entries, initialUsage);
        await postMessage({ type: 'agent.streamEvent', event: initialUsage });

        if (typeof (agent as any).streamEvents === 'function') {
            const stream = (agent as any).streamEvents({ messages }, config);
            const eventRuntime = await import('@yagr/agent/dist/gateway/langgraph-events.js');
            const accumulator = eventRuntime.createRunAccumulator();
            const lastProgressKeys = new Set<string>();

            for await (const event of stream) {
                await this.throwIfAborted(signal);
                await eventRuntime.processStreamEvent(event, accumulator, {
                    onTextDelta: async (delta: string) => {
                        entries = this.applyStreamEvent(entries, { type: 'text-delta', delta });
                        await postMessage({ type: 'agent.streamEvent', event: { type: 'text-delta', delta } });
                    },
                    onOperation: async (operation: any) => {
                        const streamEvent: AgentStreamEvent = {
                            type: 'operation',
                            operationId: String(operation.operationId || randomUUID()),
                            label: String(operation.label || 'Operation'),
                            category: String(operation.category || 'tool'),
                            status: operation.status === 'error' ? 'error' : operation.status === 'done' ? 'done' : 'running',
                            body: typeof operation.body === 'string' ? operation.body : undefined,
                            summary: typeof operation.summary === 'string' ? operation.summary : undefined,
                            startedAt: Number(operation.startedAt || Date.now()),
                            endedAt: typeof operation.endedAt === 'number' ? operation.endedAt : undefined,
                        };
                        entries = this.applyStreamEvent(entries, streamEvent);
                        await postMessage({ type: 'agent.streamEvent', event: streamEvent });
                    },
                    onUserVisibleUpdate: async (update: any) => {
                        const dedupeKey = String(update.dedupeKey || `${update.title || 'progress'}:${update.detail || ''}`);
                        if (lastProgressKeys.has(dedupeKey)) {
                            return;
                        }
                        lastProgressKeys.add(dedupeKey);
                        const streamEvent: AgentStreamEvent = {
                            type: 'progress',
                            tone: update.tone === 'error' ? 'error' : update.tone === 'success' ? 'success' : 'info',
                            title: String(update.title || update.phase || 'Progress'),
                            detail: this.truncateOperationDetail(update.detail),
                            phase: typeof update.phase === 'string' ? update.phase : undefined,
                        };
                        entries = this.applyStreamEvent(entries, streamEvent);
                        await postMessage({ type: 'agent.streamEvent', event: streamEvent });
                    },
                    onCompaction: async (compaction: any) => {
                        const streamEvent: AgentStreamEvent = {
                            type: 'compaction',
                            summary: String(compaction.summary || 'Context compacted'),
                            source: compaction.source === 'fallback' ? 'fallback' : 'llm',
                            messagesCompacted: Number(compaction.messagesCompacted || 0),
                            preservedRecentMessages: Number(compaction.preservedRecentMessages || 0),
                            estimatedTokens: typeof compaction.estimatedTokens === 'number' ? compaction.estimatedTokens : undefined,
                            thresholdTokens: typeof compaction.thresholdTokens === 'number' ? compaction.thresholdTokens : undefined,
                            fallbackReason: typeof compaction.fallbackReason === 'string' ? compaction.fallbackReason : undefined,
                        };
                        await handle.compactionService.notifyCompaction(input.sessionId || '', streamEvent);
                        entries = this.applyStreamEvent(entries, streamEvent);
                        await postMessage({ type: 'agent.streamEvent', event: streamEvent });
                    },
                });
            }

            if (accumulator.fileModificationDetected) {
                try {
                    await sessions.service.saveCheckpoint(input.sessionId || '', {
                        payloadState: handle.compactionService.getState(input.sessionId || ''),
                    });
                } catch (error: any) {
                    this.outputChannel.appendLine(`[n8n-agent] Auto-checkpoint failed: ${error?.message || String(error)}`);
                }
            }

            const estimatedCompletionTokens = Math.ceil(accumulator.responseText.length / 4);
            const finalUsage: AgentContextUsageEvent = {
                type: 'context-usage',
                promptTokens: estimatedPromptTokens,
                completionTokens: estimatedCompletionTokens,
                contextWindowTokens: contextWindow,
                fillPercent: Math.min(100, Math.round(((estimatedPromptTokens + estimatedCompletionTokens) / contextWindow) * 100)),
                source: 'estimated',
            };
            entries = this.applyStreamEvent(entries, finalUsage);
            await postMessage({ type: 'agent.streamEvent', event: finalUsage });

            const finalEvent: AgentStreamEvent = {
                type: 'final',
                sessionId: input.sessionId || '',
                response: accumulator.responseText,
                finalState: 'done',
            };
            entries = this.applyStreamEvent(entries, finalEvent);
            await postMessage({ type: 'agent.streamEvent', event: finalEvent });
            return { entries, workflowChanged: Boolean(accumulator.fileModificationDetected) };
        }

        const result = await (agent as any).invoke({ messages }, config);
        const response = this.extractAgentText(result);
        const finalEvent: AgentStreamEvent = {
            type: 'final',
            sessionId: input.sessionId || '',
            response,
            finalState: 'done',
        };
        entries = this.applyStreamEvent(entries, finalEvent);
        await postMessage({ type: 'agent.streamEvent', event: finalEvent });
        return { entries, workflowChanged: false };
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

    private async describeProviderRuntimeConfig(): Promise<ProviderRuntimeConfig> {
        const providerRegistry = await this.loadYagrProviderRegistry().catch(() => undefined);
        if (!providerRegistry) {
            const config = vscode.workspace.getConfiguration('n8n.agent');
            return {
                ready: false,
                provider: String(config.get<string>('provider') || 'openai'),
                model: String(config.get<string>('model') || '').trim() || undefined,
                baseUrl: String(config.get<string>('baseUrl') || '').trim() || undefined,
                reasoningEffort: this.readReasoningEffort(),
                temperature: 0,
            };
        }
        return this.getProviderRuntimeConfig(providerRegistry);
    }

    private async getProviderRuntimeConfig(providerRegistry: typeof import('@yagr/agent/dist/llm/provider-registry.js')): Promise<ProviderRuntimeConfig> {
        const config = vscode.workspace.getConfiguration('n8n.agent');
        const provider = String(config.get<string>('provider') || 'openai');
        const normalizedProvider = providerRegistry.normalizeProviderId(provider);
        const reasoningEffort = this.readReasoningEffort();
        if (!normalizedProvider) {
            return {
                ready: false,
                reason: `Provider ${provider} is not supported by the installed Yagr runtime.`,
                provider,
                model: String(config.get<string>('model') || '').trim() || undefined,
                baseUrl: String(config.get<string>('baseUrl') || '').trim() || undefined,
                reasoningEffort,
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
                    reasoningEffort,
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
                reasoningEffort,
                temperature: 0,
            };
        }
        return {
            ready: true,
            provider: normalizedProvider,
            model,
            baseUrl,
            apiKey,
            reasoningEffort: normalizedProvider === 'openai-oauth' ? reasoningEffort : undefined,
            temperature: 0,
        };
    }

    private async getYagrAgentHandle(providerConfig: ProviderRuntimeConfig, input: AgentPromptInput): Promise<any> {
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
            reasoningEffort: providerConfig.reasoningEffort || '',
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
            reasoningEffort: providerConfig.reasoningEffort,
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
            systemPrompt: this.buildStaticSystemPrompt(input.workspaceRoot),
        });
        this.cachedAgentHandle = { key, handle };
        return handle;
    }

    private buildStaticSystemPrompt(workspaceRoot?: string): string {
        return [
            'You are the embedded n8n-as-code VS Code agent.',
            'You help users design, inspect, validate, and operate n8n workflows from the current workspace.',
            'Your DeepAgents backend working directory is the VS Code workspace root. Treat all relative filesystem tool paths as relative to that home directory.',
            'Use tools only when useful. For workflow-specific questions, use the inline workflow and node context supplied with each user turn as authoritative.',
            'Do not claim to push workflows, provision credentials, or change n8n runtime state unless a tool explicitly performs that action successfully.',
            workspaceRoot ? `Workspace root: ${workspaceRoot}` : undefined,
        ].filter(Boolean).join('\n');
    }

    private async buildInvocationPrompt(input: AgentPromptInput): Promise<string> {
        const workflowContext = await this.loadWorkflowContext(input);
        const blocks = [
            input.workflowId ? `Current workflow: ${input.workflowName || input.workflowId} (${input.workflowId})` : 'No workflow is attached. The user may be designing a new workflow.',
            input.workflowFilename ? `Current workflow file: ${input.workflowFilename}` : undefined,
            this.formatNodeContext(input.nodeContext),
            workflowContext,
            'User request:',
            input.prompt.trim(),
        ].filter(Boolean);
        return blocks.join('\n\n');
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
            return undefined;
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
            return this.sanitizeAssistantText(content);
        }
        if (Array.isArray(content)) {
            return this.sanitizeAssistantText(content.map((part) => {
                if (typeof part === 'string') return part;
                if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
                    return (part as Record<string, string>).text;
                }
                return '';
            }).join(''));
        }
        return 'The agent completed without producing text.';
    }

    private sanitizeAssistantText(value: string): string {
        return value.replace(ENVIRONMENT_DETAILS_BLOCK_PATTERN, '').trim();
    }

    private async buildProviderStatusLine(): Promise<string> {
        const config = vscode.workspace.getConfiguration('n8n.agent');
        const provider = String(config.get<string>('provider') || 'openai');
        const model = String(config.get<string>('model') || '').trim();
        const baseUrl = String(config.get<string>('baseUrl') || '').trim();
        const reasoningEffort = this.readReasoningEffort();
        const storedSecret = await this._context.secrets.get(getAgentProviderSecretKey(provider));
        const hasEnvSecret = this.hasProviderEnvironmentSecret(provider);
        const secretState = storedSecret
            ? 'API key stored in VS Code Secret Storage'
            : hasEnvSecret
                ? 'API key available from environment'
                : 'API key not configured yet';
        return `Agent provider: ${provider}${model ? ` / ${model}` : ''}${reasoningEffort ? ` / reasoning ${reasoningEffort}` : ''}${baseUrl ? ` / ${baseUrl}` : ''}. ${secretState}.`;
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
            'No workflow files, credentials, runtime state, or shell commands were changed unless the runtime explicitly reported success.',
        ].join('\n');
    }

    private async throwIfAborted(signal: AbortSignal): Promise<void> {
        if (signal.aborted) {
            const error = new Error('Agent run cancelled.');
            error.name = 'AbortError';
            throw error;
        }
    }

    private async getSessionRuntime(): Promise<SessionRuntime> {
        if (!this.sessionRuntimePromise) {
            this.sessionRuntimePromise = (async () => {
                const module = await import('@yagr/agent/packages/session-service/dist/index.js');
                const sessionsRoot = path.join(this._context.globalStorageUri.fsPath, 'agent-sessions');
                const webUiSessionsDir = path.join(sessionsRoot, 'display');
                await fs.promises.mkdir(webUiSessionsDir, { recursive: true });
                const service = new module.SessionService({
                    sessionsDir: path.join(sessionsRoot, 'records'),
                    webUiSessionsDir,
                }) as SessionServiceHandle;
                return {
                    service,
                    deriveSessionTitle: module.deriveSessionTitle as SessionRuntime['deriveSessionTitle'],
                };
            })();
        }
        return this.sessionRuntimePromise;
    }

    private getSessionScope(input: Omit<AgentPromptInput, 'prompt'>): DeepAgentSessionScope {
        if (input.workflowId) {
            return { kind: 'vscode-workflow', key: input.workflowId };
        }
        return this.getUnattachedSessionScope();
    }

    private getUnattachedSessionScope(): DeepAgentSessionScope {
        return { kind: 'vscode-workflow', key: UNATTACHED_WORKFLOW_SCOPE_KEY };
    }

    private getDefaultSessionTitle(workflowName?: string): string {
        return workflowName ? `${workflowName} conversation` : 'New conversation';
    }

    private async listSessionSummaries(scope: DeepAgentSessionScope, activeSessionId: string): Promise<AgentSessionSummary[]> {
        const sessions = await this.getSessionRuntime();
        const handle = this.cachedAgentHandle?.handle;
        const summaries = await Promise.all(sessions.service.list().map(async (summary) => {
            const record = sessions.service.get(summary.id);
            const recordScope = record?.scope;
            const workflowId = recordScope?.kind === 'vscode-workflow' && recordScope.key !== UNATTACHED_WORKFLOW_SCOPE_KEY
                ? recordScope.key
                : undefined;
            const compactionState = handle?.compactionService?.getState
                ? handle.compactionService.getState(summary.id) as CompactionState
                : { lastCompaction: null, compactionHistory: [], totalCompactions: 0 };
            const checkpoints = await sessions.service.listCheckpoints(summary.id).catch(() => []);
            return {
                id: summary.id,
                title: summary.title,
                createdAt: summary.createdAt,
                updatedAt: summary.updatedAt,
                messageCount: summary.messageCount,
                isActive: summary.id === activeSessionId,
                isClosed: Boolean(record?.closedAt),
                checkpointCount: checkpoints.length,
                workflowId,
                workflowLabel: workflowId ? workflowId : 'New workflow chat',
                totalCompactions: compactionState.totalCompactions,
            };
        }));
        return summaries.sort((left, right) => {
            if (left.isActive !== right.isActive) {
                return left.isActive ? -1 : 1;
            }
            const leftMatchesScope = left.workflowId === scope.key || (!left.workflowId && scope.key === UNATTACHED_WORKFLOW_SCOPE_KEY);
            const rightMatchesScope = right.workflowId === scope.key || (!right.workflowId && scope.key === UNATTACHED_WORKFLOW_SCOPE_KEY);
            if (leftMatchesScope !== rightMatchesScope) {
                return leftMatchesScope ? -1 : 1;
            }
            return right.updatedAt.localeCompare(left.updatedAt);
        });
    }

    private async buildSessionState(sessionId: string, input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentSessionState> {
        const sessions = await this.getSessionRuntime();
        const displaySession = sessions.service.readDisplaySession(sessionId);
        const entries = this.normalizeEntries(displaySession?.displayThread);
        const checkpoints = await sessions.service.listCheckpoints(sessionId).catch(() => []);
        const handle = this.cachedAgentHandle?.handle;
        const compactionState: CompactionState = handle?.compactionService?.getState
            ? handle.compactionService.getState(sessionId)
            : { lastCompaction: null, compactionHistory: [], totalCompactions: 0 };
        const record = sessions.service.get(sessionId);
        const workflowId = record?.scope?.kind === 'vscode-workflow' && record.scope.key !== UNATTACHED_WORKFLOW_SCOPE_KEY
            ? record.scope.key
            : undefined;
        const latestUsageEntry = [...entries].reverse().find((entry): entry is Extract<AgentTimelineEntry, { kind: 'context-usage' }> => entry.kind === 'context-usage');
        return {
            sessionId,
            title: displaySession?.title || record?.title || this.getDefaultSessionTitle(input.workflowName),
            entries,
            checkpoints: checkpoints.map((checkpoint) => ({
                id: checkpoint.id,
                sessionId: checkpoint.sessionId,
                createdAt: checkpoint.createdAt,
                messageCount: checkpoint.messageCount,
                summary: checkpoint.summary,
            })),
            contextUsage: latestUsageEntry?.usage,
            lastCompaction: compactionState.lastCompaction || undefined,
            totalCompactions: compactionState.totalCompactions,
            workflowId,
            workflowLabel: workflowId || 'New workflow chat',
        };
    }

    private buildFallbackCompactionSummary(entries: AgentTimelineEntry[]): string {
        const snippets = entries
            .map((entry) => this.getEntryText(entry).trim())
            .filter(Boolean)
            .slice(-6)
            .map((text) => text.length > 140 ? `${text.slice(0, 140)}...` : text);
        return snippets.length
            ? `Manual context compaction preserved recent conversation and summarized prior context: ${snippets.join(' | ')}`
            : 'Manual context compaction preserved recent conversation and removed older low-signal context.';
    }

    private getEntryText(entry: AgentTimelineEntry): string {
        if (entry.kind === 'user-message' || entry.kind === 'system-notice' || entry.kind === 'assistant-body') {
            return entry.text;
        }
        if (entry.kind === 'operation') {
            return [entry.title, entry.detail, entry.summary, entry.body].filter(Boolean).join(' ');
        }
        if (entry.kind === 'compaction') {
            return entry.event.summary;
        }
        if (entry.kind === 'context-usage') {
            return `${entry.usage.fillPercent}% context usage`;
        }
        return '';
    }

    private readSessionEntries(service: SessionServiceHandle, sessionId: string): AgentTimelineEntry[] {
        return this.normalizeEntries(service.readDisplaySession(sessionId)?.displayThread);
    }

    private writeSessionEntries(service: SessionServiceHandle, sessionId: string, entries: AgentTimelineEntry[]): void {
        service.syncDisplayThread(sessionId, entries);
    }

    private normalizeEntries(value: unknown[] | undefined): AgentTimelineEntry[] {
        return Array.isArray(value)
            ? (value as AgentTimelineEntry[]).filter((entry) => !this.isNoiseOperation(entry))
            : [];
    }

    private isNoiseOperation(entry: AgentTimelineEntry): boolean {
        if (entry.kind !== 'operation') return false;
        const title = entry.title.toLowerCase();
        const detail = (entry.detail || entry.summary || '').toLowerCase();
        return title === 'agent runtime' || detail === 'run completed' || title.includes('run completed');
    }

    private applyStreamEvent(entries: AgentTimelineEntry[], event: AgentStreamEvent): AgentTimelineEntry[] {
        if (event.type === 'start') {
            return entries;
        }
        if (event.type === 'text-delta') {
            const next = [...entries];
            const last = next[next.length - 1];
            if (last?.kind === 'assistant-body' && last.streaming) {
                last.text += event.delta;
                return next;
            }
            next.push({ kind: 'assistant-body', id: randomUUID(), text: event.delta, streaming: true });
            return next;
        }
        if (event.type === 'final') {
            const next = [...entries];
            const last = next[next.length - 1];
            if (last?.kind === 'assistant-body') {
                last.streaming = false;
                if (!last.text) {
                    last.text = event.response;
                }
                last.finalState = event.finalState;
                return next;
            }
            next.push({ kind: 'assistant-body', id: randomUUID(), text: event.response, streaming: false, finalState: event.finalState });
            return next;
        }
        if (event.type === 'operation') {
            const next = [...entries];
            const existingIndex = next.findIndex((entry) => entry.kind === 'operation' && entry.id === event.operationId);
            const operationEntry: AgentTimelineEntry = {
                kind: 'operation',
                id: event.operationId,
                tone: event.status === 'error' ? 'error' : event.status === 'done' ? 'success' : 'info',
                title: event.label,
                category: event.category,
                status: event.status,
                body: event.body,
                summary: event.summary,
                startedAt: event.startedAt,
                endedAt: event.endedAt,
                detail: event.summary,
            };
            if (existingIndex >= 0) {
                next[existingIndex] = operationEntry;
                return next;
            }
            next.push(operationEntry);
            return next;
        }
        if (event.type === 'progress') {
            return [
                ...entries,
                {
                    kind: 'operation',
                    id: randomUUID(),
                    tone: event.tone,
                    title: event.title,
                    detail: event.detail,
                    category: event.phase || 'phase',
                    status: event.tone === 'error' ? 'error' : 'running',
                },
            ];
        }
        if (event.type === 'compaction') {
            return [
                ...entries,
                {
                    kind: 'compaction',
                    id: randomUUID(),
                    timestamp: Date.now(),
                    event: {
                        summary: event.summary,
                        source: event.source,
                        messagesCompacted: event.messagesCompacted,
                        preservedRecentMessages: event.preservedRecentMessages,
                        estimatedTokens: event.estimatedTokens,
                        thresholdTokens: event.thresholdTokens,
                        fallbackReason: event.fallbackReason,
                    },
                },
            ];
        }
        if (event.type === 'context-usage') {
            const usageEntry: AgentTimelineEntry = {
                kind: 'context-usage',
                id: randomUUID(),
                timestamp: Date.now(),
                usage: {
                    promptTokens: event.promptTokens,
                    completionTokens: event.completionTokens,
                    contextWindowTokens: event.contextWindowTokens,
                    fillPercent: event.fillPercent,
                    source: event.source,
                },
            };
            const withoutPrevious = entries.filter((entry) => entry.kind !== 'context-usage');
            return [...withoutPrevious, usageEntry];
        }
        if (event.type === 'error') {
            return [...entries, this.createSystemNotice(`Error: ${event.error}`)];
        }
        return entries;
    }

    private createSystemNotice(text: string): AgentTimelineEntry {
        return { kind: 'system-notice', id: randomUUID(), text, timestamp: Date.now() };
    }

    private async ensureAgentHandleWithCheckpoint(input: Omit<AgentPromptInput, 'prompt'>): Promise<any> {
        const providerRegistry = await this.loadYagrProviderRegistry();
        const providerConfig = await this.getProviderRuntimeConfig(providerRegistry);
        if (!providerConfig.ready) {
            throw new Error(providerConfig.reason || 'Agent provider is not ready.');
        }
        const handle = await this.getYagrAgentHandle(providerConfig, { ...input, prompt: '' });
        const sessions = await this.getSessionRuntime();
        sessions.service.setCheckpointer(handle.checkpointer);
        return handle;
    }

    private async resolveContextWindow(provider: string, model?: string, apiKey?: string, baseUrl?: string): Promise<number> {
        if (!model) {
            return DEFAULT_CONTEXT_WINDOW_TOKENS;
        }
        try {
            const metadata = await import('@yagr/agent/dist/llm/provider-metadata.js');
            const entry = await metadata.primeProviderModelMetadata(provider as any, model, apiKey, baseUrl);
            return Number(entry?.contextWindow || metadata.getSnapshotContextWindow(provider as any, model) || DEFAULT_CONTEXT_WINDOW_TOKENS);
        } catch {
            return DEFAULT_CONTEXT_WINDOW_TOKENS;
        }
    }

    private readReasoningEffort(): AgentReasoningEffort | undefined {
        const config = vscode.workspace.getConfiguration('n8n.agent');
        const value = String(config.get<string>('reasoningEffort') || '').trim();
        return value ? value as AgentReasoningEffort : undefined;
    }

    private isCompactionState(value: unknown): value is CompactionState {
        return Boolean(
            value
            && typeof value === 'object'
            && Array.isArray((value as { compactionHistory?: unknown[] }).compactionHistory)
            && typeof (value as { totalCompactions?: unknown }).totalCompactions === 'number',
        );
    }
}
