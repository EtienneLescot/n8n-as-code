---
sidebar_position: 10
title: n8n-manager
description: Use n8n-manager for local managed instances, Docker lifecycle, tunnels, and machine-local state.
---

# n8n-manager

`n8n-manager` owns **local managed instances**: local managed n8n instances, Docker lifecycle, tunnels, and machine-local state.

It is not the workspace source of truth. Workspace environments belong to `n8nac env`.

## Responsibilities

| Concern | Owner |
|---|---|
| Workspace environments | `n8nac env` |
| Readiness and unified workspace migration | `n8nac workspace` |
| Local managed instances | `n8n-manager` |
| Docker start/stop/remove | `n8n-manager` |
| Tunnels for local instances | `n8n-manager` |
| Remote environment API keys | `n8nac env auth` or extension local storage |

## Typical Commands

```bash
n8n-manager instance list
n8n-manager instance create
n8n-manager instance start <id>
n8n-manager instance stop <id>
n8n-manager instance remove <id>
n8n-manager tunnel start <id>
n8n-manager tunnel stop <id>
```

Then attach a local managed instance to the workspace with `n8nac env`:

```bash
n8nac env add Local --managed-instance <id> --workflows-path workflows/local
n8nac env use Local
```

## What Goes In Git

Commit:

- workflow files
- `n8nac-config.json` environment mappings
- generated AI context when your team wants shared agent instructions

Do not commit:

- API keys
- `n8n-manager` local store
- Docker state
- tunnel state
- logs

## Remote n8n Instances

For an existing n8n Cloud or self-hosted URL, you usually do not need `n8n-manager`:

```bash
n8nac env add Staging --base-url https://staging.example.com --workflows-path workflows/staging
n8nac env auth set Staging --api-key-stdin
```

The URL is workspace-safe. The API key is local.

## VS Code

In VS Code, use:

- **n8n environments** for workspace configuration
- **Managed local instances** for local managed instances only

Adding or removing a workspace environment does not delete a managed local instance.

## Storage

`n8n-manager` storage is machine-local. Exact paths can vary by platform and manager version, but the rule is stable: do not commit manager storage.

Use commands rather than editing manager files by hand.

## Related

- [CLI Guide](/docs/usage/cli)
- [VS Code Extension](/docs/usage/vscode-extension)
- [Getting Started](/docs/getting-started)
