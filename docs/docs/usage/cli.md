---
sidebar_label: CLI
title: CLI Guide
description: Learn how to use the n8nac CLI for automation, scripting, and CI/CD integration.
---

# CLI Guide

The n8nac CLI (`n8nac`) provides command-line access to all n8nac functionality. It's perfect for automation, scripting, and CI/CD integration.

This page is intentionally command-heavy and serves as the detailed reference for terminal users, scripts, and other power-user workflows.

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
1. Creates or updates `n8nac-config.json`
2. Saves an instance config for the n8n environment you want to use
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
n8nac push workflows/instance/project/workflow.workflow.ts
```

This command:
1. Uploads the specified workflow to n8n
2. Uses Optimistic Concurrency Control — rejected if the remote was modified since last pull
3. Suggests `n8nac resolve` if a conflict is detected

:::tip How `push` resolves the file
Pass the local workflow path you want to upload, for example `workflows/instance/project/workflow.workflow.ts`.
Use the path that matches your active sync folder and project layout in the workspace.
:::

### Complete the Runtime Loop Without Leaving the CLI

The CLI now covers the most painful post-push steps that used to force users back into the n8n UI:

1. Detect missing credentials with `workflow credential-required`
2. Inspect the expected credential payload with `credential schema`
3. Create the credential with `credential create`
4. Activate the workflow with `workflow activate`
5. Inspect how to run it with `test-plan`
6. Execute it with `test`
7. Debug the actual server-side execution with `execution list` and `execution get`

This is a major quality-of-life improvement for agent-driven development: the agent can now provision credentials, run the workflow, and inspect the failing execution directly through n8n's API.

The exact commands for each step are documented below in the command reference, so high-level readers can understand the workflow without having to parse a wall of terminal examples first.

## 📋 Command Reference

### `init`
Initialize a new n8nac project.

**Description:**
Interactive wizard that guides you through saving an n8n instance config and selecting the active project.

**Example:**
```bash
n8nac init
```

The wizard will ask for:
- **n8n Host URL**: The URL of your n8n instance (e.g., `http://localhost:5678`)
- **API Key**: Your n8n API key (found in n8n Settings > API)
- **Sync Folder**: Local directory for workflow storage (default: `workflows`)
- **Project**: The n8n project to sync

`n8nac init` is the ergonomic alias for `n8nac instance add`.

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
- `--local`: Show only workflows that exist locally (including `EXIST_ONLY_LOCALLY`, `TRACKED`, `CONFLICT`)
- `--remote` / `--distant`: Show only workflows that exist remotely (including `EXIST_ONLY_REMOTELY`, `TRACKED`, `CONFLICT`)
- `--search <query>`: Case-insensitive partial match on workflow name, workflow ID, or local filename
- `--sort <status|name>`: Keep the default sync-oriented ordering or force alphabetical sorting
- `--limit <n>`: Return only the first `n` matching workflows after filtering/sorting
- `--raw`: Output raw JSON for scripting/automation

**Example:**
```bash
n8nac list                    # Show all workflows
n8nac list --local            # Show only local workflows
n8nac list --remote           # Show only remote workflows
n8nac list --search billing   # Find workflows by partial name, ID, or filename
n8nac list --sort name        # Sort alphabetically
n8nac list --raw              # Output raw JSON
```

**Output:**
- Status indicators with icons (✔ Tracked, 💥 Conflicts, + Local Only, - Remote Only)
- Workflow ID, name, and local path
- Summary statistics showing counts by status

### `find`
Search workflows quickly using the same case-insensitive partial matching used by `list --search`.

**Description:**
Optimized for large installations where you already know part of the workflow name, ID, or filename and want search-oriented results immediately.

**Options:**
- `<query>` (**required**): Search text
- `--local`: Limit results to workflows with a local file
- `--remote` / `--distant`: Limit results to workflows known remotely
- `--sort <status|name>`: Sort search results by sync status or alphabetically (defaults to `name`)
- `--limit <n>`: Return only the first `n` matching workflows
- `--raw`: Output the filtered result set as JSON

**Example:**
```bash
n8nac find billing
n8nac find wf-123 --raw
n8nac find importer --limit 10
```

**Status Types:**
- `TRACKED` - Both local and remote exist (in sync)
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
n8nac pull abc123
```

**Behavior:**
1. Fetches the latest remote state for the workflow
2. Checks for conflict (`CONFLICT`) — aborts with instructions if detected (use `n8nac resolve`)
3. Downloads and writes the workflow file on success

### `push`
Upload a local workflow to n8n.

**Description:**
Uploads a single workflow from local to your n8n instance. Uses Optimistic Concurrency Control (OCC) — the push is rejected if the remote was modified since the last pull.

**Options:**
- `<path>` (**required**): The local workflow path to upload

**Example:**
```bash
n8nac push workflows/instance/project/workflow.workflow.ts
```

**Behavior:**
1. Resolves the effective local file path from `n8nac-config.json`
2. Finds the tracked workflow ID for that filename when one exists
3. Checks for conflict — if remote was modified since last sync, aborts with instructions
4. Uploads the local workflow on success
5. Reports the `n8nac resolve` commands to use if a conflict is detected

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
Update AI Context (AGENTS.md and code snippets).

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

### `workflow`
Workflow lifecycle and credential inspection helpers.

#### `workflow credential-required`
List the credentials referenced by a workflow and whether matching credentials already exist.

```bash
n8nac workflow credential-required <workflowId> --json
```

This is the entry point for provisioning after a push. Exit code `1` means at least one credential is missing. Exit code `0` means everything referenced by the workflow is already present.

#### `workflow activate`
Activate a workflow once credentials are provisioned.

```bash
n8nac workflow activate <workflowId>
```

### `credential`
Inspect and create credentials from the CLI.

#### `credential schema`
Return the JSON schema for a credential type.

```bash
n8nac credential schema openAiApi
```

Use this before creating any credential type you have not seen before.

#### `credential create`
Create a credential from a JSON file.

```bash
n8nac credential create --type openAiApi --name "My OpenAI" --file cred.json --json
```

Prefer `--file` over `--data` so secrets do not end up in shell history.

#### `credential list`
List existing credentials without exposing secret values.

```bash
n8nac credential list --json
```

### `test-plan`
Inspect how a workflow can be executed over HTTP.

```bash
n8nac test-plan <workflowId> --json
```

This returns:
- the detected trigger type
- the test and production URLs
- an inferred payload
- request hints for GET/HEAD webhooks

### `test`
Execute a webhook/chat/form workflow over HTTP.

```bash
n8nac test <workflowId> --data '{"foo":"bar"}'
n8nac test <workflowId> --query '{"chatInput":"hello"}'
n8nac test <workflowId> --prod --query '{"chatInput":"hello"}'
```

Notes:
- For `GET` and `HEAD` webhooks, prefer `--query <json>`.
- `--data` still maps to query parameters for `GET` and `HEAD` requests for backward compatibility.
- `test` distinguishes setup/config gaps from fixable wiring errors.

### `execution`
Inspect workflow executions directly from the n8n server.

#### `execution list`
List recent executions, optionally filtered by workflow.

```bash
n8nac execution list --workflow-id <workflowId> --limit 5 --json
```

#### `execution get`
Fetch one execution, optionally including the run data.

```bash
n8nac execution get <executionId> --include-data --json
```

Use this immediately after a 2xx webhook call if the workflow still seems broken. A successful HTTP response only means n8n accepted the trigger; the execution may still fail later inside the workflow.

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
  "version": 2,
  "activeInstanceId": "prod",
  "instances": [
    {
      "id": "test",
      "name": "Test",
      "host": "https://test.n8n.example.com",
      "syncFolder": "workflows-test",
      "projectId": "your-test-project-id",
      "projectName": "Test",
      "instanceIdentifier": "test_instance_user"
    },
    {
      "id": "prod",
      "name": "Production",
      "host": "https://n8n.example.com",
      "syncFolder": "workflows-prod",
      "projectId": "your-project-id",
      "projectName": "Personal",
      "instanceIdentifier": "local_5678_user"
    }
  ]
}
```

The active instance is also mirrored at the top level for compatibility, but the source of truth is the `instances` array plus `activeInstanceId`.

**Note:** API keys are stored securely in your system's credential store, scoped by saved instance config when available, not in this file.

## 🔄 Workflow Management

### Git-like Sync Workflow
```bash
# 1. Initialize project
n8nac init

# Optional: switch to another saved instance config
n8nac instance select

# 2. List all workflows to see their sync status (lightweight, covers all workflows)
n8nac list

# 3. Pull a specific workflow (single workflow, by ID)
n8nac pull abc123

# 4. Edit workflow files locally
#    (edit workflows/*.workflow.ts files)

# 5. Push local changes to n8n (single workflow, by path)
n8nac push workflows/instance/project/workflow.workflow.ts
```

### Git-like Development Pattern
```bash
# See current status of all workflows
n8nac list

# Pull a specific workflow from remote (single workflow)
n8nac pull abc123

# ... edit workflow ...

# Push local changes back to n8n (single workflow)
n8nac push workflows/instance/project/workflow.workflow.ts

# Resolve a conflict (if push/pull is blocked) (single workflow)
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
  n8nac push workflows/instance/project/workflow.workflow.ts
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
n8nac push workflows/instance/project/workflow.workflow.ts
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

# Pull a specific workflow
n8nac pull <workflowId>

# Push local changes for a specific workflow file
n8nac push workflows/instance/project/workflow.workflow.ts

# Resolve a conflict
n8nac resolve <workflowId> --mode keep-current
```

### Debug Mode
Enable debug logging for detailed output:

```bash
# Debug pull operation
DEBUG=n8n-as-code:* n8nac pull <workflowId>

# Debug specific operations
DEBUG=axios,n8n-as-code:* n8nac push workflows/instance/project/workflow.workflow.ts
```

## 📚 Next Steps

- [VS Code Extension Guide](/docs/usage/vscode-extension): Visual editing experience with git-like sync
- [Getting Started](/docs/getting-started): Complete setup guide
- [Contribution Guide](/docs/contribution): Understand the architecture and development

---

*The CLI provides powerful automation capabilities for managing n8n workflows as code. Use it for scripting, CI/CD integration, and headless workflow management.*
