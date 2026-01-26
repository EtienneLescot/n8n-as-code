---
sidebar_position: 5
title: Claude Skill Package
description: Internal documentation for the Claude Skill package - building, validating, and distributing the n8n Architect skill
---

# Claude Skill Package

Internal documentation for `@n8n-as-code/claude-skill` - the Claude Agent Skill for n8n workflow development.

## 📦 Package Overview

- **Location**: `packages/claude-skill/`
- **Purpose**: Package `@n8n-as-code/skills` as a [Claude Agent Skill](https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills)
- **Type**: Distribution package (not published to NPM, distributed as ZIP)
- **Dependencies**: `@n8n-as-code/skills`

## 🏗️ Architecture

### Package Structure

```
packages/claude-skill/
├── package.json           # NPM metadata with build/validate scripts
├── build.js               # Generates dist/n8n-architect/
├── validate.js            # Validates SKILL.md format
├── templates/             # Source files
│   ├── SKILL.md          # Main skill file (CRITICAL)
│   └── scripts/
│       ├── n8n-search.sh # Wrapper for skills search
│       ├── n8n-get.sh    # Wrapper for skills get
│       └── n8n-list.sh   # Wrapper for skills list
├── README.md              # User-facing documentation
└── CHANGELOG.md           # Version history
```

### Build Output

```
dist/
├── n8n-architect/         # Ready-to-distribute skill
│   ├── SKILL.md
│   ├── README.md
│   └── scripts/
└── install.sh             # Helper script for local install
```

## 🔧 Development

### Building the Skill

```bash
cd packages/claude-skill
npm run build
```

This:
1. Runs `validate.js` to check SKILL.md format
2. Runs `build.js` to generate `dist/n8n-architect/`
3. Copies templates and generates installation files

### Validating SKILL.md

```bash
npm run validate
```

Checks:
- ✅ Valid YAML frontmatter
- ✅ Required fields: `name`, `description`
- ✅ Field constraints (max lengths, format)
- ✅ No forbidden content (XML tags)
- ✅ Bash commands use `npx -y` flag

### Testing Locally

```bash
npm run build
cd dist
./install.sh  # Installs to ~/.claude/skills/
```

Then test in Claude Code or create ZIP for Claude.ai.

## 📝 SKILL.md Format

The sync file must follow Anthropic's specification:

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
- Reuse content from `AiContextGenerator.getAgentsContent()`
- Use `npx -y @n8n-as-code/skills` (the `-y` flag is critical)
- Provide concrete examples in bash code blocks
- Keep instructions imperative and clear

**DON'T:**
- Invent parameters or hallucinate capabilities
- Remove YAML frontmatter
- Use vague language
- Add commands not in `@n8n-as-code/skills`

## 🔄 Content Consistency

The skill **reuses** content from `skills`'s `AiContextGenerator`:

```typescript
// packages/skills/src/services/ai-context-generator.ts
private getAgentsContent(n8nVersion: string): string {
  return [
    `## 🎭 Role: Expert n8n Engineer`,
    `You manage n8n workflows as **clean, version-controlled JSON**.`,
    // ... same content used in SKILL.md
  ].join('\n');
}
```

This ensures AGENTS.md (for Cursor/Windsurf) and SKILL.md (for Claude) stay synchronized.

## 📦 Distribution

### Via GitHub Releases

When a changeset is merged:
1. CI builds all packages including `claude-skill`
2. `dist/n8n-architect/` is created
3. Manual step: Create ZIP and attach to GitHub Release

### Via NPM (Future)

Currently not published to NPM. If needed in the future:
1. Remove `"private": true` from package.json
2. Add to `.github/workflows/release.yml`
3. Update `files` array in package.json

## 🧪 Testing Checklist

Before releasing:

- [ ] `npm run validate` passes
- [ ] `npm run build` succeeds
- [ ] SKILL.md has valid YAML frontmatter
- [ ] Test in Claude.ai (upload ZIP)
- [ ] Test in Claude Code (local install)
- [ ] Verify NPX commands execute correctly
- [ ] Check that Claude follows instructions
- [ ] Test example prompts work

## 🔧 Scripts Reference

### `npm run build`
Generates distributable package in `dist/n8n-architect/`

### `npm run validate`
Validates SKILL.md format and content

### `npm run clean`
Removes `dist/` directory

## 🚀 Release Process

This package follows the monorepo's Changeset workflow:

1. **Make changes** to `templates/SKILL.md` or build scripts
2. **Create changeset**:
   ```bash
   npm run changeset
   # Select: @n8n-as-code/claude-skill
   # Choose version bump
   ```
3. **Commit**: `git add . && git commit`
4. **CI handles**: Version bump, build, and release creation

## 📚 Key Dependencies

- **@n8n-as-code/skills**: Provides the CLI commands executed by the skill
- **Node.js**: Required for NPX execution
- **Bash**: Scripts are bash-based

## 🔍 Validation Rules

Implemented in `validate.js`:

| Rule | Constraint |
|------|-----------|
| Name length | Max 64 chars |
| Name format | Lowercase, hyphens only |
| Description length | Max 1024 chars |
| Forbidden words in name | "anthropic", "claude" |
| NPX flag | Must use `-y` to avoid prompts |

## 🐛 Common Issues

### Build fails with "Invalid YAML"
- Check YAML frontmatter syntax
- Ensure proper indentation
- No tabs, only spaces

### Scripts don't execute in Claude
- Verify scripts use `npx -y` flag
- Check bash shebang: `#!/bin/bash`
- Ensure scripts are marked executable

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
2. Edit `templates/SKILL.md` following guidelines above
3. Run `npm run validate && npm run build`
4. Test in Claude.ai or Claude Code
5. Create changeset and submit PR

See [Contribution Guide](index.md) for general guidelines.
