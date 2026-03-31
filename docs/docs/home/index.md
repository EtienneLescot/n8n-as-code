---
sidebar_position: 1
title: Home
description: Welcome to n8n-as-code — manage your n8n workflows as code with Git, AI agents, and your favorite editor.
slug: /
---

# Welcome to n8n-as-code

**n8n-as-code** lets you manage your n8n workflows like real code: edit them locally, version them with Git, sync them explicitly, and let AI agents build or fix them for you.

## How It Works

1. **Connect** to your n8n instance (cloud or self-hosted)
2. **Pull** workflows to your local workspace
3. **Edit** them in VS Code, or let an AI agent do the work
4. **Push** your changes back to n8n when you're ready
5. **Version** everything with Git for history, review, and collaboration

No surprise auto-sync. You control when changes move.

## Choose Your Entry Point

| If you use… | Start here |
|---|---|
| **VS Code / Cursor** | [VS Code Extension](/docs/usage/vscode-extension) — visual editing, status tree, push/pull from the sidebar |
| **Claude Code / Claude Desktop** | [Claude Plugin](/docs/usage/claude-plugin) — ask Claude to create, edit, or fix workflows for you |
| **OpenClaw** | [OpenClaw Plugin](/docs/usage/openclaw) — same AI workflow experience inside OpenClaw |
| **Terminal / CI** | [CLI](/docs/usage/cli) — automation, scripting, and CI/CD pipelines |

Or jump straight to the [Getting Started guide](/docs/getting-started) for step-by-step setup.

## Key Features

- **Git-like sync** — explicit `list`, `pull`, `push`, `resolve` commands. You decide when to sync.
- **3-way conflict detection** — only flags real conflicts (both sides changed). No false positives.
- **TypeScript workflows** — optional decorator-based format for better readability and AI compatibility. [Learn more →](/docs/usage/typescript-workflows)
- **AI-powered workflow creation** — Claude, Cursor, and other AI agents can create, update, and fix workflows using built-in n8n knowledge (500+ node schemas, documentation, community examples).
- **VS Code integration** — tree view with status indicators, split view with n8n canvas, and a config screen for saving and activating instance configs per workspace.
- **Multi-instance support** — keep multiple saved n8n instance configs in one workspace while working against one active instance at a time.

## Quick Start

```bash
# Install
npm install -g n8nac

# Save an instance config and select a project
n8nac init

# See all workflows and their sync status
n8nac list

# Pull a workflow to edit locally
n8nac pull <workflowId>

# Push your changes back
n8nac push workflows/instance/project/my-workflow.workflow.ts
```

Or install the **VS Code extension** and do everything from the sidebar. See [Getting Started](/docs/getting-started) for the full walkthrough.

## Documentation

- [**Getting Started**](/docs/getting-started) — Installation, setup, and first sync
- [**Usage Guides**](/docs/usage) — VS Code, Claude, OpenClaw, CLI, TypeScript workflows
- [**Troubleshooting**](/docs/troubleshooting) — Common issues and fixes
- [**Community**](/docs/community) — GitHub Discussions, issues, and contributions
- [**Contribution**](/docs/contribution) — Architecture, dev setup, and internal packages

## Get Involved

n8n-as-code is open source (MIT).

- [Report a bug](https://github.com/EtienneLescot/n8n-as-code/issues)
- [Request a feature or ask a question](https://github.com/EtienneLescot/n8n-as-code/discussions)
- [Contribute](https://github.com/EtienneLescot/n8n-as-code/blob/main/CONTRIBUTING.md)
