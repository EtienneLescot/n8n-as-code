# @n8n-as-code/n8nac

**OpenClaw access to the standard `n8n-as-code` skills and workflow stack.**

Use OpenClaw to build, update, validate, and manage n8n workflows with the same `n8nac` CLI and AI context model used across the wider `n8n-as-code` project.

## Install

```bash
openclaw plugins install @n8n-as-code/n8nac
```

If you previously installed `@n8n-as-code/openclaw-plugin`, remove the old install first so OpenClaw re-registers the plugin cleanly under `n8nac`:

```bash
openclaw plugins uninstall n8nac
openclaw plugins install @n8n-as-code/n8nac
```

Restart the gateway, then run the setup wizard:

```bash
openclaw n8nac:setup
```

The wizard asks for your n8n host URL and API key once, saves the instance in the global
`n8n-manager` SSOT via `n8n-manager auth set`, selects the n8n project through
`n8n-manager projects select`, configures the context-root sync folder with
`n8nac workspace`, and generates the local agent bootstrap files in
`~/.openclaw/n8nac/`.

After setup, global n8n-manager instances are listed, selected, and deleted through `n8n-manager`.

## Usage

Once setup is done, just talk to OpenClaw:

> "Create an n8n workflow that sends a Slack message when a GitHub issue is opened"

> "Pull workflow 42 and add an error handler to it"

> "What operations does the Google Sheets node support?"

The plugin keeps its prompt hook lightweight. OpenClaw uses the bundled
`n8n-manager` and `n8n-architect` skills for explicit n8n sessions. Those
skills use the same shell commands as Claude, Codex, Cursor, VS Code, and other
agents: `n8n-manager ...` and `n8nac ...`.

## CLI commands

| Command | Description |
|---|---|
| `openclaw n8nac:setup` | Interactive setup wizard |
| `openclaw n8nac:status` | Show workspace status |

Options for `n8nac:setup`:

```
--host <url>          n8n host URL (skip prompt)
--api-key <key>       n8n API key (skip prompt)
--project-index <n>   Project to select non-interactively
```

## Workspace

All files live in `~/.openclaw/n8nac/`:

```
~/.openclaw/n8nac/
  n8nac-config.json     ← workspace project/sync overrides only
  AGENTS.md             ← lightweight agent bootstrap (written by n8nac update-ai)
  .agents/skills/       ← portable n8n-manager + n8n-architect skills
  workflows/            ← .workflow.ts files (your n8n workflows)
```

Instances and API keys are not stored in this workspace. They live in the global
`n8n-manager` configuration under `~/.n8n-manager`.

## Agent skills

The plugin does not register a facade-specific agent tool. Agents should use
the portable skills and shell commands directly:

```bash
n8n-manager instances list
n8nac workspace status --json
n8nac list
n8nac pull <workflowId>
n8nac push <path-to-workflow.workflow.ts> --verify
n8nac skills node-info <nodeName>
```

`AGENTS.md` is not a configuration source of truth. It points agents to the
local skills and to `n8nac workspace status --json`, which resolves the
effective context through the backend.

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

You should see status `loaded`, the bundled skills, and the `n8nac:setup` /
`n8nac:status` CLI commands. The plugin intentionally does not register a
facade-specific agent tool.

### 3. Run the setup wizard

```bash
openclaw n8nac:setup
```

Enter your n8n host and API key when prompted. The wizard writes the global
instance and secret through n8n-manager, writes only workspace project/sync
context in `~/.openclaw/n8nac/n8nac-config.json`, then generates `AGENTS.md`
and `.agents/skills`.

### 4. Iterate on the code

- Edit any `.ts` file in `plugins/openclaw/n8n-as-code/`
- **Restart the gateway** to reload: `openclaw stop && openclaw start` (or the
  equivalent service restart on your setup)
- The `before_prompt_build` hook and CLI commands reload on
  gateway start

### 5. Check gateway logs

```bash
tail -f ~/.openclaw/logs/openclaw-$(date +%Y-%m-%d).log | grep n8nac
```

The plugin prefixes all `api.logger` calls with `[n8nac]`.

### 6. Inspect the n8nac workspace

```
~/.openclaw/n8nac/
  n8nac-config.json   ← workspace project/sync overrides only
  AGENTS.md           ← lightweight bootstrap written by update-ai
  .agents/skills/     ← portable skills written by update-ai
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
