---
sidebar_position: 1
title: V1 to V2 Migration
description: Upgrade an existing n8n-as-code workspace to the V2 manager-backed configuration model.
---

# V1 to V2 Migration

V2 changes how n8n-as-code stores runtime configuration. The workflow files stay in your repository, but instances and API keys move to `n8n-manager` so the CLI, VS Code extension, MCP, and agent integrations all use the same local runtime state.

## What Changed

| V1 behavior | V2 behavior |
|:---|:---|
| Workspace config could contain instance details and API keys | `n8n-manager` stores global instances and API keys outside the repository |
| The VS Code extension owned most setup state itself | VS Code delegates auth, instances, projects, tunnels, and runtime state to `n8n-manager` |
| Generated AI context focused on `AGENTS.md` and portable skills | `update-ai` also generates VS Code/Copilot workspace agents in `.github/agents/*.agent.md` |
| Project setup was mostly per-surface | CLI, VS Code, and agents resolve the same effective workspace context |

## Recommended Upgrade

Run the migration command from the root of each workflow repository:

```bash
n8nac workspace migrate-v1
```

The default mode is a dry run. It reports detected legacy instances, workspace overrides, and whether embedded API keys are present without changing files.

When the output looks correct, apply it:

```bash
n8nac workspace migrate-v1 --write
n8nac workspace status --json
n8nac update-ai
```

`--write` creates a timestamped backup next to the original file before replacing `n8nac-config.json` with V2 workspace overrides.

## What Gets Migrated

- Legacy instance name, ID, and URL become local `n8n-manager` instances.
- Embedded API keys, if present, move into the local `n8n-manager` secret store.
- Sync folder, project ID, project name, custom nodes path, and folder sync become workspace overrides in `n8nac-config.json`.
- The active or pinned instance remains pinned for that workspace when possible.

The migrated `n8nac-config.json` should not contain API keys or embedded instance arrays.

## If No API Key Is Found

Some legacy setups did not store the API key in `n8nac-config.json`. After migration, re-authenticate explicitly:

```bash
n8n-manager auth set --url <n8n-url> --api-key-stdin --name <name>
n8n-manager instances list
n8nac workspace pin-instance --instance-id <instance-id>
n8nac workspace status --json
```

## Instance IDs

In V2, the instance ID is a local `n8n-manager` record ID. It identifies your local connection profile, not the shared n8n server itself.

Two developers can connect to the same n8n URL and have different local instance IDs. That is expected. Commit only workspace-safe overrides; do not commit `~/.n8n-manager` or any repo-local manager store.

When communicating with teammates, use human-friendly values first:

- n8n URL
- project name
- sync folder
- workspace name

Use the instance ID only for local commands such as `n8nac workspace pin-instance --instance-id <id>`.

## VS Code Agents

After migration, refresh generated AI context:

```bash
n8nac update-ai
```

This creates:

- `AGENTS.md` for repository-level bootstrap instructions.
- `.github/agents/n8n-manager.agent.md` and `.github/agents/n8n-architect.agent.md` for VS Code/GitHub Copilot-compatible workspace agents.
- `.agents/skills/.../SKILL.md` as portable fallbacks for agent runtimes that understand skills but not VS Code workspace agents.

## Rollback

The migration command creates a backup such as:

```text
n8nac-config.v1-backup-20260508-105500.json
```

To inspect or restore manually, compare that file with the new `n8nac-config.json`. Do not commit API keys from the backup.

## Future Breaking Changes

For future major changes, read the release notes before upgrading and run the documented migration command first. Major configuration moves should always provide a dry-run path, a backup, and a verification command.
