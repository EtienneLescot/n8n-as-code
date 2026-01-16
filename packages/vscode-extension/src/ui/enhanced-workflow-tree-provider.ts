import * as vscode from 'vscode';
import { SyncManager, IWorkflowStatus } from '@n8n-as-code/core';
import { ExtensionState, ExtensionStateContext } from '../types.js';
import { validateN8nConfig, getWorkspaceRoot, isFolderPreviouslyInitialized } from '../utils/state-detection.js';

import { BaseTreeItem } from './tree-items/base-tree-item.js';
import { InitButtonItem } from './tree-items/init-button-item.js';
import { ConfigStatusItem } from './tree-items/config-status-item.js';
import { LoadingItem } from './tree-items/loading-item.js';
import { ErrorItem } from './tree-items/error-item.js';
import { AIActionItem } from './tree-items/ai-action-item.js';
import { PlaceholderItem } from './tree-items/placeholder-item.js';

/**
 * Enhanced tree provider that handles multiple extension states
 */
export class EnhancedWorkflowTreeProvider implements vscode.TreeDataProvider<BaseTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<BaseTreeItem | undefined | null | void> = new vscode.EventEmitter<BaseTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<BaseTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private syncManager: SyncManager | undefined;
  private extensionState: ExtensionState = ExtensionState.UNINITIALIZED;
  private initializationError: string | undefined;
  private workflows: IWorkflowStatus[] = [];
  private aiLastVersion: string | undefined;
  private aiNeedsUpdate: boolean = false;

  constructor() {}

  /**
   * Set the current extension state
   */
  setExtensionState(state: ExtensionState, error?: string): void {
    if (this.extensionState !== state || this.initializationError !== error) {
      this.extensionState = state;
      this.initializationError = error;
      this.refresh();
    }
  }

  /**
   * Set the sync manager (when initialized)
   */
  setSyncManager(manager: SyncManager): void {
    this.syncManager = manager;
    this.refresh();
  }

  /**
   * Update workflows list
   */
  setWorkflows(workflows: IWorkflowStatus[]): void {
    this.workflows = workflows;
    this.refresh();
  }

  /**
   * Update AI context information
   */
  setAIContextInfo(lastVersion?: string, needsUpdate: boolean = false): void {
    this.aiLastVersion = lastVersion;
    this.aiNeedsUpdate = needsUpdate;
    this.refresh();
  }

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item for element
   */
  getTreeItem(element: BaseTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for element (or root if no element)
   */
  async getChildren(element?: BaseTreeItem): Promise<BaseTreeItem[]> {
    // If we have an element, it's a leaf (no children)
    if (element) {
      return [];
    }

    // Root level items based on extension state
    switch (this.extensionState) {
      case ExtensionState.UNINITIALIZED:
        return this.getUninitializedItems();
        
      case ExtensionState.CONFIGURING:
        return this.getConfiguringItems();
        
      case ExtensionState.INITIALIZING:
        return this.getInitializingItems();
        
      case ExtensionState.INITIALIZED:
        return await this.getInitializedItems();
        
      case ExtensionState.ERROR:
        return this.getErrorItems();
        
      default:
        return [];
    }
  }

  /**
   * Get items for UNINITIALIZED state
   */
  private getUninitializedItems(): BaseTreeItem[] {
    const configValidation = validateN8nConfig();
    const workspaceRoot = getWorkspaceRoot();
    const previouslyInitialized = workspaceRoot ? isFolderPreviouslyInitialized(workspaceRoot) : false;
    
    const items: BaseTreeItem[] = [];
    
    // Add initialization button
    const initButton = new InitButtonItem(
      configValidation.isValid,
      configValidation.missing
    );
    items.push(initButton);
    
    // Add configuration guidance if needed
    if (!configValidation.isValid) {
      const configStatus = new ConfigStatusItem(configValidation.missing);
      items.push(configStatus);
    }
    
    // Add note about previously initialized folder if applicable
    if (previouslyInitialized && !configValidation.isValid) {
      // This would be a custom item, but for now we'll just update the button tooltip
      initButton.updateState({
        enabled: false,
        missingConfig: configValidation.missing,
        note: 'Folder was previously initialized. Configure settings to restore.'
      });
    }
    
    return items;
  }

  /**
   * Get items for CONFIGURING state
   */
  private getConfiguringItems(): BaseTreeItem[] {
    const configValidation = validateN8nConfig();
    
    const items: BaseTreeItem[] = [];
    
    // Add disabled initialization button
    const initButton = new InitButtonItem(false, configValidation.missing);
    items.push(initButton);
    
    // Add configuration status
    const configStatus = new ConfigStatusItem(configValidation.missing);
    items.push(configStatus);
    
    return items;
  }

  /**
   * Get items for INITIALIZING state
   */
  private getInitializingItems(): BaseTreeItem[] {
    return [
      new LoadingItem('Initializing n8n...')
    ];
  }

  /**
   * Get items for INITIALIZED state
   */
  private async getInitializedItems(): Promise<BaseTreeItem[]> {
    const items: BaseTreeItem[] = [];
    
    // Add workflow items if available
    if (this.workflows.length > 0) {
      // Convert workflows to tree items
      // For now, we'll use a placeholder - in a real implementation,
      // we would convert IWorkflowStatus to WorkflowItem
      // items.push(...this.workflows.map(wf => new WorkflowItem(wf)));
      
      // Placeholder: show count
      const placeholder = new PlaceholderItem(
        `${this.workflows.length} workflow(s) loaded`,
        'Click refresh to update',
        new vscode.ThemeIcon('list-tree')
      );
      items.push(placeholder);
    } else if (this.syncManager) {
      // Try to load workflows
      try {
        const workflows = await this.syncManager.getWorkflowsStatus();
        this.workflows = workflows;
        
        if (workflows.length > 0) {
          const placeholder = new PlaceholderItem(
            `${workflows.length} workflow(s) loaded`,
            undefined,
            new vscode.ThemeIcon('list-tree')
          );
          items.push(placeholder);
        } else {
          const noWorkflows = new PlaceholderItem(
            'No workflows found',
            'Create workflows in n8n or sync',
            new vscode.ThemeIcon('info')
          );
          items.push(noWorkflows);
        }
      } catch (error) {
        const errorItem = new PlaceholderItem(
          'Error loading workflows',
          String(error),
          new vscode.ThemeIcon('error')
        );
        items.push(errorItem);
      }
    }
    
    // Add AI action button at the bottom
    const aiAction = new AIActionItem(this.aiLastVersion, this.aiNeedsUpdate);
    items.push(aiAction);
    
    return items;
  }

  /**
   * Get items for ERROR state
   */
  private getErrorItems(): BaseTreeItem[] {
    const configValidation = validateN8nConfig();
    const canRetry = configValidation.isValid;
    
    return [
      new ErrorItem(this.initializationError || 'Unknown error', canRetry)
    ];
  }

  /**
   * Get parent of element (not used for flat tree)
   */
  getParent(element: BaseTreeItem): vscode.ProviderResult<BaseTreeItem> {
    return null;
  }

  /**
   * Resolve tree item (for additional properties)
   */
  resolveTreeItem(item: BaseTreeItem, element: BaseTreeItem, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TreeItem> {
    return element;
  }
}