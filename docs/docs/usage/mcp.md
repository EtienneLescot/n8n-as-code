---
sidebar_position: 5
title: MCP Server
description: Use the n8n-as-code MCP Server to give any MCP-compatible AI client access to n8n node knowledge, workflow search, and validation.
---

The `@n8n-as-code/mcp` package is a dedicated [Model Context Protocol](https://modelcontextprotocol.io) server that exposes n8n-as-code tools to any MCP-compatible AI client — Claude Desktop, Cursor, VS Code Copilot, Windsurf, and others.

It gives AI assistants offline access to the full n8n node catalogue, community workflow examples, and workflow validation without requiring a live n8n instance.

## What the MCP server provides

| Tool | Description |
| --- | --- |
| `search_n8n_knowledge` | Search the bundled n8n node catalogue and documentation |
| `get_n8n_node_info` | Get the full schema and metadata for a specific node |
| `search_n8n_workflow_examples` | Search 7 000+ community workflow examples |
| `get_n8n_workflow_example` | Get metadata and download URL for a specific example |
| `validate_n8n_workflow` | Validate a workflow against the bundled JSON schema |
| `search_n8n_docs` | Search bundled n8n documentation pages |

All tools operate entirely on bundled, offline data — no network access to n8n is required.

## Installation

The MCP server (`@n8n-as-code/mcp`) delegates all tool calls to the `n8nac` CLI at runtime. `n8nac` is declared as a dependency and is installed automatically.

### Option 1 — npx (no persistent install)

```bash
npx -y @n8n-as-code/mcp
```

### Option 2 — Global install (recommended)

```bash
npm install -g @n8n-as-code/mcp
n8nac-mcp
```

### Option 3 — Docker

The Docker images bundle both `n8nac` and `@n8n-as-code/mcp` — no separate installation needed. See the **[Docker guide](#docker)** below.

## Transport modes

The server supports three transport protocols:

| Mode | Flag | Use case |
| --- | --- | --- |
| `stdio` | _(default)_ | Local clients (Claude Desktop, Cursor, VS Code) that launch the process directly |
| `http` | `--http` | Persistent container or remote server, accessed via Streamable HTTP |
| `sse` | `--sse` | Legacy clients that require SSE — prefer `http` for new setups |

:::warning SSE is deprecated
The SSE transport is [officially deprecated in the MCP specification](https://modelcontextprotocol.io/docs/concepts/transports#server-sent-events-sse-deprecated). **Always prefer HTTP** for new setups. SSE is supported only for backwards compatibility with older clients.
:::

### Starting with HTTP transport

```bash
n8nac-mcp --http --host 0.0.0.0 --port 3000
```

The server then listens at `http://localhost:3000/mcp`.

## Client configuration

### Claude Desktop

**stdio** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "n8n-as-code": {
      "command": "npx",
      "args": ["-y", "@n8n-as-code/mcp"]
    }
  }
}
```

**HTTP** — start the server first (`n8nac-mcp --http`), then add:

```json
{
  "mcpServers": {
    "n8n-as-code": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

---

### Cursor

**stdio** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "n8n-as-code": {
      "command": "npx",
      "args": ["-y", "@n8n-as-code/mcp"]
    }
  }
}
```

**HTTP** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "n8n-as-code": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

---

### VS Code (GitHub Copilot)

**stdio** (`.vscode/mcp.json`):

```json
{
  "servers": {
    "n8n-as-code": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@n8n-as-code/mcp"]
    }
  }
}
```

**HTTP** (`.vscode/mcp.json`):

```json
{
  "servers": {
    "n8n-as-code": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

---

### Windsurf

**stdio** (`~/.codeium/windsurf/mcp_config.json`):

```json
{
  "mcpServers": {
    "n8n-as-code": {
      "command": "npx",
      "args": ["-y", "@n8n-as-code/mcp"]
    }
  }
}
```

**HTTP** (`~/.codeium/windsurf/mcp_config.json`):

```json
{
  "mcpServers": {
    "n8n-as-code": {
      "serverUrl": "http://localhost:3000/mcp"
    }
  }
}
```

## Docker

Pre-built images are published to the GitHub Container Registry for every release, in both Node.js and Bun variants:

```text
ghcr.io/etiennelescot/n8nac-mcp:latest       # Node.js LTS Alpine
ghcr.io/etiennelescot/n8nac-mcp:latest-bun   # Bun Alpine
```

### Quick start

```bash
# stdio (for use with docker run via client config)
docker run -i \
  -v /path/to/your/workflows:/data \
  ghcr.io/etiennelescot/n8nac-mcp:latest

# HTTP transport
docker run -p 3000:3000 \
  -v /path/to/your/workflows:/data \
  -e MCP_TRANSPORT=http \
  ghcr.io/etiennelescot/n8nac-mcp:latest
```

### Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `N8N_AS_CODE_PROJECT_DIR` | `/data` | Working directory for n8n workflow files |
| `MCP_TRANSPORT` | `stdio` | Transport: `stdio`, `http`, or `sse` |
| `MCP_HOST` | `0.0.0.0` | Bind host for `http`/`sse` transport |
| `MCP_PORT` | `3000` | Bind port for `http`/`sse` transport |

For the full Docker reference including all image tags, Docker Compose examples, and local build instructions, see the **[Docker README](https://github.com/EtienneLescot/n8n-as-code/blob/main/packages/mcp/docker/README.md)**.

## How it works

The MCP server is a thin protocol layer. Every tool call is delegated to the `n8nac` CLI, which ships with a bundled knowledge index:

```text
MCP Client → @n8n-as-code/mcp → n8nac CLI → bundled knowledge index
```

No live n8n instance, no network calls — everything runs locally from the installed packages.
