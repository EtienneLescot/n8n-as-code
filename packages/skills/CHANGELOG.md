# @n8n-as-code/skills

## [1.0.0](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/skills@v0.18.0...@n8n-as-code/skills@v1.0.0) (2026-03-10)

### Dependencies

* The following workspace dependencies were updated
  * @n8n-as-code/transformer bumped from 0.2.10 to 1.0.0

## [0.18.0](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/skills@v0.17.0...@n8n-as-code/skills@v0.18.0) (2026-03-09)

### Features

* remove SnippetGenerator and related functionality from AI context updates ([b5d3781](https://github.com/EtienneLescot/n8n-as-code/commit/b5d37819608435d4d4e9e5bc73a2973aa631c537))

### Bug Fixes

* stabilize unified config refresh in vscode extension ([45593e2](https://github.com/EtienneLescot/n8n-as-code/commit/45593e27342351741b79d955896822a44f8d977b))
* **skills:** extract highest node version in indexer; handle assignmentCollection type ([d6ff0d0](https://github.com/EtienneLescot/n8n-as-code/commit/d6ff0d03477f5bc4a6f1713fc6d52029d7f96005))
* **skills:** show all enum values for options type; remove | string escape hatch ([a864ead](https://github.com/EtienneLescot/n8n-as-code/commit/a864ead003acb0f3e7a2980e1f7f7c6a08b17441))
* **skills:** nested fixedcollection fields no longer emit group name as string literal type ([f9ff98d](https://github.com/EtienneLescot/n8n-as-code/commit/f9ff98d60fbef2248c0f48d4c483210baf985cf3))

### Dependencies

* The following workspace dependencies were updated
    * @n8n-as-code/transformer bumped from 0.2.9 to 0.2.10

## [0.17.0](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/skills@v0.16.17...@n8n-as-code/skills@v0.17.0) (2026-03-09)

### Features

* **skills:** resolve AI Agent example versions dynamically from node schema ([1de7f22](https://github.com/EtienneLescot/n8n-as-code/commit/1de7f22b6b1b13a5f9ffd8e31d74fc84d1d40517))
* remove deprecated n8nac files and add Switch/If node operations reference ([1b26ac3](https://github.com/EtienneLescot/n8n-as-code/commit/1b26ac3d796b433f8c0e620ef6a9281d353c0572))

### Bug Fixes

* **skills:** loadNodesIndex respects N8N_AS_CODE_ASSETS_DIR; renumber common mistakes ([08feece](https://github.com/EtienneLescot/n8n-as-code/commit/08feecea45e7e989a5cd1c00002d12c9951a544c))
* **skills:** reduce AGENTS.md redundancy (-53 lines) ([ec6ca73](https://github.com/EtienneLescot/n8n-as-code/commit/ec6ca73895475e8e7d1ce1b7de4d69259e49b6e7))
* **skills:** remove hardcoded Switch/If reference table from AGENTS.md ([01aadcd](https://github.com/EtienneLescot/n8n-as-code/commit/01aadcd6b4ed27f5d0941762232a4bce8946ce3b))
* **skills:** expand fixedCollection internal structure in node snippets ([bcc1ec1](https://github.com/EtienneLescot/n8n-as-code/commit/bcc1ec1e58f41240930edd726dbd2bb0fd08f4f8))

## [0.16.17](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/skills@v0.16.16...@n8n-as-code/skills@v0.16.17) (2026-03-09)

## [0.16.16](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/skills@v0.16.15...@n8n-as-code/skills@v0.16.16) (2026-03-08)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/transformer bumped from 0.2.8 to 0.2.9

## [0.16.15](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/skills@v0.16.14...@n8n-as-code/skills@v0.16.15) (2026-03-07)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/transformer bumped from 0.2.7 to 0.2.8

## [0.16.14](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/skills@v0.16.13...@n8n-as-code/skills@v0.16.14) (2026-03-07)


### Features

* **claude-plugin:** add marketplace-ready plugin packaging ([31d81bb](https://github.com/EtienneLescot/n8n-as-code/commit/31d81bb6fd99d393b6cc7f19d6f6a8e92519e884))
* **cli:** add non-interactive init for agents ([9ccc8e0](https://github.com/EtienneLescot/n8n-as-code/commit/9ccc8e0941b4151432142cd95fee9dfe988286b1))
* **cli:** push workflows by filename ([0422619](https://github.com/EtienneLescot/n8n-as-code/commit/0422619f098bcbf583a963b2d261388dfde0b626))


### Bug Fixes

* **claude-plugin:** agent must never ask user to run init manually ([2ef9bf0](https://github.com/EtienneLescot/n8n-as-code/commit/2ef9bf0162311d89426ef4bbed7a0d6335f12ad4))
* **claude-plugin:** require init before workflow actions ([8ab72b3](https://github.com/EtienneLescot/n8n-as-code/commit/8ab72b32331b554561d42816f7fc049f7f40e127))
* **claude-plugin:** ship a slim marketplace plugin root ([e24a8c6](https://github.com/EtienneLescot/n8n-as-code/commit/e24a8c6ea867accd42d3e27845fe19a6fa3e90a1))
* **cli:** address Claude plugin review feedback ([5fb588e](https://github.com/EtienneLescot/n8n-as-code/commit/5fb588ee988bd5b9e3f7b7cf8213d4298a974b5b))
* **skills:** add custom nodes debug diagnostics ([d5938b5](https://github.com/EtienneLescot/n8n-as-code/commit/d5938b59dcfa158263ae5e0ee80567b964b5a5fa))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/transformer bumped from 0.2.6 to 0.2.7

## [0.16.13](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/skills@v0.16.12...@n8n-as-code/skills@v0.16.13) (2026-03-06)


### Features

* add custom nodes support via n8nac-custom-nodes.json sidecar file ([e293a4e](https://github.com/EtienneLescot/n8n-as-code/commit/e293a4e5f0a0537f534b79bc350f5c81b9b4646f))
* add TypeScript formatter for generating code snippets and documentation ([e5d9b9d](https://github.com/EtienneLescot/n8n-as-code/commit/e5d9b9dce051c32477cd0163fbfe4f7a32b9e3d1))
* add usage tip for local shims in documentation ([d810bd9](https://github.com/EtienneLescot/n8n-as-code/commit/d810bd9df8522f163ced5f9bf3a15df5dae840b0))
* enhance AI tool support and enrich node metadata for HTTP requests ([4052027](https://github.com/EtienneLescot/n8n-as-code/commit/405202741860fecc621511ce9e7ebf174c9273bf))
* enhance AiContextGenerator to support pre-release detection and update CLI command usage ([bde29b9](https://github.com/EtienneLescot/n8n-as-code/commit/bde29b9001839df9166e5309b076140678dcdb46))
* enhance shim generation test to include extension path simulation for VS Code ([22238f1](https://github.com/EtienneLescot/n8n-as-code/commit/22238f17b62afcac6dadce7ec83f499dddc2feee))
* Enhance skills package with TypeScript workflow support ([4700a28](https://github.com/EtienneLescot/n8n-as-code/commit/4700a284e5666646a8dbf413edc171c0dd282eae))
* enhance TypeScript node generation with workflow support and improved formatting ([6802ba0](https://github.com/EtienneLescot/n8n-as-code/commit/6802ba0bac68dcc3461c1be472800e7b920143a9))
* enhance update-ai command and AiContextGenerator to improve local shim generation and clarify installation requirements for skills CLI ([3fb7e06](https://github.com/EtienneLescot/n8n-as-code/commit/3fb7e0658f6eefb984f43cee39c71162e3c1b069))
* enhance workflow validation and transformation with TypeScript support ([dbf7dda](https://github.com/EtienneLescot/n8n-as-code/commit/dbf7dda81d00e5e4d349f11fb4aa7509049b6c65))
* enhance workflow-map generation for improved navigation and readability ([94c09cd](https://github.com/EtienneLescot/n8n-as-code/commit/94c09cdba2d60995470f3d0a4eb7479e4fb1dd9b))
* expand AI connection types and add workspace TypeScript stubs ([4b9cc90](https://github.com/EtienneLescot/n8n-as-code/commit/4b9cc90f010a6c70ccb99411d07d4bf9c5b6dc5f))
* implement force refresh method and update sync logic across commands; add Pull-on-Focus feature in VSCode extension ([f110a9b](https://github.com/EtienneLescot/n8n-as-code/commit/f110a9b9d50f74256839a42d86dcc1d5e8e8db2e))
* improve VS Code extension configuration UX with automatic project loading and pre-selection ([91fcee5](https://github.com/EtienneLescot/n8n-as-code/commit/91fcee5d5eb3abfc57b66386c1b846ce4703ac01))
* Refactor AiContextGenerator to remove shim generation and update command usage ([b5f6fa1](https://github.com/EtienneLescot/n8n-as-code/commit/b5f6fa1ed161a98e0f8cc38e57640ecd3db936b6))
* **skills:** integrate skills CLI into VS Code extension ([6ec2302](https://github.com/EtienneLescot/n8n-as-code/commit/6ec230280ab5c265c32b02c0406645ba7cabf2a0))
* **sync:** add workflow verification after push and new verify command ([4742e0d](https://github.com/EtienneLescot/n8n-as-code/commit/4742e0d4bdbce62355ef4d668f09e1aa70456682))
* transition to git-like sync architecture for n8n workflows ([9d1cd51](https://github.com/EtienneLescot/n8n-as-code/commit/9d1cd516eea5024ce949c050ad6d62b1655be02f))
* update build script to generate SKILL.md dynamically and remove template file; enhance AiContextGenerator for workflow context ([2cfec72](https://github.com/EtienneLescot/n8n-as-code/commit/2cfec72dac9e09bca362a6fb8fd84ec6adcb600e))
* update documentation to reflect breaking changes for TypeScript workflow format across all packages ([48062d1](https://github.com/EtienneLescot/n8n-as-code/commit/48062d1c2f38e2d018e5e8da3fcec46a38f6d441))
* update generate:nodes script for comprehensive documentation generation and enhance test report parsing for Jest compatibility ([feefb85](https://github.com/EtienneLescot/n8n-as-code/commit/feefb8566a98750bb6ce4f50b009e61207ddc065))
* update install command to always download workflows as TypeScript and improve parameter prioritization in TypeScript formatter ([1f3e78e](https://github.com/EtienneLescot/n8n-as-code/commit/1f3e78e20afd22bf34f10178b3663ec87d5f2eb8))
* update package versions and changelogs for n8n-as-code ecosystem ([986996b](https://github.com/EtienneLescot/n8n-as-code/commit/986996b38dbaec5cc525d6d0aafbbd00f52959a6))
* update README and CLI documentation to enhance git-like sync workflow with conflict resolution commands ([235f318](https://github.com/EtienneLescot/n8n-as-code/commit/235f3189bb46c323c785af25c8cce64cfda9f871))
* update TypeScript configuration files to include transformer references and ensure composite builds ([53a2451](https://github.com/EtienneLescot/n8n-as-code/commit/53a2451ebd75fb0e1b40e2dd3a53a3c575ba696a))
* update version numbers and changelogs for dependencies across packages ([10dd3b3](https://github.com/EtienneLescot/n8n-as-code/commit/10dd3b325f6ecbf1ee8fb5c20e77f472c619e74e))
* update version numbers and changelogs for pagination implementation across packages ([f4b3b29](https://github.com/EtienneLescot/n8n-as-code/commit/f4b3b29f64520657673f373aef6396e7c579c950))
* update workflow documentation to reflect TypeScript usage and improve clarity ([faa38a2](https://github.com/EtienneLescot/n8n-as-code/commit/faa38a2ded5714a7b712898e8abb7d128cfc7eee))


### Bug Fixes

* add httpRequestTool schema, fix ESM scanning in generate-n8n-index, add guidance against toolHttpRequest ([2205212](https://github.com/EtienneLescot/n8n-as-code/commit/22052122c7741f8fb0a750f0a704c1b1df4d3324))
* address PR review comments - pin deps, fix docs, add --cli-version, use fileURLToPath ([082b8d1](https://github.com/EtienneLescot/n8n-as-code/commit/082b8d13bc195d676484709c9d7f162df8151459))
* complete AI connection types and improve agent instructions ([239d4c3](https://github.com/EtienneLescot/n8n-as-code/commit/239d4c3cb6c3fcd38522d3015179325091f34af9))
* correct WorkflowValidator custom nodes test expectation ([a53407e](https://github.com/EtienneLescot/n8n-as-code/commit/a53407ecf27ff2b092be43fc86e2af7179b58009))
* emit [ai_*] flags for AI sub-nodes in workflow-map NODE INDEX ([d487634](https://github.com/EtienneLescot/n8n-as-code/commit/d487634a82ca9ca619529b691ef22f6cd3ca63f0))
* lazy-initialize WorkflowRegistry in skills-commander to avoid eager I/O on startup ([526d114](https://github.com/EtienneLescot/n8n-as-code/commit/526d1141cea4b0d48e52a6fb0b1f82ea9a75e032))
* remove false claims about AI rule file generation ([8bf4912](https://github.com/EtienneLescot/n8n-as-code/commit/8bf491277411258d3dc26891599d9a8946e5b844))
* remove stray backticks causing TS errors, add cliCmd for n8nac commands, pin exact version in npx, pin inter-package deps in CI ([010aba3](https://github.com/EtienneLescot/n8n-as-code/commit/010aba37ef65a7a84352c8308a098aa30d7cd202))
* replace out-of-scope moduleKeys with Object.keys(module) in debug log; use version placeholder in httpRequestTool examples ([a87599e](https://github.com/EtienneLescot/n8n-as-code/commit/a87599e750dffd6b6bf45570c0a383710f657be4))
* restore proper line breaks for closing describe blocks in ai-context-generator.test.ts ([67d27ae](https://github.com/EtienneLescot/n8n-as-code/commit/67d27ae4c26412517dd17081fb11b9ab8de0ce0a))
* revert hardcoded pre-release versions to * — CI pins exact SHA-suffixed versions at publish time ([68ba945](https://github.com/EtienneLescot/n8n-as-code/commit/68ba945a4818d41f6fdf34c3521474b98930b64b))
* update AI connection examples and improve usage instructions ([1310dad](https://github.com/EtienneLescot/n8n-as-code/commit/1310dadaaf0f4dfb1055e1605e2ad1578f7e829b))
* update AI tool guidance in AGENTS.md and tests for consistency ([7573795](https://github.com/EtienneLescot/n8n-as-code/commit/7573795781346fa80a0179f946192dfd857a3376))
* update package versions and changelogs for [@n8n-as-code](https://github.com/n8n-as-code) ecosystem ([02d7fbd](https://github.com/EtienneLescot/n8n-as-code/commit/02d7fbd8fd0f214c3f73726c5d4e14b49ee0a152))
* update package versions and changelogs for @n8n-as-code/cli, @n8n-as-code/skills, and @n8n-as-code/sync ([e8b7b7e](https://github.com/EtienneLescot/n8n-as-code/commit/e8b7b7e38fd2908c51d5ecf023d4376e34f286eb))
* **vscode-extension:** re-publish stable release after pre-release conflict ([e518679](https://github.com/EtienneLescot/n8n-as-code/commit/e518679eca186072eaf1f6fccd9b4b54a659ff6f))

## [0.16.12](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/skills@v0.16.11...@n8n-as-code/skills@v0.16.12) (2026-03-06)


### Features

* enhance AI tool support and enrich node metadata for HTTP requests ([4052027](https://github.com/EtienneLescot/n8n-as-code/commit/405202741860fecc621511ce9e7ebf174c9273bf))


### Bug Fixes

* update AI tool guidance in AGENTS.md and tests for consistency ([7573795](https://github.com/EtienneLescot/n8n-as-code/commit/7573795781346fa80a0179f946192dfd857a3376))

## [0.16.11](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/skills@v0.16.10...@n8n-as-code/skills@v0.16.11) (2026-03-06)


### Features

* add custom nodes support via n8nac-custom-nodes.json sidecar file ([e293a4e](https://github.com/EtienneLescot/n8n-as-code/commit/e293a4e5f0a0537f534b79bc350f5c81b9b4646f))


### Bug Fixes

* add httpRequestTool schema, fix ESM scanning in generate-n8n-index, add guidance against toolHttpRequest ([2205212](https://github.com/EtienneLescot/n8n-as-code/commit/22052122c7741f8fb0a750f0a704c1b1df4d3324))
* complete AI connection types and improve agent instructions ([239d4c3](https://github.com/EtienneLescot/n8n-as-code/commit/239d4c3cb6c3fcd38522d3015179325091f34af9))
* correct WorkflowValidator custom nodes test expectation ([a53407e](https://github.com/EtienneLescot/n8n-as-code/commit/a53407ecf27ff2b092be43fc86e2af7179b58009))
* emit [ai_*] flags for AI sub-nodes in workflow-map NODE INDEX ([d487634](https://github.com/EtienneLescot/n8n-as-code/commit/d487634a82ca9ca619529b691ef22f6cd3ca63f0))
* replace out-of-scope moduleKeys with Object.keys(module) in debug log; use version placeholder in httpRequestTool examples ([a87599e](https://github.com/EtienneLescot/n8n-as-code/commit/a87599e750dffd6b6bf45570c0a383710f657be4))
* update AI connection examples and improve usage instructions ([1310dad](https://github.com/EtienneLescot/n8n-as-code/commit/1310dadaaf0f4dfb1055e1605e2ad1578f7e829b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/transformer bumped from 0.2.5 to 0.2.6

## [0.16.10](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/skills@v0.16.9...@n8n-as-code/skills@v0.16.10) (2026-03-03)


### Bug Fixes

* **vscode-extension:** re-publish stable release after pre-release conflict ([e518679](https://github.com/EtienneLescot/n8n-as-code/commit/e518679eca186072eaf1f6fccd9b4b54a659ff6f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/transformer bumped from 0.2.4 to 0.2.5

## [0.16.9](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/skills@v0.16.8...@n8n-as-code/skills@v0.16.9) (2026-03-02)


### Features

* **sync:** add workflow verification after push and new verify command ([4742e0d](https://github.com/EtienneLescot/n8n-as-code/commit/4742e0d4bdbce62355ef4d668f09e1aa70456682))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/transformer bumped from 0.2.3 to 0.2.4

## [0.16.8](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/skills@v0.16.7...@n8n-as-code/skills@v0.16.8) (2026-03-02)


### Features

* enhance AiContextGenerator to support pre-release detection and update CLI command usage ([bde29b9](https://github.com/EtienneLescot/n8n-as-code/commit/bde29b9001839df9166e5309b076140678dcdb46))
* Refactor AiContextGenerator to remove shim generation and update command usage ([b5f6fa1](https://github.com/EtienneLescot/n8n-as-code/commit/b5f6fa1ed161a98e0f8cc38e57640ecd3db936b6))


### Bug Fixes

* address PR review comments - pin deps, fix docs, add --cli-version, use fileURLToPath ([082b8d1](https://github.com/EtienneLescot/n8n-as-code/commit/082b8d13bc195d676484709c9d7f162df8151459))
* lazy-initialize WorkflowRegistry in skills-commander to avoid eager I/O on startup ([526d114](https://github.com/EtienneLescot/n8n-as-code/commit/526d1141cea4b0d48e52a6fb0b1f82ea9a75e032))
* remove false claims about AI rule file generation ([8bf4912](https://github.com/EtienneLescot/n8n-as-code/commit/8bf491277411258d3dc26891599d9a8946e5b844))
* remove stray backticks causing TS errors, add cliCmd for n8nac commands, pin exact version in npx, pin inter-package deps in CI ([010aba3](https://github.com/EtienneLescot/n8n-as-code/commit/010aba37ef65a7a84352c8308a098aa30d7cd202))
* restore proper line breaks for closing describe blocks in ai-context-generator.test.ts ([67d27ae](https://github.com/EtienneLescot/n8n-as-code/commit/67d27ae4c26412517dd17081fb11b9ab8de0ce0a))
* revert hardcoded pre-release versions to * — CI pins exact SHA-suffixed versions at publish time ([68ba945](https://github.com/EtienneLescot/n8n-as-code/commit/68ba945a4818d41f6fdf34c3521474b98930b64b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @n8n-as-code/transformer bumped from * to 0.2.3

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
