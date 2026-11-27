---
sidebar_position: 7
title: Codex Plugin Privacy Policy
description: Privacy policy for the n8n-as-code plugin for Codex and ChatGPT.
---

# Codex Plugin Privacy Policy

This page describes how the `n8n-as-code` plugin for Codex and ChatGPT handles data.

## Scope

This policy applies to the `n8n-as-code` plugin published in the OpenAI plugin directory from the following repository:

```text
https://github.com/EtienneLescot/n8n-as-code
```

It covers the plugin package, its bundled skill file, and the `n8nac` CLI that the skill runs.

## Summary

- The plugin contains a skill only. It has no hosted backend and no MCP server operated by the project author.
- Workflow files, prompts, and configuration stay in the user's local workspace and their own n8n instance.
- The project author does not collect workflow content, prompts, credentials, or n8n data through the plugin.

## Data the plugin may access

Depending on what the user asks, the skill may have the agent access:

- local workflow files in the current workspace
- local project configuration such as `n8nac-config.json`
- workflow definitions and metadata fetched from the user's own n8n instance
- the prompts and instructions the user gives to the agent

This access is needed to create, update, validate, pull, and push workflows.

## How data is used

Data is used only to perform the workflow tasks the user asks for, such as checking the workspace setup, listing, pulling, editing, validating, and pushing workflows, and searching the bundled n8n node knowledge base.

## Data sharing

The plugin does not send user data to a service operated by the project author.

Data may still be processed by services the user chooses to use, including:

- OpenAI services that run Codex or ChatGPT
- the user's own n8n instance
- the npm registry, from which `npx` downloads the `n8nac` CLI
- repositories or external APIs the user connects in their workflows

Those services are governed by their own terms and privacy policies.

## Telemetry

The `n8nac` CLI sends anonymous product usage telemetry that contains no workflow content, prompts, or credentials. It can be turned off with `n8nac telemetry disable` or the `N8NAC_TELEMETRY=0` environment variable. Details are on the [Telemetry](./telemetry.md) page.

## Credentials and secrets

Users configure their own n8n API keys in their local workspace. The plugin never asks users to send credentials to the project author.

## Retention

The project author does not store plugin data. Retention of files, prompts, logs, or workflow data depends on the user's machine and repository, their n8n instance, and the third-party services they use.

## Open source

The plugin and the `n8nac` CLI are open-source software under the MIT license.

## Contact

For privacy questions about this plugin, open an issue at https://github.com/EtienneLescot/n8n-as-code/issues or email:

```text
etienne@etiennelescot.fr
```

## Updates

This policy may change as the plugin evolves. The latest version is the one published on this documentation site.
