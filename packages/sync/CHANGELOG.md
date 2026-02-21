# @n8n-as-code/sync

## [0.14.1](https://github.com/EtienneLescot/n8n-as-code/compare/sync-v0.14.0...sync-v0.14.1) (2026-02-21)


### Features

* enhance sync and watcher services with AI dependency handling and logging ([3a5d724](https://github.com/EtienneLescot/n8n-as-code/commit/3a5d724a97d84f1d6a4b509b656aff90af162b44))
* enhance VS Code extension resolution logic for better remote environment support ([f65f8aa](https://github.com/EtienneLescot/n8n-as-code/commit/f65f8aa3689a6e31b7519629c141ccd7ea9d9cb0))
* enhance workflow handling with AI dependency extraction and filename-based key support ([615c37b](https://github.com/EtienneLescot/n8n-as-code/commit/615c37b98a4d4f064d2d944ada99369cc4680024))
* enhance workflow hashing and integration tests to preserve workflow IDs during transformations ([b227927](https://github.com/EtienneLescot/n8n-as-code/commit/b227927744e4ef5846095e30f7d8a0d068b43495))
* enhance workflow validation and transformation with TypeScript support ([dbf7dda](https://github.com/EtienneLescot/n8n-as-code/commit/dbf7dda81d00e5e4d349f11fb4aa7509049b6c65))
* enhance WorkflowSanitizer to preserve executionOrder and add test utilities for cleanup ([c5e6418](https://github.com/EtienneLescot/n8n-as-code/commit/c5e641897497d674d9ed01962c1f8d8f69841d3e))
* expand AI connection types and add workspace TypeScript stubs ([4b9cc90](https://github.com/EtienneLescot/n8n-as-code/commit/4b9cc90f010a6c70ccb99411d07d4bf9c5b6dc5f))
* implement cursor pagination for workflows and add integration tests ([d140208](https://github.com/EtienneLescot/n8n-as-code/commit/d140208e83378eb84c1c7fb61ad98aab6781ea45))
* improve VS Code extension configuration UX with automatic project loading and pre-selection ([91fcee5](https://github.com/EtienneLescot/n8n-as-code/commit/91fcee5d5eb3abfc57b66386c1b846ce4703ac01))
* integrate TypeScript transformer into sync package, replacing JSON with .workflow.ts files ([390aa35](https://github.com/EtienneLescot/n8n-as-code/commit/390aa35874d8eb212f6aa29c6b511aebe344378b))
* update documentation to reflect breaking changes for TypeScript workflow format across all packages ([48062d1](https://github.com/EtienneLescot/n8n-as-code/commit/48062d1c2f38e2d018e5e8da3fcec46a38f6d441))
* update package versions and changelogs for n8n-as-code ecosystem ([986996b](https://github.com/EtienneLescot/n8n-as-code/commit/986996b38dbaec5cc525d6d0aafbbd00f52959a6))
* update robust sync tests to handle TypeScript workflow files and improve workflow identification logic ([0bd2577](https://github.com/EtienneLescot/n8n-as-code/commit/0bd2577570b397c5f1fb85bff5518b6a8919f0ab))
* update tests and documentation for TypeScript workflow support ([37ecfc4](https://github.com/EtienneLescot/n8n-as-code/commit/37ecfc4dbb8ec61656f1bd6f2ba95c242a89296f))
* update TypeScript configuration files to include transformer references and ensure composite builds ([53a2451](https://github.com/EtienneLescot/n8n-as-code/commit/53a2451ebd75fb0e1b40e2dd3a53a3c575ba696a))
* update version numbers and changelogs for dependencies across packages ([10dd3b3](https://github.com/EtienneLescot/n8n-as-code/commit/10dd3b325f6ecbf1ee8fb5c20e77f472c619e74e))
* update version numbers and changelogs for pagination implementation across packages ([f4b3b29](https://github.com/EtienneLescot/n8n-as-code/commit/f4b3b29f64520657673f373aef6396e7c579c950))


### Bug Fixes

* add error handling for invalid TypeScript identifiers to prevent data loss during workflow sync ([36a39da](https://github.com/EtienneLescot/n8n-as-code/commit/36a39daedf6e438517254ca7f31e9614cd10f59d))
* **sync:** handle workflow ID mismatch to prevent sync loops ([a3941ae](https://github.com/EtienneLescot/n8n-as-code/commit/a3941ae042894165520908945f870f12480ed35d))
* update package versions and changelogs for [@n8n-as-code](https://github.com/n8n-as-code) ecosystem ([02d7fbd](https://github.com/EtienneLescot/n8n-as-code/commit/02d7fbd8fd0f214c3f73726c5d4e14b49ee0a152))
* update package versions and changelogs for @n8n-as-code/cli, @n8n-as-code/skills, and @n8n-as-code/sync ([e8b7b7e](https://github.com/EtienneLescot/n8n-as-code/commit/e8b7b7e38fd2908c51d5ecf023d4376e34f286eb))
* **vscode-extension:** unify deletion confirmation terminology and enhance filename mapping stability ([528604f](https://github.com/EtienneLescot/n8n-as-code/commit/528604ffc8b8183312eb082d0f96fa3374899853))
* **watcher:** enhance file filtering to exclude hidden and archive files ([d32901f](https://github.com/EtienneLescot/n8n-as-code/commit/d32901f6bcbb43d038243dea3e819c9fe9b15b6a))
* **watcher:** remove ID mismatch handling to simplify state management ([4b93bdd](https://github.com/EtienneLescot/n8n-as-code/commit/4b93bdd957885b25d904e17b2144af8941814e65))
* **watcher:** replace chokidar with @parcel/watcher for improved file observation and rename detection ([b8d9472](https://github.com/EtienneLescot/n8n-as-code/commit/b8d9472ea3be1c1333126b565e411908325b9291))
* **watcher:** resolve duplicate workflow IDs and update mappings ([7dceb24](https://github.com/EtienneLescot/n8n-as-code/commit/7dceb2407ee53cdba1006a75ff93aa16b8e47e56))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/transformer bumped from 0.2.0 to 0.2.1

## 0.14.0

### Minor Changes

- fix: improve activation flow by registering commands before async initialization to prevent delays

## 0.13.0

### Minor Changes

- feat: transform n8n workflows from JSON to TypeScript with decorators and bidirectional conversion

### Patch Changes

- Updated dependencies
  - @n8n-as-code/transformer@0.2.0

## 0.12.0

### Minor Changes

- fix execution order issue

## 0.11.0

### Minor Changes

- improve VS Code extension configuration UX with automatic project loading and pre-selection

## 0.10.0

### Minor Changes

- Implement robust pagination for n8n API retrieval and add supporting tests and scripts.

## 0.9.0

### Minor Changes

- switch to chokidar to fix windows compatibility

## 0.8.0

### Minor Changes

- fix projects for self hosted instances

## 0.7.0

### Minor Changes

- cleaning, renaming, ui

## 0.6.0

### Minor Changes

- fix id conflict sync loop

## 0.5.0

### Minor Changes

- packages naming refacto

## 0.4.3

### Patch Changes

- build process fixed

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

- Optimize skills package and enable enriched index in VS Code extension

  - skills: Reduced npm package size by 54% (68 MB → 31 MB) by removing src/assets/ from published files
  - vscode-extension: Now uses n8n-nodes-enriched.json with enhanced metadata (keywords, operations, use cases)

## 0.3.2

### Patch Changes

- -feat(skills): AI-powered node discovery with enriched documentation

  - Add 119 missing LangChain nodes (Google Gemini, OpenAI, etc.)
  - Integrate n8n official documentation with smart scoring algorithm
  - Improve search with keywords, operations, and use cases
  - 641 nodes indexed (+23%), 911 documentation files (95% coverage)
  - Update dependencies to use enhanced skills

## 0.3.1

### Patch Changes

- 08b83b5: doc update

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

## 0.2.0

### Minor Changes

- Release 0.2.0 with unified versioning.
