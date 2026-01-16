import * as vscode from 'vscode';
import { BaseTreeItem } from './base-tree-item.js';
import { TreeItemType } from '../../types.js';

/**
 * Simple info message tree item (non-interactive)
 */
export class InfoItem extends BaseTreeItem {
  readonly type = TreeItemType.INFO;
  
  constructor(
    label: string,
    description?: string,
    icon?: vscode.ThemeIcon
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    
    this.description = description;
    this.iconPath = icon || new vscode.ThemeIcon('info');
    this.contextValue = 'info';
  }
  
  override getContextValue(): string {
    return 'info';
  }
  
  override updateState(state: any): void {
    // Info items don't need dynamic updates
  }
}