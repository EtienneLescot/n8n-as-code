# n8n-as-code Claude Plugin

Slim Claude Code plugin package for `n8n-as-code`.

This directory is the install payload used by the marketplace entry, so Claude Code installs only the plugin files instead of copying the full monorepo.

## Install

```text
/plugin marketplace add https://github.com/EtienneLescot/n8n-as-code
/plugin install n8n-as-code@n8nac-marketplace
```

Use the full HTTPS URL because the `owner/repo` shorthand may trigger SSH cloning.

## Included

- `.claude-plugin/plugin.json`
- `skills/n8n-architect/SKILL.md`
- `skills/n8n-architect/README.md`

## Command Model

| Group | Command | Purpose |
|---|---|---|
| Usage Principal | `n8nac env` | Workspace environments |
| Maintenance Workspace | `n8nac workspace` | Status, migration, upgrade |
| Managed Local Runtime | `n8n-manager` | Local managed instances and tunnels only |

## After Install

Ask Claude to initialize n8n-as-code in the workspace. Manual equivalent:

```bash
n8nac env add Dev --base-url <url> --sync-folder workflows/dev
n8nac env auth set Dev --api-key-stdin
n8nac env use Dev
n8nac update-ai
```

For a managed local instance:

```bash
n8n-manager instance list
n8nac env add Local --managed-instance <id> --sync-folder workflows/local
```

`AGENTS.md` is a lightweight context-root bootstrap. It points agents to local `.agents/skills` copies and to `n8nac env status`.

## Prerelease Marketplace

```text
/plugin marketplace add https://github.com/EtienneLescot/n8n-as-code#next
/plugin install n8n-as-code@n8nac-marketplace
```

Manual prerelease commands should use matching npm tags:

```bash
npx --yes n8nac@next env list
npx --yes @n8n-as-code/n8n-manager@next instance list
```

## MCP

For Claude Desktop or other MCP clients:

```json
{
  "mcpServers": {
    "n8n-as-code": {
      "command": "npx",
      "args": ["--yes", "n8nac", "skills", "mcp"]
    }
  }
}
```

Full documentation: https://n8nascode.dev/docs/usage/claude-plugin/

n8n-manager documentation: https://n8nascode.dev/docs/usage/n8n-manager/

## Source Repository

https://github.com/EtienneLescot/n8n-as-code
