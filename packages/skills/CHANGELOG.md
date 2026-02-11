# @n8n-as-code/skills

## 0.15.1

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.12.0

## 0.15.0

### Minor Changes

- improve VS Code extension configuration UX with automatic project loading and pre-selection

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.11.0

## 0.14.0

### Minor Changes

- Implement robust pagination for n8n API retrieval and add supporting tests and scripts.

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.10.0

## 0.13.2

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.9.0

## 0.13.1

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.8.0

## 0.13.0

### Minor Changes

- cleaning, renaming, ui

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.7.0

## 0.12.1

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.6.0

## 0.12.0

### Minor Changes

- packages naming refacto

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.5.0

## 0.12.0

### Minor Changes

- fix validator to accept community nodes

## 0.11.2

### Patch Changes

- build process fixed
- Updated dependencies
  - @n8n-as-code/sync@0.4.3

## 0.11.1

### Patch Changes

- fix tests

## 0.11.0

### Minor Changes

- significant expansion of the skills capabilities, focusing on providing the AI agent with more resources (Community Workflows) and refining the existing CLI interface for better clarity.

## 0.10.0

### Minor Changes

- feat(skills): add type field to node schema and improve schema handling

## 0.9.0

### Minor Changes

- feat(skills): enhance node schema lookup with fuzzy search and improve workflow validation

## 0.8.0

### Minor Changes

- fix(skills): update asset path resolution to use local assets directory

## 0.7.0

### Minor Changes

- fix(skills): improve asset path resolution with fallback logic

## 0.6.0

### Minor Changes

- refactor(skills): improve shim generation with robust path resolution

## 0.5.2

### Patch Changes

- Fix VSCode Extension path

## 0.5.1

### Patch Changes

- Search intelligence integration with test coverage and documentation updates

## 0.5.0

### Minor Changes

- Refonte majeure de l'skills :

  ✅ Recherche unifiée avec FlexSearch (500+ nœuds, 1200+ docs)
  ✅ Nouvelles commandes : list, examples, related, validate, update-ai
  ✅ Documentation enrichie avec système de recherche profonde
  ✅ Validation des workflows et génération de contexte AI améliorée
  ✅ Build optimisé avec scripts d'indexation complets
  Impact : Les AI agents ont maintenant une recherche plus intuitive, des schémas exacts pour éviter les hallucinations, et des workflows validés automatiquement.

## 0.4.1

### Patch Changes

- Version bump only

## 0.4.0

### Minor Changes

- Optimize skills package and enable enriched index in VS Code extension

  - skills: Reduced npm package size by 54% (68 MB → 31 MB) by removing src/assets/ from published files
  - vscode-extension: Now uses n8n-nodes-enriched.json with enhanced metadata (keywords, operations, use cases)

## 0.3.0

### Minor Changes

- -feat(skills): AI-powered node discovery with enriched documentation

  - Add 119 missing LangChain nodes (Google Gemini, OpenAI, etc.)
  - Integrate n8n official documentation with smart scoring algorithm
  - Improve search with keywords, operations, and use cases
  - 641 nodes indexed (+23%), 911 documentation files (95% coverage)
  - Update dependencies to use enhanced skills

## 0.2.1

### Patch Changes

- 08b83b5: doc update

## 0.2.0

### Minor Changes

- Release 0.2.0 with unified versioning.
