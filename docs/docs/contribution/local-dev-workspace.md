---
sidebar_label: Local Dev Workspace
title: Local Dev Workspace
description: Test n8n-as-code facades against local n8nac and n8n-manager builds.
---

# Local Dev Workspace

Generated agent instructions name whatever `n8nac` the workspace already has, and fall back to `npx --yes n8nac` only when it has none. That fallback matters for VS Code, Cursor, MCP clients and agent shells, which are handed no `node_modules/.bin` on their `PATH`. Everywhere else npx is pure overhead: it pays npm's own startup on every call, and an agent makes tens of calls per task.

Local end-to-end development uses an explicit override instead of changing that default.

## Workspace

Use the [`n8n-ecosystem-dev`](https://github.com/EtienneLescot/n8n-ecosystem-dev) helper workspace when you need to test multiple local repos together. It bootstraps `n8n-as-code`, `n8n-manager`, dev state, command overrides, and smoke-test commands in one place.

Example local workflow:

```bash
cd /home/etienne/repos/n8n-ecosystem-dev
pnpm dev:bootstrap
source .env.dev
pnpm dev:doctor
```

The workspace points every facade at local builds:

```bash
N8NAC_COMMAND="node /home/etienne/repos/n8n-ecosystem-dev/n8n-as-code/packages/cli/dist/index.js"
N8N_MANAGER_COMMAND="node /home/etienne/repos/n8n-ecosystem-dev/n8n-manager/packages/cli/dist/index.js"
N8N_MANAGER_STATE_PATH="/home/etienne/repos/n8n-ecosystem-dev/.dev-state/n8n-manager/instance.json"
```

## Command Resolution SSOT

`resolveN8nacCommandRefs` in `packages/skills/src/services/cli-command-resolver.ts` is the only place that decides the command. Generated `AGENTS.md` and skill prompts resolve it in this order:

1. `--cli-cmd`, or the command `update-ai` infers for itself when that flag is absent: the monorepo entry point in a dev checkout, then a global install found on `PATH`
2. `N8NAC_COMMAND`
3. `.n8nac-dev.json` in the target workspace
4. a local install at `node_modules/n8nac/dist/index.js`, named by a relative path
5. published fallback: `npx --yes n8nac`

Rung 4 emits a relative path deliberately. Generated context is committed in user projects, so an absolute path would name a directory that exists on one machine only; and a path without spaces needs no shell quoting, which is what keeps it working under `cmd.exe`.

Rungs 3 and 4 both require a project root. Passing none is how the packaged skill mirrors stay machine-independent: they are pre-rendered at build time and diff-gated in CI.

This keeps production and extension behavior safe while making local dev reproducible.

The helper repository is optional for normal package work in this repo, but it is the recommended path for end-to-end facade testing across `n8n-as-code` and `n8n-manager`.

## Local AI Context Test

```bash
cd /home/etienne/repos/n8n-ecosystem-dev
pnpm dev:test:ai-context
```

This generates an isolated `.dev-state/ai-context-workspace/AGENTS.md` and fails if it still contains the published `npx --yes n8nac` command while `N8NAC_COMMAND` is set.
