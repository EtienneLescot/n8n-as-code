/**
 * Extension state management types
 */

/**
 * The current state of the n8n-as-code extension
 */
export enum ExtensionState {
  /** Extension is not initialized, waiting for user action */
  UNINITIALIZED = 'uninitialized',
  
  /** Configuration is incomplete (missing host or API key) */
  CONFIGURING = 'configuring',
  
  /** Initialization is in progress */
  INITIALIZING = 'initializing',
  
  /** Extension is fully initialized and operational */
  INITIALIZED = 'initialized',
  
  /** Initialization failed with an error */
  ERROR = 'error',
  
  /** Settings have changed, waiting for user to apply them */
  SETTINGS_CHANGED = 'settings-changed'
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  /** Whether the configuration is valid */
  isValid: boolean;
  
  /** List of missing configuration keys */
  missing: string[];
  
  /** Optional error message if validation failed */
  error?: string;
}

/**
 * Initialization options
 */
export interface InitializationOptions {
  /** Whether to force reinitialization even if already initialized */
  force?: boolean;
  
  /** Whether to show UI notifications during initialization */
  silent?: boolean;
  
  /** Optional error callback */
  onError?: (error: Error) => void;
}

/**
 * Tree item types for the enhanced workflow tree provider
 */
export enum TreeItemType {
  /** Big initialization button */
  INIT_BUTTON = 'init-button',
  
  /** Configuration status/guidance item */
  CONFIG_STATUS = 'config-status',
  
  /** Loading indicator */
  LOADING = 'loading',
  
  /** Error display item */
  ERROR = 'error',
  
  /** Workflow item (existing) */
  WORKFLOW = 'workflow',
  
  /** AI action button at bottom */
  AI_ACTION = 'ai-action',
  
  /** Informational message item */
  INFO = 'info'
}

/**
 * Extension state context
 */
export interface ExtensionStateContext {
  /** Current extension state */
  state: ExtensionState;
  
  /** Whether configuration is valid */
  hasValidConfig: boolean;
  
  /** Whether folder was previously initialized */
  isPreviouslyInitialized: boolean;
  
  /** Current error message (if state is ERROR) */
  error?: string;
  
  /** Last initialization attempt timestamp */
  lastInitializationAttempt?: Date;
  
  /** Current workspace root path */
  workspaceRoot?: string;
}