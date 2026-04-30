# <img src="https://raw.githubusercontent.com/EtienneLescot/n8n-as-code/main/res/logo.png" alt="n8n-as-code logo" width="32" height="32"> n8n-as-code

**The AI skill and editor integration that gives your coding agent n8n superpowers.**

`n8n-as-code` turns compatible editors into a GitOps and AI workspace for n8n workflows: pull from n8n, edit locally, search nodes and templates instantly, validate before deploy, and push changes back with full control.

Published for both the Microsoft Marketplace and Open VSX.

![n8n-as-code demo](https://raw.githubusercontent.com/EtienneLescot/n8n-as-code/main/res/n8n-as-code.gif)

---

## ⚡ Quick Start

1. Install `n8n-as-code` from the Microsoft Marketplace or Open VSX.
2. Open a folder or `.code-workspace` before initialization.
3. Open the `n8n` view, run `n8n: Configure`, enter the URL and API key of the existing n8n instance you want to use, load the target project, then save and activate the config.
4. Refresh the explorer to list your workflows and start syncing.

Marketplace links:

- Microsoft Marketplace: https://marketplace.visualstudio.com/items?itemName=etienne-lescot.n8n-as-code
- Open VSX: https://open-vsx.org/extension/etienne-lescot/n8n-as-code

Prerelease builds are published on the VS Code Marketplace prerelease channel when available. If you use a prerelease extension with manual CLI commands or generated agent context, keep the CLI on the same prerelease line:

```bash
npx --yes n8nac@next <command>
npx --yes @n8n-as-code/n8n-manager@next <command>
```

Open VSX prereleases are not published; use the stable Open VSX extension unless you install from a local development build.

---

## What You Get

### GitOps for n8n
Use a deliberate pull, edit, validate, push workflow instead of editing directly in the browser. `n8n-as-code` keeps local files and the remote n8n instance aligned without hiding sync decisions from you.

### Built-in AI Context
The editor integration is backed by the shared `n8nac` CLI and `@n8n-as-code/skills` package, so agents can work with the same embedded n8n ontology used across the broader project:

- JSON schema validation for live feedback
- snippets for common nodes and workflow patterns
- `AGENTS.md` generation for Copilot, Cursor, Windsurf, Claude Code, and similar tools
- local search across nodes, docs, and workflow templates

### Workflow Search
Use `Find Workflow` from the n8n view or Command Palette to jump straight to a workflow by partial name, workflow ID, or local filename instead of scrolling long trees.

### Conflict Protection
If a workflow diverges locally and remotely, synchronization pauses instead of guessing. You can inspect the diff and decide whether to keep the local or remote version.

### Split View
Open a live split view to compare the code and the n8n canvas while you edit. This is useful for validating structural changes before you push.

### Multi-Instance Workspace Layout
Workflows are grouped by instance and project so multiple environments can coexist cleanly in the same workspace.

### Shared Product Surface
This editor distribution is one entry point into the wider `n8n-as-code` product surface:

- editor integration via Microsoft Marketplace and Open VSX
- `n8nac` CLI for direct terminal workflows
- AI skills for coding agents
- Claude Code and OpenClaw integrations in the monorepo

---

## ⚙️ Configuration

### v2 migration note

Version 2 makes `n8n-manager` the source of truth for instance registration, API keys, managed Docker runtimes, tunnels, and project defaults. Existing workspace-local instance libraries are no longer migrated automatically; reconfigure the extension through `n8n: Configure`, then save explicit workspace overrides when the workspace should differ from the global default.

The extension reads global instances and API keys from n8n-manager. `n8nac-config.json` at the workspace root stores only workspace overrides such as pinned instance, selected project, and sync folder.

The legacy native editor settings below still exist as compatibility fallbacks:

| Parameter | Description | Default |
| :--- | :--- | :--- |
| `n8n.host` | URL of your n8n instance | - |
| `n8n.apiKey` | Your n8n API Key | - |
| `n8n.syncFolder` | Local storage folder | `workflows` |

In the configuration screen:

- `Add instance` creates or updates a global n8n-manager instance
- the global selector changes the global active instance
- the workspace controls explicitly pin an instance or sync folder for the current workspace
- `Save workspace context` persists workspace-level project and sync context

## Philosophy

`n8n-as-code` is not a browser companion. It is a local-first workflow environment for n8n.

- your agent works from real local files
- the n8n schema and docs are available offline in the installed assets
- sync is explicit, reviewable, and Git-friendly

That is why the same project can power editor workflows, CLI automation, Claude integrations, and OpenClaw without changing the underlying mental model.

---

## 📄 License
MIT
