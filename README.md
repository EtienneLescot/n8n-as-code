# <img src="res/logo.png" alt="n8n-as-code logo" width="32" height="32"> n8n-as-code

[![CI](https://github.com/EtienneLescot/n8n-as-code/actions/workflows/ci.yml/badge.svg)](https://github.com/EtienneLescot/n8n-as-code/actions/workflows/ci.yml)
[![Documentation](https://github.com/EtienneLescot/n8n-as-code/actions/workflows/docs.yml/badge.svg)](https://etiennelescot.github.io/n8n-as-code/)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/etienne-lescot.n8n-as-code?label=VS%20Code&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=etienne-lescot.n8n-as-code)
[![npm: cli](https://img.shields.io/npm/v/@n8n-as-code/cli?label=cli&logo=npm)](https://www.npmjs.com/package/@n8n-as-code/cli)
[![npm: skills](https://img.shields.io/npm/v/@n8n-as-code/skills?label=skills&logo=npm)](https://www.npmjs.com/package/@n8n-as-code/skills)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **⚠️ BREAKING CHANGE**: Local workflows are now stored as **TypeScript files** (`.workflow.ts`) instead of JSON. This provides better readability, type safety, and AI compatibility. See the [TypeScript Workflows Guide](https://etiennelescot.github.io/n8n-as-code/docs/usage/typescript-workflows) for details.

<div align="center">
  <img src="res/n8n-as-code.gif" alt="n8n-as-code demo" width="800">
</div>

**Manage your n8n workflows as code.** Version control with Git, AI-assisted editing, and seamless VS Code integration.

📖 **[Full Documentation](https://etiennelescot.github.io/n8n-as-code/)** | **[Getting Started Guide](https://etiennelescot.github.io/n8n-as-code/docs/getting-started)**

---

## ⚡ Quick Start

Choose your interface:

### 🎨 **Option 1: VS Code Extension** (Visual interface)

1. Install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=etienne-lescot.n8n-as-code)
2. Click the **n8n** icon in the Activity Bar
3. Configure your instance (Host + API Key)
4. Start editing your workflows visually!

📖 [Full extension documentation](https://etiennelescot.github.io/n8n-as-code/docs/usage/vscode-extension)


### 🖥️ **Option 2: CLI** (Command-line interface)

```bash
# Installation from source
npm install && npm run build && npm link

# Or install from NPM
npm install -g @n8n-as-code/cli

# Configuration
n8nac init

# Switch project (optional)
n8nac switch

# Sync your workflows
n8nac pull

# Git-like sync workflow
n8nac list                    # See all workflows and their status
n8nac fetch <workflowId>      # Update remote state for a workflow
n8nac pull --id <workflowId>  # Pull remote changes
n8nac push --id <workflowId>  # Push local changes
```

📖 [Full CLI documentation](https://etiennelescot.github.io/n8n-as-code/docs/usage/cli)

---

📖 [AI features documentation](https://etiennelescot.github.io/n8n-as-code/docs/usage/skills)

---

## 📦 Ecosystem Packages

### 🎯 User Interfaces

| Package | Description | Links |
|---------|-------------|-------|
| **[@n8n-as-code/cli](packages/cli)** | Command-line interface for workflow sync | [📖 Docs](https://etiennelescot.github.io/n8n-as-code/docs/usage/cli) · [📦 NPM](https://www.npmjs.com/package/@n8n-as-code/cli) |
| **[vscode-extension](packages/vscode-extension)** | Visual interface for VS Code | [📖 Docs](https://etiennelescot.github.io/n8n-as-code/docs/usage/vscode-extension) · [📥 Marketplace](https://marketplace.visualstudio.com/items?itemName=etienne-lescot.n8n-as-code) |

### 🧩 Core & AI Packages

| Package | Description | Links |
|---------|-------------|-------|
| **[@n8n-as-code/skills](packages/skills)** | AI tools (search, schemas, validation) for agents | [📖 Docs](https://etiennelescot.github.io/n8n-as-code/docs/usage/skills) · [📦 NPM](https://www.npmjs.com/package/@n8n-as-code/skills) |
| **[@n8n-as-code/claude-skill](packages/claude-skill)** | Official Claude AI agent skill | [📖 Docs](https://etiennelescot.github.io/n8n-as-code/docs/usage/claude-skill) · [📦 NPM](https://www.npmjs.com/package/@n8n-as-code/claude-skill) |

---

## ✨ Key Features

### 🔄 **Git-like Sync**
Explicit, command-driven synchronization with git-like workflow: list, fetch, pull, push. No automatic polling - you control when to sync with clear status visibility.

### 🎨 **VS Code Integration**
Visual workflow management with embedded n8n canvas, status indicators, and push-on-save functionality.

### 🤖 **AI Superpowers**
- **1246+ documentation pages** indexed for AI agents
- **Node schemas** to prevent parameter hallucination
- **7000+ community workflows** searchable database
- **Claude Agent Skill** for Claude AI integration

### 🛡️ **Smart Conflict Resolution**
3-way merge architecture with interactive conflict resolution UI.

### 🌐 **Multi-Instance Support**
Isolate workflows from different n8n environments automatically.

### 📝 **TypeScript Workflows** (New!)
Transform your workflows into type-safe, readable TypeScript with decorators:

```typescript
import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({ 
  id: 'abc123', 
  name: 'My Workflow', 
  active: true 
})
export class MyWorkflowWorkflow {
  @node()
  Start = {
    type: 'n8n-nodes-base.manualTrigger',
    parameters: {},
    position: [250, 300]
  };

  @node()
  HttpRequest = {
    type: 'n8n-nodes-base.httpRequest',
    parameters: {
      url: 'https://api.example.com/data',
      method: 'GET'
    },
    position: [450, 300]
  };

  @links([
    { from: 'Start', to: 'HttpRequest' }
  ])
  connections = {};
}
```

**Benefits:**
- ✨ **Better readability** - Clean, maintainable structure with decorators
- 🔒 **Type safety** - TypeScript catches errors before deployment  
- 🎨 **IDE support** - IntelliSense, autocomplete, and refactoring
- 🔄 **Bidirectional** - Convert JSON ↔ TypeScript seamlessly
- 🤖 **AI-friendly** - Easier for LLMs to understand and edit

**Quick Commands:**
```bash
# Convert JSON workflow to TypeScript
n8nac convert workflow.json

# Convert directory of workflows
n8nac convert-batch workflows/

# Pull workflows as TypeScript (requires sync package update)
n8nac pull --format typescript
```

📖 [Full TypeScript Workflows Guide](https://etiennelescot.github.io/n8n-as-code/docs/usage/typescript-workflows)

---

## 🎯 Common Use Cases

| Use Case | Quick Command | Learn More |
|----------|---------------|------------|
| **Sync workflows** | `n8nac list` → `fetch` → `pull`/`push` | [Usage Guide](https://etiennelescot.github.io/n8n-as-code/docs/usage/cli) |
| **AI workflow creation** | `n8nac-skills search "google sheets"` | [Skills CLI Guide](https://etiennelescot.github.io/n8n-as-code/docs/usage/skills) |
| **Visual editing** | Install [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=etienne-lescot.n8n-as-code) | [Extension Guide](https://etiennelescot.github.io/n8n-as-code/docs/usage/vscode-extension) |
| **Version control** | Git commit workflow JSON files | [Getting Started](https://etiennelescot.github.io/n8n-as-code/docs/getting-started) |

---

## 🏗 Architecture

This is a **monorepo** with specialized packages organized in layers:

### 👥 **User Interfaces** (consume shared packages)
- **[`cli`](packages/cli)**: Command-line interface
- **[`vscode-extension`](packages/vscode-extension)**: Visual editing in VS Code

### ⚙️ **Core Services** (embedded in `cli`)
- **sync engine** (in `cli/src/core`): 3-way merge synchronization engine & state management

### 🤖 **AI Tooling** (for agents & automation)
- **[`skills`](packages/skills)**: Node search, schemas, validation (consumed by CLI, extension, and AI agents)
- **[`claude-skill`](packages/claude-skill)**: Packaged skill for Claude AI

Each package has detailed documentation in its README and the [online docs](https://etiennelescot.github.io/n8n-as-code/).

---

## 🤝 Contribution

Contributions are welcome!

1.  **Fork** the project.
2.  **Clone** your fork locally.
3.  **Create a branch** for your feature (`git checkout -b feature/AmazingFeature`).
4.  **Ensure tests pass** (`npm test`).
5.  **Commit** your changes (`git commit -m 'Add some AmazingFeature'`).
6.  **Push** to the branch (`git push origin feature/AmazingFeature`).
7.  **Open a Pull Request**.

---

## 📄 License
MIT
