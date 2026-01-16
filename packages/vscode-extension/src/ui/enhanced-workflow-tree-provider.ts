import * as vscode from 'vscode';
import { SyncManager, IWorkflowStatus } from '@n8n-as-code/core';
import { ExtensionState, ExtensionStateContext } from '../types.js';
import { validateN8nConfig, getWorkspaceRoot, isFolderPreviouslyInitialized } from '../utils/state-detection.js';

import { BaseTreeItem } from './tree-items/base-tree-item.js';
import { LoadingItem } from './tree-items/loading-item.js';
import { ErrorItem } from './tree-items/error-item.js';
import { AIActionItem } from './tree-items/ai-action-item.js';
import { WorkflowItem } from './tree-items/workflow-item.js';
import { InfoItem } from './tree-items/info-item.js';

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
   * Get the current extension state
   */
  getExtensionState(): ExtensionState {
    return this.extensionState;
  }

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
      case ExtensionState.CONFIGURING:
      case ExtensionState.SETTINGS_CHANGED:
        // Return empty to show viewsWelcome in these states
        return [];
        
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
      items.push(...this.workflows.map(wf => new WorkflowItem(wf)));
    } else if (this.syncManager) {
      // Try to load workflows
      try {
        const workflows = await this.syncManager.getWorkflowsStatus();
        this.workflows = workflows;
        
        if (workflows.length > 0) {
          items.push(...workflows.map(wf => new WorkflowItem(wf)));
        } else {
          // Show info message when no workflows
          const noWorkflows = new InfoItem(
            'No workflows found',
            'Create workflows in n8n or sync',
            new vscode.ThemeIcon('info')
          );
          items.push(noWorkflows);
        }
      } catch (error) {
        const errorItem = new InfoItem(
          'Error loading workflows',
          String(error),
          new vscode.ThemeIcon('error')
        );
        items.push(errorItem);
      }
    }
    
    // Add AI action button at the bottom (only if we have workflows or sync manager)
    if (this.syncManager) {
      const aiAction = new AIActionItem(this.aiLastVersion, this.aiNeedsUpdate);
      items.push(aiAction);
    }
    
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