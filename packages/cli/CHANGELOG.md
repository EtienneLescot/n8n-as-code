# @n8n-as-code/cli

## [0.9.7](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/cli@v0.9.6...@n8n-as-code/cli@v0.9.7) (2026-02-27)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/skills bumped from 0.16.6 to 0.16.7

## [0.9.6](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/cli@v0.9.5...@n8n-as-code/cli@v0.9.6) (2026-02-27)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/skills bumped from 0.16.5 to 0.16.6

## [0.9.5](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/cli@v0.9.4...@n8n-as-code/cli@v0.9.5) (2026-02-27)


### Features

* enhance update-ai command and AiContextGenerator to improve local shim generation and clarify installation requirements for skills CLI ([3fb7e06](https://github.com/EtienneLescot/n8n-as-code/commit/3fb7e0658f6eefb984f43cee39c71162e3c1b069))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/skills bumped from 0.16.4 to 0.16.5

## [0.9.4](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/cli@v0.9.3...@n8n-as-code/cli@v0.9.4) (2026-02-27)


### Features

* add refreshLocalState method to SyncManager and update sync commands for accurate local cache handling ([1d8437c](https://github.com/EtienneLescot/n8n-as-code/commit/1d8437ceef9ba54397a7de9bc75b6d75f2483fdf))
* enhance configuration management by implementing unified config file for CLI and VSCode alignment ([50dce35](https://github.com/EtienneLescot/n8n-as-code/commit/50dce352891f7886972aaa91c0de150a7b0287dd))
* enhance push functionality to handle new and existing workflows with filename support ([6900770](https://github.com/EtienneLescot/n8n-as-code/commit/6900770cab1d8d7709ce4ae3125f84ae6f983bb3))
* implement auto-push and conflict resolution in SyncManager; update VSCode extension for improved workflow handling ([9ff944a](https://github.com/EtienneLescot/n8n-as-code/commit/9ff944a0b949143ae16d3296217406c4651c943d))
* implement CliApi to unify CLI command handling in VSCode extension ([4eb2a50](https://github.com/EtienneLescot/n8n-as-code/commit/4eb2a502d5811260a3f94b7215038fd93fb124f5))
* implement fetch command to update remote state cache for workflows ([cc6c064](https://github.com/EtienneLescot/n8n-as-code/commit/cc6c0640a9b0beda48de7c2ee3672b206aa1ba06))
* implement force refresh method and update sync logic across commands; add Pull-on-Focus feature in VSCode extension ([f110a9b](https://github.com/EtienneLescot/n8n-as-code/commit/f110a9b9d50f74256839a42d86dcc1d5e8e8db2e))
* implement git-like sync architecture with conflict resolution for workflows ([894b0a6](https://github.com/EtienneLescot/n8n-as-code/commit/894b0a6c58f91db989d5486b5abd048b4ac3faef))
* implement Git-like sync architecture; disable auto-push and update sync logic in StartCommand and SyncManager ([3711d3e](https://github.com/EtienneLescot/n8n-as-code/commit/3711d3eea46c81d12db013a1187089f895277ace))
* implement lightweight workflow listing to optimize status retrieval ([289e9bf](https://github.com/EtienneLescot/n8n-as-code/commit/289e9bfa3b3d1866aa16b5c794ea69b416688cc2))
* optimize workflow synchronization by removing force refresh and using cached state ([40ae940](https://github.com/EtienneLescot/n8n-as-code/commit/40ae940d9c3803fe7fe8e3e02157f3d64897401a))
* refactor StartCommand and SyncCommand to streamline conflict resolution; update VSCode extension for improved user experience and action handling ([e10a6e8](https://github.com/EtienneLescot/n8n-as-code/commit/e10a6e84f5404bdf218ed8b4f4eca5e48135a67d))
* remove sync package references and integrate sync logic into cli package; update related documentation and tests ([89901ce](https://github.com/EtienneLescot/n8n-as-code/commit/89901ce03f953c0e8e162214e041a3638e980a0f))
* remove sync package references and update documentation to reflect embedded sync engine in CLI ([0369960](https://github.com/EtienneLescot/n8n-as-code/commit/03699609e241e2e69ba5887572632b197676feb8))
* Restrict local workflow file watching and discovery to `.workflow.ts` files and refresh remote state on startup. ([77137f7](https://github.com/EtienneLescot/n8n-as-code/commit/77137f71ec3afc7cdae164ceb79480d8269552c6))
* save fallback instance identifier to local config in getOrCreateInstanceIdentifier method ([bb108ef](https://github.com/EtienneLescot/n8n-as-code/commit/bb108efb288210603f77d327675a50ebd4fad1c8))
* transition to git-like sync architecture for n8n workflows ([9d1cd51](https://github.com/EtienneLescot/n8n-as-code/commit/9d1cd516eea5024ce949c050ad6d62b1655be02f))
* unify configuration management by migrating to n8nac-config.json and removing legacy files ([58a0bb4](https://github.com/EtienneLescot/n8n-as-code/commit/58a0bb4ccceb0f806736ef6eded3a11586536ded))
* update configuration management to use n8nac-config.json and enhance CLI commands for improved workflow handling ([a4afc65](https://github.com/EtienneLescot/n8n-as-code/commit/a4afc65bd86a1a782a22e19c5fe6b1650d449201))
* update README and CLI documentation to enhance git-like sync workflow with conflict resolution commands ([235f318](https://github.com/EtienneLescot/n8n-as-code/commit/235f3189bb46c323c785af25c8cce64cfda9f871))


### Bug Fixes

* improve version retrieval logic to handle different execution contexts more accurately ([4ac7090](https://github.com/EtienneLescot/n8n-as-code/commit/4ac70904a4175a30265ebcde8d7dd93edaf9c622))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/skills bumped from 0.16.3 to 0.16.4

## [0.9.3](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/cli@v0.9.2...@n8n-as-code/cli@v0.9.3) (2026-02-22)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/skills bumped from 0.16.2 to 0.16.3
    * @n8n-as-code/sync bumped from 0.14.1 to 0.14.2
    * @n8n-as-code/transformer bumped from 0.2.1 to 0.2.2

## [0.9.2](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/cli@0.9.1...@n8n-as-code/cli@v0.9.2) (2026-02-21)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/skills bumped from 0.16.1 to 0.16.2
    * @n8n-as-code/sync bumped from 0.14.0 to 0.14.1
    * @n8n-as-code/transformer bumped from 0.2.0 to 0.2.1

## 0.9.1

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.14.0
  - @n8n-as-code/skills@0.16.1

## 0.9.0

### Minor Changes

- feat: transform n8n workflows from JSON to TypeScript with decorators and bidirectional conversion

### Patch Changes

- Updated dependencies
  - @n8n-as-code/transformer@0.2.0
  - @n8n-as-code/skills@0.16.0
  - @n8n-as-code/sync@0.13.0

## 0.8.1

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.12.0
  - @n8n-as-code/skills@0.15.1

## 0.8.0

### Minor Changes

- improve VS Code extension configuration UX with automatic project loading and pre-selection

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.15.0
  - @n8n-as-code/sync@0.11.0

## 0.7.0

### Minor Changes

- Implement robust pagination for n8n API retrieval and add supporting tests and scripts.

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.14.0
  - @n8n-as-code/sync@0.10.0

## 0.6.2

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.9.0
  - @n8n-as-code/skills@0.13.2

## 0.6.1

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.8.0
  - @n8n-as-code/skills@0.13.1

## 0.6.0

### Minor Changes

- cleaning, renaming, ui

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.13.0
  - @n8n-as-code/sync@0.7.0

## 0.5.1

### Patch Changes

- Updated dependencies
  - @n8n-as-code/sync@0.6.0
  - @n8n-as-code/skills@0.12.1

## 0.5.0

### Minor Changes

- packages naming refacto

### Patch Changes

- Updated dependencies
  - @n8n-as-code/skills@0.12.0
  - @n8n-as-code/sync@0.5.0

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
