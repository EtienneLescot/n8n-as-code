---
name: n8n-architect
description: Use when the user explicitly wants to create, edit, validate, sync, or troubleshoot n8n workflows, asks about n8n nodes or automation, or wants to use n8nac in the current workspace.
---

# n8n Architect

Use this skill only for explicit n8n workflow work.

## Operating model

This plugin is installed globally in Cursor, but n8n-as-code operations are still workspace-scoped.

- Each workspace that should sync workflows must be initialized independently.
- The active workspace is the source of truth for `n8nac-config.json`, `AGENTS.md`, and the local workflow files.
- Do not assume that because the plugin is globally available, the current workspace is already initialized.

## Tool priority

Prefer tools in this order:

1. Use the `n8nac` CLI for all workspace operations: initialization, instance selection, list, pull, push, resolve, verify, test, credential management, and execution inspection.
2. After initialization, read `AGENTS.md` from the workspace root and treat it as the detailed workflow-engineering protocol for that specific workspace.
3. Use the bundled MCP server only for knowledge lookups or validation fallback when that is more direct than the CLI. Do not rely on MCP for workspace mutations.

## Workspace bootstrap

Before using any workflow command, check whether the workspace is initialized.

### Initialization check

- Look for `n8nac-config.json` at the root of the target workspace.
- If `n8nac-config.json` is missing, or it exists but does not contain a selected project context, the workspace is not initialized yet.
- Never ask the user to run `n8nac` commands themselves. You are the agent and must run them.
- Default non-interactive setup flow:
  - `npx --yes n8nac init-auth --host <url> --api-key <key> [--sync-folder <path>]`
  - `npx --yes n8nac init-project --project-id <id>|--project-name <name>|--project-index <n> [--sync-folder <path>]`
- If the target project is already known, a one-command setup is also valid:
  - `npx --yes n8nac init --yes --host <url> --api-key <key> --project-id <id>|--project-name <name>|--project-index <n> [--sync-folder <path>]`
- If saved instances already exist, inspect them first with `npx --yes n8nac instance list --json`.
- Reuse an existing saved instance with `npx --yes n8nac instance select --instance-id <id>` or `--instance-name <name>` when possible.
- Never write `n8nac-config.json` by hand.

### Required order

1. Check for `n8nac-config.json`.
2. If saved configs exist, inspect them with `npx --yes n8nac instance list --json`.
3. If initialization is missing and credentials are available, run `init-auth`, inspect projects, then run `init-project`.
4. If credentials are missing, ask the user for the n8n host URL and API key, then run the commands yourself.
5. After initialization, read `AGENTS.md` before making workflow changes.

## Sync discipline

This project uses a Git-like explicit sync model.

### Before modifying a workflow

Always pull first:

```bash
npx --yes n8nac pull <workflowId>
```

### After modifying a workflow

Always push the local file back to n8n:

```bash
npx --yes n8nac push <path-to-workflow>
npx --yes n8nac push <path-to-workflow> --verify
```

### Conflict handling

If push fails with an OCC conflict:

- Inspect the workflow state with `npx --yes n8nac list --json`.
- Resolve explicitly with:
  - `npx --yes n8nac resolve <workflowId> --mode keep-current`
  - `npx --yes n8nac resolve <workflowId> --mode keep-incoming`
- Never overwrite remote changes blindly.

## Research protocol

Never guess node parameters.

### Preferred lookup path

If CLI access is available, use:

```bash
npx --yes n8nac skills search "http request"
npx --yes n8nac skills node-info "httpRequest"
npx --yes n8nac validate workflow.workflow.ts
```

If the MCP tools are available and it is more convenient, use them for the same knowledge tasks:

- `search_n8n_knowledge`
- `get_n8n_node_info`
- `search_n8n_workflow_examples`
- `get_n8n_workflow_example`
- `search_n8n_docs`
- `validate_n8n_workflow`

Use MCP for lookup and validation. Use CLI for sync and runtime operations.

## Reading workflow files efficiently

Every `.workflow.ts` file starts with a `<workflow-map>` block. Read that first before opening the rest of the file.

1. Read `<workflow-map>` only.
2. Locate the property name you need.
3. Search that property name in the file.
4. Read only that section instead of the whole workflow.

## Coding standards

### TypeScript decorator format

```typescript
import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({
  name: 'Workflow Name',
  active: false,
})
export class MyWorkflow {
  @node({
    name: 'Descriptive Name',
    type: 'httpRequest',
    version: 4,
    position: [250, 300],
  })
  MyNode = {
    // Parameters must come from schema lookup.
  };

  @links()
  defineRouting() {
    this.MyNode.out(0).to(this.NextNode.in(0));
  }
}
```

### AI node wiring

- Regular data flow uses `.out(0).to(target.in(0))`.
- AI sub-nodes must use `.uses()`.
- `ai_tool` and `ai_document` are arrays.
- Other AI connection types are single refs.

## Testing and credentials

After pushing:

```bash
npx --yes n8nac test-plan <workflowId>
npx --yes n8nac workflow credential-required <workflowId> --json
npx --yes n8nac credential schema <type>
npx --yes n8nac credential create --type <type> --name "<name>" --file cred.json --json
npx --yes n8nac workflow activate <workflowId>
npx --yes n8nac test <workflowId> --prod
```

If a workflow still looks broken after a successful webhook call, inspect executions:

```bash
npx --yes n8nac execution list --workflow-id <workflowId> --limit 5 --json
npx --yes n8nac execution get <executionId> --include-data --json
```

## Response rules

- Check initialization first.
- Use CLI as the default runtime and mutation interface.
- Read `AGENTS.md` after initialization and follow it as workspace-specific guidance.
- Use MCP for lookup and validation when helpful, not as the primary mutation path.
- Pull before editing. Push after editing.
- Never hallucinate node names, parameters, or CLI flags.
