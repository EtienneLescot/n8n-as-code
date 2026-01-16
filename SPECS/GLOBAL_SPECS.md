# N8N as Code: Unified Master Technical Specification

**Title:** N8N as Code – Suite Architecture & Implementation Bible  
**Version:** 1.0.0 (Master)  
**Date:** January 15, 2026  
**Scope:** Core Logic, CLI, VS Code Extension, AI Agent Assistant  
**References:** REFACTO_CORE.md, REFACTO_CLI.md, REFACTO_VSCODE_EXTENSION.md

## 1. Global Architecture

The "N8N as Code" suite professionalizes N8N workflow development by decoupling State Observation from State Mutation. It consists of four distinct packages:

- **n8n-sync-core:** The logic engine implementing a 3-way merge algorithm (Local vs. Remote vs. Base).
- **agent-cli:** A knowledge generator parsing N8N source code to assist AI agents.
- **n8n-sync-cli:** A terminal interface for headless sync and CI/CD.
- **n8n-vscode-extension:** A native GUI for real-time monitoring and resolution.

## 2. PART I: THE CORE (n8n-sync-core)

The Core is the central brain. It enforces the Single Source of Truth.

### 2.1. Data Structure (.n8n-state.json)

This file represents the "Base" state (history). It does not store current content but the state at the time of the last sync.

**Location:** `workflows_folder/.n8n-state.json`

**Schema:**
```json
{
  "workflows": {
    "workflowID_xyz": {
      "lastSyncedHash": "sha256_hash_of_canonical_content",
      "lastSyncedAt": "2026-01-15T10:00:00.000Z"
    }
  }
}
```

**Runtime Note:** `localHash` and `remoteHash` are transient values calculated live by the Watcher.

### 2.2. Service: The Watcher (Observer)

The Watcher observes reality. It never performs synchronization actions.

**File System Watch:**
- Listens for change, add, unlink events.
- **Constraint:** Must implement a debounce (e.g., 500ms) to avoid partial writes.

**Remote Polling (Optimized):**
- Uses a Lightweight List Strategy (fetch IDs and `updatedAt` only) to avoid "N+1" API call issues.
- Full content is fetched only if the timestamp differs from the known state.

**Canonical Hashing (Critical):**
- JSON content must be parsed, sorted (alphabetical key order), and cleaned of non-functional metadata before hashing.
- **Algorithm:** SHA-256.

**Persistence:** The Watcher is the only component authorized to write to `.n8n-state.json`.

### 2.3. Status Logic Matrix (3-Way Merge)

Status is derived by comparing A (Local), B (Remote), and C (Base).

| Status | Logic Condition |
|--------|-----------------|
| EXIST_ONLY_LOCALLY | `localHash` exists AND `!lastSyncedHash` AND `!remoteHash` |
| EXIST_ONLY_REMOTLY | `remoteHash` exists AND `!lastSyncedHash` AND `!localHash` |
| IN_SYNC | `localHash == remoteHash` |
| MODIFIED_LOCALLY | `localHash != lastSyncedHash` AND `remoteHash == lastSyncedHash` |
| MODIFIED_REMOTLY | `localHash == lastSyncedHash` AND `remoteHash != lastSyncedHash` |
| CONFLICT | `localHash != lastSyncedHash` AND `remoteHash != lastSyncedHash` |
| DELETED_LOCALLY | `!localHash` AND `remoteHash == lastSyncedHash` |
| DELETED_REMOTLY | `!remoteHash` AND `localHash == lastSyncedHash` |

### 2.4. Service: The Sync Engine (Mutator)

The Sync Engine performs I/O operations (Read/Write/API).

**The Commit Flow (finalizeSync):**

After any successful action, the Sync Engine calls `finalizeSync(workflowId)`. This triggers the Watcher to:
- Read the actual file/node.
- Recalculate canonical hashes.
- Update `lastSyncedHash`.
- Write to `.n8n-state.json`.

**PULL Strategy:**
- `EXIST_ONLY_REMOTLY`: Download -> Write to disk -> Initialize `lastSyncedHash`.
- `MODIFIED_REMOTLY`: Download -> Overwrite local -> Update `lastSyncedHash`.
- `CONFLICT` / `DELETED_REMOTLY`: Halt. Trigger Resolution/Validation.

**PUSH Strategy:**
- `EXIST_ONLY_LOCALLY`: POST to API -> Update local file with new ID -> Rename file -> Initialize `lastSyncedHash`.
- `MODIFIED_LOCALLY`: PUT to API -> Update `lastSyncedHash`.
- `DELETED_LOCALLY`: Archive Remote -> Trigger Deletion Validation.

**Safety (Archive):**

The `_archive` folder must be strictly ignored by the Watcher. Destructive actions copy files here first.

## 3. PART II: THE AGENT CLI (agent-cli)

**Note:** This component provides the intelligence for AI agents.

### 3.1. Build Process

- **Clone & Build:** Clones the N8N repository and compiles it to resolve types.
- **Parse:** Iterates over all N8N Nodes to extract schemas.
- **Generate:** Creates `packages/agent-cli/dist/assets/n8n-nodes-index.json`.

### 3.2. Runtime Tools

- `npx @n8n-as-code/agent-cli search "<term>"`: Fuzzy search for node names.
- `npx @n8n-as-code/agent-cli get "<nodeName>"`: Returns exact property definitions.
- `npx @n8n-as-code/agent-cli list`: Lists all nodes.

## 4. PART III: THE CLI (n8n-sync-cli)

A terminal-based interface using `commander`, `inquirer`, `chalk`, `ora`, and `cli-table3`.

### 4.1. Commands

**init**

- **Prompts:** N8N Host URL, API Key (Masked), Sync Folder Path.
- **AI Bootstrap:** Automatically triggers `update-ai` logic to generate `AGENTS.md`, `n8n-schema.json`, and rule files immediately.

**list (Snapshot)**

- **Action:** Instantiates Core, runs `Watcher.refresh()`, prints table, exits.
- **Output:** ASCII Table with columns: Status, ID, Name, Local Path.

**watch (Dashboard)**

- **Mode:** Passive (Observation only).
- **Behavior:** Clears terminal on state change, re-renders the Status Table.
- **Implementation:** Use `log-update` or `ink` to avoid flickering.

**auto-sync (Bi-Directional)**

- **Mode:** Active.
- **Logic:** `MODIFIED_LOCALLY` -> Push; `MODIFIED_REMOTLY` -> Pull.
- **Conflict:** Pauses sync and triggers Interactive Prompt.
- **UI:** Log Stream (`[Time] 🟢 PUSHED: "Workflow"`).

**update-ai**

- **Action:** Regenerates `AGENTS.md` and `n8n-schema.json` without changing workflow files.

### 4.2. Interactive Flows (Inquirer)

**Conflict Resolution:**

- **Prompt:** "How do you want to resolve this?"
- **Choices:**
  - [1] Keep Local Version (Force Push)
  - [2] Keep Remote Version (Force Pull)
  - [3] Show Diff (Uses `diff` package to print Green+/Red- patch)
  - [4] Skip

**Deletion Validation:**

- **Local Missing:** [1] Confirm Deletion, [2] Restore File, [3] Skip.
- **Remote Missing:** [1] Archive Local File, [2] Restore to Remote, [3] Skip.

### 4.3. Visual Standards (Chalk)

| Status | Color | Icon |
|--------|-------|------|
| IN_SYNC | Green | ✔ |
| MODIFIED_LOCALLY | Blue | ✏️ |
| MODIFIED_REMOTLY | Cyan | ☁️ |
| CONFLICT | Red | 💥 |
| DELETED | Gray | 🗑️ |

## 5. PART IV: THE VS CODE EXTENSION (n8n-vscode-extension)

The GUI relies on `@reduxjs/toolkit` and adheres to Native VS Code look & feel.

### 5.1. Configuration & Lifecycle

- **Settings:** `n8n.apiKey`, `n8n.host`, `n8n.syncFolder`, `n8n.syncMode`.
- **Hot-Swap:** On settings change -> Stop Core -> Clear UI -> Show "Reload/Apply" button.

### 5.2. The Workflow List (UI Specification)

**1. Status Visuals (TreeItem)**

| Status | Icon (Codicon) | Color | Decoration (Text) |
|--------|----------------|-------|-------------------|
| IN_SYNC | pass (Check) | Green | - |
| MODIFIED_LOCALLY | edit | Blue | - |
| MODIFIED_REMOTLY | cloud | Blue | - |
| CONFLICT | alert | Red | Red Text Color |
| DELETED | trash | Grey | Grey Strikethrough |

**2. Contextual Inline Actions (Hover Buttons)**

| Icon | Tooltip | Visibility Condition |
|------|---------|---------------------|
| `split-horizontal` | Open Workspace | If File Exists. |
| `cloud-upload` | Push | MODIFIED_LOCALLY, EXIST_ONLY_LOCALLY. |
| `cloud-download` | Pull | MODIFIED_REMOTLY, EXIST_ONLY_REMOTLY. |
| `trash` | Delete | If File Exists & Not Deleted. |
| `git-compare` | Diff | Only if CONFLICT or MODIFIED_REMOTLY. |

**3. Interaction:**

- **Double-Click:** Default opens Local JSON. If CONFLICT, opens Diff View.

### 5.3. Persistent Resolution (Child Item Pattern)

Blocking states are handled via expandable Tree Items, not transient dialogs.

**Conflict Resolution (CONFLICT):**

Expand the item to see children:
- **[📄 Show Diff]** (Icon: `git-compare`) -> Opens Diff Editor.
- **[✅ Keep Local Version]** (Icon: `arrow-right`) -> Trigger Force Push.
- **[☁️ Keep Remote Version]** (Icon: `arrow-left`) -> Trigger Force Pull.

**Deletion Validation (DELETED_LOCALLY):**

Expand the item to see children:
- **[🗑️ Confirm Remote Deletion]** (Icon: `trash`).
- **[↩️ Restore Local File]** (Icon: `reply`).

### 5.4. Notifications Strategy

- **Error:** Persistent Red Toast (e.g., API Connectivity Loss).
- **Conflict:** Info Toast ("Conflict detected in 'MyWorkflow'"), but only if user is not focused on the tree view.
- **Auto-Sync Success:** Silent. Do not disturb the user.

### 5.5. Implementation Notes

- **Redux Slice:** `WorkflowState` includes `id`, `status`, `localPath`, `hasError`.
- **TreeDataProvider:** Must implement `getChildren` to return resolution options when an element status is `CONFLICT`.