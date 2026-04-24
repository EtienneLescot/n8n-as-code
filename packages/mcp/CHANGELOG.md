# @n8n-as-code/mcp

## [1.4.0](https://github.com/EtienneLescot/n8n-as-code/compare/@n8n-as-code/mcp@v1.3.0...@n8n-as-code/mcp@v1.4.0) (2026-04-24)

### Features

* **mcp:** add Docker images for MCP server ([25ad7a5](https://github.com/EtienneLescot/n8n-as-code/commit/25ad7a5d82e866b7910d186611d5e171edad6570))
* add error handling for mutually exclusive transport flags and enhance session management in MCP server ([2219830](https://github.com/EtienneLescot/n8n-as-code/commit/22198300abe38aa190d3aca05e6b3873f8878d4c))
* **mcp:** add dedicated MCP server and CLI integration ([91c9c69](https://github.com/EtienneLescot/n8n-as-code/commit/91c9c6929595a5ef30995bc8eeba5e3d3b825606))

### Bug Fixes

* **mcp:** align Docker distribution with current CLI capabilities ([dd24abc](https://github.com/EtienneLescot/n8n-as-code/commit/dd24abc8f77ab83eed4b4a2db27b0a0ad292177e))
* align mcp CHANGELOG.md format with other workspace packages ([2d48df4](https://github.com/EtienneLescot/n8n-as-code/commit/2d48df45ded5fae9604e1e678aab4690ae9ac1f8))
* include @n8n-as-code/mcp in release pipeline ([823c1a0](https://github.com/EtienneLescot/n8n-as-code/commit/823c1a0e068f26438a7f7a4dbfd0b97699b3840c))

## [1.3.0](https://github.com/EtienneLescot/n8n-as-code/releases/tag/%40n8n-as-code%2Fmcp%40v1.3.0)

### Added

- **HTTP transport** (Streamable HTTP): new `--http` CLI flag starts a stateful Streamable HTTP server (`POST /mcp`, `GET /mcp`, `DELETE /mcp`) with per-session transport management. Exposes `HttpServerOptions` interface and `http` option on `StartServerOptions`.
- **SSE transport**: new `--sse` CLI flag starts a legacy Server-Sent Events server (`GET /sse`, `POST /message?sessionId=…`) for clients that do not yet support Streamable HTTP. Exposes `SseServerOptions` interface and `sse` option on `StartServerOptions`.
- Both `--http` and `--sse` accept `--port` (default `3000`) and `--host` (default `127.0.0.1`). When neither flag is given the server falls back to stdio.
- **Tool annotations**: all six MCP tools now declare `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, and `openWorldHint: false`, making their behaviour explicit to MCP clients such as MCP Inspector.

### Fixed

- **CLI resolution in monorepo**: `getCliEntryPath()` now falls back to the relative sibling path `packages/cli/dist/index.js` when `n8nac/package.json` cannot be resolved via `require.resolve` (e.g. when workspace symlinks are not installed).

## [1.2.0](https://github.com/EtienneLescot/n8n-as-code/releases/tag/%40n8n-as-code%2Fmcp%40v1.2.0)
