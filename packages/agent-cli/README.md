# @n8n-as-code/agent-cli

Specialized tooling for AI Agents (Cursor, Cline, Copilot) to interact with n8n workflows and nodes.

## 🛠 Purpose

This package provides a dedicated CLI (`n8n-agent`) and programmatic tools designed to:
1. **Provide Context**: Help AI agents understand n8n node structures.
2. **Search Nodes**: Find specific n8n nodes and their properties.
3. **Initialize Context**: Bootstrap developer environments with `AGENTS.md`, JSON schemas, and snippets.

## 🚀 Installation

```bash
npm install @n8n-as-code/agent-cli
```

## 📖 CLI Usage

### `search <query>` - 🔍 Unified Search
Search across nodes AND documentation with intelligent hints.

```bash
# Search everything
n8n-agent search "google sheets"

# Filter by type
n8n-agent search "authentication" --type documentation
n8n-agent search "database" --type node

# Filter by category
n8n-agent search "ai" --category advanced-ai
```

### `get <nodeName>` - 📚 Complete Node Info
Get full node information: schema + documentation + examples.

```bash
n8n-agent get googleSheets
n8n-agent get httpRequest
```

**Includes hints for next steps!**

### `schema <nodeName>` - ⚡ Quick Parameter Reference
Fast access to technical schema (parameters only).

```bash
n8n-agent schema googleSheets
# Returns only properties and required fields
```

### `docs` - 📖 Access Documentation
Access n8n's complete documentation (1246+ pages).

```bash
# Search documentation
n8n-agent docs --search "ai agents"

# Read a specific page
n8n-agent docs "What is an agent?"

# List all categories
n8n-agent docs --list

# Filter by category
n8n-agent docs --search "memory" --category advanced-ai
```

### `examples [query]` - 🎯 Find Examples
Find workflow examples and tutorials.

```bash
n8n-agent examples "email automation"
n8n-agent examples "ai workflow"
n8n-agent examples --list
```

### `related <query>` - 🔗 Discover Resources
Find related nodes and documentation.

```bash
n8n-agent related googleSheets
# Returns: Google Drive, Excel, Airtable, related docs

n8n-agent related "ai agents"
# Returns: AI-related concepts, nodes, examples
```

### `list` - 📋 List All Nodes
Lists all available n8n nodes (compact).

```bash
n8n-agent list
```

### `validate <file>` - ✅ Validate Workflows
Validate workflow JSON files.

```bash
n8n-agent validate workflow.json
n8n-agent validate workflow.json --strict
```

### `update-ai` - 🤖 Update AI Context
Update AI Context (AGENTS.md, rule files, snippets).

```bash
n8n-agent update-ai
n8n-agent update-ai --version 1.70.0
```

## 🧩 Integration

### With @n8n-as-code/cli
The main CLI package (`@n8n-as-code/cli`) uses this package internally for its `init-ai` / `update-ai` commands to generate AI context files.

### With VS Code Extension
This package is a core dependency of the `n8n-as-code` VS Code extension, powering its AI features and node indexing.

## 📄 License
MIT
