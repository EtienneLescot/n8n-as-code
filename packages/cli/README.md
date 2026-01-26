# @n8n-as-code/cli

The main command-line interface for the **n8n-as-code** ecosystem. Manage, synchronize, and version control your n8n workflows locally.

## 🚀 Installation

```bash
npm install -g @n8n-as-code/cli
```

> **Note**: The command has been renamed to `n8nac`. The legacy `n8n-as-code` command is still available but deprecated.

## 📖 Usage

### `init`
Configure your connection to an n8n instance and initialize your local project.
```bash
n8nac init
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

### `update-ai`
Generate or update AI context files (`AGENTS.md`, rules, snippets) and the local `n8nac-skills` helper.
```bash
n8nac update-ai
```

## 🏗 Part of the Ecosystem
This package works alongside:
- `@n8n-as-code/sync`: The synchronization logic.
- `@n8n-as-code/skills`: AI-integration tools (formerly `agent-cli`).
- `vscode-extension`: Enhanced visual experience in VS Code.

## 📄 License
MIT
