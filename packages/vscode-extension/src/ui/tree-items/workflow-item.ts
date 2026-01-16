import * as vscode from 'vscode';
import { IWorkflowStatus, WorkflowSyncStatus } from '@n8n-as-code/core';
import { BaseTreeItem } from './base-tree-item.js';
import { TreeItemType } from '../../types.js';

/**
 * Tree item representing a single workflow
 */
export class WorkflowItem extends BaseTreeItem {
  readonly type = TreeItemType.WORKFLOW;
  
  constructor(
    public readonly workflow: IWorkflowStatus,
    public readonly pendingAction?: 'delete' | 'conflict'
  ) {
    // Determine if this item should be collapsible (for conflicts and deletions)
    const shouldBeCollapsible = pendingAction === 'conflict' ||
                                 pendingAction === 'delete' ||
                                 workflow.status === WorkflowSyncStatus.CONFLICT ||
                                 workflow.status === WorkflowSyncStatus.DELETED_LOCALLY ||
                                 workflow.status === WorkflowSyncStatus.DELETED_REMOTELY;
    
    super(
      workflow.name,
      shouldBeCollapsible ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    );
    
    this.contextValue = this.getContextValueForStatus(workflow.status, pendingAction);
    this.tooltip = `${workflow.name} (${workflow.status})`;
    
    let statusDesc = workflow.active ? 'Active' : 'Inactive';
    if (pendingAction === 'delete') statusDesc = 'Pending Deletion';
    if (pendingAction === 'conflict') statusDesc = 'Conflict';
    this.description = `(${statusDesc})`;

    this.iconPath = this.getIcon(workflow.status, pendingAction);
    
    // Set resource URI for file decorations
    this.resourceUri = this.createResourceUri(workflow.id, workflow.status, pendingAction);
    
    // Default command: open diff for conflicts, otherwise open JSON
    if (pendingAction === 'conflict' || workflow.status === WorkflowSyncStatus.CONFLICT) {
      this.command = {
        command: 'n8n.resolveConflict',
        title: 'Show Diff',
        arguments: [{ workflow, choice: 'Show Diff' }]
      };
    } else {
      this.command = {
        command: 'n8n.openJson',
        title: 'Open JSON',
        arguments: [workflow]
      };
    }
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
    if (pendingAction === 'delete') return 'workflow-pending-deletion';
    if (pendingAction === 'conflict' || status === WorkflowSyncStatus.CONFLICT) return 'workflow-conflict';

    switch (status) {
      case WorkflowSyncStatus.EXIST_ONLY_REMOTELY:
        return 'workflow-cloud-only';
      case WorkflowSyncStatus.EXIST_ONLY_LOCALLY:
        return 'workflow-local-only';
      case WorkflowSyncStatus.DELETED_LOCALLY:
      case WorkflowSyncStatus.DELETED_REMOTELY:
        return 'workflow-deleted';
      case WorkflowSyncStatus.MODIFIED_LOCALLY:
        return 'workflow-modified-local';
      case WorkflowSyncStatus.MODIFIED_REMOTELY:
        return 'workflow-modified-remote';
      default:
        return 'workflow-synced';
    }
  }

  private getIcon(status: WorkflowSyncStatus, pendingAction?: string): vscode.ThemeIcon {
    if (pendingAction === 'delete') return new vscode.ThemeIcon('trash', new vscode.ThemeColor('charts.red'));
    if (pendingAction === 'conflict') return new vscode.ThemeIcon('alert', new vscode.ThemeColor('charts.red'));

    switch (status) {
      case WorkflowSyncStatus.IN_SYNC:
        return new vscode.ThemeIcon('sync', new vscode.ThemeColor('charts.green'));
      case WorkflowSyncStatus.CONFLICT:
        return new vscode.ThemeIcon('alert', new vscode.ThemeColor('charts.red'));
      
      // All other "unsynced" states use Orange
      case WorkflowSyncStatus.MODIFIED_LOCALLY:
        return new vscode.ThemeIcon('pencil', new vscode.ThemeColor('charts.orange'));
      case WorkflowSyncStatus.MODIFIED_REMOTELY:
        return new vscode.ThemeIcon('cloud-download', new vscode.ThemeColor('charts.orange'));
      case WorkflowSyncStatus.EXIST_ONLY_REMOTELY:
        return new vscode.ThemeIcon('cloud', new vscode.ThemeColor('charts.orange'));
      case WorkflowSyncStatus.EXIST_ONLY_LOCALLY:
        return new vscode.ThemeIcon('file', new vscode.ThemeColor('charts.orange'));
      case WorkflowSyncStatus.DELETED_LOCALLY:
      case WorkflowSyncStatus.DELETED_REMOTELY:
        return new vscode.ThemeIcon('trash', new vscode.ThemeColor('charts.gray'));
      
      default:
        return new vscode.ThemeIcon('question');
    }
  }
  
  override getContextValue(): string {
    return this.contextValue || 'workflow';
  }
  
  override updateState(_state: any): void {
    // Workflow items don't need dynamic updates for now
  }
}
