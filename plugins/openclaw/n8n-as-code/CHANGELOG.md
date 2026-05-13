# @n8n-as-code/n8nac

## [2.1.2](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/n8nac@v2.1.1...@n8n-as-code/n8nac@v2.1.2) (2026-05-13)

### Documentation

* align environment terminology ([6c79f5b](https://github.com/EtienneLescot/n8n-as-code/commit/6c79f5b57e349d59035dc57a464401f493dd75b7))

## [2.1.1](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/n8nac@v2.1.0...@n8n-as-code/n8nac@v2.1.1) (2026-05-12)

### Documentation

* **skills:** clarify opaque workflow dirs ([3f7b679](https://github.com/EtienneLescot/n8n-as-code/commit/3f7b67997fdd87ed22c27d7b6626076e545a2bde))

## [2.1.0](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/n8nac@v2.0.0...@n8n-as-code/n8nac@v2.1.0) (2026-05-11)

### Features

* **cli:** add workflow present command and update agent skill guidance ([70d4425](https://github.com/EtienneLescot/n8n-as-code/commit/70d44259e967295830606c4bf82cb71026a66b1d))
* **cli:** add workspace migration command and improve migration orchestration ([603aa59](https://github.com/EtienneLescot/n8n-as-code/commit/603aa59b675e4aa29badac372b24c0f234ac44fe))

### Bug Fixes

* **cli:** unify workspace migration reporting and enforce atomicity ([0e3e07f](https://github.com/EtienneLescot/n8n-as-code/commit/0e3e07f2e44eeb54c2de154dc7a91a1e58ee790f))
* **cli:** enforce migration-first workflow for workspace readiness ([cc11e37](https://github.com/EtienneLescot/n8n-as-code/commit/cc11e37b4e02f9f91f506ce38f2c16d8034af14c))
* **skills:** consolidate agent skills into n8n-architect ([6212c2f](https://github.com/EtienneLescot/n8n-as-code/commit/6212c2f5cb6f76d64cfb5141d39306aef16ac086))

### Documentation

* update documentation for unified workspace migration and readiness ([e078a79](https://github.com/EtienneLescot/n8n-as-code/commit/e078a79a550a7f5121a25e6d07b36079619f3c4d))
* **skills:** update n8n-architect guidance for unified migration and env status ([1be0695](https://github.com/EtienneLescot/n8n-as-code/commit/1be06951d30a0b67673cfe11e2794103018e286d))
* align docs and skills with environments ([267e9c2](https://github.com/EtienneLescot/n8n-as-code/commit/267e9c2980b08cb9f6a90b7c15e2b62717d6ee9c))
* update documentation for v2 split runtime and workspace model ([b8a4125](https://github.com/EtienneLescot/n8n-as-code/commit/b8a41256ea28d16382607a744c1f92fd3bac5824))

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
