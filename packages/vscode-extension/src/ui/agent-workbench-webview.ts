import * as vscode from 'vscode';
import * as fs from 'fs';
import { IWorkflowStatus } from 'n8nac';
import { AgentRuntimeController, type AgentWorkbenchMessage, type AgentWorkflowContext } from '../services/agent-runtime-controller.js';
import { workflowWebviewRegistry } from '../services/workflow-webview-registry.js';
import { buildAgentWorkbenchHtml } from './agent-workbench-html.js';

interface AgentWorkbenchNodeContext {
    name: string;
    type?: string;
    id?: string;
}

interface AgentWorkflowTarget {
    workflow?: IWorkflowStatus;
    workflowFilePath?: string;
    workflowUrl?: string;
    workflowReloadUrl?: string;
}

interface AgentWorkbenchWorkflowProviders {
    listWorkflows(): Promise<IWorkflowStatus[]>;
    resolveWorkflow(workflow: AgentWorkflowContext): Promise<AgentWorkflowTarget>;
    listWorkflowNodes(workflow: AgentWorkflowContext): Promise<AgentWorkbenchNodeContext[]>;
    listProviderOptions(): Promise<Array<Record<string, unknown>>>;
    listModelOptions(provider: string): Promise<Array<Record<string, unknown>>>;
    selectProviderModel(provider: string, model: string): Promise<void>;
    selectReasoningEffort(effort: string): Promise<void>;
}

export class AgentWorkbenchWebview {
    private static readonly _panels = new Map<string, AgentWorkbenchWebview>();
    private static _lastActiveSessionId: string | undefined;
    private static _clipboardPasteHandler: ((panel: vscode.WebviewPanel, grantToken: string) => Promise<void>) | undefined;

    private readonly _panel: vscode.WebviewPanel;
    private readonly _context: vscode.ExtensionContext;
    private readonly _agentRuntime: AgentRuntimeController;
    private readonly _outputChannel: vscode.OutputChannel;
    private readonly _disposables: vscode.Disposable[] = [];
    private _registryDisposable: { dispose(): void } | undefined;
    private _workflow: IWorkflowStatus | undefined;
    private _workflowFilePath: string | undefined;
    private _workflowUrl: string | undefined;
    private _workflowReloadUrl: string | undefined;
    private _providerModelLabel: string;
    private _nodeContexts: AgentWorkbenchNodeContext[] = [];
    private _workflowProviders: AgentWorkbenchWorkflowProviders;
    private _activeSessionId: string | undefined;
    private _stateSequence = 0;

    private constructor(
        panel: vscode.WebviewPanel,
        context: vscode.ExtensionContext,
        workflow: IWorkflowStatus | undefined,
        workflowFilePath: string | undefined,
        workflowUrl: string | undefined,
        workflowReloadUrl: string | undefined,
        providerModelLabel: string,
        agentRuntime: AgentRuntimeController,
        outputChannel: vscode.OutputChannel,
        workflowProviders: AgentWorkbenchWorkflowProviders,
        initialSessionId: string | undefined,
    ) {
        this._panel = panel;
        this._context = context;
        this._workflow = workflow;
        this._workflowFilePath = workflowFilePath;
        this._workflowUrl = workflowUrl;
        this._workflowReloadUrl = workflowReloadUrl;
        this._providerModelLabel = providerModelLabel;
        this._agentRuntime = agentRuntime;
        this._outputChannel = outputChannel;
        this._workflowProviders = workflowProviders;
        this._activeSessionId = initialSessionId;
        this.updateRegistryRegistration();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.onDidChangeViewState((event) => {
            const isVisible = event.webviewPanel.visible;
            void this._panel.webview.postMessage({
                type: 'panel.visibility',
                visible: isVisible,
            });
            if (event.webviewPanel.active && this._activeSessionId) {
                AgentWorkbenchWebview._lastActiveSessionId = this._activeSessionId;
            }
            if (isVisible) {
                void this.postWorkbenchState();
            }
        }, null, this._disposables);
        this._panel.webview.onDidReceiveMessage((message) => {
            void this.handleMessage(message).catch((error: any) => {
                const detail = error?.message || String(error);
                console.error('[AgentWorkbench] Message handler error', error);
                void this._panel.webview.postMessage({ type: 'agent.streamEvent', event: { type: 'error', error: detail } });
            });
        }, null, this._disposables);
        this._panel.webview.html = this.getHtmlForWebview();
    }

    public static createOrShow(
        context: vscode.ExtensionContext,
        workflow: IWorkflowStatus | undefined,
        workflowFilePath: string | undefined,
        workflowUrl: string | undefined,
        workflowReloadUrl: string | undefined,
        providerModelLabel: string,
        agentRuntime: AgentRuntimeController,
        outputChannel: vscode.OutputChannel,
        workflowProviders: AgentWorkbenchWorkflowProviders,
        initialSessionId?: string,
        viewColumn?: vscode.ViewColumn,
    ): void {
        const column = viewColumn || vscode.ViewColumn.One;

        if (initialSessionId) {
            const existingPanel = AgentWorkbenchWebview._panels.get(initialSessionId);
            if (existingPanel) {
                existingPanel._panel.reveal(column);
                existingPanel._workflowProviders = workflowProviders;
                existingPanel.update(workflow, workflowFilePath, workflowUrl, workflowReloadUrl, providerModelLabel);
                return;
            }
        }

        const panel = vscode.window.createWebviewPanel(
            'n8nAgentWorkbench',
            `n8n Agent: ${workflow?.name || 'New workflow'}`,
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [],
            },
        );

        const workbench = new AgentWorkbenchWebview(panel, context, workflow, workflowFilePath, workflowUrl, workflowReloadUrl, providerModelLabel, agentRuntime, outputChannel, workflowProviders, initialSessionId);
        if (initialSessionId) {
            AgentWorkbenchWebview._panels.set(initialSessionId, workbench);
            AgentWorkbenchWebview._lastActiveSessionId = initialSessionId;
        }
    }

    public static onClipboardPasteRequest(handler: (panel: vscode.WebviewPanel, grantToken: string) => Promise<void>): void {
        AgentWorkbenchWebview._clipboardPasteHandler = handler;
    }

    public static getCurrentActiveSessionId(): string | undefined {
        return AgentWorkbenchWebview._lastActiveSessionId;
    }

    public update(workflow: IWorkflowStatus | undefined, workflowFilePath: string | undefined, workflowUrl: string | undefined, workflowReloadUrl: string | undefined, providerModelLabel: string, postState = true): void {
        const hadWorkflowFrame = Boolean(this._workflow);
        const hasWorkflowFrame = Boolean(workflow);
        const hadWorkflowUi = Boolean(this._workflowUrl);
        const hasWorkflowUi = Boolean(workflowUrl);
        this._workflow = workflow;
        this._workflowFilePath = workflowFilePath;
        this._workflowUrl = workflowUrl;
        this._workflowReloadUrl = workflowReloadUrl;
        this._providerModelLabel = providerModelLabel;
        this.updateRegistryRegistration();
        this._panel.title = `n8n Agent: ${workflow?.name || 'New workflow'}`;

        if (hadWorkflowFrame !== hasWorkflowFrame || hadWorkflowUi !== hasWorkflowUi) {
            this._panel.webview.html = this.getHtmlForWebview();
            return;
        }

        this._panel.webview.postMessage({
            type: 'workflow.update',
            workflowId: workflow?.id || '',
            workflowName: workflow?.name || 'New workflow',
            url: workflowUrl,
            reloadUrl: workflowReloadUrl,
        });
        if (postState) void this.postWorkbenchState();
    }

    public dispose(): void {
        if (this._activeSessionId) {
            AgentWorkbenchWebview._panels.delete(this._activeSessionId);
            if (AgentWorkbenchWebview._lastActiveSessionId === this._activeSessionId) {
                AgentWorkbenchWebview._lastActiveSessionId = undefined;
            }
        }
        this._registryDisposable?.dispose();
        this._registryDisposable = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            disposable?.dispose();
        }
    }

    private async handleMessage(message: unknown): Promise<void> {
        if (!message || typeof message !== 'object') {
            return;
        }
        const payload = message as Record<string, unknown>;

        if (payload.type === 'agent.ready') {
            this._outputChannel.appendLine(`[n8n-agent-debug] webview ready workflowId=${this._workflow?.id || 'none'} workflowFilePath=${this._workflowFilePath || 'none'}`);
            await this.postWorkbenchState();
            return;
        }

        if (payload.type === 'workflow.reloadAck') {
            this._outputChannel.appendLine(`[n8n-agent-debug] webview received workflow.reload workflowId=${String(payload.workflowId || this._workflow?.id || 'none')} hasFrame=${String(Boolean(payload.hasFrame))} url=${String(payload.url || this._workflowReloadUrl || this._workflowUrl || '')}`);
            return;
        }

        if (payload.type === 'clipboard-write' && typeof payload.text === 'string') {
            try {
                await vscode.env.clipboard.writeText(payload.text);
            } catch (error) {
                console.error('[AgentWorkbench] Clipboard write error', error);
            }
            return;
        }

        if (payload.type === 'clipboard-paste-request' && typeof payload.grantToken === 'string') {
            void AgentWorkbenchWebview._clipboardPasteHandler?.(this._panel, payload.grantToken)
                ?.catch(error => console.error('[AgentWorkbench] Clipboard paste handler error', error));
            return;
        }

        if (payload.type === 'agent.send' || payload.type === 'agent.queue' || payload.type === 'agent.steer') {
            const nodeContexts = this.sanitizeNodeContexts(payload.nodeContexts) || this.sanitizeNodeContexts(payload.nodeContext) || this._nodeContexts;
            this._outputChannel.appendLine(`[n8n-agent-debug] ${payload.type} workflowId=${this._workflow?.id || 'none'} workflowFilePath=${this._workflowFilePath || 'none'} sessionId=${typeof payload.sessionId === 'string' ? payload.sessionId : 'none'}`);
            const input = {
                prompt: String(payload.text || ''),
                workflowId: this._workflow?.id,
                workflowName: this._workflow?.name,
                workflowFilename: this._workflow?.filename,
                workflowFilePath: this._workflowFilePath,
                workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
                nodeContext: nodeContexts[0],
                nodeContexts,
                sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined,
            };
            const result = payload.type === 'agent.send'
                ? await this._agentRuntime.sendPrompt(input, (event) => this.postAgentRuntimeMessage(event))
                : await this._agentRuntime.queuePrompt(input, (event) => this.postAgentRuntimeMessage(event), payload.type === 'agent.steer' ? 'steer' : 'pending');
            this._outputChannel.appendLine(`[n8n-agent-debug] ${payload.type} completed workflowId=${this._workflow?.id || 'none'} workflowChanged=${String(result.workflowChanged)}`);
            return;
        }

        if (payload.type === 'agent.selectModel') {
            const provider = typeof payload.provider === 'string' ? payload.provider : this.readSelectedProvider();
            await this._panel.webview.postMessage({
                type: 'agent.providerModels',
                provider,
                models: await this._workflowProviders.listModelOptions(provider),
            });
            return;
        }

        if (payload.type === 'agent.providers.configure') {
            await vscode.commands.executeCommand('n8n.openAgentManager');
            return;
        }

        if (payload.type === 'agent.providers.refresh') {
            await this.postWorkbenchState();
            return;
        }

        if (payload.type === 'agent.workflow.select') {
            await vscode.commands.executeCommand('n8n.openAgentWorkbench');
            return;
        }

        if (payload.type === 'agent.selectReasoningEffort') {
            if (typeof payload.effort === 'string') {
                await this._workflowProviders.selectReasoningEffort(payload.effort);
                await this.postWorkbenchState();
            }
            return;
        }

        if (payload.type === 'agent.providerModel.select' && typeof payload.provider === 'string' && typeof payload.model === 'string') {
            await this._workflowProviders.selectProviderModel(payload.provider, payload.model);
            this._providerModelLabel = this.getProviderModelLabel();
            await this.postWorkbenchState();
            return;
        }

        if (payload.type === 'agent.nodeDetailChanged') {
            this._nodeContexts = this.sanitizeNodeContexts(payload.nodeContexts) || this.sanitizeNodeContexts(payload.nodeContext) || [];
            if (typeof payload.sessionId === 'string') {
                await this.postWorkbenchState(await this._agentRuntime.setNodeContexts(payload.sessionId, this._nodeContexts, this.buildWorkbenchInput()));
            }
            return;
        }

        if (payload.type === 'agent.context.workflow.set' && typeof payload.sessionId === 'string') {
            const workflow = this.sanitizeWorkflowContext(payload.workflow);
            if (!workflow) return;
            await this.postWorkbenchState(await this._agentRuntime.setWorkflowContext(payload.sessionId, workflow, this.buildWorkbenchInput()));
            return;
        }

        if (payload.type === 'agent.context.workflow.clear' && typeof payload.sessionId === 'string') {
            this._activeSessionId = payload.sessionId;
            this._nodeContexts = [];
            await this.postWorkbenchState(await this._agentRuntime.clearWorkflowContext(payload.sessionId, this.buildWorkbenchInput()));
            return;
        }

        if (payload.type === 'agent.stop') {
            const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : this._activeSessionId;
            await this._agentRuntime.stop((event) => this._panel.webview.postMessage(event), sessionId);
            return;
        }

        if (payload.type === 'agent.session.new') {
            const workflow = this.sanitizeWorkflowContext(payload.workflow);
            const input = workflow
                ? {
                    ...this.buildWorkbenchInput(),
                    workflowId: workflow.id,
                    workflowName: workflow.name,
                    workflowFilename: workflow.filename,
                    workflowFilePath: workflow.filePath,
                    nodeContext: undefined,
                    nodeContexts: undefined,
                }
                : {
                    ...this.buildWorkbenchInput(),
                    workflowId: undefined,
                    workflowName: undefined,
                    workflowFilename: undefined,
                    workflowFilePath: undefined,
                    nodeContext: undefined,
                    nodeContexts: undefined,
                };
            const state = await this._agentRuntime.createSession(input);
            await vscode.commands.executeCommand('n8n.openAgentWorkbench', { sessionId: state.activeSessionId, workflow });
            return;
        }

        if (payload.type === 'agent.session.select' && typeof payload.sessionId === 'string') {
            const sessionId = payload.sessionId;
            const existingPanel = AgentWorkbenchWebview._panels.get(sessionId);
            if (existingPanel) {
                existingPanel._panel.reveal();
            } else {
                await vscode.commands.executeCommand('n8n.openAgentWorkbench', { sessionId });
            }
            return;
        }

        if (payload.type === 'agent.session.rename' && typeof payload.sessionId === 'string' && typeof payload.title === 'string') {
            await this.postWorkbenchState(await this._agentRuntime.renameSession(payload.sessionId, payload.title, this.buildWorkbenchInput()));
            return;
        }

        if (payload.type === 'agent.session.delete' && typeof payload.sessionId === 'string') {
            await this.postWorkbenchState(await this._agentRuntime.deleteSession(payload.sessionId, this.buildWorkbenchInput()));
            return;
        }

        if (payload.type === 'agent.session.attach' && typeof payload.sessionId === 'string') {
            await this.postWorkbenchState(await this._agentRuntime.attachSessionToCurrentWorkflow(payload.sessionId, this.buildWorkbenchInput()));
            return;
        }

        if (payload.type === 'agent.session.detach' && typeof payload.sessionId === 'string') {
            await this.postWorkbenchState(await this._agentRuntime.detachSession(payload.sessionId, this.buildWorkbenchInput()));
            return;
        }

        if (payload.type === 'agent.message.rewind' && typeof payload.sessionId === 'string' && typeof payload.messageId === 'string') {
            const result = await this._agentRuntime.rewindToUserMessage(payload.sessionId, payload.messageId, this.buildWorkbenchInput());
            await this.postWorkbenchState(result.state);
            await this._panel.webview.postMessage({ type: 'agent.messageRewind', prompt: result.prompt });
            return;
        }

        if (payload.type === 'agent.checkpoint.save' && typeof payload.sessionId === 'string') {
            await this.postWorkbenchState(await this._agentRuntime.saveCheckpoint(payload.sessionId, this.buildWorkbenchInput()));
            return;
        }

        if (payload.type === 'agent.checkpoint.restore' && typeof payload.sessionId === 'string' && typeof payload.checkpointId === 'string') {
            await this.postWorkbenchState(await this._agentRuntime.restoreCheckpoint(payload.sessionId, payload.checkpointId, this.buildWorkbenchInput()));
            return;
        }

        if (payload.type === 'agent.checkpoint.delete' && typeof payload.sessionId === 'string' && typeof payload.checkpointId === 'string') {
            await this.postWorkbenchState(await this._agentRuntime.deleteCheckpoint(payload.sessionId, payload.checkpointId, this.buildWorkbenchInput()));
            return;
        }

        if (payload.type === 'agent.context.compact' && typeof payload.sessionId === 'string') {
            await this._panel.webview.postMessage({ type: 'agent.status', status: 'running', detail: 'Compacting context...' });
            await this._panel.webview.postMessage({
                type: 'agent.streamEvent',
                event: {
                    type: 'progress',
                    tone: 'info',
                    title: 'Compacting context',
                    detail: 'Requesting runtime context compaction',
                    phase: 'compaction',
                },
            });
            try {
                await this.postWorkbenchState(await this._agentRuntime.compactSession(payload.sessionId, this.buildWorkbenchInput()));
            } catch (error: any) {
                const message = error?.message || String(error);
                await this._panel.webview.postMessage({
                    type: 'agent.streamEvent',
                    event: {
                        type: 'progress',
                        tone: 'error',
                        title: 'Context compaction failed',
                        detail: message,
                        phase: 'compaction',
                    },
                });
                throw error;
            } finally {
                await this._panel.webview.postMessage({ type: 'agent.status', status: 'idle' });
            }
            return;
        }
    }

    private sanitizeNodeContext(value: unknown): AgentWorkbenchNodeContext | undefined {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return undefined;
        }
        const record = value as Record<string, unknown>;
        const name = typeof record.name === 'string' ? record.name.trim() : '';
        if (!name) {
            return undefined;
        }
        return {
            name,
            type: typeof record.type === 'string' ? record.type.trim() || undefined : undefined,
            id: typeof record.id === 'string' ? record.id.trim() || undefined : undefined,
        };
    }

    private sanitizeNodeContexts(value: unknown): AgentWorkbenchNodeContext[] | undefined {
        const values = Array.isArray(value) ? value : value ? [value] : [];
        const contexts = values
            .map((item) => this.sanitizeNodeContext(item))
            .filter((item): item is AgentWorkbenchNodeContext => Boolean(item));
        if (!contexts.length) return undefined;
        const seen = new Set<string>();
        return contexts.filter((node) => {
            const key = [node.name, node.type || '', node.id || ''].join('|');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    private sanitizeWorkflowContext(value: unknown): AgentWorkflowContext | undefined {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
        const record = value as Record<string, unknown>;
        const id = typeof record.id === 'string' ? record.id.trim() : '';
        const name = typeof record.name === 'string' ? record.name.trim() : '';
        const filename = typeof record.filename === 'string' ? record.filename.trim() : '';
        const filePath = typeof record.filePath === 'string' ? record.filePath.trim() : '';
        if (!id && !name && !filename) return undefined;
        return {
            id: id || undefined,
            name: name || id || filename,
            filename: filename || undefined,
            filePath: filePath || undefined,
        };
    }

    private getProviderModelLabel(): string {
        const config = vscode.workspace.getConfiguration('n8n.agent');
        const provider = this.readSelectedProvider();
        const model = String(config.get<string>('model') || '').trim();
        return model ? `${provider} / ${model}` : provider;
    }

    private readSelectedProvider(): string {
        const config = vscode.workspace.getConfiguration('n8n.agent');
        return String(config.get<string>('provider') || 'openai').trim() || 'openai';
    }

    private buildWorkbenchInput(): {
        workflowId?: string;
        workflowName?: string;
        workflowFilename?: string;
        workflowFilePath?: string;
        workspaceRoot?: string;
        nodeContext?: AgentWorkbenchNodeContext;
        nodeContexts?: AgentWorkbenchNodeContext[];
        sessionId?: string;
    } {
        return {
            workflowId: this._workflow?.id,
            workflowName: this._workflow?.name,
            workflowFilename: this._workflow?.filename,
            workflowFilePath: this._workflowFilePath,
            workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            nodeContext: this._nodeContexts[0],
            nodeContexts: this._nodeContexts,
            sessionId: this._activeSessionId,
        };
    }

    private async postWorkbenchState(
        state?: Awaited<ReturnType<AgentRuntimeController['getWorkbenchState']>>,
        options: { enrich?: boolean } = {},
    ): Promise<void> {
        const enrich = options.enrich !== false;
        const stateSequence = ++this._stateSequence;
        const nextState = state ?? await this._agentRuntime.getWorkbenchState(this.buildWorkbenchInput());
        const oldSessionId = this._activeSessionId;
        const newSessionId = nextState.activeSessionId;
        this._activeSessionId = newSessionId;
        this._nodeContexts = Array.isArray(nextState.currentNodeContexts) ? nextState.currentNodeContexts : [];

        if (oldSessionId && oldSessionId !== newSessionId) {
            AgentWorkbenchWebview._panels.delete(oldSessionId);
        }
        if (newSessionId) {
            AgentWorkbenchWebview._panels.set(newSessionId, this);
            if (this._panel.active) {
                AgentWorkbenchWebview._lastActiveSessionId = newSessionId;
            }
        }
        if (!enrich) {
            await this._panel.webview.postMessage({ type: 'agent.state', state: nextState, stateSequence });
            if (!nextState.isRunning) {
                void this.postWorkbenchState(undefined, { enrich: true })
                    .catch((error) => this._outputChannel.appendLine(`[n8n-agent] Background Workbench state enrichment failed: ${error?.message || String(error)}`));
            }
            return;
        }
        await this.reconcileWorkflowContext(nextState.workflowContext);
        const enrichedState = {
            ...nextState,
            availableWorkflows: await this.getWorkflowOptions(),
            availableNodes: await this.getWorkflowNodeOptions(),
            providerOptions: await this._workflowProviders.listProviderOptions().catch(() => []),
            modelOptions: await this._workflowProviders.listModelOptions(String(nextState.provider || '')).catch(() => []),
            reasoningOptions: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].map((effort) => ({
                id: effort,
                label: effort,
                selected: effort === nextState.reasoningEffort,
            })),
        };
        await this._panel.webview.postMessage({ type: 'agent.state', state: enrichedState, stateSequence });
    }

    private async postAgentRuntimeMessage(message: AgentWorkbenchMessage): Promise<boolean> {
        if (message.type === 'agent.state') {
            await this.postWorkbenchState(message.state, { enrich: false });
            return true;
        }
        return this._panel.webview.postMessage(message);
    }

    private async reconcileWorkflowContext(workflowContext: AgentWorkflowContext | undefined): Promise<void> {
        if (!workflowContext) {
            if (this._workflow || this._workflowUrl || this._workflowFilePath) {
                this.update(undefined, undefined, undefined, undefined, this._providerModelLabel, false);
            }
            return;
        }
        const currentKey = this._workflow?.id || this._workflow?.filename || this._workflow?.name || '';
        const nextKey = workflowContext.id || workflowContext.filename || workflowContext.name || '';
        if (currentKey === nextKey && this._workflowFilePath === workflowContext.filePath) {
            return;
        }
        const target = await this._workflowProviders.resolveWorkflow(workflowContext);
        const workflow = target.workflow || ({
            id: workflowContext.id || '',
            name: workflowContext.name,
            filename: workflowContext.filename || '',
        } as IWorkflowStatus);
        this.update(workflow, target.workflowFilePath || workflowContext.filePath, target.workflowUrl, target.workflowReloadUrl, this._providerModelLabel, false);
    }

    private async getWorkflowOptions(): Promise<AgentWorkflowContext[]> {
        const workflows = await this._workflowProviders.listWorkflows().catch(() => []);
        return workflows.map((workflow) => ({
            id: workflow.id || undefined,
            name: workflow.name || workflow.id || workflow.filename || 'Workflow',
            filename: workflow.filename || undefined,
        }));
    }

    private async getWorkflowNodeOptions(): Promise<AgentWorkbenchNodeContext[]> {
        if (this._workflowFilePath) {
            try {
                const raw = await fs.promises.readFile(this._workflowFilePath, 'utf8');
                return this.extractNodeContextsFromTypeScript(raw)
                    .filter((node): node is AgentWorkbenchNodeContext => Boolean(node));
            } catch {
                // Fall through to remote lookup when the local path is stale or unavailable.
            }
        }
        if (!this._workflow?.id) return [];
        return this._workflowProviders.listWorkflowNodes({
            id: this._workflow.id,
            name: this._workflow.name || this._workflow.id,
            filename: this._workflow.filename || undefined,
            filePath: this._workflowFilePath,
        }).catch(() => []);
    }

    private extractNodeContextsFromTypeScript(source: string): AgentWorkbenchNodeContext[] {
        const nodes: AgentWorkbenchNodeContext[] = [];
        const nodeDecoratorPattern = /@node\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
        let match: RegExpExecArray | null;
        while ((match = nodeDecoratorPattern.exec(source))) {
            const decoratorContent = match[1] || '';
            const name = this.extractStringProperty(decoratorContent, 'name');
            if (!name) continue;
            nodes.push({
                name,
                type: this.extractStringProperty(decoratorContent, 'type'),
                id: this.extractStringProperty(decoratorContent, 'id'),
            });
        }
        return nodes;
    }

    private extractStringProperty(source: string, property: string): string | undefined {
        const match = source.match(new RegExp(`${property}\\s*:\\s*(["'])((?:\\\\.|(?!\\1)[\\s\\S])*?)\\1`));
        return match?.[2]?.trim() || undefined;
    }

    private updateRegistryRegistration(): void {
        const workflowId = this._workflow?.id;
        if (!workflowId) {
            this._registryDisposable?.dispose();
            this._registryDisposable = undefined;
            return;
        }

        if (this._registryDisposable) {
            return;
        }

        this._registryDisposable = workflowWebviewRegistry.register({
            getWorkflowId: () => this._workflow?.id,
            describeTarget: () => `agent-workbench:${this._panel.title}`,
            reloadWorkflow: () => {
                this._outputChannel.appendLine(`[n8n-agent-debug] registry requested workflow.reload workflowId=${this._workflow?.id || 'none'} panel=${this._panel.title}`);
                return this._panel.webview.postMessage({ type: 'workflow.reload' });
            },
        });
        this._outputChannel.appendLine(`[n8n-agent-debug] registry registration ensured workflowId=${workflowId}`);
    }

    private getHtmlForWebview(): string {
        return buildAgentWorkbenchHtml({
            workflowId: this._workflow?.id || '',
            workflowName: this._workflow?.name || 'New workflow',
            workflowAttached: Boolean(this._workflow),
            workflowUrl: this._workflowUrl,
            workflowReloadUrl: this._workflowReloadUrl,
            providerModelLabel: this._providerModelLabel,
        });
    }
}
