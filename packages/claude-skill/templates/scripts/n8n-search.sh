#!/bin/bash
# Helper script to search for n8n nodes
# Usage: ./n8n-search.sh "search term"

npx -y @n8n-as-code/agent-cli search "$@"
