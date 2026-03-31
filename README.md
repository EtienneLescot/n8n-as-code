<div align="center">

# <img src="res/logo.png" alt="n8n-as-code" width="40" height="40"> n8n-as-code

### The AI Skill that gives your coding agent n8n superpowers.

**GitOps · AI Skills · TypeScript Workflows · VS Code · Claude Code · OpenClaw**

[![CI](https://github.com/EtienneLescot/n8n-as-code/actions/workflows/ci.yml/badge.svg)](https://github.com/EtienneLescot/n8n-as-code/actions/workflows/ci.yml)
[![Documentation](https://github.com/EtienneLescot/n8n-as-code/actions/workflows/docs.yml/badge.svg)](https://n8nascode.dev/)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/etienne-lescot.n8n-as-code?label=VS%20Code&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=etienne-lescot.n8n-as-code)
[![Open VSX](https://img.shields.io/open-vsx/v/etienne-lescot/n8n-as-code?label=Open%20VSX&logo=eclipseide)](https://open-vsx.org/extension/etienne-lescot/n8n-as-code)
[![npm: cli](https://img.shields.io/npm/v/@n8n-as-code/cli?label=cli&logo=npm)](https://www.npmjs.com/package/@n8n-as-code/cli)
[![npm: skills](https://img.shields.io/npm/v/@n8n-as-code/skills?label=skills&logo=npm)](https://www.npmjs.com/package/@n8n-as-code/skills)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Beta%20%2F%20Pending%20Review-orange)](https://n8nascode.dev/docs/usage/claude-plugin/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

<br>

<img src="res/n8n-as-code.gif" alt="n8n-as-code demo" width="800">

<br>

**Your AI agent doesn't just _read_ about n8n. It _knows_ n8n.**<br>
An installable ontology for n8n — every node, every property, every option, and the relationships between them — embedded at install time.<br>
Zero external calls. Zero latency. Zero hallucination.

<br>

[**📖 Documentation**](https://n8nascode.dev/) · [**🚀 Getting Started**](https://n8nascode.dev/docs/getting-started/) · [**🧠 AI Skills**](https://n8nascode.dev/docs/usage/skills/)

</div>

---

> **⚠ n8n version compatibility** — The node schema bundled with n8n-as-code is built against the **latest stable release of n8n**. For best results, keep your n8n instance up to date. Using an outdated instance may cause generated workflows to reference node type-versions not yet supported by your instance, which n8n renders as broken nodes in the canvas.

---

## ⚡ Quick Start

Choose the entry point that matches how you already work.

<table>
<tr>
<td width="50%" valign="top">

### 💻 VS Code / Cursor
Visual workflow view inside the editor.

**Best for:** VS Code, Cursor, Windsurf, Antigravity

**Setup**  
Install from the VS Code Marketplace or Open VSX.  
Open the `n8n` view.  
Open `n8n: Configure`, enter the URL and API key of your existing n8n instance, load the project, then save and activate the config.

[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=etienne-lescot.n8n-as-code) · [Open VSX](https://open-vsx.org/extension/etienne-lescot/n8n-as-code)

</td>
<td width="50%" valign="top">

### ✴️ Claude Code

Plugin-driven workflow work with Claude.

**Best for:** agent-led editing with marketplace install

**Run**  
<code>/plugin marketplace add <wbr>EtienneLescot/n8n-as-code</code><br>
<code>/plugin install <wbr>n8n-as-code@n8nac-marketplace</code><br>
.

[Claude setup docs](https://n8nascode.dev/docs/usage/claude-plugin/)

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🦞 OpenClaw

OpenClaw-native plugin and workspace bootstrap flow.

**Best for:** OpenClaw users who want built-in grounding and setup

**Run**  
<code>openclaw plugins install <wbr>@n8n-as-code/n8nac</code><br>
<code>openclaw n8nac:setup</code><br>
<code>openclaw gateway restart</code>

[OpenClaw setup docs](https://n8nascode.dev/docs/usage/openclaw/)

</td>
<td width="50%" valign="top">

<h3><img src="res/yagr-logo.png" alt="Yagr" height="20" style="vertical-align:middle"> Yagr</h3>

Guided onboarding, persistent runtime, cleanest path into n8n-as-code.

**Best for:** fastest setup, agent-first workflow, shared runtime across tools

**Run**  
<code>npm install -g @yagr/agent@latest</code><br>
<code>yagr onboard</code>

[Yagr docs](https://yagr.dev) · [Yagr repository](https://github.com/EtienneLescot/yagr)

</td>
</tr>
</table>

> **Then simply tell your agent what you want to do with your n8n workflows.**
> Build new flows, update existing ones, search nodes and templates, validate changes, pull from n8n, push updates, and keep everything in sync.

### New: Agents can now complete the runtime loop

`n8n-as-code` now removes a major source of friction in AI-assisted workflow development.

An agent can now:

- detect which credentials a workflow is missing after a push
- ask the user only for the secret values it cannot infer
- provision those credentials without bouncing back to the n8n UI
- activate the workflow once provisioning is complete
- execute webhook, chat, and form workflows on the user's behalf
- inspect the resulting execution directly from n8n when the run fails on the server side

From a user point of view, this is a major step forward: the agent is no longer limited to editing workflow code. It can now help drive the workflow all the way to a real execution, then debug what happened using the execution data returned by n8n.

Detailed commands live in the [CLI guide](https://n8nascode.dev/docs/usage/cli/).

### ⌨️ CLI

Explicit terminal-first workflow for sync and automation.

**Best for:** scripts, CI, GitOps pipelines, direct workflow operations

**Run**  
<code>npx --yes n8nac init</code>

[Full Getting Started Guide](https://n8nascode.dev/docs/getting-started/)

---
## MCP Clients (Claude Desktop) :

If you are using Claude Desktop or another MCP client, point it at the local MCP server with:

```json
{
  "mcpServers": {
    "n8n-as-code": {
      "command": "npx",
      "args": ["--yes", "n8nac", "skills", "mcp"]
    }
  }
}
```

Initialize your workspace first so it has both the sync config and AI context it needs:

```bash
npx --yes n8nac init
npx --yes n8nac update-ai
```

---

## 🧠 AI Skills — What Your Agent Gets

> **Not a bridge. Not a proxy. A Skill.**<br>
> Pre-built knowledge that your AI agent carries with it — works in **Cursor, Cline, Windsurf, Copilot, Claude**, or any coding agent.

In 2026 AI tooling language, this layer is increasingly described as an **ontology**: a structured domain map that tells an agent what exists, how it fits together, and which actions are valid. That is exactly what `n8n-as-code` ships for n8n.

| | |
|:---|:---|
| 🧩 **537 n8n nodes** | 433 core + 104 AI/LangChain — every official node, nothing missing |
| 📋 **100% schema coverage** | 10,209 properties + 17,155 option values — the ontology stays grounded in the real schema |
| 📚 **1,243 documentation pages** | 93% of nodes have linked docs — integrations, triggers, AI, hosting, code |
| 🔄 **7,702 workflow templates** | Full community library — searchable in ~5ms with FlexSearch |
| 🤖 **104 AI/LangChain nodes** | Agents, chains, LLMs, tools, memory, vector stores, retrievers |
| 💡 **170 pages with code examples** | Ready-to-use snippets extracted from official n8n docs |
| ✅ **Built-in validation** | Schema validation catches errors _before_ you push to production |

```bash
# Your agent can search nodes, docs, and templates instantly
npx --yes n8nac skills search "send slack message when google sheet is updated"
npx --yes n8nac skills node-info slack          # Full schema + docs + examples
npx --yes n8nac skills examples search "AI agent"  # Search 7,702 templates
npx --yes n8nac skills validate workflow.json   # Validate before deploying
```

Claude Code uses the same `n8nac` CLI and ships the `n8n-architect` skill through the `n8n-as-code` plugin, so natural-language workflow work and terminal automation stay aligned around the same n8n ontology.

### Community Workflow Sources

`n8n-as-code` ships a searchable index of public community workflow metadata and downloads the workflow JSON on demand when an agent or user explicitly requests it.

The current community workflow catalog is built from [nusquama/n8nworkflows.xyz](https://github.com/nusquama/n8nworkflows.xyz). As in the upstream archive, each workflow keeps its original license and users should refer to the original workflow metadata and source page for license details. The repository structure and indexing logic in `n8n-as-code` remain licensed under the [MIT License](LICENSE).

Thanks to the `n8nworkflows.xyz` project for maintaining the public archive that makes this search experience possible.

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
npx n8nac init                              # Save an instance config and select a project
npx n8nac list                              # See sync status at a glance
npx n8nac pull <id>                         # Pull remote → local
npx n8nac push my-workflow.workflow.ts      # Push local → remote
npx n8nac resolve <id> --mode keep-current  # Explicit conflict resolution
```

**3-way merge** conflict detection · **Multi-instance** support

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

**Why TypeScript?** → Better diffs in Git · Better readability in editors · Much easier for AI to read & edit

---

## 🎨 VS Code / Cursor Extension

> **Visual editing without leaving your IDE.** A dedicated sidebar, embedded n8n canvas, and one-click sync.

1. Install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=etienne-lescot.n8n-as-code) or [OpenVSX Marketplace](https://open-vsx.org/extension/etienne-lescot/n8n-as-code)
2. Click the **n8n** icon in the Activity Bar
3. Open **n8n: Configure**, add an instance, load the project, then **Save and activate config**

You can keep multiple saved instance configs in the same workspace and switch which one is active when needed.

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
| **[@n8n-as-code/n8nac](plugins/openclaw/n8n-as-code)** | OpenClaw plugin — setup wizard, prompt context, workflow operations | `openclaw plugins install @n8n-as-code/n8nac` |
| **[@n8n-as-code/skills](packages/skills)** | AI Skill — knowledge base, search, schemas | `npm i @n8n-as-code/skills` |
| **[@n8n-as-code/transformer](packages/transformer)** | JSON ↔ TypeScript converter | `npm i @n8n-as-code/transformer` |

---

## 🏗 Architecture

```
+------------------------------------------------------------------+
|                         User Interfaces                          |
|                                                                  |
|  [CLI]        [VS Code]        [Claude Code]      [OpenClaw]     |
|  sync/search  canvas/sidebar   plugin workflow    plugin workflow |
+-------------------+----------------------+-----------------------+
                    |                      |
                    v                      v
+-------------------+----------------------+-----------------------+
|                          Core Services                          |
|                                                                  |
|  [Sync Engine]                 [Transformer]                     |
|  3-way merge / conflicts       JSON <-> TypeScript              |
+-------------------------------+----------------------------------+
                                |
                                v
+------------------------------------------------------------------+
|                           AI Skills Layer                        |
|                                                                  |
|  537 nodes / 10,209 properties / 1,243 docs / 7,702 workflows    |
|  FlexSearch (~5ms) / Schema validation / Node info / examples    |
+------------------------------------------------------------------+
```

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=EtienneLescot/n8n-as-code&type=date&legend=top-left)](https://www.star-history.com/#EtienneLescot/n8n-as-code&type=date&legend=top-left)

---

## 🤝 Contributing

Contributions welcome!

1. **Fork** the project
2. **Create a branch** (`git checkout -b feature/amazing`)
3. **Run tests** (`npm test`)
4. **Open a Pull Request**

---

## 📄 License

[MIT License](LICENSE) — free to use, modify, and distribute.

Third-party community workflow metadata and downloadable workflow files remain subject to their respective upstream licenses.

---

## Acknowledgements

`n8n-as-code` exists because [n8n](https://n8n.io/) exists.
Thanks to the n8n team and community for building and maintaining the workflow automation platform this project builds on.
If you use this project, consider starring the [n8n repository](https://github.com/n8n-io/n8n).

---

<div align="center">

**If n8n-as-code saves you time, give us a ⭐ — it helps more than you think.**

[⭐ Star on GitHub](https://github.com/EtienneLescot/n8n-as-code) · [📖 Documentation](https://n8nascode.dev/) · [🐛 Report a Bug](https://github.com/EtienneLescot/n8n-as-code/issues)

</div>
