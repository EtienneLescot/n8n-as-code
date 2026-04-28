# n8n Architect

Claude Code skill shipped by the `n8n-as-code` plugin.

## Purpose

Turns Claude into a specialized n8n workflow engineer using the `n8nac` CLI and the prebuilt `n8n-as-code` knowledge base.

## Recommended Claude Code setup

After installing the plugin, configure the target workspace with the two CLI responsibilities: `n8n-manager` owns n8n instance/auth/project state, and `n8nac workspace` owns local workspace overrides. `update-ai` refreshes the generated context later:

```bash
n8n-manager auth set --url <your-n8n-url> --api-key-stdin
n8n-manager projects list
n8n-manager projects select <project-id-or-name>
npx --yes n8nac workspace set-sync-folder workflows
npx --yes n8nac update-ai
```

That leaves `AGENTS.md` in the project root. For multi-agent setups that use a repo-level `CLAUDE.md`, keep it small and point it back to `AGENTS.md` so planners and coding agents use the generated n8n-as-code instructions instead of inventing node schemas.

## Source Repository

https://github.com/EtienneLescot/n8n-as-code
