---
name: n8n-architect
description: Use when the user explicitly wants to create, edit, validate, sync, or troubleshoot n8n workflows, asks about n8n nodes or automation, or wants to use n8n-as-code in the current context root.
---

# n8n Architect

Use this skill for all n8n-as-code work: workspace readiness, migration, environments, managed local instances, tunnels, workflow authoring, validation, sync, push, and pull.

Use `{{N8NAC_CMD}}` as the primary interface. Use `{{N8N_MANAGER_CMD}}` only for local managed runtime lifecycle, tunnels, and workflow presentation commands that are explicitly exposed by n8n-manager.

## Context Root Protocol

- Treat the current context root as the directory containing `n8nac-config.json`, `AGENTS.md`, `.agents/skills`, and the workflow sync folder.
- {{N8NAC_CONTEXT_ROOT_HINT}}
- Before any n8n work, first run `{{N8NAC_CMD}} update-ai` from the context root, then read `AGENTS.md`. `update-ai` is designed to create or refresh the n8n-as-code block without destroying existing user or agent instructions.
- Use the exact `n8nac command` and `n8n-manager command` listed in `AGENTS.md`. Those context-root commands override the portable examples in this skill.
- Run every `{{N8NAC_CMD}} env ...`, `{{N8NAC_CMD}} workspace ...`, `{{N8NAC_CMD}} list`, `pull`, `push`, `validate`, `test`, and `update-ai` command from the context root unless the user explicitly gives another context root.
- `AGENTS.md` is bootstrap context only, not a source of configuration truth.
- Do not infer environment, project, sync folder, or workflow directory from `AGENTS.md`.
- Before n8n work, resolve the effective context from the backend:

```bash
{{N8NAC_CMD}} env status --json
```

- Use the returned `workflowsPath` for workflow files. It is the configured workflow directory for the active environment.
- Do not reconstruct `workflowsPath` from environment name/id, `instanceIdentifier`, `instanceUserIdentifier`, `projectId`, `projectName`, or legacy sync fields.
- Never write `n8nac-config.json`, `~/.n8n-manager`, or n8n-manager secret files by hand.

## Workspace Readiness

Use the unified migration preflight before resolving the effective environment. The dry-run is safe and reports whether any workspace migration is required:

```bash
{{N8NAC_CMD}} workspace migrate --json
{{N8NAC_CMD}} env status --json
```

- Treat `workspace migrate --json` as the source of migration need.
- Treat `env status --json` as the source of effective workspace readiness only after migration is not required or has been applied.
- Do not infer readiness from raw files, generated agent docs, or directory names.
- If migration is required, do not edit config files by hand or continue with environment/workflow work until it has been applied or explicitly deferred by the user.

## Migration

Migration is one user-facing command. Do not reason about internal migration phases directly; summarize the report `operations` array when explaining what will change.

1. Run the dry-run first:

```bash
{{N8NAC_CMD}} workspace migrate --json
```

2. If the dry-run reports `status: "dry-run"`, `required: true`, or otherwise indicates pending changes, stop and ask once before applying it. Do not run `workspace migrate --write` unless the user already directly requested applying migration.
3. After confirmation, apply migration and re-check readiness:

```bash
{{N8NAC_CMD}} workspace migrate --write
{{N8NAC_CMD}} workspace migrate --json
{{N8NAC_CMD}} env status --json
```

- Do not run `workspace migrate --write` without explicit confirmation unless the user already directly requested applying migration.
- When reporting a dry-run, summarize the unified `operations` list and ask for exactly one confirmation for `{{N8NAC_CMD}} workspace migrate --write`.
- Do not ask separately for different operation types. `{{N8NAC_CMD}} workspace migrate --write` applies the required migration as one operation.
- Do not run environment, workflow, or setup commands while `workspace migrate --json` still reports migration required.
- Managed local instances remain machine-global runtime resources.
- Workspace environments remain workspace-scoped and are managed through `{{N8NAC_CMD}} env ...`.

## Bootstrap Order

1. `cd` to the context root.
2. Run `{{N8NAC_CMD}} update-ai`, then read `AGENTS.md`.
3. Run `{{N8NAC_CMD}} workspace migrate --json`.
4. If migration is required, stop and ask for confirmation before `{{N8NAC_CMD}} workspace migrate --write` unless the user already requested applying migration.
5. Run `{{N8NAC_CMD}} env status --json` after migration is not required or has been applied.
6. If the context root is not ready, inspect managed local instances with `{{N8N_MANAGER_CMD}} instance list`.
7. Reuse an existing environment or managed local instance when suitable.
8. If no suitable environment exists, stop and ask the user whether they want to connect a remote n8n URL or create/reuse a managed local n8n instance. Do not create infrastructure by default. If the user chooses a managed local instance, ask separately whether they want a public tunnel.
9. Ask for host/API key only for an explicitly remote n8n environment.
10. Configure the environment with:

```bash
{{N8NAC_CMD}} env add <name> --base-url <url> --workflows-path workflows/<name>
{{N8NAC_CMD}} env auth set <name> --api-key-stdin
{{N8NAC_CMD}} env use <name>
```

For a managed local instance:

```bash
{{N8NAC_CMD}} env add Local --managed-instance <id> --workflows-path workflows/local
{{N8NAC_CMD}} env use Local
```

11. Run `{{N8NAC_CMD}} update-ai` after changing environments when the facade does not do it automatically.

## Environments

Use `{{N8NAC_CMD}} env ...` for workspace environments, remote URLs, active environment, API-key binding, projects, and workflow paths.

```bash
{{N8NAC_CMD}} env status --json
{{N8NAC_CMD}} env list
{{N8NAC_CMD}} env add <name> --base-url <url> --workflows-path workflows/<name>
{{N8NAC_CMD}} env auth set <name> --api-key-stdin
{{N8NAC_CMD}} env use <name>
```

- Prefer `--api-key-stdin` for API keys.
- Do not pass secrets inline in shell arguments.
- Do not ask for host/API key when the user wants a managed local Docker instance.
- Do not print API keys or credential secret values back to the user.
- If a command or flag is unfamiliar, run `{{N8NAC_CMD}} env --help` or `{{N8NAC_CMD}} env <subcommand> --help`.

Attach a managed local instance to the workspace with `{{N8NAC_CMD}} env ...`:

```bash
{{N8NAC_CMD}} env add Local --managed-instance <id> --workflows-path workflows/local
{{N8NAC_CMD}} env use Local
```

## Managed Local Runtime

Use `{{N8N_MANAGER_CMD}}` only for local managed instance lifecycle, tunnels, and workflow presentation commands that are part of the local runtime layer.

Inspect existing managed instances before changing local machine state:

```bash
{{N8N_MANAGER_CMD}} instance list
{{N8N_MANAGER_CMD}} instance --help
{{N8N_MANAGER_CMD}} config get
```

Do not invent n8n-manager subcommands. Use `{{N8N_MANAGER_CMD}} <subcommand> --help` when unsure.

When the context root is not configured and no suitable existing instance is available, stop and ask the user to choose. Do not create infrastructure by default.

Present these choices clearly:

- use an existing managed local instance if one is available;
- create a new managed local n8n instance;
- configure a remote n8n URL as a workspace environment through `{{N8NAC_CMD}} env`.

If the user chooses a managed local Docker instance, ask the tunnel question separately:

- without public tunnel: local n8n only, suitable for normal UI/API workflow work;
- with public tunnel: exposes the instance through a public URL, useful for webhooks/forms/chat triggers and remote callbacks.

Do not enable, refresh, or start a public tunnel unless the user explicitly requested public access, webhook testing, or approved the tunnel option. If public access is not needed, create/start the managed instance without `--tunnel`.

Only run these commands after the user has explicitly chosen the corresponding option.

Managed local instance without public tunnel:

```bash
{{N8N_MANAGER_CMD}} instance create
{{N8N_MANAGER_CMD}} instance start <id>
{{N8N_MANAGER_CMD}} instance list
```

Managed local instance with public tunnel:

```bash
{{N8N_MANAGER_CMD}} instance create
{{N8N_MANAGER_CMD}} instance start <id>
{{N8N_MANAGER_CMD}} tunnel start <id>
```

Instance and tunnel operations are per managed local instance:

```bash
{{N8N_MANAGER_CMD}} instance start <id>
{{N8N_MANAGER_CMD}} instance stop <id>
{{N8N_MANAGER_CMD}} instance remove <id>
{{N8N_MANAGER_CMD}} tunnel start <id>
{{N8N_MANAGER_CMD}} tunnel stop <id>
```

- Do not delete local instance data unless the user explicitly asks for destructive deletion.
- If Docker is unavailable or the daemon is stopped, report the backend diagnostic and stop. Do not loop.
- If a command fails repeatedly, stop after two attempts and explain the backend diagnostic.

## Sync Discipline

- Pull before reading or modifying an existing workflow.
- Push after every modification.
- Use `list` to inspect workflow IDs, file paths, and sync status.

```bash
{{N8NAC_CMD}} list
{{N8NAC_CMD}} pull <workflowId>
{{N8NAC_CMD}} push <path-to-workflow.workflow.ts> --verify
```

- `push` requires the full workflow file path, either absolute or context-root-relative. Do not pass a bare filename.
- For a new workflow, create the file inside the `workflowsPath` returned by `env status --json`, then confirm it with `{{N8NAC_CMD}} list --local`.
- If push/pull reports a conflict, use explicit resolution commands. Do not overwrite remote changes blindly.
- `pull` and conflict resolution operate on a single workflow ID.
- `list` is the lightweight command that covers all workflows at once.
- If you skip pull, a later push can be rejected by optimistic concurrency control when the remote changed.

## Conflict Handling

If push or pull reports a conflict, stop and inspect the conflict. Use explicit resolution commands only after choosing the intended direction:

```bash
{{N8NAC_CMD}} resolve <workflowId> --mode keep-current
{{N8NAC_CMD}} resolve <workflowId> --mode keep-incoming
```

- `keep-current` force-pushes the local version.
- `keep-incoming` force-pulls the remote version.
- Never silently force-push over a remote change.

## Schema-First Research

Never guess n8n node parameters.

```bash
{{N8NAC_SKILLS_CMD}} examples search "<workflow pattern>"
{{N8NAC_SKILLS_CMD}} search "<node or capability>"
{{N8NAC_SKILLS_CMD}} node-info <nodeName>
{{N8NAC_SKILLS_CMD}} validate <workflow.workflow.ts>
```

- Use exact node `type` and valid `typeVersion` values from `node-info`.
- Use exact resource, operation, option, and parameter names from schema output.
- Do not invent parameters, operations, credential types, or CLI flags.
- Treat schema output as the absolute source of truth even if examples or memory disagree.
- Prefer the highest valid `typeVersion` returned by schema output.
- For fixed collections such as Switch/If rules, Wait form fields, or nested options, read the full `node-info` output before writing values.

## Knowledge Commands

Use these commands instead of guessing:

```bash
{{N8NAC_SKILLS_CMD}} search "<node or capability>"
{{N8NAC_SKILLS_CMD}} node-info <nodeName>
{{N8NAC_SKILLS_CMD}} node-schema <nodeName>
{{N8NAC_SKILLS_CMD}} docs "<topic>"
{{N8NAC_SKILLS_CMD}} guides "<topic>"
{{N8NAC_SKILLS_CMD}} examples search "<workflow pattern>"
{{N8NAC_SKILLS_CMD}} examples info <id>
{{N8NAC_SKILLS_CMD}} examples download <id>
```

- Start with `examples search` when the user asks for a common automation pattern.
- Use examples to learn patterns, not as authority over current node schemas.
- If a command or flag is unfamiliar, run `{{N8NAC_CMD}} <subcommand> --help`; do not invent flags.

## Workflow Authoring Rules

- Use TypeScript decorators from `@n8n-as-code/transformer`.
- Regular nodes connect with `source.out(0).to(target.in(0))`.
- AI sub-nodes connect with `.uses()`, never `.out().to()`.
- `ai_tool` and `ai_document` connections are arrays: `ai_tool: [this.Tool.output]`.
- Other AI connection types are single refs, such as `ai_languageModel: this.Model.output`.
- Check `node-info` for connection-dependent boolean flags before declaring `.uses()` connections.

Every `.workflow.ts` file starts with a `<workflow-map>` block. Read that map first, locate the property name you need, then read only the relevant class section.

### Minimal Workflow Structure

```typescript
import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({
  name: 'Workflow Name',
  active: false
})
export class MyWorkflow {
  @node({
    name: 'Descriptive Name',
    type: '/* exact type from node-info */',
    version: 4,
    position: [250, 300]
  })
  MyNode = {
    /* parameters from node-info */
  };

  @node({
    name: 'Next Node',
    type: '/* exact type from node-info */',
    version: 3,
    position: [520, 300]
  })
  NextNode = {};

  @links()
  defineRouting() {
    this.MyNode.out(0).to(this.NextNode.in(0));
  }
}
```

### Expression Syntax

- Prefer modern expressions: `{{ $json.fieldName }}`.
- Use specific-node expressions when needed: `{{ $('Node Name').item.json.field }}`.
- Avoid legacy `$node["Name"].json.field` unless you are preserving an existing workflow and have a reason.
- In Switch/If comparisons, `value1` is the expression being evaluated and `value2` is the literal comparison value.

### Node Naming

- Use descriptive names such as `Get Customers`, `Send Slack Alert`, or `Normalize Payload`.
- Avoid names like `Node1`, `HTTP Request`, or `Code` when a more specific name is available.
- Connection references must match the exact node property names in the TypeScript class.

## Reading Workflow Files Efficiently

Use the `<workflow-map>` block as the index before loading large workflow files.

```typescript
// <workflow-map>
// Workflow : My Workflow
// Nodes   : 12  |  Connections: 14
//
// NODE INDEX
// Property name                    Node type (short)         Flags
// ScheduleTrigger                  scheduleTrigger
// AgentGenerateApplication         agent                      [AI] [creds]
// OpenaiChatModel                  lmChatOpenAi               [creds] [ai_languageModel]
// Memory                           memoryBufferWindow         [ai_memory]
// GithubCheckBranchRef             httpRequest                [onError->out(1)]
//
// ROUTING MAP
// ScheduleTrigger
//   -> Configuration
//     -> BuildProfileSources -> LoopOverProfileSources
//
// AI CONNECTIONS
// AgentGenerateApplication.uses({ ai_languageModel: OpenaiChatModel, ai_memory: Memory })
// </workflow-map>
```

Navigation rule:

1. Read `<workflow-map>` first.
2. Locate the property name you need.
3. Search for that property in the file.
4. Read only the relevant node or routing section unless broader context is required.

## AI And LangChain Node Rules

AI sub-nodes are not regular data-flow nodes.

```typescript
@links()
defineRouting() {
  this.ChatTrigger.out(0).to(this.AiAgent.in(0));

  this.AiAgent.uses({
    ai_languageModel: this.OpenaiModel.output,
    ai_memory: this.Memory.output,
    ai_outputParser: this.OutputParser.output,
    ai_tool: [this.SearchTool.output],
  });
}
```

- Use `.uses()` for language models, memory, tools, parsers, embeddings, vector stores, retrievers, and other AI sub-nodes.
- Never connect AI sub-nodes with `.out().to()`.
- `ai_tool` and `ai_document` must be arrays.
- Most other AI connection types are single refs.
- Some nodes require boolean flags to expose AI ports or gated parameters. Check `node-info` before declaring `.uses()`.

## Common Mistakes To Avoid

- Wrong node type: use the exact full type returned by schema output, including package prefix when provided.
- Outdated or non-existent typeVersion: use a value from the schema output.
- Invalid operation/resource value: use exact option values from the schema.
- Mismatched resource and operation: each resource enables its own operations.
- Guessing nested structures: fixed collections have exact shapes.
- Wrong connection names: match TypeScript property names exactly.
- Inventing nodes, credentials, operations, or parameters.
- Connecting AI sub-nodes with `.out().to()`.
- Using `ai_tool: this.Tool.output` instead of `ai_tool: [this.Tool.output]`.
- Inverting Switch/If `value1` and `value2`.
- Using old Wait form structures such as `formFieldsUi.fieldItems` when the current schema expects `formFields: { values: [...] }`.
- Passing a bare filename to `push`.
- Treating Class A runtime/config gaps as workflow-code bugs.

## Verify, Test, And Present

After pushing:

```bash
{{N8NAC_CMD}} verify <workflowId>
{{N8NAC_CMD}} test-plan <workflowId> --json
```

For webhook, chat, or form workflows, prefer the production test sequence:

```bash
{{N8NAC_CMD}} workflow activate <workflowId>
{{N8NAC_CMD}} test <workflowId> --prod
```

- Class A configuration gaps require user/config action, not workflow rewrites.
- Runtime-state issues such as unarmed test webhooks are not workflow-code bugs.
- Class B wiring errors are fixable in the workflow file.
- Stop after two repeated failures with the same diagnostic.

## Workflow Presentation Contract

`{{N8NAC_CMD}} workflow present` is the standard way to show a workflow to the user. It is v4-environment aware and part of the workflow authoring loop.

Run it whenever one of these is true:

- you created a workflow;
- you modified and pushed a workflow;
- you ran or tested a workflow and the user needs to inspect it;
- the user asks to show, open, present, display, or give the URL/link for a workflow.

```bash
{{N8NAC_CMD}} workflow present <workflowId> --json
```

Rules:

- Do not manually construct n8n workflow URLs.
- Do not return an internal local n8n URL when a presentation URL is available.
- Use the `url` returned by `workflow present --json` as the user-facing URL.
- If you do not know the workflow ID, run `{{N8NAC_CMD}} list` first and select the matching workflow.
- Do not call `{{N8N_MANAGER_CMD}} presentWorkflowResult`; it is a legacy runtime command and is not workspace-environment aware.
- If `workflow present` fails, report the backend diagnostic and then provide the best direct n8n URL only as a fallback.
- Do this before the final response when the task created, changed, pushed, ran, or explicitly asks to show a workflow.

### Testability Protocol

For webhook, chat, or form workflows:

1. Push with verification when possible.
2. Run `test-plan` to inspect trigger type, endpoint, and suggested payload.
3. Activate the workflow.
4. Test with `--prod` by default.

```bash
{{N8NAC_CMD}} push <path-to-workflow.workflow.ts> --verify
{{N8NAC_CMD}} test-plan <workflowId> --json
{{N8NAC_CMD}} workflow activate <workflowId>
{{N8NAC_CMD}} test <workflowId> --prod
```

Use bare `{{N8NAC_CMD}} test <workflowId>` only when a test URL was intentionally armed in the n8n editor.

For GET/HEAD webhooks that read from `$json.query`, prefer:

```bash
{{N8NAC_CMD}} test <workflowId> --query '{"key":"value"}' --prod
```

## Execution Debugging

If a webhook returns success but the workflow behavior is wrong, inspect executions instead of guessing:

```bash
{{N8NAC_CMD}} execution list --workflow-id <workflowId> --limit 5 --json
{{N8NAC_CMD}} execution get <executionId> --include-data --json
```

- A successful HTTP trigger only means n8n accepted the request.
- The execution can still fail later inside the workflow.
- Use execution data to identify the failing node and real payload shape.

## Credential Workflow

When a workflow is blocked by missing credentials, resolve the credential gap without rewriting unrelated workflow logic.

```bash
{{N8NAC_CMD}} workflow credential-required <workflowId> --json
{{N8NAC_CMD}} credential schema <type>
{{N8NAC_CMD}} credential list --json
{{N8NAC_CMD}} credential create --type <type> --name <name> --file cred.json --json
{{N8NAC_CMD}} workflow activate <workflowId>
```

- `workflow credential-required` exits non-zero when at least one credential is missing. Treat that as a signal to act, not as a workflow-code failure.
- Use `credential schema` to discover required fields.
- Ask the user for secret values when needed.
- Prefer `--file` for credential creation. Do not pass secrets inline in shell arguments.
- Do not print API keys or credential secret values back to the user.
- If credential creation fails, read the validation message and change the payload before retrying.

## Operating Loop

For most workflow tasks:

1. Resolve context with `env status --json`.
2. Read `workflowsPath` from the backend response.
3. Inspect existing workflows with `list`.
4. Pull before editing an existing workflow.
5. Search examples and schemas.
6. Edit or create the `.workflow.ts` file.
7. Validate locally.
8. Push with `--verify`.
9. Test if the workflow is HTTP-triggered.
10. Inspect executions when behavior is unclear.
11. Present the final workflow link with `{{N8NAC_CMD}} workflow present <workflowId> --json`.

## Response Discipline

- Explain concrete actions and command results, not generic capability.
- When the user asks for an URL or visual inspection of a workflow, run `{{N8NAC_CMD}} workflow present <workflowId> --json` instead of composing a URL manually.
- If setup is missing, use `n8nac env ...` for workspace environments and `n8n-manager` only for managed local instances.
- Do not ask for host/API key unless the user chooses a remote n8n environment.
- Do not tell the user to run setup commands when you can run non-interactive commands yourself.
- Stop after two repeated failures with the same diagnostic and report the backend error clearly.
