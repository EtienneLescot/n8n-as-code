# Contribution Guide

This section contains documentation for developers and contributors working on n8n-as-code.

## 📚 Available Documentation

### Architecture & Design
- **[Architecture Overview](architecture.md)**: Understand the n8n-as-code monorepo architecture, component interactions, and design decisions.

### Internal Packages
- **[Core Package](core.md)**: Internal documentation for the Core package that provides shared business logic for all n8n-as-code components.
- **[Agent CLI](agent-cli.md)**: Internal documentation for the Agent CLI package used by AI assistants to generate context and snippets.

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
| **Core** (`@n8n-as-code/core`) | Shared logic, API client, synchronization | All packages |
| **CLI** (`@n8n-as-code/cli`) | Command-line interface for workflow management | Terminal users, automation |
| **VS Code Extension** | Integrated development environment | VS Code users |
| **Agent CLI** (`@n8n-as-code/agent-cli`) | AI context generation and node schemas | AI assistants, developers |

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
cd packages/core && npm test
cd packages/agent-cli && npm test
```

## 🔧 Building

### Development Build
```bash
npm run build
```

### Watch Mode (Development)
```bash
npm run dev
```

## 📦 Version Management

n8n-as-code uses **Changeset** with independent package versioning. Each package evolves independently while Changeset automatically manages internal dependencies.

### Current Package Versions

Packages evolve **independently** with their own version numbers:
- **@n8n-as-code/core**: `0.3.0`
- **@n8n-as-code/cli**: `0.3.0`
- **@n8n-as-code/agent-cli**: `0.2.0`
- **VS Code Extension**: `0.2.0`

> **Note**: Each package has its own version number. Changeset ensures that when a package depends on another internal package, it always references the **current version** of that dependency.

### Package Publication Strategy

The project includes different types of packages:

| Package | Published To | Managed By Changeset |
|---------|-------------|---------------------|
| `@n8n-as-code/core` | NPM Registry | ✅ Yes |
| `@n8n-as-code/cli` | NPM Registry | ✅ Yes |
| `@n8n-as-code/agent-cli` | NPM Registry | ✅ Yes |
| `n8n-as-code` (VS Code Extension) | VS Code Marketplace | ✅ Yes (versioning only) |
| `n8n-as-code-monorepo` (root) | Not published | ❌ No (ignored) |
| `docs` | Not published | ❌ No (private) |

**Important**: The VS Code extension is marked as `"private": true` to prevent accidental NPM publication, but **it is still managed by Changeset** for version numbering and dependency synchronization. Changeset automatically skips private packages during `changeset publish`.

### Release Workflow

1. **Declare Changes**: After modifying code, run `npm run changeset`
   - Select affected packages (including VS Code extension if modified)
   - Choose version type: `patch` (bug fix), `minor` (feature), `major` (breaking)
   - Write changelog message

2. **Apply Versions**: Run `npm run version-packages`
   - Updates package.json versions for ALL packages (including private ones)
   - Automatically updates internal dependencies across all packages
   - Generates/updates CHANGELOG.md files

3. **Publish**: Run `npm run release` (via GitHub Actions)
   - Builds all packages
   - Publishes public packages to NPM registry (skips private packages automatically)
   - Separately publishes VS Code extension to Marketplace using the version from package.json
   - Creates Git tag

### Example: How Internal Dependencies Stay Synchronized

Let's say you fix a bug in `@n8n-as-code/core`:

```bash
# 1. Create a changeset for the core fix
npm run changeset
# Select: @n8n-as-code/core
# Type: patch (0.3.0 → 0.3.1)

# 2. Apply versions
npm run version-packages
```

**Result:**
- `@n8n-as-code/core`: `0.3.0` → `0.3.1` ✅
- `@n8n-as-code/cli`: `0.3.0` → `0.3.1` (auto-bumped because it depends on core) ✅
- `@n8n-as-code/agent-cli`: `0.2.0` (unchanged, no dependency on core) ✅
- `VS Code Extension`: `0.2.0` → `0.2.1` (auto-bumped because it depends on core) ✅

All packages that depend on `core` will have their `package.json` updated to reference `"@n8n-as-code/core": "0.3.1"`.

### Key Rules
- **Never manually edit versions** in package.json
- **Always use Changeset** even for small fixes
- **Include VS Code extension in changesets** when you modify it - this ensures dependencies stay synchronized
- **Internal dependencies are automatically updated** thanks to `"updateInternalDependencies": "patch"` in Changeset config
- **Private packages are safe** - Changeset will manage their versions but never publish them to NPM
- **Use `npm run check-versions`** to verify all internal dependencies are up-to-date

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
- [Changeset Documentation](https://github.com/changesets/changesets)
- [Release Workflow](../.github/workflows/release.yml)

## ❓ Need Help?

- Check the existing documentation in this section
- Look at the source code for examples
- Open an issue on GitHub for specific questions
- Join discussions in the GitHub forum

---

*This documentation is maintained by the n8n-as-code development team.*
