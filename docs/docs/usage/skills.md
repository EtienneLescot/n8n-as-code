---
sidebar_position: 99
title: Skills CLI Reference
description: Reference for the n8nac skills subcommands used by AI agents behind the scenes.
unlisted: true
---

# Skills CLI Reference

:::tip
This page documents the low-level `n8nac skills` commands that AI agents use behind the scenes. In normal usage, install the n8n-as-code skills for your agent, then ask the agent to initialize the workspace and perform n8n work for you.

If you're a contributor or power user, the full reference is in [Contribution → Skills & AI Tools](/docs/contribution/skills).
:::

## 🎯 Purpose

The Skills CLI is designed to:
- **Provide structured data** about n8n nodes for AI coding assistants
- **Enable search capabilities** for finding specific nodes by name or description
- **Generate JSON schemas** that can be used for code completion and validation
- **Support AI context generation** for better workflow suggestions
- **Access community workflows** - Search and download from 7000+ real-world workflows

## 📦 Install Source

Install the portable skills from the repository skills directory when you use a generic coding agent such as OpenCode, Codex, Hermes, or another skill-capable agent:

```text
https://github.com/EtienneLescot/n8n-as-code/tree/main/skills
```

If your agent asks for an explicit skill path, use `skills/n8n-architect`.

The same skill content is also packaged on npm as [`@n8n-as-code/skills`](https://www.npmjs.com/package/@n8n-as-code/skills) for `n8nac` and runtime usage.

After the skills are available, the agent can initialize the workspace itself: create or select an `n8nac env` environment, generate `AGENTS.md`, materialize local `.agents/skills`, and call `n8nac skills` commands as needed.

For debugging or advanced manual usage, the same tools are available through `n8nac skills`:

```bash
# Run with n8nac skills (if installed globally)
n8nac skills <command>

# Or run directly with npx
npx n8nac skills <command>

# Or install globally
npm install -g n8nac
```

You usually do not need to run these commands yourself; agents and facades invoke them as part of their workflow.

## 🛠️ Available Commands

### `search <query>` - 🚀 Deep Unified Search (PRIMARY TOOL)

```bash
# Search nodes, docs, and tutorials
n8nac skills search "how to generate images"
n8nac skills search "google sheets"

# Filter by type
n8nac skills search "authentication" --type documentation
n8nac skills search "database" --type node

# Filter by category
n8nac skills search "ai" --category advanced-ai
```

### `node-info <nodeName>` - 📚 Complete Node Info
Get full node information: schema + documentation + examples.

```bash
n8nac skills node-info googleSheets
n8nac skills node-info httpRequest
```

### `node-schema <nodeName>` - ⚡ Quick Parameter Reference

```bash
n8nac skills node-schema googleSheets
# Returns only properties and required fields
```

### `docs <title>` - 📖 Read Documentation

```bash
# Read a specific page
n8nac skills docs "Google Gemini"
n8nac skills docs "Expressions"

# List categories or stats
n8nac skills docs --list
```

### `guides [query]` - 🎯 Find Guides

```bash
n8nac skills guides "email automation"
n8nac skills guides "ai workflow"
n8nac skills guides --list
```

### `examples` - 🌐 Search & Download Community Workflows

```bash
n8nac skills examples search "slack notification"
n8nac skills examples search "AI chatbot telegram"
n8nac skills examples search "invoice processing" --limit 20
n8nac skills examples search "google sheets" --json

n8nac skills examples info 916
n8nac skills examples download 916
n8nac skills examples download 4365 --output my-chatbot.workflow.ts
n8nac skills examples download 8088 --force

n8nac skills examples list
n8nac skills examples list --limit 50
```

### `related <query>` - 🔗 Discover Resources

```bash
n8nac skills related googleSheets
# Returns: Google Drive, Excel, Airtable, related docs

n8nac skills related "ai agents"
# Returns: AI-related concepts, nodes, examples
```

### `list` - 📋 List Resources

```bash
# Summary of nodes and docs
n8nac skills list

# List all node names
n8nac skills list --nodes

# List all doc categories
n8nac skills list --docs
```

### `validate <file>` - ✅ Validate Workflows

```bash
n8nac skills validate workflow.json
n8nac skills validate workflow.json --strict
```

### `update-ai` - 🤖 Refresh AI Context
Advanced context refresh command used by agents and facades when they initialize or refresh a workspace.

```bash
n8nac skills update-ai
n8nac skills update-ai --n8n-version 1.70.0
n8nac skills update-ai --n8n-version 1.70.0 --cli-version 1.2.3
```
## 📊 Output Format

All commands output JSON for easy parsing by scripts and AI tools:

### Search Output Example
```json
[
  {
    "name": "httpRequest",
    "displayName": "HTTP Request",
    "description": "Makes an HTTP request to a specified URL",
    "category": "Sync"
  },
  {
    "name": "httpBin",
    "displayName": "HTTP Bin",
    "description": "Test HTTP requests",
    "category": "Sync"
  }
]
```

### Get Schema Output Example
```json
{
  "name": "httpRequest",
  "displayName": "HTTP Request",
  "description": "Makes an HTTP request to a specified URL",
  "properties": [
    {
      "name": "url",
      "type": "string",
      "required": true,
      "description": "The URL to make the request to"
    },
    {
      "name": "method",
      "type": "string",
      "required": true,
      "default": "GET",
      "description": "HTTP method to use"
    }
  ]
}
```

## 🔧 Integration with AI Assistants

The Skills CLI is designed to be used by AI coding assistants to:
1. **Understand n8n node structure** - Get detailed schemas for accurate code generation
2. **Provide context-aware suggestions** - Search for relevant nodes based on user intent
3. **Validate workflow JSON** - Use schemas to validate generated workflow structures

### Example AI Integration Workflow

```bash
# AI Assistant workflow for generating n8n workflow code
1. User asks: "Create a workflow that reads from Google Sheets"
2. AI reads AGENTS.md and the local .agents/skills files if present
3. AI runs: npx --yes n8nac env status --json
4. AI runs: npx --yes n8nac skills search "google sheets"
5. AI gets node schemas: npx --yes n8nac skills node-info googleSheets
6. AI generates accurate TypeScript workflow code with proper parameters
```

## 📁 Data Source

The Skills CLI uses a pre-generated index of n8n nodes from the official n8n source code. The data is stored in `dist/assets/` (generated during build):

- `n8n-knowledge-index.json`: Unified FlexSearch index for the `search` command.
- `n8n-nodes-technical.json`: Detailed technical schemas for the `node-info` command.
- `n8n-docs-complete.json`: Full documentation content.

This includes:
- All sync n8n nodes
- Community nodes (when available)
- Node properties and parameters
- Type definitions and validation rules

## 🔄 Related Tools

### AI Context Generation
Agent and facade setup can generate workspace context files for AI assistants. In normal usage, you install the skills or a facade and let the agent initialize or refresh the workspace.

For advanced manual debugging, the equivalent CLI command is:

```bash
n8nac update-ai
```

The generated context can include:
- `.vscode/n8n.code-snippets` - Code snippets generated from n8n-nodes-index.json
- `n8n-nodes-index.json` - Index of all available nodes
- Documentation files for AI context

### VS Code Extension
For visual editing with git-like sync controls, use the [VS Code Extension](/docs/usage/vscode-extension).

### Main CLI
For workflow management and automation, use the [Main CLI](/docs/usage/cli).

## 🚀 Quick Start

1. **Search for nodes you need:**
   ```bash
   npx n8nac skills search "your query"
   ```

2. **Get detailed schema for a specific node:**
   ```bash
   npx n8nac skills node-info nodeName
   ```

3. **List all available nodes:**
   ```bash
   npx n8nac skills list
   ```

## 📖 Next Steps

- Learn about the [Main CLI](/docs/usage/cli) for workflow management
- Explore the [VS Code Extension](/docs/usage/vscode-extension) for visual editing
- Check the [Contribution Guide](/docs/contribution) for development details

## 🆘 Troubleshooting

**Command not found:**
```bash
# Make sure you're using the correct package name
npx n8nac skills --help
```

**Node not found:**
```bash
# Check available nodes first
npx n8nac skills list | grep "your-node"
```

**JSON parsing issues:**
```bash
# Pipe output to jq for pretty printing
npx n8nac skills search "http" | jq .
```

For more help, check the [Troubleshooting guide](/docs/troubleshooting) or [open an issue](https://github.com/EtienneLescot/n8n-as-code/issues).
