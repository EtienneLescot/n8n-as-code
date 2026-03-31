# n8n Architect

Claude Code skill shipped by the `n8n-as-code` plugin.

## Purpose

Turns Claude into a specialized n8n workflow engineer using the `n8nac` CLI and the prebuilt `n8n-as-code` knowledge base.

## Recommended Claude Code setup

After installing the plugin, initialize the workspace. The main setup command is `instance add` (or the alias `init`), which saves a new instance config and selects the project in one flow. Use `init-auth` + `init-project` only when you want to split credential discovery from project selection. `update-ai` refreshes the generated context later:

```bash
# One-command setup when the project selector is already known
# npx --yes n8nac instance add --yes --host <your-n8n-url> --api-key <your-api-key> --project-name "Personal"

# Or the explicit 2-step flow when Claude needs to inspect the project list first
# npx --yes n8nac init-auth --host <your-n8n-url> --api-key <your-api-key>
# npx --yes n8nac init-project

# Optional: refresh AGENTS.md and snippets later
npx --yes n8nac update-ai
```

That leaves `AGENTS.md` in the project root. For multi-agent setups that use a repo-level `CLAUDE.md`, keep it small and point it back to `AGENTS.md` so planners and coding agents use the generated n8n-as-code instructions instead of inventing node schemas.

## Source Repository

https://github.com/EtienneLescot/n8n-as-code
