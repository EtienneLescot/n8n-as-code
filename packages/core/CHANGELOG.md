# @n8n-as-code/core

## 0.4.2

### Patch Changes

- just version bump


## 0.4.1

### Patch Changes

- fix(sync): prevent infinite sync loops by cleaning metadata before write

  - Use WorkflowSanitizer.cleanForStorage() to remove dynamic metadata before writing to local files
  - Remove forced refresh in watcher.resumeObservation() to avoid sync loops in auto-sync mode
  - Ensures local and remote states remain consistent without triggering unnecessary sync cycles

## 0.4.0

### Minor Changes

- fix(watcher): handle workflows without ID and filename inconsistencies

  - Add pause/resume observation by filename for new workflows
  - Implement ID-based workflow identification to prevent filename mismatches
  - Add comprehensive test suite for workflow identification edge cases

  The changes address critical issues where:

  1. Workflows without IDs (new workflows) couldn't be properly paused during sync
  2. Filename vs workflow.name vs workflow.id inconsistencies caused sync failures
  3. Renamed workflows in n8n UI or locally renamed files weren't properly tracked

  BREAKING CHANGE: The watcher now prioritizes workflow ID over filename for identification, which may affect workflows that relied on filename-based matching.

## 0.3.3

### Patch Changes

- Optimize agent-cli package and enable enriched index in VS Code extension

  - agent-cli: Reduced npm package size by 54% (68 MB → 31 MB) by removing src/assets/ from published files
  - vscode-extension: Now uses n8n-nodes-enriched.json with enhanced metadata (keywords, operations, use cases)

## 0.3.2

### Patch Changes

- -feat(agent-cli): AI-powered node discovery with enriched documentation

  - Add 119 missing LangChain nodes (Google Gemini, OpenAI, etc.)
  - Integrate n8n official documentation with smart scoring algorithm
  - Improve search with keywords, operations, and use cases
  - 641 nodes indexed (+23%), 911 documentation files (95% coverage)
  - Update dependencies to use enhanced agent-cli

## 0.3.1

### Patch Changes

- 08b83b5: doc update

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
