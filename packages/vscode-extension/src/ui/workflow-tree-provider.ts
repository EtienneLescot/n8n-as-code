import * as vscode from 'vscode';
import * as path from 'path';
import { SyncManager, IWorkflowStatus, WorkflowSyncStatus } from '@n8n-as-code/core';

export class WorkflowTreeProvider implements vscode.TreeDataProvider<WorkflowItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<WorkflowItem | undefined | null | void> = new vscode.EventEmitter<WorkflowItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<WorkflowItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private syncManager: SyncManager | undefined;
    private autoRefreshInterval: NodeJS.Timeout | undefined;

    constructor() { }

    setSyncManager(manager: SyncManager) {
        this.syncManager = manager;
        this.refresh();
        this.startAutoRefresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    private startAutoRefresh() {
        if (this.autoRefreshInterval) clearInterval(this.autoRefreshInterval);
        this.autoRefreshInterval = setInterval(() => {
            this.refresh();
        }, 60000); // 60s polling as per spec
    }

    getTreeItem(element: WorkflowItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: WorkflowItem): Promise<WorkflowItem[]> {
        if (!this.syncManager) {
            return [];
        }

        try {
            const statuses = await this.syncManager.getWorkflowsStatus();
            return statuses.map(s => new WorkflowItem(s));
        } catch (e) {
            console.error('Failed to get workflow tree data', e);
            return [new WorkflowItem({ name: 'Error fetching workflows', id: 'error', filename: '', active: false, status: WorkflowSyncStatus.EXIST_ONLY_REMOTELY })]; // Fallback?
        }
    }
}

export class WorkflowItem extends vscode.TreeItem {
    constructor(
        public readonly workflow: IWorkflowStatus
    ) {
        super(workflow.name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'workflow';

        this.tooltip = `${workflow.name} (${workflow.status})`;
        this.description = workflow.active ? '(Active)' : '(Inactive)';

        this.iconPath = this.getIcon(workflow.status);

        this.command = {
            command: 'n8n.openBoard',
            title: 'Open Board',
            arguments: [workflow]
        };
    }

    private getIcon(status: WorkflowSyncStatus): vscode.ThemeIcon {
        switch (status) {
            case WorkflowSyncStatus.IN_SYNC:
                return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
            case WorkflowSyncStatus.MODIFIED_LOCALLY:
                return new vscode.ThemeIcon('pencil', new vscode.ThemeColor('charts.blue'));
            case WorkflowSyncStatus.MODIFIED_REMOTELY:
                return new vscode.ThemeIcon('cloud-download', new vscode.ThemeColor('charts.orange'));
            case WorkflowSyncStatus.EXIST_ONLY_REMOTELY:
                return new vscode.ThemeIcon('cloud', new vscode.ThemeColor('charts.yellow'));
            case WorkflowSyncStatus.EXIST_ONLY_LOCALLY:
                return new vscode.ThemeIcon('file', new vscode.ThemeColor('charts.red'));
            case WorkflowSyncStatus.CONFLICT:
                return new vscode.ThemeIcon('alert', new vscode.ThemeColor('charts.red'));
            case WorkflowSyncStatus.DELETED_LOCALLY:
            case WorkflowSyncStatus.DELETED_REMOTELY:
                return new vscode.ThemeIcon('trash', new vscode.ThemeColor('charts.gray'));
            default:
                return new vscode.ThemeIcon('question');
        }
    }
}
