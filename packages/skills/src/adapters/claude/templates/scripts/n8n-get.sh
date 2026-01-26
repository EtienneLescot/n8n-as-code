#!/bin/bash
# Helper script to get n8n node schema
# Usage: ./n8n-get.sh "nodeName"

npx -y @n8n-as-code/skills get "$@"
