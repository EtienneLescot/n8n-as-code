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
    super(workflow.name, vscode.TreeItemCollapsibleState.None);
    
    this.contextValue = this.getContextValueForStatus(workflow.status, pendingAction);
    this.tooltip = `${workflow.name} (${workflow.status})`;
    
    let statusDesc = workflow.active ? 'Active' : 'Inactive';
    if (pendingAction === 'delete') statusDesc = 'Pending Deletion';
    if (pendingAction === 'conflict') statusDesc = 'Conflict';
    this.description = `(${statusDesc})`;

    this.iconPath = this.getIcon(workflow.status, pendingAction);
    
    // Default command (open workflow detail panel)
    this.command = {
      command: 'n8n.openWorkflowDetail',
      title: 'Open Workflow Details',
      arguments: [workflow]
    };
  }

  setContextValue(value: string) {
    this.contextValue = value;
  }
  
  private getContextValueForStatus(status: WorkflowSyncStatus, pendingAction?: string): string {
    if (pendingAction === 'delete') return 'workflow-pending-deletion';
    if (pendingAction === 'conflict' || status === WorkflowSyncStatus.CONFLICT) return 'workflow-conflict';

    switch (status) {
      case WorkflowSyncStatus.MISSING_LOCAL:
        return 'workflow-cloud-only';
      case WorkflowSyncStatus.MISSING_REMOTE:
        return 'workflow-local-only';
      default:
        return 'workflow-synced';
    }
  }

  private getIcon(status: WorkflowSyncStatus, pendingAction?: string): vscode.ThemeIcon {
    if (pendingAction === 'delete') return new vscode.ThemeIcon('trash', new vscode.ThemeColor('charts.red'));
    if (pendingAction === 'conflict') return new vscode.ThemeIcon('alert', new vscode.ThemeColor('charts.red'));

    switch (status) {
      case WorkflowSyncStatus.SYNCED:
        return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
      case WorkflowSyncStatus.CONFLICT:
        return new vscode.ThemeIcon('alert', new vscode.ThemeColor('charts.red'));
      
      // All other "unsynced" states use Orange
      case WorkflowSyncStatus.LOCAL_MODIFIED:
        return new vscode.ThemeIcon('pencil', new vscode.ThemeColor('charts.orange'));
      case WorkflowSyncStatus.REMOTE_MODIFIED:
        return new vscode.ThemeIcon('cloud-download', new vscode.ThemeColor('charts.orange'));
      case WorkflowSyncStatus.MISSING_LOCAL:
        return new vscode.ThemeIcon('cloud', new vscode.ThemeColor('charts.orange'));
      case WorkflowSyncStatus.MISSING_REMOTE:
        return new vscode.ThemeIcon('file', new vscode.ThemeColor('charts.orange'));
      
      default:
        return new vscode.ThemeIcon('question');
    }
  }
  
  override getContextValue(): string {
    return this.contextValue || 'workflow';
  }
  
  override updateState(state: any): void {
    // Workflow items don't need dynamic updates for now
  }
}
