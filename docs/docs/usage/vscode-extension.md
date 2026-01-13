---
sidebar_label: VS Code Extension
title: VS Code Extension Guide
description: Learn how to use the n8n-as-code VS Code Extension for visual workflow editing with real-time synchronization.
---

# VS Code Extension Guide

The n8n-as-code VS Code Extension transforms VS Code into a powerful IDE for your n8n workflows. It provides visual editing, real-time synchronization, and AI assistance.

## 🎨 Features

### 🔄 Native Synchronization
The extension synchronizes your modifications in real-time. By default, every JSON file save (`Ctrl+S`) instantly sends changes to your n8n instance.

### 🛡️ Conflict Management
The system intelligently detects conflicts to prevent data loss:
- **Protection**: If a workflow is modified simultaneously on n8n and locally, synchronization stops
- **Resolution**: An interface allows you to compare versions (Diff View) and choose which one to keep

### 🗂️ Multi-Instance Support
Your workflows are automatically organized by instance to avoid mixing files from different environments:
`workflows/instance_name_user/my_workflow.json`

### 🤖 Built-in AI Assistance
Your environment is automatically configured for AI upon opening:
- **JSON Validation**: n8n schema applied for input assistance and live error detection
- **Snippet Library**: Ready-to-use node templates (`node:webhook`, `node:code`, etc.)

### 🍱 Split View
Visualize the n8n canvas in real-time using the integrated Webview while editing the JSON code. This is the ideal interface for visually validating your structural changes.

## ⚙️ Installation

### From VS Code Marketplace
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "n8n-as-code"
4. Click Install

### From VSIX File
1. Download the `.vsix` file from releases
2. In VS Code, go to Extensions
3. Click "..." menu and select "Install from VSIX"
4. Select the downloaded file

## 🔧 Configuration

### Initial Setup
1. Click the n8n icon in the Activity Bar
2. Click the gear icon (⚙️) to open settings
3. Enter your n8n host URL (e.g., `https://n8n.yourdomain.com`)
4. Enter your n8n API key (found in Settings > API)
5. Click "Connect"

### Settings Reference

| Parameter | Description | Default |
| :--- | :--- | :--- |
| `n8n.host` | URL of your n8n instance | - |
| `n8n.apiKey` | Your n8n API Key | - |
| `n8n.syncMode` | `auto` (push on save) or `manual` | `auto` |
| `n8n.syncFolder` | Local storage folder | `workflows` |
| `n8n.pollInterval`| Refresh frequency (ms) | `3000` |

## 📖 Usage

### Connecting to n8n
1. Open the n8n panel from the Activity Bar
2. Click the gear icon (⚙️)
3. Enter your connection details
4. Click "Connect"

### Pulling Workflows
1. Click the refresh button in the n8n panel
2. All workflows will be downloaded to your local `workflows` directory
3. Workflows are organized by instance

### Editing Workflows
1. Double-click a workflow in the tree view
2. The workflow opens in a split view:
   - **Left**: JSON editor
   - **Right**: n8n canvas preview
3. Make changes in the JSON editor
4. Save (`Ctrl+S`) to auto-sync to n8n

### Creating New Workflows
1. Right-click in the workflow tree view
2. Select "New Workflow"
3. Enter a name for the workflow
4. The workflow is created locally and in n8n

### Deleting Workflows
1. Right-click a workflow in the tree view
2. Select "Delete"
3. Confirm deletion
4. The workflow is removed from both local and n8n

## 🔄 Sync Modes

### Auto Sync (Default)
- Changes are automatically pushed to n8n on save
- Remote changes are pulled automatically
- Best for most use cases

### Manual Sync
- Changes are only synced when you click the sync button
- Gives you more control over when changes are pushed
- Useful for batch operations

## 🛡️ Conflict Resolution

### What Triggers a Conflict
- You edit a workflow locally while someone else edits it in n8n
- You have unsynced changes and someone else modifies the workflow

### Resolving Conflicts
1. The extension detects a conflict and stops syncing
2. A notification appears with options:
   - **View Diff**: Compare local and remote versions
   - **Keep Local**: Overwrite remote with your local version
   - **Keep Remote**: Discard local changes and use remote version
   - **Merge Manually**: Open both versions for manual merging

## 🤖 AI Features

### Context Generation
The extension automatically generates AI context files:
- `AGENTS.md`: Instructions for AI assistants
- `n8n-schema.json`: Validation schema
- `.vscode/n8n.code-snippets`: Code snippets

### Using AI Assistants
With the context files, AI assistants like Cursor, Copilot, or Claude can:
- Understand n8n workflow structure
- Provide accurate code suggestions
- Validate workflow JSON
- Generate common node patterns

## 🎯 Tips & Best Practices

### Workflow Organization
- Use folders in n8n to organize workflows
- The extension mirrors the folder structure locally
- Keep related workflows together

### Version Control
- Commit workflow JSON files to Git
- Use meaningful commit messages
- Review changes using Git diff

### Backup Strategy
- Regular commits to Git
- Export workflows from n8n as backup
- Use the extension's sync as primary backup

## 🚨 Troubleshooting

### Common Issues

**Extension not connecting**
- Check n8n URL and API key
- Verify n8n instance is accessible
- Check CORS settings on n8n

**Sync not working**
- Check sync mode in settings
- Verify file permissions
- Check network connectivity

**Canvas not loading**
- Check n8n URL is correct
- Verify API key has proper permissions
- Try refreshing the webview

### Getting Help
- Check the [Troubleshooting guide](/docs/troubleshooting)
- Search [existing issues](https://github.com/EtienneLescot/n8n-as-code/issues)
- Ask in [GitHub Discussions](https://github.com/EtienneLescot/n8n-as-code/discussions)

## 📚 Next Steps

- [CLI Guide](/docs/usage/cli): Learn about command-line automation
- [Contributor Guide](/docs/contributors): Understand the architecture
- [API Reference](/api): Developer documentation

---

*The VS Code Extension provides the best user experience for editing n8n workflows with real-time synchronization and visual feedback.*