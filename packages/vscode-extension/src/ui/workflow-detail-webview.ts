import * as vscode from 'vscode';
import * as path from 'path';
import { SyncManager, IWorkflowStatus, WorkflowSyncStatus } from '@n8n-as-code/core';
import { UIEventHelpers } from '../services/ui-event-bus.js';

/**
 * Webview panel for displaying workflow details and actions
 */
export class WorkflowDetailWebview {
    private static currentPanel: WorkflowDetailWebview | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private workflow: IWorkflowStatus;
    private syncManager: SyncManager | undefined;
    private disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        workflow: IWorkflowStatus,
        syncManager?: SyncManager
    ) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.workflow = workflow;
        this.syncManager = syncManager;

        // Set the webview's initial html content
        this.update();

        // Listen for when the panel is disposed
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                await this.handleMessage(message);
            },
            null,
            this.disposables
        );

        // Update content when workflow changes
        this.setupEventListeners();
    }

    /**
     * Create or show the workflow detail panel
     */
    public static createOrShow(
        extensionUri: vscode.Uri,
        workflow: IWorkflowStatus,
        syncManager?: SyncManager
    ): WorkflowDetailWebview {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (WorkflowDetailWebview.currentPanel) {
            WorkflowDetailWebview.currentPanel.panel.reveal(column);
            WorkflowDetailWebview.currentPanel.workflow = workflow;
            WorkflowDetailWebview.currentPanel.syncManager = syncManager;
            WorkflowDetailWebview.currentPanel.update();
            return WorkflowDetailWebview.currentPanel;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'workflowDetail',
            `Workflow: ${workflow.name}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'out')
                ]
            }
        );

        WorkflowDetailWebview.currentPanel = new WorkflowDetailWebview(
            panel,
            extensionUri,
            workflow,
            syncManager
        );

        return WorkflowDetailWebview.currentPanel;
    }

    /**
     * Update the webview content
     */
    private update(): void {
        this.panel.title = `Workflow: ${this.workflow.name}`;
        this.panel.webview.html = this.getHtmlForWebview();
    }

    /**
     * Get HTML content for the webview
     */
    private getHtmlForWebview(): string {
        const status = this.workflow.status;
        const hasConflict = status === WorkflowSyncStatus.CONFLICT;
        const isPendingDeletion = this.workflow.status === WorkflowSyncStatus.MISSING_LOCAL;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workflow: ${this.workflow.name}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        
        .header {
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .workflow-name {
            font-size: 1.5em;
            font-weight: bold;
            margin-bottom: 8px;
        }
        
        .workflow-id {
            font-family: var(--vscode-editor-font-family);
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
            margin-bottom: 12px;
        }
        
        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.85em;
            font-weight: 500;
            margin-right: 8px;
            margin-bottom: 8px;
        }
        
        .status-synced { background-color: var(--vscode-testing-iconPassed); color: white; }
        .status-conflict { background-color: var(--vscode-testing-iconFailed); color: white; }
        .status-modified { background-color: var(--vscode-testing-iconQueued); color: white; }
        .status-missing { background-color: var(--vscode-testing-iconSkipped); color: white; }
        
        .section {
            margin-bottom: 24px;
            background-color: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 16px;
        }
        
        .section-title {
            font-weight: bold;
            margin-bottom: 12px;
            font-size: 1.1em;
        }
        
        .action-buttons {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-top: 16px;
        }
        
        .action-button {
            padding: 12px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
            text-align: left;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: background-color 0.2s;
        }
        
        .action-button:hover {
            opacity: 0.9;
        }
        
        .action-button-primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .action-button-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .action-button-danger {
            background-color: var(--vscode-errorForeground);
            color: white;
        }
        
        .action-button-warning {
            background-color: var(--vscode-inputValidation-warningBorder);
            color: white;
        }
        
        .icon {
            width: 16px;
            height: 16px;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: 120px 1fr;
            gap: 8px 16px;
        }
        
        .info-label {
            color: var(--vscode-descriptionForeground);
            font-weight: 500;
        }
        
        .info-value {
            font-family: var(--vscode-editor-font-family);
        }
        
        .conflict-actions {
            background-color: var(--vscode-inputValidation-errorBackground);
            border-color: var(--vscode-inputValidation-errorBorder);
        }
        
        .deletion-actions {
            background-color: var(--vscode-inputValidation-warningBackground);
            border-color: var(--vscode-inputValidation-warningBorder);
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="workflow-name">${this.workflow.name}</div>
        <div class="workflow-id">ID: ${this.workflow.id}</div>
        <div>
            <span class="status-badge ${this.getStatusClass(status)}">${status}</span>
            ${this.workflow.active ? '<span class="status-badge status-synced">Active</span>' : '<span class="status-badge status-missing">Inactive</span>'}
        </div>
    </div>
    
    <div class="section">
        <div class="section-title">Workflow Information</div>
        <div class="info-grid">
            <div class="info-label">Filename:</div>
            <div class="info-value">${this.workflow.filename || 'N/A'}</div>
            
            <div class="info-label">Status:</div>
            <div class="info-value">${this.getStatusDescription(status)}</div>
            
            <div class="info-label">Active:</div>
            <div class="info-value">${this.workflow.active ? 'Yes' : 'No'}</div>
            
            <div class="info-label">Last Sync:</div>
            <div class="info-value">${new Date().toLocaleString()}</div>
        </div>
    </div>
    
    ${hasConflict ? this.getConflictSection() : ''}
    ${isPendingDeletion ? this.getDeletionSection() : ''}
    
    <div class="section">
        <div class="section-title">Actions</div>
        <div class="action-buttons">
            ${this.getActionButtons()}
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function handleAction(action, data = {}) {
            vscode.postMessage({
                command: action,
                ...data
            });
        }
        
        // Store initial state
        vscode.setState({ workflowId: '${this.workflow.id}' });
    </script>
</body>
</html>`;
    }

    /**
     * Get CSS class for status badge
     */
    private getStatusClass(status: WorkflowSyncStatus): string {
        switch (status) {
            case WorkflowSyncStatus.SYNCED:
                return 'status-synced';
            case WorkflowSyncStatus.CONFLICT:
                return 'status-conflict';
            case WorkflowSyncStatus.LOCAL_MODIFIED:
            case WorkflowSyncStatus.REMOTE_MODIFIED:
                return 'status-modified';
            case WorkflowSyncStatus.MISSING_LOCAL:
            case WorkflowSyncStatus.MISSING_REMOTE:
                return 'status-missing';
            default:
                return '';
        }
    }

    /**
     * Get human-readable status description
     */
    private getStatusDescription(status: WorkflowSyncStatus): string {
        switch (status) {
            case WorkflowSyncStatus.SYNCED:
                return 'Fully synchronized';
            case WorkflowSyncStatus.CONFLICT:
                return 'Conflict detected';
            case WorkflowSyncStatus.LOCAL_MODIFIED:
                return 'Local modifications pending';
            case WorkflowSyncStatus.REMOTE_MODIFIED:
                return 'Remote modifications pending';
            case WorkflowSyncStatus.MISSING_LOCAL:
                return 'Local file missing';
            case WorkflowSyncStatus.MISSING_REMOTE:
                return 'Remote workflow missing';
            default:
                return status;
        }
    }

    /**
     * Get HTML for conflict resolution section
     */
    private getConflictSection(): string {
        return `
        <div class="section conflict-actions">
            <div class="section-title">⚠️ Conflict Detected</div>
            <p>This workflow has conflicting changes between local and remote versions.</p>
            <div class="action-buttons">
                <button class="action-button action-button-warning" onclick="handleAction('showDiff')">
                    <span class="icon">🔍</span> Show Diff
                </button>
                <button class="action-button action-button-secondary" onclick="handleAction('useLocal')">
                    <span class="icon">📁</span> Use Local Version
                </button>
                <button class="action-button action-button-secondary" onclick="handleAction('useRemote')">
                    <span class="icon">☁️</span> Use Remote Version
                </button>
            </div>
        </div>`;
    }

    /**
     * Get HTML for deletion confirmation section
     */
    private getDeletionSection(): string {
        return `
        <div class="section deletion-actions">
            <div class="section-title">🗑️ Pending Deletion</div>
            <p>The local file has been deleted. Choose what to do next:</p>
            <div class="action-buttons">
                <button class="action-button action-button-danger" onclick="handleAction('confirmDeletion')">
                    <span class="icon">🗑️</span> Confirm Remote Deletion
                </button>
                <button class="action-button action-button-secondary" onclick="handleAction('restoreLocal')">
                    <span class="icon">↩️</span> Restore Local File
                </button>
            </div>
        </div>`;
    }

    /**
     * Get HTML for action buttons
     */
    private getActionButtons(): string {
        const buttons = [];
        
        // Always available actions
        buttons.push(`
            <button class="action-button action-button-primary" onclick="handleAction('openBoard')">
                <span class="icon">🌐</span> Open in n8n
            </button>
            <button class="action-button action-button-secondary" onclick="handleAction('openJson')">
                <span class="icon">📄</span> Open JSON File
            </button>
            <button class="action-button action-button-secondary" onclick="handleAction('openSplit')">
                <span class="icon">📊</span> Open Split View
            </button>
        `);
        
        // Sync actions based on status
        const status = this.workflow.status;
        if (status === WorkflowSyncStatus.LOCAL_MODIFIED || status === WorkflowSyncStatus.MISSING_REMOTE) {
            buttons.push(`
                <button class="action-button action-button-primary" onclick="handleAction('pushWorkflow')">
                    <span class="icon">📤</span> Push to n8n
                </button>
            `);
        }
        
        if (status === WorkflowSyncStatus.REMOTE_MODIFIED || status === WorkflowSyncStatus.MISSING_LOCAL) {
            buttons.push(`
                <button class="action-button action-button-primary" onclick="handleAction('pullWorkflow')">
                    <span class="icon">📥</span> Pull from n8n
                </button>
            `);
        }
        
        // Delete action (only if file exists locally)
        if (this.workflow.filename && this.syncManager) {
            buttons.push(`
                <button class="action-button action-button-danger" onclick="handleAction('deleteWorkflow')">
                    <span class="icon">🗑️</span> Delete Local File
                </button>
            `);
        }
        
        return buttons.join('\n');
    }

    /**
     * Handle messages from the webview
     */
    private async handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'openBoard':
                await vscode.commands.executeCommand('n8n.openBoard', this.workflow);
                break;
                
            case 'openJson':
                await vscode.commands.executeCommand('n8n.openJson', this.workflow);
                break;
                
            case 'openSplit':
                await vscode.commands.executeCommand('n8n.openSplit', this.workflow);
                break;
                
            case 'pushWorkflow':
                await vscode.commands.executeCommand('n8n.pushWorkflow', this.workflow);
                break;
                
            case 'pullWorkflow':
                await vscode.commands.executeCommand('n8n.pullWorkflow', this.workflow);
                break;
                
            case 'deleteWorkflow':
                await vscode.commands.executeCommand('n8n.deleteWorkflow', this.workflow);
                break;
                
            case 'showDiff':
                await vscode.commands.executeCommand('n8n.resolveConflict', this.workflow);
                break;
                
            case 'useLocal':
                // Force push local version
                if (this.syncManager && this.workflow.filename) {
                    const instanceDirectory = this.syncManager.getInstanceDirectory();
                    const absPath = path.join(instanceDirectory, this.workflow.filename);
                    await this.syncManager.handleLocalFileChange(absPath);
                    UIEventHelpers.emitUIRefreshNeeded('conflict resolved - use local');
                }
                break;
                
            case 'useRemote':
                // Force pull remote version
                if (this.syncManager && this.workflow.filename && this.workflow.id) {
                    await this.syncManager.pullWorkflow(this.workflow.filename, this.workflow.id, true);
                    UIEventHelpers.emitUIRefreshNeeded('conflict resolved - use remote');
                }
                break;
                
            case 'confirmDeletion':
                await vscode.commands.executeCommand('n8n.confirmDeletion', this.workflow);
                break;
                
            case 'restoreLocal':
                await vscode.commands.executeCommand('n8n.restoreDeletion', this.workflow);
                break;
        }
    }

    /**
     * Setup event listeners for workflow changes
     */
    private setupEventListeners(): void {
        // This method would listen for workflow status changes
        // For now, it's a placeholder
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        WorkflowDetailWebview.currentPanel = undefined;

        // Clean up our resources
        this.panel.dispose();

        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}