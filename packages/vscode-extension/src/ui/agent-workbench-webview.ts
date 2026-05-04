import * as vscode from 'vscode';
import { IWorkflowStatus } from 'n8nac';
import { AgentRuntimeController } from '../services/agent-runtime-controller.js';
import { workflowWebviewRegistry } from '../services/workflow-webview-registry.js';
import { buildAgentWorkbenchHtml } from './agent-workbench-html.js';

interface AgentWorkbenchNodeContext {
    name: string;
    type?: string;
    id?: string;
}

export class AgentWorkbenchWebview {
    public static currentPanel: AgentWorkbenchWebview | undefined;

    private readonly _panel: vscode.WebviewPanel;
    private readonly _context: vscode.ExtensionContext;
    private readonly _agentRuntime: AgentRuntimeController;
    private readonly _disposables: vscode.Disposable[] = [];
    private _registryDisposable: { dispose(): void } | undefined;
    private _workflow: IWorkflowStatus | undefined;
    private _workflowFilePath: string | undefined;
    private _workflowUrl: string | undefined;
    private _workflowReloadUrl: string | undefined;
    private _providerModelLabel: string;
    private _nodeContext: AgentWorkbenchNodeContext | undefined;
    private _onClipboardPasteRequest: ((panel: vscode.WebviewPanel, grantToken: string) => Promise<void>) | undefined;

    private constructor(
        panel: vscode.WebviewPanel,
        context: vscode.ExtensionContext,
        workflow: IWorkflowStatus | undefined,
        workflowFilePath: string | undefined,
        workflowUrl: string | undefined,
        workflowReloadUrl: string | undefined,
        providerModelLabel: string,
        agentRuntime: AgentRuntimeController,
    ) {
        this._panel = panel;
        this._context = context;
        this._workflow = workflow;
        this._workflowFilePath = workflowFilePath;
        this._workflowUrl = workflowUrl;
        this._workflowReloadUrl = workflowReloadUrl;
        this._providerModelLabel = providerModelLabel;
        this._agentRuntime = agentRuntime;
        this.updateRegistryRegistration();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage((message) => {
            void this.handleMessage(message);
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
        viewColumn?: vscode.ViewColumn,
    ): void {
        const column = viewColumn || vscode.ViewColumn.One;

        if (AgentWorkbenchWebview.currentPanel) {
            AgentWorkbenchWebview.currentPanel._panel.reveal(column);
            AgentWorkbenchWebview.currentPanel.update(workflow, workflowFilePath, workflowUrl, workflowReloadUrl, providerModelLabel);
            return;
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

        AgentWorkbenchWebview.currentPanel = new AgentWorkbenchWebview(panel, context, workflow, workflowFilePath, workflowUrl, workflowReloadUrl, providerModelLabel, agentRuntime);
    }

    public static onClipboardPasteRequest(handler: (panel: vscode.WebviewPanel, grantToken: string) => Promise<void>): void {
        if (AgentWorkbenchWebview.currentPanel) {
            AgentWorkbenchWebview.currentPanel._onClipboardPasteRequest = handler;
        }
    }

    public update(workflow: IWorkflowStatus | undefined, workflowFilePath: string | undefined, workflowUrl: string | undefined, workflowReloadUrl: string | undefined, providerModelLabel: string): void {
        const hadWorkflowFrame = Boolean(this._workflowUrl);
        const hasWorkflowFrame = Boolean(workflowUrl);
        this._workflow = workflow;
        this._workflowFilePath = workflowFilePath;
        this._workflowUrl = workflowUrl;
        this._workflowReloadUrl = workflowReloadUrl;
        this._providerModelLabel = providerModelLabel;
        this.updateRegistryRegistration();
        this._panel.title = `n8n Agent: ${workflow?.name || 'New workflow'}`;

        if (hadWorkflowFrame !== hasWorkflowFrame) {
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
        void this.postWorkbenchState();
    }

    public dispose(): void {
        if (AgentWorkbenchWebview.currentPanel === this) {
            AgentWorkbenchWebview.currentPanel = undefined;
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
            await this.postWorkbenchState();
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
            void this._onClipboardPasteRequest?.(this._panel, payload.grantToken)
                ?.catch(error => console.error('[AgentWorkbench] Clipboard paste handler error', error));
            return;
        }

        if (payload.type === 'agent.send') {
            const nodeContext = this.sanitizeNodeContext(payload.nodeContext) ?? this._nodeContext;
            const result = await this._agentRuntime.sendPrompt({
                prompt: String(payload.text || ''),
                workflowId: this._workflow?.id,
                workflowName: this._workflow?.name,
                workflowFilename: this._workflow?.filename,
                workflowFilePath: this._workflowFilePath,
                workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
                nodeContext,
                sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined,
            }, (event) => this._panel.webview.postMessage(event));
            if (result.workflowChanged && this._workflow?.id) {
                await this._panel.webview.postMessage({ type: 'workflow.reload' });
            }
            return;
        }

        if (payload.type === 'agent.selectModel') {
            await vscode.commands.executeCommand('n8n.agent.selectModel');
            this._providerModelLabel = this.getProviderModelLabel();
            await this.postWorkbenchState();
            return;
        }

        if (payload.type === 'agent.workflow.select') {
            await vscode.commands.executeCommand('n8n.openAgentWorkbench');
            return;
        }

        if (payload.type === 'agent.selectReasoningEffort') {
            await vscode.commands.executeCommand('n8n.agent.selectReasoningEffort');
            await this.postWorkbenchState();
            return;
        }

        if (payload.type === 'agent.nodeDetailChanged') {
            this._nodeContext = this.sanitizeNodeContext(payload.nodeContext);
            return;
        }

        if (payload.type === 'agent.stop') {
            await this._agentRuntime.stop((event) => this._panel.webview.postMessage(event));
            return;
        }

        if (payload.type === 'agent.session.new') {
            await this.postWorkbenchState(await this._agentRuntime.createSession(this.buildWorkbenchInput()));
            return;
        }

        if (payload.type === 'agent.session.select' && typeof payload.sessionId === 'string') {
            await this.postWorkbenchState(await this._agentRuntime.selectSession(payload.sessionId, this.buildWorkbenchInput()));
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
            await this.postWorkbenchState(await this._agentRuntime.compactSession(payload.sessionId, this.buildWorkbenchInput()));
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

    private getProviderModelLabel(): string {
        const config = vscode.workspace.getConfiguration('n8n.agent');
        const provider = String(config.get<string>('provider') || 'openai').trim() || 'openai';
        const model = String(config.get<string>('model') || '').trim();
        return model ? `${provider} / ${model}` : provider;
    }

    private buildWorkbenchInput(): {
        workflowId?: string;
        workflowName?: string;
        workflowFilename?: string;
        workspaceRoot?: string;
        nodeContext?: AgentWorkbenchNodeContext;
    } {
        return {
            workflowId: this._workflow?.id,
            workflowName: this._workflow?.name,
            workflowFilename: this._workflow?.filename,
            workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            nodeContext: this._nodeContext,
        };
    }

    private async postWorkbenchState(state?: Awaited<ReturnType<AgentRuntimeController['getWorkbenchState']>>): Promise<void> {
        const nextState = state ?? await this._agentRuntime.getWorkbenchState(this.buildWorkbenchInput());
        await this._panel.webview.postMessage({ type: 'agent.state', state: nextState });
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
            reloadWorkflow: () => this._panel.webview.postMessage({ type: 'workflow.reload' }),
        });
    }

    private getHtmlForWebview(): string {
        return buildAgentWorkbenchHtml({
            workflowId: this._workflow?.id || '',
            workflowName: this._workflow?.name || 'New workflow',
            workflowUrl: this._workflowUrl,
            workflowReloadUrl: this._workflowReloadUrl,
            providerModelLabel: this._providerModelLabel,
        });
    }
}
