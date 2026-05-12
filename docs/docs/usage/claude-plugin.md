---
sidebar_position: 2
title: Claude Plugin
description: Use Claude to create, edit, and fix n8n workflows through the n8n-as-code plugin.
---

# Claude Plugin

The n8n-as-code plugin gives Claude the same workflow model as the CLI and VS Code extension: workspace environments through `n8nac env`, workspace maintenance through `n8nac workspace`, and local managed instances through `n8n-manager`.

## Install

```text
/plugin marketplace add https://github.com/EtienneLescot/n8n-as-code
/plugin install n8n-as-code@n8nac-marketplace
```

Use the full HTTPS URL because the `owner/repo` shorthand can trigger SSH cloning.

For prerelease testing:

```text
/plugin marketplace add https://github.com/EtienneLescot/n8n-as-code#next
/plugin install n8n-as-code@n8nac-marketplace
```

Manual prerelease commands should use matching npm tags:

```bash
npx --yes n8nac@next env list
npx --yes @n8n-as-code/n8n-manager@next instance list
```

## Initialize A Workspace

Ask Claude to initialize n8n-as-code in the workspace. The installed skills guide it through:

- creating or selecting an n8n environment
- storing remote API keys locally
- creating or selecting local managed instances when needed
- generating `AGENTS.md`
- materializing `.agents/skills/n8n-architect`

Manual equivalent:

```bash
n8nac env add Dev --base-url <url> --sync-folder workflows/dev
n8nac env auth set Dev --api-key-stdin
n8nac env use Dev
n8nac update-ai
```

## Claude Desktop MCP

Use the local MCP server for node search, schema lookup, examples, and validation.

```json
{
  "mcpServers": {
    "n8n-as-code": {
      "command": "npx",
      "args": ["--yes", "n8nac", "skills", "mcp"],
      "env": {
        "N8N_AS_CODE_PROJECT_DIR": "/absolute/path/to/your/n8n-project"
      }
    }
  }
}
```

## What Claude Uses

```text
User asks for a workflow change
Claude reads AGENTS.md and local skills
Claude resolves n8nac env status
Claude pulls or creates workflow files
Claude uses n8n node schemas and docs
Claude edits and validates the workflow
Claude pushes when asked
```

## Security

- Skills run locally.
- Workspace environment config can be committed when it contains no secrets.
- Remote API keys stay local.
- Local managed instance state stays in `n8n-manager` storage.

## Related

- [Getting Started](/docs/getting-started)
- [CLI Reference](/docs/usage/cli)
- [n8n-manager](/docs/usage/n8n-manager)
- [OpenClaw Plugin](/docs/usage/openclaw)
