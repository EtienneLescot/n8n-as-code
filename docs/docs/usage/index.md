---
sidebar_position: 1
title: Usage
description: Guides for using n8n-as-code with VS Code, Claude, OpenClaw, and the CLI.
---

# Usage

n8n-as-code gives you several ways to work with your n8n workflows locally. Pick the one that fits your workflow best.

## VS Code Extension

The most complete experience. Install the extension in VS Code or Cursor, connect to your n8n instance, and manage everything from the sidebar.

- Tree view with sync status for every workflow
- Right-click to pull, push, or resolve conflicts
- Split view: code editor + n8n canvas side by side
- JSON validation and code snippets

[**VS Code Extension Guide →**](/docs/usage/vscode-extension)

## Claude Plugin

Let Claude create, edit, and fix workflows for you. Install the plugin in Claude Code or set up the MCP server for Claude Desktop — then just describe what you want.

- Natural language workflow creation and editing
- Automatic node lookup from 500+ schemas
- Handles init, pull, push behind the scenes

[**Claude Plugin Guide →**](/docs/usage/claude-plugin)

## OpenClaw Plugin

Same AI-powered workflow experience inside OpenClaw. Install the plugin, run the setup wizard, and ask for workflow changes in plain language.

[**OpenClaw Plugin Guide →**](/docs/usage/openclaw)

## CLI

The command-line interface for terminal users, scripts, and CI/CD pipelines. All sync operations available as explicit commands.

- explicit Git-like sync between local files and n8n
- runtime provisioning for missing credentials
- workflow activation and HTTP test planning
- webhook, chat, and form execution from the CLI
- direct execution inspection for post-run debugging
- Workflow format conversion (JSON ↔ TypeScript)
- AI context generation for local agents

[**CLI Guide →**](/docs/usage/cli)

## TypeScript Workflows

An optional decorator-based format that makes workflows more readable and AI-friendly. Works alongside the standard JSON format — convert back and forth at any time.

[**TypeScript Workflows Guide →**](/docs/usage/typescript-workflows)

## Typical Tasks

| Need | Best entry point |
|---|---|
| Browse, pull, push, and resolve workflow changes visually | [VS Code Extension](/docs/usage/vscode-extension) |
| Ask an agent to build or fix workflows in natural language | [Claude Plugin](/docs/usage/claude-plugin) or [OpenClaw Plugin](/docs/usage/openclaw) |
| Let an agent provision credentials, activate a workflow, run it, and inspect failures | [OpenClaw Plugin](/docs/usage/openclaw), [Claude Plugin](/docs/usage/claude-plugin), and the generated `AGENTS.md` |
| Script sync, testing, or CI/CD flows directly | [CLI Guide](/docs/usage/cli) |
| Work in a more AI-friendly source format | [TypeScript Workflows](/docs/usage/typescript-workflows) |
