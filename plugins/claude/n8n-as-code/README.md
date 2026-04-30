# n8n-as-code Claude Plugin

Slim Claude Code plugin package for `n8n-as-code`.

This directory is the actual plugin root used by the marketplace entry, so Claude Code installs only the plugin files instead of copying the whole monorepo.

> **Status:** Beta / Pending Review  
> Until the official Claude Code listing is approved, the recommended install path is the repo-hosted alternative marketplace:
>
> ```text
> /plugin marketplace add https://github.com/EtienneLescot/n8n-as-code
> /plugin install n8n-as-code@n8nac-marketplace
> ```
>
> Use the full HTTPS URL here because the `owner/repo` shorthand may trigger an SSH clone in Claude Code, which fails if GitHub SSH keys are not configured.
>
> This folder remains the install payload behind that marketplace entry.

## Included

- `.claude-plugin/plugin.json`
- `skills/n8n-manager/SKILL.md`
- `skills/n8n-architect/SKILL.md`
- `skills/n8n-architect/README.md`

## After Install

Initialize your workspace with:

```bash
n8n-manager instances list
# Reuse an instance, create a managed local instance, or add remote auth through n8n-manager.
npx --yes n8nac workspace status --json
npx --yes n8nac workspace set-sync-folder workflows
npx --yes n8nac update-ai
```

`AGENTS.md` is a lightweight context-root bootstrap. It points agents to the local `.agents/skills` copies and to `n8nac workspace status --json`, which resolves effective state through the backend.

## Prerelease Marketplace

To test the prerelease plugin from the `next` branch, add the marketplace with the branch suffix and use matching npm prerelease tags for any manual commands:

```text
/plugin marketplace add https://github.com/EtienneLescot/n8n-as-code#next
/plugin install n8n-as-code@n8nac-marketplace
```

```bash
npx --yes @n8n-as-code/n8n-manager@next instances list
npx --yes n8nac@next workspace status --json
npx --yes n8nac@next update-ai
```

The prerelease plugin payload is stamped so its bundled skills call `n8nac@next` and `@n8n-as-code/n8n-manager@next`; the commands above are only needed when you run setup manually.

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

Full documentation: https://n8nascode.dev/docs/usage/claude-plugin/

## Source Repository

https://github.com/EtienneLescot/n8n-as-code
