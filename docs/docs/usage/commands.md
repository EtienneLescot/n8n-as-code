---
sidebar_label: Commands
title: Command Glossary
description: Quick reference for the n8n-as-code command groups and when to use each one.
---

# Command Glossary

Use this page when you need to choose the right command family.

## Rule Of Thumb

| Need | Use |
|---|---|
| Configure how this repository connects to n8n | `n8nac env` |
| Inspect readiness or migrate workspace config | `n8nac workspace` |
| Create, start, stop, or tunnel a local managed instance | `n8n-manager` |
| Maintain old scripts only | compat hidden commands |

## Primary Usage

`n8nac env` manages workspace environments.

```bash
n8nac env list
n8nac env status
n8nac env add <name> --base-url <url> --workflows-path <path>
n8nac env add <name> --managed-instance <id> --workflows-path <path>
n8nac env use <environment>
n8nac env auth set <environment> --api-key-stdin
n8nac env remove <environment>
```

Use it for:

- remote n8n URLs
- local API-key binding for remote environments
- managed local instance references
- project and workflowsPath context
- active environment selection

## Workspace Maintenance

`n8nac workspace` is for readiness and unified workspace migration.

```bash
n8nac workspace status
n8nac workspace migrate --json
n8nac workspace migrate --write
```

Use `migrate --json` as the dry-run for legacy config models. It reports one `operations` list and `migrate --write` applies all required migration operations together.

## Managed Local Instances

`n8n-manager` manages local machine resources.

```bash
n8n-manager instance list
n8n-manager instance create
n8n-manager instance start <id>
n8n-manager instance stop <id>
n8n-manager instance remove <id>
n8n-manager tunnel start <id>
n8n-manager tunnel stop <id>
```

Use it only for local managed instances, Docker lifecycle, and tunnels. Do not use it as the repository source of truth.

## Workflow Sync

After an environment exists, normal workflow operations stay in `n8nac`:

```bash
n8nac list
n8nac pull <workflow-id>
n8nac push <path-to-workflow.workflow.ts> --verify
n8nac promote --from Dev --to Prod --dry-run
n8nac resolve <workflow-id> --mode keep-current
n8nac resolve <workflow-id> --mode keep-incoming
```

## AI Context And Skills

```bash
n8nac update-ai
n8nac skills search "google sheets"
n8nac skills node-info googleSheets
n8nac skills validate workflows/dev/my-workflow.workflow.ts
```

## Hidden Compatibility

These commands may remain callable for old scripts, but they are not first-level user flows:

```bash
n8nac instance-target ...
n8nac target ...
n8nac setup ...
n8nac setup-modes ...
n8nac workspace pin-instance ...
n8nac workspace set-sync-folder ...
n8nac workspace set-project ...
```

Prefer `n8nac env` for all new workspace configuration.
