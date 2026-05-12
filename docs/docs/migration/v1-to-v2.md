---
sidebar_position: 1
title: Workspace Migration
description: Migrate legacy n8n-as-code workspace and instance config to workspace environments.
---

# Workspace Migration

Current n8n-as-code workspaces use **workspace environments** as the source of truth.

Legacy V1/V2 configs can contain old workspace instance data, global instance references, or API keys. Migrate them explicitly; n8n-as-code does not rewrite the workspace automatically on open.

## Commands

Dry run:

```bash
n8nac workspace migrate --json
```

Apply:

```bash
n8nac workspace migrate --write
```

Then verify:

```bash
n8nac workspace migrate --json
n8nac env status --json
```

The dry-run and verification output use a single migration report. Review the `operations` array to see what will change, then apply everything with one `--write` command when you are ready. Do not run separate migration commands for legacy workspace data and global instance data.

## What Changes

| Legacy config | New model |
|---|---|
| Direct instance fields in workspace config | Workspace environment in `n8nac-config.json` |
| Embedded URL | Remote n8n URL environment target |
| Global managed instance reference | Local managed instance environment target reference |
| Embedded API key | Local API key storage |
| Sync folder | Environment sync folder |
| Old active instance | Active environment |

The migrated `n8nac-config.json` should be safe to commit when it contains no secrets.

## API Keys

If the migration cannot recover an API key, set it locally after migration:

```bash
n8nac env auth set <environment> --api-key-stdin
```

## Backups

`--write` applies the full migration atomically and creates a backup next to the original config before replacing `n8nac-config.json`.

Do not commit backup files if they contain API keys.

The persisted config still uses internal target kind literals such as `external-instance` for remote n8n URL targets and `managed-instance` for local managed instance references. User-facing commands and UI describe those as remote n8n environments and local managed instances.

## V1 Packages

If you still need the V1 product line, pin all commands to `n8nac@v1` and install the legacy VSIX from GitHub Releases instead of Marketplace/Open VSX.
