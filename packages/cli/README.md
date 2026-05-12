# <img src="https://raw.githubusercontent.com/EtienneLescot/n8n-as-code/main/res/logo.png" alt="n8n-as-code logo" width="32" height="32"> n8nac

The command-line interface for n8n-as-code. Use it to define workspace environments, sync workflows, validate changes, generate AI context, and automate CI flows.

`n8nac` does not own local Docker instances or tunnels. Those are managed by `n8n-manager`.

## Installation

```bash
npx --yes n8nac <command>
```

For repeatable automation, pin a version:

```bash
npx --yes n8nac@<version> <command>
```

For prerelease testing, keep every entry point on the same tag:

```bash
npx --yes n8nac@next <command>
npx --yes @n8n-as-code/n8n-manager@next <command>
```

Global install is optional:

```bash
npm install -g n8nac
```

Full documentation: [CLI guide](https://n8nascode.dev/docs/usage/cli/) · [n8n-manager guide](https://n8nascode.dev/docs/usage/n8n-manager/)

## Command Model

| Group | Command | Purpose |
|---|---|---|
| Primary Usage | `n8nac env` | Workspace environments: remote n8n URL or local managed instance, project, sync folder, active environment |
| Workspace Maintenance | `n8nac workspace` | Readiness and unified workspace migration |
| Managed Local Instances | `n8n-manager` | Local managed instances, Docker lifecycle, tunnels, local secrets |
| Hidden Compatibility | `instance-target`, `target`, `setup`, old `workspace` mutations | Compatibility only |

## Workspace Environments

Create a remote n8n environment for an existing n8n URL:

```bash
n8nac env add Dev --base-url https://n8n.example.com --sync-folder workflows/dev
printf '%s' "$N8N_API_KEY" | n8nac env auth set Dev --api-key-stdin
n8nac env use Dev
```

Attach a workspace environment to a local managed instance:

```bash
n8n-manager instance list
n8nac env add Local --managed-instance <id> --sync-folder workflows/local
n8nac env use Local
```

Inspect environments:

```bash
n8nac env list
n8nac env status
n8nac workspace status
```

Remove an environment mapping:

```bash
n8nac env remove Dev
```

Removing a workspace environment does not delete remote workflows, local workflow files, or local managed instances.

## Workspace Migration

Inspect and apply required workspace migrations explicitly:

```bash
n8nac workspace migrate --json
n8nac workspace migrate --write
n8nac workspace migrate --json
n8nac env status --json
```

Dry-run with `--json` first, then apply with `--write` after reviewing the unified `operations` list. Applied migrations create a backup before replacing `n8nac-config.json`.

## Sync Commands

```bash
n8nac list
n8nac pull <workflow-id>
n8nac push workflows/dev/my-workflow.workflow.ts --verify
n8nac resolve <workflow-id> --mode keep-current
n8nac resolve <workflow-id> --mode keep-incoming
```

Sync is Git-like and explicit. `pull` and `push` block on conflicts instead of silently overwriting work.

## Workflow Helpers

```bash
n8nac verify <workflow-id>
n8nac workflow credential-required <workflow-id> --json
n8nac workflow activate <workflow-id>
n8nac test-plan <workflow-id> --json
n8nac test <workflow-id> --data '{"foo":"bar"}'
n8nac execution list --workflow-id <workflow-id> --limit 5 --json
n8nac execution get <execution-id> --include-data --json
```

Credential readiness helpers are exposed through the facade:

```bash
n8nac credentials recipes
n8nac credentials starter-kits
n8nac credentials inventory --json
n8nac credentials ensure http-bearer --value token=... --json
n8nac credentials test http-bearer --json
```

## AI Context And Skills

```bash
n8nac update-ai
n8nac skills search "google sheets"
n8nac skills node-info googleSheets
n8nac skills validate workflows/dev/my-workflow.workflow.ts
```

`update-ai` refreshes `AGENTS.md`, VS Code agent files, portable skill copies, snippets, and schema context used by local agents.

## Conversion

```bash
n8nac convert workflow.json --format typescript
n8nac convert workflow.workflow.ts --format json
n8nac convert-batch workflows/ --format typescript
```

## Configuration File

Current workspace config is environment-based:

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
      "syncFolder": "workflows/dev"
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

In config examples, `kind: "external-instance"` is the persisted target kind for a remote n8n URL. Do not store API keys in this file. Use `n8nac env auth set <env> --api-key-stdin` for remote n8n environments.

## Compatibility Commands

These commands may still be callable for old workspaces or scripts, but they are not the primary CLI surface:

```bash
n8nac instance-target ...
n8nac target ...
n8nac setup ...
n8nac setup-modes ...
n8nac workspace pin-instance ...
n8nac workspace set-sync-folder ...
```

Prefer `n8nac env` for all new workspace configuration.

## License

MIT
