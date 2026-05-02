import * as vscode from 'vscode';
import { getAgentProviderSecretKey } from '../services/agent-runtime-controller.js';
import { buildAgentManagerHtml } from './agent-manager-html.js';

export class AgentManagerWebview {
    public static currentPanel: AgentManagerWebview | undefined;

    private readonly _panel: vscode.WebviewPanel;
    private readonly _context: vscode.ExtensionContext;
    private readonly _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
        this._panel = panel;
        this._context = context;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage((message) => {
            void this.handleMessage(message);
        }, null, this._disposables);
        void this.render();
    }

    public static createOrShow(context: vscode.ExtensionContext): void {
        if (AgentManagerWebview.currentPanel) {
            AgentManagerWebview.currentPanel._panel.reveal(vscode.ViewColumn.One);
            void AgentManagerWebview.currentPanel.render();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'n8nAgentManager',
            'n8n Agent Manager',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] },
        );

        AgentManagerWebview.currentPanel = new AgentManagerWebview(panel, context);
    }

    public dispose(): void {
        if (AgentManagerWebview.currentPanel === this) {
            AgentManagerWebview.currentPanel = undefined;
        }
        this._panel.dispose();
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
    }

    private async render(): Promise<void> {
        const config = vscode.workspace.getConfiguration('n8n.agent');
        const provider = String(config.get<string>('provider') || 'openai');
        this._panel.webview.html = buildAgentManagerHtml({
            provider,
            model: String(config.get<string>('model') || '').trim() || undefined,
            baseUrl: String(config.get<string>('baseUrl') || '').trim() || undefined,
            hasStoredApiKey: Boolean(await this._context.secrets.get(getAgentProviderSecretKey(provider))),
        });
    }

    private async handleMessage(message: unknown): Promise<void> {
        if (!message || typeof message !== 'object') {
            return;
        }
        const payload = message as Record<string, unknown>;
        if (payload.type === 'setApiKey') {
            await vscode.commands.executeCommand('n8n.agent.setApiKey');
            await this.render();
            return;
        }
        if (payload.type === 'openSettings') {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'n8n.agent');
        }
    }
}
