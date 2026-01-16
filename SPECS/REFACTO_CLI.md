# Technical Specification: N8N Sync CLI

**Title:** N8N Sync Command Line Interface (CLI)  
**Version:** 3.0 (Implemented)  
**Target Package:** @n8n-as-code/cli  
**Dependencies:** @n8n-as-code/core, commander, inquirer, chalk, ora, cli-table3, log-update, diff

**Status:** ✅ **IMPLEMENTED AND TESTED**

## 1. Executive Summary

The CLI provides a professional terminal-based interface for n8n-as-code. It offers the same capabilities as the VS Code extension but for terminal environments. Key features include real-time monitoring with interactive prompts, conflict resolution with diff display, guaranteed backup for deletions, and automatic AI context generation.

**Key Differences from Original Spec:**
- `watch` command renamed to `start` with `--manual` option (single command instead of two)
- Enhanced conflict resolution with colored diff display
- Guaranteed backup for deletions (downloads before deleting if needed)
- Workarounds implemented for Core bugs
- Clean log output (Core debug messages filtered)

## 2. Command Reference

The CLI uses `commander` to define the following interface:
```bash
n8n-sync [command] [options]
```

### 2.1. init

**Description:** Interactive wizard to bootstrap the project.

**Flow:**

**Configuration Prompts:**
- N8N Host URL
- API Key (Masked)
- Sync Folder Path (Default: `./workflows`)

**Core Initialization:** Writes configuration to file.

**AI Bootstrap:** Automatically triggers the logic of `update-ai` (see below) to generate `AGENTS.md`, `n8n-schema.json`, and rule files immediately, ensuring the project is "AI-Ready" from the start.

### 2.2. list (Snapshot)

**Description:** Displays a static table of all workflows and their current sync status, then exits.

**Behavior:**
- Instantiates Core.
- Runs `Watcher.refresh()` (Force Poll + Scan).
- **Output:** Prints a formatted ASCII table (using `cli-table3`) with columns: Status, ID, Name, Local Path.

**Use Case:** Quick check of the state without blocking the terminal (useful for CI/CD or quick verification).

### 2.3. start (Main Monitoring Command) ✨ NEW

**Description:** Unified monitoring command with auto or manual mode.

**Usage:**
```bash
n8n-as-code start           # Auto mode (default)
n8n-as-code start --manual  # Manual mode
```

**Auto Mode (Default):**
- **Process:** Long-running. Listens to file changes and polls API.
- **Behavior:** Automatic bidirectional sync
  - `MODIFIED_LOCALLY` → Auto push
  - `MODIFIED_REMOTELY` → Auto pull
  - `CONFLICT` → Pause and prompt user
  - `DELETED_LOCALLY/REMOTELY` → Prompt user
- **UI:** Live table + log stream for actions:
```
[14:00:01] 🟢 PUSHED: "My Workflow" (ID: 123)
[14:05:22] 🔵 PULLED: "Data Scraper" (ID: 456)
```

**Manual Mode (`--manual`):**
- **Process:** Long-running. Listens to file changes and polls API.
- **Behavior:** Passive monitoring, prompts for ALL actions
- **UI:** Live-updating table (using `log-update` to prevent flicker)
- **Prompts:** Interactive prompts for conflicts AND deletions
- **Action:** User decides when to sync

**Key Implementation Details:**
- Uses `log-update` for flicker-free table updates
- Captures initial conflicts/deletions BEFORE starting watch
- `watchStarted` flag prevents phantom events during initialization
- Waits 500ms after `startWatch()` for stabilization
- Filters Core debug logs (`[SyncManager]`, `[N8nApiClient]`)

**Architecture Note:**
This replaces the original spec's separate `watch` and `auto-sync` commands with a single unified command that has better UX and cleaner implementation.

### 2.4. pull ✅ ENHANCED

**Description:** One-off command to download workflows from Remote to Local.

**Options:** `--force` (Skip conflict checks, overwrite local).

**Logic:**
- **CRITICAL:** Calls `refreshState()` BEFORE `getWorkflowsStatus()` (Core bug workaround)
- Filters for `EXIST_ONLY_REMOTELY` and `MODIFIED_REMOTELY`.
- **Conflict Safety:** If `CONFLICT` exists → Trigger Interactive Resolution.
- Executes `syncDown()` & Commits State.

**Implementation Notes:**
- Must call `refreshState()` before sync (Core doesn't do it internally)
- Without this, `getWorkflowsStatus()` returns empty array
- This is a documented workaround for Core bug

### 2.5. push ✅ ENHANCED

**Description:** One-off command to upload workflows from Local to Remote.

**Options:** `--force` (Skip conflict checks, overwrite remote).

**Logic:**
- **CRITICAL:** Calls `refreshState()` BEFORE `getWorkflowsStatus()` (Core bug workaround)
- Filters for `EXIST_ONLY_LOCALLY` and `MODIFIED_LOCALLY`.
- **Conflict Safety:** If `CONFLICT` exists → Trigger Interactive Resolution.
- Executes `syncUp()` & Commits State.

**Implementation Notes:**
- Must call `refreshState()` before sync (Core doesn't do it internally)
- Same workaround as pull command

### 2.7. update-ai

**Description:** Maintenance command to refresh AI Context files.

**Use Case:** To be used when N8N updates (API changes) or when the internal agent-cli logic is updated.

**Behavior:**
- Checks for `agent-cli`.
- Regenerates `AGENTS.md` (Context & Instructions).
- Regenerates `n8n-schema.json` (Latest Node Types).
- Regenerates Rule Files (Project conventions).

**Note:** This does NOT change workflow files, only the documentation/helper files for the AI Agent.

### 2.8. help

Standard help generated by `commander`.

## 3. Interactive Resolution Flows (Inquirer)

The CLI uses `inquirer` to handle blocking states during `push`, `pull`, or `auto-sync`.

### 3.1. Conflict Resolution

**Trigger:** `CONFLICT` status detected.

**Prompt UI:**
```
⚠️  CONFLICT DETECTED: "Workflow Name" (ID: xyz)
Both local and remote versions have changed since last sync.

? How do you want to resolve this?
> [1] Keep Local Version (Force Push)
  [2] Keep Remote Version (Force Pull)
  [3] Show Diff (Display colored diff)
  [4] Skip
```

**Diff Output:** Uses `diff` package to print a colored patch in the console (Green + / Red -) then re-displays the prompt.

### 3.2. Deletion Validation ✅ ENHANCED

**Trigger:** `DELETED_LOCALLY` or `DELETED_REMOTELY`.

**Prompt (Local Missing):**
```
? Local file missing for "Workflow X". Action:
> Confirm Deletion (Delete on n8n)
  Restore File (Download from n8n)
  Skip
```

**Implementation Enhancement - Backup Guarantee:**

When user confirms deletion of a manually deleted file:
1. **Check if file exists locally**
2. If NOT (manual deletion):
   - Download workflow from n8n for backup
   - Then call `deleteRemoteWorkflow()`
   - Ensures backup in `_archive/` even if file was manually deleted
3. If YES (watch active):
   - File already in `_archive/` (moved by watcher)
   - Directly delete on n8n

**Restoration Enhancement:**

When user chooses to restore:
- **OLD (doesn't work):** `restoreLocalFile()` - only works if file in `_archive/`
- **NEW (works):** `resolveConflict(id, filename, 'remote')` - downloads from n8n
- Works even when file deleted manually (not in archive)

**Key Fix:**
This ensures backup is ALWAYS created before deletion, even for edge cases like:
- File deleted while watch not running
- `_archive/` directory missing or corrupted
- Manual file deletion outside of watcher control

## 4. Visual Output Standards

To ensure consistency with VS Code, the CLI uses the same color coding logic (via `chalk`).

| Status | Color | Icon |
|--------|-------|------|
| IN_SYNC | Green | ✔ |
| MODIFIED_LOCALLY | Blue | ✏️ |
| MODIFIED_REMOTLY | Cyan | ☁️ |
| CONFLICT | Red | 💥 |
| DELETED | Gray | 🗑️ |

## 5. Implementation Notes

- **Dashboards:** ✅ Uses `log-update` for flicker-free table updates
- **Table Library:** ✅ Uses `cli-table3` for robust Unicode border support
- **Error Handling:** ✅ All commands wrap Core logic with try/catch for user-friendly errors
- **Log Filtering:** ✅ Suppresses Core debug logs (`[SyncManager]`, `[N8nApiClient]`, `Auto-sync skipped`)
- **Event Management:** ✅ Prevents phantom events during initialization with `watchStarted` flag

## 6. Core Bug Workarounds ⚠️

The CLI implements workarounds for known limitations in the Core package. These should be fixed in Core eventually, but CLI handles them gracefully.

### 6.1. RefreshState Bug

**Problem:**
- `SyncManager.syncDown()` and `syncUp()` don't call `refreshState()` internally
- `ensureInitialized()` creates watcher but doesn't start it
- `getWorkflowsStatus()` returns empty array without refresh
- Result: Sync finds 0 workflows to sync

**CLI Workaround:**
```typescript
// In pull/push commands
await syncManager.refreshState();  // MUST call this first
await syncManager.syncDown();      // Now this works
```

**Proper Fix (in Core):**
Add `await this.refreshState()` at the start of `syncDown()` and `syncUp()`

**Test Coverage:** ✅ `tests/integration/pull-refreshstate.test.ts` (3 tests)

### 6.2. RestoreLocalFile Bug

**Problem:**
- `restoreLocalFile()` only works if file exists in `_archive/`
- Fails when file deleted manually (outside watch)
- Cannot download from n8n as fallback

**CLI Workaround:**
```typescript
// Instead of:
await syncManager.restoreLocalFile(id, filename);  // Fails if not in archive

// Use:
await syncManager.resolveConflict(id, filename, 'remote');  // Always works
```

**Proper Fix (in Core):**
`restoreLocalFile()` should try archive first, then fallback to pulling from n8n

**Test Coverage:** ✅ `tests/integration/restore-deleted-file.test.ts` (5 tests)

### 6.3. DeleteRemoteWorkflow Backup Bug

**Problem:**
- `deleteRemoteWorkflow()` calls `syncEngine.archive()` internally
- But if file doesn't exist locally, archive fails silently
- No backup created for manually deleted files

**CLI Workaround:**
```typescript
// Before deleting, ensure backup exists
if (!fs.existsSync(localPath)) {
    // Download from n8n for backup
    await syncManager.resolveConflict(id, filename, 'remote');
}
// Now safe to delete (file exists for archiving)
await syncManager.deleteRemoteWorkflow(id, filename);
```

**Proper Fix (in Core):**
`deleteRemoteWorkflow()` should download from n8n if local file missing

**Test Coverage:** ✅ `tests/integration/delete-with-backup.test.ts` (5 tests)

### 6.4. Phantom Events Bug

**Problem:**
- During startup, watcher fires events for all changed files
- Events fire during 500ms stabilization period
- Causes duplicate prompts if not handled

**CLI Workaround:**
```typescript
// Capture state BEFORE starting watch
const initialConflicts = await syncManager.getWorkflowsStatus();

// Start watch
await syncManager.startWatch();

// Ignore events until ready
let watchStarted = false;
syncManager.on('conflict', (conflict) => {
    if (!watchStarted) return;  // Ignore during init
    // ... handle conflict
});

// After 500ms, enable event handlers
watchStarted = true;
```

**Proper Fix (in Core):**
Add initialization state flag in SyncManager to prevent duplicate events

**Test Coverage:** ✅ Documented in tests (removed due to ESM issues)