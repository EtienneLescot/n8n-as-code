# @n8n-as-code/claude-skill

## 0.2.7

### Patch Changes

- Updated dependencies
  - @n8n-as-code/agent-cli@0.6.0

## 0.2.6

### Patch Changes

- Updated dependencies
  - @n8n-as-code/agent-cli@0.5.0

## 0.2.5

### Patch Changes

- Updated dependencies
  - @n8n-as-code/agent-cli@0.4.1

## 0.2.4

### Patch Changes

- Optimize agent-cli package and enable enriched index in VS Code extension

  - agent-cli: Reduced npm package size by 54% (68 MB → 31 MB) by removing src/assets/ from published files
  - vscode-extension: Now uses n8n-nodes-enriched.json with enhanced metadata (keywords, operations, use cases)

- Updated dependencies
  - @n8n-as-code/agent-cli@0.4.0

## 0.2.3

### Patch Changes

- -feat(agent-cli): AI-powered node discovery with enriched documentation

  - Add 119 missing LangChain nodes (Google Gemini, OpenAI, etc.)
  - Integrate n8n official documentation with smart scoring algorithm
  - Improve search with keywords, operations, and use cases
  - 641 nodes indexed (+23%), 911 documentation files (95% coverage)
  - Update dependencies to use enhanced agent-cli

- Updated dependencies
  - @n8n-as-code/agent-cli@0.3.0

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
