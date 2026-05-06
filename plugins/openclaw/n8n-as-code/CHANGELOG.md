# @n8n-as-code/n8nac

## [2.0.0](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/n8nac@v2026.5.0...@n8n-as-code/n8nac@v2.0.0) (2026-05-06)

### ⚠ BREAKING CHANGES

* migrate runtime ownership to n8n-manager ([8705ab4](https://github.com/EtienneLescot/n8n-as-code/commit/8705ab44abe4c73315d6985523c05a929cae3a94))

### Features

* **telemetry:** add privacy-first product analytics ([7afb6e4](https://github.com/EtienneLescot/n8n-as-code/commit/7afb6e4500b8ac27a15f80636f48116a56480f7d))
* **skills:** use npx for n8n-manager commands in AI context and docs ([51e56b8](https://github.com/EtienneLescot/n8n-as-code/commit/51e56b8d7d57f28efa9ac14680ad474f04d32d05))

### Bug Fixes

* **workbench:** use public yagr runtime packages ([6a94670](https://github.com/EtienneLescot/n8n-as-code/commit/6a94670bf6c0ecdaa02fd977e515d1d58d894a14))
* **telemetry:** refine active usage semantics ([4ffe544](https://github.com/EtienneLescot/n8n-as-code/commit/4ffe544583c2e784a066417edd8a0fceaa3dc5df))
* **skills:** align prerelease adapter commands ([9d1c0a4](https://github.com/EtienneLescot/n8n-as-code/commit/9d1c0a4ba54c9de1a031dc4a937dc64295260341))
* **n8n-as-code:** improve cli robustness and update package scope ([ca20c7c](https://github.com/EtienneLescot/n8n-as-code/commit/ca20c7c90c65d8efee14c2ca505e2aae06c8b9a0))
* **cli:** decouple runtime management from workspace management ([574bb05](https://github.com/EtienneLescot/n8n-as-code/commit/574bb0592e96411326e69a1a188b010c39169269))

### Documentation

* **skills:** update n8n command examples to use @next tag ([760c227](https://github.com/EtienneLescot/n8n-as-code/commit/760c227b91ab138d59e6492101427db0631c0acb))
* **skills:** remove @next suffix from n8n command examples ([5506838](https://github.com/EtienneLescot/n8n-as-code/commit/550683898bff44a64146d8a2957dd0dabc2095b0))

### Dependencies

* The following workspace dependencies were updated
    * @n8n-as-code/telemetry bumped from 0.1.0 to 2.0.0
    * @n8n-as-code/workflow-core bumped from 0.1.0 to 2.0.0

## [2026.5.0](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/n8nac@v2026.4.1...@n8n-as-code/n8nac@v2026.5.0) (2026-03-31)

### Features

* add integration tests for CLI instance management and update AI functionality ([f3131de](https://github.com/EtienneLescot/n8n-as-code/commit/f3131de6f74c28875e8264c5ac929291046cee7b))
* add agent-friendly instance management flows ([3d63571](https://github.com/EtienneLescot/n8n-as-code/commit/3d63571e1c5243e58a51a93b0c0b927946be86bf))
* extend instance library to plugins docs and integration tests ([3f97f54](https://github.com/EtienneLescot/n8n-as-code/commit/3f97f54869ddf99cd8c9b3837cf7ec94d35dccb5))

### Bug Fixes

* address PR review feedback for instance config flows ([06f0298](https://github.com/EtienneLescot/n8n-as-code/commit/06f029828969da738b154cf65f64461c8bda5571))

### Documentation

* align config flows across product surfaces ([d961f78](https://github.com/EtienneLescot/n8n-as-code/commit/d961f783e1b95022acdbf3f13ca0982520026619))

## [2026.4.1](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/n8nac@v2026.4.0...@n8n-as-code/n8nac@v2026.4.1) (2026-03-30)

### Bug Fixes

* make agent workflow testing and sync state resilient ([5850d07](https://github.com/EtienneLescot/n8n-as-code/commit/5850d07d8136ffb24c5106c7391b2d49d4dd2e5d))

## [2026.4.0](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/n8nac@v2026.3.1...@n8n-as-code/n8nac@v2026.4.0) (2026-03-17)

### Features

* scope OpenClaw n8n context via bundled skill ([abf1501](https://github.com/EtienneLescot/n8n-as-code/commit/abf15012e2d5f5cab9bd04fc930fe27b4fd48802))

### Bug Fixes

* tighten getChildEnv() allowlist + add unit tests ([2846414](https://github.com/EtienneLescot/n8n-as-code/commit/28464143bfb3390d51db6303bb377783a2994cfb))
* prevent credential forwarding to child processes via explicit env filtering ([283d005](https://github.com/EtienneLescot/n8n-as-code/commit/283d0059a1fcf33d70ec27d4485333e4441be240))
* refresh generated OpenClaw skill output ([b1f1eac](https://github.com/EtienneLescot/n8n-as-code/commit/b1f1eacb7bf1a988e19f42bdc86bb9088691cbae))
* generate OpenClaw skill from shared SSOT ([b6678bd](https://github.com/EtienneLescot/n8n-as-code/commit/b6678bd45c7da338b5ea4b6d5082be8b6d5105d4))

## [2026.3.1](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/n8nac@v2026.3.0...@n8n-as-code/n8nac@v2026.3.1) (2026-03-13)

### Documentation

* align editor and integration release messaging ([e1d6198](https://github.com/EtienneLescot/n8n-as-code/commit/e1d6198c3c6c942afe024f34b4ad419005ed991c))
