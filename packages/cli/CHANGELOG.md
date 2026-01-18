# @n8n-as-code/cli

## 0.3.5

### Patch Changes

- Updated dependencies
  - @n8n-as-code/core@0.4.1

## 0.3.4

### Patch Changes

- Updated dependencies
  - @n8n-as-code/core@0.4.0
  - @n8n-as-code/agent-cli@0.4.1

## 0.3.3

### Patch Changes

- Optimize agent-cli package and enable enriched index in VS Code extension

  - agent-cli: Reduced npm package size by 54% (68 MB → 31 MB) by removing src/assets/ from published files
  - vscode-extension: Now uses n8n-nodes-enriched.json with enhanced metadata (keywords, operations, use cases)

- Updated dependencies
  - @n8n-as-code/agent-cli@0.4.0
  - @n8n-as-code/core@0.3.3

## 0.3.2

### Patch Changes

- -feat(agent-cli): AI-powered node discovery with enriched documentation

  - Add 119 missing LangChain nodes (Google Gemini, OpenAI, etc.)
  - Integrate n8n official documentation with smart scoring algorithm
  - Improve search with keywords, operations, and use cases
  - 641 nodes indexed (+23%), 911 documentation files (95% coverage)
  - Update dependencies to use enhanced agent-cli

- Updated dependencies
  - @n8n-as-code/agent-cli@0.3.0
  - @n8n-as-code/core@0.3.2

## 0.3.1

### Patch Changes

- 08b83b5: doc update
- Updated dependencies [08b83b5]
  - @n8n-as-code/agent-cli@0.2.1
  - @n8n-as-code/core@0.3.1

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

### Patch Changes

- Updated dependencies
  - @n8n-as-code/core@0.3.0

## 0.2.0

### Minor Changes

- Release 0.2.0 with unified versioning.

### Patch Changes

- Updated dependencies
  - @n8n-as-code/agent-cli@0.2.0
  - @n8n-as-code/core@0.2.0
