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
5. In **n8n environments**, choose an environment target type:
   - `Enter URL and API key` for a remote n8n environment.
   - an existing local managed instance.
   - `Create local instance` to create one locally.
6. Select the project and workflows path.
7. Optionally enable **Native n8n MCP Assist** for live n8n context.
8. Save the environment.

## Configuration Model

| UI Area | Meaning |
|---|---|
| `n8n environments` | Workspace environments stored in `n8nac-config.json` |
| `Instance` selector | The n8n endpoint used by the environment |
| `Managed local instances` | Local managed instances on this machine |
| API key input | Stored locally, not committed |
| Native n8n MCP Assist | Optional live assist settings stored on the environment; token stored locally |

An environment is workspace context. A local managed instance is a local machine resource.

## Native n8n MCP Assist

Native n8n MCP Assist is optional. It lets the Agent Workbench use live n8n state when it is better than local N8NAC knowledge, for example live workflow discovery, execution troubleshooting, credential metadata, native node definitions, and server-side validation.

The Workbench acts as a generic MCP client. The native n8n MCP environment setting is a convenience shortcut that preconfigures the native n8n MCP server for the active environment; the Workbench discovers that server's tools dynamically through MCP instead of using a hardcoded n8n tool list.

Configure it in **n8n: Configure** while creating or editing an environment:

1. Enable **Native n8n MCP Assist**.
2. Enter the native n8n MCP endpoint, or leave it empty to default to `<environment-url>/mcp-server/http`.
3. Enter the native MCP bearer token.
4. Use **Test connection** to verify the endpoint and token.
5. Save the environment.

The native MCP form also includes **Advanced security options**. Leave them disabled for normal VS Code usage and for n8n Cloud instances. **Allow reading execution input/output data** lets the Agent inspect full execution payloads, which may contain sensitive data. **Allow remote access to the local MCP bridge** is only for deliberate non-localhost bridge deployments; it is not required when the n8n instance itself is remote or hosted on n8n Cloud.

The extension stores only non-secret settings in `n8nac-config.json`. The native MCP token is stored locally with the environment credentials. The Agent Workbench does not require manual `.vscode/mcp.json` configuration for this feature.

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
- optional native n8n MCP live assist configured on the active environment
- project and workflowsPath
- generated `AGENTS.md`
- bundled n8n schemas, docs, examples, templates, and validation rules

## CLI Equivalent

```bash
n8nac env add Dev --base-url <url> --workflows-path workflows/dev
n8nac env auth set Dev --api-key-stdin
n8nac native-mcp configure Dev --token-stdin # optional; endpoint defaults from the environment URL
n8nac env use Dev
n8nac list
n8nac pull <workflow-id>
n8nac push workflows/dev/my-workflow.workflow.ts --verify
```

For a local managed instance:

```bash
n8n-manager instance list
n8nac env add Local --managed-instance <id> --workflows-path workflows/local
```

## Compatibility Settings

The legacy native editor settings may still exist as fallbacks:

| Setting | Description |
|---|---|
| `n8n.host` | Legacy n8n URL |
| `n8n.apiKey` | Legacy API key |
| `n8n.workflowsPath` | Legacy workflows path fallback |

Prefer `n8n environments` for all new configuration.

## Troubleshooting

### Extension not loading workflows

- Confirm an environment exists in **n8n environments**.
- Confirm the API key is set for remote environments.
- Refresh the sidebar.
- Check the **n8n-as-code** Output panel.

### Sync not updating

- Use refresh or **Fetch**.
- Confirm the active environment and workflows path.
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
