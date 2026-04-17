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
    
    this.contextValue = this.getContextValueForStatus(workflow.status, workflow.isArchived ?? false, pendingAction);
    this.tooltip = workflow.name;

    // Only show status description when something requires attention
    if (pendingAction === 'conflict' || workflow.status === WorkflowSyncStatus.CONFLICT) {
      this.description = '(conflict)';
    } else if (workflow.isArchived) {
      // Archived workflows cannot be activated, so show archived instead of active/inactive
      this.description = '(archived)';
    } else if (workflow.status === WorkflowSyncStatus.EXIST_ONLY_REMOTELY || workflow.status === WorkflowSyncStatus.TRACKED) {
      // Show active/inactive for cloud-only and synced workflows
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
   * Returns action types that should be available for this workflow.
   * 
   * SSOT table:
   * - TRACKED: BOARD, OPEN, PULL, PUSH (all available)
   * - TRACKED archived: BOARD, PULL (OPEN, PUSH disabled - local file is read-only)
   * - EXIST_ONLY_LOCALLY: OPEN, PUSH (BOARD, PULL disabled - no remote)
   * - EXIST_ONLY_LOCALLY archived: OPEN (all others disabled - no remote)
   * - EXIST_ONLY_REMOTELY: BOARD, PULL (OPEN, PUSH disabled - no local)
   * - EXIST_ONLY_REMOTELY archived: BOARD, PULL (OPEN, PUSH disabled)
   * - CONFLICT: SHOW_DIFF, FORCE_PUSH, PULL_REMOTE
   */
  getAvailableActions(): ActionItemType[] {
    const { status } = this.workflow;
    const isArchived = this.workflow.isArchived ?? false;

    // Conflict state overrides everything
    if (status === WorkflowSyncStatus.CONFLICT || this.pendingAction === 'conflict') {
      return [ActionItemType.SHOW_DIFF, ActionItemType.FORCE_PUSH, ActionItemType.PULL_REMOTE];
    }

    // Branch by sync status first
    switch (status) {
      case WorkflowSyncStatus.EXIST_ONLY_LOCALLY:
        // Local-only: no remote, so no BOARD or PULL
        // Archived doesn't apply (no remote to archive from)
        return [ActionItemType.OPEN, ActionItemType.PUSH];

      case WorkflowSyncStatus.EXIST_ONLY_REMOTELY:
        // Remote-only: no local file, so no OPEN or PUSH
        // BOARD and PULL always available (archived or not)
        return [ActionItemType.BOARD, ActionItemType.PULL];

      case WorkflowSyncStatus.TRACKED:
        // Tracked: has both local and remote
        if (isArchived) {
          // Archived workflows are read-only on remote side
          // Local file exists but shouldn't be opened for editing since remote is archived
          return [ActionItemType.BOARD, ActionItemType.PULL];
        } else {
          // Normal tracked workflow: all actions available
          return [ActionItemType.BOARD, ActionItemType.OPEN, ActionItemType.PULL, ActionItemType.PUSH];
        }

      default:
        return [];
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
  
  /**
   * Returns a contextValue string used by package.json `when` clauses for inline/context menus.
   *
   * Values:
   * - workflow-tracked         : TRACKED (both local and remote, not archived)
   * - workflow-tracked-archived: TRACKED, archived on remote → read-only
   * - workflow-local-only      : EXIST_ONLY_LOCALLY (new, not yet pushed)
   * - workflow-cloud-only      : EXIST_ONLY_REMOTELY (not yet pulled)
   * - workflow-conflict        : CONFLICT
   */
  private getContextValueForStatus(status: WorkflowSyncStatus, isArchived: boolean, pendingAction?: string): string {
    if (pendingAction === 'conflict' || status === WorkflowSyncStatus.CONFLICT) return 'workflow-conflict';

    switch (status) {
      case WorkflowSyncStatus.EXIST_ONLY_REMOTELY:
        return 'workflow-cloud-only';
      case WorkflowSyncStatus.EXIST_ONLY_LOCALLY:
        return 'workflow-local-only';
      default:
        // TRACKED: workflow known on both sides
        return isArchived ? 'workflow-tracked-archived' : 'workflow-tracked';
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
  }

  override getContextValue(): string {
    return this.contextValue || 'workflow';
  }
  
  override updateState(_state: any): void {
    // Workflow items don't need dynamic updates for now
  }
}
