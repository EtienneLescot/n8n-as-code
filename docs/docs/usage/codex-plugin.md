---
sidebar_position: 3
title: Codex / ChatGPT Plugin
description: Use Codex to create, edit, and fix n8n workflows through the n8n-as-code plugin.
---

# Codex / ChatGPT Plugin

The n8n-as-code plugin for the OpenAI plugin directory (Codex and ChatGPT) ships the same `n8n-architect` skill as the [Claude plugin](./claude-plugin.md). The skill drives the `n8nac` CLI to create, edit, validate, pull, and push n8n workflows as TypeScript files in your repository.

The plugin contains skills only. It does not bundle or register an MCP server.

## Requirements

- An environment with a local shell, such as Codex. The skill runs `npx --yes n8nac ...` commands in the workspace.
- Node.js 20 or newer.
- An n8n instance you can reach, and an API key for it.

## Install

Install **n8n-as-code** from the plugin directory in Codex or ChatGPT.

To install it manually from this repository, use the plugin folder:

```text
https://github.com/EtienneLescot/n8n-as-code/tree/main/plugins/codex/n8n-as-code
```

## Initialize a workspace

Ask Codex to set up n8n-as-code in the repository. The skill guides it through:

- creating or selecting an n8n environment
- storing the n8n API key locally in the workspace
- generating `AGENTS.md`
- materializing `.agents/skills/n8n-architect`

Manual equivalent:

```bash
npx --yes n8nac env add Dev --base-url <url> --workflows-path workflows/dev
npx --yes n8nac env auth set Dev --api-key-stdin
npx --yes n8nac env use Dev
npx --yes n8nac update-ai
```

## Example prompts

- "Set up n8n-as-code in this repository and connect it to my n8n instance."
- "Create an n8n workflow that posts new GitHub issues to a Slack channel."
- "Pull my n8n workflows and fix the validation errors in the failing one."

## Privacy

See the [Codex plugin privacy policy](./codex-plugin-privacy.md).

## Source

The plugin package lives in [`plugins/codex/n8n-as-code`](https://github.com/EtienneLescot/n8n-as-code/tree/main/plugins/codex/n8n-as-code). Its skill file is generated from the same source as the other plugins.
