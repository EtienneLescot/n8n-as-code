# <img src="https://raw.githubusercontent.com/EtienneLescot/n8n-as-code/main/res/logo.png" alt="n8n-as-code logo" width="32" height="32"> n8n-as-code : VS Code Extension

**n8n-as-code** transforms VS Code into a powerful IDE for your n8n workflows. Your automations become code: Git versioning, AI-assisted editing, and seamless synchronization.

![n8n-as-code demo](https://raw.githubusercontent.com/EtienneLescot/n8n-as-code/main/res/n8n-as-code.gif)

---

## ⚡ Quick Start

1.  **Installation**: Install the extension from the Marketplace.
2.  **Workspace**: Open a folder or a `.code-workspace` in VS Code before initialization. The extension requires an active workspace to index files and settings.
3.  **Connection**: Click the **n8n** icon in the Activity Bar, then click the **Gear (⚙️)** or the configure button to configure your `Host` and `API Key`. Your projects load automatically, with the Personal project pre-selected by default.
4.  **Import**: Use the refresh button (**Refresh**) to see your existing workflows.

---

## 🎨 Features

### 🔄 Git-like Synchronization
The extension follows a git-like model: **List**, **Pull**, and **Push**. You have full control over when changes are synchronized.

### 🛡️ Conflict Management
The system intelligently detects conflicts to prevent data loss:
- **Protection**: If a workflow is edited simultaneously on n8n and locally, synchronization stops.
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
| `n8n.syncFolder` | Local storage folder | `workflows` |

---

## 📄 License
MIT
