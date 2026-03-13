# @n8n-as-code/openclaw-plugin

**OpenClaw plugin for n8n-as-code.** Ask OpenClaw to build, update and manage n8n workflows using the `n8nac` CLI as its backend.

## Install

```bash
openclaw plugins install @n8n-as-code/openclaw-plugin
```

Restart the gateway, then run the setup wizard:

```bash
openclaw n8n:setup
```

The wizard asks for your n8n host URL and API key once, saves them via
`n8nac init-auth`, selects your project, and generates an AI context file
(`AGENTS.md`) in the workspace (`~/.openclaw/n8nac/`).

## Usage

Once setup is done, just talk to OpenClaw:

> "Create an n8n workflow that sends a Slack message when a GitHub issue is opened"

> "Pull workflow 42 and add an error handler to it"

> "What operations does the Google Sheets node support?"

The plugin injects the full n8n-architect instructions into every conversation
so the AI knows the exact `n8nac` workflow (init-check → pull → edit → push → verify).

## CLI commands

| Command | Description |
|---|---|
| `openclaw n8n:setup` | Interactive setup wizard |
| `openclaw n8n:status` | Show workspace status |

Options for `n8n:setup`:

```
--host <url>          n8n host URL (skip prompt)
--api-key <key>       n8n API key (skip prompt)
--project-index <n>   Project to select (default: 1)
```

## Workspace

All files live in `~/.openclaw/n8nac/`:

```
~/.openclaw/n8nac/
  n8nac-config.json     ← project binding (written by n8nac init-project)
  AGENTS.md             ← AI context (written by n8nac update-ai)
  workflows/            ← .workflow.ts files (your n8n workflows)
```

## Agent tool

The plugin registers the `n8nac` tool with these actions:

| Action | Description |
|---|---|
| `setup_check` | Check initialization state |
| `init_auth` | Save n8n credentials |
| `init_project` | Select n8n project |
| `list` | List all workflows |
| `pull` | Download a workflow by ID |
| `push` | Upload a workflow file |
| `verify` | Validate live workflow against schema |
| `skills` | Run any `npx n8nac skills` subcommand |
| `validate` | Validate a local `.workflow.ts` file |

## Source

Part of the [n8n-as-code](https://github.com/EtienneLescot/n8n-as-code) monorepo.
