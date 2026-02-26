---
sidebar_label: CLI
title: CLI Guide
description: Learn how to use the n8nac CLI for automation, scripting, and CI/CD integration.
---

# CLI Guide

The n8nac CLI (`@n8n-as-code/cli`) provides command-line access to all n8nac functionality. It's perfect for automation, scripting, and CI/CD integration.

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
n8nac --version
```

## 🚀 Quick Start

### Initialize a Project
```bash
n8nac init
```

This command:
1. Creates a configuration file (`n8nac.json`)
2. Configures connection to your n8n instance
3. Prompts you to select which **n8n project** to sync

### Download Workflows from n8n
```bash
n8nac pull
```

This command:
1. Pulls all workflows from n8n
2. Saves them to the local `workflows` directory
3. Organizes them by instance

### Upload Local Workflows to n8n
```bash
n8nac push
```

This command:
1. Uploads new or modified workflows to n8n
2. Creates workflows that exist locally but not in n8n
3. Updates existing workflows with local changes

## 📋 Command Reference

### `init`
Initialize a new n8nac project.

**Description:**
Interactive wizard that guides you through setting up your n8n connection and project configuration.

**Example:**
```bash
n8nac init
```

The wizard will ask for:
- **n8n Host URL**: The URL of your n8n instance (e.g., `http://localhost:5678`)
- **API Key**: Your n8n API key (found in n8n Settings > API)
- **Sync Folder**: Local directory for workflow storage (default: `workflows`)
- **Project**: The n8n project to sync

### `switch`
Switch to a different n8n project.

```bash
n8nac switch
```

After switching projects, run `n8nac pull` to download workflows from the selected project.

### `list`
Display all workflows with their current sync status.

**Description:**
Shows a color-coded table of all workflows with their sync status, helping you understand the current state of your workflow synchronization. Supports filtering to show only local or remote workflows.

**Options:**
- `--local`: Show only workflows that exist locally (including EXIST_ONLY_LOCALLY, MODIFIED_LOCALLY, etc.)
- `--remote`: Show only workflows that exist remotely (including EXIST_ONLY_REMOTELY, MODIFIED_REMOTELY, etc.)

**Example:**
```bash
n8nac list                    # Show all workflows
n8nac list --local           # Show only local workflows
n8nac list --remote          # Show only remote workflows
```

**Output:**
- Status indicators with icons (✔ In Sync, ✏️ Modified Locally, ☁️ Modified Remotely, 💥 Conflicts, etc.)
- Workflow ID, name, and local path
- Summary statistics showing counts by status

**Status Types:**
- `IN_SYNC` - Local and remote are identical
- `MODIFIED_LOCALLY` - Local changes not yet pushed
- `MODIFIED_REMOTELY` - Remote changes not yet pulled
- `CONFLICT` - Both local and remote modified since last sync
- `EXIST_ONLY_LOCALLY` - New local workflow not yet pushed
- `EXIST_ONLY_REMOTELY` - New remote workflow not yet pulled
- `DELETED_LOCALLY` - Local file removed
- `DELETED_REMOTELY` - Remote workflow deleted

### `pull`
Download workflows from n8n to local directory.

**Description:**
Downloads workflows from your configured n8n instance. Detects conflicts when both local and remote have changed since last sync.

**Options:**
- `--force`: Skip conflict checks and overwrite local files with remote versions

**Example:**
```bash
n8nac pull
n8nac pull --force  # Force overwrite local changes
```

**Behavior:**
1. Refreshes workflow status using 3-way merge detection
2. Pulls new and modified workflows from n8n
3. For conflicts, prompts interactively to:
   - Keep local version (force push)
   - Keep remote version (force pull)
   - Show diff
   - Skip
4. Creates automatic backups before overwriting files

### `push`
Upload local workflows to n8n.

**Description:**
Uploads workflows that exist locally to n8n. Detects conflicts when both local and remote have changed since last sync.

**Options:**
- `--force`: Skip conflict checks and overwrite remote workflows with local versions

**Example:**
```bash
n8nac push
n8nac push --force  # Force overwrite remote changes
```

**Behavior:**
1. Refreshes workflow status using 3-way merge detection
2. Pushes new and modified workflows to n8n
3. For conflicts, prompts interactively to:
   - Keep local version (force push)
   - Keep remote version (force pull)
   - Show diff
   - Skip
4. Updates `.n8n-state.json` after successful operations

### `fetch`
Update remote state cache for a specific workflow.

**Description:**
Fetches the latest remote state for a specific workflow without performing any sync operations. This updates the local cache of remote workflow versions, which helps you see accurate status in `n8nac list` before deciding to pull or push.

**Arguments:**
- `<workflowId>`: Required workflow ID to fetch

**Example:**
```bash
n8nac fetch abc123          # Fetch remote state for workflow abc123
```

**Use Cases:**
- Before running `n8nac list` to get accurate status for a specific workflow
- After making remote changes in n8n UI to update local cache for that workflow
- As a lightweight check for remote changes without downloading files

### `init-ai`
Initialize AI Context (AGENTS.md, rule files, code snippets).

**Description:**
Generates context files that help AI coding assistants understand n8n workflow structure and best practices.

**Options:**
- `--doc-only`: Generate only documentation, skip schema and snippets

**Example:**
```bash
n8nac init-ai
```

**Creates:**
- `AGENTS.md`: Instructions for AI assistants on n8n workflow development
- `.vscode/n8n.code-snippets`: Code snippets for VS Code autocomplete (generated from n8n-nodes-index.json)
- `.vscode/n8n.code-snippets`: Code snippets for common n8n node patterns
- `.cursorrules` / `.clinerules`: AI agent rule files

## ⚙️ Configuration

### Configuration File
The CLI uses a configuration file (`n8nac.json`) with the following structure:

```json
{
  "host": "https://n8n.example.com",
  "syncFolder": "workflows",
  "projectId": "your-project-id",
  "projectName": "Personal",
  "instanceIdentifier": "local_5678_user",
  "syncInactive": true,
  "ignoredTags": ["archive"]
}
```

**Note:** API keys are stored securely in your system's credential store, not in this file.

## 🔄 Workflow Management

### Git-like Sync Workflow
```bash
# 1. Initialize project
n8nac init

# 2. List workflows to see current status
n8nac list

# 3. Fetch remote state to update status
n8nac fetch --all

# 4. Pull remote changes you want
n8nac pull --id abc123

# 5. Edit workflow files locally
#    (edit workflows/*.workflow.ts files)

# 6. Check status before pushing
n8nac list

# 7. Push local changes to n8n
n8nac push --id abc123
```

### Git-like Development Pattern
```bash
# Git-like workflow management
n8nac list                    # See what's changed
n8nac fetch abc123           # Update remote state for specific workflow
n8nac pull --id abc123       # Pull remote changes
# ... edit workflow ...
n8nac push --id abc123       # Push local changes

# View local-only or remote-only workflows
n8nac list --local           # Show only local workflows
n8nac list --remote          # Show only remote workflows
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
# (Run in a separate folder if you want backups isolated)
# cd "$BACKUP_DIR" && n8nac pull

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
n8nac init

# Pull workflows from staging
n8nac pull

# (Make any necessary transformations)

# Push to production if approved
if [ "$DEPLOY_TO_PROD" = "true" ]; then
  export N8N_HOST="https://prod.n8n.example.com"
  export N8N_API_KEY="$PROD_API_KEY"
  n8nac init
  n8nac push
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
n8nac push
```

## 🎯 Best Practices

### Project Structure
```
my-project/
├── n8nac.json                # Project configuration
├── workflows/                # Workflow storage
│   └── instance_identifier/  # Organized by instance
│       └── project_slug/      # Organized by project
│           └── workflow1.json
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
cat n8nac.json

# Reinitialize connection
n8nac init
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
# Check if real-time sync is running
# (Stop any running `n8nac start` processes first)

# Pull fresh copy
n8nac pull

# Push local changes
n8nac push
```

### Debug Mode
Enable debug logging for detailed output:

```bash
# Debug real-time sync mode
DEBUG=n8n-as-code:* n8nac start

# Debug specific operations
DEBUG=axios,n8n-as-code:* n8nac pull
```

## 📚 Next Steps

- [VS Code Extension Guide](/docs/usage/vscode-extension): Visual editing experience with real-time sync
- [Getting Started](/docs/getting-started): Complete setup guide
- [Contribution Guide](/docs/contribution): Understand the architecture and development

---

*The CLI provides powerful automation capabilities for managing n8n workflows as code. Use it for scripting, CI/CD integration, and headless workflow management.*
