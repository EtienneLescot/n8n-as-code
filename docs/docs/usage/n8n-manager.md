---
sidebar_position: 10
title: n8n-manager
description: Understand n8n-manager — the independent runtime engine that powers n8n-as-code facades.
---

# n8n-manager

`n8n-manager` is an **independent runtime engine** that owns all n8n instance management, authentication, managed Docker runtime, tunnels, projects, credentials infrastructure, and workflow presentation. It is a separate repository that `n8n-as-code` facades delegate to.

## What n8n-manager Owns

| Concern | Details |
|:--------|:--------|
| **Instance management** | Register, list, select, delete n8n instances |
| **Authentication** | Store and manage API keys securely |
| **Managed Docker runtime** | Create local n8n instances via Docker |
| **Public tunnels** | Expose local instances via public URLs for webhooks/triggers |
| **Projects** | List and select n8n projects per instance |
| **Credentials infrastructure** | Credential recipes, starter kits, inventory |
| **Workflow presentation** | Generate shareable/presentable workflow URLs |

## Architecture Relationship

```
n8n-as-code (facades: CLI, VS Code, MCP, Claude, OpenClaw)
       │
       ├── workflow-core / skills / transformer ──► Workflow intelligence
       │
       └── manager-adapter ──────────────────────► n8n-manager (runtime engine)
```

- `n8n-manager` is **independent** — it does not depend on `n8n-as-code`
- Facades use `n8n-manager` through the `@n8n-as-code/manager-adapter` package
- The CLI (`n8nac`) wraps both engines: workflow commands through its own engine, runtime/instance commands through `n8n-manager`

## n8n-manager Commands

These are the commands you interact with when managing the runtime side of n8n-as-code:

### Instance Management

```bash
# List all registered n8n-manager instances
n8n-manager instances list

# Add a new instance (managed local Docker)
n8n-manager instances add --name <name> --mode managed-local-docker

# Add a remote/existing instance
n8n-manager auth set --url <url> --api-key-stdin --name <name>

# Check instance status
n8n-manager instances status <id-or-name>

# Start/stop a managed local instance
n8n-manager instances start <id-or-name>
n8n-manager instances stop <id-or-name>
```

### Tunnels (Managed Local Docker)

```bash
# Check tunnel status
n8n-manager instances tunnel status <id-or-name>

# Start a public tunnel
n8n-manager instances tunnel start <id-or-name>

# Refresh tunnel URL
n8n-manager instances tunnel refresh <id-or-name>
```

### Authentication

```bash
# Set credentials for an existing n8n instance
n8n-manager auth set --url <url> --api-key-stdin --name <name>

# Test connection
n8n-manager auth test --instance <id-or-name>
```

### Projects

```bash
# List projects on an instance
n8n-manager projects list --instance <id-or-name>

# Select default project
n8n-manager projects select <project-id-or-name> --instance <id-or-name>
```

## How Facades Use n8n-manager

### CLI (`n8nac`)

The `n8nac` CLI is a facade that orchestrates both engines:

```bash
# n8n-manager handles instance/auth setup
n8n-manager auth set --url <url> --api-key-stdin
n8n-manager projects select <project-id-or-name>

# n8nac handles workspace and workflow commands
n8nac workspace set-sync-folder workflows
n8nac list
n8nac pull <workflowId>
n8nac push workflows/my-workflow.workflow.ts
```

### VS Code Extension

The VS Code extension uses `n8n-manager` for:
- Global instance registration and selection via the Configure screen
- API key storage (in `~/.n8n-manager/`, not in workspace config)
- Tunnel management for local managed instances

### Credentials via Facades

Credential operations are exposed through the facade-level `credentials` command group:

```bash
# List available credential recipes
n8nac credentials recipes

# List starter credential kits
n8nac credentials starter-kits

# Check local credential readiness
n8nac credentials inventory

# Ensure a credential is ready
n8nac credentials ensure http-bearer --value token=...

# Test a credential
n8nac credentials test http-bearer
```

## Setup Modes

All n8n-as-code facades expose the same setup choice:

```
How do you want to use n8n?

[Recommended] Create and manage a local n8n automatically
[Connect an existing n8n]
[Use generation-only mode]
```

### Managed Local Docker

The facade delegates to `n8n-manager` to:
1. Create a Docker container running n8n
2. Set up tunnel if public access is needed
3. Handle instance lifecycle (start/stop/restart)

```bash
n8n-manager instances add --name my-local --mode managed-local-docker
n8n-manager instances setup my-local
n8n-manager instances start my-local
```

### Connect Existing

Use your existing n8n instance (cloud or self-hosted):

```bash
n8n-manager auth set --url <url> --api-key-stdin --name my-instance
```

### Generation-Only

Use workflow intelligence without runtime features:

```bash
n8nac setup --mode generation-only
```

## Data Storage

| Data | Location |
|:-----|:---------|
| Instance configs | `~/.n8n-manager/instances.json` |
| API keys | `~/.n8n-manager/credentials/` (encrypted) |
| Tunnel state | `~/.n8n-manager/tunnels/` |
| Workspace overrides | `n8nac-config.json` (in workspace, safe to commit) |

**Never edit these files by hand.** Always use the documented `n8n-manager` and `n8nac workspace` commands.

## Related Documentation

- [CLI Guide](/docs/usage/cli) — full command reference for `n8nac`
- [VS Code Extension](/docs/usage/vscode-extension) — visual facade
- [Getting Started](/docs/getting-started) — end-to-end setup
- [Architecture](/docs/contribution/architecture) — internal architecture
