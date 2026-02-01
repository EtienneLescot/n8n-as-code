#!/usr/bin/env node

/**
 * Script to generate API documentation for n8n-as-code monorepo
 * This script:
 * 1. Generates TypeDoc documentation for all packages
 * 2. Processes the output for Docusaurus compatibility
 * 3. Creates index files and navigation structure
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');
const API_OUTPUT_DIR = path.join(DOCS_DIR, 'static/api');
const TYPEDOC_CONFIG = path.join(ROOT_DIR, 'typedoc.json');

console.log('🚀 Generating API documentation for n8n-as-code...');

// Ensure output directory exists
if (!fs.existsSync(API_OUTPUT_DIR)) {
  fs.mkdirSync(API_OUTPUT_DIR, { recursive: true });
}

// Clean previous API documentation
console.log('🧹 Cleaning previous API documentation...');
if (fs.existsSync(API_OUTPUT_DIR)) {
  const files = fs.readdirSync(API_OUTPUT_DIR);
  for (const file of files) {
    if (file !== '.gitkeep') {
      fs.rmSync(path.join(API_OUTPUT_DIR, file), { recursive: true, force: true });
    }
  }
}

// Generate TypeDoc documentation
console.log('📚 Generating TypeDoc documentation...');
try {
  execSync(`npx typedoc --options ${TYPEDOC_CONFIG}`, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    encoding: 'utf-8',
  });
} catch (error) {
  console.error('❌ Failed to generate TypeDoc documentation:', error.message);
  process.exit(1);
}

// Create API index page for Docusaurus
console.log('📄 Creating API index page...');
const apiIndexContent = `---
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
- \`DirectoryUtils\` - File system operations for workflow management
- \`N8nApiClient\` - Communication with n8n REST API
- \`SchemaGenerator\` - JSON schema generation for n8n workflows
- \`StateManager\` - State management for workflow synchronization
- \`SyncManager\` - Bidirectional synchronization between files and n8n
- \`TrashService\` - Workflow trash management
- \`WorkflowSanitizer\` - Workflow validation and sanitization

### CLI Package
Command-line interface for managing n8n workflows from the terminal.

**Key Commands:**
- \`init\` - Initialize a new n8n-as-code project
- \`init-ai\` - Initialize with AI-assisted configuration
- \`sync\` - Synchronize workflows between files and n8n
- \`watch\` - Watch for changes and auto-sync

### Skills CLI Package
Tools for AI agents to work with n8n workflows.

**Key Services:**
- \`AiContextGenerator\` - Generate context for AI assistants
- \`NodeSchemaProvider\` - Provide n8n node schemas to AI
- \`SnippetGenerator\` - Generate code snippets for n8n workflows

### VS Code Extension
Visual Studio Code extension for editing n8n workflows.

**Key Components:**
- \`ProxyService\` - Proxy between VS Code and n8n
- \`WorkflowTreeProvider\` - Tree view for workflows
- \`WorkflowWebview\` - Webview for workflow editing

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

\`\`\`bash
npm run docs:api
\`\`\`

## Need Help?

If you have questions about the API or need assistance, please:

1. Check the [main documentation](/docs) for usage guides
2. Look at the [source code](https://github.com/EtienneLescot/n8n-as-code) for examples
3. Open an [issue](https://github.com/EtienneLescot/n8n-as-code/issues) for questions

---

*Last updated: ${new Date().toISOString().split('T')[0]}*
`;

fs.writeFileSync(path.join(API_OUTPUT_DIR, 'index.md'), apiIndexContent);

// Create package index pages
const packages = [
  { name: 'sync', description: 'Sync services for n8n workflow management' },
  { name: 'cli', description: 'Command-line interface for n8n-as-code' },
  { name: 'skills', description: 'AI agent tools for n8n workflows' },
  { name: 'vscode-extension', description: 'VS Code extension for n8n workflow editing' },
];

for (const pkg of packages) {
  const pkgIndexContent = `---
id: ${pkg.name}/index
title: ${pkg.name.charAt(0).toUpperCase() + pkg.name.slice(1)} Package
sidebar_label: Overview
---

# ${pkg.name.charAt(0).toUpperCase() + pkg.name.slice(1)} Package

${pkg.description}

## Overview

This package provides the following functionality:

${getPackageDescription(pkg.name)}

## Modules

Use the sidebar to navigate through the modules in this package.

## Usage

For usage examples and guides, see the [main documentation](/docs/usage/${pkg.name}).

## API Reference

The API reference for this package is organized by module. Click on a module in the sidebar to see its detailed API documentation.
`;

  const pkgDir = path.join(API_OUTPUT_DIR, pkg.name);
  if (!fs.existsSync(pkgDir)) {
    fs.mkdirSync(pkgDir, { recursive: true });
  }
  fs.writeFileSync(path.join(pkgDir, 'index.md'), pkgIndexContent);
}

function getPackageDescription(packageName) {
  const descriptions = {
    sync: `- **Workflow Management**: Load, save, and validate n8n workflows
- **API Integration**: Communicate with n8n REST API
- **State Synchronization**: Keep workflows in sync between files and n8n
- **Schema Generation**: Generate JSON schemas for n8n nodes
- **Validation**: Validate workflow structure and content`,
    
    cli: `- **Project Initialization**: Set up new n8n-as-code projects
- **Workflow Synchronization**: Sync workflows between local files and n8n
- **Watch Mode**: Automatically sync changes in real-time
- **AI Assistance**: Get AI help for workflow creation
- **Configuration Management**: Manage project settings and credentials`,
    
    'skills': `- **AI Context Generation**: Create context for AI assistants working with n8n
- **Node Schema Provision**: Provide structured schemas of n8n nodes to AI
- **Snippet Generation**: Generate code snippets for common n8n patterns
- **Workflow Analysis**: Analyze workflows for AI consumption`,
    
    'vscode-extension': `- **Workflow Editing**: Edit n8n workflows directly in VS Code
- **Tree View**: Browse workflows in a hierarchical view
- **Webview Interface**: Visual workflow editing interface
- **Proxy Service**: Secure connection to n8n instance
- **Status Bar**: Quick access to common actions`,
  };
  
  return descriptions[packageName] || 'See the individual modules for detailed functionality.';
}

// Create README for API directory
const apiReadme = `# API Documentation

This directory contains the generated API documentation for n8n-as-code.

## Generation

The API documentation is generated using TypeDoc. To regenerate:

\`\`\`bash
npm run docs:api
\`\`\`

Or manually:

\`\`\`bash
node scripts/generate-api-docs.cjs
\`\`\`

## Structure

- \`index.md\` - Main API overview page
- \`sync/\` - Sync package documentation
- \`cli/\` - CLI package documentation
- \`skills/\` - Skills CLI package documentation
- \`vscode-extension/\` - VS Code extension documentation

## Integration with Docusaurus

This documentation is served by Docusaurus at the \`/api\` route. The sidebar configuration is in \`docs/sidebars.api.ts\`.

## Notes

- Do not edit files in this directory manually
- All changes should be made to the source code JSDoc comments
- Regenerate after making changes to source code
`;

fs.writeFileSync(path.join(API_OUTPUT_DIR, 'README.md'), apiReadme);

console.log('✅ API documentation generated successfully!');
console.log(`📁 Output directory: ${API_OUTPUT_DIR}`);
console.log('🌐 View at: http://localhost:3000/api (after starting Docusaurus)');