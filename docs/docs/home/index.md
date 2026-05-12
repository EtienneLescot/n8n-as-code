---
sidebar_position: 1
title: Home
description: n8n-as-code gives VS Code, Cursor, terminals, and AI agents a single workspace environments model for workflow development.
slug: /
---

# n8n-as-code

**n8n-as-code** is the n8n workspace for AI agents. It lets you build, edit, sync, deploy, test, and debug workflows from local files while staying connected to real n8n instances.

The product model is intentionally small:

| Group | Command | Use it for |
|---|---|---|
| Primary Usage | `n8nac env` | Workspace environments: remote n8n URL or local managed instance, project, sync folder, active environment |
| Workspace Maintenance | `n8nac workspace` | Readiness and unified workspace migration |
| Managed Local Instances | `n8n-manager` | Local managed instances, Docker lifecycle, tunnels, machine-local state |

## How It Works

1. Create or select an **n8n environment** for the workspace.
2. Pull or create workflow files in that environment's sync folder.
3. Ask the Agent to build, refactor, explain, validate, or fix workflows.
4. Push intentionally, provision credentials, activate, run, and inspect executions.
5. Commit workflow files and workspace-safe `n8nac-config.json` changes.

## Choose Your Entry Point

| If you use... | Start here |
|---|---|
| VS Code / Cursor | [VS Code Extension](/docs/usage/vscode-extension) - visual workflow workspace and integrated Agent Workbench |
| Terminal / CI | [CLI](/docs/usage/cli) - `n8nac env`, sync, validation, AI context, automation |
| Managed local instances | [n8n-manager](/docs/usage/n8n-manager) - Docker instances, tunnels, local machine state |
| Claude Code / Claude Desktop | [Claude Plugin](/docs/usage/claude-plugin) - n8n skills and MCP-backed workflow work |
| Generic coding agents | [Skills Reference](/docs/usage/skills) - portable n8n skills |
| OpenClaw | [OpenClaw Plugin](/docs/usage/openclaw) - portable n8n skills inside OpenClaw |

## Quick Start

### VS Code / Cursor

Install the extension, open the `n8n` view, run `n8n: Configure`, and create an `n8n environment`.

### CLI

```bash
n8nac env add Dev --base-url https://n8n.example.com --sync-folder workflows/dev
n8nac env auth set Dev --api-key-stdin
n8nac env use Dev
n8nac update-ai
```

Then sync explicitly:

```bash
n8nac list
n8nac pull <workflow-id>
n8nac push workflows/dev/my-workflow.workflow.ts --verify
```

## Documentation

- [Getting Started](/docs/getting-started) - first workspace setup
- [Usage Guides](/docs/usage) - VS Code, CLI, Claude, OpenClaw, n8n-manager, and TypeScript workflows
- [Troubleshooting](/docs/troubleshooting) - common issues and fixes
- [Community](/docs/community) - GitHub Discussions, issues, and contributions
- [Contribution](/docs/contribution) - development setup and internals
