import * as vscode from 'vscode';
import { IWorkflowStatus } from '@n8n-as-code/core';

export class WorkflowWebview {
    public static currentPanel: WorkflowWebview | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _workflowId: string;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, workflowId: string, url: string) {
        this._panel = panel;
        this._workflowId = workflowId;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this.getHtmlForWebview(workflowId, url);
    }

    public static createOrShow(workflow: IWorkflowStatus, url: string, viewColumn?: vscode.ViewColumn) {
        const column = viewColumn || (vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined);

        // If we already have a panel, show it
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
    public static reloadIfMatching(workflowId: string, outputChannel?: vscode.OutputChannel) {
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

    /**
     * Reload the currently open webview regardless of workflow ID.
     */
    public static reloadCurrent(outputChannel?: vscode.OutputChannel) {
        if (WorkflowWebview.currentPanel) {
            // outputChannel?.appendLine(`[Webview] Reloading current panel (${WorkflowWebview.currentPanel._workflowId})`);
            WorkflowWebview.currentPanel._panel.webview.postMessage({ type: 'reload' });
            return true;
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
        // url is the proxy URL pointing to the n8n workflow
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'; frame-src *; connect-src *; img-src * data:; style-src * 'unsafe-inline';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>n8n: ${workflowId}</title>
            <style>
                body, html { 
                    margin: 0; 
                    padding: 0; 
                    height: 100%; 
                    overflow: hidden; 
                    background: var(--vscode-editor-background, #1e1e1e);
                }
                .iframe-container {
                    position: relative;
                    width: 100%;
                    height: 100%;
                }
                iframe { 
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%; 
                    height: 100%; 
                    border: none; 
                    display: block;
                    transition: opacity 0.3s ease;
                }
                iframe.hidden {
                    opacity: 0;
                    pointer-events: none;
                }
                .loading-overlay {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    padding: 5px 10px;
                    background: var(--vscode-button-background, #007acc);
                    color: var(--vscode-button-foreground, #ffffff);
                    font-family: system-ui, -apple-system, sans-serif;
                    font-size: 12px;
                    border-radius: 4px;
                    display: none;
                    z-index: 100;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }
                .initial-loading {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    font-family: system-ui, -apple-system, sans-serif;
                    color: #666;
                    text-align: center;
                }
            </style>
        </head>
        <body>
            <div id="loading-overlay" class="loading-overlay">Refreshing n8n...</div>
            <div id="initial-loading" class="initial-loading">Loading n8n workflow...</div>
            
            <div class="iframe-container">
                <iframe 
                    id="frame-1"
                    src="${url}" 
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation allow-top-navigation-by-user-activation"
                    allow="clipboard-read; clipboard-write; geolocation; microphone; camera">
                </iframe>
                <iframe 
                    id="frame-2"
                    class="hidden"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation allow-top-navigation-by-user-activation"
                    allow="clipboard-read; clipboard-write; geolocation; microphone; camera">
                </iframe>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let activeFrame = document.getElementById('frame-1');
                let pendingFrame = document.getElementById('frame-2');
                const loadingOverlay = document.getElementById('loading-overlay');
                const initialLoading = document.getElementById('initial-loading');
                const workflowId = "${workflowId}";

                // Hide initial loading when first iframe is ready
                activeFrame.onload = () => {
                    initialLoading.style.display = 'none';
                    // console.log('n8n initial iframe loaded');
                };

                /**
                 * Attempt a "Soft Refresh" by finding n8n's Vue instance and triggering a workflow load.
                 */
                function attemptSoftRefresh() {
                    try {
                        const win = activeFrame.contentWindow;
                        // n8n uses Vue 2, usually reachable via #app
                        const app = win.document.querySelector('#app');
                        if (app && app.__vue__) {
                            const vueInstance = app.__vue__;
                            const store = vueInstance.$store;
                            
                            if (store && store.dispatch) {
                                // console.log('[Webview] Soft Refresh: Dispatching workflows/getWorkflow');
                                store.dispatch('workflows/getWorkflow', workflowId);
                                return true;
                            }
                        }
                    } catch (e) {
                        // console.warn('[Webview] Soft Refresh failed or cross-origin blocked:', e);
                    }
                    return false;
                }

                /**
                 * Perform a "Seamless Refresh" using double buffering.
                 */
                function performSeamlessRefresh() {
                    // console.log('[Webview] Seamless Refresh: Loading pending iframe...');
                    loadingOverlay.style.display = 'block';

                    pendingFrame.onload = () => {
                        // console.log('[Webview] Seamless Refresh: Swapping frames');
                        
                        // Swap frames
                        activeFrame.classList.add('hidden');
                        pendingFrame.classList.remove('hidden');

                        // Update references
                        const temp = activeFrame;
                        activeFrame = pendingFrame;
                        pendingFrame = temp;

                        loadingOverlay.style.display = 'none';
                    };

                    // Trigger load in pending frame
                    pendingFrame.src = activeFrame.src;
                }

                // Handle messages from the extension
                window.addEventListener('message', (event) => {
                    const message = event.data;
                    // console.log('Webview received message:', message);
                    
                    if (message.type === 'reload') {
                        // 1. Try Soft Refresh first
                        const softRefreshWorked = attemptSoftRefresh();
                        
                        if (!softRefreshWorked) {
                            // 2. Fallback to Seamless Refresh (Double Buffering)
                            performSeamlessRefresh();
                        }
                    }
                });
            </script>
        </body>
        </html>`;
    }
}
