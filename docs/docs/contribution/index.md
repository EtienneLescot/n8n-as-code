# Contribution Guide

This section contains documentation for developers and contributors working on n8n-as-code.

## 📚 Available Documentation

### Architecture & Design
- **[Architecture Overview](architecture.md)**: Understand the n8n-as-code monorepo architecture, component interactions, and design decisions.

### Internal Packages
- **[Sync Engine](sync.md)**: Internal documentation for the sync engine embedded in `n8nac` and reused by the VS Code extension.
- **[Skills Library](skills.md)**: Internal documentation for `@n8n-as-code/skills`, the internal library exposed through `n8nac skills`.
- **[Claude Adapter](claude-skill.md)**: Internal documentation for the Claude adapter generated from the Skills library.

## 🛠 Development Setup

### Prerequisites
- Node.js 18+
- npm 9+
- Git

### Getting Started
1. Clone the repository
2. Run `npm install` in the root directory
3. Build all packages with `npm run build`
4. Run tests with `npm test`

## 📦 Package Structure

n8n-as-code is organized as a monorepo with the following packages:

| Package | Purpose | Primary Users |
|---------|---------|---------------|
| **CLI** (`n8nac`) | Command-line interface + embedded sync engine | Terminal users, automation |
| **Skills Library** (`@n8n-as-code/skills`) | Internal AI tooling library exposed through `n8nac skills` | AI assistants, developers |
| **Transformer** (`@n8n-as-code/transformer`) | TypeScript workflow decorators, conversion, and code generation primitives | Workflow authors, package maintainers |
| **VS Code Extension** (`n8n-as-code`) | Integrated editor experience built on top of `n8nac` and `@n8n-as-code/skills` | VS Code users |

There is no longer a standalone `Claude Skill` package in `packages/`. Claude-specific distribution is generated from `packages/skills` as an adapter artifact.

## 🧪 Testing

### Test Structure
- **Unit Tests**: Individual component testing with Jest
- **Integration Tests**: End-to-end workflow tests
- **Snapshot Tests**: Ensure generated files match expected format

### Running Tests
```bash
# Run all tests
npm test

# Run tests for specific package
cd packages/skills && npm test
cd packages/cli && npm test
```

## 🔧 Building

### Development Build
```bash
npm run build
```

### Watch Mode (Development)
```bash
# CLI watch mode
cd packages/cli && npm run watch

# Rebuild the VS Code extension
cd packages/vscode-extension && npm run build
```

## 📦 Version Management

n8n-as-code uses a custom commit-driven release flow with independent package versioning. Each package evolves independently while the release automation keeps internal dependencies aligned.

### Current Package Versions

Packages evolve **independently** with their own version numbers:
- **n8nac**: `0.11.3` (embeds sync engine, exposes `n8nac skills`)
- **@n8n-as-code/skills**: `0.16.16` (internal library, consumed by `n8nac` and the VS Code extension)
- **VS Code Extension**: `0.20.0`

> **Note**: Each package has its own version number. The release workflow updates internal dependency pins automatically whenever an upstream package version changes.

### Package Publication Strategy

The project uses a custom commit-driven release flow.

| Package | Published To | Version Source |
|---------|-------------|----------------|
| `@n8n-as-code/transformer` | NPM Registry | Conventional commits + dependency propagation |
| `@n8n-as-code/skills` | NPM Registry | Conventional commits + dependency propagation |
| `n8nac` | NPM Registry | Conventional commits + dependency propagation |
| `n8n-as-code` (VS Code Extension) | VS Code Marketplace / Open VSX | `packages/vscode-extension/package.json` + commit-driven bump |
| Claude adapter artifacts | GitHub repository / plugin distribution flow | Built from `packages/skills/scripts/build-claude-adapter.js` |
| `n8n-as-code-monorepo` (root) | Not published | Not released |
| `docs` | Not published | Not released |

### Release Workflow

#### Push to `next`

- Every push to `next` computes prerelease bumps from commit messages.
- Internal dependency versions are re-pinned automatically.
- Changed public packages are published to npm with the `next` dist-tag.
- The VS Code extension is published to the Marketplace as a prerelease.
- Open VSX prereleases remain disabled.

#### Push to `main`

- Stable release creation is only allowed when `next` is not ahead of `main`.
- If any package version in `package.json` is already ahead of its latest stable tag, `main` publishes that version directly instead of opening a new release PR.
- A push to `main` creates or updates a single release PR only when no package is already ahead of its latest stable tag and commit history requires version bumps.
- The release PR updates package versions and internal dependency versions together.

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
- `n8nac`: `0.11.3` → `0.11.4` ✅
- `@n8n-as-code/skills`: (unchanged, no dependency on n8nac) ✅
- `VS Code Extension`: `0.20.0` → `0.20.1` (auto-bumped because it depends on n8nac) ✅

All packages that depend on `n8nac` will have their `package.json` updated to reference `"n8nac": "0.9.4"`.

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
- **The VS Code extension version line is driven from `packages/vscode-extension/package.json`**
- **Internal dependencies are automatically re-pinned** whenever an upstream package is bumped
- **Private packages remain safe** - they can participate in version orchestration without npm publication
- **Use `npm run check-versions`** to verify all internal dependencies are up-to-date
- **Git tags are created automatically** for each published NPM package
- **Each package has independent releases** - No global monorepo release

## 📝 Contribution Guidelines

### Code Style
- Use TypeScript with strict type checking
- Follow ESLint configuration
- Write comprehensive tests for new features

### Pull Request Process
1. Create a feature branch from `main`
2. Make your changes with tests
3. Ensure all tests pass
4. Submit a pull request with clear description

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
