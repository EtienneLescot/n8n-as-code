<div align="center">

# <img src="res/logo.png" alt="n8n-as-code" width="40" height="40"> n8n-as-code

### The n8n IDE for AI agents.

**VS Code / Cursor Agent · n8n Environments · n8n-manager · GitOps · AI Skills · TypeScript Workflows**

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

**Build, edit, deploy, and debug n8n workflows from your editor with an agent that has live n8n context.**

[**Documentation**](https://n8nascode.dev/) · [**Getting Started**](https://n8nascode.dev/docs/getting-started/) · [**VS Code Guide**](https://n8nascode.dev/docs/usage/vscode-extension/) · [**CLI Guide**](https://n8nascode.dev/docs/usage/cli/)

</div>

---

> **Using V1?** V2+ uses workspace environments. Start with the [migration guide](https://n8nascode.dev/docs/migration/v1-to-v2/) and run `n8nac workspace migrate --json` from the repository root before applying with `n8nac workspace migrate --write`. V1 users can keep using the legacy branch and packages: [V1 branch](https://github.com/EtienneLescot/n8n-as-code/tree/v1) · CLI: `npx --yes n8nac@v1 <command>` · Claude Code: `/plugin marketplace add https://github.com/EtienneLescot/n8n-as-code#v1`.

> **n8n version compatibility** — The node schema bundled with n8n-as-code is built against the latest stable release of n8n. Keep your n8n instance up to date for best generation and validation results.

> **Independent project** — n8n-as-code is an independent community project and is not affiliated with, endorsed by, or sponsored by n8n.

---

## The Simple Model

n8n-as-code has three user-facing command groups:

| Group | Command | Owns |
|---|---|---|
| **Primary Usage** | `n8nac env` | Workspace environments: remote n8n URL or local managed instance, project, sync folder, active environment |
| **Workspace Maintenance** | `n8nac workspace` | Readiness and unified workspace migration |
| **Managed Local Instances** | `n8n-manager` | Local managed instances, Docker lifecycle, tunnels, machine-local state |

The repository source of truth is `n8nac-config.json`. It stores workspace environments and is safe to commit when it contains no secrets.

API keys and local managed instance state stay machine-local. They are not committed.

## Quick Start

### VS Code / Cursor

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=etienne-lescot.n8n-as-code) or [Open VSX](https://open-vsx.org/extension/etienne-lescot/n8n-as-code).
2. Open a folder or `.code-workspace`.
3. Open the `n8n` view and run `n8n: Configure`.
4. Create or select an `n8n environment`.
5. Pull or create workflows, then use the integrated Agent Workbench.

The configuration UI uses the same model as the CLI: workspace environments are repository context, local managed instances are machine resources.

[VS Code / Cursor guide](https://n8nascode.dev/docs/usage/vscode-extension/)

### CLI

Create a workspace environment for an existing n8n URL:

```bash
npx --yes n8nac env add Dev --base-url https://n8n.example.com --sync-folder workflows/dev
printf '%s' "$N8N_API_KEY" | npx --yes n8nac env auth set Dev --api-key-stdin
npx --yes n8nac env use Dev
npx --yes n8nac update-ai
```

Or attach a local managed instance:

```bash
n8n-manager instance list
npx --yes n8nac env add Local --managed-instance <id> --sync-folder workflows/local
npx --yes n8nac env use Local
```

Then sync workflows explicitly:

```bash
npx --yes n8nac list
npx --yes n8nac pull <workflow-id>
npx --yes n8nac push workflows/dev/my-workflow.workflow.ts --verify
```

[CLI guide](https://n8nascode.dev/docs/usage/cli/) · [n8n-manager guide](https://n8nascode.dev/docs/usage/n8n-manager/)

### Claude Code

```text
/plugin marketplace add https://github.com/EtienneLescot/n8n-as-code
/plugin install n8n-as-code@n8nac-marketplace
```

Then ask Claude to initialize n8n-as-code in the workspace. The `n8n-architect` skill uses `n8nac` as the primary interface and `n8n-manager` only for local managed instances, tunnels, and workflow presentation.

[Claude setup docs](https://n8nascode.dev/docs/usage/claude-plugin/)

### Generic Agent Skills

Install the skill from the repository skills directory:

```text
https://github.com/EtienneLescot/n8n-as-code/tree/main/skills
```

If your agent asks for an explicit skill path, use `skills/n8n-architect`.

[Skills reference](https://n8nascode.dev/docs/usage/skills/)

## Command Groups

### Primary Usage: `n8nac env`

```bash
n8nac env list
n8nac env add Dev --base-url <url> --sync-folder workflows/dev
n8nac env add Local --managed-instance <id> --sync-folder workflows/local
n8nac env use Dev
n8nac env auth set Dev --api-key-stdin
n8nac env remove Dev
```

Use `n8nac env` for everything that describes how this repository connects to n8n.

### Workspace Maintenance: `n8nac workspace`

```bash
n8nac workspace status
n8nac workspace migrate --json
n8nac workspace migrate --write
```

Use `workspace migrate --json` as the migration dry-run. It reports one unified `operations` list for legacy workspace and global instance changes; apply all required operations together with `workspace migrate --write`.

### Managed Local Instances: `n8n-manager`

```bash
n8n-manager instance list
n8n-manager instance create
n8n-manager instance start <id>
n8n-manager instance stop <id>
n8n-manager instance remove <id>
n8n-manager tunnel start <id>
n8n-manager tunnel stop <id>
```

Use `n8n-manager` only for local managed instances and machine-local operations. Do not use it as the workspace source of truth.

### Hidden Compatibility

Older commands can remain callable for compatibility but are not the primary model:

```bash
n8nac instance-target ...
n8nac target ...
n8nac setup ...
n8nac setup-modes ...
n8nac workspace pin-instance ...
n8nac workspace set-sync-folder ...
```

New docs and user flows should prefer `n8nac env`.

## GitOps For n8n

```bash
n8nac env use Dev
n8nac list
n8nac pull <workflow-id>
n8nac push workflows/dev/my-workflow.workflow.ts --verify
n8nac resolve <workflow-id> --mode keep-current
```

Sync is explicit. Nothing is pushed or pulled unless you ask for it.

## AI Skills

The skills layer gives agents grounded n8n knowledge: node schemas, docs, examples, templates, validation rules, and safe workflow operations.

```bash
npx --yes n8nac skills search "send slack message when google sheet is updated"
npx --yes n8nac skills node-info slack
npx --yes n8nac skills validate workflows/dev/my-workflow.workflow.ts
```

## TypeScript Workflows

```typescript
import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({ id: 'abc123', name: 'Slack Notifier', active: true })
export class SlackNotifierWorkflow {
  @node()
  Trigger = {
    type: 'n8n-nodes-base.webhook',
    parameters: { path: '/notify', method: 'POST' },
    position: [250, 300],
  };

  @node()
  Slack = {
    type: 'n8n-nodes-base.slack',
    parameters: {
      resource: 'message',
      operation: 'post',
      channel: '#alerts',
      text: '={{ $json.message }}',
    },
    position: [450, 300],
  };

  @links([{ from: 'Trigger', to: 'Slack' }])
  connections = {};
}
```

```bash
n8nac convert workflow.json --format typescript
n8nac convert-batch workflows/ --format typescript
```

## Packages

| Package | What it does | Install |
|:--------|:-------------|:--------|
| **[VS Code Extension](packages/vscode-extension)** | Editor experience with sidebar, canvas, integrated Agent Workbench, and n8n environments | [Marketplace](https://marketplace.visualstudio.com/items?itemName=etienne-lescot.n8n-as-code) |
| **[n8nac](packages/cli)** | CLI for workspace environments, sync, validation, AI context, and automation | `npx n8nac` |
| **[Agent Skills](skills)** | Portable AI skills and embedded n8n knowledge for agents | [repo skills directory](https://github.com/EtienneLescot/n8n-as-code/tree/main/skills) |
| **[@n8n-as-code/n8nac](plugins/openclaw/n8n-as-code)** | OpenClaw plugin with prompt context and portable skills | `openclaw plugins install @n8n-as-code/n8nac` |
| **[@n8n-as-code/transformer](packages/transformer)** | JSON to TypeScript workflow converter and back | `npm i @n8n-as-code/transformer` |

## How The Pieces Fit

- **VS Code/Cursor extension**: visual workflow workspace and integrated Agent Workbench.
- **`n8nac env`**: repository-level environment source of truth.
- **`n8nac workspace`**: readiness and unified workspace migration.
- **`n8n-manager`**: local managed instances, Docker lifecycle, tunnels, and machine-local secrets.
- **Skills and MCP**: grounded n8n knowledge for agents.

## Contributing

Contributions welcome.

1. Fork the project.
2. Create a branch: `git checkout -b feature/amazing`.
3. Run tests: `npm test`.
4. Open a Pull Request.

## License

[MIT License](LICENSE) — free to use, modify, and distribute.

Third-party community workflow metadata and downloadable workflow files remain subject to their respective upstream licenses.

## Acknowledgements

`n8n-as-code` exists because [n8n](https://n8n.io/) exists.

Thanks to the n8n team and community for building and maintaining the workflow automation platform this project builds on.

<div align="center">

**If n8n-as-code saves you time, give us a star.**

[Star on GitHub](https://github.com/EtienneLescot/n8n-as-code) · [Documentation](https://n8nascode.dev/) · [Report a Bug](https://github.com/EtienneLescot/n8n-as-code/issues)

</div>
