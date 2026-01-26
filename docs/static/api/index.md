---
id: index
title: API Reference
sidebar_label: Overview
slug: /api
---

# n8n-as-code API Reference

Welcome to the n8n-as-code API reference documentation. This documentation is automatically generated from the TypeScript source code using TypeDoc.

## Packages

The n8n-as-code project is organized as a monorepo with the following packages:

### Sync Package
The sync package provides the foundational services for managing n8n workflows as code.

**Key Services:**
- `DirectoryUtils` - File system operations for workflow management
- `N8nApiClient` - Communication with n8n REST API
- `SchemaGenerator` - JSON schema generation for n8n workflows
- `StateManager` - State management for workflow synchronization
- `SyncManager` - Bidirectional synchronization between files and n8n
- `TrashService` - Workflow trash management
- `WorkflowSanitizer` - Workflow validation and sanitization

### CLI Package
Command-line interface for managing n8n workflows from the terminal.

**Key Commands:**
- `init` - Initialize a new n8n-as-code project
- `init-ai` - Initialize with AI-assisted configuration
- `sync` - Synchronize workflows between files and n8n
- `watch` - Watch for changes and auto-sync

### Skills CLI Package
Tools for AI agents to work with n8n workflows.

**Key Services:**
- `AiContextGenerator` - Generate context for AI assistants
- `NodeSchemaProvider` - Provide n8n node schemas to AI
- `SnippetGenerator` - Generate code snippets for n8n workflows

### VS Code Extension
Visual Studio Code extension for editing n8n workflows.

**Key Components:**
- `ProxyService` - Proxy between VS Code and n8n
- `WorkflowTreeProvider` - Tree view for workflows
- `WorkflowWebview` - Webview for workflow editing

## Navigation

Use the sidebar to navigate through the API documentation. The documentation is organized by package and then by module.

## TypeScript Support

All packages are written in TypeScript and provide full type definitions. The API documentation includes:

- **Classes** with constructors, properties, and methods
- **Interfaces** with property definitions
- **Type Aliases** for complex type definitions
- **Functions** with parameter and return type documentation
- **Enums** with value documentation

## Examples

Each API entry includes usage examples where applicable. Look for the "Example" sections in the documentation.

## Contributing

To update the API documentation, simply update the JSDoc comments in the source code and regenerate the documentation using:

```bash
npm run docs:api
```

## Need Help?

If you have questions about the API or need assistance, please:

1. Check the [main documentation](/docs) for usage guides
2. Look at the [source code](https://github.com/EtienneLescot/n8n-as-code) for examples
3. Open an [issue](https://github.com/EtienneLescot/n8n-as-code/issues) for questions

---

*Last updated: 2026-01-13*
