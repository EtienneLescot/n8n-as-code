import * as vscode from 'vscode';
import { IWorkflowStatus } from 'n8nac';
import { AgentRuntimeController } from '../services/agent-runtime-controller.js';
import { workflowWebviewRegistry } from '../services/workflow-webview-registry.js';
import { buildAgentWorkbenchHtml } from './agent-workbench-html.js';

export class AgentWorkbenchWebview {
    public static currentPanel: AgentWorkbenchWebview | undefined;

    private readonly _panel: vscode.WebviewPanel;
    private readonly _context: vscode.ExtensionContext;
    private readonly _agentRuntime: AgentRuntimeController;
    private readonly _disposables: vscode.Disposable[] = [];
    private _registryDisposable: { dispose(): void } | undefined;
    private _workflow: IWorkflowStatus;
    private _workflowUrl: string;

    private constructor(
        panel: vscode.WebviewPanel,
        context: vscode.ExtensionContext,
        workflow: IWorkflowStatus,
        workflowUrl: string,
        agentRuntime: AgentRuntimeController,
    ) {
        this._panel = panel;
        this._context = context;
        this._workflow = workflow;
        this._workflowUrl = workflowUrl;
        this._agentRuntime = agentRuntime;
        this._registryDisposable = workflowWebviewRegistry.register({
            getWorkflowId: () => this._workflow.id,
            reloadWorkflow: () => this._panel.webview.postMessage({ type: 'workflow.reload' }),
        });

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage((message) => {
            void this.handleMessage(message);
        }, null, this._disposables);
        this._panel.webview.html = this.getHtmlForWebview();
    }

    public static createOrShow(
        context: vscode.ExtensionContext,
        workflow: IWorkflowStatus,
        workflowUrl: string,
        agentRuntime: AgentRuntimeController,
        viewColumn?: vscode.ViewColumn,
    ): void {
        const column = viewColumn || vscode.ViewColumn.One;

        if (AgentWorkbenchWebview.currentPanel) {
            AgentWorkbenchWebview.currentPanel._panel.reveal(column);
            AgentWorkbenchWebview.currentPanel.update(workflow, workflowUrl);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'n8nAgentWorkbench',
            `n8n Agent: ${workflow.name}`,
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [],
            },
        );

        AgentWorkbenchWebview.currentPanel = new AgentWorkbenchWebview(panel, context, workflow, workflowUrl, agentRuntime);
    }

    public update(workflow: IWorkflowStatus, workflowUrl: string): void {
        this._workflow = workflow;
        this._workflowUrl = workflowUrl;
        this._panel.title = `n8n Agent: ${workflow.name}`;
        this._panel.webview.postMessage({
            type: 'workflow.update',
            workflowId: workflow.id,
            workflowName: workflow.name,
            url: workflowUrl,
        });
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

        if (payload.type === 'agent.send') {
            await this._agentRuntime.sendPrompt({
                prompt: String(payload.text || ''),
                workflowId: this._workflow.id,
                workflowName: this._workflow.name,
                workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            }, (event) => this._panel.webview.postMessage(event));
            return;
        }

        if (payload.type === 'agent.stop') {
            await this._agentRuntime.stop((event) => this._panel.webview.postMessage(event));
            return;
        }
    }

    private getHtmlForWebview(): string {
        return buildAgentWorkbenchHtml({
            workflowId: this._workflow.id,
            workflowName: this._workflow.name,
            workflowUrl: this._workflowUrl,
        });
    }
}
