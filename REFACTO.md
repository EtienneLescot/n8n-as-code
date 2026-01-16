# Technical Specification: N8N Workflow Sync Architecture Refactor

**Title:** Refactoring Core State Management and Synchronization Logic  
**Date:** January 15, 2026  
**Version:** 3.0 (Final Draft)  
**Target:** Core Package, VS Code Extension

## 1. Executive Summary

The current architecture suffers from technical debt due to the tight coupling of state observation and synchronization logic. This leads to inconsistent state detection and race conditions.

This specification outlines a complete refactor of the Core package to implement a 3-way merge architecture. The goal is to strictly decouple State Observation (Watch) from State Mutation (Sync), ensuring a robust and deterministic synchronization process.

## 2. Architecture Overview

The solution is divided into three packages. This refactor focuses on the Core.

- **Package Core:** The central brain. It contains the logic for file watching, API interaction, hashing, and state management. It exposes a reactive Event Emitter.
- **Package CLI:** A wrapper for manual execution of Core functions.
- **Package VS Code:** A consumer of the Core's reactive state to drive the UI.

## 3. Data Structure: The State File

The `.n8n-state.json` file is the single source of truth for the synchronization history (the "Base"). It does not store the current state of files, but rather the state at the time of the last sync.

**Path:** `workflows_test/local_guid/.n8n-state.json`

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

**Note on Runtime State:** `localHash` and `remoteHash` are transient values calculated live by the Watcher. They are compared against `lastSyncedHash` to determine the status.

## 4. Component I: The Watcher (State Observation)

The Watcher is a background service. It never performs synchronization actions. Its responsibility is to observe reality and update the status matrix.

### 4.1. Responsibilities

- **File System Watch:** Listen for change, add, unlink events locally.
  - **Constraint:** Must implement a debounce (e.g., 500ms) to avoid reacting to partial writes or OS locks.
- **Remote Polling:** Poll the N8N API.
  - **Optimization:** Use a Lightweight List Strategy (fetch only IDs and updatedAt timestamps) to avoid "N+1" API call issues. Full content is fetched only if the timestamp differs from the known state.
- **Canonical Hashing (Critical):**
  - JSON content must be parsed, sorted (alphabetical key order), and cleaned of non-functional metadata before hashing.
  - Use SHA-256.
- **State Persistence:** The Watcher is the only component authorized to write to `.n8n-state.json`.

### 4.2. Status Logic Matrix (3-Way Comparison)

The Watcher determines the status based on three variables:
- **A:** `localHash` (Current Local)
- **B:** `remoteHash` (Current Remote)
- **C:** `lastSyncedHash` (Base)

| Status | Condition |
|--------|-----------|
| EXIST_ONLY_LOCALLY | `localHash` exists AND `!lastSyncedHash` AND `!remoteHash` |
| EXIST_ONLY_REMOTLY | `remoteHash` exists AND `!lastSyncedHash` AND `!localHash` |
| IN_SYNC | `localHash == remoteHash` |
| MODIFIED_LOCALLY | `localHash != lastSyncedHash` AND `remoteHash == lastSyncedHash` |
| MODIFIED_REMOTLY | `localHash == lastSyncedHash` AND `remoteHash != lastSyncedHash` |
| CONFLICT | `localHash != lastSyncedHash` AND `remoteHash != lastSyncedHash` |
| DELETED_LOCALLY | `!localHash` AND `remoteHash == lastSyncedHash` |
| DELETED_REMOTLY | `!remoteHash` AND `localHash == lastSyncedHash` |

## 5. Component II: The Sync Engine (State Mutation)

The Sync Engine is stateless regarding the history. It performs I/O operations (Read/Write/API).

**Crucial Rule:** The Sync Engine performs the action, awaits completion, and then requests the State Manager to commit the new state.

### 5.1. The "Commit" Workflow (finalizeSync)

After any successful PULL or PUSH action, the Sync Engine calls `finalizeSync(workflowId)`. This triggers the Watcher to:
- Read the actual file on disk / fetch the actual remote node.
- Recalculate the canonical hashes.
- Update `lastSyncedHash` with the new hash.
- Write to `.n8n-state.json`.
- Broadcast the new `IN_SYNC` status.

### 5.2. PULL Strategy (Remote -> Local)

| Current Status | Action (SyncEngine) | Post-Action (Commit) |
|----------------|---------------------|----------------------|
| EXIST_ONLY_LOCALLY | No Action. | N/A |
| EXIST_ONLY_REMOTLY | Download Remote JSON -> Write to disk. | Initialize `lastSyncedHash`. |
| IN_SYNC | No Action. | N/A |
| MODIFIED_LOCALLY | No Action (Protect local work). | N/A |
| MODIFIED_REMOTLY | Download Remote JSON -> Overwrite local file. | Update `lastSyncedHash`. |
| CONFLICT | Halt. Trigger Conflict Resolution. | N/A |
| DELETED_LOCALLY | No Action. | N/A |
| DELETED_REMOTLY | Halt. Trigger Deletion Validation. | N/A |

### 5.3. PUSH Strategy (Local -> Remote)

| Current Status | Action (SyncEngine) | Post-Action (Commit) |
|----------------|---------------------|----------------------|
| EXIST_ONLY_LOCALLY | POST to API (Create). Response includes new ID. | 1. Update local file with new ID.<br>2. Rename file if needed.<br>3. Initialize `lastSyncedHash`. |
| EXIST_ONLY_REMOTLY | No Action. | N/A |
| IN_SYNC | No Action. | N/A |
| MODIFIED_LOCALLY | PUT to API (Update). | Update `lastSyncedHash`. |
| MODIFIED_REMOTLY | No Action (Protect remote work). | N/A |
| CONFLICT | Halt. Trigger Conflict Resolution. | N/A |
| DELETED_LOCALLY | Step 1: Archive Remote to `_archive/`.<br>Step 2: Trigger Deletion Validation. | N/A |
| DELETED_REMOTLY | No Action. | N/A |

## 6. Component III: Resolution & Validation

These flows bridge the gap between user intent and the Sync Engine.

### 6.1. Conflict Resolution

User choices when status is CONFLICT:

- **KEEP LOCAL:**
  - Action: Force PUSH (Overwrite Remote with Local).
  - Commit: Update `lastSyncedHash = LocalHash`. Status becomes `IN_SYNC`.
- **KEEP REMOTE:**
  - Action: Force PULL (Overwrite Local with Remote).
  - Commit: Update `lastSyncedHash = RemoteHash`. Status becomes `IN_SYNC`.
- **SHOW DIFF:**
  - Open diff editor (VS Code API).

### 6.2. Deletion Validation

Triggered when an operation implies data loss.

- **CONFIRM DELETION:**
  - Case Deleted Locally: Send DELETE to API. -> Commit: Remove from state file.
  - Case Deleted Remotely: Move local file to `_archive/`. -> Commit: Remove from state file.
- **RESTORE WORKFLOW:**
  - Case Deleted Locally: Move file from `_archive/` to `workflows/`. -> Commit: Watcher detects file addition.
  - Case Deleted Remotely: Force PUSH (Re-create on Remote). -> Commit: Initialize `lastSyncedHash`.

## 7. Implementation Guidelines

- **JSON Canonicalization:** Use `json-stable-stringify` (or equivalent) for all hash calculations.
- **Concurrency:** Implement a queue or locking mechanism. If a Sync is in progress for Workflow A, the Watcher should pause updates for Workflow A until the Commit is complete.
- **Archive:** The `_archive` folder must be strictly ignored by the Watcher to prevent infinite loops.
- **Error Handling:** If `finalizeSync` fails (e.g., disk write error), the UI must alert the user that the synchronization state is potentially desynchronized.