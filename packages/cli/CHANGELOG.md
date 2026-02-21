# @n8n-as-code/cli

## [0.10.0](https://github.com/EtienneLescot/n8n-as-code/compare/cli-v0.9.1...cli-v0.10.0) (2026-02-21)


### ⚠ BREAKING CHANGES

* The 'n8n-as-code watch' command is deprecated in favor of 'n8nac start'. Users should update their scripts and workflows accordingly.
* **agent-cli:** This update introduces a new type field to node schemas and improves schema handling, which may require adjustments in dependent packages. The version has been bumped to 0.10.0 to reflect these changes.
* **agent-cli:** Test expectations for empty search results now use more flexible assertions
* **agent-cli:** Search behavior completely overhauled with new unified approach
* **agent-cli:** Extension size increases to 5.2 MB due to enriched data
* **agent-cli:** This update introduces significant changes to the agent-cli package and requires all dependent packages to update to version 0.3.0 or higher.

### Features

* Add AI context, schema, and snippet generation for n8n via CLI and VS Code extension. ([3fe0655](https://github.com/EtienneLescot/n8n-as-code/commit/3fe0655af328337468bad8d34e4c66ce581f556d))
* add TypeScript workflows support and conversion CLI commands ([0583c59](https://github.com/EtienneLescot/n8n-as-code/commit/0583c59a51ded27987802f030a3a6730bd59aacf))
* **agent-cli:** add AI-powered node discovery with enriched documentation ([6de05ed](https://github.com/EtienneLescot/n8n-as-code/commit/6de05ed9b73ea0d8578e17ba2d69e7be8a794cf7))
* **agent-cli:** add search intelligence integration and improve path resolution ([f636f4e](https://github.com/EtienneLescot/n8n-as-code/commit/f636f4e60d3b39759aa3eb739b2fdc7e0d77a286))
* **agent-cli:** add type field to node schema and improve schema handling ([a48185a](https://github.com/EtienneLescot/n8n-as-code/commit/a48185a1bf9fb69da602fd773ba0a00514ba246e))
* **agent-cli:** expand capabilities with community workflows and refined CLI ([5766e0c](https://github.com/EtienneLescot/n8n-as-code/commit/5766e0c7c7082a0bf4a82762f903de6ac437d8db))
* **agent-cli:** major refactor with unified FlexSearch integration ([37fa447](https://github.com/EtienneLescot/n8n-as-code/commit/37fa447eb776b823cd9c8faba553fc657c808d42))
* **agent-cli:** optimize package size and enable enriched index ([0d668db](https://github.com/EtienneLescot/n8n-as-code/commit/0d668db0e2d6e8aa464496b11c0ebf99a231bc12))
* **agent-cli:** support community nodes with validation warnings ([b98887f](https://github.com/EtienneLescot/n8n-as-code/commit/b98887fefff207964a0d704c5b50287f36418ee9))
* enhance VS Code extension resolution logic for better remote environment support ([f65f8aa](https://github.com/EtienneLescot/n8n-as-code/commit/f65f8aa3689a6e31b7519629c141ccd7ea9d9cb0))
* improve VS Code extension configuration UX with automatic project loading and pre-selection ([91fcee5](https://github.com/EtienneLescot/n8n-as-code/commit/91fcee5d5eb3abfc57b66386c1b846ce4703ac01))
* restructure project as monorepo with workspaces ([68e9333](https://github.com/EtienneLescot/n8n-as-code/commit/68e9333896439e65bb971eed1da6fa8823312283))
* **skills:** integrate skills CLI into VS Code extension ([6ec2302](https://github.com/EtienneLescot/n8n-as-code/commit/6ec230280ab5c265c32b02c0406645ba7cabf2a0))
* update documentation to reflect breaking changes for TypeScript workflow format across all packages ([48062d1](https://github.com/EtienneLescot/n8n-as-code/commit/48062d1c2f38e2d018e5e8da3fcec46a38f6d441))
* update package versions and changelogs for n8n-as-code ecosystem ([986996b](https://github.com/EtienneLescot/n8n-as-code/commit/986996b38dbaec5cc525d6d0aafbbd00f52959a6))
* update TypeScript configuration files to include transformer references and ensure composite builds ([53a2451](https://github.com/EtienneLescot/n8n-as-code/commit/53a2451ebd75fb0e1b40e2dd3a53a3c575ba696a))
* update version numbers and changelogs for dependencies across packages ([10dd3b3](https://github.com/EtienneLescot/n8n-as-code/commit/10dd3b325f6ecbf1ee8fb5c20e77f472c619e74e))
* update version numbers and changelogs for pagination implementation across packages ([f4b3b29](https://github.com/EtienneLescot/n8n-as-code/commit/f4b3b29f64520657673f373aef6396e7c579c950))


### Bug Fixes

* update package versions and changelogs for [@n8n-as-code](https://github.com/n8n-as-code) ecosystem ([02d7fbd](https://github.com/EtienneLescot/n8n-as-code/commit/02d7fbd8fd0f214c3f73726c5d4e14b49ee0a152))
* update package versions and changelogs for @n8n-as-code/cli, @n8n-as-code/skills, and @n8n-as-code/sync ([e8b7b7e](https://github.com/EtienneLescot/n8n-as-code/commit/e8b7b7e38fd2908c51d5ecf023d4376e34f286eb))


### Documentation

* rename 'watch' command to 'start' in documentation ([018ac2b](https://github.com/EtienneLescot/n8n-as-code/commit/018ac2ba8cd73590d1e909d0cff4c366d411854d))


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
