# Feature: Archive Filter Tabs & Search — `pr-324`

> **Branch**: `fix/309-archived-workflows-label-archive-tabs-search`
> **Target**: `Darrellwan:n8n-as-code:main`
> **Status**: Implementation complete, documentation complete

---

## 🎯 Overview

This feature adds two capabilities to the n8n-as-code VS Code extension:

1. **Archive Filter Tabs** in the sidebar tree view — three scopes: "Workflows" (active only), "Archived", "All"
2. **Unscoped Find Workflow command** — QuickPick search across all workflows regardless of active tab, with automatic tab-switch on reveal

**Core principle**: The tree view and the search command operate independently. The tree is filtered by tab; the search is always global.

---

## 📐 Architecture

### 6-files changed

```
packages/vscode-extension/src/
  extension.ts                     — commands registration, revealWorkflowInTree
  services/workflow-store.ts      — Redux slice, archiveFilter state, loadWorkflows thunk
  utils/workflow-finder.ts        — QuickPick UI builder, buildWorkflowQuickPickItems

docs/docs/usage/
  cli.md                          — list/find --include-archived / --only-archived
  vscode-extension.md             — new tabs section, search command

packages/skills/src/services/
  ai-context-generator.ts         — AGENTS.md instructions for agents
```

---

## 🔴 Redux State Design

### Store shape

```typescript
interface RootState {
  workflows: {
    byId: Record<string, IWorkflowStatus>;
    allIds: string[];
    lastSync: number | null;
  };
  sync: {
    mode: 'lightweight' | 'full';
    watching: boolean;
    syncing: boolean;
    error: string | null;
    archiveFilter: 'workflows' | 'archived' | 'all';  // ← new
  };
  conflicts: Record<string, ConflictState>;
}
```

### Archive filter actions

```typescript
setArchiveFilter('workflows' | 'archived' | 'all')

selectArchiveFilter(state): 'workflows' | 'archived' | 'all'
```

### Filter → API options mapping

| Filter     | `includeArchived` | `onlyArchived` |
|------------|-------------------|----------------|
| `workflows`| `undefined`       | `undefined`    |
| `archived` | —                 | `true`         |
| `all`      | `true`            | —              |

---

## 🔄 Data Flow

### Tab switch (`n8n.showActive` / `n8n.showArchived` / `n8n.showAll`)

```
User clicks tab
  → dispatch(setArchiveFilter(<filter>))
  → optionally update treeView.title
  → dispatch(loadWorkflows())
      → syncManagerRef.listWorkflows({ includeArchived?, onlyArchived? })
          → n8n API GET /workflows (includeArchived / onlyArchived query params)
      → dispatch(setWorkflows(workflows[]))
  → enhancedTreeProvider.refresh()
```

### Find Workflow (`n8n.findWorkflow`)

```
User triggers command
  → cli.list({ fetchRemote: true, includeArchived: true })   ← always unscoped
      → Redux store updated via setWorkflows()
      → enhancedTreeProvider refreshed
  → showQuickPick(buildWorkflowQuickPickItems(workflows))   ← all workflows visible
  → picked.workflow passed to:
      revealWorkflowInTree(workflow)   ← tab auto-switch if needed
          → selectArchiveFilter(current)
          → if archived AND filter === 'workflows'
               dispatch(setArchiveFilter('all'))
               treeView.title = 'All Workflows'
          → treeView.reveal(item, { select: true, focus: true, expand: true })
      openWorkflowFromFinder(workflow)
```

### `buildWorkflowQuickPickItems` — label format

```typescript
// Before (bug): $(archive) was shown on ALL items regardless of isArchived
// After (fixed): icon is conditional
const archivedIcon  = workflow.isArchived ? '$(archive) ' : '';
const archivedSuffix = workflow.isArchived ? ' [archived]' : '';
label: `${archivedIcon}${workflow.name}${archivedSuffix}`
// Examples:
//   Active workflow  → "My Workflow"
//   Archived workflow → "$(archive) My Workflow [archived]"
```

---

## 🌲 Tree View Data Path

The tree view reads from Redux via `selectAllWorkflows`, which returns `state.workflows.allIds.map(k => state.workflows.byId[k])`. The `loadWorkflows` thunk populates the store based on the current `archiveFilter`.

```
TreeProvider.getChildren()
  → selectAllWorkflows(store.getState())
  → WorkflowItem[] (with pendingAction: 'conflict' | undefined)
```

> ⚠️ **Important**: `selectAllWorkflows` does NOT filter by archive state. The store itself contains only the workflows loaded by the last `loadWorkflows` call. Since `loadWorkflows` is dispatched on every tab switch with the appropriate `includeArchived`/`onlyArchived` options, the store only ever holds the workflows relevant to the current tab. `selectAllWorkflows` returns the full store content — it is already correctly scoped by what `loadWorkflows` loaded.

---

## 🧠 Key Design Decisions

### Decision 1: Store is tab-scoped, not all-scope

When switching tabs, `loadWorkflows` re-fetches with the new archive filter and replaces the store content entirely. The tree view always reflects the active tab's scope. This avoids filtering in the tree provider and keeps the implementation simple.

**Trade-off**: When the user switches from "All" back to "Workflows", the previously-loaded archived workflows are purged from the store. The "Find Workflow" command works around this by calling `cli.list` directly with `includeArchived: true` instead of reading from the store.

### Decision 2: Search is always global

`n8n.findWorkflow` calls `cli.list({ fetchRemote: true, includeArchived: true })` — bypassing the tab-scoped store entirely. This ensures the QuickPick always shows all workflows, regardless of which tab is active. The store is updated after the call so the tree reflects what was searched.

### Decision 3: Tab auto-switch on reveal (not on search)

When a picked workflow from the QuickPick is revealed in the tree:
- If the workflow is archived AND the current tab is `workflows`, the tab is switched to `all`
- This is a one-way adaptation: we do NOT restore the previous tab after reveal

**Reasoning**: The user's intent after picking is to see the workflow in the tree. Forcing the user to manually switch tabs would defeat the purpose of the QuickPick navigation. This is an accommodation, not a state synchronization mechanism.

---

## 🗂️ CLI — Archive Flags

Both `list` and `find` commands expose the same archive filtering:

| Flag | list | find | Default |
|------|------|------|---------|
| `--include-archived` | Include archived in output | Include archived in search | only non-archived |
| `--only-archived` | Show only archived | Search only archived | — |

**SSOT for flag documentation**: `packages/cli/src/index.ts` is the source of truth. `docs/docs/usage/cli.md` and `packages/skills/src/services/ai-context-generator.ts` (AGENTS.md section) must be kept in sync manually.

Default behaviour (non-archived only) is documented in:
- `list` / `find` command descriptions: *"By default, only non-archived workflows are shown/searched"*
- `cli.md` examples with comments: `# Show all non-archived workflows`
- `ai-context-generator.ts`: updated list command guidance with the 3 flag variants

---

## 🧪 Testing Notes

### Manual test cases

| # | Action | Expected |
|---|--------|----------|
| 1 | Click "Workflows" tab | Tree shows only active workflows; title = "Workflows" |
| 2 | Click "Archived" tab | Tree shows only archived; title = "Archived Workflows" |
| 3 | Click "All" tab | Tree shows active + archived |
| 4 | `n8n.findWorkflow` with "All" tab active | QuickPick shows all workflows |
| 5 | `n8n.findWorkflow` with "Workflows" tab active | QuickPick shows all workflows (same as #4) |
| 6 | Pick an archived workflow from QuickPick (tab = "Workflows") | Tree switches to "All" tab, item is selected/focused |
| 7 | Pick an active workflow from QuickPick | Tree remains on current tab, item is selected/focused |
| 8 | `$(archive)` icon | Shown ONLY on archived items in QuickPick |
| 9 | `n8nac list` | Shows only non-archived (default) |
| 10 | `n8nac list --include-archived` | Shows active + archived |
| 11 | `n8nac list --only-archived` | Shows only archived |

---

## 📦 Related Files Summary

| File | Role |
|------|------|
| `packages/vscode-extension/src/services/workflow-store.ts` | Redux slice, `setArchiveFilter` action, `loadWorkflows` thunk, `selectArchiveFilter` selector |
| `packages/vscode-extension/src/extension.ts` | `n8n.showActive/Archived/All` commands, `n8n.findWorkflow`, `revealWorkflowInTree` (with tab auto-switch) |
| `packages/vscode-extension/src/utils/workflow-finder.ts` | `buildWorkflowQuickPickItems` — conditional `$(archive)` icon + `[archived]` suffix |
| `packages/cli/src/commands/list.ts` | `ListCommandOptions` interface with `includeArchived`/`onlyArchived`; `applyListCommandOptions` passes them to `syncManager.listWorkflows` |
| `packages/cli/src/index.ts` | `list`/`find` command definitions with `--include-archived`/`--only-archived` options + descriptions |
| `packages/cli/src/core/services/sync-manager.ts` | `listWorkflows` → passes `includeArchived`/`onlyArchived` to `getLightweightList` / `refreshRemoteState` |
| `packages/cli/src/core/services/workflow-state-tracker.ts` | `getLightweightList` — reads `remoteArchived` map to compute `isArchived` field |
| `packages/skills/src/services/ai-context-generator.ts` | Regenerates `AGENTS.md` with updated list command guidance + archive flags |
| `docs/docs/usage/cli.md` | `list`/`find` command docs with archive flags and examples |
| `docs/docs/usage/vscode-extension.md` | New "Archive Filter Tabs" section documenting the 3 tabs |