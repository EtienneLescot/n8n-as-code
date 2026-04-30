---
name: n8n-manager
description: Use when the user needs n8n instance, runtime, tunnel, auth, project, credential, or workflow presentation management through n8n-manager.
---

# n8n Manager

Use this skill for global n8n instance management. `n8n-manager` is the source of truth for instances, runtime state, tunnels, API keys, managed owner credentials, default projects, and workflow presentation links.

## Responsibility Boundary

- Generated context root hint: not embedded. Use the shell launch directory or the workspace path explicitly given by the user.
- If `n8nac` is available, first run `npx --yes n8nac@next update-ai` from the context root, then read `AGENTS.md`. `update-ai` is designed to create or refresh the n8n-as-code block without destroying existing user or agent instructions.
- Use the exact `n8n-manager command` and `n8nac command` listed in `AGENTS.md` when present. Those context-root commands override the portable examples in this skill.
- Use `npx --yes @n8n-as-code/n8n-manager@next` for global instance, auth, runtime, tunnel, project-default, credential, and workflow-presentation operations.
- Use `npx --yes n8nac@next workspace ...` only for context-root overrides such as pinned instance, sync folder, and project override.
- Use `npx --yes n8nac@next` workflow commands only after the effective context is ready.
- Never edit `n8nac-config.json`, `~/.n8n-manager`, or n8n-manager secret files by hand.

## Core Commands

Inspect existing instances before changing state:

```bash
npx --yes @n8n-as-code/n8n-manager@next instances list
npx --yes @n8n-as-code/n8n-manager@next instances --help
npx --yes @n8n-as-code/n8n-manager@next config get
```

Do not invent n8n-manager subcommands. In particular, `instances create` and `--type local` are not valid. Use `instances add --mode ...` exactly as documented by `instances --help`.

## Unconfigured Context Root

When the context root is not configured and no suitable existing instance is available, stop and ask the user to choose. Do not create infrastructure by default.

Present these choices clearly:

- use an existing n8n-manager instance if one is available;
- create a new managed local Docker n8n instance;
- connect an existing or remote n8n instance with user-provided credentials.

If the user chooses a managed local Docker instance, ask the tunnel question separately:

- without public tunnel: local n8n only, suitable for normal UI/API workflow work;
- with public tunnel: exposes the instance through a public URL, useful for webhooks/forms/chat triggers and remote callbacks.

Do not enable, refresh, or start a public tunnel unless the user explicitly requested public access, webhook testing, or approved the tunnel option. If public access is not needed, create/start the managed instance without `--tunnel`.

## Confirmed Setup Commands

Only run these commands after the user has explicitly chosen the corresponding option.

Managed local Docker without public tunnel:

```bash
npx --yes @n8n-as-code/n8n-manager@next instances add --name <name> --mode managed-local-docker
npx --yes @n8n-as-code/n8n-manager@next instances setup <id-or-name>
npx --yes @n8n-as-code/n8n-manager@next instances start <id-or-name>
npx --yes @n8n-as-code/n8n-manager@next instances status <id-or-name>
```

Managed local Docker with public tunnel:

```bash
npx --yes @n8n-as-code/n8n-manager@next instances add --name <name> --mode managed-local-docker --tunnel
npx --yes @n8n-as-code/n8n-manager@next instances setup <id-or-name> --tunnel
npx --yes @n8n-as-code/n8n-manager@next instances start <id-or-name>
npx --yes @n8n-as-code/n8n-manager@next instances tunnel status <id-or-name>
```

Remote or existing instances require user-provided credentials. Prefer stdin for API keys:

```bash
npx --yes @n8n-as-code/n8n-manager@next auth set --url <url> --api-key-stdin --name <name>
npx --yes @n8n-as-code/n8n-manager@next auth test --instance <id-or-name>
```

Project selection is instance-level unless the context root explicitly needs a workspace override:

```bash
npx --yes @n8n-as-code/n8n-manager@next projects list --instance <id-or-name>
npx --yes @n8n-as-code/n8n-manager@next projects select <project-id-or-name> --instance <id-or-name>
```

Self-hosted n8n may not expose the projects API or may return 401/403. In that case, do not retry project discovery. Use the n8n-architect workspace override path with the standard personal project unless the user gave another project:

```bash
npx --yes n8nac@next workspace set-project --project-id personal --project-name Personal
```

Runtime and tunnel operations are per instance:

```bash
npx --yes @n8n-as-code/n8n-manager@next instances start <id-or-name>
npx --yes @n8n-as-code/n8n-manager@next instances stop <id-or-name>
npx --yes @n8n-as-code/n8n-manager@next instances restart <id-or-name>
npx --yes @n8n-as-code/n8n-manager@next instances tunnel status <id-or-name>
npx --yes @n8n-as-code/n8n-manager@next instances tunnel start <id-or-name>
npx --yes @n8n-as-code/n8n-manager@next instances tunnel refresh <id-or-name>
```

Present workflow results after creating, modifying, pushing, or running a workflow:

```bash
npx --yes @n8n-as-code/n8n-manager@next presentWorkflowResult --workflow-id <workflowId> --workspace-root <contextRoot>
```

## Guardrails

- Do not ask for host/API key before checking `instances list`.
- Do not ask for host/API key when the user wants a managed local Docker instance.
- Do not print API keys back to the user.
- Do not delete runtime data unless the user explicitly asks for destructive deletion.
- If Docker is unavailable or the daemon is stopped, report the backend diagnostic and stop. Do not loop.
- If a command fails repeatedly, stop after two attempts and explain the backend diagnostic.
- For workflow credentials, inspect the required credential type before asking for secret values.
