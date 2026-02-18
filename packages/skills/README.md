# <img src="https://raw.githubusercontent.com/EtienneLescot/n8n-as-code/main/res/logo.png" alt="n8n-as-code logo" width="32" height="32"> @n8n-as-code/skills

> **⚠️ BREAKING CHANGE (v0.16.0)**: Workflows are now generated and documented in **TypeScript format** (`.workflow.ts`) instead of JSON for better AI compatibility and readability.

Specialized tooling for AI Agents (Cursor, Cline, Copilot) to interact with n8n workflows and nodes.

## 🛠 Purpose

This package provides a dedicated CLI (`n8nac-skills`) and programmatic tools designed to:
1. **Provide Context**: Help AI agents understand n8n node structures.
2. **Search Nodes**: Find specific n8n nodes and their properties.
3. **Initialize Context**: Bootstrap developer environments with `AGENTS.md`, JSON schemas, and snippets.

## Installation

```bash
npm install @n8n-as-code/skills
```

## 📖 CLI Usage

### `search <query>` - Deep Unified Search (PRIMARY TOOL)

**Deep Full-Text Search with Smart Keyword Matching** across 600+ nodes and 1240+ documentation pages.
Optimized for natural language queries, technical terms, and capabilities (e.g., "image generation" finds Google Gemini).

KEY FEATURES:
- **Comprehensive Keyword Extraction**: Finds nodes based on operations (e.g., "generate", "transcribe") and resources (e.g., "image", "video").
- **Smart Prioritization**: Matches on keywords first, then titles, then content.
- **Fuzzy Matching**: Handles typos and partial terms ("googl shets").

```bash
# Search nodes, docs, and tutorials
n8nac-skills search "how to generate images"
n8nac-skills search "google sheets"

# Filter by type
n8nac-skills search "authentication" --type documentation
n8nac-skills search "database" --type node

# Filter by category
n8nac-skills search "ai" --category advanced-ai
```

### `get <nodeName>` - 📚 Complete Node Info
Get full node information: schema + documentation + examples.

```bash
n8nac-skills get googleSheets
n8nac-skills get httpRequest
```

**Includes hints for next steps!**

### `schema <nodeName>` - ⚡ Quick Parameter Reference
Fast access to technical schema (parameters only).

```bash
n8nac-skills schema googleSheets
# Returns only properties and required fields
```

### `docs <title>` - 📖 Read Documentation
Read full documentation pages. Use `search` first to find relevant titles.

```bash
# Read a specific page
n8nac-skills docs "Google Gemini"
n8nac-skills docs "Expressions"

# List categories or stats
n8nac-skills docs --list
```

### `guides [query]` - 🎯 Find Guides
Find workflow guides, tutorials, and walkthroughs.

```bash
n8nac-skills guides "email automation"
n8nac-skills guides "ai workflow"
n8nac-skills guides --list
```

### `workflows` - 🌐 Search & Download Community Workflows
Search and download workflows from the **n8nworkflows.xyz** community repository (7000+ workflows).

#### `workflows search <query>`
Search workflows using FlexSearch for high-relevance results.

```bash
n8nac-skills workflows search "slack notification"
n8nac-skills workflows search "AI chatbot telegram"
n8nac-skills workflows search "invoice processing" --limit 20
n8nac-skills workflows search "google sheets" --json
```

#### `workflows info <id>`
Display detailed information about a specific workflow.

```bash
n8nac-skills workflows info 916
# Shows: name, author, tags, download URL
```

#### `workflows install <id>`
Download a workflow JSON file.

```bash
n8nac-skills workflows install 916
n8nac-skills workflows install 4365 --output my-chatbot.json
n8nac-skills workflows install 8088 --force  # Overwrite existing
```

#### `workflows list`
List available workflows (newest first).

```bash
n8nac-skills workflows list
n8nac-skills workflows list --limit 50
```

**Features:**
- 🔍 **7000+ workflows** indexed from n8nworkflows.xyz
- ⚡ **Offline search** - FlexSearch powered, < 5ms latency
- 📦 **Lightweight** - ~6MB index (~500KB compressed)
- 🎯 **High relevance** - Smart keyword matching and ranking

### `related <query>` - 🔗 Discover Resources
Find related nodes and documentation.

```bash
n8nac-skills related googleSheets
# Returns: Google Drive, Excel, Airtable, related docs

n8nac-skills related "ai agents"
# Returns: AI-related concepts, nodes, examples
```

### `list` - 📋 List Resources
List available nodes and documentation categories.

```bash
# Summary of nodes and docs
n8nac-skills list

# List all node names
n8nac-skills list --nodes

# List all doc categories
n8nac-skills list --docs
```

### `validate <file>` - ✅ Validate Workflows
Validate workflow JSON files.

```bash
n8nac-skills validate workflow.json
n8nac-skills validate workflow.json --strict
```

### `update-ai` - 🤖 Update AI Context
Update AI Context (AGENTS.md, rule files, snippets).

```bash
n8nac-skills update-ai
n8nac-skills update-ai --version 1.70.0
```

## 📁 Data Source

The Skills CLI uses a pre-generated index of n8n nodes from the official n8n source code. The data is stored in `dist/assets/` (generated during build):

- `n8n-knowledge-index.json`: Unified FlexSearch index for the `search` command.
- `n8n-nodes-technical.json`: Detailed technical schemas for the `get` command.
- `n8n-docs-complete.json`: Full documentation content.

## 🧩 Integration

### With @n8n-as-code/cli
The main CLI package (`@n8n-as-code/cli`) uses this package internally for its `init-ai` / `update-ai` commands to generate AI context files.

### With VS Code Extension
This package is a sync dependency of the `n8n-as-code` VS Code extension, powering its AI features and node indexing.

## 📄 License
MIT
