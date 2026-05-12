---
sidebar_position: 7
title: OpenClaw Plugin
description: Install the n8n-as-code OpenClaw plugin and use the same n8n environments model as the CLI and VS Code extension.
---

# OpenClaw Plugin

The `@n8n-as-code/n8nac` package gives OpenClaw the same portable `n8n-manager` and `n8n-architect` skills used by Claude, Cursor, VS Code workspaces, and generic coding agents.

## Install

```bash
openclaw plugins install @n8n-as-code/n8nac
openclaw n8nac:setup
openclaw gateway restart
```

If you previously installed `@n8n-as-code/openclaw-plugin`, uninstall the old package first:

```bash
openclaw plugins uninstall n8nac
openclaw plugins install @n8n-as-code/n8nac
```

## Model

OpenClaw uses the same command split as every other surface:

| Group | Command | Purpose |
|---|---|---|
| Primary Usage | `n8nac env` | Workspace environments |
| Workspace Maintenance | `n8nac workspace` | Readiness and unified workspace migration |
| Managed Local Instances | `n8n-manager` | Local managed instances and tunnels |

## Workspace

OpenClaw stores its working files under:

```text
~/.openclaw/n8nac/
  n8nac-config.json
  AGENTS.md
  .agents/skills/
  workflows/
```

`n8nac-config.json` stores workspace environments. API keys and local managed instance state stay outside the committed workspace.

## Manual Equivalent

```bash
n8nac env add Dev --base-url <url> --sync-folder workflows/dev
n8nac env auth set Dev --api-key-stdin
n8nac env use Dev
n8nac update-ai
```

For a local managed instance:

```bash
n8n-manager instance list
n8nac env add Local --managed-instance <id> --sync-folder workflows/local
```

## Agent CLI Flow

Agents use normal shell commands:

```bash
n8nac env status
n8nac list
n8nac pull <workflow-id>
n8nac push <path-to-workflow.workflow.ts> --verify
n8nac skills node-info <node-name>
```

## Troubleshooting

Reset and start over:

```bash
rm -rf ~/.openclaw/n8nac
openclaw n8nac:setup
openclaw gateway restart
```

## Related

- [Getting Started](/docs/getting-started)
- [Claude Plugin](/docs/usage/claude-plugin)
- [CLI Guide](/docs/usage/cli)
