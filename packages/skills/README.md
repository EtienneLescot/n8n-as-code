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

### `search <query>` - 🚀 Deep Unified Search (PRIMARY TOOL)

**Deep Full-Text Search with Smart Keyword Matching** across 600+ nodes and 1240+ documentation pages.
Optimized for natural language queries, technical terms, and capabilities (e.g., "image generation" finds Google Gemini).

KEY FEATURES:
- **Comprehensive Keyword Extraction**: Finds nodes based on operations (e.g., "generate", "transcribe") and resources (e.g., "image", "video").
- **Smart Prioritization**: Matches on keywords first, then titles, then content.
- **Fuzzy Matching**: Handles typos and partial terms ("googl shets").

```bash
# Search nodes, docs, and tutorials
n8n-agent search "how to generate images"
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

### `docs <title>` - 📖 Read Documentation
Read full documentation pages. Use `search` first to find relevant titles.

```bash
# Read a specific page
n8n-agent docs "Google Gemini"
n8n-agent docs "Expressions"

# List categories or stats
n8n-agent docs --list
```

### `guides [query]` - 🎯 Find Guides
Find workflow guides, tutorials, and walkthroughs.

```bash
n8n-agent guides "email automation"
n8n-agent guides "ai workflow"
n8n-agent guides --list
```

### `workflows` - 🌐 Search & Download Community Workflows
Search and download workflows from the **n8nworkflows.xyz** community repository (7000+ workflows).

#### `workflows search <query>`
Search workflows using FlexSearch for high-relevance results.

```bash
n8n-agent workflows search "slack notification"
n8n-agent workflows search "AI chatbot telegram"
n8n-agent workflows search "invoice processing" --limit 20
n8n-agent workflows search "google sheets" --json
```

#### `workflows info <id>`
Display detailed information about a specific workflow.

```bash
n8n-agent workflows info 916
# Shows: name, author, tags, download URL
```

#### `workflows install <id>`
Download a workflow JSON file.

```bash
n8n-agent workflows install 916
n8n-agent workflows install 4365 --output my-chatbot.json
n8n-agent workflows install 8088 --force  # Overwrite existing
```

#### `workflows list`
List available workflows (newest first).

```bash
n8n-agent workflows list
n8n-agent workflows list --limit 50
```

**Features:**
- 🔍 **7000+ workflows** indexed from n8nworkflows.xyz
- ⚡ **Offline search** - FlexSearch powered, < 5ms latency
- 📦 **Lightweight** - ~6MB index (~500KB compressed)
- 🎯 **High relevance** - Smart keyword matching and ranking

### `related <query>` - 🔗 Discover Resources
Find related nodes and documentation.

```bash
n8n-agent related googleSheets
# Returns: Google Drive, Excel, Airtable, related docs

n8n-agent related "ai agents"
# Returns: AI-related concepts, nodes, examples
```

### `list` - 📋 List Resources
List available nodes and documentation categories.

```bash
# Summary of nodes and docs
n8n-agent list

# List all node names
n8n-agent list --nodes

# List all doc categories
n8n-agent list --docs
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

## 📁 Data Source

The Agent CLI uses a pre-generated index of n8n nodes from the official n8n source code. The data is stored in `dist/assets/` (generated during build):

- `n8n-knowledge-index.json`: Unified FlexSearch index for the `search` command.
- `n8n-nodes-technical.json`: Detailed technical schemas for the `get` command.
- `n8n-docs-complete.json`: Full documentation content.

## 🧩 Integration

### With @n8n-as-code/cli
The main CLI package (`@n8n-as-code/cli`) uses this package internally for its `init-ai` / `update-ai` commands to generate AI context files.

### With VS Code Extension
This package is a core dependency of the `n8n-as-code` VS Code extension, powering its AI features and node indexing.

## 📄 License
MIT
