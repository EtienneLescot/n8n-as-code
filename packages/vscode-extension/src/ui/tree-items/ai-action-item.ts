import * as vscode from 'vscode';
import { BaseTreeItem } from './base-tree-item.js';
import { TreeItemType } from '../../types.js';

/**
 * Tree item for AI context update action (shown at bottom when initialized)
 */
export class AIActionItem extends BaseTreeItem {
  readonly type = TreeItemType.AI_ACTION;
  
  constructor(
    public lastVersion?: string,
    public needsUpdate: boolean = false
  ) {
    super('Update AI Context', vscode.TreeItemCollapsibleState.None);
    
    this.iconPath = new vscode.ThemeIcon('sparkle');
    
    // Handle "Unknown" version as not initialized
    const displayVersion = lastVersion && lastVersion !== 'Unknown' && lastVersion !== 'unknown' ? lastVersion : undefined;
    this.description = displayVersion ? `v${displayVersion}` : 'Not initialized';
    this.tooltip = this.getTooltip();
    
    // Make it clickable to update AI context
    this.command = {
      command: 'n8n.initializeAI',
      title: 'Update AI Context',
      arguments: []
    };
  }
  
  private getTooltip(): string {
    if (this.needsUpdate) {
      return 'AI context is out of date. Click to update with latest n8n schema.';
    }
    
    // Handle "Unknown" version as not initialized
    const displayVersion = this.lastVersion && this.lastVersion !== 'Unknown' && this.lastVersion !== 'unknown' ? this.lastVersion : undefined;
    
    if (displayVersion) {
      return `AI context initialized for n8n v${displayVersion}. Click to update if needed.`;
    } else {
      return 'Initialize AI context for better code completion and documentation.';
    }
  }
  
  override updateState(state: any): void {
    const { lastVersion, needsUpdate } = state;
    this.lastVersion = lastVersion;
    this.needsUpdate = needsUpdate !== undefined ? needsUpdate : this.needsUpdate;
    
    // Handle "Unknown" version as not initialized
    const displayVersion = this.lastVersion && this.lastVersion !== 'Unknown' && this.lastVersion !== 'unknown' ? this.lastVersion : undefined;
    this.description = displayVersion ? `v${displayVersion}` : 'Not initialized';
    this.tooltip = this.getTooltip();
  }
}