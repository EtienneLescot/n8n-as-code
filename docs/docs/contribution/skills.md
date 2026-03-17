---
sidebar_label: Skills Library
title: Skills Library - AI Tooling
description: Internal documentation for @n8n-as-code/skills, the library exposed via n8nac skills.
---

# Skills Library - AI Tooling

`@n8n-as-code/skills` is an internal library in `packages/skills`. It is the source of truth for AI-facing tooling in this monorepo, but it is not the primary public entrypoint. Users and agents are expected to go through `n8nac skills`.

## 🎯 What This Package Actually Owns

The current package is responsible for four things:

1. Exposing the full `n8nac skills` command group used by agents and developers.
2. Providing programmatic services such as `AiContextGenerator` and node/documentation lookup.
3. Generating AI context files such as `AGENTS.md` and editor snippets.
4. Building Claude-specific adapter artifacts from the same shared instruction source.

There is no separate `packages/claude-skill/` package anymore. Claude distribution is generated from this package.

## 🏗️ Package Layout

```text
packages/skills/
├── src/
│   ├── commands/                 # n8nac skills subcommand registration
│   ├── services/                 # AiContextGenerator and related services
│   └── assets/                   # Generated node/doc indexes copied to dist/
├── scripts/
│   └── build-skill-adapters.js   # Builds generated skill adapter artifacts
├── tests/
├── dist/
│   ├── assets/
│   └── adapters/claude/          # Built Claude adapter output
├── README.md
└── package.json
```

## 🔌 Public vs Internal Entry Points

### Public entry point

The supported interface for humans and agents is:

```bash
npx --yes n8nac skills --help
```

Typical commands include:

```bash
npx --yes n8nac skills search "google sheets"
npx --yes n8nac skills node-info googleSheets
npx --yes n8nac skills node-schema httpRequest
npx --yes n8nac skills examples search "slack notification"
npx --yes n8nac skills validate my-workflow.workflow.ts
npx --yes n8nac skills update-ai
```

### Internal API

`@n8n-as-code/skills` is still consumable as a TypeScript dependency inside the monorepo:

```typescript
import { AiContextGenerator, SnippetGenerator } from '@n8n-as-code/skills';

const aiGenerator = new AiContextGenerator();
await aiGenerator.generate('./project-root', '2.2.6');

const snippetGenerator = new SnippetGenerator();
await snippetGenerator.generate('./project-root');
```

Use the library API only from packages in this repository or tightly controlled integrations. User-facing documentation should prefer `n8nac skills`.

## 🧠 Core Services

### Command registration

The package registers the `n8nac skills` subcommand tree consumed by the CLI package. This is the main operational surface for node search, technical schemas, docs lookup, guide discovery, workflow examples, validation, and AI context refresh.

### `AiContextGenerator`

`AiContextGenerator` produces the canonical instructions reused across AI surfaces. Its responsibilities now include:

- Generating and updating `AGENTS.md`
- Emitting the shared research protocol used by agents
- Defining canonical TypeScript workflow examples
- Producing the generated skill adapter outputs, including the Claude `SKILL.md` and the OpenClaw skill mirror

This shared generator is the reason `AGENTS.md` and the Claude adapter stay aligned.

### `SnippetGenerator`

`SnippetGenerator` writes `.vscode/n8n.code-snippets` from the node index and fallback templates.

### Indexed data assets

The build copies generated indexes into `dist/assets/`, including technical schemas, documentation, and the unified search index used by `search`, `node-info`, `docs`, `guides`, `related`, and `validate`.

## 📁 Generated Outputs

### AI context files

`n8nac skills update-ai` generates or refreshes:

- `AGENTS.md`
- `.vscode/n8n.code-snippets`

`AGENTS.md` is updated in-place using markers so user-authored content outside the managed block is preserved.

### Claude adapter artifacts

The same package also builds Claude artifacts under `packages/skills/dist/adapters/claude/`, including:

- `n8n-architect/SKILL.md`
- `n8n-architect/README.md`
- `install.sh`

The build script also mirrors generated skill files into the plugin distribution trees under `plugins/claude/...` and `plugins/openclaw/...`.

## 🔄 Integration With Other Packages

### `n8nac`

`n8nac` depends on `@n8n-as-code/skills` and forwards its command surface under `n8nac skills`.

### VS Code extension

The VS Code extension depends on the same package for AI context generation and node-aware assistance.

### Claude adapter

Claude-specific distribution is not an independent package. It is a build artifact generated from `packages/skills/scripts/build-skill-adapters.js` using `AiContextGenerator.getSkillContent()`.

## 🧪 Build And Test

### Build the package

```bash
cd packages/skills
npm run build
```

This compiles TypeScript and copies JSON assets into `dist/assets/`.

### Build the Claude adapter

```bash
cd packages/skills
npm run build:adapters
```

At the workspace root, the compatibility script is:

```bash
npm run build:claude-plugin
```

### Run tests

```bash
cd packages/skills
npm test
```

Key coverage includes `AiContextGenerator` behavior and the expectation that generated guidance uses `npx --yes n8nac skills`.

## 📌 Contribution Notes

- Do not document `@n8n-as-code/skills` as a standalone end-user CLI.
- Do not reintroduce references to `get` if the real command is `node-info` or `node-schema`.
- Keep AI guidance centered on TypeScript workflows, not legacy JSON-only examples.
- Treat Claude adapter content as derived from the shared generator, not as hand-maintained standalone instructions.

## 📚 Related Documentation

- [Architecture Overview](/docs/contribution/architecture)
- [CLI Package](/docs/contribution/cli)
- [Claude Adapter](claude-skill.md)

---

*The Skills CLI enables AI assistants to work effectively with n8n workflows by providing comprehensive context, validation, and code generation capabilities.*
