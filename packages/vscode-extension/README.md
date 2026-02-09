# <img src="https://raw.githubusercontent.com/EtienneLescot/n8n-as-code/main/res/logo.png" alt="n8n-as-code logo" width="32" height="32"> n8n-as-code : VS Code Extension

**n8n-as-code** transforms VS Code into a powerful IDE for your n8n workflows. Your automations become code: Git versioning, AI-assisted editing, and seamless synchronization.

![n8n-as-code demo](https://raw.githubusercontent.com/EtienneLescot/n8n-as-code/main/res/n8n-as-code.gif)

---

## ⚡ Quick Start

1.  **Installation**: Install the extension from the Marketplace.
2.  **Connection**: Click the **n8n** icon in the Activity Bar, then click the **Gear (⚙️)** to configure your `Host` and `API Key`. Your projects load automatically, with the Personal project pre-selected by default.
3.  **Import**: Use the refresh button (**Pull Workflows**) to bring in your existing workflows.

---

## 🎨 Features

### 🔄 Native Synchronization
The extension synchronizes your modifications in real-time. By default, every JSON file save (`Ctrl+S`) instantly sends changes to your n8n instance.

### 🛡️ Conflict Management
The system intelligently detects conflicts to prevent data loss:
- **Protection**: If a workflow is modified simultaneously on n8n and locally, synchronization stops.
- **Resolution**: An interface allows you to compare versions (Diff View) and choose which one to keep (Force Push/Pull).

### 🗂️ Multi-Instance Support
Your workflows are automatically organized by instance to avoid mixing files from different environments:
`workflows/instance_name_user/my_workflow.json`

### 🤖 Built-in AI Assistance
Your environment is automatically configured for AI upon opening:
-   **JSON Validation**: n8n schema applied for input assistance and live error detection.
-   **Snippet Library**: Ready-to-use node templates (`node:webhook`, `node:code`, etc.).
-   **`AGENTS.md` Context**: Automated documentation generated using `@n8n-as-code/skills` so that Cline, Cursor, Windsurf, or Copilot can master your workflow structure.

### 🛠️ Integrated Tooling
The extension leverages the `@n8n-as-code/skills` package to:
- **Index Nodes**: Pre-generate a searchable index of available n8n nodes.
- **AI Initialization**: Power the `n8n.initializeAI` command to bootstrap your environment with relevant context.

### 🍱 Split View
Visualize the n8n canvas in real-time using the integrated Webview while editing the JSON code. This is the ideal interface for visually validating your structural changes.

---

## ⚙️ Configuration

The extension uses native VS Code settings (accessible via the Gear ⚙️):

| Parameter | Description | Default |
| :--- | :--- | :--- |
| `n8n.host` | URL of your n8n instance | - |
| `n8n.apiKey` | Your n8n API Key | - |
| `n8n.syncMode` | `auto` (push on save) or `manual` | `auto` |
| `n8n.syncFolder` | Local storage folder | `workflows` |
| `n8n.pollInterval`| Refresh frequency (ms) | `3000` |

---

## 📄 License
MIT
