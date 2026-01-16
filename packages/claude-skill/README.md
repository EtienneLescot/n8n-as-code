# @n8n-as-code/claude-skill

Official Claude Agent Skill for n8n workflow development.

## 🎯 Purpose

This package provides a [Claude Agent Skill](https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills) that packages `@n8n-as-code/agent-cli` into Claude's skill format. It enables Claude to:

- Search for n8n nodes using exact documentation
- Retrieve node schemas to prevent parameter hallucination
- Generate valid n8n workflow JSON following best practices

## 📦 What's Included

- **SKILL.md**: Main skill file with YAML frontmatter and instructions
- **scripts/**: Bash helpers that execute `npx @n8n-as-code/agent-cli`

## 🚀 Quick Start

**Build the skill:**
```bash
cd packages/claude-skill
npm run build
```

This generates `dist/n8n-architect/` ready for distribution.

**Installation methods:**
- See the [Usage Guide](/docs/usage/claude-skill) for detailed installation instructions
- For Claude.ai: Upload the generated folder as ZIP
- For Claude Code: Copy to `~/.claude/skills/`
- For API: Reference `skills: ['n8n-architect']` in your code

## 📚 Documentation

Full documentation is available in the [n8n-as-code docs](https://etiennelescot.github.io/n8n-as-code/):
- [Usage Guide](/docs/usage/claude-skill) - Installation and usage
- [Contribution Guide](/docs/contribution) - Development guidelines

## 📄 License

MIT - See main repository for full license details
