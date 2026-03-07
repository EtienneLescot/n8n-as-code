# @n8n-as-code/cli

## [0.11.2](https://github.com/EtienneLescot/n8n-as-code/compare/n8nac@v0.11.1...n8nac@v0.11.2) (2026-03-07)


### Features

* **ci:** add live integration tests and update CI workflows ([f83ecf6](https://github.com/EtienneLescot/n8n-as-code/commit/f83ecf6495c1f12d6991de62f25087e65620ef38))
* **cli:** enhance test scripts with integration testing capabilities ([f83ecf6](https://github.com/EtienneLescot/n8n-as-code/commit/f83ecf6495c1f12d6991de62f25087e65620ef38))


### Bug Fixes

* **cli:** update push command to require full workflow file path ([d28ded0](https://github.com/EtienneLescot/n8n-as-code/commit/d28ded0afb5fa0f223c8bfd5ae15e9f6b64ce004))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/skills bumped from 0.16.14 to 0.16.15
    * @n8n-as-code/transformer bumped from 0.2.7 to 0.2.8

## [0.11.1](https://github.com/EtienneLescot/n8n-as-code/compare/n8nac@v0.11.0...n8nac@v0.11.1) (2026-03-07)


### Features

* **cli:** add non-interactive init for agents ([9ccc8e0](https://github.com/EtienneLescot/n8n-as-code/commit/9ccc8e0941b4151432142cd95fee9dfe988286b1))
* **cli:** push workflows by filename ([0422619](https://github.com/EtienneLescot/n8n-as-code/commit/0422619f098bcbf583a963b2d261388dfde0b626))


### Bug Fixes

* **cli:** address Claude plugin review feedback ([5fb588e](https://github.com/EtienneLescot/n8n-as-code/commit/5fb588ee988bd5b9e3f7b7cf8213d4298a974b5b))
* **sync:** refresh local workflow mapping before push ([90e2472](https://github.com/EtienneLescot/n8n-as-code/commit/90e2472f68bd8006a86ac53296984cce32bf1c5b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/skills bumped from 0.16.13 to 0.16.14
    * @n8n-as-code/transformer bumped from 0.2.6 to 0.2.7

## [0.11.0](https://github.com/EtienneLescot/n8n-as-code/compare/n8nac@v0.10.7...n8nac@v0.11.0) (2026-03-06)


### ⚠ BREAKING CHANGES

* The 'n8n-as-code watch' command is deprecated in favor of 'n8nac start'. Users should update their scripts and workflows accordingly.
* **agent-cli:** This update introduces a new type field to node schemas and improves schema handling, which may require adjustments in dependent packages. The version has been bumped to 0.10.0 to reflect these changes.
* **agent-cli:** Test expectations for empty search results now use more flexible assertions
* **agent-cli:** Search behavior completely overhauled with new unified approach
* **agent-cli:** Extension size increases to 5.2 MB due to enriched data
* **agent-cli:** This update introduces significant changes to the agent-cli package and requires all dependent packages to update to version 0.3.0 or higher.

### Features

* add custom nodes support via n8nac-custom-nodes.json sidecar file ([e293a4e](https://github.com/EtienneLescot/n8n-as-code/commit/e293a4e5f0a0537f534b79bc350f5c81b9b4646f))
* add refreshLocalState method to SyncManager and update sync commands for accurate local cache handling ([1d8437c](https://github.com/EtienneLescot/n8n-as-code/commit/1d8437ceef9ba54397a7de9bc75b6d75f2483fdf))
* add TypeScript workflows support and conversion CLI commands ([0583c59](https://github.com/EtienneLescot/n8n-as-code/commit/0583c59a51ded27987802f030a3a6730bd59aacf))
* **agent-cli:** add AI-powered node discovery with enriched documentation ([6de05ed](https://github.com/EtienneLescot/n8n-as-code/commit/6de05ed9b73ea0d8578e17ba2d69e7be8a794cf7))
* **agent-cli:** add search intelligence integration and improve path resolution ([f636f4e](https://github.com/EtienneLescot/n8n-as-code/commit/f636f4e60d3b39759aa3eb739b2fdc7e0d77a286))
* **agent-cli:** add type field to node schema and improve schema handling ([a48185a](https://github.com/EtienneLescot/n8n-as-code/commit/a48185a1bf9fb69da602fd773ba0a00514ba246e))
* **agent-cli:** expand capabilities with community workflows and refined CLI ([5766e0c](https://github.com/EtienneLescot/n8n-as-code/commit/5766e0c7c7082a0bf4a82762f903de6ac437d8db))
* **agent-cli:** major refactor with unified FlexSearch integration ([37fa447](https://github.com/EtienneLescot/n8n-as-code/commit/37fa447eb776b823cd9c8faba553fc657c808d42))
* **agent-cli:** optimize package size and enable enriched index ([0d668db](https://github.com/EtienneLescot/n8n-as-code/commit/0d668db0e2d6e8aa464496b11c0ebf99a231bc12))
* **agent-cli:** support community nodes with validation warnings ([b98887f](https://github.com/EtienneLescot/n8n-as-code/commit/b98887fefff207964a0d704c5b50287f36418ee9))
* enhance AiContextGenerator to support pre-release detection and update CLI command usage ([bde29b9](https://github.com/EtienneLescot/n8n-as-code/commit/bde29b9001839df9166e5309b076140678dcdb46))
* enhance configuration management by implementing unified config file for CLI and VSCode alignment ([50dce35](https://github.com/EtienneLescot/n8n-as-code/commit/50dce352891f7886972aaa91c0de150a7b0287dd))
* enhance push functionality to handle new and existing workflows with filename support ([6900770](https://github.com/EtienneLescot/n8n-as-code/commit/6900770cab1d8d7709ce4ae3125f84ae6f983bb3))
* enhance update-ai command and AiContextGenerator to improve local shim generation and clarify installation requirements for skills CLI ([3fb7e06](https://github.com/EtienneLescot/n8n-as-code/commit/3fb7e0658f6eefb984f43cee39c71162e3c1b069))
* implement auto-push and conflict resolution in SyncManager; update VSCode extension for improved workflow handling ([9ff944a](https://github.com/EtienneLescot/n8n-as-code/commit/9ff944a0b949143ae16d3296217406c4651c943d))
* implement CliApi to unify CLI command handling in VSCode extension ([4eb2a50](https://github.com/EtienneLescot/n8n-as-code/commit/4eb2a502d5811260a3f94b7215038fd93fb124f5))
* implement fetch command to update remote state cache for workflows ([cc6c064](https://github.com/EtienneLescot/n8n-as-code/commit/cc6c0640a9b0beda48de7c2ee3672b206aa1ba06))
* implement force refresh method and update sync logic across commands; add Pull-on-Focus feature in VSCode extension ([f110a9b](https://github.com/EtienneLescot/n8n-as-code/commit/f110a9b9d50f74256839a42d86dcc1d5e8e8db2e))
* implement git-like sync architecture with conflict resolution for workflows ([894b0a6](https://github.com/EtienneLescot/n8n-as-code/commit/894b0a6c58f91db989d5486b5abd048b4ac3faef))
* implement Git-like sync architecture; disable auto-push and update sync logic in StartCommand and SyncManager ([3711d3e](https://github.com/EtienneLescot/n8n-as-code/commit/3711d3eea46c81d12db013a1187089f895277ace))
* implement lightweight workflow listing to optimize status retrieval ([289e9bf](https://github.com/EtienneLescot/n8n-as-code/commit/289e9bfa3b3d1866aa16b5c794ea69b416688cc2))
* improve VS Code extension configuration UX with automatic project loading and pre-selection ([91fcee5](https://github.com/EtienneLescot/n8n-as-code/commit/91fcee5d5eb3abfc57b66386c1b846ce4703ac01))
* optimize workflow synchronization by removing force refresh and using cached state ([40ae940](https://github.com/EtienneLescot/n8n-as-code/commit/40ae940d9c3803fe7fe8e3e02157f3d64897401a))
* Refactor AiContextGenerator to remove shim generation and update command usage ([b5f6fa1](https://github.com/EtienneLescot/n8n-as-code/commit/b5f6fa1ed161a98e0f8cc38e57640ecd3db936b6))
* refactor StartCommand and SyncCommand to streamline conflict resolution; update VSCode extension for improved user experience and action handling ([e10a6e8](https://github.com/EtienneLescot/n8n-as-code/commit/e10a6e84f5404bdf218ed8b4f4eca5e48135a67d))
* remove sync package references and integrate sync logic into cli package; update related documentation and tests ([89901ce](https://github.com/EtienneLescot/n8n-as-code/commit/89901ce03f953c0e8e162214e041a3638e980a0f))
* remove sync package references and update documentation to reflect embedded sync engine in CLI ([0369960](https://github.com/EtienneLescot/n8n-as-code/commit/03699609e241e2e69ba5887572632b197676feb8))
* Restrict local workflow file watching and discovery to `.workflow.ts` files and refresh remote state on startup. ([77137f7](https://github.com/EtienneLescot/n8n-as-code/commit/77137f71ec3afc7cdae164ceb79480d8269552c6))
* retain node GUIDs across JSON ↔ TypeScript roundtrips ([2f77f8b](https://github.com/EtienneLescot/n8n-as-code/commit/2f77f8b52ba484474fcc826d6694c67387d3f909))
* save fallback instance identifier to local config in getOrCreateInstanceIdentifier method ([bb108ef](https://github.com/EtienneLescot/n8n-as-code/commit/bb108efb288210603f77d327675a50ebd4fad1c8))
* single config point — VS Code extension syncs credentials to CLI store ([2b51743](https://github.com/EtienneLescot/n8n-as-code/commit/2b51743730dff7bf04bde16c1151dcb429173cb3))
* **skills:** integrate skills CLI into VS Code extension ([6ec2302](https://github.com/EtienneLescot/n8n-as-code/commit/6ec230280ab5c265c32b02c0406645ba7cabf2a0))
* **sync:** add workflow verification after push and new verify command ([4742e0d](https://github.com/EtienneLescot/n8n-as-code/commit/4742e0d4bdbce62355ef4d668f09e1aa70456682))
* transition to git-like sync architecture for n8n workflows ([9d1cd51](https://github.com/EtienneLescot/n8n-as-code/commit/9d1cd516eea5024ce949c050ad6d62b1655be02f))
* unify configuration management by migrating to n8nac-config.json and removing legacy files ([58a0bb4](https://github.com/EtienneLescot/n8n-as-code/commit/58a0bb4ccceb0f806736ef6eded3a11586536ded))
* update configuration management to use n8nac-config.json and enhance CLI commands for improved workflow handling ([a4afc65](https://github.com/EtienneLescot/n8n-as-code/commit/a4afc65bd86a1a782a22e19c5fe6b1650d449201))
* update documentation to reflect breaking changes for TypeScript workflow format across all packages ([48062d1](https://github.com/EtienneLescot/n8n-as-code/commit/48062d1c2f38e2d018e5e8da3fcec46a38f6d441))
* update package versions and changelogs for n8n-as-code ecosystem ([986996b](https://github.com/EtienneLescot/n8n-as-code/commit/986996b38dbaec5cc525d6d0aafbbd00f52959a6))
* update README and CLI documentation to enhance git-like sync workflow with conflict resolution commands ([235f318](https://github.com/EtienneLescot/n8n-as-code/commit/235f3189bb46c323c785af25c8cce64cfda9f871))
* update TypeScript configuration files to include transformer references and ensure composite builds ([53a2451](https://github.com/EtienneLescot/n8n-as-code/commit/53a2451ebd75fb0e1b40e2dd3a53a3c575ba696a))
* update version numbers and changelogs for dependencies across packages ([10dd3b3](https://github.com/EtienneLescot/n8n-as-code/commit/10dd3b325f6ecbf1ee8fb5c20e77f472c619e74e))
* update version numbers and changelogs for pagination implementation across packages ([f4b3b29](https://github.com/EtienneLescot/n8n-as-code/commit/f4b3b29f64520657673f373aef6396e7c579c950))


### Bug Fixes

* address PR review comments - pin deps, fix docs, add --cli-version, use fileURLToPath ([082b8d1](https://github.com/EtienneLescot/n8n-as-code/commit/082b8d13bc195d676484709c9d7f162df8151459))
* **cli:** avoid tsconfig paths/baseUrl conflict in workspace setup ([913281e](https://github.com/EtienneLescot/n8n-as-code/commit/913281ea07afc140d11b9717078cf4f5a5f83584))
* **cli:** remove deprecated baseUrl from generated workspace tsconfig ([08f9273](https://github.com/EtienneLescot/n8n-as-code/commit/08f92734824d636cdd2df96470a3c1eeb73f7120))
* **cli:** validate project config before ensureInstanceIdentifier in getSyncConfig ([90991bf](https://github.com/EtienneLescot/n8n-as-code/commit/90991bfdcc048448d559af016ef9fec254656b8d))
* **dependencies:** update version pinning logic for inter-package dependencies and adjust AGENTS.md generation for pre-release builds ([a7a7a0d](https://github.com/EtienneLescot/n8n-as-code/commit/a7a7a0d96a1ae5a61887263dee8631b3dc75e7cd))
* improve version retrieval logic to handle different execution contexts more accurately ([4ac7090](https://github.com/EtienneLescot/n8n-as-code/commit/4ac70904a4175a30265ebcde8d7dd93edaf9c622))
* prevent spurious CONFLICT status by ensuring local state is reported as TRACKED when remote hash is unknown ([41a42a6](https://github.com/EtienneLescot/n8n-as-code/commit/41a42a6f5dbc0b6df6b2f96a27635905fd9ab879))
* remove false claims about AI rule file generation ([8bf4912](https://github.com/EtienneLescot/n8n-as-code/commit/8bf491277411258d3dc26891599d9a8946e5b844))
* replace all colons in host slug on Windows, not just the first ([4705def](https://github.com/EtienneLescot/n8n-as-code/commit/4705deffbd6b82b6283c3121c93c88a6c51a6a3e))
* Replace colon in host slugs on Windows ([425edbb](https://github.com/EtienneLescot/n8n-as-code/commit/425edbbc2aafc5575ebf22c5fce9ea10a374ec2c))
* revert hardcoded pre-release versions to * — CI pins exact SHA-suffixed versions at publish time ([68ba945](https://github.com/EtienneLescot/n8n-as-code/commit/68ba945a4818d41f6fdf34c3521474b98930b64b))
* sanitize workflow filenames to avoid invalid Windows filesystem names ([0d83c26](https://github.com/EtienneLescot/n8n-as-code/commit/0d83c26ce67aa8b15fa6d29dafff1ddd1e71f425))
* **sync:** throw error if workflow not found on remote during pull ([b18de07](https://github.com/EtienneLescot/n8n-as-code/commit/b18de07442408ea0089cb9c8a8e5f73c738e49cc))
* update package versions and changelogs for [@n8n-as-code](https://github.com/n8n-as-code) ecosystem ([02d7fbd](https://github.com/EtienneLescot/n8n-as-code/commit/02d7fbd8fd0f214c3f73726c5d4e14b49ee0a152))
* update package versions and changelogs for @n8n-as-code/cli, @n8n-as-code/skills, and @n8n-as-code/sync ([e8b7b7e](https://github.com/EtienneLescot/n8n-as-code/commit/e8b7b7e38fd2908c51d5ecf023d4376e34f286eb))
* update SyncManager comment and handle workflow conflict resolution ([68ad67a](https://github.com/EtienneLescot/n8n-as-code/commit/68ad67a642487da913e3d4be6bf5d76d7ddc4e88))
* **vscode-extension:** re-publish stable release after pre-release conflict ([e518679](https://github.com/EtienneLescot/n8n-as-code/commit/e518679eca186072eaf1f6fccd9b4b54a659ff6f))


### Documentation

* rename 'watch' command to 'start' in documentation ([018ac2b](https://github.com/EtienneLescot/n8n-as-code/commit/018ac2ba8cd73590d1e909d0cff4c366d411854d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/skills bumped from 0.16.12 to 0.16.13

## [0.10.7](https://github.com/EtienneLescot/n8n-as-code/compare/n8nac@v0.10.6...n8nac@v0.10.7) (2026-03-06)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/skills bumped from 0.16.11 to 0.16.12

## [0.10.6](https://github.com/EtienneLescot/n8n-as-code/compare/n8nac@v0.10.5...n8nac@v0.10.6) (2026-03-06)


### Bug Fixes

* sanitize workflow filenames to avoid invalid Windows filesystem names ([0d83c26](https://github.com/EtienneLescot/n8n-as-code/commit/0d83c26ce67aa8b15fa6d29dafff1ddd1e71f425))

## [0.10.5](https://github.com/EtienneLescot/n8n-as-code/compare/n8nac@v0.10.4...n8nac@v0.10.5) (2026-03-06)


### Features

* add custom nodes support via n8nac-custom-nodes.json sidecar file ([e293a4e](https://github.com/EtienneLescot/n8n-as-code/commit/e293a4e5f0a0537f534b79bc350f5c81b9b4646f))
* retain node GUIDs across JSON ↔ TypeScript roundtrips ([2f77f8b](https://github.com/EtienneLescot/n8n-as-code/commit/2f77f8b52ba484474fcc826d6694c67387d3f909))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/skills bumped from 0.16.10 to 0.16.11
    * @n8n-as-code/transformer bumped from 0.2.5 to 0.2.6

## [0.10.4](https://github.com/EtienneLescot/n8n-as-code/compare/n8nac@v0.10.3...n8nac@v0.10.4) (2026-03-05)


### Features

* single config point — VS Code extension syncs credentials to CLI store ([2b51743](https://github.com/EtienneLescot/n8n-as-code/commit/2b51743730dff7bf04bde16c1151dcb429173cb3))


### Bug Fixes

* **cli:** avoid tsconfig paths/baseUrl conflict in workspace setup ([913281e](https://github.com/EtienneLescot/n8n-as-code/commit/913281ea07afc140d11b9717078cf4f5a5f83584))
* **cli:** remove deprecated baseUrl from generated workspace tsconfig ([08f9273](https://github.com/EtienneLescot/n8n-as-code/commit/08f92734824d636cdd2df96470a3c1eeb73f7120))
* **cli:** validate project config before ensureInstanceIdentifier in getSyncConfig ([90991bf](https://github.com/EtienneLescot/n8n-as-code/commit/90991bfdcc048448d559af016ef9fec254656b8d))

## [0.10.3](https://github.com/EtienneLescot/n8n-as-code/compare/n8nac@v0.10.2...n8nac@v0.10.3) (2026-03-04)


### Bug Fixes

* replace all colons in host slug on Windows, not just the first ([4705def](https://github.com/EtienneLescot/n8n-as-code/commit/4705deffbd6b82b6283c3121c93c88a6c51a6a3e))
* Replace colon in host slugs on Windows ([425edbb](https://github.com/EtienneLescot/n8n-as-code/commit/425edbbc2aafc5575ebf22c5fce9ea10a374ec2c))

## [0.10.2](https://github.com/EtienneLescot/n8n-as-code/compare/n8nac@v0.10.1...n8nac@v0.10.2) (2026-03-03)


### Bug Fixes

* **vscode-extension:** re-publish stable release after pre-release conflict ([e518679](https://github.com/EtienneLescot/n8n-as-code/commit/e518679eca186072eaf1f6fccd9b4b54a659ff6f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/skills bumped from 0.16.9 to 0.16.10
    * @n8n-as-code/transformer bumped from 0.2.4 to 0.2.5

## [0.10.1](https://github.com/EtienneLescot/n8n-as-code/compare/n8nac@v0.10.0...n8nac@v0.10.1) (2026-03-02)


### Features

* **sync:** add workflow verification after push and new verify command ([4742e0d](https://github.com/EtienneLescot/n8n-as-code/commit/4742e0d4bdbce62355ef4d668f09e1aa70456682))


### Bug Fixes

* **dependencies:** update version pinning logic for inter-package dependencies and adjust AGENTS.md generation for pre-release builds ([a7a7a0d](https://github.com/EtienneLescot/n8n-as-code/commit/a7a7a0d96a1ae5a61887263dee8631b3dc75e7cd))
* **sync:** throw error if workflow not found on remote during pull ([b18de07](https://github.com/EtienneLescot/n8n-as-code/commit/b18de07442408ea0089cb9c8a8e5f73c738e49cc))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/skills bumped from 0.16.8 to 0.16.9
    * @n8n-as-code/transformer bumped from 0.2.3 to 0.2.4

## [0.10.0](https://github.com/EtienneLescot/n8n-as-code/compare/n8nac@v0.9.8...n8nac@v0.10.0) (2026-03-02)


### ⚠ BREAKING CHANGES

* The 'n8n-as-code watch' command is deprecated in favor of 'n8nac start'. Users should update their scripts and workflows accordingly.
* **agent-cli:** This update introduces a new type field to node schemas and improves schema handling, which may require adjustments in dependent packages. The version has been bumped to 0.10.0 to reflect these changes.
* **agent-cli:** Test expectations for empty search results now use more flexible assertions
* **agent-cli:** Search behavior completely overhauled with new unified approach
* **agent-cli:** Extension size increases to 5.2 MB due to enriched data
* **agent-cli:** This update introduces significant changes to the agent-cli package and requires all dependent packages to update to version 0.3.0 or higher.

### Features

* Add AI context, schema, and snippet generation for n8n via CLI and VS Code extension. ([3fe0655](https://github.com/EtienneLescot/n8n-as-code/commit/3fe0655af328337468bad8d34e4c66ce581f556d))
* add refreshLocalState method to SyncManager and update sync commands for accurate local cache handling ([1d8437c](https://github.com/EtienneLescot/n8n-as-code/commit/1d8437ceef9ba54397a7de9bc75b6d75f2483fdf))
* add TypeScript workflows support and conversion CLI commands ([0583c59](https://github.com/EtienneLescot/n8n-as-code/commit/0583c59a51ded27987802f030a3a6730bd59aacf))
* **agent-cli:** add AI-powered node discovery with enriched documentation ([6de05ed](https://github.com/EtienneLescot/n8n-as-code/commit/6de05ed9b73ea0d8578e17ba2d69e7be8a794cf7))
* **agent-cli:** add search intelligence integration and improve path resolution ([f636f4e](https://github.com/EtienneLescot/n8n-as-code/commit/f636f4e60d3b39759aa3eb739b2fdc7e0d77a286))
* **agent-cli:** add type field to node schema and improve schema handling ([a48185a](https://github.com/EtienneLescot/n8n-as-code/commit/a48185a1bf9fb69da602fd773ba0a00514ba246e))
* **agent-cli:** expand capabilities with community workflows and refined CLI ([5766e0c](https://github.com/EtienneLescot/n8n-as-code/commit/5766e0c7c7082a0bf4a82762f903de6ac437d8db))
* **agent-cli:** major refactor with unified FlexSearch integration ([37fa447](https://github.com/EtienneLescot/n8n-as-code/commit/37fa447eb776b823cd9c8faba553fc657c808d42))
* **agent-cli:** optimize package size and enable enriched index ([0d668db](https://github.com/EtienneLescot/n8n-as-code/commit/0d668db0e2d6e8aa464496b11c0ebf99a231bc12))
* **agent-cli:** support community nodes with validation warnings ([b98887f](https://github.com/EtienneLescot/n8n-as-code/commit/b98887fefff207964a0d704c5b50287f36418ee9))
* enhance AiContextGenerator to support pre-release detection and update CLI command usage ([bde29b9](https://github.com/EtienneLescot/n8n-as-code/commit/bde29b9001839df9166e5309b076140678dcdb46))
* enhance configuration management by implementing unified config file for CLI and VSCode alignment ([50dce35](https://github.com/EtienneLescot/n8n-as-code/commit/50dce352891f7886972aaa91c0de150a7b0287dd))
* enhance push functionality to handle new and existing workflows with filename support ([6900770](https://github.com/EtienneLescot/n8n-as-code/commit/6900770cab1d8d7709ce4ae3125f84ae6f983bb3))
* enhance update-ai command and AiContextGenerator to improve local shim generation and clarify installation requirements for skills CLI ([3fb7e06](https://github.com/EtienneLescot/n8n-as-code/commit/3fb7e0658f6eefb984f43cee39c71162e3c1b069))
* implement auto-push and conflict resolution in SyncManager; update VSCode extension for improved workflow handling ([9ff944a](https://github.com/EtienneLescot/n8n-as-code/commit/9ff944a0b949143ae16d3296217406c4651c943d))
* implement CliApi to unify CLI command handling in VSCode extension ([4eb2a50](https://github.com/EtienneLescot/n8n-as-code/commit/4eb2a502d5811260a3f94b7215038fd93fb124f5))
* implement fetch command to update remote state cache for workflows ([cc6c064](https://github.com/EtienneLescot/n8n-as-code/commit/cc6c0640a9b0beda48de7c2ee3672b206aa1ba06))
* implement force refresh method and update sync logic across commands; add Pull-on-Focus feature in VSCode extension ([f110a9b](https://github.com/EtienneLescot/n8n-as-code/commit/f110a9b9d50f74256839a42d86dcc1d5e8e8db2e))
* implement git-like sync architecture with conflict resolution for workflows ([894b0a6](https://github.com/EtienneLescot/n8n-as-code/commit/894b0a6c58f91db989d5486b5abd048b4ac3faef))
* implement Git-like sync architecture; disable auto-push and update sync logic in StartCommand and SyncManager ([3711d3e](https://github.com/EtienneLescot/n8n-as-code/commit/3711d3eea46c81d12db013a1187089f895277ace))
* implement lightweight workflow listing to optimize status retrieval ([289e9bf](https://github.com/EtienneLescot/n8n-as-code/commit/289e9bfa3b3d1866aa16b5c794ea69b416688cc2))
* improve VS Code extension configuration UX with automatic project loading and pre-selection ([91fcee5](https://github.com/EtienneLescot/n8n-as-code/commit/91fcee5d5eb3abfc57b66386c1b846ce4703ac01))
* optimize workflow synchronization by removing force refresh and using cached state ([40ae940](https://github.com/EtienneLescot/n8n-as-code/commit/40ae940d9c3803fe7fe8e3e02157f3d64897401a))
* Refactor AiContextGenerator to remove shim generation and update command usage ([b5f6fa1](https://github.com/EtienneLescot/n8n-as-code/commit/b5f6fa1ed161a98e0f8cc38e57640ecd3db936b6))
* refactor StartCommand and SyncCommand to streamline conflict resolution; update VSCode extension for improved user experience and action handling ([e10a6e8](https://github.com/EtienneLescot/n8n-as-code/commit/e10a6e84f5404bdf218ed8b4f4eca5e48135a67d))
* remove sync package references and integrate sync logic into cli package; update related documentation and tests ([89901ce](https://github.com/EtienneLescot/n8n-as-code/commit/89901ce03f953c0e8e162214e041a3638e980a0f))
* remove sync package references and update documentation to reflect embedded sync engine in CLI ([0369960](https://github.com/EtienneLescot/n8n-as-code/commit/03699609e241e2e69ba5887572632b197676feb8))
* Restrict local workflow file watching and discovery to `.workflow.ts` files and refresh remote state on startup. ([77137f7](https://github.com/EtienneLescot/n8n-as-code/commit/77137f71ec3afc7cdae164ceb79480d8269552c6))
* restructure project as monorepo with workspaces ([68e9333](https://github.com/EtienneLescot/n8n-as-code/commit/68e9333896439e65bb971eed1da6fa8823312283))
* save fallback instance identifier to local config in getOrCreateInstanceIdentifier method ([bb108ef](https://github.com/EtienneLescot/n8n-as-code/commit/bb108efb288210603f77d327675a50ebd4fad1c8))
* **skills:** integrate skills CLI into VS Code extension ([6ec2302](https://github.com/EtienneLescot/n8n-as-code/commit/6ec230280ab5c265c32b02c0406645ba7cabf2a0))
* transition to git-like sync architecture for n8n workflows ([9d1cd51](https://github.com/EtienneLescot/n8n-as-code/commit/9d1cd516eea5024ce949c050ad6d62b1655be02f))
* unify configuration management by migrating to n8nac-config.json and removing legacy files ([58a0bb4](https://github.com/EtienneLescot/n8n-as-code/commit/58a0bb4ccceb0f806736ef6eded3a11586536ded))
* update configuration management to use n8nac-config.json and enhance CLI commands for improved workflow handling ([a4afc65](https://github.com/EtienneLescot/n8n-as-code/commit/a4afc65bd86a1a782a22e19c5fe6b1650d449201))
* update documentation to reflect breaking changes for TypeScript workflow format across all packages ([48062d1](https://github.com/EtienneLescot/n8n-as-code/commit/48062d1c2f38e2d018e5e8da3fcec46a38f6d441))
* update package versions and changelogs for n8n-as-code ecosystem ([986996b](https://github.com/EtienneLescot/n8n-as-code/commit/986996b38dbaec5cc525d6d0aafbbd00f52959a6))
* update README and CLI documentation to enhance git-like sync workflow with conflict resolution commands ([235f318](https://github.com/EtienneLescot/n8n-as-code/commit/235f3189bb46c323c785af25c8cce64cfda9f871))
* update TypeScript configuration files to include transformer references and ensure composite builds ([53a2451](https://github.com/EtienneLescot/n8n-as-code/commit/53a2451ebd75fb0e1b40e2dd3a53a3c575ba696a))
* update version numbers and changelogs for dependencies across packages ([10dd3b3](https://github.com/EtienneLescot/n8n-as-code/commit/10dd3b325f6ecbf1ee8fb5c20e77f472c619e74e))
* update version numbers and changelogs for pagination implementation across packages ([f4b3b29](https://github.com/EtienneLescot/n8n-as-code/commit/f4b3b29f64520657673f373aef6396e7c579c950))


### Bug Fixes

* address PR review comments - pin deps, fix docs, add --cli-version, use fileURLToPath ([082b8d1](https://github.com/EtienneLescot/n8n-as-code/commit/082b8d13bc195d676484709c9d7f162df8151459))
* improve version retrieval logic to handle different execution contexts more accurately ([4ac7090](https://github.com/EtienneLescot/n8n-as-code/commit/4ac70904a4175a30265ebcde8d7dd93edaf9c622))
* prevent spurious CONFLICT status by ensuring local state is reported as TRACKED when remote hash is unknown ([41a42a6](https://github.com/EtienneLescot/n8n-as-code/commit/41a42a6f5dbc0b6df6b2f96a27635905fd9ab879))
* remove false claims about AI rule file generation ([8bf4912](https://github.com/EtienneLescot/n8n-as-code/commit/8bf491277411258d3dc26891599d9a8946e5b844))
* revert hardcoded pre-release versions to * — CI pins exact SHA-suffixed versions at publish time ([68ba945](https://github.com/EtienneLescot/n8n-as-code/commit/68ba945a4818d41f6fdf34c3521474b98930b64b))
* update package versions and changelogs for [@n8n-as-code](https://github.com/n8n-as-code) ecosystem ([02d7fbd](https://github.com/EtienneLescot/n8n-as-code/commit/02d7fbd8fd0f214c3f73726c5d4e14b49ee0a152))
* update package versions and changelogs for @n8n-as-code/cli, @n8n-as-code/skills, and @n8n-as-code/sync ([e8b7b7e](https://github.com/EtienneLescot/n8n-as-code/commit/e8b7b7e38fd2908c51d5ecf023d4376e34f286eb))
* update SyncManager comment and handle workflow conflict resolution ([68ad67a](https://github.com/EtienneLescot/n8n-as-code/commit/68ad67a642487da913e3d4be6bf5d76d7ddc4e88))


### Documentation

* rename 'watch' command to 'start' in documentation ([018ac2b](https://github.com/EtienneLescot/n8n-as-code/commit/018ac2ba8cd73590d1e909d0cff4c366d411854d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/skills bumped from * to 0.16.8
    * @n8n-as-code/transformer bumped from * to 0.2.3

## [0.9.8](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/cli@v0.9.7...@n8n-as-code/cli@v0.9.8) (2026-02-27)


### Bug Fixes

* prevent spurious CONFLICT status by ensuring local state is reported as TRACKED when remote hash is unknown ([41a42a6](https://github.com/EtienneLescot/n8n-as-code/commit/41a42a6f5dbc0b6df6b2f96a27635905fd9ab879))

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
