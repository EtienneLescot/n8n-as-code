---
sidebar_label: VS Code Extension
title: VS Code / Cursor Extension Guide
description: Use the n8n-as-code extension with n8n environments, explicit sync, and the integrated Agent Workbench.
---

# VS Code / Cursor Extension Guide

The extension is the recommended n8n-as-code experience. It adds an n8n sidebar, embedded canvas, explicit sync controls, `n8n environments`, and an integrated Agent Workbench.

## First Setup

1. Install the extension from the Microsoft Marketplace or Open VSX.
2. Open a folder or `.code-workspace`.
3. Click the **n8n** icon in the Activity Bar.
4. Run **n8n: Configure**.
5. In **n8n environments**, choose an instance:
   - `Enter URL and API key` for a remote n8n environment.
   - an existing local managed instance.
   - `Create local instance` to create one locally.
6. Select the project and sync folder.
7. Save the environment.

## Configuration Model

| UI Area | Meaning |
|---|---|
| `n8n environments` | Workspace environments stored in `n8nac-config.json` |
| `Instance` selector | The n8n endpoint used by the environment |
| `Managed local instances` | Local managed instances on this machine |
| API key input | Stored locally, not committed |

An environment is workspace context. A local managed instance is a local machine resource.

## Daily Workflow

1. Refresh the `n8n` sidebar.
2. Pull a remote workflow or create a local workflow file.
3. Open split view when you want to inspect the n8n canvas.
4. Ask the Agent Workbench for the change you want.
5. Review the diff and validation feedback.
6. Push explicitly.
7. Provision credentials, activate, run, and inspect executions when needed.

The extension never silently pushes or pulls workflow changes.

## Agent Workbench Context

The Agent can use:

- current workflow file
- selected node or canvas context
- active n8n environment
- project and sync folder
- generated `AGENTS.md`
- bundled n8n schemas, docs, examples, templates, and validation rules

## Workspace Migration

The extension can detect older config models, but it does not rewrite config on workspace open.

Use the explicit button in the UI or the CLI:

```bash
n8nac workspace migrate --json
n8nac workspace migrate --write
```

- `migrate --json` is the dry-run for legacy config models and reports one unified `operations` list.
- `migrate --write` applies the required migration as one operation.
- The write step creates a backup before replacing `n8nac-config.json`.

## CLI Equivalent

```bash
n8nac env add Dev --base-url <url> --sync-folder workflows/dev
n8nac env auth set Dev --api-key-stdin
n8nac env use Dev
n8nac list
n8nac pull <workflow-id>
n8nac push workflows/dev/my-workflow.workflow.ts --verify
```

For a local managed instance:

```bash
n8n-manager instance list
n8nac env add Local --managed-instance <id> --sync-folder workflows/local
```

## Compatibility Settings

The legacy native editor settings may still exist as fallbacks:

| Setting | Description |
|---|---|
| `n8n.host` | Legacy n8n URL |
| `n8n.apiKey` | Legacy API key |
| `n8n.syncFolder` | Legacy sync folder |

Prefer `n8n environments` for all new configuration.

## Troubleshooting

### Extension not loading workflows

- Confirm an environment exists in **n8n environments**.
- Confirm the API key is set for remote environments.
- Refresh the sidebar.
- Check the **n8n-as-code** Output panel.

### Sync not updating

- Use refresh or **Fetch**.
- Confirm the active environment and sync folder.
- Resolve conflicts before pushing.

### Canvas not loading

- Verify the n8n URL is reachable.
- Confirm the API key still has access.
- Reopen the split view.

## Next Steps

- [Getting Started](/docs/getting-started)
- [CLI Guide](/docs/usage/cli)
- [n8n-manager Guide](/docs/usage/n8n-manager)
- [Troubleshooting](/docs/troubleshooting)
