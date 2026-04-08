#!/bin/sh
# Entrypoint for the n8n-as-code MCP Server (Bun image).
#
# Environment variables:
#
#   N8N_AS_CODE_PROJECT_DIR   Working directory for n8n workflow files.
#                             Defaults to /data. Mount your workflows here.
#                             Example: -v /host/workflows:/data
#
#   MCP_TRANSPORT             Transport protocol: stdio | http | sse
#                             Defaults to "stdio".
#
#   MCP_HOST                  Bind host for http/sse transport.
#                             Defaults to "0.0.0.0" (required for Docker networking).
#
#   MCP_PORT                  Bind port for http/sse transport.
#                             Defaults to 3000.

set -e

case "${MCP_TRANSPORT:-stdio}" in
  stdio)
    exec bun /app/node_modules/@n8n-as-code/mcp/dist/cli.js "$@"
    ;;
  http)
    exec bun /app/node_modules/@n8n-as-code/mcp/dist/cli.js --http --host "${MCP_HOST:-0.0.0.0}" --port "${MCP_PORT:-3000}" "$@"
    ;;
  sse)
    exec bun /app/node_modules/@n8n-as-code/mcp/dist/cli.js --sse --host "${MCP_HOST:-0.0.0.0}" --port "${MCP_PORT:-3000}" "$@"
    ;;
  *)
    echo "Error: Unknown MCP_TRANSPORT='${MCP_TRANSPORT}'. Valid values: stdio, http, sse." >&2
    exit 1
    ;;
esac
