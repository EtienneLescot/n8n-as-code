# <img src="https://raw.githubusercontent.com/EtienneLescot/n8n-as-code/main/res/logo.png" alt="n8n-as-code logo" width="32" height="32"> @n8n-as-code/cli

The main command-line interface for the **n8n-as-code** ecosystem. Manage, synchronize, and version control your n8n workflows locally.

## Installation

```bash
npm install -g @n8n-as-code/cli
```

> **Note**: The command has been renamed to `n8nac`. The legacy `n8n-as-code` command is still available but deprecated.

## 📖 Usage

### `init`
Configure your connection to an n8n instance and select the project to sync.

```bash
n8nac init
```

This creates/updates `n8nac.json` in the current folder and stores your API key securely (not in the repo).

### `switch`
Switch the active n8n project (writes `projectId` / `projectName` in `n8nac.json`).

```bash
n8nac switch
```

### `pull`
Download all workflows from your n8n instance to local JSON files.
```bash
n8nac pull
```

### `push`
Send your local modifications back to the n8n instance.
```bash
n8nac push
```

### `list`
Display a table of all workflows and their current synchronization status.
```bash
n8nac list
```

### `start`
Start real-time monitoring and synchronization. This command provides a live dashboard of changes.
```bash
n8nac start
```

Use manual mode for fully interactive prompts:

```bash
n8nac start --manual
```

### `update-ai`
Generate or update AI context files (`AGENTS.md`, rules, snippets) and the local `n8nac-skills` helper.
```bash
n8nac update-ai
```

### Legacy alias
The legacy `n8n-as-code` command is still available (deprecated). Prefer `n8nac`.

## 🏗 Part of the Ecosystem
This package works alongside:
- `@n8n-as-code/sync`: The synchronization logic.
- `@n8n-as-code/skills`: AI-integration tools (formerly `skills`).
- `vscode-extension`: Enhanced visual experience in VS Code.

## 📄 License
MIT
