<div align="center">

# <img src="res/logo.png" alt="n8n-as-code" width="40" height="40"> n8n-as-code

### The AI Skill that gives your coding agent n8n superpowers.

**GitOps · AI Skills · TypeScript Workflows · VS Code**

[![CI](https://github.com/EtienneLescot/n8n-as-code/actions/workflows/ci.yml/badge.svg)](https://github.com/EtienneLescot/n8n-as-code/actions/workflows/ci.yml)
[![Documentation](https://github.com/EtienneLescot/n8n-as-code/actions/workflows/docs.yml/badge.svg)](https://etiennelescot.github.io/n8n-as-code/)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/etienne-lescot.n8n-as-code?label=VS%20Code&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=etienne-lescot.n8n-as-code)
[![npm: cli](https://img.shields.io/npm/v/@n8n-as-code/cli?label=cli&logo=npm)](https://www.npmjs.com/package/@n8n-as-code/cli)
[![npm: skills](https://img.shields.io/npm/v/@n8n-as-code/skills?label=skills&logo=npm)](https://www.npmjs.com/package/@n8n-as-code/skills)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)

<br>

<img src="res/n8n-as-code.gif" alt="n8n-as-code demo" width="800">

<br>

**Your AI agent doesn't just _read_ about n8n. It _knows_ n8n.**<br>
58 MB of pre-built knowledge — every node, every property, every option — embedded at install time.<br>
Zero external calls. Zero latency. Zero hallucination.

<br>

[**📖 Documentation**](https://etiennelescot.github.io/n8n-as-code/) · [**🚀 Getting Started**](https://etiennelescot.github.io/n8n-as-code/docs/getting-started) · [**🧠 AI Skills**](https://etiennelescot.github.io/n8n-as-code/docs/usage/skills)

</div>

---

## ⚡ Quick Start

<table>
<tr>
<td width="50%">

### 🎨 VS Code (visual)

```
1. Install extension from Marketplace
2. Click the n8n icon
3. Enter Host + API Key
4. Done.
```

[📥 Install Extension](https://marketplace.visualstudio.com/items?itemName=etienne-lescot.n8n-as-code)

</td>
<td width="50%">

### 🖥️ CLI (terminal)

```
1. npx n8nac init
2. Enter Host + API Key
3. Done.
```

No install needed — `npx` runs it directly.

</td>
</tr>
</table>

📖 [Full Getting Started Guide](https://etiennelescot.github.io/n8n-as-code/docs/getting-started)

---

## 🧠 AI Skills — What Your Agent Gets

> **Not a bridge. Not a proxy. A Skill.**<br>
> Pre-built knowledge that your AI agent carries with it — works in **Cursor, Cline, Windsurf, Copilot, Claude**, or any coding agent.

| | |
|:---|:---|
| 🧩 **537 n8n nodes** | 433 core + 104 AI/LangChain — every official node, nothing missing |
| 📋 **100% schema coverage** | 10,209 properties + 17,155 option values — your agent can't hallucinate parameters |
| 📚 **1,243 documentation pages** | 93% of nodes have linked docs — integrations, triggers, AI, hosting, code |
| 🔄 **7,702 workflow templates** | Full community library — searchable in ~5ms with FlexSearch |
| 🤖 **104 AI/LangChain nodes** | Agents, chains, LLMs, tools, memory, vector stores, retrievers |
| 💡 **170 pages with code examples** | Ready-to-use snippets extracted from official n8n docs |
| ✅ **Built-in validation** | Schema validation catches errors _before_ you push to production |

```bash
# Your agent can search nodes, docs, and templates instantly
npx n8nac skills search "send slack message when google sheet is updated"
npx n8nac skills node-info slack          # Full schema + docs + examples
npx n8nac skills examples search "AI agent"  # Search 7,702 templates
npx n8nac skills validate workflow.json   # Validate before deploying
```

### Claude Code Plugin

The CLI stays `n8nac`. The Claude-facing plugin name is **`n8n-as-code`** for clarity in plugin managers and marketplaces.

```bash
# Add the repository as a Claude plugin marketplace
/plugin marketplace add EtienneLescot/n8n-as-code

# Install the plugin from that marketplace
/plugin install n8n-as-code@n8nac-marketplace
```

This installs the `n8n-architect` skill under the `n8n-as-code` namespace while preserving `n8nac` as the CLI alias used in examples and automation.

---

## 🔀 GitOps for n8n

> **Manage your entire workflow lifecycle** — pull, edit, push, resolve conflicts, version with Git.

```
                pull         
┌──────────┐ ◄──────────── ┌───────────┐
│   n8n    │               │   Local   │
│ Instance │ ──────────── ►│   Files   │
└──────────┘     push      └───────────┘
                                 │
                             git commit
                                 │
                            ┌────▼────┐
                            │Git Repo │
                            └─────────┘
```

```bash
npx n8nac init                              # Connect your n8n instance
npx n8nac list                              # See sync status at a glance
npx n8nac fetch --all                       # Refresh remote state
npx n8nac pull <id>                         # Pull remote → local
npx n8nac push <id>                         # Push local → remote
npx n8nac resolve <id> --mode keep-current  # Explicit conflict resolution
```

**3-way merge** conflict detection · **Multi-instance** support · **Push-on-save** in VS Code

---

## 📝 TypeScript Workflows

> Convert n8n JSON workflows to **clean, type-safe TypeScript** with decorators.<br>
> Bidirectional — convert back to JSON anytime.

```typescript
import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({ id: 'abc123', name: 'Slack Notifier', active: true })
export class SlackNotifierWorkflow {

  @node()
  Trigger = {
    type: 'n8n-nodes-base.webhook',
    parameters: { path: '/notify', method: 'POST' },
    position: [250, 300]
  };

  @node()
  Slack = {
    type: 'n8n-nodes-base.slack',
    parameters: {
      resource: 'message',
      operation: 'post',
      channel: '#alerts',
      text: '={{ $json.message }}'
    },
    position: [450, 300]
  };

  @links([{ from: 'Trigger', to: 'Slack' }])
  connections = {};
}
```

```bash
n8nac convert workflow.json --format typescript              # JSON → TypeScript
n8nac convert-batch workflows/ --format typescript           # Bulk convert to TypeScript
n8nac pull <id> > workflow.json && n8nac convert workflow.json --format typescript  # Pull then convert to TypeScript
```

**Why TypeScript?** → Better diffs in Git · Type safety · IntelliSense · Much easier for AI to read & edit

---

## 🎨 VS Code Extension

> **Visual editing without leaving your IDE.** A dedicated sidebar, embedded n8n canvas, and one-click sync.

1. Install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=etienne-lescot.n8n-as-code)
2. Click the **n8n** icon in the Activity Bar
3. Configure your instance → Start editing

> ℹ️ **Workspace required**: Open a folder or a `.code-workspace` before running **Initialize n8n as code**.  
> The extension needs an active workspace to index files and settings.

**What you get:**
- 📂 **Workflow sidebar** — browse all local & remote workflows with sync status
- 🖼️ **Embedded n8n canvas** — visual split-view editing
- ☁️ **One-click push/pull** — sync workflows without touching the terminal
- ⚡ **Push-on-save** — auto-deploy when you save
- 🔀 **Conflict resolution UI** — visual merge conflicts

---

## 📦 Packages

| Package | What it does | Install |
|:--------|:-------------|:--------|
| **[n8nac](packages/cli)** | CLI — sync, convert, validate, search | `npx n8nac` |
| **[VS Code Extension](packages/vscode-extension)** | Visual UI — sidebar, canvas, push-on-save | [Marketplace](https://marketplace.visualstudio.com/items?itemName=etienne-lescot.n8n-as-code) |
| **[@n8n-as-code/skills](packages/skills)** | AI Skill — knowledge base, search, schemas | `npm i @n8n-as-code/skills` |
| **[@n8n-as-code/transformer](packages/transformer)** | JSON ↔ TypeScript converter | `npm i @n8n-as-code/transformer` |

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    User Interfaces                        │
│                                                          │
│   🖥️ CLI (n8nac)          🎨 VS Code Extension           │
│   sync · convert · search    canvas · sidebar · push      │
└────────────┬──────────────────────┬───────────────────────┘
             │                      │
┌────────────▼──────────────────────▼───────────────────────┐
│                    Core Services                          │
│                                                          │
│   🔀 Sync Engine          📝 Transformer                  │
│   3-way merge · conflicts    JSON ↔ TypeScript            │
└────────────┬──────────────────────────────────────────────┘
             │
┌────────────▼──────────────────────────────────────────────┐
│                    🧠 AI Skills Layer                      │
│                                                          │
│   537 nodes · 10,209 properties · 1,243 docs · 7,702 wf  │
│   FlexSearch (~5ms) · Schema validation · Node info       │
└───────────────────────────────────────────────────────────┘
```

---

## 🤝 Contributing

Contributions welcome!

1. **Fork** the project
2. **Create a branch** (`git checkout -b feature/amazing`)
3. **Run tests** (`npm test`)
4. **Open a Pull Request**

---

## 📄 License

[Apache 2.0](LICENSE) — free to use, modify, and distribute.

---

<div align="center">

**If n8n-as-code saves you time, give us a ⭐ — it helps more than you think.**

[⭐ Star on GitHub](https://github.com/EtienneLescot/n8n-as-code) · [📖 Documentation](https://etiennelescot.github.io/n8n-as-code/) · [🐛 Report a Bug](https://github.com/EtienneLescot/n8n-as-code/issues)

</div>
