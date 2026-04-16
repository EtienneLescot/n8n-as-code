import * as vscode from 'vscode';
import { BaseTreeItem } from './base-tree-item.js';
import { TreeItemType } from '../../types.js';

/**
 * Action item types for child actions under workflows
 */
export enum ActionItemType {
  // Conflict resolution actions (OCC)
  SHOW_DIFF = 'show-diff',
  FORCE_PUSH = 'force-push',
  PULL_REMOTE = 'pull-remote',
  
  // Standard workflow actions
  BOARD = 'board',     // Open workflow in n8n UI
  PULL = 'pull',       // Pull from remote to local
  PUSH = 'push',       // Push from local to remote
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
      case ActionItemType.FORCE_PUSH:
        return '⬆️ Keep Current (local)';
      case ActionItemType.PULL_REMOTE:
        return '⬇️ Keep Incoming (remote)';
      case ActionItemType.BOARD:
        return '🌐 Board';
      case ActionItemType.PULL:
        return '⬇️ Pull';
      case ActionItemType.PUSH:
        return '⬆️ Push';
      default:
        return 'Unknown Action';
    }
  }

  private static getIconForAction(actionType: ActionItemType): vscode.ThemeIcon {
    switch (actionType) {
      case ActionItemType.SHOW_DIFF:
        return new vscode.ThemeIcon('git-compare');
      case ActionItemType.FORCE_PUSH:
      case ActionItemType.PUSH:
        return new vscode.ThemeIcon('cloud-upload');
      case ActionItemType.PULL_REMOTE:
      case ActionItemType.PULL:
        return new vscode.ThemeIcon('cloud-download');
      case ActionItemType.BOARD:
        return new vscode.ThemeIcon('globe');
      default:
        return new vscode.ThemeIcon('question');
    }
  }

  private static getCommandForAction(actionType: ActionItemType, workflow: any): vscode.Command | undefined {
    switch (actionType) {
      case ActionItemType.SHOW_DIFF:
        return {
          command: 'n8n.resolveConflict',
          title: 'Show Diff',
          arguments: [{ workflow, choice: 'Show Diff' }]
        };
      case ActionItemType.FORCE_PUSH:
        return {
          command: 'n8n.resolveConflict',
          title: 'Keep Current (local)',
          arguments: [{ workflow, choice: 'Keep Current (local)' }]
        };
      case ActionItemType.PULL_REMOTE:
        return {
          command: 'n8n.resolveConflict',
          title: 'Keep Incoming (remote)',
          arguments: [{ workflow, choice: 'Keep Incoming (remote)' }]
        };
      case ActionItemType.BOARD:
        return {
          command: 'n8n.openBoard',
          title: 'Open Board',
          arguments: [workflow]
        };
      case ActionItemType.PULL:
        return {
          command: 'n8n.pullWorkflow',
          title: 'Pull',
          arguments: [workflow.id]
        };
      case ActionItemType.PUSH:
        return {
          command: 'n8n.pushWorkflow',
          title: 'Push',
          arguments: [workflow.filename]
        };
      default:
        return undefined;
    }
  }

  private static getTooltipForAction(actionType: ActionItemType): string {
    switch (actionType) {
      case ActionItemType.SHOW_DIFF:
        return 'Open a diff view comparing local and remote versions';
      case ActionItemType.FORCE_PUSH:
        return 'Keep your current local version — push it to n8n';
      case ActionItemType.PULL_REMOTE:
        return 'Keep the incoming remote version — overwrite local file';
      case ActionItemType.BOARD:
        return 'Open workflow in n8n web UI';
      case ActionItemType.PULL:
        return 'Pull latest from n8n to local file';
      case ActionItemType.PUSH:
        return 'Push local changes to n8n';
      default:
        return '';
    }
  }
  
  // Enabled/disabled state for actions
  static isEnabledForArchived(actionType: ActionItemType): boolean {
    // Only PULL and BOARD are allowed for archived workflows
    return actionType === ActionItemType.PULL || actionType === ActionItemType.BOARD;
  }
  
  static isLocalOnlyAction(actionType: ActionItemType): boolean {
    // BOARD requires a remote workflow (has id)
    return false; // BOARD is allowed for all, PULL/PUSH have their own logic
  }
  
  override getContextValue(): string {
    return this.contextValue || 'action-item';
  }
  
  override updateState(_state: any): void {
    // Action items are static
  }
}
