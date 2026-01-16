import * as vscode from 'vscode';
import { BaseTreeItem } from './base-tree-item.js';
import { TreeItemType } from '../../types.js';

/**
 * Simple placeholder tree item for informational messages
 */
export class PlaceholderItem extends BaseTreeItem {
  readonly type = TreeItemType.WORKFLOW; // Using WORKFLOW type as it's the closest
  
  constructor(
    label: string,
    description?: string,
    icon?: vscode.ThemeIcon
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    
    this.iconPath = icon || new vscode.ThemeIcon('info');
    if (description) {
      this.description = description;
    }
    this.tooltip = label;
  }
  
  override updateState(state: any): void {
    // Placeholder items don't update
  }
}