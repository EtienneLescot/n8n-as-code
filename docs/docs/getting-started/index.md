---
sidebar_position: 1
title: Getting Started
description: Get up and running with n8n-as-code in minutes — install, connect, and sync your first workflow.
---

# Getting Started

This guide walks you through setup and your first workflow sync in under 5 minutes.

## Prerequisites

You do not need a connected n8n instance to start. The required runtime setup depends on the facade and mode you choose during onboarding.

For sync against an existing n8n instance, have these ready:

- An **n8n instance** (cloud or self-hosted)
- An **API key** from your n8n instance (Settings → API)

If you choose managed local n8n, `n8n-manager` can create and manage the runtime for you. If you choose generation-only mode, no connected runtime is required.

## Onboarding modes

During setup, choose how your facade should use n8n:

- **Connect an existing n8n** — provide an n8n host URL and API key.
- **Create and manage local n8n automatically** — the facade delegates to `n8n-manager` for Docker-based local n8n setup, tunnels, and lifecycle management.
- **Generation-only mode** — use workflow intelligence without a connected runtime.

## Option A: VS Code Extension (Recommended)

The VS Code extension gives you the best experience: visual tree view, push/pull from the sidebar, split view with n8n canvas, and conflict resolution UI.

### 1. Install the Extension

1. Open VS Code (or Cursor)
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for **n8n-as-code**
4. Click **Install**

### 2. Choose how to use n8n

All n8n-as-code facades expose the same setup choice:

```txt
How do you want to use n8n?

[Recommended] Create and manage a local n8n automatically
[Connect an existing n8n]
[Use generation-only mode]
```

The current extension can display the shared runtime modes. The existing-instance path is the fully wired sync path:

1. Click the **n8n** icon in the Activity Bar
2. Click **n8n: Configure** (or the gear icon)
3. Click **Add instance** if you want to register a new global n8n-manager instance
4. Enter your **n8n host URL** (e.g. `https://your-instance.app.n8n.cloud`)
5. Enter your **API key**
6. Click **Load projects**, then select the one you want to sync
7. Click **Save workspace context**
8. The workspace can optionally pin one global instance; otherwise it follows the global active n8n-manager instance
9. Click **Initialize n8n as code** to load the workspace

### 3. Sync Your First Workflow

1. The tree view shows all your workflows with status icons
2. Right-click a workflow → **Pull** to download it locally
3. Click the file to edit it
4. When done, right-click → **Push** to send changes back to n8n

That's it. Your workflows are now local files you can version with Git.

## Option B: CLI

If you prefer the terminal or need CI/CD integration.

### 1. Install

```bash
npm install -g n8nac
```

To update to the latest version later:

```bash
npm update -g n8nac
```

:::note Previous package name
The CLI was previously published as `@n8n-as-code/cli`, which is now deprecated. If you have it installed alongside `n8nac`, remove it to avoid command shadowing: `npm uninstall -g @n8n-as-code/cli`. See [Troubleshooting](/docs/troubleshooting#cli-package-conflicts) for details.
:::

### 2. Connect and Initialize

```bash
n8n-manager auth set --url <url> --api-key-stdin
n8n-manager projects select <project-id-or-name>
n8nac workspace set-sync-folder workflows
n8nac update-ai
```

You can also select the shared facade runtime mode explicitly:

```bash
n8nac setup-modes
n8nac setup --mode generation-only
n8nac setup --mode connect-existing --host https://your-instance.app.n8n.cloud --api-key-stdin
```

The facade-level choices are:

- create and manage a local n8n automatically
- connect an existing n8n
- use generation-only mode

For the existing-instance path, it asks for:

- **n8n host URL** — your n8n instance address
- **API key** — from n8n Settings → API  
- **Sync folder** — where to store workflow files (default: `workflows`)
- **Project** — which n8n project to sync

### 3. Sync Your First Workflow

```bash
# See all workflows and their status
n8nac list

# Pull a workflow locally
n8nac pull <workflowId>

# Edit the file with your editor of choice...

# Push changes back to n8n
n8nac push workflows/instance/project/my-workflow.workflow.ts
```

### 4. Let the agent carry the workflow to a real execution

Once a workflow is in n8n, `n8n-as-code` now supports the full runtime loop instead of stopping at “push succeeded”.

In practice, that means an agent can now:

- detect which credentials are still missing
- provision credentials after asking you only for the required secret values
- activate the workflow when it is ready
- inspect how the workflow should be tested
- execute webhook, chat, and form workflows on your behalf
- inspect the resulting execution directly from n8n when the run fails on the server

This is especially important for AI-assisted workflow development: the agent is no longer limited to editing workflow files. It can now help you reach a successful execution and debug real runtime failures using execution data returned by n8n.

This runtime loop is not specific to one facade. The same capabilities are available through the CLI, extension, MCP server, Claude/OpenClaw plugins, and YAGR integration. Internally, workflow intelligence comes from the n8n-as-code workflow engine, while setup, credentials, deployment, execution, and inspection come from `n8n-manager`.

Credential readiness commands now go through the shared manager adapter:

```bash
n8nac credentials recipes
n8nac credentials starter-kits
n8nac credentials inventory
n8nac credentials ensure http-bearer --value token=...
n8nac credentials test http-bearer
```

If you want the exact commands for this loop, see the [CLI guide](/docs/usage/cli).

## Option C: AI Agent (Claude / OpenClaw)

Let an AI agent set up the workspace and manage workflows for you.

### Claude Code

```text
/plugin marketplace add https://github.com/EtienneLescot/n8n-as-code
/plugin install n8n-as-code@n8nac-marketplace
```

To test the prerelease plugin from `next`, use:

```text
/plugin marketplace add https://github.com/EtienneLescot/n8n-as-code#next
/plugin install n8n-as-code@n8nac-marketplace
```

For any manual CLI commands while using that prerelease plugin, prefer the matching tags: `npx --yes n8nac@next ...` and `npx --yes @n8n-as-code/n8n-manager@next ...`.

Then ask Claude:
> "Create a workflow that watches Typeform responses and sends them to Slack"

Claude handles initialization, node lookup, and sync automatically.

See the full [Claude Plugin guide](/docs/usage/claude-plugin).

### OpenClaw

```bash
openclaw plugins install @n8n-as-code/n8nac
openclaw n8nac:setup
openclaw gateway restart
```

Then ask OpenClaw to build or edit workflows in natural language.

See the full [OpenClaw Plugin guide](/docs/usage/openclaw).

## What Gets Created

After setup, your project looks like this:

```
your-project/
├── n8nac-config.json             # Workspace project/sync overrides (safe to commit)
├── AGENTS.md                     # AI agent instructions (auto-generated)
├── workflows/                    # Your workflow files
│   └── instance-name_user/       # Organized by instance
│       └── project-slug/
│           ├── my-workflow.workflow.ts
│           └── folder/
│               └── another.workflow.ts
└── .git/                         # Version control (recommended)
```

- **`n8nac-config.json`** — minimal workspace project/sync overrides; safe to commit
- **Instances and API keys** — stored by n8n-manager under `~/.n8n-manager`, never in the workspace config file
- **`AGENTS.md`** — generated instructions for AI agents (regenerate with `n8nac update-ai`)

## The Sync Model

n8n-as-code uses an **explicit, git-like sync model**. Nothing syncs automatically.

| Command | What it does |
|---|---|
| `n8nac list` | Show all workflows with sync status |
| `n8nac pull <id>` | Download a workflow from n8n |
| `n8nac push <path>` | Upload a local workflow to n8n |
| `n8nac resolve <id>` | Resolve a conflict (keep local or remote) |
| Runtime provisioning & testing | Let the agent provision credentials, activate, test, and debug a workflow end-to-end |

If both sides changed since the last sync, `pull` or `push` will report a conflict. Use `resolve` to choose which version wins.

## Next Steps

- [**VS Code Extension**](/docs/usage/vscode-extension) — tree view, split canvas, conflict resolution UI
- [**Claude Plugin**](/docs/usage/claude-plugin) — AI-powered workflow creation
- [**OpenClaw Plugin**](/docs/usage/openclaw) — AI workflows inside OpenClaw
- [**CLI Reference**](/docs/usage/cli) — full command reference for automation
- [**n8n-manager**](/docs/usage/n8n-manager) — runtime engine for instances, tunnels, and credentials
- [**TypeScript Workflows**](/docs/usage/typescript-workflows) — decorator-based workflow format
- [**Troubleshooting**](/docs/troubleshooting) — common issues and fixes
