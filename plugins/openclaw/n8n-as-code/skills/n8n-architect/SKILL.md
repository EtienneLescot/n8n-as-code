---
name: n8n-architect
description: Use when the user explicitly wants to create, edit, validate, sync, or troubleshoot n8n workflows, asks about n8n nodes or automation, or wants to use n8n-as-code in the current context root.
---

# n8n Architect

Use this skill for workflow engineering. Use the `n8n-manager` skill for instance, auth, runtime, tunnel, project-default, credential infrastructure, or workflow presentation work.

## Context Root Protocol

- Treat the current context root as the directory containing `n8nac-config.json`, `AGENTS.md`, `.agents/skills`, and the workflow sync folder.
- If `AGENTS.md` exists, read it first. It is bootstrap context only, not a source of configuration truth.
- Do not infer instance, project, sync folder, or workflow directory from `AGENTS.md`.
- Before n8n work, resolve the effective context from the backend:

```bash
npx --yes n8nac workspace status --json
```

- Use the returned `workflowDir` for workflow files. Do not reconstruct it from `syncFolder`, `instanceIdentifier`, or `projectName`.
- Never write `n8nac-config.json` by hand. Use `npx --yes n8nac workspace ...` commands.

## Bootstrap Order

1. Run `npx --yes n8nac workspace status --json`.
2. If the context root is not ready, inspect instances with `n8n-manager instances list`.
3. Reuse an existing instance when suitable, or use the `n8n-manager` skill to create/setup a managed local instance.
4. Ask for host/API key only for an explicitly remote or existing n8n instance.
5. Configure context-root overrides with:

```bash
npx --yes n8nac workspace pin-instance --instance-id <id>
npx --yes n8nac workspace set-sync-folder workflows
npx --yes n8nac workspace set-project --project-id <id> --project-name <name>
```

6. Run `npx --yes n8nac update-ai` after changing context-root overrides when the facade does not do it automatically.

## Sync Discipline

- Pull before reading or modifying an existing workflow.
- Push after every modification.
- Use `list` to inspect workflow IDs, file paths, and sync status.

```bash
npx --yes n8nac list
npx --yes n8nac pull <workflowId>
npx --yes n8nac push <path-to-workflow.workflow.ts> --verify
```

- `push` requires the full workflow file path, either absolute or context-root-relative. Do not pass a bare filename.
- For a new workflow, create the file inside the `workflowDir` returned by `workspace status --json`, then confirm it with `npx --yes n8nac list --local`.
- If push/pull reports a conflict, use explicit resolution commands. Do not overwrite remote changes blindly.
- `pull` and conflict resolution operate on a single workflow ID.
- `list` is the lightweight command that covers all workflows at once.
- If you skip pull, a later push can be rejected by optimistic concurrency control when the remote changed.

## Conflict Handling

If push or pull reports a conflict, stop and inspect the conflict. Use explicit resolution commands only after choosing the intended direction:

```bash
npx --yes n8nac resolve <workflowId> --mode keep-current
npx --yes n8nac resolve <workflowId> --mode keep-incoming
```

- `keep-current` force-pushes the local version.
- `keep-incoming` force-pulls the remote version.
- Never silently force-push over a remote change.

## Schema-First Research

Never guess n8n node parameters.

```bash
npx --yes n8nac skills examples search "<workflow pattern>"
npx --yes n8nac skills search "<node or capability>"
npx --yes n8nac skills node-info <nodeName>
npx --yes n8nac skills validate <workflow.workflow.ts>
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
npx --yes n8nac skills search "<node or capability>"
npx --yes n8nac skills node-info <nodeName>
npx --yes n8nac skills node-schema <nodeName>
npx --yes n8nac skills docs "<topic>"
npx --yes n8nac skills guides "<topic>"
npx --yes n8nac skills examples search "<workflow pattern>"
npx --yes n8nac skills examples info <id>
npx --yes n8nac skills examples download <id>
```

- Start with `examples search` when the user asks for a common automation pattern.
- Use examples to learn patterns, not as authority over current node schemas.
- If a command or flag is unfamiliar, run `npx --yes n8nac <subcommand> --help`; do not invent flags.

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
npx --yes n8nac verify <workflowId>
npx --yes n8nac test-plan <workflowId> --json
```

For webhook, chat, or form workflows, prefer the production test sequence:

```bash
npx --yes n8nac workflow activate <workflowId>
npx --yes n8nac test <workflowId> --prod
```

- Class A configuration gaps require user/config action, not workflow rewrites.
- Runtime-state issues such as unarmed test webhooks are not workflow-code bugs.
- Class B wiring errors are fixable in the workflow file.
- Stop after two repeated failures with the same diagnostic.

## Workflow Presentation Contract

`presentWorkflowResult` is the standard way to show a workflow to the user. It is part of the workflow authoring loop, even though the command lives in n8n-manager.

Run it whenever one of these is true:

- you created a workflow;
- you modified and pushed a workflow;
- you ran or tested a workflow and the user needs to inspect it;
- the user asks to show, open, present, display, or give the URL/link for a workflow.

```bash
n8n-manager presentWorkflowResult --workflow-id <workflowId> --workspace-root <contextRoot>
```

Rules:

- Do not manually construct n8n workflow URLs.
- Do not return an internal local n8n URL when a presentation URL is available.
- Use the `url` returned by `presentWorkflowResult` as the user-facing URL.
- If you do not know the workflow ID, run `npx --yes n8nac list` first and select the matching workflow.
- If `presentWorkflowResult` fails, report the backend diagnostic and then provide the best direct n8n URL only as a fallback.
- Do this before the final response when the task created, changed, pushed, ran, or explicitly asks to show a workflow.

### Testability Protocol

For webhook, chat, or form workflows:

1. Push with verification when possible.
2. Run `test-plan` to inspect trigger type, endpoint, and suggested payload.
3. Activate the workflow.
4. Test with `--prod` by default.

```bash
npx --yes n8nac push <path-to-workflow.workflow.ts> --verify
npx --yes n8nac test-plan <workflowId> --json
npx --yes n8nac workflow activate <workflowId>
npx --yes n8nac test <workflowId> --prod
```

Use bare `npx --yes n8nac test <workflowId>` only when a test URL was intentionally armed in the n8n editor.

For GET/HEAD webhooks that read from `$json.query`, prefer:

```bash
npx --yes n8nac test <workflowId> --query '{"key":"value"}' --prod
```

## Execution Debugging

If a webhook returns success but the workflow behavior is wrong, inspect executions instead of guessing:

```bash
npx --yes n8nac execution list --workflow-id <workflowId> --limit 5 --json
npx --yes n8nac execution get <executionId> --include-data --json
```

- A successful HTTP trigger only means n8n accepted the request.
- The execution can still fail later inside the workflow.
- Use execution data to identify the failing node and real payload shape.

## Credential Workflow

When a workflow is blocked by missing credentials, resolve the credential gap without rewriting unrelated workflow logic.

```bash
npx --yes n8nac workflow credential-required <workflowId> --json
npx --yes n8nac credential schema <type>
npx --yes n8nac credential list --json
npx --yes n8nac credential create --type <type> --name <name> --file cred.json --json
npx --yes n8nac workflow activate <workflowId>
```

- `workflow credential-required` exits non-zero when at least one credential is missing. Treat that as a signal to act, not as a workflow-code failure.
- Use `credential schema` to discover required fields.
- Ask the user for secret values when needed.
- Prefer `--file` for credential creation. Do not pass secrets inline in shell arguments.
- Do not print API keys or credential secret values back to the user.
- If credential creation fails, read the validation message and change the payload before retrying.

## Operating Loop

For most workflow tasks:

1. Resolve context with `workspace status --json`.
2. Read `workflowDir` from the backend response.
3. Inspect existing workflows with `list`.
4. Pull before editing an existing workflow.
5. Search examples and schemas.
6. Edit or create the `.workflow.ts` file.
7. Validate locally.
8. Push with `--verify`.
9. Test if the workflow is HTTP-triggered.
10. Inspect executions when behavior is unclear.
11. Present the final workflow link with `presentWorkflowResult`.

## Response Discipline

- Explain concrete actions and command results, not generic capability.
- When the user asks for an URL or visual inspection of a workflow, run `presentWorkflowResult` instead of composing a URL manually.
- If setup is missing, use `n8n-manager` for instance/auth/runtime and `n8nac workspace ...` for context-root overrides.
- Do not ask for host/API key until existing n8n-manager instances have been inspected.
- Do not tell the user to run setup commands when you can run non-interactive commands yourself.
- Stop after two repeated failures with the same diagnostic and report the backend error clearly.
