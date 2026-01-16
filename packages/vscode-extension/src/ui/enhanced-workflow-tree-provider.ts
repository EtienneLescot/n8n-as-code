import * as vscode from 'vscode';
import { SyncManager, IWorkflowStatus, WorkflowSyncStatus } from '@n8n-as-code/core';
import { ExtensionState, ExtensionStateContext } from '../types.js';
import { validateN8nConfig, getWorkspaceRoot, isFolderPreviouslyInitialized } from '../utils/state-detection.js';
import { UIEventBus, UIEventType, UIEventHelpers, getEventBus } from '../services/ui-event-bus.js';

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

  // Pending states that wait for user confirmation
  private pendingDeletions: Set<string> = new Set();
  private pendingConflicts: Map<string, any> = new Map();

  // Cache management
  private lastReloadTime: number = 0;
  private isReloading: boolean = false;
  private cachedTreeItems: BaseTreeItem[] | null = null;
  private cacheInvalidationTime: number = 0;

  // Debouncing for refresh
  private refreshTimeout: NodeJS.Timeout | null = null;

  // Event bus and subscriptions
  private eventBus: UIEventBus;
  private eventSubscriptions: Array<() => void> = [];

  constructor() {
    this.eventBus = getEventBus();
    this.setupEventListeners();
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
   * Add a workflow to pending deletions
   */
  addPendingDeletion(id: string): void {
    this.pendingDeletions.add(id);
    this.refresh();
  }

  /**
   * Remove a workflow from pending deletions
   */
  removePendingDeletion(id: string): void {
    this.pendingDeletions.delete(id);
    this.refresh();
  }

  /**
   * Add a workflow to pending conflicts
   */
  addConflict(id: string, conflictData: any): void {
    this.pendingConflicts.set(id, conflictData);
    this.refresh();
  }

  /**
   * Remove a workflow from pending conflicts
   */
  removeConflict(id: string): void {
    this.pendingConflicts.delete(id);
    this.refresh();
  }

  /**
   * Get conflict data for a workflow
   */
  getConflict(id: string): any {
    return this.pendingConflicts.get(id);
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
   * Reload workflows from sync manager
   */
  async reloadWorkflows(): Promise<void> {
    if (!this.syncManager || this.isReloading) {
      return;
    }

    this.isReloading = true;
    try {
      const workflows = await this.syncManager.getWorkflowsStatus();
      this.workflows = workflows;
      this.lastReloadTime = Date.now();
      this.refresh();
    } catch (error) {
      console.error('Failed to reload workflows:', error);
      // Keep existing workflows on error
    } finally {
      this.isReloading = false;
    }
  }

  /**
   * Update a single workflow status (granular update)
   */
  async updateWorkflowStatus(workflowId: string, updates: Partial<IWorkflowStatus>): Promise<void> {
    const workflowIndex = this.workflows.findIndex(wf => wf.id === workflowId);
    
    if (workflowIndex !== -1) {
      // Update existing workflow
      this.workflows[workflowIndex] = {
        ...this.workflows[workflowIndex],
        ...updates
      };
      this.refresh();
    } else {
      // Workflow not found, reload all workflows to get latest data
      await this.reloadWorkflows();
    }
  }

  /**
   * Update multiple workflows at once (batch update)
   */
  updateWorkflowsBatch(updates: Array<{ workflowId: string; updates: Partial<IWorkflowStatus> }>): void {
    let hasChanges = false;
    
    for (const { workflowId, updates: workflowUpdates } of updates) {
      const workflowIndex = this.workflows.findIndex(wf => wf.id === workflowId);
      if (workflowIndex !== -1) {
        this.workflows[workflowIndex] = {
          ...this.workflows[workflowIndex],
          ...workflowUpdates
        };
        hasChanges = true;
      }
    }
    
    if (hasChanges) {
      this.refresh();
    }
  }

  /**
   * Handle errors gracefully with retry logic
   */
  private async handleErrorWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 2
  ): Promise<T | null> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`${operationName} attempt ${attempt} failed:`, lastError);
        
        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          const delayMs = 500 * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    
    // All retries failed
    console.error(`${operationName} failed after ${maxRetries} attempts:`, lastError);
    return null;
  }

  /**
   * Safely reload workflows with error handling
   */
  async safeReloadWorkflows(): Promise<boolean> {
    try {
      await this.reloadWorkflows();
      return true;
    } catch (error) {
      console.error('Failed to reload workflows:', error);
      
      // Emit error event
      this.eventBus.emit(UIEventType.EXTENSION_ERROR, {
        source: 'EnhancedWorkflowTreeProvider.safeReloadWorkflows',
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
      
      return false;
    }
  }

  /**
   * Get workflow by ID with fallback
   */
  getWorkflowById(workflowId: string): IWorkflowStatus | null {
    const workflow = this.workflows.find(wf => wf.id === workflowId);
    if (workflow) {
      return workflow;
    }
    
    // Try to find in pending deletions or conflicts
    if (this.pendingDeletions.has(workflowId)) {
      return {
        id: workflowId,
        name: 'Unknown (Pending Deletion)',
        filename: '',
        active: false,
        status: 'MISSING_LOCAL' as any // Using MISSING_LOCAL for deleted workflows
      };
    }
    
    if (this.pendingConflicts.has(workflowId)) {
      const conflictData = this.pendingConflicts.get(workflowId);
      return {
        id: workflowId,
        name: conflictData?.filename || 'Unknown (Conflict)',
        filename: conflictData?.filename || '',
        active: false,
        status: 'CONFLICT' as any
      };
    }
    
    return null;
  }

  /**
   * Check if cache is stale (older than 5 seconds)
   */
  private isCacheStale(): boolean {
    const CACHE_TTL_MS = 5000; // 5 seconds
    return Date.now() - this.lastReloadTime > CACHE_TTL_MS;
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
    }, 100); // 100ms debounce to avoid rapid successive refreshes
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
   * Get items for INITIALIZED state with caching
   */
  private async getInitializedItems(): Promise<BaseTreeItem[]> {
    // Return cached items if available and valid
    if (this.isCacheValid() && this.cachedTreeItems) {
      return this.cachedTreeItems;
    }
    
    const items: BaseTreeItem[] = [];
    
    // Always reload workflows if cache is stale or we have no workflows
    if (this.syncManager && (this.workflows.length === 0 || this.isCacheStale())) {
      try {
        const workflows = await this.syncManager.getWorkflowsStatus();
        this.workflows = workflows;
        this.lastReloadTime = Date.now();
      } catch (error) {
        console.error('Failed to load workflows in getInitializedItems:', error);
        // Continue with existing workflows if any
      }
    }
    
    // Add workflow items if available
    if (this.workflows.length > 0) {
      // Convert workflows to tree items
      items.push(...this.workflows.map(wf => {
        let pendingAction: 'delete' | 'conflict' | undefined;
        if (this.pendingDeletions.has(wf.id)) pendingAction = 'delete';
        else if (this.pendingConflicts.has(wf.id)) pendingAction = 'conflict';
        
        return new WorkflowItem(wf, pendingAction);
      }));
    } else if (this.syncManager) {
      // Show info message when no workflows
      const noWorkflows = new InfoItem(
        'No workflows found',
        'Create workflows in n8n or sync',
        new vscode.ThemeIcon('info')
      );
      items.push(noWorkflows);
    }
    
    // Add AI action button at the bottom (only if we have workflows or sync manager)
    if (this.syncManager) {
      const aiAction = new AIActionItem(this.aiLastVersion, this.aiNeedsUpdate);
      items.push(aiAction);
    }
    
    // Cache the results
    this.cachedTreeItems = items;
    this.cacheInvalidationTime = Date.now();
    
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

  /**
   * Setup event listeners for UI events
   */
  private setupEventListeners(): void {
      // Listen for UI refresh needed events
      const refreshSubscription = this.eventBus.on(UIEventType.UI_REFRESH_NEEDED, () => {
          this.refresh();
      });

      // Listen for workflow status changes
      const statusChangeSubscription = this.eventBus.on(UIEventType.WORKFLOW_STATUS_CHANGED, async (payload) => {
          // Update specific workflow using granular update
          const { workflowId, newStatus } = payload;
          await this.updateWorkflowStatus(workflowId, { status: newStatus });
      });

      // Listen for sync completion events
      const syncCompletedSubscription = this.eventBus.on(UIEventType.SYNC_COMPLETED, () => {
          // Invalidate cache and reload workflows after sync
          this.lastReloadTime = 0; // Force cache refresh
          this.reloadWorkflows();
      });

      // Listen for conflict events
      const conflictSubscription = this.eventBus.on(UIEventType.CONFLICT_DETECTED, (payload) => {
          const { workflowId, conflictData } = payload;
          this.addConflict(workflowId, conflictData);
      });

      // Listen for deletion events
      const deletionSubscription = this.eventBus.on(UIEventType.DELETION_DETECTED, (payload) => {
          const { workflowId, isLocal } = payload;
          if (isLocal) {
              this.addPendingDeletion(workflowId);
          }
      });

      // Listen for local file events (optimistic UI updates)
      const localFileCreatedSubscription = this.eventBus.on(UIEventType.LOCAL_FILE_CREATED, async (payload) => {
          const { filename, workflowId } = payload;
          console.log(`[n8n] Local file created: ${filename}`);
          // Force reload to detect new workflow
          this.lastReloadTime = 0;
          await this.reloadWorkflows();
      });

      const localFileModifiedSubscription = this.eventBus.on(UIEventType.LOCAL_FILE_MODIFIED, async (payload) => {
          const { filename, workflowId } = payload;
          console.log(`[n8n] Local file modified: ${filename}`);
          // Update workflow status to LOCAL_MODIFIED
          if (workflowId) {
              await this.updateWorkflowStatus(workflowId, { status: WorkflowSyncStatus.LOCAL_MODIFIED });
          } else {
              // If we don't have workflowId, reload all workflows
              this.lastReloadTime = 0;
              await this.reloadWorkflows();
          }
      });

      const localFileDeletedSubscription = this.eventBus.on(UIEventType.LOCAL_FILE_DELETED, async (payload) => {
          const { filename, workflowId } = payload;
          console.log(`[n8n] Local file deleted: ${filename}`);
          // Update workflow status to MISSING_LOCAL
          if (workflowId) {
              await this.updateWorkflowStatus(workflowId, { status: WorkflowSyncStatus.MISSING_LOCAL });
          } else {
              // If we don't have workflowId, reload all workflows
              this.lastReloadTime = 0;
              await this.reloadWorkflows();
          }
      });

      // Store subscriptions for cleanup
      this.eventSubscriptions.push(
          refreshSubscription,
          statusChangeSubscription,
          syncCompletedSubscription,
          conflictSubscription,
          deletionSubscription,
          localFileCreatedSubscription,
          localFileModifiedSubscription,
          localFileDeletedSubscription
      );
  }

  /**
   * Clean up event listeners
   */
  dispose(): void {
    // Clear all event subscriptions
    this.eventSubscriptions.forEach(unsubscribe => unsubscribe());
    this.eventSubscriptions = [];
    
    // Clear any pending timeout
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }
  }
}
