---
name: n8n-manager
description: Use when the user needs n8n instance, runtime, tunnel, auth, project, credential, or workflow presentation management through n8n-manager.
---

# n8n Manager

Use this skill for global n8n instance management. `n8n-manager` is the source of truth for instances, runtime state, tunnels, API keys, managed owner credentials, default projects, and workflow presentation links.

## Responsibility Boundary

- Use `{{N8N_MANAGER_CMD}}` for global instance, auth, runtime, tunnel, project-default, credential, and workflow-presentation operations.
- Use `{{N8NAC_CMD}} workspace ...` only for context-root overrides such as pinned instance, sync folder, and project override.
- Use `{{N8NAC_CMD}}` workflow commands only after the effective context is ready.
- Never edit `n8nac-config.json`, `~/.n8n-manager`, or n8n-manager secret files by hand.

## Core Commands

Inspect existing instances before changing state:

```bash
{{N8N_MANAGER_CMD}} instances list
{{N8N_MANAGER_CMD}} config get
```

Managed local Docker instances do not require a host URL or API key:

```bash
{{N8N_MANAGER_CMD}} instances add --name <name> --mode managed-local-docker --tunnel
{{N8N_MANAGER_CMD}} instances setup <id-or-name> --tunnel
{{N8N_MANAGER_CMD}} instances start <id-or-name>
{{N8N_MANAGER_CMD}} instances status <id-or-name>
```

Remote or existing instances require user-provided credentials. Prefer stdin for API keys:

```bash
{{N8N_MANAGER_CMD}} auth set --url <url> --api-key-stdin --name <name>
{{N8N_MANAGER_CMD}} auth test --instance <id-or-name>
```

Project selection is instance-level unless the context root explicitly needs a workspace override:

```bash
{{N8N_MANAGER_CMD}} projects list --instance <id-or-name>
{{N8N_MANAGER_CMD}} projects select <project-id-or-name> --instance <id-or-name>
```

Runtime and tunnel operations are per instance:

```bash
{{N8N_MANAGER_CMD}} instances start <id-or-name>
{{N8N_MANAGER_CMD}} instances stop <id-or-name>
{{N8N_MANAGER_CMD}} instances restart <id-or-name>
{{N8N_MANAGER_CMD}} instances tunnel status <id-or-name>
{{N8N_MANAGER_CMD}} instances tunnel start <id-or-name>
{{N8N_MANAGER_CMD}} instances tunnel refresh <id-or-name>
```

Present workflow results after creating, modifying, pushing, or running a workflow:

```bash
{{N8N_MANAGER_CMD}} presentWorkflowResult --workflow-id <workflowId> --workspace-root <contextRoot>
```

## Guardrails

- Do not ask for host/API key before checking `instances list`.
- Do not ask for host/API key when the user wants a managed local Docker instance.
- Do not print API keys back to the user.
- Do not delete runtime data unless the user explicitly asks for destructive deletion.
- If Docker is unavailable or the daemon is stopped, report the backend diagnostic and stop. Do not loop.
- If a command fails repeatedly, stop after two attempts and explain the backend diagnostic.
- For workflow credentials, inspect the required credential type before asking for secret values.

