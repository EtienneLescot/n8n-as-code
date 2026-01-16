# VS CODE EXTENSION (n8n-vscode-extension)

## 1. UX/UI Principles

- **State-Driven:** UI reflects Core state via Redux.
- **Persistent Resolution:** Critical actions (Resolve Conflict, Confirm Delete) are accessible via the Tree View (Child Items), not just transient dialogs.
- **Native Feel:** Uses File Decorations, Tree Views, and Quick Picks.

## 2. Configuration & Lifecycle

**Settings:** `n8n.apiKey`, `n8n.host`, `n8n.syncFolder`, `n8n.syncMode` (auto/manual).

**Lifecycle:**
- **On extension load:** Check settings validity.
- **On Settings Change:** Immediately Stop Core, clear UI, show "Reload/Apply" button. prevents ghost states.
- **On Auto-Sync Error:** Send a Toast Notification (Error).

## 3. The Workflow List (Side Bar)

### 3.1. Visual Item Specification

Items are rendered using `TreeDataProvider`.

**1. Label & Icons:**
- `IN_SYNC`: Green Check.
- `MODIFIED` (Loc/Rem): Blue Edit/Cloud.
- `CONFLICT`: 🔴 Red Alert.
- `DELETED`: ⚪ Grey Trash icon.

**2. File Decorations (Colorization):**

Using `FileDecorationProvider` to tint the text label:
- `CONFLICT`: Text Color = Red.
- `DELETED` (Loc/Rem): Text Color = Grey, Text Decoration = Strikethrough.

**3. Double-Click Behavior:**
- **Default:** Opens Local JSON file.
- **If CONFLICT:** Opens Diff View (VS Code Native Diff).

### 3.2. Contextual Inline Actions (Hover Buttons)

Buttons appear on the row when hovered.

| Icon | Action | Visibility |
|------|--------|------------|
| `split-horizontal` | **Open Workspace:** Split View (JSON Left / N8N Webview Right). | If File Exists. |
| `cloud-upload` | **Push:** Force push local to remote. | Mod Local, New Local. |
| `cloud-download` | **Pull:** Force pull remote to local. | Mod Remote, New Remote. |
| `trash` | **Delete:** Delete local file. | If File Exists & Not Deleted. |
| `git-compare` | **Diff:** Open Diff Editor. | Only if Conflict or Mod Remote. |

## 4. Persistent Conflict & Validation UI (The "Child Item" Pattern)

To ensure users can resolve issues without relying on transient Toasts, items in CONFLICT or DELETED status act as Folders.

### 4.1. Conflict Resolution

If Status == CONFLICT, the item can be expanded.

**Children Items:**

- **[📄 Show Diff]**
  - Icon: `git-compare`
  - Command: Opens Diff Editor.

- **[✅ Keep Local Version]**
  - Icon: `arrow-right`
  - Command: Trigger SyncEngine PUSH (Force).

- **[☁️ Keep Remote Version]**
  - Icon: `arrow-left`
  - Command: Trigger SyncEngine PULL (Force).

### 4.2. Deletion Validation

If Status == DELETED_LOCALLY (Local file missing), expand to see:

- **[🗑️ Confirm Remote Deletion]**
  - Icon: `trash`
  - Command: Delete Remote Workflow.

- **[↩️ Restore Local File]**
  - Icon: `reply`
  - Command: Pull from Remote/Archive.

(Logic applies symmetrically for DELETED_REMOTLY).

## 5. Notifications & Toasts Strategy

To balance information vs. spam:

**Error Toasts (Persistent/Error):**
- **Trigger:** API Connectivity Loss, Write Permission Error.
- **Visual:** Red Error Toast.

**Conflict Alerts (Info):**
- **Trigger:** When a workflow enters CONFLICT state and user is not focused on the tree view.
- **Visual:** "Conflict detected in 'MyWorkflow'. Check the N8N panel to resolve."
- **Note:** Do not trigger if user is manually syncing.

**Success Toasts:**
- **Manual Mode:** Show "Sync Complete".
- **Auto Mode:** Silent. Do not disturb the user for every save.

## 6. Implementation Technical Notes

### 6.1. Redux State Slice
```typescript
interface WorkflowState {
    id: string;
    status: SyncStatus;
    localPath: string;
    hasError: boolean; // To tint item red if specific sync failed
}
```

### 6.2. VS Code TreeDataProvider Logic
```typescript
getTreeItem(element: Workflow | ActionItem): TreeItem {
  if (isActionItem(element)) {
     // Render the "Keep Local" button
     const item = new TreeItem(element.label);
     item.command = element.command; // Click triggers action
     return item;
  }

  // Render Workflow
  const item = new TreeItem(element.name);
  item.contextValue = element.status; // For inline buttons visibility
  
  if (element.status === 'CONFLICT' || element.status.includes('DELETED')) {
      item.collapsibleState = TreeItemCollapsibleState.Expanded; // Auto-expand to show options
      item.iconPath = ... // Red Alert Icon
  }
  return item;
}

getChildren(element?): ProviderResult<any[]> {
    if (!element) return this.store.getAllWorkflows();
    
    // Return resolution options as children
    if (element.status === 'CONFLICT') {
        return [ new ActionItem('Show Diff'), new ActionItem('Keep Local'), ... ];
    }
    return [];
}
```