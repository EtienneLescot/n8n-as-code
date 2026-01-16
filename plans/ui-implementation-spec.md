# UI Implementation Specification

## Overview
This document details the UI changes required for the n8n-as-code VS Code extension initialization redesign.

## Current UI Structure
1. **Sidebar**: Tree view showing workflows
2. **Status Bar**: n8n status indicator
3. **Title Area**: Buttons for AI init, settings, sync commands
4. **Context Menu**: Right-click menu on workflow items

## New UI Requirements

### 1. Initialization State Management

#### States:
- **UNINITIALIZED**: No configuration, show init button
- **CONFIGURING**: Settings incomplete, show setup guidance  
- **INITIALIZING**: Init in progress, show loading
- **INITIALIZED**: Normal operation, show workflows
- **ERROR**: Initialization failed, show error and retry

### 2. Sidebar Redesign

#### Uninitialized State:
```
┌─────────────────────────┐
│      n8n Explorer       │
├─────────────────────────┤
│                         │
│    ⚡ [Init N8N as code] │
│                         │
│  Configure settings first│
│  [Open Settings]        │
│                         │
└─────────────────────────┘
```

#### Configuring State (missing settings):
```
┌─────────────────────────┐
│      n8n Explorer       │
├─────────────────────────┤
│                         │
│    ⚡ [Init N8N as code] │
│        (disabled)       │
│                         │
│  ⚠️ Missing configuration│
│  • n8n Host URL         │
│  • API Key              │
│                         │
│  [Configure Settings]   │
│                         │
└─────────────────────────┘
```

#### Initializing State:
```
┌─────────────────────────┐
│      n8n Explorer       │
├─────────────────────────┤
│                         │
│    $(loading~spin)      │
│  Initializing n8n...    │
│                         │
└─────────────────────────┘
```

#### Initialized State:
```
┌─────────────────────────┐
│      n8n Explorer       │
├─────────────────────────┤
│ Workflow 1      [Active]│
│ Workflow 2    [Inactive]│
│ Workflow 3      [Active]│
│                         │
│ [Update AI Context]     │
└─────────────────────────┘
```

### 3. Tree Provider Modifications

#### Current `WorkflowTreeProvider`:
- Shows workflow items only
- Requires `syncManager` to be set

#### New `EnhancedWorkflowTreeProvider`:
- Supports multiple item types:
  - `InitButtonItem`: Big initialization button
  - `ConfigStatusItem`: Configuration status/guidance
  - `WorkflowItem`: Existing workflow items
  - `AIActionItem`: AI update button at bottom

#### State Transitions:
```typescript
interface TreeState {
  extensionState: ExtensionState;
  hasValidConfig: boolean;
  isPreviouslyInitialized: boolean;
  syncManager?: SyncManager;
}
```

### 4. Status Bar Updates

#### Current Behavior:
- Always shows "n8n" status
- Shows sync status during operations
- Shows watch mode indicator

#### New Behavior:
- **Hidden** when uninitialized
- **Shows "n8n: Not initialized"** when in configuring state
- **Normal operation** when initialized

### 5. Title Area Menu Changes

#### Current Menu Items:
- `n8n.initializeAI` (top)
- `n8n.openSettings`
- Sync commands (conditional)

#### New Menu Items:
- Remove `n8n.initializeAI` from title (move to bottom of tree)
- Keep `n8n.openSettings`
- Add `n8n.init` command for manual initialization
- Sync commands only show when initialized

### 6. Implementation Details

#### File: `packages/vscode-extension/src/ui/enhanced-workflow-tree-provider.ts`
```typescript
export enum TreeItemType {
  INIT_BUTTON = 'init-button',
  CONFIG_STATUS = 'config-status',
  WORKFLOW = 'workflow',
  AI_ACTION = 'ai-action',
  LOADING = 'loading',
  ERROR = 'error'
}

export class EnhancedWorkflowTreeProvider implements vscode.TreeDataProvider<BaseTreeItem> {
  private state: TreeState = {
    extensionState: ExtensionState.UNINITIALIZED,
    hasValidConfig: false,
    isPreviouslyInitialized: false
  };
  
  async getChildren(element?: BaseTreeItem): Promise<BaseTreeItem[]> {
    if (!element) {
      // Root level items based on state
      switch (this.state.extensionState) {
        case ExtensionState.UNINITIALIZED:
          return [
            new InitButtonItem(this.state.hasValidConfig),
            ...(this.state.hasValidConfig ? [] : [new ConfigStatusItem()])
          ];
        case ExtensionState.INITIALIZING:
          return [new LoadingItem()];
        case ExtensionState.INITIALIZED:
          const workflows = await this.getWorkflowItems();
          const aiAction = new AIActionItem();
          return [...workflows, aiAction];
        case ExtensionState.ERROR:
          return [new ErrorItem(this.errorMessage)];
      }
    }
    return [];
  }
}
```

#### File: `packages/vscode-extension/src/ui/init-button-item.ts`
```typescript
export class InitButtonItem extends vscode.TreeItem {
  constructor(public enabled: boolean = true) {
    super('Init N8N as code', vscode.TreeItemCollapsibleState.None);
    
    this.iconPath = new vscode.ThemeIcon('rocket');
    this.command = enabled ? {
      command: 'n8n.init',
      title: 'Initialize n8n as code'
    } : undefined;
    
    this.description = enabled ? 'Click to start' : 'Configure settings first';
    this.tooltip = enabled 
      ? 'Initialize n8n synchronization in this workspace'
      : 'Please configure n8n host and API key in settings first';
      
    if (!enabled) {
      this.contextValue = 'init-button-disabled';
    }
  }
}
```

### 7. Command Updates

#### New Command: `n8n.init`
- Manual initialization trigger
- Validates configuration
- Calls `initializeSyncManager`
- Updates tree state

#### Modified Command: `n8n.initializeAI`
- Move from title area to tree bottom
- Only show when initialized
- Update icon and positioning

### 8. Settings Integration

#### Settings Validation:
```typescript
function validateSettings(): { isValid: boolean; missing: string[] } {
  const { host, apiKey } = getN8nConfig();
  const missing = [];
  
  if (!host) missing.push('n8n.host');
  if (!apiKey) missing.push('n8n.apiKey');
  
  return {
    isValid: missing.length === 0,
    missing
  };
}
```

#### Settings Change Handler:
```typescript
vscode.workspace.onDidChangeConfiguration(async (e) => {
  if (e.affectsConfiguration('n8n')) {
    const validation = validateSettings();
    
    if (state.extensionState === ExtensionState.INITIALIZED) {
      // Show "Apply settings" notification
      showSettingsApplyNotification();
    } else {
      // Update UI state (enable/disable init button)
      updateTreeState();
    }
  }
});
```

### 9. Visual Design Guidelines

#### Colors:
- Init button: Primary accent color (`button.background`)
- Disabled state: Muted gray (`disabledForeground`)
- Error state: Red (`errorForeground`)
- Success state: Green (`charts.green`)

#### Icons:
- Init: `$(rocket)` or `$(zap)`
- Loading: `$(loading~spin)`
- Settings: `$(gear)`
- Error: `$(error)`
- Success: `$(check)`

#### Spacing:
- Center init button vertically
- Adequate padding around button
- Clear separation between sections

### 10. Migration Strategy

#### Phase 1: Add New Components
1. Create new tree item classes
2. Implement state management
3. Keep existing functionality working

#### Phase 2: Transition Logic
1. Modify activation to use new provider
2. Add state detection
3. Update command handlers

#### Phase 3: Remove Old Code
1. Remove old tree provider
2. Clean up unused commands
3. Update documentation

### 11. Testing Scenarios

#### Test Cases:
1. **Fresh workspace**: Should show init button
2. **Missing settings**: Should show configuration guidance
3. **Valid settings**: Should enable init button
4. **Click init**: Should initialize and show workflows
5. **Previously initialized**: Should auto-load workflows
6. **Settings change during init**: Should show apply notification
7. **Network error**: Should show error state with retry
8. **Multiple workspaces**: Should maintain separate states

### 12. Accessibility Considerations

#### Keyboard Navigation:
- Init button should be focusable
- Tab order should be logical
- Screen reader announcements for state changes

#### ARIA Labels:
- `aria-label` on init button
- `aria-live` region for status updates
- `aria-disabled` for disabled states

#### Color Contrast:
- Meet WCAG AA standards
- Sufficient contrast for all states
- Color-independent indicators