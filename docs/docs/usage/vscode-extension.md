---
sidebar_label: VS Code Extension
title: VS Code Extension Guide
description: Learn how to use the n8n-as-code VS Code Extension for visual workflow editing with real-time synchronization.
---

# VS Code Extension Guide

The n8n-as-code VS Code Extension transforms VS Code into a powerful IDE for your n8n workflows. It provides visual editing, real-time synchronization, and workflow validation.

## 🎨 Features

### 🔄 Native Synchronization
The extension synchronizes your modifications in real-time. By default, every JSON file save (`Ctrl+S`) instantly sends changes to your n8n instance when auto-sync is enabled.

### 🗂️ Multi-Instance Support
Your workflows are automatically organized by instance to avoid mixing files from different environments:
`workflows/instance_name_user/my_workflow.json`

### 🎯 Visual Status Indicators
The tree view displays color-coded icons showing the sync status of each workflow at a glance:

- **✅ Green sync icon** - `IN_SYNC`: Workflow is synchronized between local and remote
- **📝 Orange pencil** - `MODIFIED_LOCALLY`: Local changes not yet pushed
- **☁️ Orange cloud** - `MODIFIED_REMOTELY`: Remote changes not yet pulled  
- **📁 Orange file** - `EXIST_ONLY_LOCALLY`: New local workflow not yet pushed
- **☁️ Orange cloud** - `EXIST_ONLY_REMOTELY`: New remote workflow not yet pulled
- **🔴 Red alert** - `CONFLICT`: Both local and remote modified since last sync
- **🗑️ Grey trash** - `DELETED_LOCALLY` / `DELETED_REMOTELY`: Workflow deleted on one side

### 🛡️ Persistent Conflict Resolution UI
Workflows in **conflict** or **deleted** states become **expandable tree items** with child action buttons, ensuring you never lose track of issues that need resolution:

**For Conflicts:**
- **📄 Show Diff** - Opens a side-by-side diff view comparing local and remote versions
- **✅ Keep Local Version** - Force push local changes to remote (overwrite remote)
- **☁️ Keep Remote Version** - Force pull remote changes to local (overwrite local)

**For Deletions:**
- **🗑️ Confirm Deletion** - Delete the workflow from n8n
- **↩️ Restore File** - Restore the local file from remote

These actions remain visible in the tree until resolved, preventing conflicts from being forgotten or lost.

### 🛠️ Built-in Validation & Snippets
Your environment is automatically configured with validation and snippets upon opening:
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
1. Click the **n8n** icon in the Activity Bar
2. Click **n8n: Configure** (or the Configure link shown in the panel)
3. In the configuration screen, set:
   - Host + API Key
   - Sync Folder + Sync Mode
   - Project to sync
4. Click **Apply Changes**

The extension writes these values into VS Code workspace settings (`n8n.*`).

### Apply Changes (safety)
When you change critical settings (host / API key / sync folder / project / sync mode), synchronization is paused and an **Apply Changes** action appears (status bar and n8n panel). This prevents partial or accidental settings edits from triggering unexpected sync behavior.

### Settings Reference

| Parameter | Description | Default |
| :--- | :--- | :--- |
| `n8n.host` | URL of your n8n instance | - |
| `n8n.apiKey` | Your n8n API Key | - |
| `n8n.syncFolder` | Local storage folder | `workflows` |
| `n8n.syncMode` | Sync mode: `auto` (watch mode) or `manual` | `auto` |
| `n8n.pollInterval` | Polling interval for auto mode (ms) | 3000 |
| `n8n.projectId` | Project ID to sync (selected via Configure) | - |
| `n8n.projectName` | Project name (selected via Configure) | - |

## 📖 Usage

### Connecting to n8n
The extension automatically connects to n8n when:
1. You have configured `n8n.host` and `n8n.apiKey` in settings
2. You open a workspace with the extension
3. The extension validates the connection automatically

If connection fails, check the Output panel (View > Output, select "n8n-as-code") for error details.

### Pulling Workflows
1. Click the refresh button in the n8n panel
2. All workflows will be downloaded to your local `workflows` directory
3. Workflows are organized by instance

### Editing Workflows
1. Click a workflow in the tree view to open the JSON editor
2. For split view with canvas preview:
   - Click **"Open Workspace"** action button
   - Or use the context menu option
3. The split view shows:
   - **Left**: JSON editor
   - **Right**: n8n canvas preview
4. Make changes in the JSON editor
5. Save (`Ctrl+S`) to sync to n8n (when auto-sync is enabled)

### Creating New Workflows
To create a new workflow:
1. Create a new JSON file in your workflows directory
2. Use the n8n schema for structure guidance
3. The extension will detect the new file and sync it to n8n automatically

### Resolving Conflicts
When a workflow has a conflict (both local and remote modified):
1. The workflow appears with a **🔴 red alert icon** in the tree
2. Expand the workflow to see resolution actions:
   - **📄 Show Diff** - View differences between versions
   - **✅ Keep Local Version** - Push your local changes
   - **☁️ Keep Remote Version** - Pull remote changes
3. Click the desired action to resolve
4. The workflow returns to normal sync state

### Handling Deletions
When a workflow is deleted locally or remotely:
1. The workflow appears with a **🗑️ grey trash icon** in the tree
2. Expand the workflow to see actions:
   - **🗑️ Confirm Deletion** - Delete from n8n
   - **↩️ Restore File** - Restore the local file
3. Choose an action to resolve the deletion state

## 🔄 Sync Behavior

### Auto Sync (Default)
- Changes are automatically pushed to n8n on save
- Remote changes are automatically pulled
- Conflicts require manual resolution
- Best for most use cases

### Manual Sync
- Changes are only synced when you manually trigger sync actions
- Gives you more control over when changes are pushed
- Use the action buttons in the tree view for manual operations

### 3-Way Merge Detection
The extension uses a sophisticated 3-way merge algorithm to detect conflicts:
- Tracks the **base** state (last synced version) in `.n8n-state.json`
- Compares **local** version (file on disk)
- Compares **remote** version (workflow in n8n)
- Only flags as conflict when both local AND remote have changed since the base
- This prevents false positive conflicts and enables deterministic sync behavior

## 🤝 AI Agent Support

### Context Generation for AI Assistants
The extension works with the CLI to generate context files that empower AI coding assistants:
- `AGENTS.md`: Instructions for AI assistants on n8n workflow development
- `.vscode/n8n.code-snippets`: Code snippets for autocomplete (generated from n8n-nodes-index.json)
- `.vscode/n8n.code-snippets`: Code snippets for common n8n node patterns

### How AI Assistants Leverage These Files
AI coding assistants (like Cursor, Copilot, Claude, etc.) can use these generated files to:
- Understand n8n workflow structure and best practices
- Provide accurate code suggestions based on node schemas
- Validate workflow JSON against the n8n schema
- Generate common node patterns using pre-built snippets

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
- Check network connectivity

**Sync not working**
- Check if auto-sync is enabled in settings
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
- [Contribution Guide](/docs/contribution): Understand the architecture

---

*The VS Code Extension provides the best user experience for editing n8n workflows with real-time synchronization and visual feedback.*
