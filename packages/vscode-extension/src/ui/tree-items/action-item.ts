import * as vscode from 'vscode';
import { BaseTreeItem } from './base-tree-item.js';
import { TreeItemType } from '../../types.js';

/**
 * Action item types for child actions under workflows
 */
export enum ActionItemType {
  // Conflict resolution actions
  SHOW_DIFF = 'show-diff',
  KEEP_LOCAL = 'keep-local',
  KEEP_REMOTE = 'keep-remote',
  
  // Deletion confirmation actions
  CONFIRM_DELETE = 'confirm-delete',
  RESTORE_FILE = 'restore-file',
}

/**
 * Tree item representing an action that can be taken on a workflow
 * Used as child items for workflows in CONFLICT or DELETED states
 */
export class ActionItem extends BaseTreeItem {
  readonly type = TreeItemType.INFO; // Use INFO type for action items
  
  constructor(
    public readonly actionType: ActionItemType,
    public readonly workflowId: string,
    public readonly workflow: any
  ) {
    super(ActionItem.getLabelForAction(actionType), vscode.TreeItemCollapsibleState.None);
    
    this.iconPath = ActionItem.getIconForAction(actionType);
    this.contextValue = `action-${actionType}`;
    this.command = ActionItem.getCommandForAction(actionType, workflow);
    this.tooltip = ActionItem.getTooltipForAction(actionType);
  }
  
  private static getLabelForAction(actionType: ActionItemType): string {
    switch (actionType) {
      case ActionItemType.SHOW_DIFF:
        return '📄 Show Diff';
      case ActionItemType.KEEP_LOCAL:
        return '✅ Keep Local Version';
      case ActionItemType.KEEP_REMOTE:
        return '☁️ Keep Remote Version';
      case ActionItemType.CONFIRM_DELETE:
        return '🗑️ Confirm Remote Deletion';
      case ActionItemType.RESTORE_FILE:
        return '↩️ Restore Local File';
      default:
        return 'Unknown Action';
    }
  }
  
  private static getIconForAction(actionType: ActionItemType): vscode.ThemeIcon {
    switch (actionType) {
      case ActionItemType.SHOW_DIFF:
        return new vscode.ThemeIcon('git-compare');
      case ActionItemType.KEEP_LOCAL:
        return new vscode.ThemeIcon('arrow-right');
      case ActionItemType.KEEP_REMOTE:
        return new vscode.ThemeIcon('arrow-left');
      case ActionItemType.CONFIRM_DELETE:
        return new vscode.ThemeIcon('trash');
      case ActionItemType.RESTORE_FILE:
        return new vscode.ThemeIcon('reply');
      default:
        return new vscode.ThemeIcon('question');
    }
  }
  
  private static getCommandForAction(actionType: ActionItemType, workflow: any): vscode.Command {
    switch (actionType) {
      case ActionItemType.SHOW_DIFF:
        return {
          command: 'n8n.resolveConflict',
          title: 'Show Diff',
          arguments: [{ workflow, choice: 'Show Diff' }]
        };
      case ActionItemType.KEEP_LOCAL:
        return {
          command: 'n8n.resolveConflict',
          title: 'Keep Local Version',
          arguments: [{ workflow, choice: 'Overwrite Remote (Use Local)' }]
        };
      case ActionItemType.KEEP_REMOTE:
        return {
          command: 'n8n.resolveConflict',
          title: 'Keep Remote Version',
          arguments: [{ workflow, choice: 'Overwrite Local (Use Remote)' }]
        };
      case ActionItemType.CONFIRM_DELETE:
        return {
          command: 'n8n.confirmDeletion',
          title: 'Confirm Remote Deletion',
          arguments: [{ workflow }]
        };
      case ActionItemType.RESTORE_FILE:
        return {
          command: 'n8n.restoreDeletion',
          title: 'Restore Local File',
          arguments: [{ workflow }]
        };
      default:
        return {
          command: 'n8n.refresh',
          title: 'Refresh'
        };
    }
  }
  
  private static getTooltipForAction(actionType: ActionItemType): string {
    switch (actionType) {
      case ActionItemType.SHOW_DIFF:
        return 'Open a diff view comparing local and remote versions';
      case ActionItemType.KEEP_LOCAL:
        return 'Push local version to remote (overwrite remote)';
      case ActionItemType.KEEP_REMOTE:
        return 'Pull remote version to local (overwrite local)';
      case ActionItemType.CONFIRM_DELETE:
        return 'Delete this workflow from the remote n8n instance';
      case ActionItemType.RESTORE_FILE:
        return 'Restore the local file from remote or archive';
      default:
        return '';
    }
  }
  
  override getContextValue(): string {
    return this.contextValue || 'action-item';
  }
  
  override updateState(state: any): void {
    // Action items are static
  }
}
