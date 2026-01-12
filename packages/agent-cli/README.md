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

### `init-ai`
Generates the AI context files in your current workspace.
```bash
n8n-agent init-ai
```
Generates:
- `AGENTS.md`: Instructions for your AI agent.
- `n8n-schema.json`: Validation schema for workflows.
- `.vscode/n8n.code-snippets`: Rich snippets for common nodes.

### `list`
Lists all available n8n nodes.
```bash
n8n-agent list
```

### `get <nodeName>`
Retrieves full details and schema for a specific node.
```bash
n8n-agent get n8n-nodes-base.httpRequest
```

### `search <query>`
Searches for nodes matching a query.
```bash
n8n-agent search "google sheets"
```

## 🧩 Integration with VS Code
This package is a core dependency of the `n8n-as-code` VS Code extension, powering its AI features and node indexing.

## 📄 License
MIT
