---
sidebar_label: CLI
title: CLI Guide
description: Learn how to use the n8nac CLI for automation, scripting, and CI/CD integration.
---

# CLI Guide

The n8nac CLI (`n8nac`) provides command-line access to all n8nac functionality. It's perfect for automation, scripting, and CI/CD integration.

## 📦 Installation

### Global Installation
```bash
npm install -g n8nac
```

### Project Installation
```bash
npm install --save-dev n8nac
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
1. Creates a configuration file (`n8nac-config.json`)
2. Configures connection to your n8n instance
3. Prompts you to select which **n8n project** to sync

### Download a Workflow from n8n
```bash
n8nac pull <workflowId>
```

This command:
1. Fetches the specified workflow from n8n
2. Saves it to the local `workflows` directory
3. Refuses to overwrite if a conflict is detected (use `n8nac resolve` in that case)

### Upload a Local Workflow to n8n
```bash
n8nac push <workflowId>
```

This command:
1. Uploads the specified workflow to n8n
2. Uses Optimistic Concurrency Control — rejected if the remote was modified since last pull
3. Suggests `n8nac resolve` if a conflict is detected

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

After switching projects, use `n8nac list` to see the workflows in the new project, then `n8nac pull <workflowId>` for each workflow you want to download.

### `list`
Display all workflows with their current sync status.

**Description:**
Shows a color-coded table of all workflows with their sync status, helping you understand the current state of your workflow synchronization. Supports filtering to show only local or remote workflows.

**Options:**
- `--local`: Show only workflows that exist locally (including `EXIST_ONLY_LOCALLY`, `MODIFIED_LOCALLY`, `TRACKED`, `CONFLICT`)
- `--remote` / `--distant`: Show only workflows that exist remotely (including `EXIST_ONLY_REMOTELY`, `TRACKED`, `CONFLICT`)
- `--raw`: Output raw JSON for scripting/automation

**Example:**
```bash
n8nac list                    # Show all workflows
n8nac list --local            # Show only local workflows
n8nac list --remote           # Show only remote workflows
n8nac list --raw              # Output raw JSON
```

**Output:**
- Status indicators with icons (✔ Tracked, ✏️ Modified Locally, 💥 Conflicts, + Local Only, - Remote Only)
- Workflow ID, name, and local path
- Summary statistics showing counts by status

**Status Types:**
- `TRACKED` - Both local and remote exist (may include remote-only changes — use pull to get them)
- `MODIFIED_LOCALLY` - Local changes not yet pushed
- `CONFLICT` - Both local and remote modified since last sync
- `EXIST_ONLY_LOCALLY` - New local workflow not yet pushed
- `EXIST_ONLY_REMOTELY` - Remote workflow not yet pulled locally

### `pull`
Download a specific workflow from n8n to the local directory.

**Description:**
Downloads a single workflow from your configured n8n instance. Detects and blocks on conflicts — use `n8nac resolve` when a conflict is reported.

**Options:**
- `<workflowId>` (**required**): The ID of the workflow to pull

**Example:**
```bash
n8nac pull <workflowId> abc123
```

**Behavior:**
1. Fetches the latest remote state for the workflow
2. Checks for conflict (`CONFLICT`) or uncommitted local edits (`MODIFIED_LOCALLY`)
3. Aborts with instructions if a conflict or local change is detected (use `n8nac resolve` to proceed)
4. Downloads and writes the workflow file on success

### `push`
Upload a local workflow to n8n.

**Description:**
Uploads a single workflow from local to your n8n instance. Uses Optimistic Concurrency Control (OCC) — the push is rejected if the remote was modified since the last pull.

**Options:**
- `<workflowId>` (**required for existing workflows**): The ID of the workflow to push
- `--filename <name>`: Push a brand-new local workflow file that has no remote ID yet

**Example:**
```bash
n8nac push <workflowId> abc123          # Push an existing workflow
n8nac push --filename my-workflow.workflow.ts  # Push a brand-new local file
```

**Behavior:**
1. Fetches the current remote state for the workflow
2. Checks for conflict — if remote was modified since last sync, aborts with instructions
3. Uploads the local workflow on success
4. Reports the `n8nac resolve` commands to use if a conflict is detected

### `fetch`
Update the remote state cache for a specific workflow.

**Description:**
Fetches the latest remote metadata for a specific workflow without downloading the file. This updates the internal comparison cache so `n8nac list` shows an accurate status before you decide to pull or push.

**Options:**
- `<workflowId>` (**required**): The ID of the workflow to fetch

**Example:**
```bash
n8nac fetch abc123
```

**Use Cases:**
- Before running `n8nac list` to get accurate status for a specific workflow
- After making changes in the n8n UI to update the local cache for that workflow
- As a lightweight check for remote changes without downloading files

### `resolve`
Force-resolve a sync conflict for a specific workflow.

**Description:**
When `n8nac pull` or `n8nac push` reports a conflict, use this command to choose which version wins. No merging — one side overwrites the other.

**Options:**
- `<workflowId>` (**required**): The ID of the conflicting workflow
- `--mode <keep-current|keep-incoming>` (**required**): Resolution strategy
  - `keep-current`: Keep the **local** version (force-push it to n8n)
  - `keep-incoming`: Keep the **remote** version (force-pull it locally)

**Example:**
```bash
n8nac resolve abc123 --mode keep-current   # Force-push local
n8nac resolve abc123 --mode keep-incoming  # Force-pull remote
```

### `update-ai`
Update AI Context (AGENTS.md, rule files, code snippets).

**Description:**
Regenerates context files that help AI coding assistants (GitHub Copilot, Cursor, Cline, Windsurf…) understand n8n workflow structure and best practices. The command fetches the installed n8n version to tailor the output.

:::note
`n8nac init-ai` is kept as a backward-compatible alias for `n8nac update-ai`.
:::

**Example:**
```bash
n8nac update-ai
```

**Creates / updates:**
- `AGENTS.md`: Instructions for AI assistants on n8n workflow development
- `.vscode/n8n.code-snippets`: Code completion snippets for VS Code
- `.cursorrules` / `.clinerules` / `.windsurfrules`: AI agent rule files

### `convert`
Convert a single workflow file between JSON and TypeScript formats.

**Description:**
Converts a `.json` workflow export to a `.workflow.ts` file (or vice-versa). The target format is auto-detected from the source extension unless `--format` is provided.

**Arguments:**
- `<file>` (**required**): Path to the source file

**Options:**
- `-o, --output <path>`: Output file path (auto-generated if omitted)
- `-f, --force`: Overwrite output file if it already exists
- `--format <json|typescript>`: Override the auto-detected target format

**Example:**
```bash
n8nac convert my-workflow.json                         # JSON → TypeScript
n8nac convert my-workflow.workflow.ts                  # TypeScript → JSON
n8nac convert my-workflow.json -o out.workflow.ts -f   # JSON → TS, force overwrite
```

### `convert-batch`
Batch-convert all workflow files in a directory.

**Description:**
Converts every workflow file in the specified directory to the target format.

**Arguments:**
- `<directory>` (**required**): Path to the directory containing workflow files

**Options:**
- `--format <json|typescript>` (**required**): Target format for all files
- `-f, --force`: Overwrite existing output files

**Example:**
```bash
n8nac convert-batch ./workflows --format typescript    # Convert all JSON to TS
n8nac convert-batch ./workflows --format json          # Convert all TS to JSON
```

## ⚙️ Configuration

### Configuration File
The CLI uses a configuration file (`n8nac-config.json`) with the following structure:

```json
{
  "host": "https://n8n.example.com",
  "syncFolder": "workflows",
  "projectId": "your-project-id",
  "projectName": "Personal",
  "instanceIdentifier": "local_5678_user"
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

# 3. Fetch remote state to update status for a specific workflow
n8nac fetch abc123

# 4. Pull remote changes for a specific workflow
n8nac pull <workflowId> abc123

# 5. Edit workflow files locally
#    (edit workflows/*.workflow.ts files)

# 6. Check status before pushing
n8nac list

# 7. Push local changes to n8n
n8nac push <workflowId> abc123
```

### Git-like Development Pattern
```bash
# See what's changed
n8nac list

# Update remote state cache for a specific workflow
n8nac fetch abc123

# Pull remote changes for that workflow
n8nac pull <workflowId> abc123

# ... edit workflow ...

# Push local changes back to n8n
n8nac push <workflowId> abc123

# Resolve a conflict (if push/pull is blocked)
n8nac resolve abc123 --mode keep-current   # keep local
n8nac resolve abc123 --mode keep-incoming  # keep remote

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
# cd "$BACKUP_DIR" && n8nac init && n8nac pull <workflowId>

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

# List workflows and pull specific ones from staging
n8nac list
n8nac pull <workflowId>

# (Make any necessary transformations)

# Push to production if approved
if [ "$DEPLOY_TO_PROD" = "true" ]; then
  export N8N_HOST="https://prod.n8n.example.com"
  export N8N_API_KEY="$PROD_API_KEY"
  n8nac init
  n8nac push <workflowId>
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
n8nac push <workflowId>
```

## 🎯 Best Practices

### Project Structure
```
my-project/
├── n8nac-config.json                # Project configuration
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
cat n8nac-config.json

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
# Check workflow status
n8nac list

# Fetch remote state to update cache for a specific workflow
n8nac fetch <workflowId>

# Pull a specific workflow
n8nac pull <workflowId>

# Push local changes for a specific workflow
n8nac push <workflowId>

# Resolve a conflict
n8nac resolve <workflowId> --mode keep-current
```

### Debug Mode
Enable debug logging for detailed output:

```bash
# Debug pull operation
DEBUG=n8n-as-code:* n8nac pull <workflowId>

# Debug specific operations
DEBUG=axios,n8n-as-code:* n8nac push <workflowId>
```

## 📚 Next Steps

- [VS Code Extension Guide](/docs/usage/vscode-extension): Visual editing experience with git-like sync
- [Getting Started](/docs/getting-started): Complete setup guide
- [Contribution Guide](/docs/contribution): Understand the architecture and development

---

*The CLI provides powerful automation capabilities for managing n8n workflows as code. Use it for scripting, CI/CD integration, and headless workflow management.*
