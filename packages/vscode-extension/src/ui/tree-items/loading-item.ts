import * as vscode from 'vscode';
import { BaseTreeItem } from './base-tree-item.js';
import { TreeItemType } from '../../types.js';

/**
 * Tree item showing loading state
 */
export class LoadingItem extends BaseTreeItem {
  readonly type = TreeItemType.LOADING;
  
  constructor(
    public message: string = 'Initializing n8n...'
  ) {
    super(message, vscode.TreeItemCollapsibleState.None);
    
    this.iconPath = new vscode.ThemeIcon('loading~spin');
    this.description = 'Please wait';
    this.tooltip = 'Initialization in progress';
  }
  
  override updateState(state: any): void {
    const { message } = state;
    if (message && message !== this.message) {
      this.message = message;
      this.label = message;
    }
  }
}