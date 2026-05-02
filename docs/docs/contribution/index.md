# Contribution Guide

This section is for developers and contributors working on n8n-as-code internals.

For user-facing documentation, see [Usage](/docs/usage).

## Documentation

- **[Architecture](architecture.md)** — monorepo structure, component interactions, design decisions
- **[Sync Engine](sync.md)** — the sync engine embedded in `n8nac` and reused by the VS Code extension
- **[CLI Package](cli.md)** — CLI architecture and command structure
- **[VS Code Extension](vscode-extension.md)** — extension components and development
- **[Skills & AI Tools](skills.md)** — the `@n8n-as-code/skills` library (node schemas, AI context generation, MCP server)
- **[Claude Adapter](claude-skill.md)** — how the Claude plugin artifacts are generated from Skills
- **[Local Dev Workspace](local-dev-workspace.md)** — optional helper workspace for testing `n8n-as-code` facades with local `n8n-manager` builds

## Development Setup

### Prerequisites
- Node.js 18+
- npm 9+
- Git

### Getting Started
```bash
git clone https://github.com/EtienneLescot/n8n-as-code.git
cd n8n-as-code
npm install
npm run build
npm test
```

For end-to-end work across `n8n-as-code` and `n8n-manager`, the optional helper repository [`n8n-ecosystem-dev`](https://github.com/EtienneLescot/n8n-ecosystem-dev) bootstraps both local repos, shared environment overrides, and smoke-test commands. Use it when you need to validate facades against local `n8nac` and `n8n-manager` builds instead of published packages.

## Package Structure

| Package | Published To | Purpose |
|---|---|---|
| **n8nac** (CLI) | npm | CLI + embedded sync engine |
| **@n8n-as-code/skills** | npm | Internal AI tooling library exposed through `n8nac skills` |
| **@n8n-as-code/transformer** | npm | TypeScript workflow decorators and conversion |
| **@n8n-as-code/telemetry** | npm | Privacy-first telemetry primitives shared across facades |
| **@n8n-as-code/workflow-core** | npm | Workflow intelligence contracts and public authoring API |
| **@n8n-as-code/manager-adapter** | npm | Adapter from n8n-as-code surfaces to n8n-manager runtime packages |
| **@n8n-as-code/mcp** | npm | Dedicated MCP server for n8n-as-code tools |
| **@n8n-as-code/n8nac** | npm | OpenClaw plugin package |
| **n8n-as-code** (VS Code Extension) | VS Code Marketplace / Open VSX | Editor integration |
| **Claude adapter** | GitHub / plugin distribution | Built from `packages/skills` |

There is no standalone Claude Skill package — Claude-specific distribution is generated from `packages/skills` as an adapter artifact.

## Building

```bash
# Full build
npm run build

# Watch mode (CLI)
cd packages/cli && npm run watch

# VS Code extension
cd packages/vscode-extension && npm run build

# Claude plugin artifacts
npm run build:claude-plugin
```

## Testing

```bash
# All tests
npm test

# Per package
cd packages/skills && npm test
cd packages/cli && npm test
```

## OpenClaw Plugin Local Development

To iterate on the OpenClaw plugin from this monorepo:

```bash
openclaw plugins install --link /home/etienne/repos/n8n-as-code/plugins/openclaw/n8n-as-code
openclaw gateway restart
openclaw plugins info n8nac
openclaw n8nac:status
```

## Release Flow

The project uses a custom commit-driven release flow with independent package versioning. Each package evolves independently while the release automation keeps internal dependencies aligned. See the [release scripts](https://github.com/EtienneLescot/n8n-as-code/tree/main/scripts/release) for details.

## Dependency Alignment

Dependency alignment is automated and enforced locally and in CI. This is required because the repo publishes independent packages that depend on each other and also consumes external `n8n-manager` runtime packages.

### Local Commands

```bash
# Rewrite package manifests so dependency specs are aligned
npm run sync:deps

# Update published n8n-manager runtime packages to their latest npm versions
npm run update:n8n-manager

# Verify package manifests without modifying files
npm run check:deps

# Backward-compatible alias for dependency alignment checks
npm run check-versions
```

### What Gets Synchronized

- Workspace package dependencies are pinned to the exact current local package version.
- `npm run update:n8n-manager` upgrades published `@n8n-as-code/n8n-manager*` packages and `@n8n-as-code/n8n-credentials-manager` to the latest npm version while preserving each manifest's `^` or `~` prefix.
- The `@n8n-as-code/n8n-manager*` dependency family is kept consistent wherever the same package appears.
- `@n8n-as-code/n8n-credentials-manager` is grouped with the n8n-manager runtime dependencies.
- Dependency sync updates only package manifest dependency specs. Release versions and changelogs remain owned by `scripts/release/workspace-release.mjs`.

### Enforcement Points

- `lefthook` runs `node scripts/sync-dependencies.mjs --write --stage` during pre-commit when package manifests or release dependency automation change.
- CI runs `npm run check:deps` after installation and before build/test.
- Dependabot groups n8n-manager runtime package updates so one external update can be propagated consistently across all manifests.

If dependency alignment fails, run `npm run sync:deps`, review the manifest diff, and commit the updated package files with the original change. If new `n8n-manager` releases are available, use `npm run update:n8n-manager` first.

### Release Workflow

#### Push to `next`

- Every push to `next` computes prerelease bumps from commit messages.
- Internal dependency versions are re-pinned automatically from the workspace package graph.
- Changed public packages are published to npm with the `next` dist-tag.
- The VS Code extension follows the official Marketplace recommendation: stable releases use even minor lines and prereleases use odd minor lines.
- The prerelease line is intentionally kept above the stable version that the same changes will later publish from `main`, so preview users are not forced back to stable.
- Example: if the current stable extension is `0.21.0`, the next stable release becomes `0.22.0` and prereleases on `next` become `0.23.1`, `0.23.2`, `0.23.3`, and so on.
- Open VSX prereleases remain disabled.

#### Push to `main`

- If any package version in `package.json` is already ahead of its latest stable tag, `main` publishes that version directly instead of opening a new release PR.
- A push to `main` creates or updates a single release PR only when no package is already ahead of its latest stable tag and commit history requires version bumps.
- The release PR updates package versions, internal dependency versions, and changelogs together.
- For the VS Code extension, stable releases always land on patch `0` of the next even minor line.
- Example: after prereleases on `0.23.x`, the next stable extension release becomes `0.22.0`, and the following cycle starts with prereleases on `0.25.x`.

#### Merge the release PR

1. The merged `package.json` versions become the stable source of truth.
2. Changed npm packages are published in dependency order.
3. The VS Code extension is published from the exact version committed in `packages/vscode-extension/package.json`.
4. Stable git tags are pushed for each released package.
5. The workflow force-aligns `next` back to `main`, or recreates `next` if it was deleted.

### Example: How Internal Dependencies Stay Synchronized

Let's say you fix a bug in the sync engine (embedded in `n8nac`):

```bash
# 1. Push a conventional commit to next
git commit -m "fix(cli): handle sync edge case"

# 2. Merge next into main
# 3. Let the release PR bump versions automatically
```

**Result:**
- `n8nac`: `0.11.4` → `0.11.5` ✅
- `@n8n-as-code/mcp`: patch release if it depends on the changed `n8nac` version ✅
- `VS Code Extension`: `0.21.0` → `0.22.0` on `main`, while `next` prereleases are published on `0.23.x` ✅

All packages that depend on `n8nac` will have their `package.json` updated to reference the newly released stable version.

### Workflow Summary Diagram

```
Developer pushes conventional commits to next
       ↓
CI publishes prereleases from next
       ↓
next is merged into main
       ↓
CI creates or updates a release PR
       ↓
Maintainer merges the release PR
       ↓
CI automatically:
  ├─→ Publishes stable npm packages in dependency order
  ├─→ Tags released package versions
  ├─→ Publishes the VS Code extension from package.json
  └─→ Re-aligns next on top of main
```

### Key Rules
- **Never manually edit release versions in PRs by hand** unless you are intentionally repairing the release flow
- **Use conventional commits** so the CI can derive `major`, `minor`, or `patch` automatically
- **Package-scoped `docs(...)` commits also count as patch releases** when they touch files inside a released package
- **The VS Code extension uses even minor lines for stable releases and odd minor lines for prereleases**
- **The prerelease line must stay numerically above the stable release that will be published next**
- **The VS Code extension version line is driven from `packages/vscode-extension/package.json`**
- **Internal dependencies are automatically discovered from package manifests and re-pinned** whenever an upstream package is bumped
- **Use `npm run sync:deps`** before committing package manifest changes when the hook cannot run
- **Use `npm run check:deps` or `npm run check-versions`** to verify all internal and n8n-manager dependency specs are up to date
- **Git tags are created automatically** for each published NPM package
- **Each package has independent releases** - No global monorepo release

## 📝 Contribution Guidelines

### Code Style
- Use TypeScript with strict type checking
- Follow ESLint configuration
- Write comprehensive tests for new features

### Pull Request Process
1. Create a feature branch from `next`
2. Make your changes with tests
3. Ensure all tests pass
4. Submit a pull request with clear description targeting `next`

### Documentation
- Update relevant documentation when adding features
- Include JSDoc comments for public APIs
- Keep the contributors documentation up to date

## 🔗 Related Resources

- [GitHub Repository](https://github.com/EtienneLescot/n8n-as-code)
- [Issue Tracker](https://github.com/EtienneLescot/n8n-as-code/issues)
- [Discussion Forum](https://github.com/EtienneLescot/n8n-as-code/discussions)
- [Release Workflow](https://github.com/EtienneLescot/n8n-as-code/blob/main/.github/workflows/release.yml)

## ❓ Need Help?

- Check the existing documentation in this section
- Look at the source code for examples
- Open an issue on GitHub for specific questions
- Join discussions in the GitHub forum

---

*This documentation is maintained by the n8n-as-code development team.*
