---
sidebar_position: 1
title: Getting Started
description: Get up and running with n8nac in minutes. Learn how to install, configure, and start managing your n8n workflows as code.
---

# Getting Started with n8nac

Welcome to n8nac! This guide will help you set up and start using n8nac to manage your n8n workflows as code.

## 🎯 What You'll Learn

In this section, you'll learn how to:

1. Install n8nac VS Code Extension or CLI
2. Configure your connection to n8n
3. Sync your existing workflows
4. Start editing workflows in VS Code

## 📋 Prerequisites

Before you begin, make sure you have:

- **n8n instance** running (self-hosted or cloud)
- **API key** from your n8n instance (found in Settings > API)
- **VS Code** (recommended for the best experience)

## 🚀 Quick Start: VS Code Extension (Recommended)

The VS Code Extension provides the best user experience with visual editing, real-time sync, and workflow validation.

### Step 1: Install VS Code Extension

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "n8nac"
4. Click Install

### Step 2: Configure Connection

1. Click the n8n icon in the Activity Bar
2. Click the gear icon (⚙️) to open settings
3. Enter your n8n host URL (e.g., `https://n8n.yourdomain.com`)
4. Enter your n8n API key
5. The extension automatically loads your projects and pre-selects your Personal project
6. Verify your settings and click "Save settings"

### Step 3: Sync Your Workflows

1. Click the refresh button in the n8n panel
2. Your workflows will be downloaded and organized by instance
3. Start editing workflows with auto-sync enabled

## 🛠️ Alternative: CLI Installation

If you prefer command-line tools or need automation:

### Install CLI via npm

```bash
# Install globally
npm install -g @n8n-as-code/cli

# Verify installation
n8nac --version
```

### Initialize Your Project

```bash
# Run initialization wizard
n8nac init
```

The interactive wizard will guide you through:
- **n8n Host URL**: The URL of your n8n instance
- **API Key**: Your n8n API key
- **Sync Folder**: Local folder where workflow files are written
- **Project**: Which n8n project to sync

### Sync Workflows

```bash
# Download all workflows from n8n
n8nac pull

# Enable real-time synchronization
n8nac start
```

## ⚙️ Configuration Files

After setup, you'll have:

- `n8nac.json`: Project configuration (safe to commit to Git)
- Global API key storage (not committed, stored securely in your system)

## 🔄 Syncing Your Workflows

### Pull Existing Workflows

Download all workflows from your n8n instance:

```bash
# Using CLI
n8nac pull

# Or using VS Code Extension
# Click the refresh button in the n8n panel
```

This will:
- Create a local directory structure
- Download all workflows as JSON files
- Preserve folder organization from n8n

### Push Local Changes

Send your local modifications back to n8n:

- **VS Code Extension**: Changes are auto-synced on save when using auto-sync mode
- **CLI**: Use `n8nac push` command

### Real-time Sync (Start Mode)

Enable real-time synchronization with the CLI:

```bash
n8nac start
```

In start mode:
- Local file changes are automatically pushed to n8n
- Remote changes are pulled automatically
- You get notifications about sync status

## 🎨 VS Code Extension Features

Once configured, you'll have access to:

- **Workflow Tree View**: Browse all your workflows in the sidebar
- **Split View Editing**: Edit JSON while viewing the n8n canvas
- **Auto-sync**: Changes are synchronized automatically on save (when enabled)
- **Validation & Snippets**: JSON validation and code snippets
- **AI Context Generation**: Files to help AI assistants understand n8n workflows

## 📁 Project Structure

After setup, your project will look like this:

```
your-project/
├── n8nac.json          # Project configuration
├── workflows/                # Workflow storage
│   └── instance-name_user/       # Instance identifier (auto-generated)
│       └── project-slug/         # Project slug (from project name)
│           ├── workflow-1.json
│           ├── workflow-2.json
│           └── folder/
│               └── workflow-3.json
├── AGENTS.md                # AI assistant instructions (optional)
├── n8nac-instance.json # Instance configuration
└── .git/                    # Version control (recommended)
```

## 🚨 Common Issues

### Connection Issues

**Problem**: Can't connect to n8n instance
**Solution**: 
- Verify the n8n URL is correct and accessible
- Check that API key has proper permissions
- Ensure n8n instance is running and accessible

### Permission Issues

**Problem**: "Permission denied" when writing files
**Solution**:
- Check directory permissions
- Run with appropriate user privileges
- Use a different project directory

### Sync Issues

**Problem**: Changes not syncing properly
**Solution**:
- Check if `n8nac start` is running (stop it if needed)
- Use `n8nac pull` to get fresh copy
- Use `n8nac push` to send local changes
- Check network connectivity to n8n instance

## 📚 Next Steps

Now that you're set up, explore these resources:

- [VS Code Extension Guide](/docs/usage/vscode-extension): Learn about visual editing features
- [CLI Reference](/docs/usage/cli): Complete command reference for automation
- [Contribution Guide](/docs/contribution): Learn about the architecture and development

## 🆘 Need Help?

- Check the [Troubleshooting guide](/docs/troubleshooting)
- Search [existing issues](https://github.com/EtienneLescot/n8n-as-code/issues)
- Ask in [GitHub Discussions](https://github.com/EtienneLescot/n8n-as-code/discussions)

---

*Ready to dive deeper? Continue to the [VS Code Extension guide](/docs/usage/vscode-extension) to learn about advanced editing features.*
