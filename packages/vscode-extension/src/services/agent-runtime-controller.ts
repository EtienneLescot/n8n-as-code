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
    nodeContexts?: AgentNodeContext[];
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

export interface AgentWorkflowContext {
    id?: string;
    name: string;
    filename?: string;
    filePath?: string;
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
    reason?: CheckpointReason;
    label?: string;
    restoredAt?: string;
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
    workflowContext?: AgentWorkflowContext;
    totalCompactions: number;
}

export type AgentTimelineEntry =
    | { kind: 'user-message'; id: string; text: string; timestamp: number }
    | { kind: 'system-notice'; id: string; text: string; timestamp: number }
    | { kind: 'workflow-context'; id: string; timestamp: number; action: 'set'; workflow: AgentWorkflowContext }
    | { kind: 'workflow-context'; id: string; timestamp: number; action: 'clear' }
    | { kind: 'node-context'; id: string; timestamp: number; nodes: AgentNodeContext[] }
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
    workflowContext?: AgentWorkflowContext;
    nodeContexts: AgentNodeContext[];
}

export interface AgentWorkbenchState {
    workflow: {
        id?: string;
        name?: string;
        filename?: string;
    };
    workflowContext?: AgentWorkflowContext;
    provider: string;
    model?: string;
    baseUrl?: string;
    reasoningEffort?: AgentReasoningEffort;
    supportsReasoningEffort: boolean;
    currentNodeContext?: AgentNodeContext;
    currentNodeContexts: AgentNodeContext[];
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
    reason?: CheckpointReason;
    label?: string;
    restoredAt?: string;
};

type CheckpointReason = 'manual' | 'auto' | 'before-tool' | 'after-tool' | 'before-compaction' | 'after-compaction';

type SaveCheckpointOptions = {
    reason?: CheckpointReason;
    label?: string;
    summary?: string;
    payloads?: Record<string, unknown>;
    payloadState?: unknown | null;
};

type RestoreCheckpointResult = {
    sessionId: string;
    checkpointId: string;
    restoredAt: string;
    langGraphRestored?: boolean;
    pendingWritesRestored?: boolean;
    payloads?: Record<string, unknown>;
    payloadsRestored?: string[];
    displayThreadRestored?: boolean;
    warnings?: string[];
    payloadState?: unknown | null;
};

type AgentWorkbenchCheckpointSurfacePayload = {
    version: 1;
    displayThread: AgentTimelineEntry[];
    contextMarkers: AgentTimelineEntry[];
    selectedWorkflow?: AgentWorkflowContext;
    selectedNodes: AgentNodeContext[];
    title: string;
    scope?: DeepAgentSessionScope;
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
    saveCheckpoint(sessionId: string, options?: SaveCheckpointOptions): Promise<SessionCheckpointMetadata>;
    maybeSaveCheckpoint?(sessionId: string, reason: CheckpointReason, options?: Omit<SaveCheckpointOptions, 'reason'>): Promise<SessionCheckpointMetadata | undefined>;
    restoreCheckpoint(sessionId: string, checkpointId: string): Promise<RestoreCheckpointResult>;
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
        const activeRecord = input.sessionId
            ? sessions.service.ensure(input.sessionId, { title: this.getDefaultSessionTitle(input.workflowName) })
            : sessions.service.getActiveForScope(scope) || sessions.service.getOrCreateForScope(scope, {
            title: this.getDefaultSessionTitle(input.workflowName),
        });
        const session = await this.buildSessionState(activeRecord.id, input);
        const workflowContext = session.workflowContext;
        const nodeContexts = session.nodeContexts.length ? session.nodeContexts : this.normalizeNodeContexts(input.nodeContexts || input.nodeContext);
        const providerConfig = await this.describeProviderRuntimeConfig();
        return {
            workflow: {
                id: workflowContext?.id,
                name: workflowContext?.name,
                filename: workflowContext?.filename,
            },
            workflowContext,
            provider: providerConfig.provider,
            model: providerConfig.model,
            baseUrl: providerConfig.baseUrl,
            reasoningEffort: providerConfig.reasoningEffort,
            supportsReasoningEffort: providerConfig.provider === 'openai-oauth',
            currentNodeContext: nodeContexts[0],
            currentNodeContexts: nodeContexts,
            activeSessionId: activeRecord.id,
            sessions: await this.listSessionSummaries(scope, activeRecord.id),
            session,
            isRunning: this.activeRun?.sessionId === activeRecord.id,
        };
    }

    async createSession(input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        const scope = this.getUnattachedSessionScope();
        const sessions = await this.getSessionRuntime();
        sessions.service.rotateForScope(scope, {
            title: this.getDefaultSessionTitle(),
        });
        return this.getWorkbenchState({ ...input, workflowId: undefined, workflowName: undefined, workflowFilename: undefined, workflowFilePath: undefined, nodeContext: undefined, nodeContexts: undefined, sessionId: undefined });
    }

    async getLatestSessionId(): Promise<string | undefined> {
        const sessions = await this.getSessionRuntime();
        return [...sessions.service.list()]
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.id;
    }

    async getLatestSessionIdForWorkflow(workflow: AgentWorkflowContext): Promise<string | undefined> {
        const sessions = await this.getSessionRuntime();
        const summaries = sessions.service.list();
        let latest: { id: string; updatedAt: string } | undefined;
        for (const summary of summaries) {
            const record = sessions.service.get(summary.id);
            const context = this.getLatestWorkflowContext(this.readSessionEntries(sessions.service, summary.id), record);
            if (!context || !this.workflowContextsMatch(context, workflow)) continue;
            if (!latest || summary.updatedAt.localeCompare(latest.updatedAt) > 0) {
                latest = { id: summary.id, updatedAt: summary.updatedAt };
            }
        }
        return latest?.id;
    }

    async createSessionForWorkflow(workflow: AgentWorkflowContext, input: Omit<AgentPromptInput, 'prompt'>): Promise<string> {
        const name = workflow.name?.trim() || workflow.id || workflow.filename || 'Workflow';
        const sessions = await this.getSessionRuntime();
        const record = sessions.service.rotateForScope(this.getUnattachedSessionScope(), {
            title: this.getDefaultSessionTitle(name),
        });
        this.writeSessionEntries(sessions.service, record.id, this.withWorkflowContext([], { ...workflow, name }));
        await this.getWorkbenchState({ ...input, sessionId: record.id });
        return record.id;
    }

    async selectSession(sessionId: string, input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        const sessions = await this.getSessionRuntime();
        sessions.service.ensure(sessionId);
        return this.getWorkbenchState({ ...input, sessionId });
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
        if (!input.workflowId) {
            throw new Error('Open a workflow before attaching a session.');
        }
        return this.setWorkflowContext(sessionId, {
            id: input.workflowId,
            name: input.workflowName || input.workflowId,
            filename: input.workflowFilename,
            filePath: input.workflowFilePath,
        }, input);
    }

    async detachSession(sessionId: string, input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        return this.clearWorkflowContext(sessionId, input);
    }

    async setWorkflowContext(sessionId: string, workflow: AgentWorkflowContext, input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        const name = workflow.name?.trim() || workflow.id || workflow.filename || 'Workflow';
        const sessions = await this.getSessionRuntime();
        sessions.service.ensure(sessionId);
        const entries = this.withWorkflowContext(this.readSessionEntries(sessions.service, sessionId), {
            ...workflow,
            name,
        });
        this.writeSessionEntries(sessions.service, sessionId, entries);
        return this.getWorkbenchState({ ...input, sessionId });
    }

    async clearWorkflowContext(sessionId: string, input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        const sessions = await this.getSessionRuntime();
        sessions.service.ensure(sessionId);
        this.writeSessionEntries(sessions.service, sessionId, [
            ...this.readSessionEntries(sessions.service, sessionId),
            { kind: 'workflow-context', id: randomUUID(), timestamp: Date.now(), action: 'clear' },
            { kind: 'node-context', id: randomUUID(), timestamp: Date.now(), nodes: [] },
        ]);
        return this.getWorkbenchState({ ...input, sessionId, workflowId: undefined, workflowName: undefined, workflowFilename: undefined, workflowFilePath: undefined, nodeContext: undefined, nodeContexts: undefined });
    }

    async setNodeContexts(sessionId: string, nodes: AgentNodeContext[], input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        const sessions = await this.getSessionRuntime();
        sessions.service.ensure(sessionId);
        const workflowContext = this.getLatestWorkflowContext(this.readSessionEntries(sessions.service, sessionId), sessions.service.get(sessionId));
        if (!workflowContext) {
            return this.getWorkbenchState({ ...input, sessionId, nodeContext: undefined, nodeContexts: undefined });
        }
        this.writeSessionEntries(sessions.service, sessionId, [
            ...this.readSessionEntries(sessions.service, sessionId),
            { kind: 'node-context', id: randomUUID(), timestamp: Date.now(), nodes: this.normalizeNodeContexts(nodes) },
        ]);
        return this.getWorkbenchState({ ...input, sessionId });
    }

    async saveCheckpoint(sessionId: string, input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        const sessions = await this.getSessionRuntime();
        const handle = await this.ensureAgentHandleWithCheckpoint(input);
        const surface = this.buildCheckpointSurfacePayload(sessions.service, sessionId);
        const compaction = handle.compactionService?.getState?.(sessionId);
        const label = surface.selectedWorkflow ? 'Before workflow edit' : 'Manual checkpoint';
        await this.saveYagrCheckpoint(sessions.service, sessionId, {
            reason: 'manual',
            label,
            summary: this.buildCheckpointSummary(surface),
            payloads: {
                surface,
                ...(compaction ? { compaction } : {}),
            },
        });
        const entries = this.readSessionEntries(sessions.service, sessionId);
        this.writeSessionEntries(sessions.service, sessionId, [
            ...entries,
            this.createSystemNotice(`Checkpoint saved: ${label}.`),
        ]);
        return this.getWorkbenchState({ ...input, sessionId });
    }

    async restoreCheckpoint(sessionId: string, checkpointId: string, input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        const sessions = await this.getSessionRuntime();
        const handle = await this.ensureAgentHandleWithCheckpoint(input);
        const result = await sessions.service.restoreCheckpoint(sessionId, checkpointId);
        const payloads = this.extractCheckpointPayloads(result);
        const notices: AgentTimelineEntry[] = [];
        const surface = payloads.surface;
        if (this.isWorkbenchSurfacePayload(surface)) {
            const entries = this.normalizeEntries(surface.displayThread);
            const title = surface.title.trim() || sessions.service.get(sessionId)?.title || this.getDefaultSessionTitle(input.workflowName);
            sessions.service.touch(sessionId, { title });
            sessions.service.setTitle(sessionId, title);
            this.writeSessionEntries(sessions.service, sessionId, [
                ...entries,
                this.createSystemNotice(`Restored checkpoint ${checkpointId}.`),
            ]);
        } else {
            notices.push(this.createSystemNotice(`Restored checkpoint ${checkpointId}. Runtime state was restored, but this checkpoint does not include Workbench surface state, so the visible conversation was kept.`));
        }
        if (this.isCompactionState(payloads.compaction) && typeof handle.compactionService?.setState === 'function') {
            handle.compactionService.setState(sessionId, payloads.compaction);
        }
        for (const warning of result.warnings || []) {
            const message = typeof warning === 'string' ? warning : String(warning);
            this.outputChannel.appendLine(`[n8n-agent] Checkpoint restore warning: ${message}`);
            notices.push(this.createSystemNotice(`Checkpoint warning: ${message}`));
        }
        if (notices.length) {
            this.writeSessionEntries(sessions.service, sessionId, [
                ...this.readSessionEntries(sessions.service, sessionId),
                ...notices,
            ]);
        }
        return this.getWorkbenchState({ ...input, sessionId });
    }

    async deleteCheckpoint(sessionId: string, checkpointId: string, input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        const sessions = await this.getSessionRuntime();
        await sessions.service.deleteCheckpoint(sessionId, checkpointId);
        if ((input.sessionId || sessionId) === sessionId) {
            this.writeSessionEntries(sessions.service, sessionId, [
                ...this.readSessionEntries(sessions.service, sessionId),
                this.createSystemNotice('Checkpoint deleted.'),
            ]);
        }
        return this.getWorkbenchState({ ...input, sessionId });
    }

    async compactSession(sessionId: string, input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        if (this.activeRun) {
            throw new Error(this.activeRun.sessionId === sessionId
                ? 'An agent run is already active for this conversation.'
                : 'An agent run is already active. Stop it before compacting context.');
        }
        const sessions = await this.getSessionRuntime();
        const handle = await this.ensureAgentHandleWithCheckpoint(input);
        if (typeof handle.compactionService?.compactSession !== 'function') {
            const entries = this.readSessionEntries(sessions.service, sessionId);
            this.writeSessionEntries(sessions.service, sessionId, [
                ...entries,
                this.createSystemNotice('Manual context compaction is not supported by the installed Yagr runtime.'),
            ]);
            return this.getWorkbenchState({ ...input, sessionId });
        }

        const abortController = new AbortController();
        this.activeRun = { abortController, sessionId };
        try {
            const result = await handle.compactionService.compactSession(sessionId, {
                abortSignal: abortController.signal,
            });
            let entries = this.readSessionEntries(sessions.service, sessionId);
            const status = String(result?.status || 'failed');
            if (status === 'completed') {
                const event = this.toCompactionSummary(result?.event);
                if (event) {
                    entries = [
                        ...this.withoutContextUsage(entries),
                        { kind: 'compaction', id: randomUUID(), timestamp: Date.now(), event },
                    ];
                } else {
                    entries = [
                        ...this.withoutContextUsage(entries),
                        this.createSystemNotice('Context compacted, but the runtime did not return compaction details.'),
                    ];
                }
                this.writeSessionEntries(sessions.service, sessionId, entries);
                const surface = this.buildCheckpointSurfacePayload(sessions.service, sessionId, entries);
                await this.saveYagrCheckpoint(sessions.service, sessionId, {
                    reason: 'after-compaction',
                    label: 'After context compaction',
                    summary: 'Workbench checkpoint after context compaction',
                    payloads: {
                        surface,
                        compaction: handle.compactionService.getState(sessionId),
                    },
                }).catch((error: any) => {
                    this.outputChannel.appendLine(`[n8n-agent] Manual compaction checkpoint failed: ${error?.message || String(error)}`);
                });
                return this.getWorkbenchState({ ...input, sessionId });
            }

            const reason = typeof result?.reason === 'string' && result.reason.trim() ? result.reason.trim() : undefined;
            const message = status === 'skipped'
                ? (reason || 'Nothing to compact.')
                : status === 'unavailable'
                    ? (reason || 'Manual context compaction is not available for this runtime.')
                    : (reason || 'Context compaction failed.');
            this.writeSessionEntries(sessions.service, sessionId, [
                ...entries,
                this.createSystemNotice(message),
            ]);
            return this.getWorkbenchState({ ...input, sessionId });
        } finally {
            if (this.activeRun?.abortController === abortController) {
                this.activeRun = undefined;
            }
        }
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
            ? sessions.service.ensure(input.sessionId, { title: this.getDefaultSessionTitle(input.workflowName) })
            : (sessions.service.getActiveForScope(scope) || sessions.service.getOrCreateForScope(scope, {
                title: this.getDefaultSessionTitle(input.workflowName),
            }));
        const sessionContext = await this.buildSessionState(activeRecord.id, input);
        const promptWorkflowContext = sessionContext.workflowContext;
        const promptNodeContexts = sessionContext.nodeContexts.length
            ? sessionContext.nodeContexts
            : this.normalizeNodeContexts(input.nodeContexts || input.nodeContext);
        const promptInput: AgentPromptInput = {
            ...input,
            sessionId: activeRecord.id,
            workflowId: promptWorkflowContext?.id,
            workflowName: promptWorkflowContext?.name,
            workflowFilename: promptWorkflowContext?.filename,
            workflowFilePath: promptWorkflowContext?.filePath || input.workflowFilePath,
            nodeContext: promptNodeContexts[0],
            nodeContexts: promptNodeContexts,
        };

        const abortController = new AbortController();
        this.activeRun = { abortController, sessionId: activeRecord.id };

        const derivedTitle = activeRecord.title === 'New conversation'
            ? sessions.deriveSessionTitle(prompt, this.getDefaultSessionTitle(input.workflowName))
            : activeRecord.title;
        sessions.service.touch(activeRecord.id, { title: derivedTitle });
        sessions.service.setTitle(activeRecord.id, derivedTitle);

        let entries = this.withoutContextUsage(this.readSessionEntries(sessions.service, activeRecord.id));
        entries = [...entries, { kind: 'user-message', id: randomUUID(), text: prompt, timestamp: Date.now() }];

        await postMessage({ type: 'agent.status', status: 'running', detail: 'Preparing n8n agent runtime...' });
        await postMessage({ type: 'agent.streamEvent', event: { type: 'start', sessionId: activeRecord.id, message: prompt } });

        try {
            const runResult = await this.runInitialAgentTurn(promptInput, entries, postMessage, abortController.signal);
            entries = runResult.entries;
            if (runResult.workflowChanged && !promptWorkflowContext) {
                const inferredWorkflow = await this.inferWorkflowContextFromWorkspace(input.workspaceRoot);
                if (inferredWorkflow) {
                    entries = this.withWorkflowContext(entries, inferredWorkflow);
                }
            }
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
        const contextWindowTokens = await this.resolveContextWindow(providerConfig.provider, providerConfig.model, providerConfig.apiKey, providerConfig.baseUrl);
        const config = {
            ...sessions.service.buildSessionConfig(input.sessionId || ''),
            signal,
        } as Record<string, unknown>;

        let entries = [...initialEntries];

        if (typeof (agent as any).streamEvents === 'function') {
            const stream = (agent as any).streamEvents({ messages }, config);
            const eventRuntime = await import('@yagr/agent/dist/gateway/langgraph-events.js');
            const accumulator = eventRuntime.createRunAccumulator();
            const lastProgressKeys = new Set<string>();

            for await (const event of stream) {
                await this.throwIfAborted(signal);
                await eventRuntime.processStreamEvent(event, accumulator, {
                    contextWindowTokens,
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
                    onContextUsage: async (usage: any) => {
                        if (usage?.source !== 'api') {
                            return;
                        }
                        const streamEvent: AgentStreamEvent = {
                            type: 'context-usage',
                            promptTokens: Number(usage.promptTokens || 0),
                            completionTokens: Number(usage.completionTokens || 0),
                            contextWindowTokens: Number(usage.contextWindowTokens || contextWindowTokens),
                            fillPercent: Number(usage.fillPercent || 0),
                            source: 'api',
                        };
                        entries = this.applyStreamEvent(entries, streamEvent);
                        await postMessage({ type: 'agent.streamEvent', event: streamEvent });
                    },
                });
            }

            const finalEvent: AgentStreamEvent = {
                type: 'final',
                sessionId: input.sessionId || '',
                response: accumulator.responseText,
                finalState: 'done',
            };
            entries = this.applyStreamEvent(entries, finalEvent);
            await postMessage({ type: 'agent.streamEvent', event: finalEvent });
            if (accumulator.fileModificationDetected) {
                this.outputChannel.appendLine(`[n8n-agent-debug] agent runtime detected local workflow modification sessionId=${input.sessionId || 'none'} workflowId=${input.workflowId || 'none'} workflowFilePath=${input.workflowFilePath || 'none'}`);
                try {
                    await this.maybeSaveYagrCheckpoint(sessions.service, input.sessionId || '', 'after-tool', {
                        label: 'After file modifications',
                        summary: 'Saved after file modifications',
                        payloads: {
                            surface: this.buildCheckpointSurfacePayload(sessions.service, input.sessionId || '', entries),
                            compaction: handle.compactionService?.getState?.(input.sessionId || ''),
                        },
                    });
                } catch (error: any) {
                    this.outputChannel.appendLine(`[n8n-agent] Auto-checkpoint failed: ${error?.message || String(error)}`);
                }
            }
            this.outputChannel.appendLine(`[n8n-agent-debug] agent runtime completed sessionId=${input.sessionId || 'none'} workflowId=${input.workflowId || 'none'} workflowChanged=${String(Boolean(accumulator.fileModificationDetected))}`);
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
        const nodeContexts = this.normalizeNodeContexts(input.nodeContexts || input.nodeContext);
        const blocks = [
            input.workflowId ? `Current workflow: ${input.workflowName || input.workflowId} (${input.workflowId})` : 'No workflow is attached. The user may be designing a new workflow.',
            input.workflowFilename ? `Current workflow file: ${input.workflowFilename}` : undefined,
            this.formatNodeContexts(nodeContexts),
            workflowContext,
            'User request:',
            input.prompt.trim(),
        ].filter(Boolean);
        return blocks.join('\n\n');
    }

    private formatNodeContexts(nodeContexts: AgentNodeContext[]): string | undefined {
        if (!nodeContexts.length) {
            return undefined;
        }
        return [
            nodeContexts.length === 1 ? 'Current n8n node context:' : 'Current n8n node contexts:',
            ...nodeContexts.map((node, index) => [
                `${index + 1}. Node name: ${node.name}`,
                node.type ? `   Node type: ${node.type}` : undefined,
                node.id ? `   Node ID: ${node.id}` : undefined,
            ].filter(Boolean).join('\n')),
            'When the user makes an ambiguous node-specific request, assume it refers to these selected nodes unless they name another node.',
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
                    checkpointPolicy: {
                        enabled: true,
                        afterFileModifications: true,
                        beforeToolCalls: false,
                        beforeCompaction: false,
                        afterCompaction: false,
                        maxCheckpointsPerSession: 20,
                    },
                } as any) as SessionServiceHandle;
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
            const entries = this.readSessionEntries(sessions.service, summary.id);
            const workflowContext = this.getLatestWorkflowContext(entries, record);
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
                workflowId: workflowContext?.id,
                workflowLabel: workflowContext?.name || workflowContext?.id || workflowContext?.filename || 'New workflow chat',
                workflowContext,
                totalCompactions: compactionState.totalCompactions,
            };
        }));
        return summaries.sort((left, right) => {
            if (left.isActive !== right.isActive) {
                return left.isActive ? -1 : 1;
            }
            const leftMatchesScope = left.workflowId === scope.key || (!left.workflowContext && scope.key === UNATTACHED_WORKFLOW_SCOPE_KEY);
            const rightMatchesScope = right.workflowId === scope.key || (!right.workflowContext && scope.key === UNATTACHED_WORKFLOW_SCOPE_KEY);
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
        const workflowContext = this.getLatestWorkflowContext(entries, record);
        const nodeContexts = workflowContext ? this.getLatestNodeContexts(entries) : [];
        const latestUsageEntry = [...entries].reverse().find((entry): entry is Extract<AgentTimelineEntry, { kind: 'context-usage' }> => entry.kind === 'context-usage' && entry.usage.source === 'api');
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
                reason: checkpoint.reason,
                label: checkpoint.label,
                restoredAt: checkpoint.restoredAt,
            })),
            contextUsage: latestUsageEntry?.usage,
            lastCompaction: compactionState.lastCompaction || undefined,
            totalCompactions: compactionState.totalCompactions,
            workflowId: workflowContext?.id,
            workflowLabel: workflowContext?.name || workflowContext?.id || workflowContext?.filename || 'New workflow chat',
            workflowContext,
            nodeContexts,
        };
    }

    private withWorkflowContext(entries: AgentTimelineEntry[], workflow: AgentWorkflowContext): AgentTimelineEntry[] {
        const name = workflow.name?.trim() || workflow.id || workflow.filename || 'Workflow';
        return [
            ...entries,
            {
                kind: 'workflow-context',
                id: randomUUID(),
                timestamp: Date.now(),
                action: 'set',
                workflow: {
                    id: workflow.id?.trim() || undefined,
                    name,
                    filename: workflow.filename?.trim() || undefined,
                    filePath: workflow.filePath?.trim() || undefined,
                },
            },
        ];
    }

    private getLatestWorkflowContext(entries: AgentTimelineEntry[], record?: DeepAgentSessionRecord): AgentWorkflowContext | undefined {
        for (let idx = entries.length - 1; idx >= 0; idx -= 1) {
            const entry = entries[idx];
            if (entry.kind !== 'workflow-context') continue;
            if (entry.action === 'clear') return undefined;
            return entry.workflow;
        }
        const workflowId = record?.scope?.kind === 'vscode-workflow' && record.scope.key !== UNATTACHED_WORKFLOW_SCOPE_KEY
            ? record.scope.key
            : undefined;
        return workflowId ? { id: workflowId, name: workflowId } : undefined;
    }

    private workflowContextsMatch(left: AgentWorkflowContext, right: AgentWorkflowContext): boolean {
        if (left.id && right.id && left.id === right.id) return true;
        if (left.filename && right.filename && left.filename === right.filename) return true;
        return Boolean(left.name && right.name && left.name === right.name);
    }

    private getLatestNodeContexts(entries: AgentTimelineEntry[]): AgentNodeContext[] {
        for (let idx = entries.length - 1; idx >= 0; idx -= 1) {
            const entry = entries[idx];
            if (entry.kind !== 'node-context') continue;
            return this.normalizeNodeContexts(entry.nodes);
        }
        return [];
    }

    private normalizeNodeContexts(value: AgentNodeContext | AgentNodeContext[] | undefined): AgentNodeContext[] {
        const values = Array.isArray(value) ? value : value ? [value] : [];
        const seen = new Set<string>();
        const result: AgentNodeContext[] = [];
        for (const candidate of values) {
            const name = typeof candidate?.name === 'string' ? candidate.name.trim() : '';
            if (!name) continue;
            const type = typeof candidate.type === 'string' ? candidate.type.trim() : '';
            const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
            const key = [name, type, id].join('|');
            if (seen.has(key)) continue;
            seen.add(key);
            result.push({ name, type: type || undefined, id: id || undefined });
        }
        return result;
    }

    private async inferWorkflowContextFromWorkspace(workspaceRoot?: string): Promise<AgentWorkflowContext | undefined> {
        if (!workspaceRoot) return undefined;
        const candidates = await this.listWorkflowSourceCandidates(workspaceRoot);
        candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
        for (const candidate of candidates.slice(0, 12)) {
            const context = await this.readWorkflowContextFromTypeScriptFile(candidate.filePath, workspaceRoot);
            if (context) return context;
        }
        return undefined;
    }

    private async listWorkflowSourceCandidates(workspaceRoot: string): Promise<Array<{ filePath: string; mtimeMs: number }>> {
        const results: Array<{ filePath: string; mtimeMs: number }> = [];
        await this.collectWorkflowSourceCandidates(workspaceRoot, results, workspaceRoot, 0);
        return results;
    }

    private async collectWorkflowSourceCandidates(
        directory: string,
        results: Array<{ filePath: string; mtimeMs: number }>,
        workspaceRoot: string,
        depth: number,
    ): Promise<void> {
        if (depth > 4) return;
        const relative = path.relative(workspaceRoot, directory).replace(/\\/g, '/');
        if (relative && /(^|\/)(node_modules|dist|out|\.git|\.kilo|\.yagr)(\/|$)/.test(relative)) {
            return;
        }
        let entries: fs.Dirent[];
        try {
            entries = await fs.promises.readdir(directory, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const filePath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                await this.collectWorkflowSourceCandidates(filePath, results, workspaceRoot, depth + 1);
                continue;
            }
            if (!entry.isFile() || !entry.name.endsWith('.workflow.ts')) continue;
            const stat = await fs.promises.stat(filePath).catch(() => undefined);
            if (stat?.isFile()) results.push({ filePath, mtimeMs: stat.mtimeMs });
        }
    }

    private async readWorkflowContextFromTypeScriptFile(filePath: string, workspaceRoot: string): Promise<AgentWorkflowContext | undefined> {
        try {
            const raw = await fs.promises.readFile(filePath, 'utf8');
            const metadata = this.extractWorkflowDecoratorMetadata(raw);
            const filename = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
            return {
                id: metadata.id,
                name: metadata.name || path.basename(filePath, '.workflow.ts'),
                filename,
                filePath,
            };
        } catch {
            return undefined;
        }
    }

    private extractWorkflowDecoratorMetadata(source: string): { id?: string; name?: string } {
        const decoratorMatch = source.match(/@workflow\s*\(\s*\{([\s\S]*?)\}\s*\)/);
        const decoratorContent = decoratorMatch?.[1] || '';
        return {
            id: this.extractStringProperty(decoratorContent, 'id'),
            name: this.extractStringProperty(decoratorContent, 'name'),
        };
    }

    private extractStringProperty(source: string, property: string): string | undefined {
        const match = source.match(new RegExp(`${property}\\s*:\\s*(["'])((?:\\\\.|(?!\\1)[\\s\\S])*?)\\1`));
        return match?.[2]?.trim() || undefined;
    }

    private getEntryText(entry: AgentTimelineEntry): string {
        if (entry.kind === 'user-message' || entry.kind === 'system-notice' || entry.kind === 'assistant-body') {
            return entry.text;
        }
        if (entry.kind === 'workflow-context' || entry.kind === 'node-context') {
            return '';
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
            const streamingIndex = this.findLastAssistantBodyIndex(next, true);
            if (streamingIndex >= 0) {
                const entry = next[streamingIndex];
                if (entry.kind === 'assistant-body') {
                    entry.text += event.delta;
                }
                return next;
            }
            next.push({ kind: 'assistant-body', id: randomUUID(), text: event.delta, streaming: true });
            return next;
        }
        if (event.type === 'final') {
            const next = this.finalizePendingOperations([...entries], 'done');
            return this.consolidateFinalAssistant(next, event.response, event.finalState);
        }
        if (event.type === 'operation') {
            const next = [...entries];
            const existingIndex = this.findMatchingPendingOperationIndex(next, event.operationId, event.label, event.category);
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
            const next = [...entries];
            const existingIndex = this.findMatchingPendingOperationIndex(next, undefined, event.title, event.phase || 'phase');
            const progressEntry: AgentTimelineEntry = {
                kind: 'operation',
                id: existingIndex >= 0 ? next[existingIndex].id : randomUUID(),
                tone: event.tone,
                title: event.title,
                detail: event.detail,
                category: event.phase || 'phase',
                status: event.tone === 'error' ? 'error' : 'running',
            };
            if (existingIndex >= 0) {
                next[existingIndex] = progressEntry;
                return next;
            }
            return [
                ...next,
                progressEntry,
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
            const withoutPrevious = this.withoutContextUsage(entries);
            return [...withoutPrevious, usageEntry];
        }
        if (event.type === 'error') {
            return [...this.finalizePendingOperations(entries, 'error'), this.createSystemNotice(`Error: ${event.error}`)];
        }
        return entries;
    }

    private finalizePendingOperations(entries: AgentTimelineEntry[], status: 'done' | 'error'): AgentTimelineEntry[] {
        return entries.map((entry) => {
            if (entry.kind !== 'operation' || entry.status !== 'running') return entry;
            return {
                ...entry,
                tone: status === 'error' ? 'error' : 'success',
                status,
                endedAt: entry.endedAt || Date.now(),
            };
        });
    }

    private consolidateFinalAssistant(entries: AgentTimelineEntry[], response: string, finalState: string): AgentTimelineEntry[] {
        const userIndex = this.findLastUserMessageIndex(entries);
        const finalText = this.sanitizeAssistantText(response);
        let chosenText = finalText;
        let firstAssistantIndex = -1;

        for (let idx = userIndex + 1; idx < entries.length; idx += 1) {
            const entry = entries[idx];
            if (entry.kind !== 'assistant-body') continue;
            const text = this.sanitizeAssistantText(entry.text);
            if (text && firstAssistantIndex < 0) {
                firstAssistantIndex = idx;
            }
            if (text && finalText.includes(text) && text.length >= Math.max(80, finalText.length * 0.6)) {
                chosenText = text;
            }
        }

        const result: AgentTimelineEntry[] = [];
        let inserted = false;
        for (let idx = 0; idx < entries.length; idx += 1) {
            const entry = entries[idx];
            if (idx > userIndex && entry.kind === 'assistant-body') {
                if (!inserted && chosenText && idx === firstAssistantIndex) {
                    result.push({ kind: 'assistant-body', id: entry.id || randomUUID(), text: chosenText, streaming: false, finalState });
                    inserted = true;
                }
                continue;
            }
            result.push(entry);
        }
        if (!inserted && chosenText) {
            result.push({ kind: 'assistant-body', id: randomUUID(), text: chosenText, streaming: false, finalState });
        }
        return result;
    }

    private findLastUserMessageIndex(entries: AgentTimelineEntry[]): number {
        for (let idx = entries.length - 1; idx >= 0; idx -= 1) {
            if (entries[idx].kind === 'user-message') return idx;
        }
        return -1;
    }

    private findLastAssistantBodyIndex(entries: AgentTimelineEntry[], streamingOnly: boolean): number {
        for (let idx = entries.length - 1; idx >= 0; idx -= 1) {
            const entry = entries[idx];
            if (entry.kind !== 'assistant-body') continue;
            if (streamingOnly && !entry.streaming) continue;
            return idx;
        }
        return -1;
    }

    private findMatchingPendingOperationIndex(entries: AgentTimelineEntry[], operationId: string | undefined, title: string, category: string): number {
        if (operationId) {
            const exactIndex = entries.findIndex((entry) => entry.kind === 'operation' && entry.id === operationId);
            if (exactIndex >= 0) {
                return exactIndex;
            }
        }

        const targetKind = this.normalizeOperationKind(category, title);
        for (let idx = entries.length - 1; idx >= 0; idx -= 1) {
            const entry = entries[idx];
            if (entry.kind !== 'operation') continue;
            if (entry.status !== 'running') continue;

            const entryKind = this.normalizeOperationKind(entry.category, entry.title);
            if (entryKind && targetKind && entryKind === targetKind) {
                return idx;
            }

            if (entry.title !== title) continue;

            const entryCategory = String(entry.category || '').toLowerCase();
            const targetCategory = String(category || '').toLowerCase();
            if (entryCategory && targetCategory && entryCategory !== targetCategory && entryCategory !== 'phase') continue;

            return idx;
        }

        return -1;
    }

    private normalizeOperationKind(category: string | undefined, title: string | undefined): string {
        const value = String(category || title || '').toLowerCase().replace(/_/g, '-');
        if (value === 'read-file' || value === 'file-read' || value === 'read') return 'file-read';
        if (value === 'write-file' || value === 'file-write' || value === 'write') return 'file-write';
        if (value.includes('shell')) return 'shell';
        if (value.includes('web')) return 'web';
        return value;
    }

    private createSystemNotice(text: string): AgentTimelineEntry {
        return { kind: 'system-notice', id: randomUUID(), text, timestamp: Date.now() };
    }

    private withoutContextUsage(entries: AgentTimelineEntry[]): AgentTimelineEntry[] {
        return entries.filter((entry) => entry.kind !== 'context-usage');
    }

    private buildCheckpointSurfacePayload(
        service: SessionServiceHandle,
        sessionId: string,
        entriesOverride?: AgentTimelineEntry[],
    ): AgentWorkbenchCheckpointSurfacePayload {
        const displaySession = service.readDisplaySession(sessionId);
        const record = service.get(sessionId);
        const displayThread = this.normalizeEntries(entriesOverride || displaySession?.displayThread);
        const selectedWorkflow = this.getLatestWorkflowContext(displayThread, record);
        const selectedNodes = selectedWorkflow ? this.getLatestNodeContexts(displayThread) : [];
        return {
            version: 1,
            displayThread,
            contextMarkers: displayThread.filter((entry) => entry.kind === 'workflow-context' || entry.kind === 'node-context'),
            selectedWorkflow,
            selectedNodes,
            title: displaySession?.title || record?.title || this.getDefaultSessionTitle(),
            scope: record?.scope,
        };
    }

    private buildCheckpointSummary(surface: AgentWorkbenchCheckpointSurfacePayload): string {
        if (surface.selectedWorkflow && surface.selectedNodes.length) {
            return `Workbench checkpoint for ${surface.selectedWorkflow.name} with ${surface.selectedNodes.length} selected node${surface.selectedNodes.length === 1 ? '' : 's'}`;
        }
        if (surface.selectedWorkflow) {
            return `Workbench checkpoint for ${surface.selectedWorkflow.name}`;
        }
        return 'Workbench checkpoint';
    }

    private async saveYagrCheckpoint(
        service: SessionServiceHandle,
        sessionId: string,
        options: SaveCheckpointOptions,
    ): Promise<SessionCheckpointMetadata> {
        return service.saveCheckpoint(sessionId, this.withLegacyCheckpointPayload(options));
    }

    private async maybeSaveYagrCheckpoint(
        service: SessionServiceHandle,
        sessionId: string,
        reason: CheckpointReason,
        options: Omit<SaveCheckpointOptions, 'reason'>,
    ): Promise<SessionCheckpointMetadata | undefined> {
        if (typeof service.maybeSaveCheckpoint !== 'function') {
            return undefined;
        }
        return service.maybeSaveCheckpoint(sessionId, reason, this.withLegacyCheckpointPayload(options));
    }

    private withLegacyCheckpointPayload<T extends SaveCheckpointOptions>(options: T): T {
        if (!options.payloads || options.payloadState !== undefined) {
            return options;
        }
        return {
            ...options,
            payloadState: { payloads: options.payloads },
        };
    }

    private extractCheckpointPayloads(result: RestoreCheckpointResult): Record<string, unknown> {
        if (this.isRecord(result.payloads)) {
            return result.payloads;
        }
        const payloadState = result.payloadState;
        if (this.isRecord(payloadState)) {
            if (this.isRecord(payloadState.payloads)) {
                return payloadState.payloads;
            }
            if (this.isRecord(payloadState.surface) || this.isRecord(payloadState.compaction)) {
                return payloadState;
            }
        }
        if (this.isCompactionState(payloadState)) {
            return { compaction: payloadState };
        }
        return {};
    }

    private isWorkbenchSurfacePayload(value: unknown): value is AgentWorkbenchCheckpointSurfacePayload {
        if (!this.isRecord(value)) return false;
        if (value.version !== 1) return false;
        if (!Array.isArray(value.displayThread)) return false;
        if (typeof value.title !== 'string') return false;
        return true;
    }

    private isRecord(value: unknown): value is Record<string, unknown> {
        return Boolean(value && typeof value === 'object' && !Array.isArray(value));
    }

    private toCompactionSummary(value: unknown): AgentCompactionSummary | undefined {
        if (!value || typeof value !== 'object') return undefined;
        const event = value as Record<string, unknown>;
        const summary = typeof event.summary === 'string' && event.summary.trim()
            ? event.summary.trim()
            : 'Context compacted';
        return {
            summary,
            source: event.source === 'fallback' ? 'fallback' : 'llm',
            messagesCompacted: this.numberOrZero(event.messagesCompacted),
            preservedRecentMessages: this.numberOrZero(event.preservedRecentMessages),
            estimatedTokens: this.optionalNumber(event.estimatedTokens),
            thresholdTokens: this.optionalNumber(event.thresholdTokens),
            fallbackReason: typeof event.fallbackReason === 'string' && event.fallbackReason.trim()
                ? event.fallbackReason.trim()
                : undefined,
        };
    }

    private numberOrZero(value: unknown): number {
        const number = typeof value === 'number' ? value : Number(value || 0);
        return Number.isFinite(number) ? number : 0;
    }

    private optionalNumber(value: unknown): number | undefined {
        const number = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(number) ? number : undefined;
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
