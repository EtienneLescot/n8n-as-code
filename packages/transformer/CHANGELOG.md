# @n8n-as-code/transformer

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
