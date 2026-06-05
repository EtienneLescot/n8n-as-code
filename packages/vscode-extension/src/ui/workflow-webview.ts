import * as vscode from 'vscode';
import { IWorkflowStatus } from 'n8nac';
import { buildWebviewHtml, WORKFLOW_WEBVIEW_RELOAD_MESSAGE } from './webview-html.js';
import { workflowWebviewRegistry } from '../services/workflow-webview-registry.js';
import { openExternalNavigation } from '../utils/external-navigation.js';
import type { WorkflowWebviewEndpoints } from '../services/workflow-webview-context.js';
export { buildWebviewHtml } from './webview-html.js';

export class WorkflowWebview {
    public static currentPanel: WorkflowWebview | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _workflowId: string;
    private _workflowName: string;
    private _disposables: vscode.Disposable[] = [];
    private _registryDisposable: { dispose(): void } | undefined;

    private _onClipboardPasteRequest: ((panel: vscode.WebviewPanel, grantToken: string) => Promise<void>) | undefined;

    private constructor(panel: vscode.WebviewPanel, workflow: IWorkflowStatus, url: string, endpoints?: WorkflowWebviewEndpoints) {
        this._panel = panel;
        this._workflowId = workflow.id;
        this._workflowName = workflow.name || workflow.id;
        this._registryDisposable = workflowWebviewRegistry.register({
            getWorkflowId: () => this._workflowId,
            reloadWorkflow: () => this._panel.webview.postMessage({ type: WORKFLOW_WEBVIEW_RELOAD_MESSAGE }),
        });
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this.getHtmlForWebview(this._workflowId, url, endpoints);

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
            if (message.type === 'open-external' && typeof message.url === 'string') {
                await openExternalNavigation({
                    url: message.url,
                    reason: typeof message.reason === 'string' ? message.reason : 'unknown',
                    source: {
                        ...(message.source && typeof message.source === 'object' ? message.source : {}),
                        panelKind: 'workflow-board',
                        workflowId: this._workflowId,
                        workflowName: this._workflowName,
                    },
                    target: typeof message.target === 'string' ? message.target : undefined,
                    features: typeof message.features === 'string' ? message.features : undefined,
                });
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

    public static createOrShow(workflow: IWorkflowStatus, url: string, viewColumn?: vscode.ViewColumn, endpoints?: WorkflowWebviewEndpoints) {
        const column = viewColumn || (vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined);

        // If we already have a panel, reuse it and refresh the HTML so that the
        // parent-webview script reflects the new URL/origin for origin validation.
        if (WorkflowWebview.currentPanel) {
            WorkflowWebview.currentPanel._panel.reveal(column);
            WorkflowWebview.currentPanel.update(workflow, url, endpoints);
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

        WorkflowWebview.currentPanel = new WorkflowWebview(panel, workflow, url, endpoints);
    }

    /**
     * Trigger a reload of the webview if the workflowId matches the one currently displayed.
     */
    public static reloadIfMatching(workflowId: string, _outputChannel?: vscode.OutputChannel) {
        return workflowWebviewRegistry.reloadIfMatching(workflowId);
    }

    public update(workflow: IWorkflowStatus, url: string, endpoints?: WorkflowWebviewEndpoints) {
        this._workflowId = workflow.id;
        this._workflowName = workflow.name || workflow.id;
        this._panel.title = `n8n: ${workflow.name || workflow.id}`;
        this._panel.webview.html = this.getHtmlForWebview(workflow.id, url, endpoints);
    }

    public dispose() {
        if (WorkflowWebview.currentPanel === this) {
            WorkflowWebview.currentPanel = undefined;
        }
        this._registryDisposable?.dispose();
        this._registryDisposable = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }

    private getHtmlForWebview(workflowId: string, url: string, endpoints?: WorkflowWebviewEndpoints) {
        return buildWebviewHtml(workflowId, url, endpoints);
    }
}
