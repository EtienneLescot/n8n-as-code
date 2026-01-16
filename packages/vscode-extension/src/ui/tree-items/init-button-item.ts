import * as vscode from 'vscode';
import { BaseTreeItem } from './base-tree-item.js';
import { TreeItemType } from '../../types.js';

/**
 * Tree item representing the big "Init N8N as code" button
 */
export class InitButtonItem extends BaseTreeItem {
  readonly type = TreeItemType.INIT_BUTTON;
  
  constructor(
    public enabled: boolean = true,
    public missingConfig: string[] = []
  ) {
    super('Init N8N as code', vscode.TreeItemCollapsibleState.None);
    
    this.iconPath = new vscode.ThemeIcon('rocket');
    this.command = enabled ? {
      command: 'n8n.init',
      title: 'Initialize n8n as code',
      arguments: []
    } : undefined;
    
    this.description = enabled ? 'Click to start' : 'Configure settings first';
    this.tooltip = this.getTooltip();
    this.contextValue = this.getContextValue();
  }
  
  private getTooltip(): string {
    if (this.enabled) {
      return 'Initialize n8n synchronization in this workspace';
    } else if (this.missingConfig.length > 0) {
      return `Missing configuration: ${this.missingConfig.join(', ')}. Click to open settings.`;
    } else {
      return 'Please configure n8n host and API key in settings first';
    }
  }
  
  override getContextValue(): string {
    return this.enabled ? 'init-button-enabled' : 'init-button-disabled';
  }
  
  override updateState(state: any): void {
    const { enabled, missingConfig } = state;
    this.enabled = enabled;
    this.missingConfig = missingConfig || [];
    
    // Update properties based on new state
    this.command = this.enabled ? {
      command: 'n8n.init',
      title: 'Initialize n8n as code',
      arguments: []
    } : undefined;
    
    this.description = this.enabled ? 'Click to start' : 'Configure settings first';
    this.tooltip = this.getTooltip();
    this.contextValue = this.getContextValue();
  }
}