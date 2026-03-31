---
sidebar_label: VS Code Extension
title: VS Code Extension Guide
description: Learn how to use the n8n-as-code VS Code Extension for visual workflow editing with explicit git-like workflow controls.
---

# VS Code Extension Guide

The n8n-as-code VS Code Extension transforms VS Code into a focused IDE for n8n workflows. It provides visual editing, explicit git-like workflow controls, and workflow validation.

## 🎨 Features

### 🔄 Git-like Synchronization
The extension follows a git-like workflow with explicit commands. View workflow status, pull changes, and push local changes using the context menu. Local file additions and deletions are reflected in the tree, while remote state is refreshed when you ask for it.

### 🗂️ Multi-Instance Support
Your workflows are automatically organized by instance to avoid mixing files from different environments:
`workflows/instance_name_user/my_workflow.json`

### 🎯 Visual Status Indicators
The tree view displays color-coded icons showing the sync status of each workflow at a glance:

- **📄 Plain file** - `TRACKED`: Both local and remote exist (in sync)
- **☁️ Blue cloud** - `EXIST_ONLY_REMOTELY`: Remote workflow not yet pulled locally
- **📄+ Orange file-add** - `EXIST_ONLY_LOCALLY`: New local workflow not yet pushed
- **🔴 Red alert** - `CONFLICT`: Both sides modified since last sync, requires resolution

### 🛡️ Persistent Conflict Resolution UI
Workflows in **conflict** state become **expandable tree items** with child action buttons, ensuring you never lose track of issues that need resolution:

**For Conflicts:**
- **📄 Show Diff** - Opens a side-by-side diff view comparing local and remote versions
- **✅ Keep Local Version** - Force push local changes to remote (overwrite remote)
- **☁️ Keep Remote Version** - Force pull remote changes to local (overwrite local)

These actions remain visible in the tree until resolved, preventing conflicts from being forgotten or lost.

### 🛠️ Built-in Validation & Snippets
Your environment is automatically configured with validation and snippets upon opening:
- **JSON Validation**: n8n schema applied for input assistance and live error detection
- **Snippet Library**: Ready-to-use node templates (`node:webhook`, `node:code`, etc.)

### 🍱 Split View
Visualize the n8n canvas beside your code using the integrated Webview while editing the workflow file. This is the ideal interface for structurally validating changes before you push.

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
3. Click **Add instance** if you want to register a new n8n environment in this workspace
4. Enter the **Host** and **API Key** of the existing n8n instance you want to connect
5. Click **Load projects**, then choose the **Project to sync**
6. Set the **Sync Folder** (default: `workflows`)
7. Click **Save and activate config**
8. Click **Initialize n8n as code** in the n8n view to initialize the workspace and load the active project context

The extension stores saved instance configs plus the active instance selection in `n8nac-config.json`. Legacy `n8n.*` VS Code settings remain as a fallback compatibility layer, not the primary source of truth.

### Switching Instances

Use either:

- the **Select instance** dropdown in **n8n: Configure** to load a saved config into the form, then click **Save and activate config**
- the **n8n: Select Instance** command from the Command Palette

This lets one workspace keep multiple saved instance configs while the runtime stays bound to one active instance at a time.

### Apply Changes (safety)
When you change critical settings (host / API key / sync folder / project), synchronization is paused and an **Apply Changes** action appears (status bar and n8n panel). This prevents partial or accidental settings edits from triggering unexpected sync behavior.

### Settings Reference

| Parameter | Description | Default |
| :--- | :--- | :--- |
| `n8n.host` | URL of your n8n instance | - |
| `n8n.apiKey` | Your n8n API Key | - |
| `n8n.syncFolder` | Local storage folder | `workflows` |
| `n8n.projectId` | Project ID to sync (selected via Configure) | - |
| `n8n.projectName` | Project name (selected via Configure) | - |

## 📖 Usage

### Connecting to n8n
The extension automatically connects to n8n when:
1. You have initialized the workspace or configured the required connection values
2. You open a workspace with the extension
3. The extension validates the connection automatically

If connection fails, check the Output panel (View > Output, select "n8n-as-code") for error details.

### Fetching & Pulling Workflows
1. Click the refresh button in the n8n panel to update the remote state cache and see current status
2. Right-click a workflow and select **Pull** to download it locally
3. Workflows are organized by instance in your local directory

### Finding Workflows Fast
When your workspace contains hundreds of workflows, use **Find Workflow** from the n8n view title bar or the Command Palette.

- Search is fuzzy and case-insensitive
- Matches workflow name, workflow ID, and local filename/path
- Selecting a result opens the local file immediately when available, or opens the workflow in n8n for remote-only entries

### Editing Workflows
1. Click a workflow in the tree view to open the JSON editor
2. For split view with canvas preview:
    - Click **"Open Workspace"** action button
    - Or use the context menu option
3. The split view shows:
   - **Left**: JSON editor
   - **Right**: n8n canvas preview
4. Make changes in the JSON editor
5. Right-click the workflow in the tree view and select **Push** to send your changes to n8n

### Creating New Workflows
To create a new workflow:
1. Create a new JSON file in your workflows directory
2. Use the n8n schema for structure guidance
3. Right-click the file in the tree view and select **Push** to upload it to n8n

### Resolving Conflicts
When a workflow has a conflict (both local and remote modified):
1. The workflow appears with a **🔴 red alert icon** in the tree
2. Expand the workflow to see resolution actions:
   - **📄 Show Diff** - View differences between versions
   - **✅ Keep Local Version** - Push your local changes
   - **☁️ Keep Remote Version** - Pull remote changes
3. Click the desired action to resolve
4. The workflow returns to `TRACKED` state

## 🔄 Sync Behavior

### Git-like Explicit Sync
All sync operations that move workflow state are **user-triggered**. Follow this git-like pattern:

1. **List**: Right-click a workflow or use the tree refresh to see current sync status
2. **Fetch**: Fetch remote state to update the local cache for accurate status
3. **Pull**: Download remote changes you want to incorporate
4. **Edit**: Make your changes locally
5. **Push**: Upload your changes back to n8n

This explicit model gives you full control and prevents unexpected overwrites.

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
- Use **Fetch** from the context menu to refresh remote state
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

*The VS Code Extension provides the most direct way to review status, edit locally, preview structure, and push intentionally.*
