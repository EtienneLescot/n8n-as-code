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

## Global Store And Workspace Overrides

Version 2 separates runtime identity from repository-local workflow context.

`n8n-manager` owns the global runtime store: n8n instances, API keys, managed local runtime state, tunnels, and instance-level project defaults. This store is shared by the CLI, VS Code extension, Claude/OpenClaw skills, MCP-adjacent workflows, and any other facade on the same machine.

Your workflow repository keeps only workspace overrides in `n8nac-config.json`. These overrides are safe to commit because they do not contain API keys. They answer questions such as:

- Which global instance should this repository use?
- Which n8n project should this repository target?
- Which local sync folder should workflow files use?
- Should folder sync or custom node paths be enabled for this workspace?

The effective context is resolved in this order:

1. Explicit command input, such as `--instance` or a command-specific option
2. Workspace overrides from `n8nac-config.json`
3. Global defaults from `n8n-manager`

To pin a repository to one registered global instance, list instances with `n8n-manager`, then write the workspace override with `n8nac`:

```bash
n8n-manager instances list
n8nac workspace pin-instance --instance-id <instance-id>
n8nac workspace set-sync-folder workflows
n8nac workspace status --json
```

`pin-instance` is intentionally an `n8nac workspace` command, not an `n8n-manager` command: it does not create or modify the global instance. It only records that the current workspace should prefer that instance over the global active instance.

The instance ID shown by `n8n-manager instances list` is a local connection profile ID. It is not intended to be the shared identity of the n8n server. Two developers can connect to the same n8n URL and still have different local instance IDs because each machine has its own `n8n-manager` store.

For team documentation, prefer the n8n URL, project name, and sync folder. Use the instance ID only in local commands such as `n8nac workspace pin-instance --instance-id <instance-id>`.

### Migrating a legacy workspace

If an existing `n8nac-config.json` still contains embedded instances, API keys, or a pre-V2 `version`, inspect it with:

```bash
n8nac workspace migrate-v1
```

Apply the migration only after reviewing the dry-run output:

```bash
n8nac workspace migrate-v1 --write
n8nac workspace status --json
```

The migration writes a backup first, moves instance/API-key data into local `n8n-manager` storage, and leaves only workspace-safe overrides in `n8nac-config.json`.

### Repo-local manager store (advanced)

The recommended v2 model is a shared global `n8n-manager` store plus repository-local `n8nac-config.json` overrides. If you need a fully repo-local manager store for a sandbox, set `N8N_MANAGER_HOME` before running both `n8n-manager` and `n8nac`:

```bash
export N8N_MANAGER_HOME="$PWD/.n8n-manager"

n8n-manager instances list
n8nac workspace status --json
```

Do not commit `.n8n-manager/`: it can contain API keys, local runtime state, logs, and tunnel metadata.

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

# n8nac handles workspace overrides and workflow commands
n8nac workspace pin-instance --instance-id <instance-id>
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
| API keys | `~/.n8n-manager/secrets.json` |
| Managed runtime state | `~/.n8n-manager/runtime/` and `~/.n8n-manager/instance.json` |
| Tunnel/log state | `~/.n8n-manager/logs/` and related manager files |
| Workspace overrides | `n8nac-config.json` (in workspace, safe to commit) |

`secrets.json` is written with restrictive file permissions where the platform supports them. Never edit these files by hand. Always use the documented `n8n-manager` and `n8nac workspace` commands.

## Related Documentation

- [CLI Guide](/docs/usage/cli) — full command reference for `n8nac`
- [VS Code Extension](/docs/usage/vscode-extension) — visual facade
- [Getting Started](/docs/getting-started) — end-to-end setup
- [Architecture](/docs/contribution/architecture) — internal architecture
