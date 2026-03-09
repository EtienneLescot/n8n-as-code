# @n8n-as-code/transformer

## [0.2.10](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/transformer@v0.2.9...@n8n-as-code/transformer@v0.2.10) (2026-03-09)

### Bug Fixes

* **transformer:** correct inverted AI CONNECTIONS in workflow-map ([b38b1d7](https://github.com/EtienneLescot/n8n-as-code/commit/b38b1d728524b69d7733f57752d2a1d9a59029a5))

## [0.2.9](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/transformer@v0.2.8...@n8n-as-code/transformer@v0.2.9) (2026-03-08)


### Features

* emit multiline jsCode as template literals ([579d390](https://github.com/EtienneLescot/n8n-as-code/commit/579d39020b0711e88a9444821147b0d986ba0233))

## [0.2.8](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/transformer@v0.2.7...@n8n-as-code/transformer@v0.2.8) (2026-03-07)


### Bug Fixes

* **cli:** update push command to require full workflow file path ([d28ded0](https://github.com/EtienneLescot/n8n-as-code/commit/d28ded0afb5fa0f223c8bfd5ae15e9f6b64ce004))

## [0.2.7](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/transformer@v0.2.6...@n8n-as-code/transformer@v0.2.7) (2026-03-07)


### Bug Fixes

* align transformer tag input types ([0a4e5d0](https://github.com/EtienneLescot/n8n-as-code/commit/0a4e5d0689cefd6ddc6fe179b821401e3edb69f4))
* preserve workflow tags in TypeScript sync ([fbf4877](https://github.com/EtienneLescot/n8n-as-code/commit/fbf487706a57dc1e92db8782c73061284f57b48f))

## [0.2.6](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/transformer@v0.2.5...@n8n-as-code/transformer@v0.2.6) (2026-03-06)


### Features

* retain node GUIDs across JSON ↔ TypeScript roundtrips ([2f77f8b](https://github.com/EtienneLescot/n8n-as-code/commit/2f77f8b52ba484474fcc826d6694c67387d3f909))


### Bug Fixes

* complete AI connection types and improve agent instructions ([239d4c3](https://github.com/EtienneLescot/n8n-as-code/commit/239d4c3cb6c3fcd38522d3015179325091f34af9))
* emit [ai_*] flags for AI sub-nodes in workflow-map NODE INDEX ([d487634](https://github.com/EtienneLescot/n8n-as-code/commit/d487634a82ca9ca619529b691ef22f6cd3ca63f0))
* use JSON.stringify for node id in [@node](https://github.com/node) decorator to safely escape special chars ([a1fbdf2](https://github.com/EtienneLescot/n8n-as-code/commit/a1fbdf253d689595e118e76edcfb47d1d689399e))


### Performance Improvements

* move AI_CONNECTION_TYPES to module-level Set for O(1) lookups ([a49d1ba](https://github.com/EtienneLescot/n8n-as-code/commit/a49d1bafbfebe66b7de0719abfff1dc3dbb73e8c))

## [0.2.5](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/transformer@v0.2.4...@n8n-as-code/transformer@v0.2.5) (2026-03-03)


### Bug Fixes

* **vscode-extension:** re-publish stable release after pre-release conflict ([e518679](https://github.com/EtienneLescot/n8n-as-code/commit/e518679eca186072eaf1f6fccd9b4b54a659ff6f))

## [0.2.4](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/transformer@v0.2.3...@n8n-as-code/transformer@v0.2.4) (2026-03-02)


### Features

* **tests:** update test command for transformer and include in unified test report ([d8e6931](https://github.com/EtienneLescot/n8n-as-code/commit/d8e69314c6322d0fe88bcaf8dc0a9aa18d277ce8))


### Bug Fixes

* **naming:** handle null/undefined inputs in property and class name generation ([6e341ac](https://github.com/EtienneLescot/n8n-as-code/commit/6e341ac0fa86f17aacdef865aed6f77ec617f62d))

## [0.2.3](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/transformer@v0.2.2...@n8n-as-code/transformer@v0.2.3) (2026-03-02)


### Features

* Refactor AiContextGenerator to remove shim generation and update command usage ([b5f6fa1](https://github.com/EtienneLescot/n8n-as-code/commit/b5f6fa1ed161a98e0f8cc38e57640ecd3db936b6))


### Bug Fixes

* **transformer:** remove const identifier resolution from static parser ([7a94f32](https://github.com/EtienneLescot/n8n-as-code/commit/7a94f32b913a019eb1724ca63f560f7eb666bf0f))
* **transformer:** replace eval with AST-based value extraction ([1a74315](https://github.com/EtienneLescot/n8n-as-code/commit/1a7431522f5064fdd3058bad4ee924fdf3c11f30))

## [0.2.2](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/transformer@v0.2.1...@n8n-as-code/transformer@v0.2.2) (2026-02-22)


### Bug Fixes

* enhance name cleaning logic and add tests for special character handling in naming utilities ([815782b](https://github.com/EtienneLescot/n8n-as-code/commit/815782bd18bc44e8118bcf6e3972a826803c0d29))

## [0.2.1](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/transformer@0.2.0...@n8n-as-code/transformer@v0.2.1) (2026-02-21)


### Features

* add transliteration for accented characters in name generation ([238a779](https://github.com/EtienneLescot/n8n-as-code/commit/238a779054f3f08647fa2c3960030cabdac4d13b))
* add TypeScript workflows support and conversion CLI commands ([0583c59](https://github.com/EtienneLescot/n8n-as-code/commit/0583c59a51ded27987802f030a3a6730bd59aacf))
* Enhance skills package with TypeScript workflow support ([4700a28](https://github.com/EtienneLescot/n8n-as-code/commit/4700a284e5666646a8dbf413edc171c0dd282eae))
* enhance sync and watcher services with AI dependency handling and logging ([3a5d724](https://github.com/EtienneLescot/n8n-as-code/commit/3a5d724a97d84f1d6a4b509b656aff90af162b44))
* enhance workflow handling with AI dependency extraction and filename-based key support ([615c37b](https://github.com/EtienneLescot/n8n-as-code/commit/615c37b98a4d4f064d2d944ada99369cc4680024))
* enhance workflow-map generation for improved navigation and readability ([94c09cd](https://github.com/EtienneLescot/n8n-as-code/commit/94c09cdba2d60995470f3d0a4eb7479e4fb1dd9b))
* expand AI connection types and add workspace TypeScript stubs ([4b9cc90](https://github.com/EtienneLescot/n8n-as-code/commit/4b9cc90f010a6c70ccb99411d07d4bf9c5b6dc5f))
* integrate TypeScript transformer into sync package, replacing JSON with .workflow.ts files ([390aa35](https://github.com/EtienneLescot/n8n-as-code/commit/390aa35874d8eb212f6aa29c6b511aebe344378b))
* **transformer:** add utilities for code formatting and naming conventions ([cc4716a](https://github.com/EtienneLescot/n8n-as-code/commit/cc4716ab11ec10455008aa4ddabfa1163c7bfc59))
* update documentation to reflect breaking changes for TypeScript workflow format across all packages ([48062d1](https://github.com/EtienneLescot/n8n-as-code/commit/48062d1c2f38e2d018e5e8da3fcec46a38f6d441))
* update package versions and changelogs for n8n-as-code ecosystem ([986996b](https://github.com/EtienneLescot/n8n-as-code/commit/986996b38dbaec5cc525d6d0aafbbd00f52959a6))


### Bug Fixes

* load prettier lazily in formatTypeScript and update external dependencies in esbuild config ([5c8614a](https://github.com/EtienneLescot/n8n-as-code/commit/5c8614ab478cfdbccdc1235c1f3c20ce52cb8b79))

## 0.2.0

### Minor Changes

- feat: transform n8n workflows from JSON to TypeScript with decorators and bidirectional conversion
