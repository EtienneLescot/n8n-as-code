import * as vscode from 'vscode';
import { IWorkflowStatus } from 'n8nac';
import { buildWebviewHtml } from './webview-html.js';
export { buildWebviewHtml } from './webview-html.js';

export class WorkflowWebview {
    public static currentPanel: WorkflowWebview | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _workflowId: string;
    private _disposables: vscode.Disposable[] = [];

    private _onClipboardPasteRequest: ((panel: vscode.WebviewPanel, grantToken: string) => Promise<void>) | undefined;

    private constructor(panel: vscode.WebviewPanel, workflowId: string, url: string) {
        this._panel = panel;
        this._workflowId = workflowId;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this.getHtmlForWebview(workflowId, url);

        // Handle messages from the webview (clipboard bridge on macOS)
        this._panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'clipboard-write' && typeof message.text === 'string') {
                try {
                    await vscode.env.clipboard.writeText(message.text);
                } catch (e) {
                    console.error('[Webview] Clipboard write error', e);
                }
            }
            // The parent webview validates origin and issues one-time grant tokens;
            // here we only check that the message type is correct and grantToken is present.
            if (message.type === 'clipboard-paste-request' && typeof message.grantToken === 'string') {
                void this._onClipboardPasteRequest?.(this._panel, message.grantToken)
                    ?.catch(e => console.error('[Webview] Clipboard paste handler error', e));
            }
        }, null, this._disposables);
    }

    /**
     * Register a callback for when the iframe requests paste data.
     * The callback receives the panel and the one-time grant token so it can
     * send clipboard data back, and the token is validated on the webview side.
     */
    public static onClipboardPasteRequest(handler: (panel: vscode.WebviewPanel, grantToken: string) => Promise<void>): void {
        if (WorkflowWebview.currentPanel) {
            WorkflowWebview.currentPanel._onClipboardPasteRequest = handler;
        }
    }

    public static createOrShow(workflow: IWorkflowStatus, url: string, viewColumn?: vscode.ViewColumn) {
        const column = viewColumn || (vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined);

        // If we already have a panel, reuse it and refresh the HTML so that the
        // parent-webview script reflects the new URL/origin for origin validation.
        if (WorkflowWebview.currentPanel) {
            WorkflowWebview.currentPanel._panel.reveal(column);
            WorkflowWebview.currentPanel.update(workflow.id, url);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'n8nWorkflow',
            `n8n: ${workflow.name}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true, // Keep webview state when hidden
                localResourceRoots: [] // Security: No local file access needed
            }
        );

        WorkflowWebview.currentPanel = new WorkflowWebview(panel, workflow.id, url);
    }

    /**
     * Trigger a reload of the webview if the workflowId matches the one currently displayed.
     */
    public static reloadIfMatching(workflowId: string, _outputChannel?: vscode.OutputChannel) {
        if (WorkflowWebview.currentPanel) {
            const panelId = WorkflowWebview.currentPanel._workflowId;
            if (panelId === workflowId) {
                // outputChannel?.appendLine(`[Webview] Reloading matching workflow: ${workflowId}`);
                WorkflowWebview.currentPanel._panel.webview.postMessage({ type: 'reload' });
                return true;
            }
        }
        return false;
    }

    public update(workflowId: string, url: string) {
        this._workflowId = workflowId;
        this._panel.title = `n8n: ${workflowId}`;
        this._panel.webview.html = this.getHtmlForWebview(workflowId, url);
    }

    public dispose() {
        WorkflowWebview.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }

    private getHtmlForWebview(workflowId: string, url: string) {
        return buildWebviewHtml(workflowId, url);
    }
}
