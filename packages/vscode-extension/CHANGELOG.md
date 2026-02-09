# n8n-as-code

## 0.9.0

### Minor Changes

- Implement robust pagination for n8n API retrieval and add supporting tests and scripts.

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.14.0
  - @n8n-as-code/sync@0.10.0

## 0.8.0

### Minor Changes

- switch to chokidar to fix windows compatibility

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.9.0
  - @n8n-as-code/skills@0.13.2

## 0.7.1

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.8.0
  - @n8n-as-code/skills@0.13.1

## 0.7.0

### Minor Changes

- cleaning, renaming, ui

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.13.0
  - @n8n-as-code/sync@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.6.0
  - @n8n-as-code/skills@0.12.1

## 0.6.0

### Minor Changes

- packages naming refacto

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.12.0
  - @n8n-as-code/sync@0.5.0

## 0.5.4

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.12.0

## 0.5.3

### Patch Changes

- build process fixed
- Updated dependencies
  - @n8n-as-code/skills@0.11.2
  - @n8n-as-code/sync@0.4.3

## 0.5.2

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.11.1

## 0.5.1

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.11.0

## 0.5.0

### Minor Changes

- feat(skills): add type field to node schema and improve schema handling

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.10.0

## 0.4.9

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.9.0

## 0.4.8

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.8.0

## 0.4.7

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.7.0

## 0.4.6

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.6.0

## 0.4.5

### Patch Changes

- Fix VSCode Extension path
- Updated dependencies
  - @n8n-as-code/skills@0.5.2

## 0.4.4

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.5.1

## 0.4.3

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.5.0
  - @n8n-as-code/sync@0.4.2

## 0.4.2

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.4.1

## 0.4.1

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.4.0
  - @n8n-as-code/skills@0.4.1

## 0.4.0

### Minor Changes

- Optimize skills package and enable enriched index in VS Code extension

  - skills: Reduced npm package size by 54% (68 MB → 31 MB) by removing src/assets/ from published files
  - vscode-extension: Now uses n8n-nodes-enriched.json with enhanced metadata (keywords, operations, use cases)
  - vscode-extension: Added esbuild plugin to automatically copy assets from skills during build
  - Extension size increases to 5.2 MB due to enriched data, providing better search, autocompletion, and documentation for 400+ n8n nodes

### Patch Changes

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
  - @n8n-as-code/skills@0.2.0
  - @n8n-as-code/sync@0.2.0
