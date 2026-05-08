---
sidebar_label: VS Code Extension
title: VS Code / Cursor Extension Guide
description: Use the n8n-as-code V2 extension with the integrated Agent Workbench, live workflow context, explicit sync, and n8n-manager runtime operations.
---

# VS Code / Cursor Extension Guide

The n8n-as-code extension is the main V2 experience. It adds the editor-specific workflow UI: an n8n sidebar, embedded n8n canvas, explicit sync controls, and an integrated Agent Workbench.

Use it when you want to ask an agent to build or fix n8n workflows while the agent can see the current workflow, selected node, active instance, project, and local workspace.

## Core Capabilities

### Agent Workbench

The built-in Agent is n8n-aware. It can work from:

- the current workflow file
- the selected node or canvas context
- the active n8n instance and selected project
- the workspace sync folder and generated `AGENTS.md`
- bundled n8n node schemas, docs, examples, templates, snippets, and validation rules

Typical requests:

```text
Create a workflow that receives a webhook, validates the body, writes valid rows to Google Sheets, and sends invalid rows to Slack.
```

```text
Use the selected HTTP Request node and the latest execution failure to explain the bug and make the smallest safe fix.
```

### Runtime Through n8n-manager

The extension delegates runtime operations to `n8n-manager`:

- existing n8n Cloud or self-hosted instance registration
- managed local n8n runtime setup when available
- API key storage outside the workspace config
- project selection
- credential readiness and starter kits
- workflow deployment, activation, supported execution, and inspection

The workspace `n8nac-config.json` stores only workspace-level context such as pinned instance, selected project, and sync folder.

### Visual Workflow Workspace

- Browse workflows in the `n8n` sidebar.
- See local, remote, tracked, and conflict states.
- Open split view to inspect the n8n canvas beside the source file.
- Use **Find Workflow** to jump by workflow name, ID, or local filename.
- Keep multiple instances and projects organized in the same workspace.

### Explicit Sync And Conflict Safety

All workflow movement is user-triggered. The extension does not silently push or pull changes.

- **Fetch** refreshes remote status.
- **Pull** downloads a remote workflow to local files.
- **Push** uploads local changes to n8n.
- **Resolve** handles conflicts when both local and remote changed since the last synced base.

Conflicting workflows expose actions in the tree so you can inspect a diff and choose local or remote state intentionally.

## Installation

### From Marketplace

1. Open VS Code or Cursor.
2. Go to Extensions (`Ctrl+Shift+X`).
3. Search for **n8n-as-code**.
4. Install the extension.

Marketplace links:

- Microsoft Marketplace: https://marketplace.visualstudio.com/items?itemName=etienne-lescot.n8n-as-code
- Open VSX: https://open-vsx.org/extension/etienne-lescot/n8n-as-code

### From VSIX

1. Download the `.vsix` file from a GitHub release.
2. Open Extensions in VS Code.
3. Choose **Install from VSIX**.
4. Select the downloaded file.

## First Setup

### 1. Open A Workspace

Open a folder or `.code-workspace` before initialization. The extension needs a workspace to store sync context, generated agent instructions, snippets, and workflow files.

### 2. Run Configure

1. Click the **n8n** icon in the Activity Bar.
2. Run **n8n: Configure**.
3. Choose how this workspace should use n8n:

```text
[Recommended] Create and manage a local n8n automatically
[Connect an existing n8n]
[Use generation-only mode]
```

For an existing n8n instance, enter the host URL and API key, then load projects and choose the project to sync.

For a managed local runtime, follow the `n8n-manager` prompts surfaced by the extension.

For generation-only mode, the extension keeps local authoring, validation, snippets, templates, and Agent context, but does not push or execute against a live runtime.

### 3. Save Workspace Context

Set the sync folder, save the workspace context, and initialize n8n-as-code for the workspace.

The backend resolves context in this order:

1. explicit command overrides
2. workspace overrides in `n8nac-config.json`
3. global defaults stored by `n8n-manager`

## Daily Workflow

### Browse And Pull

1. Refresh the `n8n` sidebar to update workflow status.
2. Right-click a remote workflow and select **Pull**.
3. Open the local file from the tree or by using **Find Workflow**.

### Edit With The Agent

1. Open the workflow file.
2. Select a node or open the canvas if the change depends on a specific part of the workflow.
3. Ask the Agent for the change you want.
4. Review the file diff and validation feedback.

### Preview The Canvas

Use split view when you want to inspect structure visually while editing source.

The split view is useful before pushing because it shows whether the workflow graph still looks like the intended n8n canvas.

### Push And Complete The Runtime Loop

When the local change is ready:

1. Push the workflow from the sidebar.
2. Let the runtime checks identify missing credentials.
3. Provide required secret values if prompted.
4. Activate the workflow when it is ready.
5. Run supported webhook, chat, or form workflows when applicable.
6. Inspect execution data if the workflow fails in n8n.

## Configuration Details

### V2 Storage Model

Version 2 makes `n8n-manager` the source of truth for instances, API keys, managed Docker runtimes, tunnels, and project defaults.

`n8nac-config.json` stores workspace overrides only. It is safe to commit when it contains only project and sync context. Do not commit secrets.

If you upgraded an existing workspace and still have a legacy config with embedded instances or API keys, run `n8nac workspace migrate-v1` from the workspace root before editing settings in the extension. The command shows a dry-run summary and `--write` creates a backup before converting the file.

An instance ID is a local `n8n-manager` connection profile ID. It is not a shared identifier for the n8n server, so different developers can have different IDs for the same n8n URL.

### Switching Instances

Use either:

- the global instance selector in **n8n: Configure** to change the global active `n8n-manager` instance
- the workspace pin action in **n8n: Configure** to pin the current workspace to a specific global instance

### Apply Changes Safety

When you change critical settings such as host, API key, sync folder, or project, synchronization pauses and an **Apply Changes** action appears. This prevents partial settings edits from triggering accidental sync behavior.

### Compatibility Settings

The legacy native editor settings still exist as fallbacks:

| Parameter | Description | Default |
| :--- | :--- | :--- |
| `n8n.host` | URL of your n8n instance | - |
| `n8n.apiKey` | Your n8n API Key | - |
| `n8n.syncFolder` | Local storage folder | `workflows` |
| `n8n.projectId` | Project ID to sync, selected via Configure | - |
| `n8n.projectName` | Project name, selected via Configure | - |

## Sync States

The tree view uses status icons to show workflow state:

| State | Meaning |
|---|---|
| `TRACKED` | Local and remote workflow exist and are aligned with the last synced base |
| `EXIST_ONLY_REMOTELY` | Workflow exists in n8n but has not been pulled locally |
| `EXIST_ONLY_LOCALLY` | Workflow exists locally but has not been pushed to n8n |
| `CONFLICT` | Local and remote both changed since the last synced base |

Archived workflow tabs let you switch between **Workflows**, **Archived**, and **All** views. The active filter persists across sessions.

## AI Context Files

The extension works with `n8nac` to generate local context for AI coding assistants:

- `AGENTS.md` contains workflow development instructions.
- `.github/agents/n8n-manager.agent.md` and `.github/agents/n8n-architect.agent.md` are VS Code/GitHub Copilot-compatible workspace agents.
- `.agents/skills/.../SKILL.md` contains portable skill fallbacks for other agent runtimes.
- `.vscode/n8n.code-snippets` contains common n8n node and workflow snippets.
- JSON schema configuration gives live validation and completion.

Agents such as Cursor, Copilot, Claude, Cline, Windsurf, and similar tools can use these files even outside the integrated Agent Workbench.

## Troubleshooting

### Extension Not Connecting

- Verify the n8n URL and API key.
- Confirm the selected project is available to the API key.
- Check the Output panel under **n8n-as-code**.
- Re-run **n8n: Configure** if the global `n8n-manager` instance changed.

### Sync Not Updating

- Use **Fetch** or refresh the tree to update remote state.
- Confirm the workspace sync folder is correct.
- Check for unresolved conflicts before pushing.

### Canvas Not Loading

- Verify the n8n URL is reachable from the editor.
- Confirm the API key still has access.
- Refresh the webview or reopen split view.

### Agent Missing Context

- Save workspace context from **n8n: Configure**.
- Re-run **n8n: Configure** or ask the Agent to refresh the generated workspace context if files are stale.
- Open or select the workflow/node you want the Agent to use.

## Next Steps

- [Getting Started](/docs/getting-started) - first workspace setup and workflow loop
- [CLI Guide](/docs/usage/cli) - terminal commands for sync and automation
- [n8n-manager Guide](/docs/usage/n8n-manager) - runtime setup, credentials, execution, and inspection
- [Troubleshooting](/docs/troubleshooting) - common issues and fixes

---

The VS Code/Cursor extension is the most direct way to work with n8n from an editor: sidebar, workflow UI, and integrated agent in one place.
