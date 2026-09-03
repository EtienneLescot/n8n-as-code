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
| **@n8n-as-code/manager-adapter** | npm | Adapter from n8n-as-code surfaces to n8n-manager packages |
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

Dependency alignment is automated and enforced locally and in CI. This is required because the repo publishes independent packages that depend on each other and also consumes external `n8n-manager` packages.

### Local Commands

```bash
# Rewrite package manifests so dependency specs are aligned
npm run sync:deps

# Update published n8n-manager packages to their latest npm versions
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
- `@n8n-as-code/n8n-credentials-manager` is grouped with the n8n-manager dependencies.
- Dependency sync updates only package manifest dependency specs. Release versions and changelogs remain owned by `scripts/release/workspace-release.mjs`.

### Enforcement Points

- `lefthook` runs `node scripts/sync-dependencies.mjs --write --stage` during pre-commit when package manifests or release dependency automation change.
- CI runs `npm run check:deps` after installation and before build/test.
- Dependabot groups n8n-manager package updates so one external update can be propagated consistently across all manifests.

If dependency alignment fails, run `npm run sync:deps`, review the manifest diff, and commit the updated package files with the original change. If new `n8n-manager` releases are available, use `npm run update:n8n-manager` first.

### Release Workflow (RC model)

- All merges land on `main` — there is no `next` branch anymore.
- Nothing is published automatically when code lands on `main`.
- A maintainer cuts a release candidate with the **Prerelease (RC)** workflow (Actions → *Prerelease (RC)* → *Run workflow*): pick `patch`/`minor`/`major` and the RC number.
  - This creates (rc.1) or reuses (rc.2+, it carries cherry-picks) the frozen branch `release/vX.Y.Z`, bumps every changed package to `X.Y.Z-rc.N` **on that branch only**, publishes them to npm under the `rc` dist-tag, publishes the VS Code extension as a pre-release, tags `vX.Y.Z-rc.N`, and opens a GitHub prerelease.
  - Packages without changes since their last stable tag are not re-published.
- Bug fixes during the RC window are cherry-picked by a maintainer onto `release/vX.Y.Z`; re-running the workflow with the next RC number re-cuts and publishes `-rc.N+1`.
- When the RC is validated, a maintainer runs the **Promote RC to Stable** workflow with the RC tag (e.g. `v2.6.0-rc.2`):
  - Final versions and changelogs are written on the release branch, npm packages are published under `latest`, the VS Code extension goes stable on the Marketplace and Open VSX, per-package tags and the `vX.Y.Z` tag are pushed, and the GitHub release is marked latest.
  - `main` is then synchronized with the released versions through an automated sync pull request. Release branches are kept for forensics and backports.
- The full operator runbook lives in [Release operations](/contribution/release).

### Workflow Summary Diagram

```
Maintainer merges PRs to main (conventional commits)
       ↓
Maintainer dispatches "Prerelease (RC)"
       → release/vX.Y.Z branch + vX.Y.Z-rc.N tag
       → npm dist-tag rc + VS Code pre-release
       ↓
Cherry-pick fixes onto release/vX.Y.Z, re-cut rc.N+1 if needed
       ↓
Maintainer dispatches "Promote RC to Stable" with the rc tag
       ↓
Stable release: npm latest + VS Code + Open VSX + tags + GitHub release
       ↓
Automated sync PR brings versions and changelogs back to main
```

### Key Rules
- **Never manually edit release versions in PRs by hand** unless you are intentionally repairing the release flow
- **Use conventional commits** so the RC workflow can derive `major`, `minor`, or `patch` automatically
- **Package-scoped `docs(...)` commits also count as patch releases** when they touch files inside a released package
- **Prerelease versions are `X.Y.Z-rc.N`** — the VS Code even/odd minor scheme is retired; the extension follows plain semver with the same `-rc.N` suffixes
- **Internal dependencies are automatically discovered from package manifests and re-pinned** whenever an upstream package is bumped
- **Use `npm run sync:deps`** before committing package manifest changes when the hook cannot run
- **Use `npm run check:deps` or `npm run check-versions`** to verify all internal and n8n-manager dependency specs are up to date
- **Git tags are created automatically** for each published npm package, at promote time
- **Each package has independent releases** — no global monorepo release

## 📝 Contribution Guidelines

### Code Style
- Use TypeScript with strict type checking
- Follow ESLint configuration
- Write comprehensive tests for new features

### Pull Request Process
1. Create a feature branch from `main`
2. Make your changes with tests
3. Ensure all tests pass
4. Submit a pull request with clear description targeting `main`

### Documentation
- Update relevant documentation when adding features
- Include JSDoc comments for public APIs
- Keep the contributors documentation up to date

## 🔗 Related Resources

- [GitHub Repository](https://github.com/EtienneLescot/n8n-as-code)
- [Issue Tracker](https://github.com/EtienneLescot/n8n-as-code/issues)
- [Discussion Forum](https://github.com/EtienneLescot/n8n-as-code/discussions)
- [Release Workflow](https://github.com/EtienneLescot/n8n-as-code/blob/main/.github/workflows/prerelease.yml)

## ❓ Need Help?

- Check the existing documentation in this section
- Look at the source code for examples
- Open an issue on GitHub for specific questions
- Join discussions in the GitHub forum

---

*This documentation is maintained by the n8n-as-code development team.*
