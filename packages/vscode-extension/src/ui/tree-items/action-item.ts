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
      default:
        return 'Unknown Action';
    }
  }

  private static getIconForAction(actionType: ActionItemType): vscode.ThemeIcon {
    switch (actionType) {
      case ActionItemType.SHOW_DIFF:
        return new vscode.ThemeIcon('git-compare');
      case ActionItemType.FORCE_PUSH:
        return new vscode.ThemeIcon('cloud-upload');
      case ActionItemType.PULL_REMOTE:
        return new vscode.ThemeIcon('cloud-download');
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
      default:
        return { command: 'n8n.refresh', title: 'Refresh' };
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
      default:
        return '';
    }
  }
  
  override getContextValue(): string {
    return this.contextValue || 'action-item';
  }
  
  override updateState(_state: any): void {
    // Action items are static
  }
}
