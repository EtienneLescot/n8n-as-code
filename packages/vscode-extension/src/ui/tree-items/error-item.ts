import * as vscode from 'vscode';
import { BaseTreeItem } from './base-tree-item.js';
import { TreeItemType } from '../../types.js';

/**
 * Tree item showing error state with retry option
 */
export class ErrorItem extends BaseTreeItem {
  readonly type = TreeItemType.ERROR;
  
  constructor(
    public errorMessage: string,
    public canRetry: boolean = true
  ) {
    super('Initialization Failed', vscode.TreeItemCollapsibleState.None);
    
    this.iconPath = new vscode.ThemeIcon('error');
    this.description = 'Click to retry';
    this.tooltip = this.getTooltip();
    
    // Make it clickable to retry initialization
    this.command = canRetry ? {
      command: 'n8n.init',
      title: 'Retry Initialization',
      arguments: []
    } : undefined;
  }
  
  private getTooltip(): string {
    return `Error: ${this.errorMessage}\n\n${this.canRetry ? 'Click to retry initialization' : 'Please check configuration and try again'}`;
  }
  
  override updateState(state: any): void {
    const { errorMessage, canRetry } = state;
    this.errorMessage = errorMessage || this.errorMessage;
    this.canRetry = canRetry !== undefined ? canRetry : this.canRetry;
    
    this.tooltip = this.getTooltip();
    this.command = this.canRetry ? {
      command: 'n8n.init',
      title: 'Retry Initialization',
      arguments: []
    } : undefined;
  }
}