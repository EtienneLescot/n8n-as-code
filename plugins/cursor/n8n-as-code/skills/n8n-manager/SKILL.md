---
name: n8n-manager
description: Use when the user needs local managed n8n instances, Docker lifecycle, tunnels, or machine-local instance operations through n8n-manager.
---

# n8n Manager

Use this skill for **instances managées**: local managed n8n instances, Docker lifecycle, tunnels, and machine-local operations. Workspace environments are owned by `n8nac env`.

## Responsibility Boundary

- Generated context root hint: not embedded. Use the shell launch directory or the workspace path explicitly given by the user.
- If `n8nac` is available, first run `npx --yes n8nac update-ai` from the context root, then read `AGENTS.md`. `update-ai` is designed to create or refresh the n8n-as-code block without destroying existing user or agent instructions.
- Use the exact `n8n-manager command` and `n8nac command` listed in `AGENTS.md` when present. Those context-root commands override the portable examples in this skill.
- Use `npx --yes @n8n-as-code/n8n-manager` for local managed instance and tunnel operations.
- Use `npx --yes n8nac env ...` for workspace environments, remote URLs, local API-key binding, active environment, projects, and sync folders.
- Use `npx --yes n8nac workspace ...` only for status, migration, or upgrade.
- Use `npx --yes n8nac` workflow commands only after the effective context is ready.
- Never edit `n8nac-config.json`, `~/.n8n-manager`, or n8n-manager secret files by hand.

## Core Commands

When checking workspace readiness, run the workspace status and migration dry-run together. The dry-run is safe and reports whether legacy workspace config or global instances need migration:

```bash
npx --yes n8nac workspace status --json
npx --yes n8nac workspace migrate --json
```

If `workspace migrate --json` reports `status: "dry-run"`, explain that migration is required and ask for explicit confirmation before applying it. After confirmation, run:

```bash
npx --yes n8nac workspace migrate --write
npx --yes n8nac workspace status --json
```

Inspect existing managed instances before changing local machine state:

```bash
npx --yes @n8n-as-code/n8n-manager instance list
npx --yes @n8n-as-code/n8n-manager instance --help
npx --yes @n8n-as-code/n8n-manager config get
```

Do not invent n8n-manager subcommands. Use `npx --yes @n8n-as-code/n8n-manager <subcommand> --help` when unsure.

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
npx --yes @n8n-as-code/n8n-manager instance create
npx --yes @n8n-as-code/n8n-manager instance start <id>
npx --yes @n8n-as-code/n8n-manager instance list
```

Managed local instance with public tunnel:

```bash
npx --yes @n8n-as-code/n8n-manager instance create
npx --yes @n8n-as-code/n8n-manager instance start <id>
npx --yes @n8n-as-code/n8n-manager tunnel start <id>
```

Remote or existing n8n URLs are workspace environments. Prefer stdin for API keys:

```bash
npx --yes n8nac env add <name> --base-url <url> --sync-folder workflows/<name>
npx --yes n8nac env auth set <name> --api-key-stdin
npx --yes n8nac env use <name>
```

Attach a managed local instance to the workspace with `n8nac env`:

```bash
npx --yes n8nac env add Local --managed-instance <id> --sync-folder workflows/local
npx --yes n8nac env use Local
```

Instance and tunnel operations are per managed local instance:

```bash
npx --yes @n8n-as-code/n8n-manager instance start <id>
npx --yes @n8n-as-code/n8n-manager instance stop <id>
npx --yes @n8n-as-code/n8n-manager instance remove <id>
npx --yes @n8n-as-code/n8n-manager tunnel start <id>
npx --yes @n8n-as-code/n8n-manager tunnel stop <id>
```

Present workflow results after creating, modifying, pushing, or running a workflow:

```bash
npx --yes @n8n-as-code/n8n-manager presentWorkflowResult --workflow-id <workflowId> --workspace-root <contextRoot>
```

## Guardrails

- Do not ask for host/API key before checking whether the task is about a remote environment or a managed local instance.
- Do not ask for host/API key when the user wants a managed local Docker instance.
- Do not print API keys back to the user.
- Do not delete local instance data unless the user explicitly asks for destructive deletion.
- If Docker is unavailable or the daemon is stopped, report the backend diagnostic and stop. Do not loop.
- If a command fails repeatedly, stop after two attempts and explain the backend diagnostic.
- For workflow credentials, inspect the required credential type before asking for secret values.
