import * as vscode from 'vscode';
import { BaseTreeItem } from './base-tree-item.js';
import { TreeItemType } from '../../types.js';

/**
 * Tree item showing configuration status and guidance
 */
export class ConfigStatusItem extends BaseTreeItem {
  readonly type = TreeItemType.CONFIG_STATUS;
  
  constructor(
    public missingConfig: string[] = ['n8n.host', 'n8n.apiKey']
  ) {
    super('Configuration Required', vscode.TreeItemCollapsibleState.None);
    
    this.iconPath = new vscode.ThemeIcon('settings');
    this.description = 'Click to configure';
    this.tooltip = this.getTooltip();
    
    // Make it clickable to open settings
    this.command = {
      command: 'n8n.openSettings',
      title: 'Open Settings',
      arguments: []
    };
  }
  
  private getTooltip(): string {
    const missingList = this.missingConfig.map(config => {
      switch (config) {
        case 'n8n.host':
          return '• n8n Host URL';
        case 'n8n.apiKey':
          return '• API Key';
        default:
          return `• ${config}`;
      }
    }).join('\n');
    
    return `Missing configuration:\n${missingList}\n\nClick to open settings and configure.`;
  }
  
  override updateState(state: any): void {
    const { missingConfig } = state;
    this.missingConfig = missingConfig || [];
    this.tooltip = this.getTooltip();
  }
}