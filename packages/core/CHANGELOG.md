# @n8n-as-code/core

## 0.3.0

### Minor Changes

- refactor: implement 3-way merge architecture & enhanced sync system

  Core:

  - Decoupled state observation (Watcher) from mutation (Sync Engine).
  - Implemented deterministic 3-way merge logic using SHA-256 hashing.
  - Updated state management to track 'base' sync state.

  CLI:

  - Replaced 'watch' with 'start' command featuring interactive conflict resolution.
  - Added 'list' command for real-time status overview.
  - Unified 'sync' command with automated backup creation.
  - Introduced instance-based configuration (n8n-as-code-instance.json).

## 0.2.0

### Minor Changes

- Release 0.2.0 with unified versioning.
