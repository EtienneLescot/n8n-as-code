# n8n-as-code

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

- refactor(vscode): complete UI overhaul and state-driven tree view

  - Implemented visual status indicators (icons/colors) in the workflow tree.
  - Added persistent conflict resolution actions directly in the tree items.
  - Introduced Redux-style state management for fluid UI updates.
  - Redesigned initialization flow to be non-intrusive.
  - Added Vitest suite for UI state and event handling.

## 0.2.0

### Minor Changes

- Release 0.2.0 with unified versioning.

### Patch Changes

- Updated dependencies
  - @n8n-as-code/agent-cli@0.2.0
  - @n8n-as-code/core@0.2.0
