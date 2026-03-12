---
sidebar_position: 4
title: Claude Plugin
description: Install n8n-as-code in Claude Code today via the custom store path, or use the local MCP server in Claude Desktop.
---

# Claude Plugin

> **Status:** Beta / Pending Review  
> The official Claude Code marketplace submission is still under review, so the recommended path today is the **alternative marketplace** hosted in this repository. For Claude Desktop, use the local MCP server below.

The `n8n-as-code` Claude Code plugin adds the `n8n-architect` skill and turns Claude into an n8n workflow expert.

The same repository now also exposes a local **MCP server** via `n8nac skills mcp`, so Claude Desktop and other MCP-compatible clients can use the offline n8n knowledge base immediately while the official store listing is pending.

The important point is that this stays **high-level for the user**. The user does not need to think in terms of TypeScript decorators, `n8nac skills search`, or exact node schemas. Those are implementation details used by the agent behind the scenes.

Typical requests look like this:

- `Create a workflow that watches new Typeform responses and sends them to Slack`
- `Add a Google Sheets node to the onboarding workflow`
- `Fix the error in the invoice workflow`
- `Update the AI agent workflow to use a memory node`

Claude then guides the user through initialization if needed, and uses `n8nac` commands such as `init`, `list`, `pull`, `push`, and `skills ...` internally to do the work safely.

## 🎯 What This Plugin Adds

Claude Code plugins can bundle skills, manifests, and marketplace metadata. In this case, the plugin provides:

1. **A plugin marketplace manifest** in `.claude-plugin/marketplace.json`
2. **A slim installable plugin root** in `plugins/claude/n8n-as-code/.claude-plugin/plugin.json`
3. **The `n8n-architect` skill** in `plugins/claude/n8n-as-code/skills/n8n-architect/SKILL.md`
4. **A local MCP server entrypoint** exposed by `npx --yes n8nac skills mcp`

This lets users install the plugin directly from GitHub through Claude Code today, or wire the same knowledge base into Claude Desktop through MCP, while keeping the CLI alias `n8nac` for the underlying commands.

## ✨ What the User Experiences

When installed, Claude can:

- ✅ Understand high-level workflow requests in natural language
- ✅ Guide the user through `n8nac init` if the workspace is not initialized yet
- ✅ Pull the current workflow state before editing
- ✅ Search exact nodes and schemas behind the scenes to avoid hallucinations
- ✅ Push verified changes back to n8n after local edits
- ✅ Fix existing workflow issues without making the user reason about internal TypeScript structure

## 🏗️ How It Works

```
User: "Add a Slack notification step to the lead intake workflow"
         ↓
Claude detects n8n context and loads the n8n-architect skill
         ↓
Claude checks whether the project is initialized and guides the user if needed
         ↓
Claude runs: n8nac list / pull / skills search / node-info as needed
         ↓
Claude edits the local `.workflow.ts` file with the correct schema-backed config
         ↓
Claude validates and pushes the workflow back to n8n
```

The user stays at the level of intent. The TypeScript workflow representation is an implementation detail that helps the agent make safe, reviewable edits.

## 📦 Plugin Source of Truth / Community Listing Metadata

The canonical public plugin repository is:

```text
https://github.com/EtienneLescot/n8n-as-code
```

For marketplace and directory submissions, this is the correct **Link to plugin** field because the repository hosts both the marketplace manifest at the root and the installable plugin package in `plugins/claude/n8n-as-code/`.

The public documentation page for the plugin is:

```text
https://etiennelescot.github.io/n8n-as-code/docs/usage/claude-skill/
```

This is the correct **Plugin homepage** field for submissions.

When submitting to community registries such as **Glama** or **MCP-get**, use:

- **Repository / source URL** → `https://github.com/EtienneLescot/n8n-as-code`
- **Installable plugin root** → `plugins/claude/n8n-as-code/`
- **Homepage / docs URL** → `https://etiennelescot.github.io/n8n-as-code/docs/usage/claude-skill/`
- **Current release channel** → `Beta / Pending Review`

The public privacy policy page for submissions is:

```text
https://etiennelescot.github.io/n8n-as-code/docs/usage/claude-plugin-privacy/
```

This is the correct **Privacy policy URL** field for marketplace submissions.

## 📦 Building the Plugin Assets

From the monorepo root:

```bash
npm run build:claude-plugin
```

This builds the skills package and regenerates the distributable adapter under `packages/skills/dist/adapters/claude/n8n-architect/`, plus the committed plugin artifact under `plugins/claude/n8n-as-code/skills/n8n-architect/`.

## 🚀 Installation

### Recommended Today: Claude Code (Alternative Marketplace)

This repository already ships the alternative marketplace manifest Claude Code expects, so the install can stay simple even while the official review is pending:

```text
/plugin marketplace add EtienneLescot/n8n-as-code
/plugin install n8n-as-code@n8nac-marketplace
```

That is the preferred Claude Code install path right now.

#### Why this is the right approach

- The repo root contains the marketplace manifest: `.claude-plugin/marketplace.json`
- The installable plugin payload lives at: `plugins/claude/n8n-as-code/`
- Users get the same two-step workflow they would use with any other Claude marketplace:
  1. add marketplace
  2. install plugin

#### After install: initialize your n8n workspace once

```bash
cd /path/to/your/n8n-project
npx --yes n8nac init
npx --yes n8nac update-ai
```

After that, restart Claude Code if needed and ask for an n8n workflow change.

### Fallback: Claude Code (Manual Skill Copy)

Use this only if the alternative marketplace flow above is unavailable in your environment.

1. **Clone the repository and build the Claude assets:**
   ```bash
   git clone https://github.com/EtienneLescot/n8n-as-code.git
   cd n8n-as-code
   npm install
   npm run build:claude-plugin
   ```

2. **Install the Claude skill into Claude Code:**
   ```bash
   mkdir -p ~/.claude/skills
   cp -r plugins/claude/n8n-as-code/skills/n8n-architect ~/.claude/skills/
   ```

3. **Restart Claude Code** and ask for an n8n workflow change.

#### Optional shortcut for the fallback path

If you only want the built skill files and not the repository checkout:

```bash
npm install
npm run build:claude-plugin
./packages/skills/dist/adapters/claude/install.sh
```

That script copies `n8n-architect/` into `~/.claude/skills/`.

### Claude Desktop / MCP (Custom Store)

Use the MCP server when you want Claude Desktop or another MCP-compatible client to access the local n8n knowledge base directly.

1. **Install the CLI once (global) or rely on `npx`:**
   ```bash
   npm install -g n8nac
   # or use: npx --yes n8nac skills mcp
   ```

2. **Add the server to `claude_desktop_config.json`:**
   ```json
   {
     "mcpServers": {
       "n8n-as-code": {
         "command": "npx",
         "args": ["--yes", "n8nac", "skills", "mcp"],
         "env": {
           "N8N_AS_CODE_PROJECT_DIR": "/absolute/path/to/your/n8n-project"
         }
       }
     }
   }
   ```

   `N8N_AS_CODE_PROJECT_DIR` is optional, but recommended when you want the server to pick up the correct `n8nac-config.json` and any `n8nac-custom-nodes.json` sidecar from your workspace.

3. **Optional: point Claude at an unreleased local knowledge base build**

   If you are testing a local checkout instead of the published package assets, also set:

   ```json
   {
     "N8N_AS_CODE_ASSETS_DIR": "/absolute/path/to/n8n-as-code/packages/skills/src/assets"
   }
   ```

4. **Initialize your n8n workspace once:**
   ```bash
   cd /absolute/path/to/your/n8n-project
   npx --yes n8nac init
   npx --yes n8nac update-ai
   ```

5. **Restart Claude Desktop** so it reloads the MCP server.

The MCP server exposes offline tools for:

- node and docs search
- full node schema lookup
- community workflow example search
- workflow validation from JSON or `.workflow.ts` content

### Later: Official Claude Code Marketplace Install

Once the official listing is approved, the user-facing install path stays effectively the same:

```text
/plugin marketplace add EtienneLescot/n8n-as-code
/plugin install n8n-as-code@n8nac-marketplace
```

Until then, prefer the alternative marketplace path above.

### For Claude Code CLI + Multi-Agent Setups (BMAD / GSD / planners)

If you use Claude Code from the terminal and hand work off between planning and coding agents, do **not** rely on a custom prompt alone. The recommended setup is:

1. Install the plugin from the marketplace.
2. Initialize the workspace with `n8nac` so the local project has `n8nac-config.json`.
3. Let `init-project` bootstrap the shared AI instructions automatically so the project root contains `AGENTS.md`.
4. Use `n8nac update-ai` later when you want to refresh that generated context after an upgrade or instance change.
5. Tell any planner/coder handoff file (for example `CLAUDE.md`) to read `AGENTS.md` and to use `n8nac skills` before writing workflow logic.

The important point is that **`AGENTS.md` is the standard instruction file generated by n8n-as-code**. It contains the schema-first workflow rules, sync protocol, and node lookup commands that prevent hallucinated nodes and empty configurations.

#### Recommended bootstrap sequence

In a Claude Code terminal session, Claude should collect the connection details from the user, then run the non-interactive `init-auth` / `init-project` steps itself.

```bash
# 1) Install the plugin in Claude Code
/plugin marketplace add EtienneLescot/n8n-as-code
/plugin install n8n-as-code@n8nac-marketplace

# 2) Ask the user for the n8n host + API key, then initialize auth non-interactively
# Option A (safer for the API key: keeps it out of shell history / process listings)
# export N8N_HOST="<your-n8n-url>"
# export N8N_API_KEY="<your-api-key>"
# npx --yes n8nac init-auth
#
# Option B (simpler, but less safe because the API key can appear in shell history / process listings)
# npx --yes n8nac init-auth --host <your-n8n-url> --api-key <your-api-key>

# 3) Select the project / sync folder (this bootstraps AGENTS.md automatically)
npx --yes n8nac init-project

# 4) Optional: refresh the shared agent instructions later
npx --yes n8nac update-ai
```

After that, verify that the workspace root contains:

- `n8nac-config.json`
- `AGENTS.md`

`AGENTS.md` is generated automatically during the init / project-selection flow. Run `n8nac update-ai` when you want to regenerate it explicitly after changing instances, upgrading `n8n-as-code`, or refreshing AI context files.

#### Optional `CLAUDE.md` shim for BMAD / GSD style agents

Some agent frameworks look for `CLAUDE.md` or a similar repo-level instruction file before they start planning or coding. In that case, keep the file short and make it delegate to `AGENTS.md` instead of duplicating n8n rules in multiple places:

```md
# Claude Code Project Instructions

For any n8n planning or implementation task in this repository:

1. Read `./AGENTS.md` before planning, coding, or reviewing.
2. Treat `./AGENTS.md` as mandatory and authoritative for all n8n-as-code behavior in this repo.
3. If `AGENTS.md` has not been read yet, stop and read it before continuing.
```

This keeps the handoff instructions small while ensuring the actual node rules, schema lookup steps, and sync protocol continue to come from `AGENTS.md`.

#### Best practices for planning + coding agent handoffs

- **Planner agents** should write PRDs/user stories in terms of validated node names and constraints, not imagined node parameters.
- **Coding agents** should repeat the schema lookup even if the planner already mentioned a node.
- **Review agents** should ask for the exact `n8nac skills search` / `node-info` output whenever a workflow seems suspicious.
- **Smaller models** are more likely to drift; if possible, use a stronger frontier model for workflow generation and keep subtasks narrow.

#### Quick troubleshooting

If an agent still hallucinates nodes or leaves them mostly empty, ask it to show:

1. The section of `AGENTS.md` it is following
2. The concrete schema-validation evidence required by `AGENTS.md`
3. Where in its plan or code it applied those `AGENTS.md` instructions

If it cannot show those three things, it is not yet using the n8n-as-code skill flow correctly.

### For Claude.ai (Web)

1. **Build and package:**
   ```bash
  npm run build:claude-plugin
  cd packages/skills/dist/adapters/claude
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

### Configure the CLI and Local Knowledge Base

Whether you use Claude Code or Claude Desktop, the underlying `n8nac` setup is the same:

```bash
npx --yes n8nac init
npx --yes n8nac list
npx --yes n8nac update-ai
```

- `n8nac init` saves the n8n host, API key, project selection, and sync folder
- `n8nac update-ai` refreshes `AGENTS.md` so local coding agents have the same n8n guidance as Claude
- `N8N_AS_CODE_ASSETS_DIR` can override the bundled knowledge base when you want Claude to use a local unreleased build

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

## ✅ Example User Requests

These are better examples than low-level schema questions, because they match how users actually talk to Claude.

### Create a workflow
```
"Create a workflow that reads new Stripe payments and posts a summary to Slack"
```
Expected: Claude guides initialization if needed, finds the right nodes, and creates the workflow.

### Update an existing workflow
```
"Add a Google Sheets node to the customer onboarding workflow"
```
Expected: Claude pulls the workflow if needed, edits the correct file, and updates routing safely.

### Fix a broken workflow
```
"Fix the error in the invoice reminder workflow"
```
Expected: Claude inspects the existing workflow, diagnoses invalid node config or AI wiring, and proposes or applies a fix.

### Refactor an AI workflow
```
"Update the support agent workflow to use memory and an OpenAI chat model"
```
Expected: Claude uses `.uses()` correctly for AI sub-nodes and keeps the workflow valid.

## 🔧 How the Plugin Works Internally

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

This ensures consistency between AGENTS.md for other coding agents and SKILL.md for Claude.

## 🔒 Security

- ✅ Runs 100% locally (no external servers)
- ✅ Uses NPX to execute `n8nac skills`
- ✅ Open-source and auditable

## ✅ Submission Guidance

For the current plugin package, the safe marketplace submission choice is:

- `Claude Code`: yes
- `Claude Cowork`: only if you have explicitly tested and validated this plugin in Cowork

The repository and published docs currently describe a Claude Code plugin first, with a Claude Desktop MCP fallback while review is pending. Do not claim Cowork support in the submission unless you have verified the install and runtime behavior there.
- ⚠️ Requires Node.js and npm on the machine
- ⚠️ First run downloads `n8nac` via NPX

## 📚 Related Documentation

- [Skills CLI Usage](/docs/usage/skills) - The underlying CLI tool Claude uses behind the scenes
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

**Claude Desktop / MCP:**
- Validate the config JSON syntax
- Confirm `npx --yes n8nac skills mcp` starts without errors in a terminal
- If using project-specific custom nodes, set `N8N_AS_CODE_PROJECT_DIR`
- If using a local checkout, verify `N8N_AS_CODE_ASSETS_DIR` points to the generated assets directory

### NPX commands fail

- Install Node.js: https://nodejs.org/
- Verify: `npx --version`
- For Claude.ai: Check if code execution has network access in settings

### Claude doesn't use the plugin as expected

- Be explicit: "Using n8n-architect skill, help me..."
- Check the description field matches your use case
- Ensure YAML frontmatter is valid (run `npm run validate`)

## 📖 Next Steps

- Read [Skills CLI documentation](/docs/usage/skills) to understand the underlying tool
- See [Contribution Guide](/docs/contribution/skills) for development details
- Check [Troubleshooting](/docs/troubleshooting) for common issues
