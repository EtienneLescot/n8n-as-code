---
sidebar_position: 4
title: Claude Skill
description: Use the n8n Architect Claude Agent Skill to enable Claude AI to generate accurate n8n workflows
---

# Claude Agent Skill

The `@n8n-as-code/claude-skill` package provides an official [Claude Agent Skill](https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills) that transforms Claude into an n8n workflow expert.

## 🎯 What is a Claude Agent Skill?

Claude Agent Skills are filesystem-based packages that provide Claude with:

1. **Metadata** (always loaded): Name and description (~100 tokens)
2. **Instructions** (loaded on-demand): Guidance from SKILL.md (~5k tokens)
3. **Resources** (executed as needed): Scripts that run via bash (0 tokens, only output counts)

This architecture enables **progressive disclosure** - Claude only loads content when needed.

## ✨ What This Skill Does

When installed, Claude will:

- ✅ Search n8n nodes using `npx n8nac skills search`
- ✅ Retrieve exact node schemas using `npx n8nac skills node-info`
- ✅ Generate valid workflow JSON without hallucinating parameters
- ✅ Follow n8n best practices (modern expressions, Code node, no hardcoded credentials)

## 🏗️ How It Works

```
User: "Create an HTTP Request workflow"
         ↓
Claude detects n8n context (via skill description)
         ↓
Claude reads SKILL.md instructions
         ↓
Claude runs: npx n8nac skills search "http request"
         ↓
Claude runs: npx n8nac skills node-info "httpRequest"
         ↓
Claude generates workflow JSON using real schema
```

## 📦 Building the Skill

From the monorepo root:

```bash
cd packages/skills
npm run build:adapters
```

This generates `dist/adapters/claude/n8n-architect/`.

## 🚀 Installation

### For Claude.ai (Web)

1. **Build and package:**
   ```bash
   cd packages/skills
   npm run build:adapters
   cd dist/adapters/claude
   zip -r n8n-architect-skill.zip n8n-architect/
   ```

2. **Upload to Claude:**
   - Go to [claude.ai/settings/features](https://claude.ai/settings/features)
   - Find "Custom Skills"
   - Click "Upload Skill"
   - Select `n8n-architect-skill.zip`

3. **Verify:**
   Start a new chat and ask: "Can you help me with n8n?"
   
   Claude should acknowledge the n8n context automatically.

### For Claude Code (Desktop)

1. **Build and install:**
   ```bash
   cd packages/skills
   npm run build:adapters
   
   # Install globally
   mkdir -p ~/.claude/skills
   cp -r dist/adapters/claude/n8n-architect ~/.claude/skills/
   ```

2. **Restart Claude Code**

3. **Verify:**
   The skill loads automatically. Ask about n8n to test.

### For Claude API

When using the Claude API with the [`skills` beta](https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills/use-skills-with-the-claude-api):

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const response = await client.messages.create({
  model: 'claude-3-7-sonnet-20250219',
  max_tokens: 4096,
  betas: [
    'code-execution-2025-08-25',
    'skills-2025-10-02',
    'files-api-2025-04-14'
  ],
  container: {
    type: 'code_execution_2025_01',
    skills: ['n8n-architect']
  },
  messages: [{
    role: 'user',
    content: 'Create a workflow with an HTTP Request node'
  }]
});

console.log(response.content);
```

## ✅ Testing

Test with these prompts:

### Basic Recognition
```
"Help me create an n8n workflow"
```
Expected: Claude acknowledges n8n context

### Node Search
```
"I need to make an HTTP request in n8n"
```
Expected: Claude searches for HTTP Request node

### Schema Retrieval
```
"Show me the parameters for a Code node"
```
Expected: Claude fetches and displays schema

### Workflow Generation
```
"Create a webhook that calls the GitHub API"
```
Expected: Claude generates valid workflow JSON

## 🔧 How the Skill is Built

The skill reuses content from `@n8n-as-code/skills`'s `AiContextGenerator`:

```typescript
// Same content as getAgentsContent() from skills
const skillContent = `
## 🎭 Role: Expert n8n Engineer
You manage n8n workflows as **clean, version-controlled JSON**.

### 🔬 Research Protocol (MANDATORY)
Do NOT hallucinate node parameters. Use these tools:
- npx n8nac skills search "<term>"
- npx n8nac skills node-info "<nodeName>"
...
`;
```

This ensures consistency between AGENTS.md (for Cursor/Windsurf) and SKILL.md (for Claude).

## 🔒 Security

- ✅ Runs 100% locally (no external servers)
- ✅ Uses NPX to execute `n8nac skills`
- ✅ Open-source and auditable
- ⚠️ Requires Node.js and npm on the machine
- ⚠️ First run downloads `n8nac` via NPX

## 📚 Related Documentation

- [Skills CLI Usage](/docs/usage/skills) - The underlying CLI tool
- [Claude Agent Skills Docs](https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills) - Official Anthropic documentation
- [Contribution Guide](/docs/contribution) - Development guidelines

## 🐛 Troubleshooting

### Skill not loading

**Claude.ai:**
- Ensure you're on Pro/Team/Enterprise plan
- Check Settings → Features for the skill
- Try re-uploading the ZIP

**Claude Code:**
- Verify folder exists: `ls ~/.claude/skills/n8n-architect/`
- Check SKILL.md has YAML frontmatter
- Restart Claude Code

### NPX commands fail

- Install Node.js: https://nodejs.org/
- Verify: `npx --version`
- For Claude.ai: Check if code execution has network access in settings

### Claude doesn't use the skill

- Be explicit: "Using n8n-architect skill, help me..."
- Check the description field matches your use case
- Ensure YAML frontmatter is valid (run `npm run validate`)

## 📖 Next Steps

- Read [Skills CLI documentation](/docs/usage/skills) to understand the underlying tool
- See [Contribution Guide](/docs/contribution/skills) for development details
- Check [Troubleshooting](/docs/troubleshooting) for common issues
