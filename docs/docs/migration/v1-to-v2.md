---
sidebar_position: 1
title: Legacy Migration
description: Migrate legacy n8n-as-code workspace config to n8n environments.
---

# Legacy Migration

Current n8n-as-code workspaces use **n8n environments** as the source of truth.

Legacy V1/V2 configs can contain old workspace instance data or API keys. Migrate them explicitly; n8n-as-code does not rewrite the workspace automatically on open.

## Commands

Dry run:

```bash
n8nac workspace migrate
```

Apply:

```bash
n8nac workspace migrate --write
```

Then verify:

```bash
n8nac env list
n8nac workspace status
```

## What Changes

| Legacy config | New model |
|---|---|
| Direct instance fields in workspace config | Workspace environment in `n8nac-config.json` |
| Embedded URL | Environment target URL |
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

`--write` creates a backup next to the original config before replacing `n8nac-config.json`.

Do not commit backup files if they contain API keys.

## Previous V3 / next Configs

For previous V3 or `next` configs, use upgrade instead of legacy migration:

```bash
n8nac workspace upgrade
n8nac workspace upgrade --write
```

## V1 Packages

If you still need the V1 product line, pin all commands to `n8nac@v1` and install the legacy VSIX from GitHub Releases instead of Marketplace/Open VSX.
