# n8n Architect

Claude Code skill shipped by the `n8n-as-code` plugin.

## Purpose

Turns Claude into a specialized n8n workflow engineer using the `n8nac` CLI and the prebuilt `n8n-as-code` knowledge base.

## Install

```text
/plugin marketplace add EtienneLescot/n8n-as-code
/plugin install n8n-as-code@n8nac-marketplace
```

The plugin namespace is `n8n-as-code`. The CLI alias remains `n8nac`.

## Skill Entry Point

- Main instructions: `SKILL.md`
- Claude command namespace: `/n8n-as-code:n8n-architect`

## What It Covers

- n8n node discovery and exact schema lookup
- TypeScript workflow generation with decorators
- Git-like pull/edit/push discipline
- AI node `.uses()` wiring rules
- Validation-first workflow authoring