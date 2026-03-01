import * as vscode from 'vscode';
import { IWorkflowStatus, WorkflowSyncStatus } from 'n8nac';
import { BaseTreeItem } from './base-tree-item.js';
import { TreeItemType } from '../../types.js';

/**
 * Tree item representing a single workflow
 */
export class WorkflowItem extends BaseTreeItem {
  readonly type = TreeItemType.WORKFLOW;
  
  constructor(
    public readonly workflow: IWorkflowStatus,
    public readonly pendingAction?: 'conflict'
  ) {
    // Determine if this item should be collapsible (for conflicts and deletions)
    const shouldBeCollapsible = pendingAction === 'conflict' ||
                                 workflow.status === WorkflowSyncStatus.CONFLICT;
    
    super(
      workflow.name,
      shouldBeCollapsible ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    );
    
    this.contextValue = this.getContextValueForStatus(workflow.status, pendingAction);
    this.tooltip = workflow.name;

    // Only show status description when something requires attention
    if (pendingAction === 'conflict' || workflow.status === WorkflowSyncStatus.CONFLICT) {
      this.description = '(conflict)';
    } else if (workflow.status === WorkflowSyncStatus.EXIST_ONLY_REMOTELY) {
      this.description = workflow.active ? '(active)' : '(inactive)';
    } else {
      this.description = undefined;
    }

    this.iconPath = this.getIcon(workflow.status, pendingAction);
    
    // Set resource URI for file decorations
    this.resourceUri = this.createResourceUri(workflow.id, workflow.status, pendingAction);
    
    // Default command: open diff for conflicts, otherwise open JSON
    // Don't set command for remote-only workflows (no local file to open)
    if (pendingAction === 'conflict' || workflow.status === WorkflowSyncStatus.CONFLICT) {
      this.command = {
        command: 'n8n.resolveConflict',
        title: 'Show Diff',
        arguments: [{ workflow, choice: 'Show Diff' }]
      };
    } else if (workflow.status !== WorkflowSyncStatus.EXIST_ONLY_REMOTELY) {
      // Only set open command for workflows that have local files
      this.command = {
        command: 'n8n.openJson',
        title: 'Open JSON',
        arguments: [workflow]
      };
    }
    // For EXIST_ONLY_REMOTELY, don't set any command - clicking will do nothing
  }
  
  /**
   * Create a resource URI for file decorations
   */
  private createResourceUri(id: string, status: WorkflowSyncStatus, pendingAction?: string): vscode.Uri {
    const params = new URLSearchParams();
    params.set('status', status);
    if (pendingAction) {
      params.set('pendingAction', pendingAction);
    }
    return vscode.Uri.parse(`n8n-workflow://${id}?${params.toString()}`);
  }

  setContextValue(value: string) {
    this.contextValue = value;
  }
  
  private getContextValueForStatus(status: WorkflowSyncStatus, pendingAction?: string): string {
    if (pendingAction === 'conflict' || status === WorkflowSyncStatus.CONFLICT) return 'workflow-conflict';

    switch (status) {
      case WorkflowSyncStatus.EXIST_ONLY_REMOTELY:
        return 'workflow-cloud-only';
      case WorkflowSyncStatus.EXIST_ONLY_LOCALLY:
        return 'workflow-local-only';
      default:
        // TRACKED: workflow known on both sides
        return 'workflow-local';
    }
  }

  private getIcon(status: WorkflowSyncStatus, pendingAction?: string): vscode.ThemeIcon {
    if (pendingAction === 'conflict') return new vscode.ThemeIcon('alert', new vscode.ThemeColor('charts.red'));

    switch (status) {
      case WorkflowSyncStatus.CONFLICT:
        return new vscode.ThemeIcon('alert', new vscode.ThemeColor('charts.red'));
      case WorkflowSyncStatus.EXIST_ONLY_REMOTELY:
        // Remote-only: cloud icon (like a remote git branch not yet checked out)
        return new vscode.ThemeIcon('cloud', new vscode.ThemeColor('charts.blue'));
      case WorkflowSyncStatus.EXIST_ONLY_LOCALLY:
        return new vscode.ThemeIcon('file-add', new vscode.ThemeColor('charts.orange'));
      default:
        // TRACKED: plain file icon, no color noise
        return new vscode.ThemeIcon('file');
    }
  }  override getContextValue(): string {
    return this.contextValue || 'workflow';
  }
  
  override updateState(_state: any): void {
    // Workflow items don't need dynamic updates for now
  }
}
