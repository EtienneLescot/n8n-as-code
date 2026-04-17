# Feature #309 — Archived Workflows Support

> **Branch**: `pr-324` (`fix/309-archived-workflows-label-archive-tabs-search`)
> **Target**: `Darrellwan:n8n-as-code:main`
> **Issue**: #309
> **Status**: Implementation complete, tests passing, documentation complete

---

## 🎯 Summary

This feature adds first-class support for archived workflows across the entire n8n-as-code stack — from the **CLI foundation** (where the core logic lives) to the **VS Code extension** (which consumes it) and the **AI agent context** (which instructs agents how to use the new flags).

```
┌─────────────────────────────────────────────────────────┐
│                     PR #324                              │
│  ┌───────────────┐  ┌────────────────────┐  ┌───────┐  │
│  │  CLI (core)   │  │  CliApi / SyncMgr   │  │ VSCode│  │
│  │  list/find    │→ │  listWorkflows      │→ │ ext   │  │
│  │  --archived   │  │  getLightweightList │  │ tabs  │  │
│  └───────────────┘  └────────────────────┘  └───────┘  │
│         │                    │                    │        │
│  ┌──────┴────────────────────┴────────────────────┴────┐ │
│  │              n8n REST API (archived flag)           │ │
│  └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 🗺️ Origin — Issue #309

The bug: `isArchived` was always `false` for remote-only workflows. The root cause was in `getLightweightList` — the `isArchived` field was read from `workflow?.isArchived` (the local workflow object), but for remote-only workflows there is no local file, so `workflow` is `undefined` → always `false`.

Two fixes were applied:
1. `workflow-state-tracker.ts`: compute `isArchived` from `remoteArchived.get(workflowId) ?? false` for all workflows
2. `IWorkflowStatus`: add `isArchived?: boolean` field (previously absent from the interface)

---

## 🏗️ Architecture — Layer by Layer

### Layer 1 — `n8n` REST API

The n8n `/workflows` endpoint accepts two query parameters for archive filtering:

| Parameter | Type | Effect |
|-----------|------|--------|
| `includeArchived` | boolean | Include archived workflows alongside active ones |
| `onlyArchived` | boolean | Return only archived workflows, exclude active ones |

The API returns an `isArchived` boolean on each workflow object.

---

### Layer 2 — `workflow-state-tracker.ts` (Lightweight State Cache)

This is the core state tracker. It maintains four remote-state maps populated by `refreshRemoteState()`:

```typescript
remoteIds:      Map<workflowId, filename>
remoteNames:    Map<workflowId, displayName>
remoteActive:   Map<workflowId, isActive>
remoteArchived: Map<workflowId, isArchived>  // ← NEW
```

**`getLightweightList(options?)`** — returns `IWorkflowStatus[]` for all known workflows (local + remote).

```typescript
// For each workflow, isArchived is now correctly read from remoteArchived map
// instead of relying on the local workflow object (which doesn't exist for remote-only)
const isArchived = workflowId ? (this.remoteArchived.get(workflowId) ?? false) : false;
```

**`refreshRemoteState()`** — fetches all workflows from n8n API and populates all four maps.

---

### Layer 3 — `sync-manager.ts`

```typescript
async listWorkflows(options?: {
    fetchRemote?: boolean;
    includeArchived?: boolean;
    onlyArchived?: boolean;
}): Promise<IWorkflowStatus[]>
```

Passes archive options down to `getLightweightList`. The `includeArchived`/`onlyArchived` flags are NOT forwarded to the n8n API — filtering is done locally from the already-cached remote state (no additional API call needed).

---

### Layer 4 — `cli-api.ts` (Internal Facade for VS Code Extension)

```typescript
async list(options?: {
    fetchRemote?: boolean;
    includeArchived?: boolean;
    onlyArchived?: boolean;
}): Promise<IWorkflowStatus[]>
```

Mirrors `SyncManager.listWorkflows`. This is the single contract consumed by the VS Code extension — zero code duplication between CLI binary and extension.

---

### Layer 5 — CLI Commands (`index.ts` + `list.ts`)

#### `list` command

```bash
n8nac list                        # non-archived only (default)
n8nac list --include-archived    # all workflows
n8nac list --only-archived        # archived only
n8nac list --local               # + scope filter
n8nac list --remote              # + scope filter
n8nac list --search <query>      # + search filter
```

#### `find` command

```bash
n8nac find <query>                # non-archived only (default)
n8nac find <query> --include-archived
n8nac find <query> --only-archived
```

**Default**: only non-archived. Both commands share the same `ListCommandOptions` interface and the same underlying logic.

**SSOT for documentation**: `packages/cli/src/index.ts` command descriptions. `docs/docs/usage/cli.md` and `packages/skills/src/services/ai-context-generator.ts` (AGENTS.md) must be kept in sync manually.

---

### Layer 6 — TypeScript Transformer (`ast-to-typescript.ts`)

When generating a `.workflow.ts` file from n8n (pull or push), the transformer now emits archive metadata:

```typescript
@workflow({
    name: 'My Workflow',
    active: false,
    isArchived: true,          // ← NEW
    projectId: 'xxx',
    projectName: 'Personal',
    homeProject: { ... }
})
export class MyWorkflow { ... }
```

This ensures the local file reflects the archived state and can be restored/pushed correctly.

---

## 🌳 VS Code Extension — Archive Filter Tabs

### Commands registered in `extension.ts`

| Command | Action |
|---------|--------|
| `n8n.showActive` | `setArchiveFilter('workflows')` → `loadWorkflows()` → tree title = "Workflows" |
| `n8n.showArchived` | `setArchiveFilter('archived')` → `loadWorkflows()` → tree title = "Archived Workflows" |
| `n8n.showAll` | `setArchiveFilter('all')` → `loadWorkflows()` → tree title = "All Workflows" |

### Redux state

```typescript
// sync slice
archiveFilter: 'workflows' | 'archived' | 'all'  // default: 'workflows'
```

```typescript
// Filter → API options mapping
'workflows'  → {}                    (default, only active)
'archived'  → { onlyArchived: true }
'all'       → { includeArchived: true }
```

### `loadWorkflows` thunk

```typescript
dispatch(loadWorkflows())
  → syncManagerRef.listWorkflows({ includeArchived?, onlyArchived? })
  → dispatch(setWorkflows(workflows[]))
  → enhancedTreeProvider.refresh()
```

### Find Workflow (`n8n.findWorkflow`) — Global Search

```typescript
// Step 1: Load ALL workflows (unscoped from tab filter)
// Direct CLI call bypasses tab-scoped store
cli.list({ fetchRemote: true, includeArchived: true })

// Step 2: Show QuickPick with all workflows
showQuickPick(buildWorkflowQuickPickItems(workflows))

// Step 3: On pick → reveal in tree + open
revealWorkflowInTree(workflow)  // auto-switches tab if archived but filtered out
openWorkflowFromFinder(workflow)
```

**Key invariant**: Search is always global. Tab state does NOT affect what's visible in the QuickPick.

### `buildWorkflowQuickPickItems` — Label Format

```typescript
const archivedIcon   = workflow.isArchived ? '$(archive) ' : '';     // conditional icon
const archivedSuffix = workflow.isArchived ? ' [archived]' : '';
label: `${archivedIcon}${workflow.name}${archivedSuffix}`
// Active:    "My Workflow"
// Archived:  "$(archive) My Workflow [archived]"
```

### Tab auto-switch on reveal

```typescript
const currentFilter = selectArchiveFilter(store.getState());
if (workflow.isArchived && currentFilter === 'workflows') {
    store.dispatch(setArchiveFilter('all'));   // Switch to "All" tab
    if (workflowsTreeView) workflowsTreeView.title = 'All Workflows';
}
treeView.reveal(item, { select: true, focus: true, expand: true });
```

This is a one-way accommodation: we do NOT restore the previous tab after reveal.

---

## 🧪 Tests

### Unit test: `workflow-state-tracker.test.ts`

Tests `getLightweightList` with archive flags:
- `includeArchived: true` → archived workflows present in results
- `onlyArchived: true` → only archived workflows in results
- `isArchived` field correctly computed for remote-only workflows

### Integration test: `list-archived.integration.test.ts`

Full end-to-end test via `CliApi.list()`:
- Fetches remote state (calls real n8n API)
- Applies archive filter options
- Verifies correct workflows returned and `isArchived` field populated

---

## 📦 Files Changed

| File | Change |
|------|--------|
| `packages/cli/src/index.ts` | `list`/`find` command options: `--include-archived`, `--only-archived`; descriptions mention default non-archived |
| `packages/cli/src/commands/list.ts` | `ListCommandOptions` interface; `applyListCommandOptions` passes archive flags to `syncManager.listWorkflows` |
| `packages/cli/src/core/services/cli-api.ts` | `list()` signature extended with archive options |
| `packages/cli/src/core/services/sync-manager.ts` | `listWorkflows()` passes archive options to `getLightweightList` |
| `packages/cli/src/core/services/workflow-state-tracker.ts` | `remoteArchived` map; `getLightweightList` computes `isArchived` from map; DRY filter logic |
| `packages/transformer/src/parser/ast-to-typescript.ts` | Emits `isArchived`, `projectId`, `projectName`, `homeProject` in `@workflow` decorator |
| `packages/vscode-extension/src/extension.ts` | `n8n.showActive/Archived/All` commands; `n8n.findWorkflow` (global search); `revealWorkflowInTree` with tab auto-switch |
| `packages/vscode-extension/src/services/workflow-store.ts` | `archiveFilter` in sync slice; `setArchiveFilter` action; `loadWorkflows` thunk |
| `packages/vscode-extension/src/utils/workflow-finder.ts` | Conditional `$(archive)` icon + `[archived]` suffix in QuickPick labels |
| `packages/cli/tests/unit/workflow-state-tracker.test.ts` | Tests for `isArchived` field + archive filter flags |
| `packages/cli/tests/integration/list-archived.integration.test.ts` | Integration test for archive list via CliApi |
| `packages/skills/src/services/ai-context-generator.ts` | AGENTS.md guidance: `list --local/--remote` + archive flags |
| `docs/docs/usage/cli.md` | `list`/`find` docs: archive flags, examples, default behaviour |
| `docs/docs/usage/vscode-extension.md` | Archive Filter Tabs section |
| `architecture/current/feature-324-archive-filter-tabs-search.md` | This document |

---

## 🔑 Key Design Decisions

### Decision 1: Archive state comes from remote cache, not from local files

`isArchived` is a remote property. For remote-only workflows (no local file), the local file has no `isArchived` to read. The fix reads from `remoteArchived.get(workflowId)` which is populated by `refreshRemoteState()` on every API fetch. This means `isArchived` is always fresh from n8n — not stale from a local file.

### Decision 2: Filter runs locally, not at the API level

The n8n API already supports `includeArchived`/`onlyArchived` query params. However, n8n-as-code already fetches all workflows during `refreshRemoteState()` (to populate the four remote maps). Re-passing these params to a second API call would be wasteful. Instead, filtering is done client-side from the cached data.

### Decision 3: Store is tab-scoped; search is global

When switching tabs, `loadWorkflows()` re-fetches with the new filter and replaces all workflow entries in the Redux store. The tree view always reflects the current tab. The "Find Workflow" command bypasses the store and calls `cli.list()` directly with `includeArchived: true` — ensuring the QuickPick always sees all workflows regardless of active tab.

### Decision 4: One-way tab auto-switch on reveal

When picking an archived workflow from QuickPick while the tree is on the "Workflows" tab, we switch the tree to "All" so the item appears. We do NOT restore the previous tab afterwards — this is an accommodation, not a synchronization mechanism. The user's intent after picking is to see the workflow in the tree.