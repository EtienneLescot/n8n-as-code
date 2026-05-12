# <img src="https://raw.githubusercontent.com/EtienneLescot/n8n-as-code/main/res/logo.png" alt="n8n-as-code logo" width="32" height="32"> n8n-as-code

The VS Code and Cursor workspace for building n8n workflows with an AI agent that has live n8n context.

The extension centers on **workspace environments**: a workspace environment points to a remote n8n URL or local managed instance, a project, and a sync folder. Local Docker instances and tunnels are managed separately through `n8n-manager`.

Published for both the Microsoft Marketplace and Open VSX.

> **Using V1?** The Marketplace and Open VSX listings follow the V2+ release line. V1 users must install the legacy VSIX manually from the [v1.46.1-legacy GitHub release](https://github.com/EtienneLescot/n8n-as-code/releases/tag/v1.46.1-legacy) and disable extension auto-updates.

![n8n-as-code demo](https://raw.githubusercontent.com/EtienneLescot/n8n-as-code/main/res/n8n-as-code.gif)

## Quick Start

1. Install `n8n-as-code` from the Microsoft Marketplace or Open VSX.
2. Open a folder or `.code-workspace`.
3. Open the `n8n` view and run `n8n: Configure`.
4. Create a workspace environment from a remote n8n URL or a local managed instance.
5. Save the workspace environment, pull or create workflows, then use the Agent Workbench.

Marketplace links:

- Microsoft Marketplace: https://marketplace.visualstudio.com/items?itemName=etienne-lescot.n8n-as-code
- Open VSX: https://open-vsx.org/extension/etienne-lescot/n8n-as-code

Documentation links:

- VS Code guide: https://n8nascode.dev/docs/usage/vscode-extension/
- CLI guide: https://n8nascode.dev/docs/usage/cli/
- n8n-manager guide: https://n8nascode.dev/docs/usage/n8n-manager/

## Configuration Model

| Area | Owner | Stored where |
|---|---|---|
| n8n environments | `n8nac` / extension | `n8nac-config.json`, safe to commit without secrets |
| Remote API keys | `n8nac env auth` / extension | local secret storage, not committed |
| Managed local instances | `n8n-manager` | local machine store |
| Docker lifecycle and tunnels | `n8n-manager` | local machine store |

Use the **n8n environments** tab for workspace configuration. Use **Managed local instances** only for local managed instances.

## What You Get

### Integrated Agent Workbench

The Agent can use:

- current workflow file and workflow metadata
- selected node or canvas context
- active n8n environment
- project and sync folder
- generated `AGENTS.md`
- bundled n8n schemas, docs, examples, templates, and validation rules

### Visual Workflow Workspace

- Browse local and remote workflows from the `n8n` sidebar.
- Open split view to inspect the n8n canvas beside source files.
- Pull, push, fetch, and resolve conflicts explicitly.
- Work with multiple workspace environments without changing local instance state.

### Managed Local Instances

The extension can surface local managed instances through `n8n-manager`. These are machine-local resources. Adding or removing an environment does not create or delete a Docker instance unless you explicitly use the local instance controls.

## Workspace Migration

The extension detects old config models but does not rewrite them automatically when a workspace opens.

Use explicit actions:

```bash
n8nac workspace migrate --json
n8nac workspace migrate --write
```

- `migrate --json` is the dry-run for legacy config models and reports one unified `operations` list.
- `migrate --write` applies the required migration as one operation.
- The write step creates a backup before writing.

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

## V1 Legacy Extension

1. Download `n8n-as-code-v1.46.1-legacy.vsix` from the [v1.46.1-legacy GitHub release](https://github.com/EtienneLescot/n8n-as-code/releases/tag/v1.46.1-legacy).
2. Install it manually with `code --install-extension n8n-as-code-v1.46.1-legacy.vsix`.
3. Disable extension auto-updates.
4. Keep manual V1 CLI commands pinned to `n8nac@v1`.

## License

MIT
