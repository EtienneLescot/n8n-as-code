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

### Sync Workflows
```bash
n8n-as-code sync
```

This command:
1. Pulls all workflows from n8n
2. Saves them to the local `workflows` directory
3. Organizes them by instance

## 📋 Command Reference

### `init`
Initialize a new n8n-as-code project.

**Options:**
- `--host <url>`: n8n instance URL
- `--api-key <key>`: n8n API key
- `--config <path>`: Custom config file path

**Example:**
```bash
n8n-as-code init --host https://n8n.example.com --api-key my-api-key
```

### `sync`
Synchronize workflows between n8n and local files.

**Options:**
- `--pull`: Only pull from n8n
- `--push`: Only push to n8n
- `--force`: Force sync even with conflicts
- `--dry-run`: Show what would be synced without making changes

**Examples:**
```bash
# Full sync (pull + push)
n8n-as-code sync

# Only pull workflows
n8n-as-code sync --pull

# Only push local changes
n8n-as-code sync --push
```

### `watch`
Watch for local changes and auto-sync.

**Options:**
- `--interval <ms>`: Polling interval in milliseconds (default: 3000)
- `--ignore <pattern>`: Glob pattern to ignore files

**Example:**
```bash
n8n-as-code watch --interval 5000
```

### `init-ai`
Initialize AI context files for the project.

**Options:**
- `--force`: Overwrite existing files
- `--minimal`: Create minimal context only

**Example:**
```bash
n8n-as-code init-ai
```

This creates:
- `AGENTS.md`: AI assistant instructions
- `n8n-schema.json`: Validation schema
- `.vscode/n8n.code-snippets`: Code snippets

### `validate`
Validate workflow JSON files.

**Options:**
- `--fix`: Attempt to fix validation errors
- `--strict`: Enable strict validation

**Example:**
```bash
n8n-as-code validate workflows/
```

### `list`
List workflows from n8n.

**Options:**
- `--format <format>`: Output format (json, table, csv)
- `--filter <pattern>`: Filter workflows by name

**Example:**
```bash
n8n-as-code list --format table
```

## ⚙️ Configuration

### Configuration File
The CLI uses a configuration file (`n8n-as-code.json`) with the following structure:

```json
{
  "host": "https://n8n.example.com",
  "apiKey": "your-api-key",
  "syncFolder": "workflows",
  "syncMode": "auto",
  "pollInterval": 3000,
  "ignorePatterns": [
    "**/node_modules/**",
    "**/.git/**"
  ]
}
```

### Environment Variables
You can also configure via environment variables:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `N8N_HOST` | n8n instance URL | `https://n8n.example.com` |
| `N8N_API_KEY` | n8n API key | `my-api-key` |
| `N8N_SYNC_FOLDER` | Local sync folder | `workflows` |
| `N8N_SYNC_MODE` | Sync mode | `auto` or `manual` |

### Priority Order
1. Command-line arguments
2. Environment variables
3. Configuration file
4. Default values

## 🔄 Sync Modes

### Auto Mode (Default)
- Changes are automatically synced
- Best for interactive use
- Uses polling to detect remote changes

### Manual Mode
- Sync only when explicitly triggered
- Better for scripting and automation
- More predictable behavior

## 🛡️ Conflict Management

### Conflict Detection
The CLI detects conflicts when:
1. A workflow is modified both locally and remotely
2. You have unsynced changes and someone else modifies the workflow

### Conflict Resolution
When conflicts occur, you have several options:

**Interactive Mode:**
```bash
n8n-as-code sync --interactive
```

**Force Options:**
```bash
# Keep local version
n8n-as-code sync --force-local

# Keep remote version
n8n-as-code sync --force-remote
```

**Diff View:**
```bash
n8n-as-code diff <workflow-id>
```

## 🤖 AI Integration

### AI Context Generation
The CLI can generate AI context files for your project:

```bash
n8n-as-code init-ai
```

This creates files that help AI assistants understand:
- n8n workflow structure
- Validation rules
- Common patterns and snippets

### Using with AI Assistants
With the generated context, AI assistants can:
- Write n8n workflow JSON
- Validate workflow structure
- Suggest improvements
- Generate documentation

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

# Sync workflows to backup directory
N8N_SYNC_FOLDER="$BACKUP_DIR" n8n-as-code sync --pull

# Compress backup
tar -czf "$BACKUP_DIR.tar.gz" "$BACKUP_DIR"

echo "Backup created: $BACKUP_DIR.tar.gz"
```

### CI/CD Integration
```bash
#!/bin/bash
# ci-sync.sh

# Validate workflows before sync
n8n-as-code validate workflows/

# Sync to staging environment
N8N_HOST="https://staging.n8n.example.com" \
N8N_API_KEY="$STAGING_API_KEY" \
n8n-as-code sync --push

# Sync to production (manual approval)
if [ "$DEPLOY_TO_PROD" = "true" ]; then
  N8N_HOST="https://prod.n8n.example.com" \
  N8N_API_KEY="$PROD_API_KEY" \
  n8n-as-code sync --push
fi
```

### Batch Operations
```bash
#!/bin/bash
# batch-update.sh

# Update all workflows with a new tag
for workflow in workflows/*.json; do
  echo "Updating $workflow"
  
  # Add metadata
  jq '.metadata.tags += ["automated"]' "$workflow" > "$workflow.tmp"
  mv "$workflow.tmp" "$workflow"
done

# Sync changes
n8n-as-code sync --push
```

## 🎯 Best Practices

### Project Structure
```
my-project/
├── n8n-as-code.json
├── workflows/
│   ├── instance1/
│   │   ├── workflow1.json
│   │   └── workflow2.json
│   └── instance2/
│       └── workflow3.json
├── scripts/
│   └── backup.sh
└── README.md
```

### Version Control
- Commit workflow JSON files to Git
- Use `.gitignore` for sensitive data
- Tag releases with workflow versions

### Security
- Never commit API keys to version control
- Use environment variables or secret managers
- Rotate API keys regularly

## 🚨 Troubleshooting

### Common Issues

**Connection Errors**
```bash
# Check connectivity
curl -I https://n8n.example.com

# Verify API key
n8n-as-code list --host https://n8n.example.com --api-key my-key
```

**Sync Issues**
```bash
# Dry run to see what would happen
n8n-as-code sync --dry-run

# Check for conflicts
n8n-as-code sync --interactive
```

**Validation Errors**
```bash
# Show validation errors
n8n-as-code validate workflows/ --verbose

# Attempt to fix errors
n8n-as-code validate workflows/ --fix
```

### Debug Mode
Enable debug logging for detailed output:

```bash
DEBUG=n8n-as-code:* n8n-as-code sync
```

## 📚 Next Steps

- [VS Code Extension Guide](/docs/usage/vscode-extension): Visual editing experience
- [Contributor Guide](/docs/contributors): Understand the architecture
- [API Reference](/api): Developer documentation

---

*The CLI provides powerful automation capabilities for managing n8n workflows as code.*