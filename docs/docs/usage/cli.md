---
sidebar_label: CLI
title: CLI Guide
description: Learn how to use the n8n-as-code CLI for automation, scripting, and CI/CD integration.
---

# CLI Guide

The n8n-as-code CLI (`@n8n-as-code/cli`) provides command-line access to all n8n-as-code functionality. It's perfect for automation, scripting, and CI/CD integration.

## 📦 Installation

### Global Installation
```bash
npm install -g @n8n-as-code/cli
```

### Project Installation
```bash
npm install --save-dev @n8n-as-code/cli
```

### Verify Installation
```bash
n8n-as-code --version
```

## 🚀 Quick Start

### Initialize a Project
```bash
n8n-as-code init
```

This command:
1. Creates a configuration file (`n8n-as-code.json`)
2. Sets up the project structure
3. Configures connection to your n8n instance

### Download Workflows from n8n
```bash
n8n-as-code pull
```

This command:
1. Pulls all workflows from n8n
2. Saves them to the local `workflows` directory
3. Organizes them by instance

### Upload Local Workflows to n8n
```bash
n8n-as-code push
```

This command:
1. Uploads new or modified workflows to n8n
2. Creates workflows that exist locally but not in n8n
3. Updates existing workflows with local changes

## 📋 Command Reference

### `init`
Initialize a new n8n-as-code project.

**Description:**
Interactive wizard that guides you through setting up your n8n connection and project configuration.

**Example:**
```bash
n8n-as-code init
```

The wizard will ask for:
- **n8n Host URL**: The URL of your n8n instance (e.g., `http://localhost:5678`)
- **API Key**: Your n8n API key (found in n8n Settings > API)
- **Sync Folder**: Local directory for workflow storage (default: `workflows`)

### `pull`
Download all workflows from n8n to local directory.

**Description:**
Downloads all workflows from your configured n8n instance and saves them as JSON files in your local workflows directory.

**Example:**
```bash
n8n-as-code pull
```

**What happens:**
1. Connects to your n8n instance using stored credentials
2. Fetches all workflows (including inactive ones)
3. Saves each workflow as a JSON file in `workflows/` directory
4. Organizes files by instance identifier

### `push`
Upload missing local workflows to n8n.

**Description:**
Uploads workflows that exist locally but not in n8n, and updates workflows that have been modified locally.

**Example:**
```bash
n8n-as-code push
```

**What happens:**
1. Scans local `workflows/` directory for JSON files
2. Compares with workflows in n8n
3. Creates new workflows in n8n for missing local files
4. Updates existing workflows with local modifications

### `watch`
Start bi-directional synchronization in real-time.

**Description:**
Monitors both local file system and n8n for changes, automatically synchronizing in both directions.

**Example:**
```bash
n8n-as-code watch
```

**Features:**
- **File watching**: Automatically pushes local changes to n8n when files are saved
- **Polling**: Periodically checks n8n for remote changes and pulls them locally
- **Conflict detection**: Warns if conflicts are detected between local and remote versions

### `init-ai`
Initialize AI Context (AGENTS.md, n8n-schema.json, rule files).

**Description:**
Generates context files that help AI coding assistants understand n8n workflow structure and best practices.

**Options:**
- `--doc-only`: Generate only documentation, skip schema and snippets

**Example:**
```bash
n8n-as-code init-ai
```

**Creates:**
- `AGENTS.md`: Instructions for AI assistants on n8n workflow development
- `n8n-schema.json`: JSON Schema for workflow validation and autocomplete
- `.vscode/n8n.code-snippets`: Code snippets for common n8n node patterns
- `.cursorrules` / `.clinerules`: AI agent rule files

## ⚙️ Configuration

### Configuration File
The CLI uses a configuration file (`n8n-as-code.json`) with the following structure:

```json
{
  "host": "https://n8n.example.com",
  "syncFolder": "workflows",
  "pollInterval": 3000,
  "syncInactive": true,
  "ignoredTags": ["archive"]
}
```

**Note:** API keys are stored securely in your system's credential store, not in this file.

### Environment Variables
You can also configure via environment variables:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `N8N_HOST` | n8n instance URL | `https://n8n.example.com` |
| `N8N_API_KEY` | n8n API key | `my-api-key` |
| `N8N_SYNC_FOLDER` | Local sync folder | `workflows` |

### Priority Order
1. Command-line arguments (when supported)
2. Environment variables
3. Configuration file (`n8n-as-code.json`)
4. Default values

## 🔄 Workflow Management

### Basic Workflow
```bash
# 1. Initialize project
n8n-as-code init

# 2. Download existing workflows
n8n-as-code pull

# 3. Edit workflow files locally
#    (edit workflows/*.json files)

# 4. Upload changes to n8n
n8n-as-code push

# 5. Or use real-time sync
n8n-as-code watch
```

### Real-time Development with Watch Mode
```bash
# Start watch mode for real-time sync
n8n-as-code watch

# Now you can:
# - Edit workflow JSON files locally
# - Changes are automatically pushed to n8n on save
# - Remote changes in n8n are pulled automatically
# - Get notifications about sync status
```

## 📊 Scripting Examples

### Backup Script
```bash
#!/bin/bash
# backup-workflows.sh

# Set date for backup folder
BACKUP_DATE=$(date +%Y-%m-%d)
BACKUP_DIR="backups/$BACKUP_DATE"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Copy workflows to backup directory
cp -r workflows/* "$BACKUP_DIR/" 2>/dev/null || true

# Or pull fresh copy to backup directory
# N8N_SYNC_FOLDER="$BACKUP_DIR" n8n-as-code pull

# Compress backup
tar -czf "$BACKUP_DIR.tar.gz" "$BACKUP_DIR"

echo "Backup created: $BACKUP_DIR.tar.gz"
```

### CI/CD Integration
```bash
#!/bin/bash
# ci-sync.sh

# Set environment variables for target instance
export N8N_HOST="https://staging.n8n.example.com"
export N8N_API_KEY="$STAGING_API_KEY"

# Initialize with environment variables
n8n-as-code init

# Pull workflows from staging
n8n-as-code pull

# (Make any necessary transformations)

# Push to production if approved
if [ "$DEPLOY_TO_PROD" = "true" ]; then
  export N8N_HOST="https://prod.n8n.example.com"
  export N8N_API_KEY="$PROD_API_KEY"
  n8n-as-code init
  n8n-as-code push
fi
```

### Batch Operations
```bash
#!/bin/bash
# batch-update.sh

# Update all workflows with a new tag
for workflow in workflows/*.json; do
  echo "Updating $workflow"
  
  # Add metadata using jq
  jq '.metadata.tags += ["automated"]' "$workflow" > "$workflow.tmp"
  mv "$workflow.tmp" "$workflow"
done

# Push changes to n8n
n8n-as-code push
```

## 🎯 Best Practices

### Project Structure
```
my-project/
├── n8n-as-code.json          # Project configuration
├── workflows/                # Workflow storage
│   ├── instance1/           # Organized by instance
│   │   ├── workflow1.json
│   │   └── workflow2.json
│   └── instance2/
│       └── workflow3.json
├── scripts/                  # Automation scripts
│   └── backup.sh
└── README.md
```

### Version Control
- Commit workflow JSON files to Git for version history
- Use `.gitignore` to exclude sensitive data
- Tag releases with workflow versions
- Review changes using Git diff before pushing to n8n

### Security
- Never commit API keys or credentials to version control
- Use environment variables or secret managers for sensitive data
- Rotate API keys regularly
- Store API keys in system credential store (handled automatically by CLI)

## 🚨 Troubleshooting

### Common Issues

**Connection Errors**
```bash
# Check connectivity to n8n instance
curl -I https://n8n.example.com

# Verify configuration
cat n8n-as-code.json

# Reinitialize connection
n8n-as-code init
```

**File Permission Issues**
```bash
# Check file permissions
ls -la workflows/

# Fix permissions if needed
chmod -R 755 workflows/
```

**Sync Issues**
```bash
# Check if watch mode is running
# (Stop any running watch processes first)

# Pull fresh copy
n8n-as-code pull

# Push local changes
n8n-as-code push
```

### Debug Mode
Enable debug logging for detailed output:

```bash
# Debug watch mode
DEBUG=n8n-as-code:* n8n-as-code watch

# Debug specific operations
DEBUG=axios,n8n-as-code:* n8n-as-code pull
```

## 📚 Next Steps

- [VS Code Extension Guide](/docs/usage/vscode-extension): Visual editing experience with real-time sync
- [Getting Started](/docs/getting-started): Complete setup guide
- [Contributor Guide](/docs/contributors): Understand the architecture and development
- [API Reference](/api): Developer documentation for all packages

---

*The CLI provides powerful automation capabilities for managing n8n workflows as code. Use it for scripting, CI/CD integration, and headless workflow management.*