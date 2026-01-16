import * as vscode from 'vscode';
import { Store } from '@reduxjs/toolkit';
import { SyncManager, WorkflowSyncStatus } from '@n8n-as-code/core';
import { ExtensionState } from '../types.js';
import { validateN8nConfig } from '../utils/state-detection.js';

import { store, RootState, selectAllWorkflows, selectPendingDeletions, selectConflicts } from '../services/workflow-store.js';

import { BaseTreeItem } from './tree-items/base-tree-item.js';
import { LoadingItem } from './tree-items/loading-item.js';
import { ErrorItem } from './tree-items/error-item.js';
import { AIActionItem } from './tree-items/ai-action-item.js';
import { WorkflowItem } from './tree-items/workflow-item.js';
import { InfoItem } from './tree-items/info-item.js';
import { ActionItem, ActionItemType } from './tree-items/action-item.js';

/**
 * Enhanced tree provider that handles multiple extension states
 */
export class EnhancedWorkflowTreeProvider implements vscode.TreeDataProvider<BaseTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<BaseTreeItem | undefined | null | void> = new vscode.EventEmitter<BaseTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<BaseTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private syncManager: SyncManager | undefined;
  private extensionState: ExtensionState = ExtensionState.UNINITIALIZED;
  private initializationError: string | undefined;

  private aiLastVersion: string | undefined;
  private aiNeedsUpdate: boolean = false;

  // Cache management
  private cachedTreeItems: BaseTreeItem[] | null = null;
  private cacheInvalidationTime: number = 0;

  // Debouncing for refresh
  private refreshTimeout: NodeJS.Timeout | null = null;

  // Store subscription
  private storeUnsubscribe?: () => void;

  constructor() {
    // No more manual event listeners!
  }

  /**
   * Subscribe to Redux store
   */
  public subscribeToStore(reduxStore: Store<RootState>) {
    // Unsubscribe previous if any
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
    }

    this.storeUnsubscribe = reduxStore.subscribe(() => {
      // Store changed, refresh tree
      this.invalidateCache();
      this.refresh();
    });
  }

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
      this.invalidateCache();
      this.refresh();
    }
  }

  /**
   * Set the sync manager (when initialized)
   */
  setSyncManager(manager: SyncManager): void {
    this.syncManager = manager;
    this.invalidateCache();
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
   * Refresh the tree view with debouncing and cache invalidation
   */
  refresh(): void {
    // Invalidate cache
    this.cachedTreeItems = null;

    // Clear existing timeout if any
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }

    // Set new timeout for debounced refresh
    this.refreshTimeout = setTimeout(() => {
      this._onDidChangeTreeData.fire();
      this.refreshTimeout = null;
    }, 100);
  }

  /**
   * Invalidate cache (call when data changes)
   */
  invalidateCache(): void {
    this.cachedTreeItems = null;
    this.cacheInvalidationTime = Date.now();
  }

  /**
   * Check if cache is valid (less than 1 second old)
   */
  private isCacheValid(): boolean {
    const CACHE_TTL_MS = 1000; // 1 second
    return this.cachedTreeItems !== null &&
      Date.now() - this.cacheInvalidationTime < CACHE_TTL_MS;
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
    // If element is a WorkflowItem, return its action children
    if (element && element instanceof WorkflowItem) {
      return this.getWorkflowActionItems(element);
    }

    // Root level items
    if (!element) {
      switch (this.extensionState) {
        case ExtensionState.UNINITIALIZED:
        case ExtensionState.CONFIGURING:
        case ExtensionState.SETTINGS_CHANGED:
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

    return [];
  }

  /**
   * Get action items for a workflow (conflict resolution or deletion confirmation)
   */
  private getWorkflowActionItems(workflowItem: WorkflowItem): BaseTreeItem[] {
    const { workflow, pendingAction } = workflowItem;
    const actions: BaseTreeItem[] = [];

    // Conflict resolution actions
    if (pendingAction === 'conflict' || workflow.status === WorkflowSyncStatus.CONFLICT) {
      actions.push(
        new ActionItem(ActionItemType.SHOW_DIFF, workflow.id, workflow),
        new ActionItem(ActionItemType.KEEP_LOCAL, workflow.id, workflow),
        new ActionItem(ActionItemType.KEEP_REMOTE, workflow.id, workflow)
      );
    }

    // Deletion confirmation actions
    if (pendingAction === 'delete' || workflow.status === WorkflowSyncStatus.DELETED_LOCALLY) {
      actions.push(
        new ActionItem(ActionItemType.CONFIRM_DELETE, workflow.id, workflow),
        new ActionItem(ActionItemType.RESTORE_FILE, workflow.id, workflow)
      );
    }

    // Remote deletion actions (confirm deletion OR restore)
    if (workflow.status === WorkflowSyncStatus.DELETED_REMOTELY) {
      actions.push(
        new ActionItem(ActionItemType.CONFIRM_DELETE, workflow.id, workflow),
        new ActionItem(ActionItemType.RESTORE_FILE, workflow.id, workflow)
      );
    }

    return actions;
  }

  private getInitializingItems(): BaseTreeItem[] {
    return [new LoadingItem('Initializing n8n...')];
  }

  private async getInitializedItems(): Promise<BaseTreeItem[]> {
    if (this.isCacheValid() && this.cachedTreeItems) {
      return this.cachedTreeItems;
    }

    // Read from Redux Store
    const state = store.getState();
    const workflows = selectAllWorkflows(state);
    const pendingDeletions = new Set(selectPendingDeletions(state));
    const conflicts = selectConflicts(state);

    const items: BaseTreeItem[] = [];

    // Add workflow items
    if (workflows.length > 0) {
      items.push(...workflows.map(wf => {
        let pendingAction: 'delete' | 'conflict' | undefined;
        if (pendingDeletions.has(wf.id)) pendingAction = 'delete';
        else if (conflicts[wf.id]) pendingAction = 'conflict';

        return new WorkflowItem(wf, pendingAction);
      }));
    } else if (this.syncManager) {
      items.push(new InfoItem(
        'No workflows found',
        'Create workflows in n8n or sync',
        new vscode.ThemeIcon('info')
      ));
    }

    // Add AI action button
    if (this.syncManager) {
      const aiAction = new AIActionItem(this.aiLastVersion, this.aiNeedsUpdate);
      items.push(aiAction);
    }

    this.cachedTreeItems = items;
    this.cacheInvalidationTime = Date.now();

    return items;
  }

  private getErrorItems(): BaseTreeItem[] {
    const configValidation = validateN8nConfig();
    
    const items: BaseTreeItem[] = [];
    
    // 1. Main Error Item (non-clickable, just status)
    const errorItem = new ErrorItem(this.initializationError || 'Unknown error', false);
    errorItem.label = 'Initialization Failed';
    errorItem.description = '';
    errorItem.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
    items.push(errorItem);
    
    // 2. Explanation
    const explanationItem = new InfoItem(
      'Instance is unreachable',
      'It may have stopped',
      new vscode.ThemeIcon('warning')
    );
    explanationItem.tooltip = this.initializationError;
    items.push(explanationItem);

    // 3. Spacing
    items.push(new InfoItem('', '', new vscode.ThemeIcon('blank')));

    // 4. Action: Retry
    if (configValidation.isValid) {
      const retryItem = new InfoItem('Retry Connection', '', new vscode.ThemeIcon('refresh'));
      retryItem.command = {
        command: 'n8n.init',
        title: 'Retry Connection'
      };
      items.push(retryItem);
    }

    // 5. Action: Settings
    const settingsItem = new InfoItem('Open Settings', '', new vscode.ThemeIcon('settings-gear'));
    settingsItem.command = {
      command: 'n8n.openSettings',
      title: 'Open Settings'
    };
    items.push(settingsItem);
    
    return items;
  }

  getParent(_element: BaseTreeItem): vscode.ProviderResult<BaseTreeItem> {
    return null;
  }

  resolveTreeItem(_item: BaseTreeItem, element: BaseTreeItem, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.TreeItem> {
    return element;
  }

  /**
   * Get conflict data for a workflow (helper for hooks)
   */
  getConflict(id: string): any {
    const state = store.getState();
    const conflicts = selectConflicts(state);
    const conflict = conflicts[id];
    return conflict ? { id: conflict.id, filename: conflict.filename, remoteContent: conflict.remoteContent } : undefined;
  }

  dispose(): void {
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
    }
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }
  }
}
