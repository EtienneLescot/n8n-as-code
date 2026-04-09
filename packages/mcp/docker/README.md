# n8n-as-code MCP Server – Docker Images

The MCP server is published to the **GitHub Container Registry** on every release of `@n8n-as-code/mcp`.

```text
ghcr.io/etiennelescot/n8nac-mcp
```

---

## Available tags

| Tag | Runtime | Description |
| --- | ------- | ----------- |
| `latest` | [node:lts-alpine](https://hub.docker.com/_/node) | Latest stable release |
| `1.2.0` | [node:lts-alpine](https://hub.docker.com/_/node) | Pinned version |
| `latest-bun` | [oven/bun:alpine](https://hub.docker.com/r/oven/bun) | Latest stable release |
| `1.2.0-bun` | [oven/bun:alpine](https://hub.docker.com/r/oven/bun) | Pinned version |

New tags are published automatically for every `@n8n-as-code/mcp` release.

---

## Quick start

### stdio (default — for use with MCP clients like Claude Desktop)

```bash
docker run -i \
  -v /path/to/your/workflows:/data \
  ghcr.io/etiennelescot/n8nac-mcp:latest
```

> `-i` keeps stdin open, which is required for the stdio transport.

### HTTP (Streamable HTTP transport)

```bash
docker run -p 3000:3000 \
  -v /path/to/your/workflows:/data \
  -e MCP_TRANSPORT=http \
  ghcr.io/etiennelescot/n8nac-mcp:latest
```

The server listens on `http://localhost:3000/mcp`.

### SSE (Server-Sent Events transport)

> **⚠️ Deprecated:** The SSE transport is officially deprecated in the Model Context Protocol specification and will be removed in a future version of the MCP standard. **Prefer `MCP_TRANSPORT=http` (Streamable HTTP) in all new setups.** SSE is supported here only for backwards compatibility with older MCP clients that do not yet support the HTTP transport.

```bash
docker run -p 3000:3000 \
  -v /path/to/your/workflows:/data \
  -e MCP_TRANSPORT=sse \
  ghcr.io/etiennelescot/n8nac-mcp:latest
```

The server listens on `http://localhost:3000/sse`.

---

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `N8N_AS_CODE_PROJECT_DIR` | `/data` | Working directory for n8n workflow files. Mount your project here. |
| `MCP_TRANSPORT` | `stdio` | Transport protocol: `stdio`, `http`, or `sse`. |
| `MCP_HOST` | `0.0.0.0` | Bind host for `http`/`sse` transport. |
| `MCP_PORT` | `3000` | Bind port for `http`/`sse` transport. |

### Custom port example

```bash
docker run -p 8080:8080 \
  -e MCP_TRANSPORT=http \
  -e MCP_PORT=8080 \
  ghcr.io/etiennelescot/n8nac-mcp:latest
```

---

## Docker Compose

```yaml
services:
  mcp:
    image: ghcr.io/etiennelescot/n8nac-mcp:latest
    ports:
      - "3000:3000"
    environment:
      MCP_TRANSPORT: http
    volumes:
      - ./workflows:/data
    restart: unless-stopped
```

---

## Client configuration

### Claude Desktop

**stdio** — recommended for local single-user setups:

```json
{
  "mcpServers": {
    "n8n-as-code": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-v", "/path/to/your/workflows:/data",
        "ghcr.io/etiennelescot/n8nac-mcp:latest"
      ]
    }
  }
}
```

**HTTP** — recommended when the container runs as a persistent service:

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
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-v", "/path/to/your/workflows:/data",
        "ghcr.io/etiennelescot/n8nac-mcp:latest"
      ]
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
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-v", "${workspaceFolder}:/data",
        "ghcr.io/etiennelescot/n8nac-mcp:latest"
      ]
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
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-v", "/path/to/your/workflows:/data",
        "ghcr.io/etiennelescot/n8nac-mcp:latest"
      ]
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

---

## Architecture

The MCP server is a thin protocol layer. All tool calls (`search_n8n_knowledge`, `get_n8n_node_info`, `validate_n8n_workflow`, etc.) are delegated to the `n8nac` CLI, which is bundled inside the image as a runtime dependency.

```text
MCP Client → MCP Server (@n8n-as-code/mcp) → n8nac CLI → bundled knowledge index
```

Docker images are published for specific `@n8n-as-code/mcp` release tags. `n8nac` is a declared `dependency` of `@n8n-as-code/mcp` and is therefore co-installed automatically in the image.

---

## Building locally

```bash
# Node.js image
docker build \
  --build-arg MCP_VERSION=1.2.0 \
  --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --build-arg VCS_REF=$(git rev-parse --short HEAD) \
  -f packages/mcp/docker/Dockerfile \
  -t n8nac-mcp:1.2.0 \
  packages/mcp/docker

# Bun image
docker build \
  --build-arg MCP_VERSION=1.2.0 \
  --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --build-arg VCS_REF=$(git rev-parse --short HEAD) \
  -f packages/mcp/docker/Dockerfile.bun \
  -t n8nac-mcp:1.2.0-bun \
  packages/mcp/docker
```
