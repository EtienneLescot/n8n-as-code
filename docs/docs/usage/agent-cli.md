---
sidebar_position: 3
title: Agent CLI (Tools for AI agents)
description: Use the Agent CLI to search n8n nodes, get JSON schemas, and list available nodes for AI coding assistants.
---

# Agent CLI (Tools for AI agents)

The Agent CLI (`@n8n-as-code/agent-cli`) provides command-line tools specifically designed for AI coding assistants and developers working with n8n workflows. It allows you to search, retrieve, and list n8n node schemas programmatically.

## 🎯 Purpose

The Agent CLI is designed to:
- **Provide structured data** about n8n nodes for AI coding assistants
- **Enable search capabilities** for finding specific nodes by name or description
- **Generate JSON schemas** that can be used for code completion and validation
- **Support AI context generation** for better workflow suggestions

## 📦 Installation

The Agent CLI is available as an npm package and can be run directly with npx:

```bash
# Run with n8n-agent (if installed globally)
n8n-agent <command>

# Or run directly with npx
npx @n8n-as-code/agent-cli <command>

# Or install globally
npm install -g @n8n-as-code/agent-cli
```

## 🛠️ Available Commands

### 1. Search Nodes

**Deep Full-Text Search with Smart Keyword Matching** across 600+ nodes and 1240+ documentation pages.
Optimized for natural language queries, technical terms, and capabilities (e.g., "image generation" finds Google Gemini).

KEY FEATURES:
- **Comprehensive Keyword Extraction**: Finds nodes based on operations (e.g., "generate", "transcribe") and resources (e.g., "image", "video").
- **Smart Prioritization**: Matches on keywords first, then titles, then content.
- **Fuzzy Matching**: Handles typos and partial terms ("googl shets").

```bash
npx @n8n-as-code/agent-cli search "<query>"
```

**Examples:**
```bash
# Search for Google Sheets nodes
npx @n8n-as-code/agent-cli search "google sheets"

# Search for HTTP-related nodes
npx @n8n-as-code/agent-cli search "http"

# Search for database nodes
npx @n8n-as-code/agent-cli search "database"
```

**Output:** Returns a JSON array of matching nodes with their metadata.

### 2. Get Node Schema

Retrieve the complete JSON schema for a specific n8n node.

```bash
npx @n8n-as-code/agent-cli get <node-name>
```

**Examples:**
```bash
# Get schema for HTTP Request node
npx @n8n-as-code/agent-cli get httpRequest

# Get schema for Google Sheets node
npx @n8n-as-code/agent-cli get googleSheets

# Get schema for Code node
npx @n8n-as-code/agent-cli get code
```

**Output:** Returns the complete JSON schema for the specified node, including properties, parameters, and type definitions.

### 3. List All Nodes

List all available n8n nodes in a compact format.

```bash
npx @n8n-as-code/agent-cli list
```

**Output:** Returns a JSON array of all nodes with basic metadata (name, displayName, description).

## 📊 Output Format

All commands output JSON for easy parsing by scripts and AI tools:

### Search Output Example
```json
[
  {
    "name": "httpRequest",
    "displayName": "HTTP Request",
    "description": "Makes an HTTP request to a specified URL",
    "category": "Core"
  },
  {
    "name": "httpBin",
    "displayName": "HTTP Bin",
    "description": "Test HTTP requests",
    "category": "Core"
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

The Agent CLI is designed to be used by AI coding assistants to:
1. **Understand n8n node structure** - Get detailed schemas for accurate code generation
2. **Provide context-aware suggestions** - Search for relevant nodes based on user intent
3. **Validate workflow JSON** - Use schemas to validate generated workflow structures

### Example AI Integration Workflow

```bash
# AI Assistant workflow for generating n8n workflow code
1. User asks: "Create a workflow that reads from Google Sheets"
2. AI runs: npx @n8n-as-code/agent-cli search "google sheets"
3. AI gets node schemas: npx @n8n-as-code/agent-cli get googleSheets
4. AI generates accurate JSON with proper parameters
```

## 📁 Data Source

The Agent CLI uses a pre-generated index of n8n nodes from the official n8n source code. The data is stored in `dist/assets/` (generated during build):

- `n8n-knowledge-index.json`: Unified FlexSearch index for the `search` command.
- `n8n-nodes-technical.json`: Detailed technical schemas for the `get` command.
- `n8n-docs-complete.json`: Full documentation content.

This includes:
- All core n8n nodes
- Community nodes (when available)
- Node properties and parameters
- Type definitions and validation rules

## 🔄 Related Tools

### AI Context Generation
The main CLI (`@n8n-as-code/cli`) includes an `init-ai` command that generates comprehensive context files for AI assistants:

```bash
n8n-as-code init-ai
```

This command creates:
- `.vscode/n8n.code-snippets` - Code snippets generated from n8n-nodes-index.json
- `n8n-nodes-index.json` - Index of all available nodes
- Documentation files for AI context

### VS Code Extension
For visual editing and real-time sync, use the [VS Code Extension](/docs/usage/vscode-extension).

### Main CLI
For workflow management and automation, use the [Main CLI](/docs/usage/cli).

## 🚀 Quick Start

1. **Search for nodes you need:**
   ```bash
   npx @n8n-as-code/agent-cli search "your query"
   ```

2. **Get detailed schema for a specific node:**
   ```bash
   npx @n8n-as-code/agent-cli get nodeName
   ```

3. **List all available nodes:**
   ```bash
   npx @n8n-as-code/agent-cli list
   ```

## 📖 Next Steps

- Learn about the [Main CLI](/docs/usage/cli) for workflow management
- Explore the [VS Code Extension](/docs/usage/vscode-extension) for visual editing
- Check the [Contribution Guide](/docs/contribution) for development details
- Review the [API Reference](/api/index.html) for programmatic usage

## 🆘 Troubleshooting

**Command not found:**
```bash
# Make sure you're using the correct package name
npx @n8n-as-code/agent-cli --help
```

**Node not found:**
```bash
# Check available nodes first
npx @n8n-as-code/agent-cli list | grep "your-node"
```

**JSON parsing issues:**
```bash
# Pipe output to jq for pretty printing
npx @n8n-as-code/agent-cli search "http" | jq .
```

For more help, check the [Troubleshooting guide](/docs/troubleshooting) or [open an issue](https://github.com/EtienneLescot/n8n-as-code/issues).