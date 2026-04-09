# @n8n-as-code/mcp

## [1.3.0](https://github.com/EtienneLescot/n8n-as-code/releases/tag/%40n8n-as-code%2Fmcp%40v1.3.0)

### Added

- **HTTP transport** (Streamable HTTP): new `--http` CLI flag starts a stateful Streamable HTTP server (`POST /mcp`, `GET /mcp`, `DELETE /mcp`) with per-session transport management. Exposes `HttpServerOptions` interface and `http` option on `StartServerOptions`.
- **SSE transport**: new `--sse` CLI flag starts a legacy Server-Sent Events server (`GET /sse`, `POST /message?sessionId=…`) for clients that do not yet support Streamable HTTP. Exposes `SseServerOptions` interface and `sse` option on `StartServerOptions`.
- Both `--http` and `--sse` accept `--port` (default `3000`) and `--host` (default `127.0.0.1`). When neither flag is given the server falls back to stdio.
- **Tool annotations**: all six MCP tools now declare `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, and `openWorldHint: false`, making their behaviour explicit to MCP clients such as MCP Inspector.

### Fixed

- **CLI resolution in monorepo**: `getCliEntryPath()` now falls back to the relative sibling path `packages/cli/dist/index.js` when `n8nac/package.json` cannot be resolved via `require.resolve` (e.g. when workspace symlinks are not installed).

## [1.2.0](https://github.com/EtienneLescot/n8n-as-code/releases/tag/%40n8n-as-code%2Fmcp%40v1.2.0)
