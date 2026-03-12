# n8n-as-code Claude Plugin

Slim Claude Code plugin package for `n8n-as-code`.

This directory is the actual plugin root used by the marketplace entry, so Claude Code installs only the plugin files instead of copying the whole monorepo.

> **Status:** Beta / Pending Review  
> Until the official Claude Code listing is approved, the recommended install path is the repo-hosted alternative marketplace:
>
> ```text
> /plugin marketplace add EtienneLescot/n8n-as-code
> /plugin install n8n-as-code@n8nac-marketplace
> ```
>
> This folder remains the install payload behind that marketplace entry and a fallback source for manual installs.

## Included

- `.claude-plugin/plugin.json`
- `skills/n8n-architect/SKILL.md`
- `skills/n8n-architect/README.md`

## Manual Install

```bash
mkdir -p ~/.claude/skills
cp -r plugins/claude/n8n-as-code/skills/n8n-architect ~/.claude/skills/
```

Then initialize your workspace with:

```bash
npx --yes n8nac init
npx --yes n8nac update-ai
```

For Claude Desktop or other MCP clients, use:

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

Full documentation: https://etiennelescot.github.io/n8n-as-code/docs/usage/claude-skill/

## Source Repository

https://github.com/EtienneLescot/n8n-as-code
