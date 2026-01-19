# @n8n-as-code/cli

The main command-line interface for the **n8n-as-code** ecosystem. Manage, synchronize, and version control your n8n workflows locally.

## 🚀 Installation

```bash
npm install -g @n8n-as-code/cli
```

## 📖 Usage

### `init`
Configure your connection to an n8n instance and initialize your local project.
```bash
n8n-as-code init
```

### `pull`
Download all workflows from your n8n instance to local JSON files.
```bash
n8n-as-code pull
```

### `push`
Send your local modifications back to the n8n instance.
```bash
n8n-as-code push
```

### `list`
Display a table of all workflows and their current synchronization status.
```bash
n8n-as-code list
```

### `start`
Start real-time monitoring and synchronization. This command provides a live dashboard of changes.
```bash
n8n-as-code start
```

### `update-ai`
Generate or update AI context files (`AGENTS.md`, rules, snippets) and the local `n8n-agent` helper.
```bash
n8n-as-code update-ai
```

## 🏗 Part of the Ecosystem
This package works alongside:
- `@n8n-as-code/core`: The synchronization logic.
- `@n8n-as-code/agent-cli`: AI-integration tools.
- `vscode-extension`: Enhanced visual experience in VS Code.

## 📄 License
MIT
