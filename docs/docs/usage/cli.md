---
sidebar_label: CLI
title: CLI Guide
description: Use n8nac for workspace environments, explicit workflow sync, validation, AI context, and automation.
---

# CLI Guide

`n8nac` is the terminal interface for n8n-as-code. It owns workspace environments, workflow sync, validation, AI context, and automation.

Local managed instances, Docker lifecycle, and tunnels belong to `n8n-manager`.

## Install

```bash
npx --yes n8nac <command>
```

Optional global install:

```bash
npm install -g n8nac
```

For prerelease work, keep the CLI and manager on matching tags:

```bash
npx --yes n8nac@next <command>
npx --yes @n8n-as-code/n8n-manager@next <command>
```

:::note Migrating from `@n8n-as-code/cli`
The old package name was `@n8n-as-code/cli`. Remove it if `n8nac --help` shows an outdated command list.

```bash
npm uninstall -g @n8n-as-code/cli
```
:::

## Command Groups

| Group | Command | Purpose |
|---|---|---|
| Primary Usage | `n8nac env` | Workspace environments |
| Workspace Maintenance | `n8nac workspace` | Readiness and unified workspace migration |
| Managed Local Instances | `n8n-manager` | Local managed instances and tunnels |
| Hidden Compatibility | `instance-target`, `target`, `setup`, old `workspace` mutations | Compatibility only |

For a compact overview, see the [Command Glossary](/docs/usage/commands).

## Quick Start

### Remote n8n environment

```bash
n8nac env add Dev --base-url https://n8n.example.com --workflows-path workflows/dev
n8nac env auth set Dev --api-key-stdin
n8nac env use Dev
n8nac update-ai
```

### Local managed instance

```bash
n8n-manager instance list
n8nac env add Local --managed-instance <id> --workflows-path workflows/local
n8nac env use Local
n8nac update-ai
```

### First workflow loop

```bash
n8nac list
n8nac pull <workflow-id>
n8nac push workflows/dev/my-workflow.workflow.ts --verify
```

## `env`

Use `env` for normal workspace configuration.

```bash
n8nac env list
n8nac env status
n8nac env add Dev --base-url <url> --workflows-path workflows/dev
n8nac env add Local --managed-instance <id> --workflows-path workflows/local
n8nac env use Dev
n8nac env auth set Dev --api-key-stdin
n8nac env remove Dev
```

### Remote environments

Remote environments store the URL in `n8nac-config.json`, but the API key stays local.

```bash
n8nac env add Staging --base-url https://staging.example.com --workflows-path workflows/staging
n8nac env auth set Staging --api-key-stdin
```

### Local managed instance environments

These workspace environments reference a local `n8n-manager` instance.

```bash
n8n-manager instance list
n8nac env add Local --managed-instance <id> --workflows-path workflows/local
```

The workspace does not copy Docker paths, tunnel state, logs, or local secrets.

## `workspace`

Use `workspace` for inspection and explicit migrations only.

```bash
n8nac workspace status
n8nac workspace migrate --json
n8nac workspace migrate --write
```

`migrate --json` is the dry-run for legacy config models and reports one unified `operations` list. `migrate --write` applies all required migration operations together.

## Sync Commands

### `list`

```bash
n8nac list
n8nac list --local
n8nac list --remote
n8nac list --search billing
n8nac list --sort name
n8nac list --raw
```

Status values:

| Status | Meaning |
|---|---|
| `TRACKED` | Local and remote workflow exist and are aligned |
| `CONFLICT` | Both sides changed since the last synced base |
| `EXIST_ONLY_LOCALLY` | Local workflow has not been pushed |
| `EXIST_ONLY_REMOTELY` | Remote workflow has not been pulled |

### `find`

```bash
n8nac find billing
n8nac find wf-123 --raw
n8nac find importer --limit 10
```

### `pull`

```bash
n8nac pull <workflow-id>
```

Pull downloads one workflow and refuses to overwrite when a conflict is detected.

### `push`

```bash
n8nac push workflows/dev/my-workflow.workflow.ts
n8nac push workflows/dev/my-workflow.workflow.ts --verify
```

Push uploads one local workflow and uses optimistic concurrency checks.

### `promote`

```bash
n8nac promote workflows/dev/my-workflow.workflow.ts --from Dev --to Prod --dry-run
n8nac promote workflows/dev/my-workflow.workflow.ts --from Dev --to Prod
n8nac promote --from Dev --to Prod --dry-run
n8nac promote --from Dev --to Prod --no-push
n8nac promote --from Dev --to Prod --promotion-config config/promotion.json --json
```

Promote copies TypeScript workflows from one workspace environment to another, adapts them for the target environment, and pushes them to n8n unless `--no-push` is used.

The positional path is optional:

- With a path, `promote` handles one `*.workflow.ts` file inside the source environment `workflowsPath`.
- Without a path, `promote` recursively finds all non-hidden `*.workflow.ts` files in the source environment `workflowsPath` and preserves their relative paths in the target environment.

Promotion adapts workflows before writing or pushing:

- target project metadata is rewritten to the target environment project
- source workflow IDs and archived/home-project metadata are removed for new target workflows
- known target workflow IDs are reused for updates
- credential references are remapped by saved binding, explicit override, or unique target credential match by type and name
- supported Execute Workflow references are remapped by saved binding, source workflow relation, explicit override, or unique target workflow name match

Promotion stores discovered source-to-target bindings in `n8nac-promotion.json` by default. Existing bindings are reused first, target inventory discovery is used for initial create/update planning, and missing or ambiguous references block promotion before push.

Options:

| Option | Effect |
|---|---|
| `--from <environment>` | Source environment name or ID |
| `--to <environment>` | Target environment name or ID |
| `--dry-run` | Show the planned promotion without writing workflow files, pushing, or saving bindings |
| `--no-push` | Write adapted files to the target `workflowsPath` without pushing them to n8n |
| `--overwrite` | Replace an existing local target file when no target workflow ID is known |
| `--promotion-config <path>` | Read and write promotion bindings from a custom config path |
| `--json` | Print the promotion result as JSON |

`--dry-run` still reads the target workflow inventory so the plan can report `create` vs `update` accurately. It does not write local workflow files, call push, or update `n8nac-promotion.json`.

The promotion config has a stable v1 shape:

```json
{
  "version": 1,
  "routes": {
    "Dev->Prod": {
      "bindings": {
        "workflows": {
          "source-workflow-id": "target-workflow-id"
        },
        "credentials": {
          "source-credential-id": "target-credential-id"
        }
      },
      "workflowOverrides": {},
      "credentialOverrides": {},
      "nameRules": []
    }
  }
}
```

Use overrides when a target name is ambiguous or intentionally different:

```json
{
  "version": 1,
  "routes": {
    "Dev->Prod": {
      "workflowOverrides": {
        "source-workflow-id": { "targetId": "prod-workflow-id" },
        "Source Workflow Name": { "targetName": "Production Workflow Name" }
      },
      "credentialOverrides": {
        "httpBasicAuth::source-credential-id": { "targetId": "prod-credential-id" },
        "httpBasicAuth::Shared Credential": { "targetName": "Production Credential" }
      },
      "nameRules": [
        { "kind": "workflow", "from": " Dev$", "to": " Prod" },
        { "kind": "credential", "from": " Dev$", "to": " Prod" }
      ]
    }
  }
}
```

Promotion does not create credentials in the target environment. Create or map target credentials first, or use `n8nac credentials ...` helpers. After a pushed single-workflow promotion, the CLI prints a `workflow credential-required` command so you can check target credential readiness.

### `resolve`

```bash
n8nac resolve <workflow-id> --mode keep-current
n8nac resolve <workflow-id> --mode keep-incoming
```

- `keep-current`: keep the local version and force-push it.
- `keep-incoming`: keep the remote version and force-pull it.

## Runtime Facade Commands

These commands operate through the active environment and n8n API.

```bash
n8nac verify <workflow-id>
n8nac workflow present <workflow-id> --json
n8nac workflow credential-required <workflow-id> --json
n8nac workflow activate <workflow-id>
n8nac test-plan <workflow-id> --json
n8nac test <workflow-id> --data '{"foo":"bar"}'
n8nac execution list --workflow-id <workflow-id> --limit 5 --json
n8nac execution get <execution-id> --include-data --json
```

Credential readiness:

```bash
n8nac credentials recipes
n8nac credentials starter-kits
n8nac credentials inventory --json
n8nac credentials ensure http-bearer --value token=... --json
n8nac credentials test http-bearer --json
n8nac credentials delete http-bearer --json
```

Low-level credential API helpers:

```bash
n8nac credential schema openAiApi
n8nac credential create --type openAiApi --name "My OpenAI" --file cred.json --json
n8nac credential list --json
```

Prefer `--file` over inline secret values so secrets do not end up in shell history.

## AI Context And Skills

```bash
n8nac update-ai
n8nac skills search "google sheets"
n8nac skills node-info googleSheets
n8nac skills validate workflows/dev/my-workflow.workflow.ts
```

`update-ai` refreshes local context files for agents, including `AGENTS.md`, VS Code agent files, portable skills, snippets, and schemas.

## Conversion

```bash
n8nac convert workflow.json --format typescript
n8nac convert workflow.workflow.ts --format json
n8nac convert-batch workflows/ --format typescript
```

## Workspace Config

Current config is environment-based and safe to commit when it contains no secrets:

```json
{
  "version": 4,
  "activeEnvironmentId": "dev",
  "environments": [
    {
      "id": "dev",
      "name": "Dev",
      "environmentTargetId": "dev",
      "projectId": "personal",
      "projectName": "Personal",
      "workflowsPath": "workflows/dev"
    }
  ],
  "environmentTargets": [
    {
      "id": "dev",
      "name": "Dev",
      "kind": "external-instance",
      "url": "https://n8n.example.com"
    }
  ]
}
```

API keys are stored locally with `n8nac env auth set <env> --api-key-stdin`.

`workflowsPath` is generated from the environment name when the environment is created. It is stable after creation, so changing the environment display name, target instance, or target project does not move the workflow directory. When `workflowsPath` is changed explicitly, n8nac moves existing workflow files to the new directory when the destination is empty. Legacy `workflowDir`, `syncFolder`, and `syncSlug` config values are still accepted for compatibility.

In config examples, `kind: "external-instance"` is the persisted target kind for a remote n8n URL. Prefer the user-facing term "remote n8n environment" outside raw config discussions.

## Scripting Example

```bash
#!/bin/bash
set -euo pipefail

printf '%s' "$STAGING_N8N_API_KEY" | n8nac env auth set Staging --api-key-stdin
n8nac env use Staging
n8nac list --raw
n8nac push workflows/staging/my-workflow.workflow.ts --verify
```

For multiple remote environments, create one environment per target and switch with `n8nac env use <name>`.

## Compatibility Commands

These commands may remain callable for old scripts, but new docs and workflows should not use them as primary setup:

```bash
n8nac instance-target ...
n8nac target ...
n8nac setup ...
n8nac setup-modes ...
n8nac workspace pin-instance ...
n8nac workspace set-sync-folder ...
n8nac workspace set-project ...
```

## Troubleshooting

Check the active context:

```bash
n8nac env list
n8nac env status
n8nac workspace migrate --json
```

Refresh a remote API key:

```bash
n8nac env auth set <environment> --api-key-stdin
```

See [Troubleshooting](/docs/troubleshooting) for more fixes.
