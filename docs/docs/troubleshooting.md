---
sidebar_label: Troubleshooting
title: Troubleshooting
description: Solutions to common issues with n8n-as-code — connection, sync, VS Code extension, Claude plugin, OpenClaw, and CLI.
---

# Troubleshooting

Quick fixes for the most common issues. If your problem isn't listed here, check [GitHub Issues](https://github.com/EtienneLescot/n8n-as-code/issues) or ask in [GitHub Discussions](https://github.com/EtienneLescot/n8n-as-code/discussions).

## Connection & Authentication

### Can't connect to n8n instance

1. **Verify the URL is reachable:**
   ```bash
   curl -I https://your-n8n-instance.com
   ```
2. **Test the API key:**
   ```bash
   curl -H "X-N8N-API-KEY: your-api-key" https://your-n8n-instance.com/api/v1/workflows
   ```
3. **Re-run init** to reconfigure:
   ```bash
   n8nac init
   ```

### "Invalid API key" or "Unauthorized"

- Go to n8n **Settings → API** and regenerate the key
- Check that the key has workflow read/write permissions
- Re-run `n8nac init` to save the new key

## VS Code Extension

### Extension not loading workflows

- Check that `n8nac-config.json` exists at the project root
- Open **View → Output** and select "n8n-as-code" for errors
- Click the **refresh button** in the n8n panel
- Verify your n8n instance is accessible from the network

### Canvas not showing in split view

- Check the n8n host URL (test it in a browser)
- Ensure CORS is configured if you're self-hosting n8n

### Extension not appearing after install

1. Press `Ctrl+Shift+P` → "Developer: Reload Window"
2. If still missing, install manually from the `.vsix` file (Extensions → `...` → Install from VSIX)

## Sync Issues

### Push or pull fails with "conflict"

Both sides changed since the last sync. Resolve:

```bash
# Keep your local version
n8nac resolve <workflowId> --mode keep-current

# Or keep the remote version
n8nac resolve <workflowId> --mode keep-incoming
```

In VS Code: expand the conflicted workflow in the tree → use the action buttons (Keep Local / Keep Remote / Show Diff).

### Changes made in n8n UI not showing locally

Fetch then pull:
```bash
n8nac list          # refresh the view
n8nac pull <id>     # download the updated workflow
```

In VS Code: right-click the workflow → **Fetch**, then **Pull**.

### Push rejected (OCC error)

Someone (or you in the n8n UI) modified the workflow remotely since your last pull. Pull the latest version first, or resolve if a conflict is flagged.

## Claude Plugin

### Plugin not recognized after install

1. Make sure you ran both commands:
   ```text
   /plugin marketplace add EtienneLescot/n8n-as-code
   /plugin install n8n-as-code@n8nac-marketplace
   ```
2. Restart Claude Code after installing
3. Check that the workspace is initialized:
   ```bash
   npx --yes n8nac init
   npx --yes n8nac update-ai
   ```

### Claude hallucinates nodes or parameters

This usually means `AGENTS.md` is missing or outdated:

1. Regenerate it:
   ```bash
   npx --yes n8nac update-ai
   ```
2. Verify `AGENTS.md` exists at the project root
3. Ask Claude to show which section of `AGENTS.md` it is following — if it can't, it's not using the skill correctly

### MCP server not connecting (Claude Desktop)

1. Check `claude_desktop_config.json` syntax — must be valid JSON
2. Verify `npx --yes n8nac skills mcp` runs without errors in your terminal
3. Set `N8N_AS_CODE_PROJECT_DIR` to the **absolute** path of your project
4. Restart Claude Desktop after config changes

## OpenClaw Plugin

### Setup wizard fails

1. Make sure the plugin is installed:
   ```bash
   openclaw plugins install @n8n-as-code/n8nac
   ```
   If you migrated from `@n8n-as-code/openclaw-plugin`, run `openclaw plugins uninstall n8nac` first and then reinstall the package.
2. Check that `n8nac` (or `npx n8nac`) is available in your PATH
3. Verify your n8n instance URL and API key

### Plugin not active after setup

Restart the OpenClaw gateway:
```bash
openclaw gateway restart
```

Check status:
```bash
openclaw n8nac:status
```

### Reset and start over

```bash
rm -rf ~/.openclaw/n8nac
openclaw n8nac:setup
openclaw gateway restart
```

## CLI

### "Command not found: n8nac"

```bash
# Install globally
npm install -g n8nac

# Or use npx
npx --yes n8nac --version

# Check your PATH includes npm global bin
npm config get prefix
export PATH="$PATH:$(npm config get prefix)/bin"
```

### "Configuration not found"

Run `n8nac init` to create `n8nac-config.json`. Verify it exists:
```bash
cat n8nac-config.json
```

### Workflow validation error

```bash
# Check JSON syntax
jq . workflows/my-workflow.json
```

Common causes: missing required fields, invalid node types, malformed expressions. Open the workflow in the n8n editor to let n8n validate and fix it, then pull the corrected version.

## AI Context

### `AGENTS.md` missing or outdated

```bash
n8nac update-ai
```

This regenerates `AGENTS.md` and `.vscode/n8n.code-snippets`. Run it again after upgrading n8n-as-code or changing instances.

### AI assistant doesn't give good n8n suggestions

1. Check that `AGENTS.md` exists in the project root
2. Regenerate: `n8nac update-ai`
3. For Cursor/Copilot: ensure the workspace is open and `AGENTS.md` is in scope
4. For Claude: ensure the plugin is installed or MCP server is configured

## Recovery

### Complete reset

```bash
# Backup first
cp -r workflows/ workflows-backup-$(date +%Y%m%d)

# Reset config
rm n8nac-config.json

# Reinitialize
n8nac init
n8nac list
n8nac pull <workflowId>
```

### Restore a workflow from n8n

```bash
n8nac pull <workflowId>
```

### Restore from Git

```bash
git checkout HEAD -- workflows/my-workflow.workflow.ts
```

## CLI Package Conflicts

### Commands missing after update / `@n8n-as-code/cli` conflict

If `n8nac --help` shows an old, shorter command list after updating, you may have both the legacy `@n8n-as-code/cli` package and the current `n8nac` package installed at the same time. The legacy package can shadow the new one.

**Fix:** uninstall the old package.

```bash
# Global installation
npm uninstall -g @n8n-as-code/cli

# Project dependency
npm uninstall @n8n-as-code/cli
# or with bun:
bun remove @n8n-as-code/cli
```

After removing it, verify the correct version is active:

```bash
n8nac --version
n8nac --help   # should show the full command list
```

The current package is **`n8nac`** (on npm). `@n8n-as-code/cli` is no longer maintained.

## Still Stuck?

When asking for help, include:

```bash
n8nac --version
node --version
cat n8nac-config.json   # redact the API key
```

- [**GitHub Discussions**](https://github.com/EtienneLescot/n8n-as-code/discussions) — questions and ideas
- [**GitHub Issues**](https://github.com/EtienneLescot/n8n-as-code/issues) — bug reports
