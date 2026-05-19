---
sidebar_position: 1
title: Getting Started
description: Set up n8n-as-code with workspace environments, VS Code/Cursor, the CLI, and AI agents.
---

# Getting Started

This guide gets you from an empty workspace to an agent-assisted n8n workflow loop.

## Prerequisites

- VS Code, Cursor, Windsurf, or another editor that can install VS Code extensions for the recommended flow.
- A folder or `.code-workspace`.
- An existing n8n Cloud/self-hosted URL and API key, or a local managed instance created with `n8n-manager`.
- Node.js 20 or newer for CLI usage.

## The Model

| Group | Command | Use it for |
|---|---|---|
| Primary Usage | `n8nac env` | Workspace environments |
| Workspace Maintenance | `n8nac workspace` | Readiness and unified workspace migration |
| Managed Local Instances | `n8n-manager` | Local managed instances and tunnels |

An environment stores the workspace-safe context: n8n endpoint, project, sync folder, and active selection. API keys stay local.

## Recommended: VS Code / Cursor

1. Install **n8n-as-code** from the Microsoft Marketplace or Open VSX.
2. Open a folder or `.code-workspace`.
3. Open the `n8n` view.
4. Run **n8n: Configure**.
5. In **n8n environments**, choose `Enter URL and API key` for a remote n8n environment or select a local managed instance.
6. Choose the project and sync folder.
7. Save the environment.

After that, use the sidebar to pull workflows or create a local workflow file, then ask the Agent Workbench for the change you want.

## CLI Setup

### Remote n8n environment

```bash
n8nac env add Dev --base-url https://n8n.example.com --workflows-path workflows/dev
n8nac env auth set Dev --api-key-stdin
n8nac env use Dev
n8nac update-ai
```

### Local managed instance

```bash
n8n-manager instance list
n8nac env add Local --managed-instance <id> --workflows-path workflows/local
n8nac env use Local
n8nac update-ai
```

If you do not have a local managed instance yet:

```bash
n8n-manager instance create
n8n-manager instance start <id>
```

## First Sync

```bash
n8nac list
n8nac pull <workflow-id>
n8nac push workflows/dev/my-workflow.workflow.ts --verify
```

Sync is explicit. The CLI and extension do not silently overwrite local or remote work.

## Workspace Migration

Existing repositories are not rewritten automatically on open.

Inspect and apply required workspace migrations explicitly:

```bash
n8nac workspace migrate --json
n8nac workspace migrate --write
n8nac workspace migrate --json
n8nac env status --json
```

Run the JSON dry-run first and review the unified `operations` list. The `--write` form applies the migration atomically and creates a backup before updating `n8nac-config.json`.

## What Gets Created

```text
your-project/
├── n8nac-config.json
├── AGENTS.md
├── workflows/
│   └── dev/
│       └── my-workflow.workflow.ts
└── .git/
```

- `n8nac-config.json` stores workspace environments and is safe to commit when it contains no secrets.
- API keys stay local through `n8nac env auth` or the extension.
- Local managed instances and tunnel state stay in `n8n-manager` storage.
- `AGENTS.md` gives local coding agents grounded n8n instructions.

## Agent Skills And Plugins

### Claude Code

```text
/plugin marketplace add https://github.com/EtienneLescot/n8n-as-code
/plugin install n8n-as-code@n8nac-marketplace
```

### Generic Agent Skills

```text
https://github.com/EtienneLescot/n8n-as-code/tree/main/skills
```

Use `skills/n8n-architect` if an explicit path is required.

### OpenClaw

```bash
openclaw plugins install @n8n-as-code/n8nac
openclaw n8nac:setup
openclaw gateway restart
```

## Next Steps

- [VS Code Extension](/docs/usage/vscode-extension)
- [CLI Reference](/docs/usage/cli)
- [n8n-manager](/docs/usage/n8n-manager)
- [Claude Plugin](/docs/usage/claude-plugin)
- [OpenClaw Plugin](/docs/usage/openclaw)
- [Troubleshooting](/docs/troubleshooting)
