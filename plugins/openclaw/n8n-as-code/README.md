# @n8n-as-code/openclaw-plugin

**OpenClaw plugin for n8n-as-code.** Ask OpenClaw to build, update and manage n8n workflows using the `n8nac` CLI as its backend.

## Install

```bash
openclaw plugins install @n8n-as-code/openclaw-plugin
```

Restart the gateway, then run the setup wizard:

```bash
openclaw n8nac:setup
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
| `openclaw n8nac:setup` | Interactive setup wizard |
| `openclaw n8nac:status` | Show workspace status |

Options for `n8nac:setup`:

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

## Local development

This section covers how to load the plugin from source during development so
that changes take effect immediately without an npm publish cycle.

### 1. Link the plugin directory

OpenClaw's `--link` flag registers a local path instead of installing a copy.
jiti is used to run TypeScript directly, so no build step is needed.

```bash
openclaw plugins install --link \
  /home/etienne/repos/n8n-as-code/plugins/openclaw/n8n-as-code
```

What this does:
- Adds the path to `plugins.load.paths` in `~/.openclaw/openclaw.json`
- Registers a `source: "path"` install record bound to the plugin ID `n8nac`
- No file copy — OpenClaw loads `index.ts` directly from the source tree

### 2. Verify the plugin is registered

```bash
openclaw plugins info n8nac
```

You should see status `loaded` and the tool `n8nac` in the tools list.

### 3. Run the setup wizard

```bash
openclaw n8nac:setup
```

Enter your n8n host and API key when prompted. The wizard writes
`~/.openclaw/n8nac/n8nac-config.json` and generates `AGENTS.md`.

### 4. Iterate on the code

- Edit any `.ts` file in `plugins/openclaw/n8n-as-code/`
- **Restart the gateway** to reload: `openclaw stop && openclaw start` (or the
  equivalent service restart on your setup)
- The `before_prompt_build` hook, tool schema, and CLI commands all reload on
  gateway start

### 5. Check gateway logs

```bash
tail -f ~/.openclaw/logs/openclaw-$(date +%Y-%m-%d).log | grep n8nac
```

The plugin prefixes all `api.logger` calls with `[n8nac]`.

### 6. Inspect the n8nac workspace

```
~/.openclaw/n8nac/
  n8nac-config.json   ← written by init-project
  AGENTS.md           ← written by update-ai
  workflows/          ← .workflow.ts files
```

To reset and redo setup from scratch:

```bash
rm -rf ~/.openclaw/n8nac && openclaw n8nac:setup
```

### 7. Unlink when done

```bash
openclaw plugins uninstall n8nac
```

---

## Source

Part of the [n8n-as-code](https://github.com/EtienneLescot/n8n-as-code) monorepo.
