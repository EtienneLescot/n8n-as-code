# n8n Architect

Claude Code skill shipped by the `n8n-as-code` plugin.

## Purpose

Turns Claude into a specialized n8n workflow engineer using the `n8nac` CLI and the prebuilt `n8n-as-code` knowledge base.

## Recommended Claude Code setup

After installing the plugin, initialize the target workspace. For autonomous agents, prefer the explicit 2-step non-interactive flow by default, and use the 1-command flow only when the project is already known. `update-ai` refreshes the generated context later:

```bash
# Default 2-step flow when Claude needs to inspect the project list first
# npx --yes n8nac init-auth --host <your-n8n-url> --api-key <your-api-key>
# npx --yes n8nac init-project --project-id <id>|--project-name "Personal"|--project-index <n>

# Optional 1-command setup when the project selector is already known
# npx --yes n8nac instance add --yes --host <your-n8n-url> --api-key <your-api-key> --project-name "Personal"

# Optional: refresh AGENTS.md and snippets later
npx --yes n8nac update-ai
```

That leaves `AGENTS.md` in the project root. For multi-agent setups that use a repo-level `CLAUDE.md`, keep it small and point it back to `AGENTS.md` so planners and coding agents use the generated n8n-as-code instructions instead of inventing node schemas.

## Source Repository

https://github.com/EtienneLescot/n8n-as-code
