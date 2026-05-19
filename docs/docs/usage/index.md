---
sidebar_position: 1
title: Usage
description: Guides for using n8n-as-code with n8n environments, VS Code, CLI, n8n-manager, Claude, and OpenClaw.
---

# Usage

n8n-as-code uses one workflow model across all surfaces: workspace environments, explicit sync, local AI context, and local managed instances when you need them.

## Command Groups

| Group | Command | Purpose |
|---|---|---|
| Primary Usage | `n8nac env` | Workspace environments and active sync context |
| Workspace Maintenance | `n8nac workspace` | Readiness and unified workspace migration |
| Managed Local Instances | `n8n-manager` | Local managed instances, Docker, tunnels |
| Hidden Compatibility | old `target`, `setup`, and workspace mutation commands | Compatibility only |

[Command Glossary](/docs/usage/commands)

## VS Code / Cursor Extension

The recommended experience. It provides the n8n sidebar, embedded canvas, explicit sync controls, `n8n environments`, and the integrated Agent Workbench.

[VS Code Extension Guide](/docs/usage/vscode-extension)

## CLI

Use the CLI for scripts, CI, and direct terminal workflows:

```bash
n8nac env add Dev --base-url <url> --workflows-path workflows/dev
n8nac env auth set Dev --api-key-stdin
n8nac env use Dev
n8nac list
n8nac pull <workflow-id>
n8nac push workflows/dev/my-workflow.workflow.ts --verify
```

[CLI Guide](/docs/usage/cli)

## n8n-manager

Use `n8n-manager` for local managed instances only: create, start, stop, remove, and expose through tunnels.

[n8n-manager Guide](/docs/usage/n8n-manager)

## Claude Plugin

Use the same n8n skills in Claude Code or connect Claude Desktop through MCP.

[Claude Plugin Guide](/docs/usage/claude-plugin)

## Generic Agent Skills

Install the portable skills from:

```text
https://github.com/EtienneLescot/n8n-as-code/tree/main/skills
```

If your agent asks for an explicit skill path, use `skills/n8n-architect`.

[Skills Reference](/docs/usage/skills)

## OpenClaw Plugin

Install the OpenClaw plugin for portable n8n skills, workspace setup, and natural-language workflow work.

[OpenClaw Plugin Guide](/docs/usage/openclaw)

## TypeScript Workflows

An optional decorator-based format that is easier for humans and agents to read, diff, and edit.

[TypeScript Workflows Guide](/docs/usage/typescript-workflows)
