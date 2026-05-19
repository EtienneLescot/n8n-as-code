---
sidebar_position: 5
title: Agent Skills Adapters
description: Internal documentation for the portable n8n agent skills and facade packaging.
---

# Agent Skills Adapters

This page documents the standard agent skills distributed by `n8n-as-code`.

## Package Overview

- **Source package**: `packages/skills/`
- **Canonical skill**: `packages/skills/src/agent-skills/n8n-architect/SKILL.md`
- **Build script**: `packages/skills/scripts/build-skill-adapters.js`
- **Purpose**: Package shared n8n instructions as portable skills for Claude, OpenClaw, Cursor, VS Code-generated workspaces, and generic agents.
- **Source of truth**: the canonical `src/agent-skills/n8n-architect/SKILL.md` file.

## Architecture

`n8n-architect` owns workspace readiness, migration, environments, local managed instance guidance, tunnels, context-root workflow authoring, sync, schema lookup, validation, push/pull, and workflow testing discipline.

The skill tells agents to use `n8nac` as the primary interface, including workflow presentation through `n8nac workflow present`, and `n8n-manager` only for local managed runtime lifecycle and tunnels.

`AGENTS.md` is generated in the context root by `n8nac update-ai`, but it is only a bootstrap file. It points agents to `.agents/skills` and tells them to run `n8nac workspace migrate --json` as the unified migration preflight, then resolve effective environment state with `n8nac env status --json` after migration is not required or has been applied. It must not duplicate environment, project, or workflowsPath state.

## Build Output

The adapter build mirrors the canonical skill into:

```text
packages/skills/dist/adapters/agent-skills/
plugins/claude/n8n-as-code/skills/
plugins/openclaw/n8n-as-code/skills/
plugins/cursor/n8n-as-code/skills/
```

The package build also copies the canonical skill into:

```text
packages/skills/dist/agent-skills/
```

At runtime, `n8nac update-ai` materializes context-root copies:

```text
.agents/skills/n8n-architect/SKILL.md
```

## Development

```bash
cd packages/skills
npm run build
npm run build:adapters
```

Change the canonical `SKILL.md` file first. Do not hand-edit generated plugin copies except to inspect build output.

## Local Verification

```bash
npm test --workspace=packages/skills -- --runInBand ai-context-generator.test.ts
npx vitest run --config packages/cli/vitest.config.ts packages/cli/tests/integration/update-ai.integration.test.ts
```

The tests verify that:

- `AGENTS.md` remains lightweight.
- `.agents/skills` is generated.
- packaged plugin skills match canonical generated skills.
- OpenClaw no longer relies on native `n8nac` tool actions.

## SKILL.md Format

Each skill must follow the standard frontmatter shape:

```yaml
---
name: n8n-architect
description: Use when the user wants to create, edit, validate, sync, or troubleshoot n8n workflows.
---
```

Use clear imperative instructions and shell commands. Do not add facade-specific tool calls or undocumented CLI flags.

## Release Notes

Changes to these skills are changes to `@n8n-as-code/skills`, because that package owns canonical skill content, generated workspace context, and facade mirrors.
