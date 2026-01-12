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

### `watch`
Enable real-time synchronization. Every time you save a local file, it's pushed to n8n. Includes interactive conflict resolution.
```bash
n8n-as-code watch
```

## 🏗 Part of the Ecosystem
This package works alongside:
- `@n8n-as-code/core`: The synchronization logic.
- `@n8n-as-code/agent-cli`: AI-integration tools.
- `vscode-extension`: Enhanced visual experience in VS Code.

## 📄 License
MIT
