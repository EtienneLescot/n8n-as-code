# @n8n-as-code/skills

## [0.16.7](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/skills@v0.16.6...@n8n-as-code/skills@v0.16.7) (2026-02-27)


### Features

* add usage tip for local shims in documentation ([d810bd9](https://github.com/EtienneLescot/n8n-as-code/commit/d810bd9df8522f163ced5f9bf3a15df5dae840b0))

## [0.16.6](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/skills@v0.16.5...@n8n-as-code/skills@v0.16.6) (2026-02-27)


### Features

* enhance shim generation test to include extension path simulation for VS Code ([22238f1](https://github.com/EtienneLescot/n8n-as-code/commit/22238f17b62afcac6dadce7ec83f499dddc2feee))

## [0.16.5](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/skills@v0.16.4...@n8n-as-code/skills@v0.16.5) (2026-02-27)


### Features

* enhance update-ai command and AiContextGenerator to improve local shim generation and clarify installation requirements for skills CLI ([3fb7e06](https://github.com/EtienneLescot/n8n-as-code/commit/3fb7e0658f6eefb984f43cee39c71162e3c1b069))

## [0.16.4](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/skills@v0.16.3...@n8n-as-code/skills@v0.16.4) (2026-02-27)


### Features

* implement force refresh method and update sync logic across commands; add Pull-on-Focus feature in VSCode extension ([f110a9b](https://github.com/EtienneLescot/n8n-as-code/commit/f110a9b9d50f74256839a42d86dcc1d5e8e8db2e))
* transition to git-like sync architecture for n8n workflows ([9d1cd51](https://github.com/EtienneLescot/n8n-as-code/commit/9d1cd516eea5024ce949c050ad6d62b1655be02f))
* update build script to generate SKILL.md dynamically and remove template file; enhance AiContextGenerator for workflow context ([2cfec72](https://github.com/EtienneLescot/n8n-as-code/commit/2cfec72dac9e09bca362a6fb8fd84ec6adcb600e))
* update generate:nodes script for comprehensive documentation generation and enhance test report parsing for Jest compatibility ([feefb85](https://github.com/EtienneLescot/n8n-as-code/commit/feefb8566a98750bb6ce4f50b009e61207ddc065))
* update README and CLI documentation to enhance git-like sync workflow with conflict resolution commands ([235f318](https://github.com/EtienneLescot/n8n-as-code/commit/235f3189bb46c323c785af25c8cce64cfda9f871))

## [0.16.3](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/skills@v0.16.2...@n8n-as-code/skills@v0.16.3) (2026-02-22)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/sync bumped from 0.14.1 to 0.14.2
    * @n8n-as-code/transformer bumped from 0.2.1 to 0.2.2

## [0.16.2](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/skills@0.16.1...@n8n-as-code/skills@v0.16.2) (2026-02-21)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/sync bumped from 0.14.0 to 0.14.1
    * @n8n-as-code/transformer bumped from 0.2.0 to 0.2.1

## 0.16.1

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.14.0

## 0.16.0

### Minor Changes

- feat: transform n8n workflows from JSON to TypeScript with decorators and bidirectional conversion

### Patch Changes

- Updated dependencies
  - @n8n-as-code/transformer@0.2.0
  - @n8n-as-code/sync@0.13.0

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
