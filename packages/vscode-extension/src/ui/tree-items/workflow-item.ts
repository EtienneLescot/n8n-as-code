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
    public readonly workflow: IWorkflowStatus
  ) {
    super(workflow.name, vscode.TreeItemCollapsibleState.None);
    
    this.contextValue = this.getContextValueForStatus(workflow.status);
    this.tooltip = `${workflow.name} (${workflow.status})`;
    this.description = workflow.active ? '(Active)' : '(Inactive)';
    this.iconPath = this.getIcon(workflow.status);
    
    // Default command (open board)
    this.command = {
      command: 'n8n.openBoard',
      title: 'Open Board',
      arguments: [workflow]
    };
  }
  
  private getContextValueForStatus(status: WorkflowSyncStatus): string {
    switch (status) {
      case WorkflowSyncStatus.MISSING_LOCAL:
        return 'workflow-cloud-only';
      case WorkflowSyncStatus.MISSING_REMOTE:
        return 'workflow-local-only';
      default:
        return 'workflow-synced';
    }
  }

  private getIcon(status: WorkflowSyncStatus): vscode.ThemeIcon {
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
