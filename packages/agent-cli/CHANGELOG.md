# @n8n-as-code/agent-cli

## 0.11.2

### Patch Changes

- build process fixed
- Updated dependencies
  - @n8n-as-code/core@0.4.3

## 0.11.1

### Patch Changes

- fix tests

## 0.11.0

### Minor Changes

- significant expansion of the agent-cli capabilities, focusing on providing the AI agent with more resources (Community Workflows) and refining the existing CLI interface for better clarity.

## 0.10.0

### Minor Changes

- feat(agent-cli): add type field to node schema and improve schema handling

## 0.9.0

### Minor Changes

- feat(agent-cli): enhance node schema lookup with fuzzy search and improve workflow validation

## 0.8.0

### Minor Changes

- fix(agent-cli): update asset path resolution to use local assets directory

## 0.7.0

### Minor Changes

- fix(agent-cli): improve asset path resolution with fallback logic

## 0.6.0

### Minor Changes

- refactor(agent-cli): improve shim generation with robust path resolution

## 0.5.2

### Patch Changes

- Fix VSCode Extension path

## 0.5.1

### Patch Changes

- Search intelligence integration with test coverage and documentation updates

## 0.5.0

### Minor Changes

- Refonte majeure de l'agent-cli :

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

- Optimize agent-cli package and enable enriched index in VS Code extension

  - agent-cli: Reduced npm package size by 54% (68 MB → 31 MB) by removing src/assets/ from published files
  - vscode-extension: Now uses n8n-nodes-enriched.json with enhanced metadata (keywords, operations, use cases)

## 0.3.0

### Minor Changes

- -feat(agent-cli): AI-powered node discovery with enriched documentation

  - Add 119 missing LangChain nodes (Google Gemini, OpenAI, etc.)
  - Integrate n8n official documentation with smart scoring algorithm
  - Improve search with keywords, operations, and use cases
  - 641 nodes indexed (+23%), 911 documentation files (95% coverage)
  - Update dependencies to use enhanced agent-cli

## 0.2.1

### Patch Changes

- 08b83b5: doc update

## 0.2.0

### Minor Changes

- Release 0.2.0 with unified versioning.
