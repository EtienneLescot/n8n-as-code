# <img src="https://raw.githubusercontent.com/EtienneLescot/n8n-as-code/main/res/logo.png" alt="n8n-as-code logo" width="32" height="32"> n8nac

The main command-line interface for the **n8n-as-code** ecosystem. Manage, synchronize, and version-control your n8n workflows as TypeScript files.

> This package also embeds the synchronization engine and exposes it as a library for the VS Code extension. It includes a `skills` subcommand group that forwards to `@n8n-as-code/skills` for AI agent tooling.

## Installation

No installation required — run directly with npx:

```bash
npx n8nac <command>
```

For CI, scripts, and AI agents, prefer `npx --yes` to avoid interactive install prompts:

```bash
npx --yes n8nac <command>
```

If you need fully repeatable automation, pin an explicit package version instead of relying on whatever `npx` resolves that day:

```bash
npx --yes n8nac@0.11.5 <command>
```

Or install globally if you prefer:

```bash
npm install -g n8nac
```

## Commands

### `init`
Interactive wizard by default — save an n8n instance config and pick the active project.

```bash
n8nac init
```

Creates or updates `n8nac-config.json` in the current folder and stores the API key outside the repo.

For automation and AI agents, `init` also supports a non-interactive mode:

```bash
n8nac init --yes --host http://localhost:5678 --api-key "$N8N_API_KEY"
```

If multiple projects are available, pass one of the project selectors:

```bash
n8nac init --yes --host http://localhost:5678 --api-key "$N8N_API_KEY" --project-id <projectId>
n8nac init --yes --host http://localhost:5678 --api-key "$N8N_API_KEY" --project-name "Personal"
n8nac init --yes --host http://localhost:5678 --api-key "$N8N_API_KEY" --project-index 1
```

If no project selector is provided, `init --yes` will auto-select the only available project, or the single personal project when that choice is unambiguous. Otherwise it fails with a list of available projects.

`init` is the ergonomic alias for `n8nac instance add`.

---

### `instance`
Manage saved n8n instance configs in the current workspace.

```bash
n8nac instance add
n8nac instance select
n8nac instance list
n8nac instance delete
```

Use these commands when you want to keep multiple existing n8n environments in one workspace and choose which config is active.

---

### `switch`
Switch the active n8n project (updates `projectId` / `projectName` in `n8nac-config.json`).

```bash
n8nac switch
```

---

### `list`
Display workflow status in a git-like model. By default shows combined local and remote workflows.

```bash
n8nac list                    # Combined view (default)
n8nac list --local            # Show only local workflows
n8nac list --remote           # Show only remote workflows (alias: --distant)
n8nac list --search billing   # Filter by partial name, ID, or filename
n8nac list --sort name        # Strict alphabetical sorting
n8nac find billing --limit 5  # Search-oriented shortcut
```

Output columns: `Status` · `ID` · `Name` · `Local Path`

Search and filter options:

- `--search <query>`: case-insensitive partial match against workflow name, ID, or local filename
- `--sort <status|name>`: keep the default sync-oriented status ordering, or switch to alphabetical name sorting
- `--limit <n>`: cap the number of results returned
- `--raw`: output the filtered result set as JSON for scripts and pipes

Status values:

| Status | Meaning | Action |
|---|---|---|
| `TRACKED`             | Workflow exists on both sides, in sync                              | Nothing to do |
| `CONFLICT`            | Both sides changed — detected at push/pull time | `n8nac resolve <id> --mode keep-current` (keep local) or `keep-incoming` (keep remote) |
| `EXIST_ONLY_LOCALLY`  | New local file not yet in n8n (or remote was deleted) | `n8nac push <file>` |
| `EXIST_ONLY_REMOTELY` | Remote workflow not yet local (or local was deleted) | `n8nac pull <workflowId>` to download |

> **Git-like sync**: Status is a point-in-time observation. `n8nac` refreshes the remote state it needs under the hood.
> **For agents**: always run `n8nac list` first to get workflow IDs and their current status before pulling or pushing.

---

### `pull <workflowId>`
Download a single workflow from n8n and overwrite the local file.

```bash
n8nac pull <workflowId>
```

> Recommended for agents and scripts. Targets exactly one workflow.

---

### `push`
Upload a single local workflow file to n8n.

```bash
n8nac push workflows/etiennel_cloud_etienne_l/personal/my-workflow.workflow.ts
```

> Provide the relative path to the workflow file. The file **must** reside within the active sync scope defined by your configuration. Any path outside this scope will be rejected for safety.
> The path is the local entry point; the workflow ID remains the remote source of truth.

---

### `resolve <id> --mode <mode>`
Explicitly resolve a conflict for a specific workflow.

```bash
n8nac resolve <id> --mode keep-current    # Force-push local version
n8nac resolve <id> --mode keep-incoming   # Force-pull remote version
```

---

### `update-ai`
Generate or refresh AI context files in the project root. This command creates `AGENTS.md` and VS Code snippets.

```bash
n8nac update-ai
# or equivalently:
n8nac skills update-ai
```

AI tooling commands are available as `n8nac skills <command>` — powered by `@n8n-as-code/skills`. Run via npx (no global install needed):

```bash
npx n8nac skills --help
npx n8nac skills search "google sheets"
npx n8nac skills node-info googleSheets
```

---

### `convert`
Convert a single workflow between JSON and TypeScript formats.

```bash
n8nac convert <file>
n8nac convert my-workflow.json --format typescript
n8nac convert my-workflow.workflow.ts --format json
```

### `convert-batch`
Batch-convert all workflows in a directory.

```bash
n8nac convert-batch workflows/ --format typescript
```

---

## 🤖 Agent workflow

The intended flow for an AI agent editing a workflow:

```bash
# 1. Fetch current state and get workflow IDs
n8nac list

# 2. Pull the target workflow
n8nac pull <workflowId>

# 3. Edit the local .workflow.ts file

# 4. Push it back
n8nac push my-workflow.workflow.ts
```

---

## 🏗 Part of the Ecosystem
- `@n8n-as-code/skills`: Internal AI-integration library (node search, schemas, context generation) — accessible via `n8nac skills`.
- `vscode-extension`: Visual editing in VS Code (uses this package as its sync library).

## 📄 License
MIT
