# @n8n-as-code/claude-skill

## 0.2.2

### Patch Changes

- 08b83b5: doc update
- Updated dependencies [08b83b5]
  - @n8n-as-code/agent-cli@0.2.1

## 0.2.1

### Patch Changes

- feat(skills): initial release of Claude Agent Skill package

  Introduces a filesystem-based Skill for Claude agents to interact with N8N documentation.

  - Added `SKILL.md` with prompt engineering for N8N node lookups.
  - configured CLI wrapper using `npx @n8n-as-code/agent-cli`.
  - Enables direct tool usage within Claude's sandbox environment, removing the need for MCP.

## 0.2.0

### Initial Release

- 🎉 First release of the n8n Architect Claude Agent Skill
- 📝 Complete SKILL.md with YAML frontmatter for Claude compatibility
- 🔧 Helper scripts for n8n-agent CLI commands
- 📦 Build system for generating distributable skill packages
- 📚 Comprehensive documentation and installation guides
- ✨ Automatic node schema retrieval to prevent hallucination
- 🎯 Best practices and coding standards for n8n workflows
