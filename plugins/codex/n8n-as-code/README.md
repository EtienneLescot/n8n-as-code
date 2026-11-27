# n8n-as-code plugin for Codex and ChatGPT

Plugin package for the OpenAI plugin directory (Codex format). It contains skills only, with no MCP server.

## Included

- `.codex-plugin/plugin.json`: package identity, listing metadata, and icons
- `skills/n8n-architect/SKILL.md`: generated from the same source as the Claude, Cursor, and OpenClaw plugins (`npm run build:adapters --workspace=packages/skills`)
- `assets/icon.svg`: listing and composer icon

## Package for submission

Zip the contents of this folder, with `.codex-plugin/` at the root of the archive:

```bash
cd plugins/codex/n8n-as-code
zip -r ../n8n-as-code-codex-plugin.zip . -x README.md
```

Upload the ZIP from the Plugins page of the OpenAI Platform dashboard.

## Documentation

https://n8nascode.dev/docs/usage/codex-plugin/
