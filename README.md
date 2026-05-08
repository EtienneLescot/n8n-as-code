<div align="center">

# <img src="res/logo.png" alt="n8n-as-code" width="40" height="40"> n8n-as-code

### The n8n IDE for AI agents.

**VS Code / Cursor Agent · n8n-manager · GitOps · AI Skills · TypeScript Workflows**

[![CI](https://github.com/EtienneLescot/n8n-as-code/actions/workflows/ci.yml/badge.svg)](https://github.com/EtienneLescot/n8n-as-code/actions/workflows/ci.yml)
[![Documentation](https://github.com/EtienneLescot/n8n-as-code/actions/workflows/docs.yml/badge.svg)](https://n8nascode.dev/)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/etienne-lescot.n8n-as-code?label=VS%20Code&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=etienne-lescot.n8n-as-code)
[![Open VSX](https://img.shields.io/open-vsx/v/etienne-lescot/n8n-as-code?label=Open%20VSX&logo=eclipseide)](https://open-vsx.org/extension/etienne-lescot/n8n-as-code)
[![npm: cli](https://img.shields.io/npm/v/n8nac?label=cli&logo=npm)](https://www.npmjs.com/package/n8nac)
[![npm: skills](https://img.shields.io/npm/v/@n8n-as-code/skills?label=skills&logo=npm)](https://www.npmjs.com/package/@n8n-as-code/skills)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Beta%20%2F%20Pending%20Review-orange)](https://n8nascode.dev/docs/usage/claude-plugin/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

<br>

<img src="res/n8n-as-code-intro.gif" alt="n8n-as-code intro" width="800">

<br>

**Build, edit, deploy, and debug n8n workflows from your editor with an agent that has live n8n context.**<br>
V2 ships an integrated VS Code/Cursor Agent, real instance management through `n8n-manager`, and the same grounded n8n knowledge across CLI, MCP, Claude Code, and OpenClaw.

<br>

[**Documentation**](https://n8nascode.dev/) · [**Getting Started**](https://n8nascode.dev/docs/getting-started/) · [**VS Code Guide**](https://n8nascode.dev/docs/usage/vscode-extension/) · [**n8n-manager Guide**](https://n8nascode.dev/docs/usage/n8n-manager/)

</div>

---

> **Using V1?** V2 is now the default release line. Start with the [V1 to V2 migration guide](https://n8nascode.dev/docs/migration/v1-to-v2/) and run `n8nac workspace migrate-v1` before changing workspace config. V1 users can keep using the legacy branch and packages: [V1 branch](https://github.com/EtienneLescot/n8n-as-code/tree/v1) · CLI: `npx --yes n8nac@v1 <command>` · Claude Code: `/plugin marketplace add https://github.com/EtienneLescot/n8n-as-code#v1`. The VS Code/OpenVSX listing now follows V2; see [VS Code / Cursor V1 legacy](#vs-code--cursor-v1-legacy) before installing the editor extension.

> **⚠ n8n version compatibility** — The node schema bundled with n8n-as-code is built against the **latest stable release of n8n**. For best results, keep your n8n instance up to date. Using an outdated instance may cause generated workflows to reference node type-versions not yet supported by your instance, which n8n renders as broken nodes in the canvas.

> **Independent project** — n8n-as-code is an independent community project and is not affiliated with, endorsed by, or sponsored by n8n.

---

## Quick Start

Choose the entry point that matches where you want to work with n8n.

### VS Code / Cursor

This is the recommended path for day-to-day workflow work. The extension adds the VS Code-specific experience: an n8n sidebar, an integrated workflow UI, and an integrated agent.

Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=etienne-lescot.n8n-as-code) or [Open VSX](https://open-vsx.org/extension/etienne-lescot/n8n-as-code), open the `n8n` view, then click on `Configure`. The setup is graphical: choose a managed local n8n instance, connect an existing instance, or stay in generation-only mode.

[VS Code / Cursor guide](https://n8nascode.dev/docs/usage/vscode-extension/)

#### VS Code / Cursor V1 Legacy

The VS Code Marketplace and Open VSX listings now follow the V2 release line. If you still need the V1 editor extension, do not install from Marketplace/OpenVSX. Install the legacy VSIX from GitHub Releases instead.

1. Download `n8n-as-code-v1.46.1-legacy.vsix` from the [v1.46.1-legacy GitHub release](https://github.com/EtienneLescot/n8n-as-code/releases/tag/v1.46.1-legacy).
2. Install the downloaded VSIX manually:

```bash
code --install-extension n8n-as-code-v1.46.1-legacy.vsix
```

3. Disable auto-updates for the `n8n-as-code` extension in VS Code/Cursor so it does not upgrade itself back to V2.
4. Keep all V1 CLI commands pinned to `n8nac@v1`:

```bash
npx --yes n8nac@v1 <command>
```

The legacy VSIX was built to generate agent commands pinned to `n8nac@v1`, avoiding accidental execution of the V2 CLI through `npx --yes n8nac`.

### Claude Code

Use the Claude Code plugin when you want Claude to create, update, validate, or debug n8n workflows with the bundled n8n skills.

```text
/plugin marketplace add https://github.com/EtienneLescot/n8n-as-code
/plugin install n8n-as-code@n8nac-marketplace
```

[Claude setup docs](https://n8nascode.dev/docs/usage/claude-plugin/)

### Generic Agent Skills

For OpenCode, Codex, Hermes, OpenClaw, or any other AI agent, install the n8n-as-code skills from the repository skills directory:

```text
https://github.com/EtienneLescot/n8n-as-code/tree/main/skills
```

If your agent asks for explicit skill paths, use `skills/n8n-manager` and `skills/n8n-architect`. The same skill content is also packaged on npm as [`@n8n-as-code/skills`](https://www.npmjs.com/package/@n8n-as-code/skills) for `n8nac` and runtime usage.

Once the skills are available, ask your agent to initialize n8n-as-code in the workspace. The agent can then run the required setup itself: generate `AGENTS.md`, configure the workspace, and use the local n8n context.

Agents can then use commands such as:

```bash
npx --yes n8nac skills search "send slack message when google sheet is updated"
npx --yes n8nac skills node-info slack
npx --yes n8nac skills validate workflows/my-workflow.workflow.ts
```

[Skills reference](https://n8nascode.dev/docs/usage/skills/)

### CLI / CI

Use the CLI in scripts and CI when you need repeatable validation, sync, or deployment checks without opening an editor.

```bash
npx --yes n8nac skills validate workflows/my-workflow.workflow.ts
npx --yes n8nac push workflows/instance/project/my-workflow.workflow.ts --verify
npx --yes n8nac verify <workflow-id>
```

[CLI guide](https://n8nascode.dev/docs/usage/cli/) · [n8n-manager guide](https://n8nascode.dev/docs/usage/n8n-manager/)

> Then tell your agent what you want to do with n8n.
> It can use the current workflow, selected node, n8n instance, and workspace context to create flows, edit nodes, search docs and templates, push changes, provision missing credentials, run supported workflows, and inspect executions.

### What changed in V2

- **Integrated VS Code Agent** — the extension now includes an Agent Workbench that understands the selected workflow, selected node, active instance, project, and local workspace.
- **`n8n-manager` runtime foundation** — instance registration, API keys, managed local runtimes, project selection, credential readiness, deployment, execution, and inspection use the same runtime layer across surfaces.
- **Split runtime/workspace config** — `n8n-manager` stores global instances and API keys, while `n8nac-config.json` stores repository-local overrides such as pinned instance, project, and sync folder.
- **V1 migration command** — `n8nac workspace migrate-v1` detects legacy workspace config, shows a dry-run summary, backs up the old file, and migrates safe workspace overrides.
- **VS Code workspace agents** — `n8nac update-ai` now writes `.github/agents/*.agent.md` for VS Code/GitHub Copilot-compatible agents, plus portable skill fallbacks for other runtimes.
- **One grounded workflow loop** — local files, n8n schema knowledge, docs, templates, validation, push/pull, credential setup, activation, test execution, and execution inspection are available from the same product flow.

### Prereleases

Stable docs and examples use npm `latest` and the default plugin marketplace branch. To test prerelease builds from `next`, keep every entry point on the same prerelease line:

```text
/plugin marketplace add https://github.com/EtienneLescot/n8n-as-code#next
/plugin install n8n-as-code@n8nac-marketplace
```

```bash
npx --yes n8nac@next <command>
npx --yes @n8n-as-code/n8n-manager@next <command>
openclaw plugins install @n8n-as-code/n8nac@next
```

Do not mix the `next` Claude/OpenClaw plugin payload with `n8nac@latest`: prerelease skills may rely on commands that are not available in the stable CLI yet.

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
n8n-manager auth set --url <url> --api-key-stdin
n8n-manager projects select <project-id-or-name>
npx --yes n8nac workspace set-sync-folder workflows
npx --yes n8nac update-ai
```

---

## AI Skills: What Your Agent Gets

> **Not a bridge. Not a proxy. A Skill.**<br>
> Pre-built knowledge that your AI agent carries with it — works in **Cursor, Cline, Windsurf, Copilot, Claude**, or any coding agent.

The skills layer gives agents a grounded n8n map: what nodes exist, which parameters they accept, how workflows connect, which examples are relevant, and which operations are safe before pushing to a real instance.

| | |
|:---|:---|
| **537 n8n nodes** | 433 core + 104 AI/LangChain nodes |
| **100% schema coverage** | 10,209 properties + 17,155 option values grounded in the real schema |
| **1,243 documentation pages** | 93% of nodes have linked docs for integrations, triggers, AI, hosting, and code |
| **7,702 workflow templates** | Searchable community library with on-demand workflow downloads |
| **104 AI/LangChain nodes** | Agents, chains, LLMs, tools, memory, vector stores, and retrievers |
| **170 pages with code examples** | Ready-to-use snippets extracted from official n8n docs |
| **Built-in validation** | Schema validation catches errors before you push to production |

```bash
# Your agent can search nodes, docs, and templates instantly
npx --yes n8nac skills search "send slack message when google sheet is updated"
npx --yes n8nac skills node-info slack          # Full schema + docs + examples
npx --yes n8nac skills examples search "AI agent"  # Search 7,702 templates
npx --yes n8nac skills validate workflow.json   # Validate before deploying
```

Claude Code uses the same `n8n-manager` and `n8nac` CLIs and ships the `n8n-manager` and `n8n-architect` skills through the `n8n-as-code` plugin, so natural-language workflow work and terminal automation stay aligned around the same runtime and n8n knowledge.

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
n8n-manager auth set --url <url> --api-key-stdin
n8n-manager projects select <project-id-or-name>
npx n8nac workspace set-sync-folder workflows
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

## VS Code / Cursor Extension

> **The fastest V2 path:** editor sidebar, live n8n context, integrated Agent Workbench, embedded canvas, and one-click sync.

1. Install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=etienne-lescot.n8n-as-code) or [OpenVSX Marketplace](https://open-vsx.org/extension/etienne-lescot/n8n-as-code).
2. Open a folder or `.code-workspace`, then click the **n8n** icon in the Activity Bar.
3. Run **n8n: Configure** to create a managed local n8n instance or connect an existing instance through `n8n-manager`.
4. Save the workspace context, pull or create workflows, then use the built-in Agent to work with the selected workflow and node.

You can keep multiple global `n8n-manager` instances and pin a workspace to a specific instance/project when needed.

**What you get:**

- **Agent Workbench** — ask for workflow changes with live workflow, selected node, instance, and workspace context.
- **Workflow sidebar** — browse local and remote workflows with explicit sync status.
- **Embedded n8n canvas** — inspect the visual workflow next to the source file.
- **One-click push/pull** — sync workflows without leaving the editor.
- **Runtime loop** — provision missing credentials, activate, run supported workflows, and inspect executions through `n8n-manager`.
- **Conflict resolution UI** — resolve real local/remote divergence intentionally.

---

## Packages

| Package | What it does | Install |
|:--------|:-------------|:--------|
| **[VS Code Extension](packages/vscode-extension)** | Editor experience with sidebar, canvas, integrated Agent Workbench, and manager-backed runtime actions | [Marketplace](https://marketplace.visualstudio.com/items?itemName=etienne-lescot.n8n-as-code) |
| **[n8nac](packages/cli)** | CLI for sync, validation, AI context, and runtime operations through `n8n-manager` | `npx n8nac` |
| **[Agent Skills](skills)** | Portable AI skills and embedded n8n knowledge for agents | [repo skills directory](https://github.com/EtienneLescot/n8n-as-code/tree/main/skills) |
| **[@n8n-as-code/n8nac](plugins/openclaw/n8n-as-code)** | OpenClaw plugin with setup, prompt context, and portable skills | `openclaw plugins install @n8n-as-code/n8nac` |
| **[@n8n-as-code/transformer](packages/transformer)** | JSON to TypeScript workflow converter and back | `npm i @n8n-as-code/transformer` |
| **[@n8n-as-code/workflow-core](packages/workflow-core)** | Internal workflow contracts, validation, and authoring primitives | workspace package |
| **[@n8n-as-code/manager-adapter](packages/manager-adapter)** | Internal bridge from product surfaces to `n8n-manager` runtime capabilities | workspace package |

---

## How The Pieces Fit

The user-facing surfaces all share the same core behavior:

- **VS Code/Cursor extension** for the full editor and Agent Workbench experience.
- **`n8nac` CLI** for terminal and automation workflows.
- **MCP, Claude Code, and OpenClaw integrations** for external agent environments.
- **`n8n-manager`** for real n8n environments: instances, API keys, projects, local runtimes, credentials, activation, execution, and inspection.
- **Embedded n8n knowledge** for schema validation, node lookup, docs, templates, and AI guidance.

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
