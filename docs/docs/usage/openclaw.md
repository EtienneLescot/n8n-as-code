---
sidebar_position: 7
title: OpenClaw Plugin
description: Install the n8n-as-code OpenClaw plugin, bootstrap the workspace, and use OpenClaw with the same n8nac workflow model as the CLI and Claude plugin.
---

# OpenClaw Plugin

The `@n8n-as-code/n8nac` package gives OpenClaw the same portable `n8n-manager` and `n8n-architect` skills used by Claude, Cursor, VS Code workspaces, and generic coding agents.

It is the right entry point when you want OpenClaw to:

- bootstrap an n8n workspace for you
- materialize `AGENTS.md` and `.agents/skills` in the OpenClaw context root
- run workflow operations through the shared `n8n-manager` and `n8nac` shell commands

## What It Adds

Once installed, the plugin gives OpenClaw:

- bundled `n8n-manager` and `n8n-architect` skills
- an `openclaw n8nac:setup` wizard for host, API key, project selection, and workspace context
- lightweight prompt grounding that points to the generated `AGENTS.md` and skills
- an OpenClaw-native workspace rooted at `~/.openclaw/n8nac/`

## Install

Install the published plugin package:

```bash
openclaw plugins install @n8n-as-code/n8nac
```

:::note Existing installs
If you previously installed `@n8n-as-code/openclaw-plugin`, uninstall the old package first and then install `@n8n-as-code/n8nac` so OpenClaw stores the plugin under the canonical `n8nac` ID without repeated mismatch warnings.
:::

Then run the setup wizard:

```bash
openclaw n8nac:setup
```

When setup completes, restart the gateway so the plugin and generated AI context are active:

```bash
openclaw gateway restart
```

## Setup Flow

The setup wizard walks through the same core steps as the CLI:

1. Save the n8n host and API key through `n8n-manager auth set`.
2. Select the active n8n project through `n8n-manager projects select`.
3. Configure workspace-local sync through `n8nac workspace set-sync-folder`.
4. Generate `AGENTS.md` with `n8nac update-ai`.
5. Point OpenClaw at the initialized workspace in `~/.openclaw/n8nac/`.

Once the workspace exists, agents can inspect and switch global n8n-manager instances through the shared backend facade instead of rewriting `n8nac-config.json` by hand.

After that, you can ask for workflow work in plain language, for example:

- `Create an n8n workflow that sends a Slack message when a GitHub issue is opened`
- `Pull workflow 42 and add retry handling before the HTTP Request node`
- `What operations does the Google Sheets node support?`

## Workspace Layout

The plugin keeps its working files under:

```text
~/.openclaw/n8nac/
  n8nac-config.json
  AGENTS.md
  .agents/skills/
  workflows/
```

- `n8nac-config.json` stores workspace project/sync overrides only
- `AGENTS.md` is a lightweight bootstrap, not a configuration source of truth
- `.agents/skills/` contains the portable `n8n-manager` and `n8n-architect` skills
- `workflows/` holds the local `.workflow.ts` files you pull and edit

## Commands

### OpenClaw Commands

| Command | Description |
|---|---|
| `openclaw n8nac:setup` | Interactive setup wizard |
| `openclaw n8nac:status` | Check workspace and connection state |
| `openclaw gateway restart` | Reload the plugin after setup or local changes |

### Agent CLI Flow

Agents use the same shell commands as other facades:

```bash
n8n-manager instances list
n8n-manager instances select <instanceId>
n8n-manager projects list
n8n-manager projects select <project-id-or-name>
npx --yes n8nac workspace set-sync-folder workflows
npx --yes n8nac list
npx --yes n8nac pull <workflow-id>
npx --yes n8nac push <file>
npx --yes n8nac update-ai
```

That keeps OpenClaw aligned with the CLI, VS Code extension, and Claude plugin instead of inventing a separate sync path.

## Troubleshooting

See the [OpenClaw section](/docs/troubleshooting#openclaw-plugin) in the Troubleshooting guide.

To reset the workspace and start over:

```bash
rm -rf ~/.openclaw/n8nac
openclaw n8nac:setup
openclaw gateway restart
```

## Related

- [Getting Started](/docs/getting-started)
- [Claude Plugin](/docs/usage/claude-plugin)
- [CLI Guide](/docs/usage/cli)
