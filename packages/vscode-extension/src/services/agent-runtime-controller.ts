import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { WorkspaceSnapshotService } from './workspace-snapshot-service.js';

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
const INVALID_TOOL_CALL_RECOVERY_MARKER = 'N8N_INVALID_TOOL_CALL_RECOVERY';

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

export interface AgentMessageCheckpointLink {
    runtimeCheckpointId?: string;
    workspaceSnapshotId?: string;
    workbenchCheckpointId: string;
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
    | { kind: 'user-message'; id: string; text: string; timestamp: number; checkpoint?: AgentMessageCheckpointLink }
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
    | { type: 'final'; sessionId: string; response: string; finalState: string; runtimeFinalizing?: boolean }
    | { type: 'error'; error: string };

type AgentContextUsageEvent = { type: 'context-usage'; promptTokens: number; completionTokens: number; contextWindowTokens: number; fillPercent: number; source: 'api' | 'estimated' };

export type AgentWorkbenchMessage =
    | { type: 'agent.status'; status: 'idle' | 'running' | 'stopping'; detail?: string }
    | { type: 'agent.state'; state: AgentWorkbenchState; stateSequence?: number }
    | { type: 'agent.streamEvent'; event: AgentStreamEvent }
    | { type: 'agent.messageRewind'; prompt: string }
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
    restoredRuntimeCheckpointId?: string;
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
    runtimeCheckpointId?: string;
};

type CheckpointReason = 'manual' | 'auto' | 'before-tool' | 'after-tool' | 'before-compaction' | 'after-compaction';

type SaveCheckpointOptions = {
    reason?: CheckpointReason;
    label?: string;
    summary?: string;
    runtimeCheckpointId?: string;
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
    resetRuntimeThread(sessionId: string): Promise<void>;
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
    flushPendingWrites?(): Promise<void>;
};

type SessionRuntime = {
    service: SessionServiceHandle;
    deriveSessionTitle: (text: string, fallback?: string) => string;
};

type DeepAgentHandle = {
    agent: any;
    checkpointer: unknown;
};

type RuntimeCheckpointer = {
    getTuple?: (config: Record<string, unknown>) => Promise<{ checkpoint?: { id?: string }; config?: { configurable?: Record<string, unknown> } } | undefined>;
    list?: (config: Record<string, unknown>, options?: { limit?: number }) => AsyncIterable<{ checkpoint?: { id?: string }; config?: { configurable?: Record<string, unknown> } }>;
    put?: (config: Record<string, unknown>, checkpoint: Record<string, unknown>, metadata: Record<string, unknown>) => Promise<Record<string, unknown>>;
    putWrites?: (config: Record<string, unknown>, writes: [string, unknown][], taskId: string) => Promise<void>;
    getNextVersion?: (current: unknown) => unknown;
    deleteThread?: (threadId: string) => Promise<void>;
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

type AgentProviderRegistryModule = {
    YAGR_MODEL_PROVIDERS: string[];
    normalizeProviderId(provider: string): string | undefined;
    providerRequiresApiKey(provider: string): boolean;
    getProviderDisplayName(provider: string): string;
};

const YAGR_MODEL_PROVIDERS = Object.freeze([
    'anthropic',
    'openai',
    'google',
    'mistral',
    'openrouter',
    'openai-oauth',
    'copilot-proxy',
    'minimax',
    'minimax-token-plan',
    'openai-compatible',
]);

const YAGR_PROVIDER_DISPLAY_NAMES: Record<string, string> = {
    anthropic: 'Claude API',
    openai: 'OpenAI API',
    google: 'Gemini API',
    mistral: 'Mistral API',
    openrouter: 'OpenRouter API',
    'openai-oauth': 'OpenAI ChatGPT OAuth',
    'copilot-proxy': 'GitHub Copilot OAuth',
    minimax: 'MiniMax API',
    'minimax-token-plan': 'MiniMax Token Plan',
    'openai-compatible': 'OpenAI Compatible',
};

const YAGR_API_KEY_PROVIDERS = new Set(['anthropic', 'openai', 'google', 'mistral', 'openrouter', 'minimax', 'minimax-token-plan']);

function normalizeAgentProviderId(provider: string | undefined): string | undefined {
    const normalized = provider?.trim().toLowerCase();
    if (!normalized) return undefined;
    if (normalized === 'claude') return 'anthropic';
    if (normalized === 'anthropic-proxy') return 'anthropic';
    if (normalized === 'gemini') return 'google';
    return YAGR_MODEL_PROVIDERS.includes(normalized) ? normalized : undefined;
}

const LOCAL_AGENT_PROVIDER_REGISTRY: AgentProviderRegistryModule = {
    YAGR_MODEL_PROVIDERS: [...YAGR_MODEL_PROVIDERS],
    normalizeProviderId: normalizeAgentProviderId,
    providerRequiresApiKey: (provider: string) => YAGR_API_KEY_PROVIDERS.has(provider),
    getProviderDisplayName: (provider: string) => YAGR_PROVIDER_DISPLAY_NAMES[provider] || provider,
};

type CompactionState = {
    lastCompaction: AgentCompactionSummary | null;
    compactionHistory: AgentCompactionSummary[];
    totalCompactions: number;
};

function importRuntimeModule<T = any>(specifier: string): Promise<T> {
    return import(specifier) as Promise<T>;
}

class WorkbenchSessionService implements SessionServiceHandle {
    private readonly recordsDir: string;
    private readonly displayDir: string;
    private readonly checkpointDir: string;
    private checkpointer: RuntimeCheckpointer | undefined;
    private pendingDisplayWrites = new Map<string, WebUiSession>();
    private pendingRecordWrites = new Map<string, DeepAgentSessionRecord>();
    private flushTimer: NodeJS.Timeout | undefined;
    private flushPromise: Promise<void> | undefined;

    constructor(private readonly sessionsRoot: string) {
        this.recordsDir = path.join(sessionsRoot, 'records');
        this.displayDir = path.join(sessionsRoot, 'display');
        this.checkpointDir = path.join(sessionsRoot, 'checkpoints');
        fs.mkdirSync(this.recordsDir, { recursive: true });
        fs.mkdirSync(this.displayDir, { recursive: true });
        fs.mkdirSync(this.checkpointDir, { recursive: true });
    }

    list(): SessionSummary[] {
        return this.readRecords()
            .map((record) => {
                const display = this.readDisplaySession(record.id);
                return {
                    id: record.id,
                    title: display?.title || record.title,
                    createdAt: record.createdAt,
                    updatedAt: record.updatedAt,
                    messageCount: Array.isArray(display?.displayThread) ? display.displayThread.length : 0,
                };
            })
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }

    get(id: string): DeepAgentSessionRecord | undefined {
        const pending = this.pendingRecordWrites.get(id);
        if (pending) return pending;
        return this.readJson<DeepAgentSessionRecord>(this.recordPath(id));
    }

    getOrCreateForScope(scope: DeepAgentSessionScope, options?: { title?: string }): DeepAgentSessionRecord {
        const active = this.getActiveForScope(scope);
        return active || this.create({ title: options?.title, scope });
    }

    rotateForScope(scope: DeepAgentSessionScope, options?: { title?: string }): DeepAgentSessionRecord {
        const now = new Date().toISOString();
        for (const record of this.listForScope(scope)) {
            this.writeRecord({ ...record, closedAt: record.closedAt || now, updatedAt: now });
        }
        return this.create({ title: options?.title, scope });
    }

    getActiveForScope(scope: DeepAgentSessionScope): DeepAgentSessionRecord | undefined {
        return this.listForScope(scope)
            .filter((record) => !record.closedAt)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    }

    listForScope(scope: DeepAgentSessionScope): DeepAgentSessionRecord[] {
        return this.readRecords().filter((record) => record.scope?.kind === scope.kind && record.scope?.key === scope.key);
    }

    ensure(sessionId: string, options?: { title?: string; scope?: DeepAgentSessionScope }): DeepAgentSessionRecord {
        const existing = this.get(sessionId);
        if (existing) return existing;
        return this.create({ id: sessionId, title: options?.title, scope: options?.scope });
    }

    touch(sessionId: string, options?: { title?: string; closed?: boolean }): DeepAgentSessionRecord | undefined {
        const record = this.get(sessionId);
        if (!record) return undefined;
        const next: DeepAgentSessionRecord = {
            ...record,
            updatedAt: new Date().toISOString(),
            ...(options?.title ? { title: options.title } : {}),
            ...(options?.closed ? { closedAt: new Date().toISOString() } : {}),
        };
        this.writeRecord(next);
        const display = this.readDisplaySession(sessionId);
        if (display && options?.title) {
            this.writeDisplaySession({ ...display, title: options.title, updatedAt: next.updatedAt });
        }
        return next;
    }

    async delete(id: string): Promise<void> {
        if (this.flushPromise) {
            await this.flushPromise;
        }
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = undefined;
        }
        this.pendingRecordWrites.delete(id);
        this.pendingDisplayWrites.delete(id);
        if (this.pendingRecordWrites.size || this.pendingDisplayWrites.size) {
            await this.flushPendingWritesNow();
        }
        fs.rmSync(this.recordPath(id), { force: true });
        fs.rmSync(this.displayPath(id), { force: true });
        fs.rmSync(this.sessionCheckpointDir(id), { recursive: true, force: true });
        await this.checkpointer?.deleteThread?.(id);
    }

    setCheckpointer(checkpointer: unknown): void {
        this.checkpointer = checkpointer as RuntimeCheckpointer;
    }

    async resetRuntimeThread(sessionId: string): Promise<void> {
        await this.checkpointer?.deleteThread?.(sessionId);
        const record = this.get(sessionId);
        if (record?.restoredRuntimeCheckpointId) {
            const { restoredRuntimeCheckpointId: _unused, ...next } = record;
            this.writeRecord({ ...next, updatedAt: new Date().toISOString() });
        }
    }

    buildSessionConfig(sessionId: string): Record<string, unknown> {
        const record = this.get(sessionId);
        const checkpointId = record?.restoredRuntimeCheckpointId;
        if (record && checkpointId) {
            const { restoredRuntimeCheckpointId: _unused, ...next } = record;
            this.writeRecord({ ...next, updatedAt: new Date().toISOString() });
        }
        return {
            configurable: {
                thread_id: sessionId,
                ...(checkpointId ? { checkpoint_id: checkpointId } : {}),
            },
        };
    }

    async listCheckpoints(sessionId: string): Promise<SessionCheckpointMetadata[]> {
        const dir = this.sessionCheckpointDir(sessionId);
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
            .filter((file) => file.endsWith('.json'))
            .map((file) => this.readJson<SessionCheckpointMetadata & { payloadState?: unknown }>(path.join(dir, file)))
            .filter((checkpoint): checkpoint is SessionCheckpointMetadata => Boolean(checkpoint))
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    }

    async saveCheckpoint(sessionId: string, options: SaveCheckpointOptions = {}): Promise<SessionCheckpointMetadata> {
        const createdAt = new Date().toISOString();
        const display = this.readDisplaySession(sessionId);
        const runtimeCheckpointId = await this.getLatestRuntimeCheckpointId(sessionId);
        const checkpoint: SessionCheckpointMetadata & { payloadState?: unknown } = {
            id: randomUUID(),
            sessionId,
            createdAt,
            messageCount: Array.isArray(display?.displayThread) ? display.displayThread.length : 0,
            summary: options.summary,
            reason: options.reason,
            label: options.label,
            runtimeCheckpointId: options.runtimeCheckpointId ?? runtimeCheckpointId,
            payloadState: options.payloadState ?? (options.payloads ? { payloads: options.payloads } : undefined),
        };
        fs.mkdirSync(this.sessionCheckpointDir(sessionId), { recursive: true });
        this.writeJson(this.checkpointPath(sessionId, checkpoint.id), checkpoint);
        return checkpoint;
    }

    async maybeSaveCheckpoint(sessionId: string, reason: CheckpointReason, options: Omit<SaveCheckpointOptions, 'reason'> = {}): Promise<SessionCheckpointMetadata | undefined> {
        if (reason !== 'manual' && reason !== 'auto' && reason !== 'after-tool' && reason !== 'after-compaction') {
            return undefined;
        }
        return this.saveCheckpoint(sessionId, { ...options, reason });
    }

    async restoreCheckpoint(sessionId: string, checkpointId: string): Promise<RestoreCheckpointResult> {
        const checkpoint = this.readJson<SessionCheckpointMetadata & { payloadState?: unknown }>(this.checkpointPath(sessionId, checkpointId));
        if (!checkpoint) {
            throw new Error(`Checkpoint not found: ${checkpointId}`);
        }
        const restoredAt = new Date().toISOString();
        const warnings: string[] = [];
        if (checkpoint.runtimeCheckpointId) {
            const record = this.ensure(sessionId);
            this.writeRecord({
                ...record,
                restoredRuntimeCheckpointId: checkpoint.runtimeCheckpointId,
                updatedAt: restoredAt,
            });
        } else {
            warnings.push('This checkpoint was created before a DeepAgentJS runtime checkpoint was available.');
        }
        this.writeJson(this.checkpointPath(sessionId, checkpointId), { ...checkpoint, restoredAt });
        return {
            sessionId,
            checkpointId,
            restoredAt,
            langGraphRestored: Boolean(checkpoint.runtimeCheckpointId),
            payloadState: checkpoint.payloadState,
            displayThreadRestored: false,
            warnings,
        };
    }

    async deleteCheckpoint(sessionId: string, checkpointId: string): Promise<void> {
        fs.rmSync(this.checkpointPath(sessionId, checkpointId), { force: true });
    }

    syncDisplayThread(sessionId: string, displayThread: unknown[]): void {
        const record = this.ensure(sessionId);
        const now = new Date().toISOString();
        const displaySession = {
            id: sessionId,
            title: record.title,
            createdAt: record.createdAt,
            updatedAt: now,
            displayThread,
        };
        const nextRecord = { ...record, updatedAt: now };
        this.pendingDisplayWrites.set(sessionId, displaySession);
        this.pendingRecordWrites.set(sessionId, nextRecord);
        this.scheduleFlush();
    }

    clearDisplayThread(sessionId: string): void {
        const display = this.readDisplaySession(sessionId);
        if (display) {
            this.pendingDisplayWrites.set(sessionId, { ...display, displayThread: [], updatedAt: new Date().toISOString() });
            this.scheduleFlush();
        }
    }

    setTitle(sessionId: string, title: string): void {
        const record = this.ensure(sessionId, { title });
        const now = new Date().toISOString();
        this.writeRecord({ ...record, title, updatedAt: now });
        const display = this.readDisplaySession(sessionId);
        if (display) {
            this.pendingDisplayWrites.set(sessionId, { ...display, title, updatedAt: now });
            this.scheduleFlush();
        }
    }

    readDisplaySession(sessionId: string | undefined): WebUiSession | undefined {
        if (!this.isNonEmptyString(sessionId)) return undefined;
        const pending = this.pendingDisplayWrites.get(sessionId);
        if (pending) return pending;
        return this.readJson<WebUiSession>(this.displayPath(sessionId));
    }

    async flushPendingWrites(): Promise<void> {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = undefined;
        }
        await this.flushPendingWritesNow();
    }

    private create(options: { id?: string; title?: string; scope?: DeepAgentSessionScope } = {}): DeepAgentSessionRecord {
        const now = new Date().toISOString();
        const record: DeepAgentSessionRecord = {
            id: options.id || randomUUID(),
            title: options.title || 'New conversation',
            createdAt: now,
            updatedAt: now,
            scope: options.scope,
        };
        this.writeRecord(record);
        this.writeDisplaySession({ id: record.id, title: record.title, createdAt: now, updatedAt: now, displayThread: [] });
        return record;
    }

    private readRecords(): DeepAgentSessionRecord[] {
        if (!fs.existsSync(this.recordsDir)) return [];
        return fs.readdirSync(this.recordsDir)
            .filter((file) => file.endsWith('.json') && !file.startsWith('.'))
            .map((file) => this.readJson<DeepAgentSessionRecord>(path.join(this.recordsDir, file)))
            .map((record) => this.normalizeSessionRecord(record))
            .filter((record): record is DeepAgentSessionRecord => Boolean(record));
    }

    private normalizeSessionRecord(record: unknown): DeepAgentSessionRecord | undefined {
        if (!record || typeof record !== 'object') return undefined;
        const raw = record as Partial<DeepAgentSessionRecord>;
        if (!this.isNonEmptyString(raw.id)) return undefined;
        const now = new Date().toISOString();
        return {
            id: raw.id,
            title: this.isNonEmptyString(raw.title) ? raw.title : 'New conversation',
            createdAt: this.isNonEmptyString(raw.createdAt) ? raw.createdAt : now,
            updatedAt: this.isNonEmptyString(raw.updatedAt) ? raw.updatedAt : this.isNonEmptyString(raw.createdAt) ? raw.createdAt : now,
            scope: raw.scope,
            closedAt: raw.closedAt,
            restoredRuntimeCheckpointId: raw.restoredRuntimeCheckpointId,
        };
    }

    private writeRecord(record: DeepAgentSessionRecord): void {
        this.writeJson(this.recordPath(record.id), record);
    }

    private async getLatestRuntimeCheckpointId(sessionId: string): Promise<string | undefined> {
        const config = { configurable: { thread_id: sessionId } };
        const tuple = await this.checkpointer?.getTuple?.(config).catch(() => undefined);
        const tupleCheckpointId = tuple?.checkpoint?.id || tuple?.config?.configurable?.checkpoint_id;
        if (typeof tupleCheckpointId === 'string' && tupleCheckpointId) return tupleCheckpointId;

        const iterator = this.checkpointer?.list?.(config, { limit: 1 });
        if (!iterator) return undefined;
        try {
            for await (const checkpoint of iterator) {
                const checkpointId = checkpoint.checkpoint?.id || checkpoint.config?.configurable?.checkpoint_id;
                if (typeof checkpointId === 'string' && checkpointId) return checkpointId;
                break;
            }
        } catch {
            return undefined;
        }
        return undefined;
    }

    private writeDisplaySession(session: WebUiSession): void {
        this.writeJson(this.displayPath(session.id), session);
    }

    private scheduleFlush(): void {
        if (this.flushTimer) return;
        this.flushTimer = setTimeout(() => {
            this.flushTimer = undefined;
            void this.flushPendingWritesNow();
        }, 150);
    }

    private async flushPendingWritesNow(): Promise<void> {
        if (this.flushPromise) return this.flushPromise;
        this.flushPromise = (async () => {
            const displayWrites = [...this.pendingDisplayWrites.values()];
            const recordWrites = [...this.pendingRecordWrites.values()];
            this.pendingDisplayWrites.clear();
            this.pendingRecordWrites.clear();
            await Promise.all([
                ...displayWrites.map((session) => this.writeJsonAsync(this.displayPath(session.id), session)),
                ...recordWrites.map((record) => this.writeJsonAsync(this.recordPath(record.id), record)),
            ]);
        })().finally(() => {
            this.flushPromise = undefined;
            if (this.pendingDisplayWrites.size || this.pendingRecordWrites.size) {
                this.scheduleFlush();
            }
        });
        return this.flushPromise;
    }

    private recordPath(id: string): string {
        return path.join(this.recordsDir, `${this.safeId(id)}.json`);
    }

    private displayPath(id: string): string {
        return path.join(this.displayDir, `${this.safeId(id)}.json`);
    }

    private sessionCheckpointDir(sessionId: string): string {
        return path.join(this.checkpointDir, this.safeId(sessionId));
    }

    private checkpointPath(sessionId: string, checkpointId: string): string {
        return path.join(this.sessionCheckpointDir(sessionId), `${this.safeId(checkpointId)}.json`);
    }

    private safeId(value: string): string {
        return value.replace(/[^a-zA-Z0-9._-]/g, '_');
    }

    private isNonEmptyString(value: unknown): value is string {
        return typeof value === 'string' && value.length > 0;
    }

    private readJson<T>(filePath: string): T | undefined {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
        } catch {
            return undefined;
        }
    }

    private writeJson(filePath: string, value: unknown): void {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
    }

    private async writeJsonAsync(filePath: string, value: unknown): Promise<void> {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    }
}

export class AgentRuntimeController implements vscode.Disposable {
    private readonly activeRuns = new Map<string, { abortController: AbortController; sessionId: string; abortReason?: 'stop' | 'steer'; visibleDone?: boolean; runStartedAt?: number; visibleFinalAt?: number }>();
    private readonly stoppedRuns = new WeakSet<AbortController>();
    private readonly queuedPrompts = new Map<string, { input: AgentPromptInput; reason: 'pending' | 'steer' }>();
    private cachedAgentHandle: { key: string; handle: any } | undefined;
    private sessionRuntimePromise: Promise<SessionRuntime> | undefined;
    private checkpointerPromise: Promise<RuntimeCheckpointer> | undefined;
    private readonly workspaceSnapshots: WorkspaceSnapshotService;

    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly outputChannel: vscode.OutputChannel,
    ) {
        this.workspaceSnapshots = new WorkspaceSnapshotService(_context.globalStorageUri.fsPath, (message) => {
            outputChannel.appendLine(message);
        });
    }

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
            isRunning: this.activeRuns.has(activeRecord.id),
        };
    }

    async createSession(input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        const workflow = this.getInputWorkflowContext(input);
        const scope = workflow ? this.getSessionScope(input) : this.getUnattachedSessionScope();
        const sessions = await this.getSessionRuntime();
        const record = sessions.service.rotateForScope(scope, {
            title: this.getDefaultSessionTitle(workflow?.name),
        });
        if (workflow) {
            this.writeSessionEntries(sessions.service, record.id, this.withWorkflowContext([], workflow));
            return this.getWorkbenchState({ ...input, sessionId: record.id, nodeContext: undefined, nodeContexts: undefined });
        }
        return this.getWorkbenchState({ ...input, workflowId: undefined, workflowName: undefined, workflowFilename: undefined, workflowFilePath: undefined, nodeContext: undefined, nodeContexts: undefined, sessionId: record.id });
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

    async attachSessionToWorkflowIfUnattached(sessionId: string | undefined, workflow: AgentWorkflowContext, input: Omit<AgentPromptInput, 'prompt'>): Promise<string | undefined> {
        if (!sessionId) return undefined;
        const sessions = await this.getSessionRuntime();
        const record = sessions.service.get(sessionId);
        if (!record) return undefined;
        const entries = this.readSessionEntries(sessions.service, sessionId);
        if (!entries.some((entry) => entry.kind === 'user-message' || entry.kind === 'assistant-body' || entry.kind === 'operation')) return undefined;
        const existingContext = this.getLatestWorkflowContext(entries, record);
        if (existingContext) return undefined;
        const name = workflow.name?.trim() || workflow.id || workflow.filename || 'Workflow';
        this.writeSessionEntries(sessions.service, sessionId, this.withWorkflowContext(entries, { ...workflow, name }));
        sessions.service.touch(sessionId, { title: record.title === 'New conversation' ? this.getDefaultSessionTitle(name) : record.title });
        await this.getWorkbenchState({ ...input, sessionId });
        return sessionId;
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
        const deletedSelectedSession = input.sessionId === sessionId;
        await sessions.service.delete(sessionId);
        if (active === sessionId) {
            sessions.service.getOrCreateForScope(scope, { title: this.getDefaultSessionTitle(input.workflowName) });
        }
        return this.getWorkbenchState(deletedSelectedSession ? { ...input, sessionId: undefined } : input);
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
        const surface = this.buildCheckpointSurfacePayload(sessions.service, sessionId);
        const label = surface.selectedWorkflow ? 'Before workflow edit' : 'Manual checkpoint';
        await this.saveWorkbenchCheckpoint(sessions.service, sessionId, {
            reason: 'manual',
            label,
            summary: this.buildCheckpointSummary(surface),
            payloads: {
                surface,
            },
        });
        const entries = this.readSessionEntries(sessions.service, sessionId);
        this.writeSessionEntries(sessions.service, sessionId, [
            ...entries,
            this.createSystemNotice(`Checkpoint saved: ${label}.`),
        ]);
        return this.getWorkbenchState({ ...input, sessionId });
    }

    async rewindToUserMessage(sessionId: string, messageId: string, input: Omit<AgentPromptInput, 'prompt'>): Promise<{ state: AgentWorkbenchState; prompt: string }> {
        if (this.activeRuns.has(sessionId)) {
            throw new Error('An agent run is already active for this conversation.');
        }
        const sessions = await this.getSessionRuntime();
        const entries = this.readSessionEntries(sessions.service, sessionId);
        const targetIndex = entries.findIndex((entry) => entry.kind === 'user-message' && entry.id === messageId);
        const target = targetIndex >= 0 ? entries[targetIndex] : undefined;
        if (!target || target.kind !== 'user-message') {
            throw new Error('Cannot rewind: user message not found.');
        }
        const checkpointId = target.checkpoint?.workbenchCheckpointId;
        if (!checkpointId) {
            throw new Error('Cannot rewind: this message does not have a checkpoint.');
        }

        const result = await sessions.service.restoreCheckpoint(sessionId, checkpointId);
        await this.workspaceSnapshots.restore(input.workspaceRoot, target.checkpoint?.workspaceSnapshotId);
        const payloads = this.extractCheckpointPayloads(result);
        const surface = payloads.surface;
        if (this.isWorkbenchSurfacePayload(surface)) {
            const title = surface.title.trim() || sessions.service.get(sessionId)?.title || this.getDefaultSessionTitle(input.workflowName);
            sessions.service.touch(sessionId, { title });
            sessions.service.setTitle(sessionId, title);
            this.writeSessionEntries(sessions.service, sessionId, this.normalizeEntries(surface.displayThread));
        } else {
            this.writeSessionEntries(sessions.service, sessionId, entries.slice(0, targetIndex));
        }
        if (!result.langGraphRestored) {
            await sessions.service.resetRuntimeThread(sessionId);
        }

        return {
            state: await this.getWorkbenchState({ ...input, sessionId }),
            prompt: target.text,
        };
    }

    async restoreCheckpoint(sessionId: string, checkpointId: string, input: Omit<AgentPromptInput, 'prompt'>): Promise<AgentWorkbenchState> {
        if (this.activeRuns.has(sessionId)) {
            throw new Error('An agent run is already active for this conversation.');
        }
        const sessions = await this.getSessionRuntime();
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
        if (this.activeRuns.has(sessionId)) {
            throw new Error('An agent run is already active for this conversation.');
        }
        const sessions = await this.getSessionRuntime();

        const abortController = new AbortController();
        this.activeRuns.set(sessionId, { abortController, sessionId });
        try {
            let entries = this.readSessionEntries(sessions.service, sessionId);
            const event = await this.summarizeSessionForCompaction(sessionId, input, entries, abortController.signal);
            this.writeSessionEntries(sessions.service, sessionId, [
                ...this.withoutContextUsage(entries),
                { kind: 'compaction', id: randomUUID(), timestamp: Date.now(), event },
            ]);
            await sessions.service.resetRuntimeThread(sessionId);
            await this.saveWorkbenchCheckpoint(sessions.service, sessionId, {
                reason: 'after-compaction',
                label: 'After context compaction',
                summary: 'Workbench checkpoint after context compaction',
                payloads: {
                    surface: this.buildCheckpointSurfacePayload(sessions.service, sessionId),
                },
            }).catch((error: any) => {
                this.outputChannel.appendLine(`[n8n-agent] Manual compaction checkpoint failed: ${error?.message || String(error)}`);
            });
            return this.getWorkbenchState({ ...input, sessionId });
        } finally {
            const activeRun = this.activeRuns.get(sessionId);
            if (activeRun?.abortController === abortController) {
                this.activeRuns.delete(sessionId);
            }
        }
    }

    async sendPrompt(input: AgentPromptInput, postMessage: AgentWorkbenchPostMessage): Promise<AgentRunResult> {
        const sessions = await this.getSessionRuntime();
        const scope = this.getSessionScope(input);
        const activeRecord = input.sessionId
            ? sessions.service.ensure(input.sessionId, { title: this.getDefaultSessionTitle(input.workflowName) })
            : (sessions.service.getActiveForScope(scope) || sessions.service.getOrCreateForScope(scope, {
                title: this.getDefaultSessionTitle(input.workflowName),
            }));
        const targetSessionId = activeRecord.id;

        const activeRun = this.activeRuns.get(targetSessionId);
        if (activeRun) {
            if (activeRun.visibleDone) {
                const waitMs = activeRun.visibleFinalAt ? Date.now() - activeRun.visibleFinalAt : undefined;
                this.outputChannel.appendLine(`[n8n-agent-debug] prompt queued while DeepAgents finalizes sessionId=${targetSessionId} waitAfterVisibleMs=${waitMs ?? 'unknown'} reason=pending`);
                return this.queuePrompt(input, postMessage, 'pending');
            }
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

        const sessionContext = await this.buildSessionState(targetSessionId, input);
        const promptWorkflowContext = sessionContext.workflowContext;
        const promptNodeContexts = sessionContext.nodeContexts.length
            ? sessionContext.nodeContexts
            : this.normalizeNodeContexts(input.nodeContexts || input.nodeContext);
        const promptInput: AgentPromptInput = {
            ...input,
            sessionId: targetSessionId,
            workflowId: promptWorkflowContext?.id,
            workflowName: promptWorkflowContext?.name,
            workflowFilename: promptWorkflowContext?.filename,
            workflowFilePath: promptWorkflowContext?.filePath || input.workflowFilePath,
            nodeContext: promptNodeContexts[0],
            nodeContexts: promptNodeContexts,
        };

        const abortController = new AbortController();
        const nextActiveRun = { abortController, sessionId: targetSessionId, runStartedAt: Date.now() };
        this.activeRuns.set(targetSessionId, nextActiveRun);

        const derivedTitle = activeRecord.title === 'New conversation'
            ? sessions.deriveSessionTitle(prompt, this.getDefaultSessionTitle(input.workflowName))
            : activeRecord.title;
        sessions.service.touch(targetSessionId, { title: derivedTitle });
        sessions.service.setTitle(targetSessionId, derivedTitle);

        let entries = this.withoutContextUsage(this.readSessionEntries(sessions.service, targetSessionId));
        const beforeMessageCheckpoint = await this.saveBeforeUserMessageCheckpoint(sessions.service, targetSessionId, entries, prompt, input.workspaceRoot);
        entries = [...entries, {
            kind: 'user-message',
            id: randomUUID(),
            text: prompt,
            timestamp: Date.now(),
            checkpoint: {
                workbenchCheckpointId: beforeMessageCheckpoint.checkpoint.id,
                runtimeCheckpointId: beforeMessageCheckpoint.checkpoint.runtimeCheckpointId,
                workspaceSnapshotId: beforeMessageCheckpoint.workspaceSnapshotId,
            },
        }];
        this.writeSessionEntries(sessions.service, targetSessionId, entries);

        await postMessage({ type: 'agent.state', state: await this.getWorkbenchState({ ...input, sessionId: targetSessionId }) });
        await postMessage({ type: 'agent.status', status: 'running', detail: 'Preparing n8n agent runtime...' });
        await postMessage({ type: 'agent.streamEvent', event: { type: 'start', sessionId: targetSessionId, message: prompt } });

        let result: AgentRunResult = { workflowChanged: false };
        let queuedPrompt: { input: AgentPromptInput; reason: 'pending' | 'steer' } | undefined;
        let postedIdle = false;
        try {
            const runResult = await this.runInitialAgentTurn(promptInput, entries, postMessage, abortController.signal);
            entries = runResult.entries;
            this.writeSessionEntries(sessions.service, targetSessionId, entries);
            const currentActiveRun = this.activeRuns.get(targetSessionId);
            if (!this.queuedPrompts.has(targetSessionId) && currentActiveRun?.abortController === abortController) {
                this.activeRuns.delete(targetSessionId);
                this.outputChannel.appendLine(`[n8n-agent-debug] agent host idle sessionId=${targetSessionId}`);
                await postMessage({ type: 'agent.status', status: 'idle' });
                postedIdle = true;
            }
            if (runResult.workflowChanged && !promptWorkflowContext) {
                const inferredWorkflow = await this.inferWorkflowContextFromWorkspace(input.workspaceRoot);
                if (inferredWorkflow) {
                    entries = this.withWorkflowContext(entries, inferredWorkflow);
                    this.writeSessionEntries(sessions.service, targetSessionId, entries);
                }
            }
            await postMessage({ type: 'agent.state', state: await this.getWorkbenchState({ ...input, sessionId: targetSessionId }) });
            await postMessage({ type: 'agent.done' });
            this.outputChannel.appendLine(`[n8n-agent-debug] agent host done sessionId=${targetSessionId} queuedPrompt=${String(Boolean(this.queuedPrompts.has(targetSessionId)))}`);
            result = { workflowChanged: runResult.workflowChanged };
        } catch (error: any) {
            const message = error?.message || String(error);
            const currentActiveRun = this.activeRuns.get(targetSessionId);
            if (this.stoppedRuns.has(abortController)) {
                this.outputChannel.appendLine(`[n8n-agent-debug] agent runtime stopped sessionId=${targetSessionId}`);
                this.appendRunStoppedNotice(sessions.service, targetSessionId);
                this.queuedPrompts.delete(targetSessionId);
                result = { workflowChanged: false };
            } else if (currentActiveRun?.abortController === abortController && currentActiveRun.abortReason === 'steer') {
                this.outputChannel.appendLine(`[n8n-agent-debug] agent runtime steered sessionId=${targetSessionId}`);
                const latestEntries = this.withoutContextUsage(this.readSessionEntries(sessions.service, targetSessionId));
                this.writeSessionEntries(sessions.service, targetSessionId, [
                    ...this.finalizePendingOperations(latestEntries, 'done'),
                    this.createSystemNotice('Run steered by a newer message.'),
                ]);
                await postMessage({ type: 'agent.state', state: await this.getWorkbenchState({ ...input, sessionId: targetSessionId }) });
                result = { workflowChanged: false };
            } else {
                this.outputChannel.appendLine(`[n8n-agent] Run failed: ${message}`);
                const latestEntries = this.withoutContextUsage(this.readSessionEntries(sessions.service, targetSessionId));
                const failedEntries = [
                    ...this.finalizePendingOperations(latestEntries, 'error'),
                    this.createSystemNotice(`Run failed: ${message}`),
                ];
                this.writeSessionEntries(sessions.service, targetSessionId, failedEntries);
                await postMessage({ type: 'agent.streamEvent', event: { type: 'error', error: message } });
                await postMessage({ type: 'agent.error', message });
                await postMessage({ type: 'agent.state', state: await this.getWorkbenchState({ ...input, sessionId: targetSessionId }) });
                result = { workflowChanged: false };
            }
        } finally {
            const currentActiveRun = this.activeRuns.get(targetSessionId);
            if (currentActiveRun?.abortController === abortController) {
                this.activeRuns.delete(targetSessionId);
            }
            queuedPrompt = this.queuedPrompts.get(targetSessionId);
            if (queuedPrompt) {
                this.queuedPrompts.delete(targetSessionId);
            } else if (!postedIdle) {
                await postMessage({ type: 'agent.status', status: 'idle' });
            }
        }
        if (queuedPrompt) {
            const queuedResult = await this.sendPrompt(queuedPrompt.input, postMessage);
            return { workflowChanged: result.workflowChanged || queuedResult.workflowChanged };
        }
        return result;
    }

    async queuePrompt(input: AgentPromptInput, postMessage: AgentWorkbenchPostMessage, reason: 'pending' | 'steer' = 'pending'): Promise<AgentRunResult> {
        const prompt = input.prompt.trim();
        if (!prompt) {
            return { workflowChanged: false };
        }
        const targetSessionId = input.sessionId;
        if (!targetSessionId) {
            return this.sendPrompt(input, postMessage);
        }
        const activeRun = this.activeRuns.get(targetSessionId);
        if (!activeRun) {
            return this.sendPrompt(input, postMessage);
        }
        this.queuedPrompts.set(targetSessionId, { input: { ...input, prompt }, reason });
        const waitMs = activeRun.visibleFinalAt ? Date.now() - activeRun.visibleFinalAt : undefined;
        this.outputChannel.appendLine(`[n8n-agent-debug] queuePrompt accepted sessionId=${targetSessionId} reason=${reason} visibleDone=${String(Boolean(activeRun.visibleDone))} waitAfterVisibleMs=${waitMs ?? 'unknown'}`);
        if (reason === 'steer') {
            activeRun.abortReason = 'steer';
            await postMessage({ type: 'agent.status', status: 'stopping', detail: 'Steering current run...' });
            activeRun.abortController.abort();
        }
        return { workflowChanged: false };
    }

    async stop(postMessage: AgentWorkbenchPostMessage, sessionId?: string): Promise<void> {
        let activeRun;
        if (sessionId) {
            activeRun = this.activeRuns.get(sessionId);
        } else {
            activeRun = this.activeRuns.values().next().value;
        }
        if (!activeRun) {
            await postMessage({ type: 'agent.status', status: 'idle' });
            return;
        }
        const runSessionId = activeRun.sessionId;
        this.queuedPrompts.delete(runSessionId);
        activeRun.abortReason = 'stop';
        this.stoppedRuns.add(activeRun.abortController);
        activeRun.abortController.abort();
        this.activeRuns.delete(runSessionId);
        const sessions = await this.getSessionRuntime();
        this.appendRunStoppedNotice(sessions.service, runSessionId);
        await postMessage({ type: 'agent.status', status: 'idle' });
    }

    dispose(): void {
        for (const run of this.activeRuns.values()) {
            run.abortController.abort();
        }
        this.activeRuns.clear();
        this.queuedPrompts.clear();
        void this.flushSessionWrites();
    }

    private async runInitialAgentTurn(
        input: AgentPromptInput,
        initialEntries: AgentTimelineEntry[],
        postMessage: AgentWorkbenchPostMessage,
        signal: AbortSignal,
    ): Promise<{ entries: AgentTimelineEntry[]; workflowChanged: boolean }> {
        await this.throwIfAborted(signal);

        const providerRegistry = await this.loadAgentProviderRegistry().catch((error: any) => ({ error: error?.message || String(error) }));
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

        const setupStartedAt = Date.now();
        const handle = await this.getDeepAgentHandle(providerConfig, input);
        this.outputChannel.appendLine(`[n8n-agent-debug] agent handle ready sessionId=${input.sessionId || 'none'} provider=${providerConfig.provider} model=${providerConfig.model || 'default'} elapsedMs=${Date.now() - setupStartedAt}`);
        const sessions = await this.getSessionRuntime();
        sessions.service.setCheckpointer(handle.checkpointer);
        const agent = handle.agent;
        const promptStartedAt = Date.now();
        const invocationPrompt = await this.buildInvocationPrompt(input);
        const nodeContextCount = this.normalizeNodeContexts(input.nodeContexts || input.nodeContext).length;
        this.outputChannel.appendLine(`[n8n-agent-debug] agent prompt built sessionId=${input.sessionId || 'none'} elapsedMs=${Date.now() - promptStartedAt} promptChars=${invocationPrompt.length} nodeContexts=${nodeContextCount} workflowAttached=${String(Boolean(input.workflowId))}`);
        const messages = [{ role: 'user', content: invocationPrompt }];
        const contextWindowTokens = await this.resolveContextWindow(providerConfig.provider, providerConfig.model, providerConfig.apiKey, providerConfig.baseUrl);
        const config = {
            ...sessions.service.buildSessionConfig(input.sessionId || ''),
            signal,
        } as Record<string, unknown>;

        let entries = [...initialEntries];

        if (typeof (agent as any).streamEvents === 'function') {
            const streamStartedAt = Date.now();
            this.outputChannel.appendLine(`[n8n-agent-debug] deepagents.v3.streamEvents start sessionId=${input.sessionId || 'none'} promptChars=${invocationPrompt.length}`);
            const run = await this.raceAbort(Promise.resolve((agent as any).streamEvents({ messages }, { ...config, version: 'v3' })), signal);
            this.outputChannel.appendLine(`[n8n-agent-debug] deepagents.v3.streamEvents resolved sessionId=${input.sessionId || 'none'} elapsedMs=${Date.now() - streamStartedAt}`);
            if (!this.isDeepAgentV3Run(run)) {
                throw new Error('DeepAgents v3 stream did not return a run stream.');
            }
            return await this.raceAbort(this.consumeDeepAgentV3Run(run, input, entries, sessions.service, postMessage, signal, contextWindowTokens), signal);
        }

        const result = await this.raceAbort(Promise.resolve((agent as any).invoke({ messages }, config)), signal);
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

    private isDeepAgentV3Run(value: unknown): value is { output: Promise<unknown>; interrupted?: boolean; messages?: AsyncIterable<any>; toolCalls?: AsyncIterable<any> } {
        return Boolean(value
            && typeof value === 'object'
            && 'output' in Object(value));
    }

    private isAsyncIterable(value: unknown): value is AsyncIterable<any> {
        return Boolean(value
            && typeof value === 'object'
            && Symbol.asyncIterator in Object(value));
    }

    private async consumeDeepAgentV3Run(
        run: { output: Promise<unknown>; interrupted?: boolean; messages?: AsyncIterable<any>; toolCalls?: AsyncIterable<any> },
        input: AgentPromptInput,
        initialEntries: AgentTimelineEntry[],
        service: SessionServiceHandle,
        postMessage: AgentWorkbenchPostMessage,
        signal: AbortSignal,
        contextWindowTokens: number,
    ): Promise<{ entries: AgentTimelineEntry[]; workflowChanged: boolean }> {
        const runStartedAt = Date.now();
        const accumulator = this.createStreamAccumulator();
        let entries = [...initialEntries];
        let fileModificationDetected = false;
        let visibleFinalEmitted = false;
        let authoritativeFinalEmitted = false;
        const loggedProjectionEvents = new Set<string>();
        this.outputChannel.appendLine(`[n8n-agent-debug] deepagents.v3.run started sessionId=${input.sessionId || 'none'} workflowId=${input.workflowId || 'none'}`);
        const syncEntries = () => {
            if (!input.sessionId) return;
            this.writeSessionEntries(service, input.sessionId, entries);
        };
        const emitStreamEvent = async (streamEvent: AgentStreamEvent) => {
            entries = this.applyStreamEvent(entries, streamEvent);
            syncEntries();
            await postMessage({ type: 'agent.streamEvent', event: streamEvent });
            if (streamEvent.type === 'operation' && streamEvent.status === 'done' && streamEvent.category === 'file-write') {
                fileModificationDetected = true;
            }
        };
        const emitFinalEvent = async (response: string, finalState: string, runtimeFinalizing: boolean) => {
            if (runtimeFinalizing) {
                if (visibleFinalEmitted) return;
                visibleFinalEmitted = true;
            } else {
                if (authoritativeFinalEmitted) return;
                authoritativeFinalEmitted = true;
                visibleFinalEmitted = true;
            }
            const activeRun = input.sessionId ? this.activeRuns.get(input.sessionId) : undefined;
            if (activeRun && activeRun.sessionId === input.sessionId) {
                activeRun.visibleDone = true;
                if (runtimeFinalizing) {
                    activeRun.visibleFinalAt = Date.now();
                }
            }
            const elapsedMs = Date.now() - runStartedAt;
            const waitAfterVisibleMs = !runtimeFinalizing && activeRun?.visibleFinalAt ? Date.now() - activeRun.visibleFinalAt : undefined;
            const finalLogKind = runtimeFinalizing ? 'deepagents.v3.visible-final' : 'deepagents.v3.authoritative-final';
            this.outputChannel.appendLine(`[n8n-agent-debug] ${finalLogKind} sessionId=${input.sessionId || 'none'} elapsedMs=${elapsedMs} waitAfterVisibleMs=${waitAfterVisibleMs ?? 'n/a'} responseChars=${response.length} finalState=${finalState}`);
            const finalEvent: AgentStreamEvent = {
                type: 'final',
                sessionId: input.sessionId || '',
                response,
                finalState,
                runtimeFinalizing,
            };
            entries = this.applyStreamEvent(entries, finalEvent);
            syncEntries();
            await postMessage({ type: 'agent.streamEvent', event: finalEvent });
        };

        const projectionConsumers = Promise.allSettled([
            this.consumeDeepAgentV3MessageProjection(run, accumulator, {
                signal,
                contextWindowTokens,
                onStreamEvent: emitStreamEvent,
                onFinalCandidate: async (response) => emitFinalEvent(response, 'done', true),
                onProjectionEvent: (eventName, detail) => {
                    if (loggedProjectionEvents.has(eventName)) return;
                    loggedProjectionEvents.add(eventName);
                    this.outputChannel.appendLine(`[n8n-agent-debug] deepagents.v3.message-event sessionId=${input.sessionId || 'none'} event=${eventName} elapsedMs=${Date.now() - runStartedAt}${detail ? ` ${detail}` : ''}`);
                },
            }),
            this.consumeDeepAgentV3ToolCallProjection(run, {
                signal,
                onStreamEvent: emitStreamEvent,
            }),
        ]);
        void projectionConsumers.then((results) => {
            this.outputChannel.appendLine(`[n8n-agent-debug] deepagents.v3.projections settled sessionId=${input.sessionId || 'none'} elapsedMs=${Date.now() - runStartedAt}`);
            for (const result of results) {
                if (result.status === 'rejected' && !signal.aborted) {
                    this.outputChannel.appendLine(`[n8n-agent] DeepAgents v3 projection consumer failed: ${result.reason?.message || String(result.reason)}`);
                }
            }
        });

        this.outputChannel.appendLine(`[n8n-agent-debug] deepagents.v3.run.output await-start sessionId=${input.sessionId || 'none'} elapsedMs=${Date.now() - runStartedAt}`);
        const finalOutput = await this.raceAbort(Promise.resolve(run.output), signal);
        this.outputChannel.appendLine(`[n8n-agent-debug] deepagents.v3.run.output resolved sessionId=${input.sessionId || 'none'} elapsedMs=${Date.now() - runStartedAt} output=${this.summarizeAgentOutput(finalOutput)}`);

        await this.throwIfAborted(signal);
        if (accumulator.thinkingText) {
            await emitStreamEvent({
                type: 'operation',
                operationId: accumulator.thinkingOperationId || `thinking:${randomUUID()}`,
                label: 'Thinking',
                category: 'thinking',
                status: 'done',
                body: accumulator.thinkingText,
                startedAt: Date.now(),
                endedAt: Date.now(),
            });
            accumulator.thinkingText = '';
            accumulator.thinkingOperationId = undefined;
        }
        await emitFinalEvent(
            this.extractAssistantTextFromAgentOutput(finalOutput) || accumulator.responseText || this.extractAgentText(finalOutput),
            run.interrupted ? 'interrupted' : 'done',
            false,
        );
        if (fileModificationDetected) {
            this.saveAutoCheckpointAfterFileModificationInBackground(service, input, entries);
        }
        this.outputChannel.appendLine(`[n8n-agent-debug] agent runtime completed sessionId=${input.sessionId || 'none'} workflowId=${input.workflowId || 'none'} stream=v3 workflowChanged=${String(fileModificationDetected)} elapsedMs=${Date.now() - runStartedAt}`);
        return { entries, workflowChanged: fileModificationDetected };
    }

    private async consumeDeepAgentV3MessageProjection(
        run: { messages?: AsyncIterable<any> },
        accumulator: { responseText: string; thinkingText: string; thinkingOperationId?: string },
        callbacks: {
            signal: AbortSignal;
            contextWindowTokens: number;
            onStreamEvent: (event: AgentStreamEvent) => Promise<void>;
            onFinalCandidate: (response: string) => Promise<void>;
            onProjectionEvent?: (eventName: string, detail?: string) => void;
        },
    ): Promise<void> {
        if (!this.isAsyncIterable(run.messages)) return;
        for await (const message of run.messages) {
            await this.throwIfAborted(callbacks.signal);
            await this.consumeDeepAgentV3Message(message, accumulator, callbacks);
        }
    }

    private async consumeDeepAgentV3Message(
        message: { text?: AsyncIterable<string>; reasoning?: AsyncIterable<string>; usage?: AsyncIterable<any>; output?: PromiseLike<unknown> },
        accumulator: { responseText: string; thinkingText: string; thinkingOperationId?: string },
        callbacks: {
            signal: AbortSignal;
            contextWindowTokens: number;
            onStreamEvent: (event: AgentStreamEvent) => Promise<void>;
            onFinalCandidate: (response: string) => Promise<void>;
            onProjectionEvent?: (eventName: string, detail?: string) => void;
        },
    ): Promise<void> {
        if (this.isAsyncIterable(message)) {
            await this.consumeDeepAgentV3MessageEvents(message, accumulator, callbacks);
            return;
        }

        const messageKey = `message:${randomUUID()}`;
        const [, messageText, , output] = await Promise.all([
            this.consumeDeepAgentV3MessageReasoning(message, messageKey, accumulator, callbacks),
            this.consumeDeepAgentV3MessageText(message, messageKey, accumulator, callbacks),
            this.consumeDeepAgentV3MessageUsage(message, callbacks),
            Promise.resolve(message.output).catch(() => undefined),
        ]);
        if (accumulator.thinkingText && accumulator.thinkingOperationId === `thinking:${messageKey}`) {
            await callbacks.onStreamEvent({
                type: 'operation',
                operationId: accumulator.thinkingOperationId,
                label: 'Thinking',
                category: 'thinking',
                status: 'done',
                body: accumulator.thinkingText,
                startedAt: Date.now(),
                endedAt: Date.now(),
            });
            accumulator.thinkingText = '';
            accumulator.thinkingOperationId = undefined;
        }
        const finalText = this.extractMessageTextFromOutput(output) || messageText;
        if (finalText.trim() && !this.messageHasToolCalls(output)) {
            await callbacks.onFinalCandidate(this.sanitizeAssistantText(finalText));
        }
    }

    private async consumeDeepAgentV3MessageEvents(
        message: AsyncIterable<any>,
        accumulator: { responseText: string; thinkingText: string; thinkingOperationId?: string },
        callbacks: {
            signal: AbortSignal;
            contextWindowTokens: number;
            onStreamEvent: (event: AgentStreamEvent) => Promise<void>;
            onFinalCandidate: (response: string) => Promise<void>;
            onProjectionEvent?: (eventName: string, detail?: string) => void;
        },
    ): Promise<void> {
        // `message.text` resolves at message-finish; the UI needs the completed
        // visible text block so the spinner is not tied to post-text finalization.
        const messageKey = `message:${randomUUID()}`;
        const blockText = new Map<number, string>();
        let messageText = '';
        let hasToolCall = false;
        let visibleFinalEmitted = false;

        const emitThinkingDone = async () => {
            if (!accumulator.thinkingText) return;
            await callbacks.onStreamEvent({
                type: 'operation',
                operationId: accumulator.thinkingOperationId || `thinking:${messageKey}`,
                label: 'Thinking',
                category: 'thinking',
                status: 'done',
                body: accumulator.thinkingText,
                startedAt: Date.now(),
                endedAt: Date.now(),
            });
            accumulator.thinkingText = '';
            accumulator.thinkingOperationId = undefined;
        };
        const emitTextDelta = async (delta: string, blockIndex?: number) => {
            if (!delta) return;
            await emitThinkingDone();
            accumulator.responseText += delta;
            messageText += delta;
            if (typeof blockIndex === 'number') {
                blockText.set(blockIndex, `${blockText.get(blockIndex) || ''}${delta}`);
            }
            callbacks.onProjectionEvent?.('text-delta', `chars=${delta.length} totalChars=${messageText.length}`);
            await callbacks.onStreamEvent({ type: 'text-delta', delta });
        };
        const emitReasoningDelta = async (delta: string) => {
            if (!delta) return;
            accumulator.thinkingText += delta;
            accumulator.thinkingOperationId ||= `thinking:${messageKey}`;
            await callbacks.onStreamEvent({
                type: 'operation',
                operationId: accumulator.thinkingOperationId,
                label: 'Thinking',
                category: 'thinking',
                status: 'running',
                body: accumulator.thinkingText,
                startedAt: Date.now(),
            });
        };
        const emitVisibleFinal = async () => {
            const finalText = this.sanitizeAssistantText(messageText);
            if (visibleFinalEmitted || hasToolCall || !finalText) return;
            visibleFinalEmitted = true;
            await emitThinkingDone();
            await callbacks.onFinalCandidate(finalText);
        };

        for await (const event of message) {
            await this.throwIfAborted(callbacks.signal);
            if (!this.isRecord(event)) continue;
            const eventName = String(event.event || '');
            callbacks.onProjectionEvent?.(eventName);
            if (eventName === 'message-start') {
                const usageEvent = this.contextUsageEventFromUsage(event.usage, callbacks.contextWindowTokens);
                if (usageEvent) await callbacks.onStreamEvent(usageEvent);
                continue;
            }
            if (eventName === 'usage') {
                const usageEvent = this.contextUsageEventFromUsage(event.usage, callbacks.contextWindowTokens);
                if (usageEvent) await callbacks.onStreamEvent(usageEvent);
                continue;
            }
            if (eventName === 'content-block-start') {
                const content = event.content;
                if (this.isToolContentBlock(content)) {
                    hasToolCall = true;
                }
                await emitTextDelta(this.extractContentBlockText(content), this.readMessageEventIndex(event));
                await emitReasoningDelta(this.extractContentBlockReasoning(content));
                continue;
            }
            if (eventName === 'content-block-delta') {
                const delta = event.delta || event.content;
                if (this.isToolContentBlock(delta) || this.isToolContentBlock(this.isRecord(delta) ? delta.fields : undefined)) {
                    hasToolCall = true;
                }
                await emitTextDelta(this.extractContentBlockText(delta), this.readMessageEventIndex(event));
                await emitReasoningDelta(this.extractContentBlockReasoning(delta));
                continue;
            }
            if (eventName === 'content-block-finish') {
                const content = event.content;
                if (this.isToolContentBlock(content)) {
                    hasToolCall = true;
                }
                const index = this.readMessageEventIndex(event);
                const finalBlockText = this.extractContentBlockText(content);
                if (finalBlockText) {
                    const currentBlockText = typeof index === 'number' ? blockText.get(index) || '' : '';
                    const missingText = currentBlockText && finalBlockText.startsWith(currentBlockText)
                        ? finalBlockText.slice(currentBlockText.length)
                        : currentBlockText ? '' : finalBlockText;
                    await emitTextDelta(missingText, index);
                    await emitVisibleFinal();
                }
                if (this.extractContentBlockReasoning(content)) {
                    await emitThinkingDone();
                }
                continue;
            }
            if (eventName === 'message-finish') {
                const usageEvent = this.contextUsageEventFromUsage(event.usage, callbacks.contextWindowTokens);
                if (usageEvent) await callbacks.onStreamEvent(usageEvent);
                await emitVisibleFinal();
                await emitThinkingDone();
                continue;
            }
            if (eventName === 'error') {
                throw new Error(String(event.message || 'DeepAgents message stream failed'));
            }
        }

        await emitVisibleFinal();
        await emitThinkingDone();
    }

    private async consumeDeepAgentV3MessageReasoning(
        message: { reasoning?: AsyncIterable<string> },
        messageKey: string,
        accumulator: { responseText: string; thinkingText: string; thinkingOperationId?: string },
        callbacks: {
            signal: AbortSignal;
            onStreamEvent: (event: AgentStreamEvent) => Promise<void>;
            onProjectionEvent?: (eventName: string, detail?: string) => void;
        },
    ): Promise<void> {
        if (!this.isAsyncIterable(message.reasoning)) return;
        for await (const delta of message.reasoning) {
            await this.throwIfAborted(callbacks.signal);
            if (typeof delta === 'string' && delta) {
                callbacks.onProjectionEvent?.('message.reasoning-delta', `chars=${delta.length}`);
                accumulator.thinkingText += delta;
                accumulator.thinkingOperationId ||= `thinking:${messageKey}`;
                await callbacks.onStreamEvent({
                    type: 'operation',
                    operationId: accumulator.thinkingOperationId,
                    label: 'Thinking',
                    category: 'thinking',
                    status: 'running',
                    body: accumulator.thinkingText,
                    startedAt: Date.now(),
                });
            }
        }
    }

    private async consumeDeepAgentV3MessageText(
        message: { text?: AsyncIterable<string> },
        messageKey: string,
        accumulator: { responseText: string; thinkingText: string; thinkingOperationId?: string },
        callbacks: {
            signal: AbortSignal;
            onStreamEvent: (event: AgentStreamEvent) => Promise<void>;
            onProjectionEvent?: (eventName: string, detail?: string) => void;
        },
    ): Promise<string> {
        if (!this.isAsyncIterable(message.text)) return '';
        let text = '';
        for await (const delta of message.text) {
            await this.throwIfAborted(callbacks.signal);
            if (typeof delta === 'string' && delta) {
                callbacks.onProjectionEvent?.('message.text-delta', `chars=${delta.length}`);
                if (accumulator.thinkingText) {
                    await callbacks.onStreamEvent({
                        type: 'operation',
                        operationId: accumulator.thinkingOperationId || `thinking:${messageKey}`,
                        label: 'Thinking',
                        category: 'thinking',
                        status: 'done',
                        body: accumulator.thinkingText,
                        startedAt: Date.now(),
                        endedAt: Date.now(),
                    });
                    accumulator.thinkingText = '';
                    accumulator.thinkingOperationId = undefined;
                }
                accumulator.responseText += delta;
                text += delta;
                await callbacks.onStreamEvent({ type: 'text-delta', delta });
            }
        }
        return text;
    }

    private async consumeDeepAgentV3MessageUsage(
        message: { usage?: AsyncIterable<any> },
        callbacks: {
            signal: AbortSignal;
            contextWindowTokens: number;
            onStreamEvent: (event: AgentStreamEvent) => Promise<void>;
        },
    ): Promise<void> {
        if (!this.isAsyncIterable(message.usage)) return;
        for await (const usage of message.usage) {
            await this.throwIfAborted(callbacks.signal);
            const usageEvent = this.contextUsageEventFromUsage(usage, callbacks.contextWindowTokens);
            if (usageEvent) await callbacks.onStreamEvent(usageEvent);
        }
    }

    private async consumeDeepAgentV3ToolCallProjection(
        run: { toolCalls?: AsyncIterable<any> },
        callbacks: {
            signal: AbortSignal;
            onStreamEvent: (event: AgentStreamEvent) => Promise<void>;
        },
    ): Promise<void> {
        if (!this.isAsyncIterable(run.toolCalls)) return;
        const completions: Promise<void>[] = [];
        for await (const toolCall of run.toolCalls) {
            await this.throwIfAborted(callbacks.signal);
            const completion = this.consumeDeepAgentV3ToolCall(toolCall, callbacks).catch((error: any) => {
                if (!callbacks.signal.aborted) {
                    this.outputChannel.appendLine(`[n8n-agent] DeepAgents v3 tool-call projection failed: ${error?.message || String(error)}`);
                }
            });
            completions.push(completion);
        }
        await Promise.allSettled(completions);
    }

    private async consumeDeepAgentV3ToolCall(
        toolCall: any,
        callbacks: {
            signal: AbortSignal;
            onStreamEvent: (event: AgentStreamEvent) => Promise<void>;
        },
    ): Promise<void> {
        const toolName = String(toolCall?.name || 'tool');
        if (!this.shouldShowToolOperation(toolName)) return;
        const toolCallId = String(toolCall?.callId || randomUUID());
        const operationId = `${toolName}:${toolCallId}`;
        const startedAt = Date.now();
        const category = this.categorizeTool(toolName);
        const command = category === 'shell' ? this.extractCommandFromToolPayload(toolCall?.input) : undefined;
        const filePath = category === 'file-read' || category === 'file-write' ? this.extractFilePathFromToolPayload(toolCall?.input) : undefined;
        const todoSummary = category === 'todo' ? this.extractTodoSummary(toolCall?.input) : undefined;
        await callbacks.onStreamEvent({
            type: 'operation',
            operationId,
            label: this.formatToolLabel(toolName),
            category,
            status: 'running',
            body: category === 'todo' ? this.stringifyToolPayload(toolCall?.input) : command ? `$ ${command}` : this.stringifyToolPayload(toolCall?.input),
            summary: command ? `$ ${command}` : filePath || todoSummary,
            startedAt,
        });

        let status = await Promise.resolve(toolCall?.status).catch(() => 'error');
        let output: unknown;
        let errorMessage: string | undefined;
        if (status === 'error') {
            errorMessage = await Promise.resolve(toolCall?.error).catch((error: any) => error?.message || String(error));
            output = errorMessage || 'Tool failed';
        } else {
            output = await Promise.resolve(toolCall?.output).catch((error: any) => {
                status = 'error';
                errorMessage = error?.message || String(error);
                return errorMessage;
            });
        }

        await this.throwIfAborted(callbacks.signal);
        const outputText = status === 'error' ? String(errorMessage || output || 'Tool failed') : this.stringifyToolOutput(output);
        await callbacks.onStreamEvent({
            type: 'operation',
            operationId,
            label: this.formatToolLabel(toolName),
            category,
            status: status === 'error' ? 'error' : 'done',
            summary: this.truncateOperationDetail(outputText),
            body: outputText,
            startedAt,
            endedAt: Date.now(),
        });
        const compaction = this.extractCompactionSummary(output);
        if (compaction) {
            await callbacks.onStreamEvent({
                type: 'compaction',
                summary: compaction.summary,
                source: compaction.source,
                messagesCompacted: compaction.messagesCompacted,
                preservedRecentMessages: compaction.preservedRecentMessages,
                estimatedTokens: compaction.estimatedTokens,
                thresholdTokens: compaction.thresholdTokens,
                fallbackReason: compaction.fallbackReason,
            });
        }
    }

    private contextUsageEventFromUsage(usage: any, contextWindowTokens: number): AgentContextUsageEvent | undefined {
        const promptTokens = Number(usage?.input_tokens ?? usage?.promptTokens ?? usage?.prompt_tokens ?? 0);
        const completionTokens = Number(usage?.output_tokens ?? usage?.completionTokens ?? usage?.completion_tokens ?? 0);
        if (!promptTokens && !completionTokens) return undefined;
        const fillPercent = contextWindowTokens > 0 ? Math.min(100, Math.round((promptTokens / contextWindowTokens) * 100)) : 0;
        return {
            type: 'context-usage',
            promptTokens,
            completionTokens,
            contextWindowTokens,
            fillPercent,
            source: 'api',
        };
    }

    private saveAutoCheckpointAfterFileModificationInBackground(
        service: SessionServiceHandle,
        input: AgentPromptInput,
        entries: AgentTimelineEntry[],
    ): void {
        void this.saveAutoCheckpointAfterFileModification(service, input, entries).catch((error: any) => {
            this.outputChannel.appendLine(`[n8n-agent] Auto-checkpoint background task failed: ${error?.message || String(error)}`);
        });
    }

    private async saveAutoCheckpointAfterFileModification(
        service: SessionServiceHandle,
        input: AgentPromptInput,
        entries: AgentTimelineEntry[],
    ): Promise<void> {
        this.outputChannel.appendLine(`[n8n-agent-debug] agent runtime detected local workflow modification sessionId=${input.sessionId || 'none'} workflowId=${input.workflowId || 'none'} workflowFilePath=${input.workflowFilePath || 'none'}`);
        try {
            await this.maybeSaveWorkbenchCheckpoint(service, input.sessionId || '', 'after-tool', {
                label: 'After file modifications',
                summary: 'Saved after file modifications',
                payloads: {
                    surface: this.buildCheckpointSurfacePayload(service, input.sessionId || '', entries),
                },
            });
        } catch (error: any) {
            this.outputChannel.appendLine(`[n8n-agent] Auto-checkpoint failed: ${error?.message || String(error)}`);
        }
    }

    private truncateOperationDetail(value: unknown): string | undefined {
        if (typeof value !== 'string') return undefined;
        const normalized = value.trim();
        if (!normalized) return undefined;
        return normalized.length > 500 ? `${normalized.slice(0, 500)}...` : normalized;
    }

    private async loadAgentProviderRegistry(): Promise<AgentProviderRegistryModule> {
        return LOCAL_AGENT_PROVIDER_REGISTRY;
    }

    private async describeProviderRuntimeConfig(): Promise<ProviderRuntimeConfig> {
        const providerRegistry = await this.loadAgentProviderRegistry().catch(() => undefined);
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

    private async getProviderRuntimeConfig(providerRegistry: AgentProviderRegistryModule): Promise<ProviderRuntimeConfig> {
        const config = vscode.workspace.getConfiguration('n8n.agent');
        const provider = String(config.get<string>('provider') || 'openai');
        const normalizedProvider = providerRegistry.normalizeProviderId(provider);
        const reasoningEffort = this.readReasoningEffort();
        if (!normalizedProvider) {
            return {
                ready: false,
                reason: `Provider ${provider} is not supported by the embedded agent runtime.`,
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
        if (normalizedProvider === 'openai-oauth' && !apiKey) {
            return {
                ready: false,
                reason: 'OpenAI OAuth needs to be connected. Open Settings > Agent Providers, then connect OpenAI ChatGPT OAuth.',
                provider: normalizedProvider,
                model,
                baseUrl,
                apiKey,
                reasoningEffort,
                temperature: 0,
            };
        }
        if (providerRegistry.providerRequiresApiKey(normalizedProvider) && !apiKey && normalizedProvider !== 'openai-oauth' && normalizedProvider !== 'copilot-proxy') {
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

    private async getDeepAgentHandle(providerConfig: ProviderRuntimeConfig, input: AgentPromptInput): Promise<DeepAgentHandle> {
        const rootDir = input.workspaceRoot || process.cwd();
        const deepagents = await importRuntimeModule('deepagents');
        const langchain = await importRuntimeModule('langchain');
        const messagesModule = await importRuntimeModule('@langchain/core/messages');
        const memorySources = await this.getAgentMemorySources(rootDir);
        const skillSourcePaths = await this.getAgentSkillSources(rootDir);
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

        const model = await this.createLangChainModel(providerConfig);
        const checkpointer = await this.createPersistentCheckpointer();
        const backend = await deepagents.LocalShellBackend.create({
            rootDir,
            inheritEnv: false,
            env: this.buildAgentBackendEnv(),
        });
        const agent = deepagents.createDeepAgent({
            model,
            checkpointer,
            backend,
            memory: memorySources,
            skills: skillSourcePaths,
            middleware: [
                this.createInvalidToolCallRecoveryMiddleware(langchain, messagesModule),
            ].filter(Boolean),
            systemPrompt: this.buildStaticSystemPrompt(input.workspaceRoot),
        });
        const handle = { agent, checkpointer };
        this.cachedAgentHandle = { key, handle };
        return handle;
    }

    private createInvalidToolCallRecoveryMiddleware(langchain: any, messagesModule: any): unknown {
        const createMiddleware = langchain?.createMiddleware;
        const AIMessage = messagesModule?.AIMessage;
        const HumanMessage = messagesModule?.HumanMessage;
        const RemoveMessage = messagesModule?.RemoveMessage;
        if (typeof createMiddleware !== 'function' || typeof AIMessage !== 'function' || typeof HumanMessage !== 'function' || typeof RemoveMessage !== 'function') {
            return undefined;
        }
        return createMiddleware({
            name: 'N8nInvalidToolCallRecovery',
            afterModel: {
                canJumpTo: ['model', 'end'],
                hook: (state: any) => {
                    const messages = Array.isArray(state?.messages) ? state.messages : [];
                    const lastMessage = messages[messages.length - 1];
                    const invalidCalls = this.extractInvalidToolCallsFromMessage(lastMessage);
                    if (!invalidCalls.length) return undefined;
                    const recoveryAttempts = this.countRecentInvalidToolCallRecoveryAttempts(messages);
                    if (recoveryAttempts >= 2) {
                        this.outputChannel.appendLine('[n8n-agent] Stopping invalid tool-call recovery after two failed repair attempts.');
                        const lastMessageId = this.getMessageId(lastMessage);
                        return {
                            messages: [
                                ...(lastMessageId ? [new RemoveMessage({ id: lastMessageId })] : []),
                                new AIMessage('I could not construct a valid tool call after two repair attempts, so I stopped before executing malformed arguments. Please rephrase the request or choose a more specific next step.'),
                            ],
                            jumpTo: 'end',
                        };
                    }
                    this.outputChannel.appendLine(`[n8n-agent-debug] recovering invalid tool call attempt=${recoveryAttempts + 1}`);
                    const repairMessage = new HumanMessage({
                        content: this.buildInvalidToolCallRecoveryPrompt(invalidCalls),
                    });
                    const lastMessageId = this.getMessageId(lastMessage);
                    return {
                        messages: [
                            ...(lastMessageId ? [new RemoveMessage({ id: lastMessageId })] : []),
                            repairMessage,
                        ],
                        jumpTo: 'model',
                    };
                },
            },
        });
    }

    private countRecentInvalidToolCallRecoveryAttempts(messages: unknown[]): number {
        let attempts = 0;
        for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
            const message = messages[idx];
            if (!this.isRecord(message)) continue;
            const text = this.extractMessageTextContent(message.content);
            if (text.includes('N8N_INVALID_TOOL_CALL_RECOVERY')) {
                attempts += 1;
                continue;
            }
            if (this.getMessageType(message) === 'human') {
                break;
            }
        }
        return attempts;
    }

    private getMessageId(message: unknown): string | undefined {
        if (!this.isRecord(message)) return undefined;
        if (typeof message.id === 'string') return message.id;
        const kwargs = this.isRecord(message.kwargs) ? message.kwargs : undefined;
        if (typeof kwargs?.id === 'string') return kwargs.id;
        const lcKwargs = this.isRecord(message.lc_kwargs) ? message.lc_kwargs : undefined;
        if (typeof lcKwargs?.id === 'string') return lcKwargs.id;
        return undefined;
    }

    private buildInvalidToolCallRecoveryPrompt(invalidCalls: Array<{ name?: string; args?: string; error?: string }>): string {
        const details = invalidCalls.map((call, index) => [
            `${index + 1}. Tool: ${call.name || 'unknown'}`,
            call.error ? `Error: ${call.error}` : undefined,
            call.args ? `Malformed args: ${call.args}` : undefined,
        ].filter(Boolean).join('\n')).join('\n\n');
        return [
            'N8N_INVALID_TOOL_CALL_RECOVERY',
            'Your previous assistant message contained a malformed tool call and was removed before tool execution.',
            details,
            '',
            'Repair instructions:',
            '- Continue the same user task.',
            '- Emit exactly one valid tool call or a final answer.',
            '- Do not stop after this repair message.',
            '- For the execute tool, pass exactly one JSON object with a command string: {"command":"..."}',
            '- Do not pass a separate path field to execute. If a working directory matters, include it inside the shell command, for example: cd /absolute/path && node ...',
            '- Do not concatenate multiple JSON objects in a tool call.',
        ].filter(Boolean).join('\n');
    }

    private buildStaticSystemPrompt(workspaceRoot?: string): string {
        return [
            'You are the embedded n8n-as-code VS Code agent.',
            'You help users design, inspect, validate, and operate n8n workflows from the current workspace.',
            'Your DeepAgents backend working directory is the VS Code workspace root. Treat all relative filesystem tool paths as relative to that home directory.',
            'Use tools only when useful. For workflow-specific questions, use the inline workflow and node context supplied with each user turn as authoritative.',
            'Do not claim to push workflows, provision credentials, or change n8n runtime state unless a tool explicitly performs that action successfully.',
            'When using the execute tool, pass exactly one argument object with a command string: {"command":"..."}. Never pass a separate path field, and never concatenate multiple JSON objects.',
            workspaceRoot ? `Workspace root: ${workspaceRoot}` : undefined,
        ].filter(Boolean).join('\n');
    }

    private async buildInvocationPrompt(input: AgentPromptInput): Promise<string> {
        const workflowContext = await this.loadWorkflowContext(input);
        const nodeContexts = this.normalizeNodeContexts(input.nodeContexts || input.nodeContext);
        const blocks = [
            input.workflowId ? `Current workflow: ${input.workflowName || input.workflowId} (${input.workflowId})` : 'No workflow is attached. The user may be designing a new workflow.',
            input.workflowFilename ? `Current workflow file: ${input.workflowFilename}` : undefined,
            await this.loadCompactedSessionContext(input.sessionId),
            this.formatNodeContexts(nodeContexts),
            workflowContext,
            'User request:',
            input.prompt.trim(),
        ].filter(Boolean);
        return blocks.join('\n\n');
    }

    private async loadCompactedSessionContext(sessionId?: string): Promise<string | undefined> {
        if (!sessionId) return undefined;
        const sessions = await this.getSessionRuntime();
        const entries = this.readSessionEntries(sessions.service, sessionId);
        const latestCompaction = [...entries].reverse().find((entry): entry is Extract<AgentTimelineEntry, { kind: 'compaction' }> => entry.kind === 'compaction');
        if (!latestCompaction?.event.summary.trim()) return undefined;
        const recentText = entries
            .filter((entry) => 'timestamp' in entry && entry.timestamp > latestCompaction.timestamp && entry.kind !== 'context-usage')
            .map((entry) => this.getEntryText(entry))
            .filter(Boolean)
            .slice(-6)
            .join('\n\n');
        return [
            'Compacted prior conversation context:',
            latestCompaction.event.summary,
            recentText ? `Recent conversation after compaction:\n${recentText}` : undefined,
        ].filter(Boolean).join('\n\n');
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

    private async getAgentMemorySources(rootDir: string): Promise<string[]> {
        const workspaceSources = await this.getWorkspaceMemorySources(rootDir);
        return [...new Set(workspaceSources)];
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

    private async getAgentSkillSources(rootDir: string): Promise<string[]> {
        const candidatePaths = [
            ...(await this.getWorkspaceSkillSources(rootDir)),
        ].filter((candidate): candidate is string => Boolean(candidate));
        const existing = await Promise.all(candidatePaths.map(async (candidate) => {
            try {
                const stat = await fs.promises.stat(candidate);
                return stat.isDirectory() && await this.directoryHasSkill(candidate) ? candidate : undefined;
            } catch {
                return undefined;
            }
        }));
        return [...new Set(existing
            .filter((candidate): candidate is string => Boolean(candidate))
            .map((candidate) => path.relative(rootDir, candidate).replace(/\\/g, '/'))
            .filter((candidate) => candidate && !candidate.startsWith('..')))];
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

    private extractMessageTextFromOutput(output: unknown): string {
        if (!this.isRecord(output)) return '';
        return this.sanitizeAssistantText(this.extractMessageTextContent(output.content));
    }

    private summarizeAgentOutput(output: unknown): string {
        if (!this.isRecord(output)) return typeof output;
        const keys = Object.keys(output).slice(0, 8).join(',');
        const messages = Array.isArray(output.messages) ? output.messages : [];
        const last = messages[messages.length - 1];
        const lastRole = this.isRecord(last) ? String(last.role || last._getType || last.type || last.name || 'unknown') : 'none';
        const lastTextChars = this.isRecord(last) ? this.extractMessageTextContent(last.content).length : 0;
        return `keys=${keys || 'none'} messages=${messages.length} lastRole=${lastRole} lastTextChars=${lastTextChars}`;
    }

    private readMessageEventIndex(event: Record<string, unknown>): number | undefined {
        const index = Number(event.index);
        return Number.isFinite(index) ? index : undefined;
    }

    private extractContentBlockText(value: unknown): string {
        if (!this.isRecord(value)) return '';
        const type = String(value.type || '').toLowerCase();
        if ((type === 'text' || type === 'text-delta') && typeof value.text === 'string') {
            return value.text;
        }
        if (this.isRecord(value.fields)) {
            return this.extractContentBlockText(value.fields);
        }
        if (this.isRecord(value.content)) {
            return this.extractContentBlockText(value.content);
        }
        return '';
    }

    private extractContentBlockReasoning(value: unknown): string {
        if (!this.isRecord(value)) return '';
        const type = String(value.type || '').toLowerCase();
        if ((type === 'reasoning' || type === 'reasoning-delta') && typeof value.reasoning === 'string') {
            return value.reasoning;
        }
        if (type === 'thinking' && typeof value.thinking === 'string') {
            return value.thinking;
        }
        if (this.isRecord(value.fields)) {
            return this.extractContentBlockReasoning(value.fields);
        }
        if (this.isRecord(value.content)) {
            return this.extractContentBlockReasoning(value.content);
        }
        return '';
    }

    private isToolContentBlock(value: unknown): boolean {
        if (!this.isRecord(value)) return false;
        const type = String(value.type || '').toLowerCase();
        if (type.includes('tool') || type === 'input_json_delta') return true;
        for (const key of ['tool_calls', 'toolCalls', 'invalid_tool_calls', 'invalidToolCalls']) {
            if (Array.isArray(value[key]) && (value[key] as unknown[]).length > 0) return true;
        }
        return this.isToolContentBlock(value.fields) || this.isToolContentBlock(value.content);
    }

    private messageHasToolCalls(message: unknown): boolean {
        const visit = (value: unknown): boolean => {
            if (!this.isRecord(value)) return false;
            for (const key of ['tool_calls', 'toolCalls', 'invalid_tool_calls', 'invalidToolCalls']) {
                if (Array.isArray(value[key]) && (value[key] as unknown[]).length > 0) return true;
            }
            for (const key of ['content', 'content_blocks']) {
                const blocks = value[key];
                if (Array.isArray(blocks) && blocks.some((block) => this.isRecord(block) && String(block.type || '').includes('tool'))) {
                    return true;
                }
            }
            return visit(value.kwargs) || visit(value.lc_kwargs);
        };
        return visit(message);
    }

    private extractAssistantTextFromAgentOutput(result: unknown): string {
        if (!this.isRecord(result)) return '';
        const messages = Array.isArray(result.messages) ? result.messages : [];
        for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
            const message = messages[idx];
            if (!this.isAssistantMessage(message)) continue;
            const text = this.extractMessageTextContent(this.isRecord(message) ? message.content : undefined);
            if (text.trim()) return this.sanitizeAssistantText(text);
        }
        return '';
    }

    private buildInvalidToolCallRepairPrompt(result: unknown): string | undefined {
        const invalidCalls = this.extractInvalidToolCallsFromAgentOutput(result);
        if (!invalidCalls.length) return undefined;
        const details = invalidCalls.map((call, index) => [
            `${index + 1}. Tool: ${call.name || 'unknown'}`,
            call.error ? `Error: ${call.error}` : undefined,
            call.args ? `Malformed args: ${call.args}` : undefined,
        ].filter(Boolean).join('\n')).join('\n\n');
        return [
            'Continue the same user task from the current workspace state.',
            'Your previous response ended with an invalid tool call, so no tool was executed.',
            details,
            '',
            'Repair instructions:',
            '- Emit a valid tool call or a final answer; do not stop after an invalid tool call.',
            '- For the execute tool, use exactly one JSON object with a single command string: {"command":"..."}',
            '- Do not pass a separate path field to execute. If a working directory matters, include it inside the shell command, for example: cd /absolute/path && node ...',
            '- Do not concatenate multiple JSON objects in a tool call.',
        ].filter(Boolean).join('\n');
    }

    private extractInvalidToolCallsFromAgentOutput(result: unknown): Array<{ name?: string; args?: string; error?: string }> {
        if (!this.isRecord(result)) return [];
        const messages = Array.isArray(result.messages) ? result.messages : [];
        for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
            const message = messages[idx];
            if (!this.isAssistantMessage(message)) continue;
            const calls = this.extractInvalidToolCallsFromMessage(message);
            if (calls.length) return calls;
        }
        return [];
    }

    private extractInvalidToolCallsFromMessage(message: unknown): Array<{ name?: string; args?: string; error?: string }> {
        const candidates: unknown[] = [];
        const collect = (value: unknown) => {
            if (!this.isRecord(value)) return;
            for (const key of ['invalid_tool_calls', 'invalidToolCalls']) {
                const direct = value[key];
                if (Array.isArray(direct)) candidates.push(...direct);
            }
            for (const key of ['content', 'content_blocks']) {
                const direct = value[key];
                if (Array.isArray(direct)) candidates.push(...direct);
            }
            if (this.isRecord(value.kwargs)) collect(value.kwargs);
            if (this.isRecord(value.lc_kwargs)) collect(value.lc_kwargs);
        };
        collect(message);
        return candidates
            .filter((candidate): candidate is Record<string, unknown> => this.isRecord(candidate) && candidate.type === 'invalid_tool_call')
            .map((candidate) => ({
                name: typeof candidate.name === 'string' ? candidate.name : undefined,
                args: typeof candidate.args === 'string' ? candidate.args : this.stringifyToolPayload(candidate.args),
                error: typeof candidate.error === 'string' ? candidate.error : undefined,
            }));
    }

    private isAssistantMessage(value: unknown): boolean {
        if (!this.isRecord(value)) return false;
        const messageType = this.getMessageType(value);
        if (messageType === 'tool' || messageType === 'human' || messageType === 'system') return false;
        if (messageType === 'ai' || messageType === 'assistant') return true;
        return false;
    }

    private getMessageType(value: Record<string, unknown>): string | undefined {
        const getter = value._getType;
        if (typeof getter === 'function') {
            try {
                const type = getter.call(value);
                if (typeof type === 'string') return type.toLowerCase();
            } catch {
                // Fall through to structural checks.
            }
        }
        for (const key of ['type', 'role']) {
            const direct = value[key];
            if (typeof direct === 'string') return direct.toLowerCase();
            const kwargs = this.isRecord(value.kwargs) ? value.kwargs[key] : undefined;
            if (typeof kwargs === 'string') return kwargs.toLowerCase();
            const lcKwargs = this.isRecord(value.lc_kwargs) ? value.lc_kwargs[key] : undefined;
            if (typeof lcKwargs === 'string') return lcKwargs.toLowerCase();
        }
        const constructorName = typeof value.constructor?.name === 'string' ? value.constructor.name.toLowerCase() : '';
        if (constructorName.includes('toolmessage')) return 'tool';
        if (constructorName.includes('humanmessage')) return 'human';
        if (constructorName.includes('systemmessage')) return 'system';
        if (constructorName.includes('aimessage')) return 'ai';
        const lcId = Array.isArray(value.lc_id) ? value.lc_id.map(String).join('/').toLowerCase() : '';
        if (lcId.includes('toolmessage')) return 'tool';
        if (lcId.includes('humanmessage')) return 'human';
        if (lcId.includes('systemmessage')) return 'system';
        if (lcId.includes('aimessage')) return 'ai';
        if ('tool_call_id' in value || 'toolCallId' in value) return 'tool';
        return undefined;
    }

    private extractMessageTextContent(value: unknown): string {
        if (typeof value === 'string') return value;
        if (!Array.isArray(value)) return '';
        return value.map((part) => {
            if (typeof part === 'string') return part;
            if (this.isRecord(part) && typeof part.text === 'string') return part.text;
            return '';
        }).join('');
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
            ? `Embedded DeepAgentJS runtime is not loadable yet: ${runtimeError}`
            : 'Embedded DeepAgentJS runtime is available. Tool and provider execution are enabled.';

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

    private async raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
        if (signal.aborted) {
            await this.throwIfAborted(signal);
        }
        return new Promise<T>((resolve, reject) => {
            const onAbort = () => {
                const error = new Error('Agent run cancelled.');
                error.name = 'AbortError';
                reject(error);
            };
            signal.addEventListener('abort', onAbort, { once: true });
            promise.then(
                (value) => {
                    signal.removeEventListener('abort', onAbort);
                    resolve(value);
                },
                (error) => {
                    signal.removeEventListener('abort', onAbort);
                    reject(error);
                },
            );
        });
    }

    private async getSessionRuntime(): Promise<SessionRuntime> {
        if (!this.sessionRuntimePromise) {
            this.sessionRuntimePromise = (async () => {
                const sessionsRoot = path.join(this._context.globalStorageUri.fsPath, 'agent-sessions');
                await fs.promises.mkdir(sessionsRoot, { recursive: true });
                const service = new WorkbenchSessionService(sessionsRoot);
                service.setCheckpointer(await this.createPersistentCheckpointer());
                return {
                    service,
                    deriveSessionTitle: this.deriveSessionTitle,
                };
            })();
        }
        return this.sessionRuntimePromise;
    }

    private async flushSessionWrites(): Promise<void> {
        const sessions = await this.sessionRuntimePromise?.catch(() => undefined);
        await sessions?.service.flushPendingWrites?.();
    }

    private getSessionScope(input: Omit<AgentPromptInput, 'prompt'>): DeepAgentSessionScope {
        if (input.workflowId) {
            return { kind: 'vscode-workflow', key: input.workflowId };
        }
        return this.getUnattachedSessionScope();
    }

    private getInputWorkflowContext(input: Omit<AgentPromptInput, 'prompt'>): AgentWorkflowContext | undefined {
        const id = input.workflowId?.trim();
        const workflowName = input.workflowName?.trim();
        const filename = input.workflowFilename?.trim();
        const filePath = input.workflowFilePath?.trim();
        if (!id && !workflowName && !filename && !filePath) return undefined;
        const name = workflowName || id || filename || (filePath ? path.basename(filePath) : undefined) || 'Workflow';
        return {
            id: id || undefined,
            name,
            filename: filename || undefined,
            filePath: filePath || undefined,
        };
    }

    private getUnattachedSessionScope(): DeepAgentSessionScope {
        return { kind: 'vscode-workflow', key: UNATTACHED_WORKFLOW_SCOPE_KEY };
    }

    private getDefaultSessionTitle(workflowName?: string): string {
        return workflowName ? `${workflowName} conversation` : 'New conversation';
    }

    private deriveSessionTitle(text: string, fallback = 'New conversation'): string {
        const normalized = text.replace(/\s+/g, ' ').trim();
        if (!normalized) return fallback;
        return normalized.length > 48 ? `${normalized.slice(0, 45).trim()}...` : normalized;
    }

    private async listSessionSummaries(scope: DeepAgentSessionScope, activeSessionId: string): Promise<AgentSessionSummary[]> {
        const sessions = await this.getSessionRuntime();
        const summaries = await Promise.all(sessions.service.list().map(async (summary) => {
            const record = sessions.service.get(summary.id);
            const entries = this.readSessionEntries(sessions.service, summary.id);
            const workflowContext = this.getLatestWorkflowContext(entries, record);
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
                totalCompactions: entries.filter((entry) => entry.kind === 'compaction').length,
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
        const record = sessions.service.get(sessionId);
        const workflowContext = this.getLatestWorkflowContext(entries, record);
        const nodeContexts = workflowContext ? this.getLatestNodeContexts(entries) : [];
        const latestUsageEntry = [...entries].reverse().find((entry): entry is Extract<AgentTimelineEntry, { kind: 'context-usage' }> => entry.kind === 'context-usage' && entry.usage.source === 'api');
        const compactionEntries = entries.filter((entry): entry is Extract<AgentTimelineEntry, { kind: 'compaction' }> => entry.kind === 'compaction');
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
            lastCompaction: compactionEntries[compactionEntries.length - 1]?.event,
            totalCompactions: compactionEntries.length,
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
        let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
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
            const existingEntry = existingIndex >= 0 && next[existingIndex]?.kind === 'operation'
                ? next[existingIndex] as Extract<AgentTimelineEntry, { kind: 'operation' }>
                : undefined;
            const shouldPreserveOperationSummary = ['shell', 'file-read', 'file-write', 'todo'].includes(event.category);
            const operationEntry: AgentTimelineEntry = {
                kind: 'operation',
                id: event.operationId || existingEntry?.id || randomUUID(),
                tone: event.status === 'error' ? 'error' : event.status === 'done' ? 'success' : 'info',
                title: event.label,
                category: event.category,
                status: event.status,
                body: event.category === 'todo' && existingEntry?.body ? existingEntry.body : event.body || existingEntry?.body,
                summary: shouldPreserveOperationSummary && existingEntry?.summary ? existingEntry.summary : event.summary,
                startedAt: event.startedAt,
                endedAt: event.endedAt,
                detail: shouldPreserveOperationSummary && existingEntry?.summary ? existingEntry.summary : event.summary,
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

    private appendRunStoppedNotice(service: SessionServiceHandle, sessionId: string): void {
        const entries = this.withoutContextUsage(this.readSessionEntries(service, sessionId));
        const last = entries[entries.length - 1];
        if (last?.kind === 'system-notice' && last.text === 'Run stopped.') {
            return;
        }
        this.writeSessionEntries(service, sessionId, [
            ...this.finalizePendingOperations(entries, 'done'),
            this.createSystemNotice('Run stopped.'),
        ]);
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

    private async saveWorkbenchCheckpoint(
        service: SessionServiceHandle,
        sessionId: string,
        options: SaveCheckpointOptions,
    ): Promise<SessionCheckpointMetadata> {
        return service.saveCheckpoint(sessionId, this.withLegacyCheckpointPayload(options));
    }

    private async saveBeforeUserMessageCheckpoint(
        service: SessionServiceHandle,
        sessionId: string,
        entries: AgentTimelineEntry[],
        prompt: string,
        workspaceRoot: string | undefined,
    ): Promise<{ checkpoint: SessionCheckpointMetadata; workspaceSnapshotId?: string }> {
        service.setCheckpointer(await this.createPersistentCheckpointer());
        const workspaceSnapshotId = await this.workspaceSnapshots.capture(workspaceRoot, 'Before user message');
        const surface = this.buildCheckpointSurfacePayload(service, sessionId, entries);
        const promptPreview = prompt.length > 80 ? `${prompt.slice(0, 77)}...` : prompt;
        const checkpoint = await this.saveWorkbenchCheckpoint(service, sessionId, {
            reason: 'manual',
            label: 'Before user message',
            summary: promptPreview ? `Before "${promptPreview}"` : 'Before user message',
            payloads: {
                surface,
            },
        });
        return { checkpoint, workspaceSnapshotId };
    }

    private async maybeSaveWorkbenchCheckpoint(
        service: SessionServiceHandle,
        sessionId: string,
        reason: CheckpointReason,
        options: Omit<SaveCheckpointOptions, 'reason'>,
    ): Promise<SessionCheckpointMetadata | undefined> {
        if (typeof service.maybeSaveCheckpoint !== 'function') {
            return this.saveWorkbenchCheckpoint(service, sessionId, { ...options, reason });
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

    private async createLangChainModel(providerConfig: ProviderRuntimeConfig): Promise<any> {
        const provider = providerConfig.provider;
        const model = providerConfig.model || this.getDefaultModelForProvider(provider);
        if (provider === 'openai-oauth' || provider === 'copilot-proxy' || provider === 'minimax' || provider === 'minimax-token-plan') {
            const providerRuntime = await importRuntimeModule('@yagr/provider-runtime');
            const localConfig = {
                provider,
                model,
                baseUrl: providerConfig.baseUrl,
                reasoningEffort: providerConfig.reasoningEffort,
            };
            const configStore = {
                getLocalConfig: () => localConfig,
                getApiKey: (candidate: string) => candidate === provider ? providerConfig.apiKey : undefined,
            };
            return providerRuntime.createLangChainModel({
                provider,
                model,
                apiKey: providerConfig.apiKey,
                baseUrl: providerConfig.baseUrl,
            }, configStore);
        }

        if (provider === 'google') {
            const { ChatGoogleGenerativeAI } = await importRuntimeModule('@langchain/google-genai');
            return new ChatGoogleGenerativeAI({ apiKey: providerConfig.apiKey, model });
        }
        if (provider === 'anthropic') {
            const { ChatAnthropic } = await importRuntimeModule('@langchain/anthropic');
            return new ChatAnthropic({ apiKey: providerConfig.apiKey, model });
        }
        if (provider === 'mistral') {
            const { ChatMistralAI } = await importRuntimeModule('@langchain/mistralai');
            return new ChatMistralAI({ apiKey: providerConfig.apiKey, model });
        }
        const { ChatOpenAI } = await importRuntimeModule('@langchain/openai');
        const baseURL = provider === 'openrouter'
            ? providerConfig.baseUrl || 'https://openrouter.ai/api/v1'
            : providerConfig.baseUrl;
        return new ChatOpenAI({
            ...(providerConfig.apiKey ? { apiKey: providerConfig.apiKey } : {}),
            model,
            ...(baseURL ? { configuration: { baseURL } } : {}),
        });
    }

    private getDefaultModelForProvider(provider: string): string {
        const defaults: Record<string, string> = {
            anthropic: 'claude-haiku-4-5',
            openai: 'gpt-4o',
            google: 'gemini-3-flash-preview',
            mistral: 'mistral-large-latest',
            openrouter: 'anthropic/claude-3.5-sonnet',
            'openai-oauth': 'gpt-5.4',
            'copilot-proxy': 'gpt-4.1',
            minimax: 'MiniMax-M2.7',
            'minimax-token-plan': 'MiniMax-M2.7',
            'openai-compatible': 'gpt-4o',
        };
        return defaults[provider] || 'gpt-4o';
    }

    private async createPersistentCheckpointer(): Promise<RuntimeCheckpointer> {
        if (!this.checkpointerPromise) {
            this.checkpointerPromise = (async () => {
                const checkpointsDir = path.join(this._context.globalStorageUri.fsPath, 'agent-sessions');
                await fs.promises.mkdir(checkpointsDir, { recursive: true });
                const legacyCheckpointPath = path.join(checkpointsDir, 'langgraph-checkpoints.json');
                const checkpointRoot = path.join(checkpointsDir, 'langgraph-checkpoints-sharded');
                await fs.promises.mkdir(checkpointRoot, { recursive: true });
                const checkpointModule = await importRuntimeModule('@langchain/langgraph-checkpoint');
                const BaseCheckpointSaver = checkpointModule.BaseCheckpointSaver as new () => any;
                const copyCheckpoint = checkpointModule.copyCheckpoint as (checkpoint: Record<string, unknown>) => Record<string, unknown>;
                const getCheckpointId = checkpointModule.getCheckpointId as (config: Record<string, any>) => string;
                const writesIndexMap = checkpointModule.WRITES_IDX_MAP as Record<string, number>;

                type SerializedCheckpoint = [unknown, unknown, string | undefined];
                type SerializedWrite = [string, string, unknown];
                type CheckpointStorage = Record<string, Record<string, Record<string, SerializedCheckpoint>>>;
                type CheckpointWrites = Record<string, Record<string, SerializedWrite>>;

                const generateKey = (threadId: string, checkpointNamespace: string, checkpointId: string) => JSON.stringify([
                    threadId,
                    checkpointNamespace,
                    checkpointId,
                ]);
                const parseKey = (key: string): { threadId: string; checkpointNamespace: string; checkpointId: string } => {
                    const [threadId, checkpointNamespace, checkpointId] = JSON.parse(key);
                    return { threadId, checkpointNamespace, checkpointId };
                };

                type ThreadCheckpointData = {
                    storage: CheckpointStorage;
                    writes: CheckpointWrites;
                    flushQueue: Promise<void>;
                    flushCounter: number;
                };

                class FileCheckpointSaver extends BaseCheckpointSaver {
                    private readonly threads = new Map<string, ThreadCheckpointData>();

                    constructor(
                        private readonly rootDir: string,
                        private readonly legacyFilePath: string,
                        private readonly log: (message: string) => void,
                    ) {
                        super();
                    }

                    private threadFilePath(threadId: string): string {
                        return path.join(this.rootDir, encodeURIComponent(threadId), 'state.json');
                    }

                    private createEmptyThreadData(): ThreadCheckpointData {
                        return {
                            storage: {},
                            writes: {},
                            flushQueue: Promise.resolve(),
                            flushCounter: 0,
                        };
                    }

                    private loadThread(threadId: string, options: { allowLegacy?: boolean } = {}): ThreadCheckpointData {
                        const cached = this.threads.get(threadId);
                        if (cached) return cached;

                        const filePath = this.threadFilePath(threadId);
                        let data = this.loadShardedThread(filePath);
                        if (!data && options.allowLegacy) {
                            data = this.loadLegacyThread(threadId);
                            if (data) {
                                const checkpointCount = Object.values(data.storage[threadId] ?? {})
                                    .reduce((count, checkpoints) => count + Object.keys(checkpoints).length, 0);
                                this.log(`[n8n-agent-debug] migrated legacy langgraph checkpoints threadId=${threadId} checkpoints=${checkpointCount} writes=${Object.keys(data.writes).length}`);
                                void this.flushThread(threadId, data).catch((error: any) => {
                                    this.log(`[n8n-agent] Failed to persist migrated langgraph checkpoints threadId=${threadId}: ${error?.message || String(error)}`);
                                });
                            }
                        }
                        data ??= this.createEmptyThreadData();
                        this.threads.set(threadId, data);
                        return data;
                    }

                    private loadShardedThread(filePath: string): ThreadCheckpointData | undefined {
                        try {
                            const raw = fs.readFileSync(filePath, 'utf8');
                            const data = JSON.parse(raw);
                            return {
                                storage: data.storage && typeof data.storage === 'object' ? data.storage : {},
                                writes: data.writes && typeof data.writes === 'object' ? data.writes : {},
                                flushQueue: Promise.resolve(),
                                flushCounter: 0,
                            };
                        } catch {
                            return undefined;
                        }
                    }

                    private loadLegacyThread(threadId: string): ThreadCheckpointData | undefined {
                        if (!fs.existsSync(this.legacyFilePath)) return undefined;
                        const startedAt = Date.now();
                        try {
                            const raw = fs.readFileSync(this.legacyFilePath, 'utf8');
                            const legacy = JSON.parse(raw);
                            const storageForThread = legacy.storage?.[threadId];
                            const writesForThread: CheckpointWrites = {};
                            for (const [key, value] of Object.entries((legacy.writes || {}) as CheckpointWrites)) {
                                try {
                                    if (parseKey(key).threadId === threadId) {
                                        writesForThread[key] = value;
                                    }
                                } catch {
                                    // Ignore malformed legacy write keys.
                                }
                            }
                            this.log(`[n8n-agent-debug] loaded legacy langgraph checkpoint file threadId=${threadId} elapsedMs=${Date.now() - startedAt} sizeBytes=${raw.length}`);
                            if (!storageForThread && !Object.keys(writesForThread).length) return undefined;
                            return {
                                storage: storageForThread ? { [threadId]: storageForThread } : {},
                                writes: writesForThread,
                                flushQueue: Promise.resolve(),
                                flushCounter: 0,
                            };
                        } catch (error: any) {
                            this.log(`[n8n-agent] Failed to load legacy langgraph checkpoints threadId=${threadId}: ${error?.message || String(error)}`);
                            return undefined;
                        }
                    }

                    private encodeSerializedValue(value: unknown): string {
                        if (typeof value === 'string') return value;
                        if (value instanceof Uint8Array) {
                            return new TextDecoder().decode(value);
                        }
                        if (value instanceof ArrayBuffer) {
                            return new TextDecoder().decode(value);
                        }
                        if (ArrayBuffer.isView(value)) {
                            return new TextDecoder().decode(value as ArrayBufferView);
                        }
                        return this.decodeLegacySerializedValue(value);
                    }

                    private decodeLegacySerializedValue(value: unknown): string {
                        if (typeof value === 'string') return value;
                        if (!value || typeof value !== 'object') return String(value ?? '');
                        const entries = Object.entries(value as Record<string, unknown>);
                        if (!entries.length || !entries.every(([key, byte]) => /^\d+$/.test(key) && typeof byte === 'number')) {
                            return JSON.stringify(value);
                        }
                        const bytes = entries
                            .sort(([left], [right]) => Number(left) - Number(right))
                            .map(([, byte]) => Number(byte));
                        return new TextDecoder().decode(Uint8Array.from(bytes));
                    }

                    private async flushThread(threadId: string, threadData: ThreadCheckpointData): Promise<void> {
                        const filePath = this.threadFilePath(threadId);
                        const flushStartedAt = Date.now();
                        const flushTask = threadData.flushQueue.then(async () => {
                            await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
                            const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${threadData.flushCounter++}.tmp`;
                            const payload = JSON.stringify({
                                version: 2,
                                storage: threadData.storage,
                                writes: threadData.writes,
                            });
                            await fs.promises.writeFile(tmpPath, payload, 'utf8');
                            await fs.promises.rename(tmpPath, filePath);
                            const elapsedMs = Date.now() - flushStartedAt;
                            if (elapsedMs > 500) {
                                this.log(`[n8n-agent-debug] langgraph checkpoint shard flush slow threadId=${threadId} elapsedMs=${elapsedMs} sizeBytes=${payload.length}`);
                            }
                        });
                        threadData.flushQueue = flushTask.catch(() => undefined);
                        await flushTask;
                    }

                    async getTuple(config: Record<string, any>): Promise<any> {
                        const threadId = config.configurable?.thread_id;
                        const checkpointNamespace = config.configurable?.checkpoint_ns ?? '';
                        if (!threadId) return undefined;

                        let checkpointId = getCheckpointId(config);
                        const threadData = this.loadThread(threadId, { allowLegacy: Boolean(checkpointId) });
                        if (!checkpointId) {
                            const checkpoints = threadData.storage[threadId]?.[checkpointNamespace];
                            if (!checkpoints) return undefined;
                            checkpointId = Object.keys(checkpoints).sort((a, b) => b.localeCompare(a))[0];
                        }

                        const saved = threadData.storage[threadId]?.[checkpointNamespace]?.[checkpointId];
                        if (!saved) return undefined;

                        const [checkpoint, metadata, parentCheckpointId] = saved;
                        const key = generateKey(threadId, checkpointNamespace, checkpointId);
                        const pendingWrites = await Promise.all(Object.values(threadData.writes[key] || {}).map(async ([taskId, channel, value]) => [
                            taskId,
                            channel,
                            await this.serde.loadsTyped('json', this.decodeLegacySerializedValue(value)),
                        ]));
                        const checkpointTuple: any = {
                            config: { configurable: { thread_id: threadId, checkpoint_ns: checkpointNamespace, checkpoint_id: checkpointId } },
                            checkpoint: await this.serde.loadsTyped('json', this.decodeLegacySerializedValue(checkpoint)),
                            metadata: await this.serde.loadsTyped('json', this.decodeLegacySerializedValue(metadata)),
                            pendingWrites,
                        };
                        if (parentCheckpointId !== undefined) {
                            checkpointTuple.parentConfig = { configurable: { thread_id: threadId, checkpoint_ns: checkpointNamespace, checkpoint_id: parentCheckpointId } };
                        }
                        return checkpointTuple;
                    }

                    async *list(config: Record<string, any>, options?: { before?: Record<string, any>; limit?: number; filter?: Record<string, unknown> }): AsyncIterable<any> {
                        let { before, limit, filter } = options ?? {};
                        const threadIds = config.configurable?.thread_id
                            ? [config.configurable.thread_id]
                            : fs.existsSync(this.rootDir)
                                ? fs.readdirSync(this.rootDir).map((entry) => decodeURIComponent(entry))
                                : [];
                        const configCheckpointNamespace = config.configurable?.checkpoint_ns;
                        const configCheckpointId = config.configurable?.checkpoint_id;

                        for (const threadId of threadIds) {
                            const threadData = this.loadThread(threadId, { allowLegacy: Boolean(configCheckpointId) });
                            for (const checkpointNamespace of Object.keys(threadData.storage[threadId] ?? {})) {
                                if (configCheckpointNamespace !== undefined && checkpointNamespace !== configCheckpointNamespace) continue;
                                const checkpoints = threadData.storage[threadId]?.[checkpointNamespace] ?? {};
                                const sortedCheckpoints = Object.entries(checkpoints).sort((a, b) => b[0].localeCompare(a[0]));
                                for (const [checkpointId, [checkpoint, metadataStr, parentCheckpointId]] of sortedCheckpoints) {
                                    if (configCheckpointId && checkpointId !== configCheckpointId) continue;
                                    if (before?.configurable?.checkpoint_id && checkpointId >= before.configurable.checkpoint_id) continue;
                                    const metadata = await this.serde.loadsTyped('json', this.decodeLegacySerializedValue(metadataStr));
                                    if (filter && !Object.entries(filter).every(([key, value]) => metadata?.[key] === value)) continue;
                                    if (limit !== undefined) {
                                        if (limit <= 0) break;
                                        limit -= 1;
                                    }
                                    const key = generateKey(threadId, checkpointNamespace, checkpointId);
                                    const pendingWrites = await Promise.all(Object.values(threadData.writes[key] || {}).map(async ([taskId, channel, value]) => [
                                        taskId,
                                        channel,
                                        await this.serde.loadsTyped('json', this.decodeLegacySerializedValue(value)),
                                    ]));
                                    const checkpointTuple: any = {
                                        config: { configurable: { thread_id: threadId, checkpoint_ns: checkpointNamespace, checkpoint_id: checkpointId } },
                                        checkpoint: await this.serde.loadsTyped('json', this.decodeLegacySerializedValue(checkpoint)),
                                        metadata,
                                        pendingWrites,
                                    };
                                    if (parentCheckpointId !== undefined) {
                                        checkpointTuple.parentConfig = { configurable: { thread_id: threadId, checkpoint_ns: checkpointNamespace, checkpoint_id: parentCheckpointId } };
                                    }
                                    yield checkpointTuple;
                                }
                            }
                        }
                    }

                    async put(config: Record<string, any>, checkpoint: Record<string, any>, metadata: Record<string, unknown>): Promise<Record<string, unknown>> {
                        const preparedCheckpoint = copyCheckpoint(checkpoint);
                        const threadId = config.configurable?.thread_id;
                        const checkpointNamespace = config.configurable?.checkpoint_ns ?? '';
                        if (!threadId) {
                            throw new Error('Failed to put checkpoint. The passed RunnableConfig is missing configurable.thread_id.');
                        }
                        const threadData = this.loadThread(threadId);
                        threadData.storage[threadId] ??= {};
                        threadData.storage[threadId][checkpointNamespace] ??= {};
                        const [[, serializedCheckpoint], [, serializedMetadata]] = await Promise.all([
                            this.serde.dumpsTyped(preparedCheckpoint),
                            this.serde.dumpsTyped(metadata),
                        ]);
                        threadData.storage[threadId][checkpointNamespace][checkpoint.id] = [
                            this.encodeSerializedValue(serializedCheckpoint),
                            this.encodeSerializedValue(serializedMetadata),
                            config.configurable?.checkpoint_id,
                        ];
                        await this.flushThread(threadId, threadData);
                        return { configurable: { thread_id: threadId, checkpoint_ns: checkpointNamespace, checkpoint_id: checkpoint.id } };
                    }

                    async putWrites(config: Record<string, any>, writes: [string, unknown][], taskId: string): Promise<void> {
                        const threadId = config.configurable?.thread_id;
                        const checkpointNamespace = config.configurable?.checkpoint_ns ?? '';
                        const checkpointId = config.configurable?.checkpoint_id;
                        if (!threadId) {
                            throw new Error('Failed to put writes. The passed RunnableConfig is missing configurable.thread_id.');
                        }
                        if (!checkpointId) {
                            throw new Error('Failed to put writes. The passed RunnableConfig is missing configurable.checkpoint_id.');
                        }
                        const outerKey = generateKey(threadId, checkpointNamespace, checkpointId);
                        const threadData = this.loadThread(threadId);
                        const existingWrites = threadData.writes[outerKey];
                        threadData.writes[outerKey] ??= {};
                        await Promise.all(writes.map(async ([channel, value], idx) => {
                            const [, serializedValue] = await this.serde.dumpsTyped(value);
                            const writeIndex = writesIndexMap[channel] ?? idx;
                            const innerKey = `${taskId},${writeIndex}`;
                            if (writeIndex >= 0 && existingWrites && innerKey in existingWrites) return;
                            threadData.writes[outerKey][innerKey] = [taskId, channel, this.encodeSerializedValue(serializedValue)];
                        }));
                        await this.flushThread(threadId, threadData);
                    }

                    async deleteThread(threadId: string): Promise<void> {
                        const threadData = this.createEmptyThreadData();
                        this.threads.set(threadId, threadData);
                        await this.flushThread(threadId, threadData);
                    }
                }

                return new FileCheckpointSaver(checkpointRoot, legacyCheckpointPath, (message) => this.outputChannel.appendLine(message)) as RuntimeCheckpointer;
            })();
        }
        return this.checkpointerPromise;
    }

    private buildAgentBackendEnv(): Record<string, string> {
        return {
            PATH: process.env.PATH || '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
        };
    }

    private createStreamAccumulator(): { responseText: string; thinkingText: string; thinkingOperationId?: string } {
        return { responseText: '', thinkingText: '' };
    }

    private shouldShowToolOperation(toolName: string): boolean {
        return !['ls', 'glob', 'grep'].includes(toolName);
    }

    private categorizeTool(toolName: string): string {
        const normalized = toolName.toLowerCase();
        if (normalized.includes('todo')) return 'todo';
        if (normalized.includes('write') || normalized.includes('edit') || normalized.includes('delete') || normalized.includes('move')) return 'file-write';
        if (normalized.includes('read')) return 'file-read';
        if (normalized.includes('shell') || normalized.includes('execute')) return 'shell';
        return 'tool';
    }

    private formatToolLabel(toolName: string): string {
        return toolName.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
    }

    private extractCommandFromToolPayload(value: unknown): string | undefined {
        const visited = new Set<unknown>();
        const visit = (candidate: unknown): string | undefined => {
            if (candidate === undefined || candidate === null || visited.has(candidate)) return undefined;
            if (typeof candidate === 'string') {
                const trimmed = candidate.trim();
                if (!trimmed) return undefined;
                if ((trimmed.startsWith('{') || trimmed.startsWith('['))) {
                    try {
                        return visit(JSON.parse(trimmed));
                    } catch {
                        return trimmed.includes('\n') ? undefined : trimmed;
                    }
                }
                return trimmed.includes('\n') ? undefined : trimmed;
            }
            if (Array.isArray(candidate)) {
                for (const item of candidate) {
                    const command = visit(item);
                    if (command) return command;
                }
                return undefined;
            }
            if (typeof candidate === 'object') {
                visited.add(candidate);
                const record = candidate as Record<string, unknown>;
                for (const key of ['command', 'cmd', 'shell', 'script']) {
                    if (typeof record[key] === 'string' && record[key].trim()) return record[key].trim();
                }
                for (const key of ['input', 'args', 'kwargs']) {
                    const command = visit(record[key]);
                    if (command) return command;
                }
            }
            return undefined;
        };
        return visit(value);
    }

    private extractFilePathFromToolPayload(value: unknown): string | undefined {
        const visited = new Set<unknown>();
        const visit = (candidate: unknown): string | undefined => {
            if (candidate === undefined || candidate === null || visited.has(candidate)) return undefined;
            if (typeof candidate === 'string') {
                const trimmed = candidate.trim();
                if (!trimmed) return undefined;
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    try {
                        return visit(JSON.parse(trimmed));
                    } catch {
                        return undefined;
                    }
                }
                return undefined;
            }
            if (Array.isArray(candidate)) {
                for (const item of candidate) {
                    const filePath = visit(item);
                    if (filePath) return filePath;
                }
                return undefined;
            }
            if (typeof candidate === 'object') {
                visited.add(candidate);
                const record = candidate as Record<string, unknown>;
                for (const key of ['file_path', 'filePath', 'path']) {
                    if (typeof record[key] === 'string' && record[key].trim()) return record[key].trim();
                }
                for (const key of ['input', 'args', 'kwargs']) {
                    const filePath = visit(record[key]);
                    if (filePath) return filePath;
                }
            }
            return undefined;
        };
        return visit(value);
    }

    private extractTodoSummary(value: unknown): string | undefined {
        const todos = this.extractTodosFromPayload(value);
        if (!todos.length) return undefined;
        const counts = todos.reduce<Record<string, number>>((acc, todo) => {
            const status = String(todo.status || 'pending');
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});
        return [
            `${todos.length} todo${todos.length === 1 ? '' : 's'}`,
            counts.in_progress ? `${counts.in_progress} in progress` : undefined,
            counts.pending ? `${counts.pending} pending` : undefined,
            counts.completed ? `${counts.completed} completed` : undefined,
        ].filter(Boolean).join(' · ');
    }

    private extractTodosFromPayload(value: unknown): Array<{ content?: unknown; status?: unknown }> {
        const visited = new Set<unknown>();
        const visit = (candidate: unknown): Array<{ content?: unknown; status?: unknown }> => {
            if (candidate === undefined || candidate === null || visited.has(candidate)) return [];
            if (typeof candidate === 'string') {
                const trimmed = candidate.trim();
                if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return [];
                try {
                    return visit(JSON.parse(trimmed));
                } catch {
                    return [];
                }
            }
            if (Array.isArray(candidate)) {
                if (candidate.every((item) => item && typeof item === 'object' && 'content' in item)) {
                    return candidate as Array<{ content?: unknown; status?: unknown }>;
                }
                return candidate.flatMap((item) => visit(item));
            }
            if (typeof candidate === 'object') {
                visited.add(candidate);
                const record = candidate as Record<string, unknown>;
                if (Array.isArray(record.todos)) return visit(record.todos);
                for (const key of ['update', 'input', 'args', 'kwargs']) {
                    const todos = visit(record[key]);
                    if (todos.length) return todos;
                }
            }
            return [];
        };
        return visit(value);
    }

    private stringifyToolOutput(value: unknown): string | undefined {
        const extracted = this.extractToolMessageContent(value);
        return extracted ?? this.stringifyToolPayload(value);
    }

    private extractToolMessageContent(value: unknown): string | undefined {
        if (value === undefined || value === null) return undefined;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return undefined;
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try {
                    return this.extractToolMessageContent(JSON.parse(trimmed));
                } catch {
                    return trimmed;
                }
            }
            return trimmed;
        }
        if (Array.isArray(value)) {
            const parts = value.map((item) => this.extractToolMessageContent(item)).filter(Boolean);
            return parts.length ? parts.join('\n') : undefined;
        }
        if (typeof value === 'object') {
            const record = value as Record<string, unknown>;
            const kwargs = record.kwargs && typeof record.kwargs === 'object' ? record.kwargs as Record<string, unknown> : undefined;
            if (typeof kwargs?.content === 'string') return kwargs.content.trim() || undefined;
            if (typeof record.content === 'string') return record.content.trim() || undefined;
            if (Array.isArray(record.content)) return this.extractToolMessageContent(record.content);
            if (record.output !== undefined) return this.extractToolMessageContent(record.output);
        }
        return undefined;
    }

    private stringifyToolPayload(value: unknown): string | undefined {
        if (value === undefined || value === null) return undefined;
        if (typeof value === 'string') return value;
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    private extractCompactionSummary(value: unknown): AgentCompactionSummary | undefined {
        if (!this.isRecord(value)) return undefined;
        if (typeof value.summary !== 'string' && typeof value.compaction !== 'object') return undefined;
        return this.toCompactionSummary(this.isRecord(value.compaction) ? value.compaction : value);
    }

    private async summarizeSessionForCompaction(
        sessionId: string,
        input: Omit<AgentPromptInput, 'prompt'>,
        entries: AgentTimelineEntry[],
        signal: AbortSignal,
    ): Promise<AgentCompactionSummary> {
        const text = entries
            .map((entry) => this.getEntryText(entry))
            .filter(Boolean)
            .join('\n\n')
            .slice(-16_000);
        if (!text.trim()) {
            return {
                summary: 'No conversation content was available to compact.',
                source: 'fallback',
                messagesCompacted: 0,
                preservedRecentMessages: 0,
            };
        }
        try {
            const providerRegistry = await this.loadAgentProviderRegistry();
            const providerConfig = await this.getProviderRuntimeConfig(providerRegistry);
            if (!providerConfig.ready) throw new Error(providerConfig.reason || 'Provider is not ready.');
            const model = await this.createLangChainModel(providerConfig);
            const response = await model.invoke([
                { role: 'user', content: `Summarize this Workbench conversation for future agent context. Keep key decisions, files, workflow context, and next steps.\n\n${text}` },
            ], { signal });
            return {
                summary: this.extractAgentText({ messages: [response] }) || 'Context compacted.',
                source: 'llm',
                messagesCompacted: entries.length,
                preservedRecentMessages: Math.min(4, entries.length),
            };
        } catch (error: any) {
            return {
                summary: `Context compaction fallback: ${text.slice(-1200)}`,
                source: 'fallback',
                messagesCompacted: entries.length,
                preservedRecentMessages: Math.min(4, entries.length),
                fallbackReason: error?.message || String(error),
            };
        }
    }

    private async ensureAgentHandleWithCheckpoint(input: Omit<AgentPromptInput, 'prompt'>): Promise<any> {
        const providerRegistry = await this.loadAgentProviderRegistry();
        const providerConfig = await this.getProviderRuntimeConfig(providerRegistry);
        if (!providerConfig.ready) {
            throw new Error(providerConfig.reason || 'Agent provider is not ready.');
        }
        const handle = await this.getDeepAgentHandle(providerConfig, { ...input, prompt: '' });
        const sessions = await this.getSessionRuntime();
        sessions.service.setCheckpointer(handle.checkpointer);
        return handle;
    }

    private async resolveContextWindow(provider: string, model?: string, apiKey?: string, baseUrl?: string): Promise<number> {
        if (!model) {
            return DEFAULT_CONTEXT_WINDOW_TOKENS;
        }
        try {
            const metadata = await importRuntimeModule('@yagr/provider-runtime');
            const entry = await metadata.primeProviderModelMetadata(provider as any, model, apiKey, baseUrl);
            return Number(entry?.contextWindow || DEFAULT_CONTEXT_WINDOW_TOKENS);
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
