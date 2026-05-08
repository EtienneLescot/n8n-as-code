---
sidebar_position: 1
title: Getting Started
description: Set up n8n-as-code V2 with the VS Code/Cursor Agent, n8n-manager runtime context, and your first workflow loop.
---

# Getting Started

This guide gets you from an empty editor workspace to an agent-assisted n8n workflow loop: connect a runtime, bind a workspace, pull or create a workflow, ask the Agent for a change, then push and test intentionally.

## Prerequisites

For the recommended VS Code/Cursor flow:

- VS Code, Cursor, Windsurf, or another compatible editor that can install VS Code extensions.
- A folder or `.code-workspace` opened in the editor.
- One n8n runtime choice:
  - a managed local n8n instance created through `n8n-manager`, or
  - an existing n8n Cloud/self-hosted instance with an API key from n8n Settings -> API, or
  - generation-only mode if you only want local authoring and embedded n8n knowledge.

For CLI usage, use Node.js 20 or newer.

## Recommended: VS Code / Cursor Agent

The extension is the primary V2 experience. It combines the workflow sidebar, split canvas, explicit sync, generated AI context, and integrated Agent Workbench.

### 1. Install The Extension

1. Open VS Code or Cursor.
2. Go to Extensions (`Ctrl+Shift+X`).
3. Search for **n8n-as-code**.
4. Install the extension from the Microsoft Marketplace or Open VSX.

### 2. Configure n8n

1. Open a folder or `.code-workspace`.
2. Click the **n8n** icon in the Activity Bar.
3. Run **n8n: Configure**.
4. Choose how this workspace should use n8n:

```text
[Recommended] Create and manage a local n8n automatically
[Connect an existing n8n]
[Use generation-only mode]
```

For an existing n8n instance, enter the host URL and API key, then load projects and select the project to sync.

For a managed local runtime, follow the `n8n-manager` prompts shown by the extension.

For generation-only mode, the Agent can still use embedded n8n schemas, docs, examples, templates, snippets, and validation without pushing to a live runtime.

### 3. Save Workspace Context

Choose the sync folder, then save the workspace context.

The workspace stores only local project context in `n8nac-config.json`, such as the pinned instance, project, and sync folder. Global instances and API keys are stored by `n8n-manager`, not in the workspace file.

### 4. Pull Or Create A Workflow

Use the `n8n` sidebar to refresh workflow status.

- Right-click a remote workflow and choose **Pull** to download it locally.
- Create a new workflow file in the sync folder if you want to start from scratch.
- Open split view to inspect the n8n canvas beside the workflow source.

### 5. Ask The Agent

Open the Agent Workbench and describe the workflow change you want.

Example prompts:

```text
Create a workflow that receives a webhook, checks the payload, writes valid rows to Google Sheets, and sends invalid rows to Slack.
```

```text
This workflow fails after the HTTP Request node. Use the selected node and execution context to explain what is wrong and propose the smallest fix.
```

The Agent can use the current workflow file, selected node, active n8n instance, selected project, workspace context, and bundled n8n knowledge.

### 6. Push, Test, And Inspect

When you are ready:

1. Validate the workflow locally.
2. Push it to n8n from the sidebar.
3. Let `n8n-manager` help identify missing credentials.
4. Provide only the secret values the system cannot infer.
5. Activate and run supported webhook, chat, or form workflows.
6. Inspect execution results when a run fails server-side.

Sync is explicit. The extension does not silently overwrite local or remote work.

## CLI Setup

Use the CLI when you prefer terminal workflows, scripts, or CI.

### 1. Install

```bash
npm install -g n8nac
```

:::note Previous package name
The CLI was previously published as `@n8n-as-code/cli`, which is now deprecated. If you have it installed alongside `n8nac`, remove it to avoid command shadowing: `npm uninstall -g @n8n-as-code/cli`. See [Troubleshooting](/docs/troubleshooting#cli-package-conflicts) for details.
:::

:::tip Upgrading from V1
Run `n8nac workspace migrate-v1` from the repository root before reconfiguring. It dry-runs the migration, explains what moved to `n8n-manager`, and tells you whether API keys were found. See the [V1 to V2 migration guide](/docs/migration/v1-to-v2).
:::

### 2. Connect And Initialize

For an existing n8n instance:

```bash
n8n-manager auth set --url <url> --api-key-stdin
n8n-manager projects select <project-id-or-name>
n8nac workspace set-sync-folder workflows
n8nac update-ai
```

If this repository should always use a specific registered instance instead of the current global active instance, pin it in the workspace:

```bash
n8n-manager instances list
n8nac workspace pin-instance --instance-id <instance-id>
n8nac workspace status --json
```

You can also use facade setup modes:

```bash
n8nac setup-modes
n8nac setup --mode generation-only
n8nac setup --mode connect-existing --host https://your-instance.app.n8n.cloud --api-key-stdin
```

### 3. Sync Your First Workflow

```bash
n8nac list
n8nac pull <workflowId>
n8nac push workflows/instance/project/my-workflow.workflow.ts
```

### 4. Runtime Loop From The CLI

After a workflow is pushed, the same manager-backed runtime capabilities are available from the CLI:

```bash
n8nac credentials recipes
n8nac credentials starter-kits
n8nac credentials inventory
n8nac credentials ensure http-bearer --value token=...
n8nac credentials test http-bearer
```

See the [CLI guide](/docs/usage/cli) for the full command reference.

## Agent Skills And Plugins

### Claude Code

```text
/plugin marketplace add https://github.com/EtienneLescot/n8n-as-code
/plugin install n8n-as-code@n8nac-marketplace
```

Then ask Claude to create, update, validate, or debug n8n workflows using the installed n8n skills.

See the full [Claude Plugin guide](/docs/usage/claude-plugin).

### Generic Agent Skills

For OpenCode, Codex, Hermes, or any other AI agent that supports skills, install the n8n-as-code skills from the repository skills directory:

```text
https://github.com/EtienneLescot/n8n-as-code/tree/main/skills
```

If your agent asks for explicit skill paths, use `skills/n8n-manager` and `skills/n8n-architect`.

Once the skills are available, ask your agent to initialize n8n-as-code in the workspace. The agent can run the required setup itself: configure the workspace, generate `AGENTS.md`, materialize local `.agents/skills`, and resolve the local n8n context.

### OpenClaw

```bash
openclaw plugins install @n8n-as-code/n8nac
openclaw n8nac:setup
openclaw gateway restart
```

Then ask OpenClaw to build or edit workflows in natural language.

See the full [OpenClaw Plugin guide](/docs/usage/openclaw).

## What Gets Created

After setup, your project can look like this:

```text
your-project/
├── n8nac-config.json             # Workspace project/sync overrides, safe to commit
├── AGENTS.md                     # AI agent instructions generated during setup
├── workflows/                    # Workflow files
│   └── instance-name_user/
│       └── project-slug/
│           ├── my-workflow.workflow.ts
│           └── folder/
│               └── another.workflow.ts
└── .git/                         # Version control, recommended
```

- **`n8nac-config.json`** stores workspace context only.
- **Instances and API keys** are stored by `n8n-manager`, outside the workspace config.
- **`AGENTS.md`** gives local coding agents grounded n8n instructions.

## Sync Model

n8n-as-code uses explicit, Git-like sync. Nothing moves between local files and n8n unless you ask for it.

| Command | What it does |
|---|---|
| `n8nac list` | Show workflows with sync status |
| `n8nac pull <id>` | Download a workflow from n8n |
| `n8nac push <path>` | Upload a local workflow to n8n |
| `n8nac resolve <id>` | Resolve a conflict by keeping local or remote state |
| Runtime provisioning and testing | Provision credentials, activate, run, and inspect through `n8n-manager` |

If both sides changed since the last sync, pull or push reports a conflict. Use the extension or CLI to inspect and resolve it intentionally.

## Next Steps

- [**VS Code Extension**](/docs/usage/vscode-extension) - full Agent Workbench and editor workflow guide
- [**CLI Reference**](/docs/usage/cli) - terminal commands for sync and automation
- [**n8n-manager**](/docs/usage/n8n-manager) - runtime setup, credentials, execution, and inspection
- [**Claude Plugin**](/docs/usage/claude-plugin) - Claude Code and MCP setup
- [**OpenClaw Plugin**](/docs/usage/openclaw) - OpenClaw setup and usage
- [**TypeScript Workflows**](/docs/usage/typescript-workflows) - optional decorator-based workflow format
- [**Troubleshooting**](/docs/troubleshooting) - common issues and fixes
