---
sidebar_position: 5
title: MCP Server
description: Use the n8n-as-code MCP Server to give any MCP-compatible AI client access to n8n node knowledge, workflow search, and validation.
---

The `@n8n-as-code/mcp` package is a dedicated [Model Context Protocol](https://modelcontextprotocol.io) server that exposes n8n-as-code tools to any MCP-compatible AI client — Claude Desktop, Cursor, VS Code Copilot, Windsurf, and others.

It gives AI assistants offline access to the full n8n node catalogue, community workflow examples, and workflow validation without requiring a live n8n instance.

Live workspace context uses the normal environments model: `n8nac-config.json` stores workspace environments, remote API keys stay local, and `n8n-manager` owns only local managed instances and tunnels. Initialize the workspace with `n8nac env` when you want an MCP-backed assistant to reason from the same local context as the CLI or editor.

See the [CLI guide](/docs/usage/cli) and [n8n-manager guide](/docs/usage/n8n-manager) for setup details.

## Two MCP surfaces

There are two different MCP surfaces involved in this documentation:

| Surface | Owner | Purpose | Default role |
| --- | --- | --- | --- |
| `@n8n-as-code/mcp` | n8n-as-code | Exposes N8NAC tools, bundled knowledge, workflow examples, validation, and optional brokered native wrappers to MCP clients | The MCP server you configure in Claude Desktop, Cursor, VS Code, Windsurf, or other AI clients |
| Native n8n MCP server | n8n | Exposes live n8n instance capabilities such as workflows, executions, credentials metadata, projects, folders, native nodes, and workflow-builder tools | Optional upstream live assist endpoint used only when explicitly enabled |

For normal n8n-as-code usage, configure your AI client to connect to `@n8n-as-code/mcp`. Do not replace it with the native n8n MCP endpoint unless you intentionally want a direct, non-N8NAC workflow. In assist mode, `@n8n-as-code/mcp` remains the broker: it exposes the N8NAC tools and calls the native n8n MCP server only through approved wrapper tools.

## What the n8n-as-code MCP server provides

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

## Optional native n8n MCP assist through the broker

n8n 2.x includes an instance-level MCP server that can expose live workflow, node, execution, credential, project, folder, and workflow-builder capabilities. `@n8n-as-code/mcp` can optionally connect to that native server as a complementary assist layer while still remaining the MCP server exposed to your AI client.

This is a brokered integration: your AI client connects to the `n8n-as-code` MCP server, and the `n8n-as-code` MCP server calls the native n8n MCP server only when the optional assist mode is enabled. The current wrapper set is read-only; native runtime execution belongs in explicit test/execution flows, not automatic workflow editing.

This integration is designed to complement the local n8n-as-code workflow, not replace it:

- Use bundled `n8n-as-code` knowledge and `n8nac` commands as the default source of truth.
- Use native MCP assist for live discovery, server-side validation, credential metadata, execution inspection, native node definitions, and explicit runtime execution strategies when it complements `n8nac test`.
- Keep `.workflow.ts` files and Git as the durable source of truth.
- Do not store native MCP bearer tokens in project files.
- Do not expose native MCP assist over non-loopback HTTP/SSE transports unless the MCP transport is separately authenticated and `N8NAC_NATIVE_MCP_ALLOW_REMOTE=1` is set.
- Treat native runtime execution as a side-effecting operation, like `n8nac test`. Agents should run it only from an explicit user request or generated execution strategy.
- Do not use native MCP create, update, publish, archive, or destructive data-table operations as an automatic path. This package currently exposes only read-only native wrappers.

### Use cases

Use native MCP assist when the connected n8n instance knows something that the local repository or bundled knowledge cannot know by itself:

| Use case | Prefer native MCP assist for | Prefer local `n8nac` for |
| --- | --- | --- |
| Live workflow discovery | Finding workflows that exist in the connected n8n instance, checking names, IDs, active state, tags, projects, and folders | Listing and editing `.workflow.ts` files in the configured `workflowsPath` |
| Drift investigation | Comparing live workflow details with what the repository expects | Pulling, pushing, resolving conflicts, and keeping Git as the source of truth |
| Execution troubleshooting | Searching recent executions, inspecting failure status, and optionally reading execution payloads | Normal execution history commands that already work through the n8n API |
| Credentials inventory | Listing credential metadata without secret values so an agent can understand required integrations | Creating, editing, or revealing credential secret values |
| Native knowledge | Fetching live node definitions, native SDK guidance, and server-side validation from the connected n8n version | Offline node knowledge, examples, docs search, and schema-first workflow authoring |
| Runtime execution strategy | Future explicit workflow execution by ID, non-webhook workflow testing, native pin-data preparation, or direct execution diagnostics | `n8nac test` when the goal is to exercise the real webhook, chat, or form trigger contract |

Do not use native MCP assist as a shortcut for workflow authoring. Creating, updating, publishing, archiving, or deleting workflows directly in n8n can bypass `.workflow.ts` and create drift unless there is a deliberate sync-back design.

### Enable assist mode

First enable and configure the native MCP server in n8n, then copy its HTTP endpoint and bearer token into the local environment that launches the `n8n-as-code` MCP server. Do not commit these values to the repository.

Use `N8N_NATIVE_MCP_URL` and `N8N_NATIVE_MCP_TOKEN` for the native n8n connection. The `N8NAC_NATIVE_MCP_URL` and `N8NAC_NATIVE_MCP_TOKEN` aliases are also accepted.

```bash
export N8NAC_NATIVE_MCP_ENABLED=1
export N8NAC_NATIVE_MCP_MODE=assist
export N8N_NATIVE_MCP_URL="https://your-n8n.example.com/mcp-server/http"
export N8N_NATIVE_MCP_TOKEN="your-personal-native-mcp-token"
n8nac-mcp
```

OAuth2 may be used when an MCP client connects directly to n8n's native server. The `n8n-as-code` broker assist mode implemented here uses `N8N_NATIVE_MCP_TOKEN` or another local secret mechanism outside the repository.

The most common configuration variables are:

| Variable | Required | Purpose |
| --- | --- | --- |
| `N8NAC_NATIVE_MCP_ENABLED=1` | Yes | Enables the optional native assist layer |
| `N8NAC_NATIVE_MCP_MODE=assist` | Recommended | Keeps n8n-as-code as the broker and exposes only approved wrapper tools |
| `N8N_NATIVE_MCP_URL` or `N8NAC_NATIVE_MCP_URL` | Yes | Native n8n MCP HTTP endpoint |
| `N8N_NATIVE_MCP_TOKEN` or `N8NAC_NATIVE_MCP_TOKEN` | Usually | Bearer token used by the broker when calling n8n's native MCP server |
| `N8NAC_NATIVE_MCP_TIMEOUT_MS` | No | Request timeout, default `30000` |
| `N8NAC_NATIVE_MCP_ALLOW_REMOTE=1` | No | Allows exposing native assist wrappers through non-loopback HTTP/SSE broker transports |
| `N8NAC_NATIVE_MCP_ALLOW_EXECUTION_DATA=1` | No | Allows full execution payloads from `get_n8n_live_execution` when requested |

Keep `N8NAC_NATIVE_MCP_ALLOW_REMOTE` unset for local desktop clients. Set it only when the broker transport is separately authenticated and intentionally reachable beyond loopback.

### Use from an MCP client

For local desktop clients, the safest setup is to launch the broker over stdio and inject the native n8n settings as local environment variables. Example Claude Desktop-style configuration:

```json
{
  "mcpServers": {
    "n8n-as-code": {
      "command": "npx",
      "args": ["-y", "@n8n-as-code/mcp"],
      "env": {
        "N8NAC_NATIVE_MCP_ENABLED": "1",
        "N8NAC_NATIVE_MCP_MODE": "assist",
        "N8N_NATIVE_MCP_URL": "https://your-n8n.example.com/mcp-server/http",
        "N8N_NATIVE_MCP_TOKEN": "your-personal-native-mcp-token"
      }
    }
  }
}
```

If you already start `n8nac-mcp` or `n8nac mcp` from a shell, export the same variables in that shell before starting the server. For HTTP broker mode, start the broker with `n8nac-mcp --http` and configure your MCP client with the broker URL, not the native n8n URL.

Useful agent prompts once assist mode is enabled:

- "Check whether native n8n MCP assist is configured and list the discovered native capabilities."
- "Search the live n8n instance for workflows related to invoicing and compare them with the local workflow files."
- "Inspect the latest failed executions for this workflow and summarize the failing node and error message."
- "Use native node definitions to verify this workflow uses parameters supported by the connected n8n version."
- "Validate this generated workflow locally and with native n8n validation, then report any divergence."
- "List credential metadata required by this live workflow without exposing credential secret values."

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
| `get_n8n_live_execution` | `get_execution` | Inspect an execution. Full execution payloads require `N8NAC_NATIVE_MCP_ALLOW_EXECUTION_DATA=1` |
| `get_n8n_native_sdk_reference` | `get_sdk_reference` | Read native workflow-builder SDK guidance |
| `search_n8n_native_nodes` | `search_nodes` | Search live node definitions |
| `get_n8n_native_node_types` | `get_node_types` | Fetch native TypeScript node definitions |
| `validate_n8n_native_workflow_code` | `validate_workflow` | Validate native workflow-builder code without creating workflows |

### Runtime execution strategy

Some n8n native MCP servers can expose runtime tools such as `execute_workflow`, `test_workflow`, or `prepare_test_pin_data`. This broker does not expose those tools in the current read-only wrapper set, but they are a good fit for future explicit execution flows when they complement existing `n8nac` behavior.

- Prefer `n8nac test` when the goal is to exercise the real webhook, chat, or form trigger contract.
- Prefer native runtime execution when it can do something `n8nac test` cannot do well, such as executing by workflow ID, testing non-webhook workflows, preparing native pin-data tests, or returning direct execution diagnostics.
- Treat both `n8nac test` and native runtime execution as side-effecting runtime actions because workflows can send messages, write data, or call external APIs.
- Keep native workflow create, update, publish, unpublish, archive, and destructive data-table operations separate from runtime execution. Those control-plane mutations can create drift from `.workflow.ts` and require a stronger code-first sync-back design before being exposed.

### Diagnostics

Use the CLI diagnostics before relying on native assist:

```bash
n8nac native-mcp status --include-tools --json
n8nac native-mcp tools
n8nac native-mcp doctor --json
```

Use `status` for a redacted configuration snapshot, `tools` to list the native tools discovered from n8n, and `doctor` as a preflight check. `doctor` exits non-zero when assist is disabled, misconfigured, unreachable, or unable to list native tools.

The MCP server also exposes `get_n8n_native_mcp_status`, so an MCP client can ask the broker whether native assist is enabled and which wrapper tools are available without reading local environment variables.

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
| `N8NAC_NATIVE_MCP_ALLOW_REMOTE` | `0` | Allow native assist live tools on non-loopback HTTP/SSE MCP transports. Use only with transport authentication |
| `N8NAC_NATIVE_MCP_ALLOW_EXECUTION_DATA` | `0` | Allow `get_n8n_live_execution` to request full execution payloads with `includeData=true` |

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
