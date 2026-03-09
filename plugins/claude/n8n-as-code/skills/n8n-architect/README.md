# n8n Architect

Claude Code skill shipped by the `n8n-as-code` plugin.

## Purpose

Turns Claude into a specialized n8n workflow engineer using the `n8nac` CLI and the prebuilt `n8n-as-code` knowledge base.

## Recommended Claude Code setup

After installing the plugin, initialize the workspace. `init-project` bootstraps `AGENTS.md` automatically, and `update-ai` is there when you want to refresh that generated context later:

```bash
# Recommended: configure n8nac via environment variables
export N8N_HOST="<your-n8n-url>"
export N8N_API_KEY="<your-api-key>"

npx --yes n8nac init-auth
npx --yes n8nac init-project

# Optional: refresh AGENTS.md and snippets later
npx --yes n8nac update-ai

# Alternatively (less secure, exposes secrets via shell history/process listings):
# npx --yes n8nac init-auth --host <your-n8n-url> --api-key <your-api-key>
```

That leaves `AGENTS.md` in the project root. For multi-agent setups that use a repo-level `CLAUDE.md`, keep it small and point it back to `AGENTS.md` so planners and coding agents use the generated n8n-as-code instructions instead of inventing node schemas.

## Source Repository

https://github.com/EtienneLescot/n8n-as-code
