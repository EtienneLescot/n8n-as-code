---
sidebar_label: Local Dev Workspace
title: Local Dev Workspace
description: Test n8n-as-code facades against local n8nac and n8n-manager builds.
---

# Local Dev Workspace

Published agent instructions intentionally use `npx --yes n8nac` by default. This is required for VS Code, Cursor, MCP clients, and agent environments where the `n8nac` binary is not installed globally.

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

Generated `AGENTS.md` and skill prompts resolve the `n8nac` command in this order:

1. `--cli-cmd`
2. `N8NAC_COMMAND`
3. `.n8nac-dev.json` in the target workspace
4. published fallback: `npx --yes n8nac`

This keeps production and extension behavior safe while making local dev reproducible.

The helper repository is optional for normal package work in this repo, but it is the recommended path for end-to-end facade testing across `n8n-as-code` and `n8n-manager`.

## Local AI Context Test

```bash
cd /home/etienne/repos/n8n-ecosystem-dev
pnpm dev:test:ai-context
```

This generates an isolated `.dev-state/ai-context-workspace/AGENTS.md` and fails if it still contains the published `npx --yes n8nac` command while `N8NAC_COMMAND` is set.
