# n8n Architect

Claude Code skill shipped by the `n8n-as-code` plugin.

## Purpose

Turns Claude into a specialized n8n workflow engineer using the `n8nac` CLI and the prebuilt `n8n-as-code` knowledge base.

## Recommended Claude Code setup

After installing the plugin, configure the target workspace with a workspace environment. `n8nac env` owns workspace context, `n8nac workspace` owns readiness and unified migration, and `n8n-manager` owns only local managed instances. `update-ai` refreshes the generated context later:

```bash
npx --yes n8nac env add Dev --base-url <your-n8n-url> --sync-folder workflows/dev
npx --yes n8nac env auth set Dev --api-key-stdin
npx --yes n8nac env use Dev
npx --yes n8nac update-ai
```

For prerelease testing from `https://github.com/EtienneLescot/n8n-as-code#next`, use matching npm tags in manual commands: `npx --yes n8nac@next ...` and `npx --yes @n8n-as-code/n8n-manager@next ...`.

That leaves `AGENTS.md` in the project root. For multi-agent setups that use a repo-level `CLAUDE.md`, keep it small and point it back to `AGENTS.md` so planners and coding agents use the generated n8n-as-code instructions instead of inventing node schemas.

## Source Repository

https://github.com/EtienneLescot/n8n-as-code
