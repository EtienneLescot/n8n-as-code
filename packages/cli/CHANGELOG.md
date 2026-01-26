# @n8n-as-code/cli

## 0.4.4

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.12.0

## 0.4.3

### Patch Changes

- build process fixed
- Updated dependencies
  - @n8n-as-code/skills@0.11.2
  - @n8n-as-code/sync@0.4.3

## 0.4.2

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.11.1

## 0.4.1

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.11.0

## 0.4.0

### Minor Changes

- feat(skills): add type field to node schema and improve schema handling

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.10.0

## 0.3.12

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.9.0

## 0.3.11

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.8.0

## 0.3.10

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.7.0

## 0.3.9

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.6.0

## 0.3.8

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.5.2

## 0.3.7

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.5.1

## 0.3.6

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.5.0
  - @n8n-as-code/sync@0.4.2

## 0.3.5

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.4.1

## 0.3.4

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.4.0
  - @n8n-as-code/skills@0.4.1

## 0.3.3

### Patch Changes

- Optimize skills package and enable enriched index in VS Code extension

  - skills: Reduced npm package size by 54% (68 MB → 31 MB) by removing src/assets/ from published files
  - vscode-extension: Now uses n8n-nodes-enriched.json with enhanced metadata (keywords, operations, use cases)

- Updated dependencies
  - @n8n-as-code/skills@0.4.0
  - @n8n-as-code/sync@0.3.3

## 0.3.2

### Patch Changes

- -feat(skills): AI-powered node discovery with enriched documentation

  - Add 119 missing LangChain nodes (Google Gemini, OpenAI, etc.)
  - Integrate n8n official documentation with smart scoring algorithm
  - Improve search with keywords, operations, and use cases
  - 641 nodes indexed (+23%), 911 documentation files (95% coverage)
  - Update dependencies to use enhanced skills

- Updated dependencies
  - @n8n-as-code/skills@0.3.0
  - @n8n-as-code/sync@0.3.2

## 0.3.1

### Patch Changes

- 08b83b5: doc update
- Updated dependencies [08b83b5]
  - @n8n-as-code/skills@0.2.1
  - @n8n-as-code/sync@0.3.1

## 0.3.0

### Minor Changes

- refactor: implement 3-way merge architecture & enhanced sync system

  Sync:

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
  - @n8n-as-code/sync@0.3.0

## 0.2.0

### Minor Changes

- Release 0.2.0 with unified versioning.

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.2.0
  - @n8n-as-code/sync@0.2.0
