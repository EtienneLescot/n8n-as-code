import * as vscode from 'vscode';

/**
 * UI Event types for the n8n-as-code extension
 */
export enum UIEventType {
  // Workflow events
  WORKFLOW_STATUS_CHANGED = 'workflow:status-changed',
  WORKFLOW_ADDED = 'workflow:added',
  WORKFLOW_REMOVED = 'workflow:removed',
  WORKFLOW_UPDATED = 'workflow:updated',
  
  // Local file events (optimistic UI updates)
  LOCAL_FILE_CREATED = 'local:file-created',
  LOCAL_FILE_MODIFIED = 'local:file-modified',
  LOCAL_FILE_DELETED = 'local:file-deleted',
  
  // Sync events
  SYNC_STARTED = 'sync:started',
  SYNC_COMPLETED = 'sync:completed',
  SYNC_ERROR = 'sync:error',
  
  // Conflict events
  CONFLICT_DETECTED = 'conflict:detected',
  CONFLICT_RESOLVED = 'conflict:resolved',
  
  // Deletion events
  DELETION_DETECTED = 'deletion:detected',
  DELETION_CONFIRMED = 'deletion:confirmed',
  DELETION_RESTORED = 'deletion:restored',
  
  // UI state events
  UI_REFRESH_NEEDED = 'ui:refresh-needed',
  UI_STATE_CHANGED = 'ui:state-changed',
  
  // Extension lifecycle events
  EXTENSION_INITIALIZED = 'extension:initialized',
  EXTENSION_ERROR = 'extension:error',
}

/**
 * Payload for workflow status changed event
 */
export interface WorkflowStatusChangedPayload {
  workflowId: string;
  oldStatus?: string;
  newStatus: string;
  workflow?: any;
  timestamp: number;
}

/**
 * Payload for sync events
 */
export interface SyncEventPayload {
  type: 'push' | 'pull' | 'full-sync';
  count?: number;
  duration?: number;
  error?: string;
}

/**
 * Payload for conflict events
 */
export interface ConflictEventPayload {
  workflowId: string;
  filename: string;
  conflictData: any;
}

/**
 * Payload for local file events
 */
export interface LocalFileEventPayload {
  filename: string;
  filePath: string;
  workflowId?: string;
  timestamp: number;
}

/**
 * Payload for deletion events
 */
export interface DeletionEventPayload {
  workflowId: string;
  filename: string;
  isLocal: boolean;
}

/**
 * Payload for UI state events
 */
export interface UIStateEventPayload {
  state: string;
  error?: string;
  context?: any;
}

/**
 * Type for event payloads
 */
export type UIEventPayload =
  | WorkflowStatusChangedPayload
  | SyncEventPayload
  | ConflictEventPayload
  | DeletionEventPayload
  | LocalFileEventPayload
  | UIStateEventPayload
  | any;

/**
 * Event handler function type
 */
export type UIEventHandler = (payload: UIEventPayload) => void;

/**
 * Centralized event bus for UI communication
 * 
 * This decouples SyncManager from UI components and allows for:
 * - Clean separation of concerns
 * - Multiple listeners for the same event
 * - Event history and debugging
 * - Better testability
 */
export class UIEventBus {
  private static instance: UIEventBus;
  private listeners: Map<UIEventType, Set<UIEventHandler>> = new Map();
  private eventHistory: Array<{ type: UIEventType; payload: UIEventPayload; timestamp: number }> = [];
  private maxHistorySize = 100;
  
  private constructor() {}
  
  /**
   * Get singleton instance
   */
  public static getInstance(): UIEventBus {
    if (!UIEventBus.instance) {
      UIEventBus.instance = new UIEventBus();
    }
    return UIEventBus.instance;
  }
  
  /**
   * Emit an event
   */
  emit(eventType: UIEventType, payload: UIEventPayload): void {
    // Add to history
    this.eventHistory.push({
      type: eventType,
      payload,
      timestamp: Date.now()
    });
    
    // Trim history if needed
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
    
    // Notify listeners
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error in event handler for ${eventType}:`, error);
        }
      });
    }
    
    // Also emit to VS Code context for global state if needed
    if (eventType === UIEventType.UI_STATE_CHANGED) {
      const statePayload = payload as UIStateEventPayload;
      vscode.commands.executeCommand('setContext', 'n8n.uiState', statePayload.state);
    }
  }
  
  /**
   * Subscribe to an event
   */
  on(eventType: UIEventType, handler: UIEventHandler): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    
    const handlers = this.listeners.get(eventType)!;
    handlers.add(handler);
    
    // Return unsubscribe function
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(eventType);
      }
    };
  }
  
  /**
   * Subscribe to an event once (auto-unsubscribe after first call)
   */
  once(eventType: UIEventType, handler: UIEventHandler): () => void {
    const wrappedHandler = (payload: UIEventPayload) => {
      handler(payload);
      unsubscribe();
    };
    
    const unsubscribe = this.on(eventType, wrappedHandler);
    return unsubscribe;
  }
  
  /**
   * Unsubscribe from an event
   */
  off(eventType: UIEventType, handler: UIEventHandler): void {
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(eventType);
      }
    }
  }
  
  /**
   * Get recent event history
   */
  getHistory(limit?: number): Array<{ type: UIEventType; payload: UIEventPayload; timestamp: number }> {
    const history = [...this.eventHistory];
    if (limit && limit > 0) {
      return history.slice(-limit);
    }
    return history;
  }
  
  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }
  
  /**
   * Get listener count for an event type
   */
  getListenerCount(eventType: UIEventType): number {
    const handlers = this.listeners.get(eventType);
    return handlers ? handlers.size : 0;
  }
  
  /**
   * Remove all listeners
   */
  removeAllListeners(): void {
    this.listeners.clear();
  }
}

/**
 * Helper function to get the event bus instance
 */
export function getEventBus(): UIEventBus {
  return UIEventBus.getInstance();
}

/**
 * Convenience functions for common events
 */
export const UIEventHelpers = {
  /**
   * Emit workflow status changed event
   */
  emitWorkflowStatusChanged(workflowId: string, newStatus: string, oldStatus?: string, workflow?: any): void {
    const bus = getEventBus();
    bus.emit(UIEventType.WORKFLOW_STATUS_CHANGED, {
      workflowId,
      oldStatus,
      newStatus,
      workflow,
      timestamp: Date.now()
    });
  },
  
  /**
   * Emit sync started event
   */
  emitSyncStarted(type: 'push' | 'pull' | 'full-sync'): void {
    const bus = getEventBus();
    bus.emit(UIEventType.SYNC_STARTED, { type });
  },
  
  /**
   * Emit sync completed event
   */
  emitSyncCompleted(type: 'push' | 'pull' | 'full-sync', count?: number, duration?: number): void {
    const bus = getEventBus();
    bus.emit(UIEventType.SYNC_COMPLETED, { type, count, duration });
  },
  
  /**
   * Emit UI refresh needed event
   */
  emitUIRefreshNeeded(reason?: string): void {
    const bus = getEventBus();
    bus.emit(UIEventType.UI_REFRESH_NEEDED, { reason, timestamp: Date.now() });
  },
  
  /**
   * Emit conflict detected event
   */
  emitConflictDetected(workflowId: string, filename: string, conflictData: any): void {
    const bus = getEventBus();
    bus.emit(UIEventType.CONFLICT_DETECTED, { workflowId, filename, conflictData });
  },

  /**
   * Emit local file created event (optimistic UI update)
   */
  emitLocalFileCreated(filename: string, filePath: string, workflowId?: string): void {
    const bus = getEventBus();
    bus.emit(UIEventType.LOCAL_FILE_CREATED, {
      filename,
      filePath,
      workflowId,
      timestamp: Date.now()
    });
  },

  /**
   * Emit local file modified event (optimistic UI update)
   */
  emitLocalFileModified(filename: string, filePath: string, workflowId?: string): void {
    const bus = getEventBus();
    bus.emit(UIEventType.LOCAL_FILE_MODIFIED, {
      filename,
      filePath,
      workflowId,
      timestamp: Date.now()
    });
  },

  /**
   * Emit local file deleted event (optimistic UI update)
   */
  emitLocalFileDeleted(filename: string, filePath: string, workflowId?: string): void {
    const bus = getEventBus();
    bus.emit(UIEventType.LOCAL_FILE_DELETED, {
      filename,
      filePath,
      workflowId,
      timestamp: Date.now()
    });
  },

  /**
   * Emit deletion detected event
   */
  emitDeletionDetected(workflowId: string, filename: string, isLocal: boolean): void {
    const bus = getEventBus();
    bus.emit(UIEventType.DELETION_DETECTED, { workflowId, filename, isLocal });
  }
};