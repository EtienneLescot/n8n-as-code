---
sidebar_position: 5
title: MCP Server
description: Use the n8n-as-code MCP Server to give any MCP-compatible AI client access to n8n node knowledge, workflow search, and validation.
---

The `@n8n-as-code/mcp` package is a dedicated [Model Context Protocol](https://modelcontextprotocol.io) server that exposes n8n-as-code tools to any MCP-compatible AI client — Claude Desktop, Cursor, VS Code Copilot, Windsurf, and others.

It gives AI assistants offline access to the full n8n node catalogue, community workflow examples, and workflow validation without requiring a live n8n instance.

Live workspace context uses the normal environments model: `n8nac-config.json` stores workspace environments, remote API keys stay local, and `n8n-manager` owns only local managed instances and tunnels. Initialize the workspace with `n8nac env` when you want an MCP-backed assistant to reason from the same local context as the CLI or editor.

See the [CLI guide](/docs/usage/cli) and [n8n-manager guide](/docs/usage/n8n-manager) for setup details.

## What the MCP server provides

| Tool | Description |
| --- | --- |
| `search_n8n_knowledge` | Search the bundled n8n node catalogue and documentation |
| `get_n8n_node_info` | Get the full schema and metadata for a specific node |
| `search_n8n_workflow_examples` | Search 7 000+ community workflow examples |
| `get_n8n_workflow_example` | Get metadata and download URL for a specific example |
| `validate_n8n_workflow` | Validate a workflow against the bundled JSON schema |
| `search_n8n_docs` | Search bundled n8n documentation pages |
| `get_n8n_native_mcp_status` | Inspect optional native n8n MCP assist configuration and discovered tools |

The core tools operate entirely on bundled, offline data — no network access to n8n is required. Native n8n MCP assist is disabled by default and only makes network calls when explicitly enabled.

## Optional native n8n MCP assist

n8n 2.x includes an instance-level MCP server that can expose live workflow, node, execution, credential, project, folder, and workflow-builder capabilities. `@n8n-as-code/mcp` can optionally connect to that native server as a read-only assist layer.

This integration is designed to complement the local n8n-as-code workflow, not replace it:

- Use bundled `n8n-as-code` knowledge and `n8nac` commands as the default source of truth.
- Use native MCP assist for live discovery, server-side validation, credential metadata, execution inspection, and node definitions from the connected instance.
- Keep `.workflow.ts` files and Git as the durable source of truth.
- Do not store native MCP bearer tokens in project files.
- Do not use native MCP create, update, publish, archive, or destructive data-table operations as an automatic path. This package currently exposes only read-only native wrappers.

### Enable assist mode

Set the native MCP endpoint and auth in the environment that launches the MCP server:

```bash
export N8NAC_NATIVE_MCP_ENABLED=1
export N8NAC_NATIVE_MCP_MODE=assist
export N8N_NATIVE_MCP_URL="https://your-n8n.example.com/mcp-server/http"
export N8N_NATIVE_MCP_TOKEN="your-personal-native-mcp-token"
n8nac-mcp
```

OAuth2 is preferred when your MCP client connects directly to n8n's native server. For the `n8n-as-code` broker assist mode, use environment variables or a local secret mechanism outside the repository.

### Native assist tools

When `N8NAC_NATIVE_MCP_ENABLED=1` and `N8N_NATIVE_MCP_URL` is configured, the MCP server also exposes these read-only wrappers. Use `n8nac native-mcp status --include-tools --json` to confirm which underlying native tools your n8n version supports:

| Tool | Native n8n tool | Purpose |
| --- | --- | --- |
| `search_n8n_live_workflows` | `search_workflows` | Search live workflow previews |
| `get_n8n_live_workflow_details` | `get_workflow_details` | Inspect sanitized live workflow details |
| `search_n8n_live_projects` | `search_projects` | Discover n8n projects |
| `search_n8n_live_folders` | `search_folders` | Discover folders in a project |
| `list_n8n_live_credentials` | `list_credentials` | List credential metadata without secrets |
| `search_n8n_live_executions` | `search_executions` | Search execution metadata |
| `get_n8n_live_execution` | `get_execution` | Inspect an execution, optionally with data |
| `get_n8n_native_sdk_reference` | `get_sdk_reference` | Read native workflow-builder SDK guidance |
| `search_n8n_native_nodes` | `search_nodes` | Search live node definitions |
| `get_n8n_native_node_types` | `get_node_types` | Fetch native TypeScript node definitions |
| `validate_n8n_native_workflow_code` | `validate_workflow` | Validate native workflow-builder code without creating workflows |

### Diagnostics

Use the CLI diagnostics before relying on native assist:

```bash
n8nac native-mcp status --include-tools --json
n8nac native-mcp tools
n8nac native-mcp doctor --json
```

`doctor` exits non-zero when assist is disabled, misconfigured, unreachable, or unable to list native tools.

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
| `N8NAC_NATIVE_MCP_ENABLED` | `0` | Enable optional native n8n MCP assist tools |
| `N8NAC_NATIVE_MCP_MODE` | `assist` | Native MCP mode. Only read-only assist wrappers are currently exposed |
| `N8N_NATIVE_MCP_URL` | _(unset)_ | Native n8n MCP endpoint, for example `https://host/mcp-server/http` |
| `N8N_NATIVE_MCP_TOKEN` | _(unset)_ | Native n8n MCP bearer token. Keep this outside project files |

For the full Docker reference including all image tags, Docker Compose examples, and local build instructions, see the **[Docker README](https://github.com/EtienneLescot/n8n-as-code/blob/main/packages/mcp/docker/README.md)**.

## How it works

The MCP server is a thin protocol layer. Offline knowledge and validation calls are delegated to the `n8nac` CLI, which ships with a bundled knowledge index:

```text
MCP Client → @n8n-as-code/mcp → n8nac CLI → bundled knowledge index
```

By default there is no live n8n instance and no network call. When native MCP assist is explicitly enabled, read-only live wrappers use this additional path:

```text
MCP Client → @n8n-as-code/mcp → native n8n MCP server → live n8n instance
```

Native assist is optional and does not change the recommended Git/TypeScript workflow source of truth.
