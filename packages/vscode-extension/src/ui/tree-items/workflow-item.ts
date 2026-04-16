import * as vscode from 'vscode';
import { IWorkflowStatus, WorkflowSyncStatus } from 'n8nac';
import { BaseTreeItem } from './base-tree-item.js';
import { TreeItemType } from '../../types.js';
import { ActionItemType } from './action-item.js';

/**
 * Tree item representing a single workflow.
 * 
 * Design principles for actions:
 * - BOARD: requires workflow.id (remote existence). LOCAL-ONLY workflows cannot open in n8n UI.
 * - PULL: requires workflow.id (remote existence). LOCAL-ONLY workflows have nothing to pull.
 * - PUSH: requires workflow.filename (local existence). REMOTE-ONLY workflows have no local file.
 * - Archived workflows: READ-ONLY, only BOARD and PULL allowed.
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
    
    // Default click behavior:
    // - Archived workflows: NO command (clicking does nothing - they're read-only)
    // - Conflicts: open diff
    // - Otherwise: open JSON for workflows with local files
    if (pendingAction === 'conflict' || workflow.status === WorkflowSyncStatus.CONFLICT) {
      this.command = {
        command: 'n8n.resolveConflict',
        title: 'Show Diff',
        arguments: [{ workflow, choice: 'Show Diff' }]
      };
    } else if (!workflow.isArchived && workflow.status !== WorkflowSyncStatus.EXIST_ONLY_REMOTELY) {
      // Non-archived workflows with local files can be opened
      this.command = {
        command: 'n8n.openJson',
        title: 'Open JSON',
        arguments: [workflow]
      };
    }
    // For archived workflows and remote-only workflows, no default command is set
  }
  
  /**
   * Get available actions for this workflow based on its state.
   * Returns action types that should be enabled for this workflow.
   */
  getAvailableActions(): ActionItemType[] {
    // Archived workflows are read-only: only BOARD and PULL
    if (this.workflow.isArchived) {
      const actions: ActionItemType[] = [];
      if (this.workflow.id) {
        actions.push(ActionItemType.BOARD);
        actions.push(ActionItemType.PULL);
      }
      return actions;
    }
    
    // Conflict state: show conflict resolution actions
    if (this.pendingAction === 'conflict' || this.workflow.status === WorkflowSyncStatus.CONFLICT) {
      return [ActionItemType.SHOW_DIFF, ActionItemType.FORCE_PUSH, ActionItemType.PULL_REMOTE];
    }
    
    // For all non-archived workflows, determine available actions based on sync status
    const hasRemote = !!this.workflow.id; // EXIST_ONLY_LOCALLY has no remote
    const hasLocal = !!this.workflow.filename && this.workflow.status !== WorkflowSyncStatus.EXIST_ONLY_REMOTELY;
    
    const actions: ActionItemType[] = [];
    
    // BOARD: only if workflow has a remote ID (not local-only)
    if (hasRemote) {
      actions.push(ActionItemType.BOARD);
    }
    
    // PULL: only if workflow has a remote ID (not local-only)
    if (hasRemote) {
      actions.push(ActionItemType.PULL);
    }
    
    // PUSH: only if workflow has a local file (not remote-only)
    if (hasLocal) {
      actions.push(ActionItemType.PUSH);
    }
    
    return actions;
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
