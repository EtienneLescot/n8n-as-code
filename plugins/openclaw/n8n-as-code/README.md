# @n8n-as-code/n8nac

OpenClaw access to the standard `n8n-as-code` skills and workflow stack.

The plugin uses the same model as VS Code, Claude, and the CLI:

| Group | Command | Purpose |
|---|---|---|
| Primary Usage | `n8nac env` | Workspace environments |
| Workspace Maintenance | `n8nac workspace` | Readiness and unified workspace migration |
| Managed Local Instances | `n8n-manager` | Local managed instances and tunnels |

## Install

```bash
openclaw plugins install @n8n-as-code/n8nac
```

For prerelease testing:

```bash
openclaw plugins install @n8n-as-code/n8nac@next
npx --yes n8nac@next env list
npx --yes @n8n-as-code/n8n-manager@next instance list
```

If you previously installed `@n8n-as-code/openclaw-plugin`, remove the old install first:

```bash
openclaw plugins uninstall n8nac
openclaw plugins install @n8n-as-code/n8nac
```

## Usage

Run setup, then restart the gateway:

```bash
openclaw n8nac:setup
openclaw gateway restart
```

Then ask OpenClaw for workflow work:

```text
Create an n8n workflow that sends a Slack message when a GitHub issue is opened.
```

## Workspace

OpenClaw files live in `~/.openclaw/n8nac/`:

```text
~/.openclaw/n8nac/
  n8nac-config.json
  AGENTS.md
  .agents/skills/
  workflows/
```

`n8nac-config.json` stores workspace environments. API keys and local managed instance state stay local.

Manual equivalent:

```bash
n8nac env add Dev --base-url <url> --sync-folder workflows/dev
n8nac env auth set Dev --api-key-stdin
n8nac env use Dev
n8nac update-ai
```

For a local managed instance:

```bash
n8n-manager instance list
n8nac env add Local --managed-instance <id> --sync-folder workflows/local
```

## Agent Commands

Agents use the normal shell commands:

```bash
n8nac env status
n8nac list
n8nac pull <workflow-id>
n8nac push <path-to-workflow.workflow.ts> --verify
n8nac skills node-info <node-name>
```

## Local Development

Register this directory with OpenClaw:

```bash
openclaw plugins install --link /home/etienne/repos/n8n-as-code/plugins/openclaw/n8n-as-code
openclaw plugins info n8nac
```

Restart the gateway after changes.

## Source

Part of the [n8n-as-code](https://github.com/EtienneLescot/n8n-as-code) monorepo.
