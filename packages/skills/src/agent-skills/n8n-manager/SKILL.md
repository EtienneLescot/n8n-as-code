---
name: n8n-manager
description: Use when the user needs local managed n8n instances, Docker lifecycle, tunnels, or machine-local instance operations through n8n-manager.
---

# n8n Manager

Use this skill for **instances managées**: local managed n8n instances, Docker lifecycle, tunnels, and machine-local operations. Workspace environments are owned by `n8nac env`.

## Responsibility Boundary

- {{N8NAC_CONTEXT_ROOT_HINT}}
- If `n8nac` is available, first run `{{N8NAC_CMD}} update-ai` from the context root, then read `AGENTS.md`. `update-ai` is designed to create or refresh the n8n-as-code block without destroying existing user or agent instructions.
- Use the exact `n8n-manager command` and `n8nac command` listed in `AGENTS.md` when present. Those context-root commands override the portable examples in this skill.
- Use `{{N8N_MANAGER_CMD}}` for local managed instance and tunnel operations.
- Use `{{N8NAC_CMD}} env ...` for workspace environments, remote URLs, local API-key binding, active environment, projects, and sync folders.
- Use `{{N8NAC_CMD}} workspace ...` only for status, migration, or upgrade.
- Use `{{N8NAC_CMD}}` workflow commands only after the effective context is ready.
- Never edit `n8nac-config.json`, `~/.n8n-manager`, or n8n-manager secret files by hand.

## Core Commands

Inspect existing managed instances before changing local machine state:

```bash
{{N8N_MANAGER_CMD}} instance list
{{N8N_MANAGER_CMD}} instance --help
{{N8N_MANAGER_CMD}} config get
```

Do not invent n8n-manager subcommands. Use `{{N8N_MANAGER_CMD}} <subcommand> --help` when unsure.

## Unconfigured Context Root

When the context root is not configured and no suitable existing instance is available, stop and ask the user to choose. Do not create infrastructure by default.

Present these choices clearly:

- use an existing managed local instance if one is available;
- create a new managed local n8n instance;
- configure a remote n8n URL as a workspace environment through `n8nac env`.

If the user chooses a managed local Docker instance, ask the tunnel question separately:

- without public tunnel: local n8n only, suitable for normal UI/API workflow work;
- with public tunnel: exposes the instance through a public URL, useful for webhooks/forms/chat triggers and remote callbacks.

Do not enable, refresh, or start a public tunnel unless the user explicitly requested public access, webhook testing, or approved the tunnel option. If public access is not needed, create/start the managed instance without `--tunnel`.

## Confirmed Setup Commands

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

Remote or existing n8n URLs are workspace environments. Prefer stdin for API keys:

```bash
{{N8NAC_CMD}} env add <name> --base-url <url> --sync-folder workflows/<name>
{{N8NAC_CMD}} env auth set <name> --api-key-stdin
{{N8NAC_CMD}} env use <name>
```

Attach a managed local instance to the workspace with `n8nac env`:

```bash
{{N8NAC_CMD}} env add Local --managed-instance <id> --sync-folder workflows/local
{{N8NAC_CMD}} env use Local
```

Instance and tunnel operations are per managed local instance:

```bash
{{N8N_MANAGER_CMD}} instance start <id>
{{N8N_MANAGER_CMD}} instance stop <id>
{{N8N_MANAGER_CMD}} instance remove <id>
{{N8N_MANAGER_CMD}} tunnel start <id>
{{N8N_MANAGER_CMD}} tunnel stop <id>
```

Present workflow results after creating, modifying, pushing, or running a workflow:

```bash
{{N8N_MANAGER_CMD}} presentWorkflowResult --workflow-id <workflowId> --workspace-root <contextRoot>
```

## Guardrails

- Do not ask for host/API key before checking whether the task is about a remote environment or a managed local instance.
- Do not ask for host/API key when the user wants a managed local Docker instance.
- Do not print API keys back to the user.
- Do not delete local instance data unless the user explicitly asks for destructive deletion.
- If Docker is unavailable or the daemon is stopped, report the backend diagnostic and stop. Do not loop.
- If a command fails repeatedly, stop after two attempts and explain the backend diagnostic.
- For workflow credentials, inspect the required credential type before asking for secret values.
