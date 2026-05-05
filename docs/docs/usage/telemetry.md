---
title: Telemetry
---

# Telemetry

n8n-as-code collects anonymous, privacy-first product telemetry to understand active usage across the CLI, VS Code/Cursor extension, MCP server, skills commands, and OpenClaw plugin.

Telemetry is used to answer product-level questions such as:

- How many active users use n8n-as-code?
- Which facades are used most: CLI, VS Code, MCP, skills, or plugins?
- Where does setup fail?
- Which workflows are common: sync, validation, conversion, credentials, or execution inspection?

## Disable Telemetry

Use the CLI:

```bash
n8nac telemetry disable
```

Check status:

```bash
n8nac telemetry status
```

Enable again:

```bash
n8nac telemetry enable
```

Telemetry is also disabled when any of these environment variables are set:

```bash
N8NAC_TELEMETRY=0
N8NAC_TELEMETRY=false
N8NAC_TELEMETRY_DISABLED=1
DO_NOT_TRACK=1
CI=true
```

The VS Code extension also respects VS Code's telemetry setting.

On the documentation site, use the telemetry control in the bottom-right corner to disable or re-enable anonymous docs telemetry in your browser.

## Connect PostHog Cloud

n8n-as-code sends telemetry to a PostHog project using the PostHog **Project token**. The PostHog **Project ID** is for the PostHog API and is not used for event ingestion.

For a US Cloud PostHog project:

```bash
export N8NAC_POSTHOG_KEY="phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export N8NAC_POSTHOG_HOST="https://us.i.posthog.com"
export N8NAC_TELEMETRY_ENV="dev"
```

For an EU Cloud PostHog project:

```bash
export N8NAC_POSTHOG_KEY="phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export N8NAC_POSTHOG_HOST="https://eu.i.posthog.com"
export N8NAC_TELEMETRY_ENV="dev"
```

Every event includes a `telemetry_environment` property so one PostHog project can safely separate local development, tests, prereleases, and production. Use `N8NAC_TELEMETRY_ENV=dev` in `./.env`, `N8NAC_TELEMETRY_ENV=test` in `./.env.test`, `N8NAC_TELEMETRY_ENV=next` for prerelease builds, and `N8NAC_TELEMETRY_ENV=prod` for stable production builds.

During release builds, `@n8n-as-code/telemetry` embeds the PostHog project token, host, and telemetry environment from the build environment into the published package. Runtime environment variables still take precedence, so local development and tests can override the release defaults without changing the published artifacts.

Check the local telemetry status:

```bash
n8nac telemetry status
```

To inspect events locally while testing:

```bash
N8NAC_TELEMETRY_DEBUG=1 n8nac workspace status
```

In PostHog, open the target project and use the `Events` or `Activity` view to verify events such as `first_seen`, `product_active`, `cli_command_completed`, or `vscode_extension_activated`. Dashboards are built from PostHog insights over those events; the product code only needs the project token and region host.

## What Is Collected

Telemetry events contain only coarse product usage metadata:

- anonymous installation ID
- telemetry environment, such as `dev`, `test`, `next`, or `prod`
- facade, such as `cli`, `vscode`, `mcp`, `skills`, or `openclaw`
- package or extension version
- command or tool name from a controlled list
- success or failure outcome
- coarse error category
- operation duration
- operating system family
- Node.js major version
- counts, such as result count, warning count, or conflict count
- booleans, such as whether a workspace is configured

## What Is Never Collected

n8n-as-code telemetry must not collect:

- API keys
- credential values or credential names
- cookies
- clipboard contents
- workflow JSON or TypeScript source
- node parameters or expressions
- pinned or static workflow data
- webhook paths
- execution payloads or execution data
- raw n8n host URLs
- local file paths
- project names
- workflow names
- user emails or names
- git remotes
- raw search queries

## Identity

The telemetry identity is a random anonymous UUID stored locally. It is not derived from your username, machine name, workspace path, n8n host, API key, or project.

The local telemetry config is stored at:

```text
~/.config/n8n-as-code/telemetry.json
```

## Backend

Events are sent through the shared n8n-as-code telemetry layer. The initial backend is PostHog, but product code calls only the internal telemetry API so the backend can be moved to self-hosted PostHog or replaced later.
