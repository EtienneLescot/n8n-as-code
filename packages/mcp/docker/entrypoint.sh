#!/bin/sh
# Entrypoint for the n8n-as-code MCP Server (Node.js image).
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
    exec n8nac-mcp "$@"
    ;;
  http|sse)
    echo "Error: MCP_TRANSPORT='${MCP_TRANSPORT}' is not supported by the Node image." >&2
    echo "The current MCP CLI only supports stdio transport here, so no HTTP/SSE listener can be started on MCP_HOST/MCP_PORT." >&2
    echo "Use MCP_TRANSPORT=stdio, or switch to an image/entrypoint with real HTTP/SSE transport support." >&2
    exit 1
    ;;
  *)
    echo "Error: Unknown MCP_TRANSPORT='${MCP_TRANSPORT}'. Valid values: stdio, http, sse." >&2
    exit 1
    ;;
esac
