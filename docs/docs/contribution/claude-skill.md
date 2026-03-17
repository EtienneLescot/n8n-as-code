---
sidebar_position: 5
title: Claude Adapter
description: Internal documentation for the Claude adapter generated from packages/skills.
---

# Claude Adapter

This page documents the Claude-specific adapter built from `packages/skills`. It is not a standalone package anymore.

## 📦 Package Overview

- **Source package**: `packages/skills/`
- **Build script**: `packages/skills/scripts/build-skill-adapters.js`
- **Purpose**: Package shared n8n instructions as a [Claude Agent Skill](https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills)
- **Type**: Generated distribution artifact, not a published npm package
- **Source of truth**: `AiContextGenerator.getSkillContent()`

## 🏗️ Architecture

### Source And Output Structure

```
packages/skills/
├── src/services/ai-context-generator.ts
├── scripts/build-skill-adapters.js
├── dist/adapters/claude/
│   ├── n8n-architect/
│   │   ├── SKILL.md
│   │   └── README.md
│   └── install.sh
└── package.json
```

### Build Output

```
packages/skills/dist/adapters/claude/
├── n8n-architect/
│   ├── SKILL.md
│   └── README.md
└── install.sh
```

The build also mirrors `SKILL.md` into the repository plugin tree under `plugins/claude/n8n-as-code/skills/n8n-architect/`.

## 🔧 Development

### Building the adapter

```bash
cd packages/skills
npm run build:adapters
```

This:
1. Loads the compiled `AiContextGenerator` from `dist/`
2. Generates `SKILL.md` via `getSkillContent()`
3. Writes the Claude distribution files into `dist/adapters/claude/`
4. Mirrors the skill into the plugin distribution tree

From the workspace root, the compatibility entrypoint is:

```bash
npm run build:claude-plugin
```

### What is actually generated

The builder writes:

- `packages/skills/dist/adapters/claude/n8n-architect/SKILL.md`
- `packages/skills/dist/adapters/claude/n8n-architect/README.md`
- `packages/skills/dist/adapters/claude/install.sh`
- `plugins/claude/n8n-as-code/skills/n8n-architect/SKILL.md`

There is no separate `validate.js` or hand-maintained template directory in the current implementation.

### Local verification

```bash
cd packages/skills
npm run build
npm run build:adapters
```

Then inspect the generated files in `dist/adapters/claude/` and verify that `SKILL.md` contains the current shared guidance.

### Testing Locally

```bash
cd packages/skills
npm run build
npm run build:adapters
cd dist/adapters/claude
./install.sh
```

That installs `n8n-architect` into `~/.claude/skills/` for Claude Code. For hosted Claude flows, zip the generated `n8n-architect/` directory.

## 📝 SKILL.md Format

The generated file must follow Anthropic's skill format:

```yaml
---
name: n8n-architect              # lowercase, hyphens, max 64 chars
description: Expert assistant... # max 1024 chars, explains WHEN to use
---

# n8n Architect

## Instructions
[Markdown content with instructions for Claude]

## Examples
[Usage examples]
```

### Content Guidelines

**DO:**
- Reuse content from `AiContextGenerator.getSkillContent()`
- Use `npx n8nac skills` (via the `n8nac` unified CLI)
- Provide concrete examples in bash code blocks
- Keep instructions imperative and clear

**DON'T:**
- Invent parameters or hallucinate capabilities
- Remove YAML frontmatter
- Use vague language
- Add commands not supported by `n8nac skills`

## 🔄 Content Consistency

The adapter is derived from the same source used for agent context generation. In practice:

```typescript
// packages/skills/src/services/ai-context-generator.ts
public getSkillContent(distTag?: string): string {
  // Builds Claude skill content from shared command references and guidance
}
```

This keeps `AGENTS.md` and the Claude adapter aligned around the same workflow rules, command forms, and TypeScript examples.

## 📦 Distribution

### Repository distribution

The generated adapter lives in the repository output tree and plugin tree. It can be zipped for Claude-compatible distribution, but it is not versioned as its own npm package.

### Release relationship

Changes to Claude instructions should usually be treated as changes to `@n8n-as-code/skills`, because that package owns the generator and build script.

## 🧪 Testing Checklist

Before releasing:

- [ ] `cd packages/skills && npm run build` succeeds
- [ ] `cd packages/skills && npm run build:adapters` succeeds
- [ ] Generated `SKILL.md` has valid YAML frontmatter
- [ ] Test in Claude.ai (upload ZIP)
- [ ] Test in Claude Code (local install)
- [ ] Verify NPX commands execute correctly
- [ ] Confirm generated guidance still matches current `n8nac skills` commands

## 🔧 Scripts Reference

### `cd packages/skills && npm run build`
Compiles the package and copies JSON assets into `dist/assets/`.

### `cd packages/skills && npm run build:adapters`
Generates the Claude adapter distribution files.

### `npm run build:claude-plugin`
Workspace-level convenience script that builds the Skills package and its Claude adapter.

## 🚀 Release Process

The adapter follows the Skills package lifecycle:

1. **Make changes** to `packages/skills/src/services/ai-context-generator.ts` or `packages/skills/scripts/build-skill-adapters.js`
2. **Commit with a conventional message** so CI can infer the bump level
3. **Push to `next`** for prerelease validation
4. **Merge `next` into `main`** and let the release PR apply the final version bump

## 📚 Key Dependencies

- **n8nac**: The unified CLI that exposes `@n8n-as-code/skills` commands via `npx n8nac skills`
- **@n8n-as-code/skills**: Owns the shared generator and command surface
- **Node.js**: Required for build and NPX execution

## 🐛 Common Issues

### Adapter content is stale
- Rebuild `packages/skills` before `build:adapters`
- Check whether the source change was made in `AiContextGenerator` rather than a generated file

### Generated files do not match the current CLI
- Verify the command examples still use `npx --yes n8nac skills`
- Check `packages/skills/tests/ai-context-generator.test.ts` for the expected canonical forms

### Skill not recognized by Claude
- Verify YAML `name` field matches reference
- Check `description` explains WHEN to use
- Ensure SKILL.md is in root of distribution folder

## 📖 References

- [Anthropic Agent Skills Docs](https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills)
- [Agent Skills Engineering Blog](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [Skills CLI Package](skills.md)

## 🤝 Contributing

To improve this package:

1. Understand the [Claude Agent Skills spec](https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills)
2. Edit the shared generator in `packages/skills/src/services/ai-context-generator.ts`
3. Run `cd packages/skills && npm run build && npm run build:adapters`
4. Test in Claude.ai or Claude Code
5. Commit with a conventional message and submit PR

See [Contribution Guide](index.md) for general guidelines.
