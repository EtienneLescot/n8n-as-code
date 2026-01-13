# TypeDoc Configuration Plan for n8n-as-code Monorepo

## Overview
Configuration strategy for generating comprehensive API documentation for all packages in the monorepo with cross-references and proper categorization.

## 1. Root Configuration (`/typedoc.json`)

```json
{
  "$schema": "https://typedoc.org/schema.json",
  "entryPoints": ["packages/*"],
  "entryPointStrategy": "packages",
  "out": "docs/api",
  "name": "n8n-as-code API Reference",
  "includeVersion": true,
  "categorizeByGroup": true,
  "searchCategoryBoosts": {
    "Core": 2.0,
    "CLI": 1.5,
    "Agent Tools": 1.5,
    "VS Code": 1.5
  },
  "navigation": {
    "includeCategories": true,
    "includeGroups": true
  },
  "plugin": ["@typedoc/plugin-versions"],
  "theme": "default",
  "exclude": ["**/node_modules/**", "**/*.test.ts", "**/*.spec.ts", "**/tests/**"],
  "excludePrivate": true,
  "excludeProtected": false,
  "excludeExternals": true,
  "readme": "none",
  "disableSources": false,
  "cleanOutputDir": true,
  "favicon": "static/img/favicon.ico",
  "githubPages": false,
  "hideGenerator": false,
  "customCss": "./docs/api/css/custom.css"
}
```

## 2. Package-Specific Configurations

### 2.1 Core Package (`packages/core/typedoc.json`)
```json
{
  "displayName": "@n8n-as-code/core",
  "entryPoints": ["./src/index.ts"],
  "tsconfig": "./tsconfig.json",
  "out": "../../docs/api/core",
  "categoryOrder": [
    "API Client",
    "Sync Management",
    "Workflow Processing",
    "State Management",
    "Utilities",
    "Types"
  ],
  "customDescription": "Core library providing n8n API interactions, synchronization logic, and workflow sanitization."
}
```

### 2.2 CLI Package (`packages/cli/typedoc.json`)
```json
{
  "displayName": "@n8n-as-code/cli",
  "entryPoints": ["./src/index.ts"],
  "tsconfig": "./tsconfig.json",
  "out": "../../docs/api/cli",
  "categoryOrder": [
    "Commands",
    "Services",
    "Configuration",
    "Utilities"
  ],
  "customDescription": "Command-line interface for managing n8n workflows with local file synchronization."
}
```

### 2.3 Agent CLI Package (`packages/agent-cli/typedoc.json`)
```json
{
  "displayName": "@n8n-as-code/agent-cli",
  "entryPoints": ["./src/index.ts"],
  "tsconfig": "./tsconfig.json",
  "out": "../../docs/api/agent-cli",
  "categoryOrder": [
    "Schema Providers",
    "AI Context Generation",
    "Snippet Generation",
    "CLI Tools"
  ],
  "customDescription": "AI Agent tools for n8n workflow context generation, node schema retrieval, and snippet creation."
}
```

### 2.4 VS Code Extension (`packages/vscode-extension/typedoc.json`)
```json
{
  "displayName": "n8n-as-code VS Code Extension",
  "entryPoints": ["./src/extension.ts"],
  "tsconfig": "./tsconfig.json",
  "out": "../../docs/api/vscode-extension",
  "categoryOrder": [
    "Extension",
    "Services",
    "UI Components",
    "Webview",
    "Commands"
  ],
  "customDescription": "VS Code extension providing real-time n8n workflow synchronization and AI assistance."
}
```

## 3. Build Scripts

### 3.1 Root `package.json` Additions
```json
{
  "scripts": {
    "docs:generate": "typedoc",
    "docs:build": "npm run docs:generate && npm run docs:docusaurus",
    "docs:docusaurus": "cd docs && npm run build",
    "docs:serve": "cd docs && npm run start",
    "docs:clean": "rm -rf docs/api docs/build"
  }
}
```

### 3.2 Documentation Generation Script (`scripts/generate-docs.js`)
```javascript
#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Generate API documentation
console.log('Generating TypeDoc API documentation...');
execSync('npx typedoc', { stdio: 'inherit' });

// Copy API docs to Docusaurus static directory
const apiSource = path.join(process.cwd(), 'docs/api');
const apiDest = path.join(process.cwd(), 'docs/static/api');

if (fs.existsSync(apiDest)) {
  fs.rmSync(apiDest, { recursive: true });
}
fs.cpSync(apiSource, apiDest, { recursive: true });

console.log('API documentation generated and copied to Docusaurus static directory.');
```

## 4. Docusaurus Integration

### 4.1 Sidebar Configuration (`docs/sidebars.js`)
```javascript
module.exports = {
  docs: [
    // ... other sidebar items
    {
      type: 'category',
      label: 'API Reference',
      link: {
        type: 'generated-index',
        title: 'API Reference',
        description: 'Complete API documentation for all n8n-as-code packages.',
        slug: '/api',
      },
      items: [
        {
          type: 'category',
          label: '@n8n-as-code/core',
          link: { type: 'doc', id: 'api/core/index' },
          items: [
            'api/core/modules',
            'api/core/classes',
            'api/core/interfaces',
            'api/core/functions',
          ],
        },
        {
          type: 'category',
          label: '@n8n-as-code/cli',
          link: { type: 'doc', id: 'api/cli/index' },
          items: [
            'api/cli/modules',
            'api/cli/classes',
            'api/cli/interfaces',
            'api/cli/functions',
          ],
        },
        {
          type: 'category',
          label: '@n8n-as-code/agent-cli',
          link: { type: 'doc', id: 'api/agent-cli/index' },
          items: [
            'api/agent-cli/modules',
            'api/agent-cli/classes',
            'api/agent-cli/interfaces',
            'api/agent-cli/functions',
          ],
        },
        {
          type: 'category',
          label: 'VS Code Extension',
          link: { type: 'doc', id: 'api/vscode-extension/index' },
          items: [
            'api/vscode-extension/modules',
            'api/vscode-extension/classes',
            'api/vscode-extension/interfaces',
            'api/vscode-extension/functions',
          ],
        },
      ],
    },
  ],
};
```

### 4.2 Docusaurus Configuration (`docs/docusaurus.config.js`)
```javascript
module.exports = {
  // ... other config
  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'api',
        path: 'static/api',
        routeBasePath: 'api',
        sidebarPath: require.resolve('./sidebars.js'),
        // ... other options
      },
    ],
  ],
};
```

## 5. Cross-Reference Configuration

### 5.1 TypeDoc Plugin for Cross-Package References
Install plugin for better cross-package linking:
```bash
npm install --save-dev @typedoc/plugin-cross-package-references
```

### 5.2 Configuration in root `typedoc.json`:
```json
{
  "plugin": [
    "@typedoc/plugin-cross-package-references",
    "@typedoc/plugin-versions"
  ],
  "crossPackageReferences": {
    "enabled": true,
    "packagePrefixes": {
      "@n8n-as-code/core": "core",
      "@n8n-as-code/cli": "cli", 
      "@n8n-as-code/agent-cli": "agent-cli"
    }
  }
}
```

## 6. Documentation Quality Checks

### 6.1 TSDoc Validation Script
```javascript
// scripts/validate-tsdoc.js
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

function checkTSDocComments(filePath) {
  const content = readFileSync(filePath, 'utf8');
  // Basic validation logic
  const lines = content.split('\n');
  let hasIssues = false;
  
  // Check for exported functions/classes without TSDoc
  // Implementation details...
  
  return hasIssues;
}
```

### 6.2 Pre-commit Hook
Add to `package.json`:
```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run docs:validate"
    }
  }
}
```

## 7. Deployment Strategy

### 7.1 Output Structure
```
docs/
├── api/                    # Generated TypeDoc output
│   ├── core/
│   ├── cli/
│   ├── agent-cli/
│   └── vscode-extension/
├── static/
│   └── api/               # Copied for Docusaurus
└── build/                 # Final built site
```

### 7.2 CI/CD Pipeline
- Generate API docs on every commit to main
- Build Docusaurus site
- Deploy to GitHub Pages/Vercel/Netlify
- Invalidate CDN cache if needed

## 8. Maintenance Plan

### 8.1 Regular Updates
- Update TypeDoc configuration when packages change
- Regenerate API docs with new releases
- Review and update cross-references

### 8.2 Quality Assurance
- Monitor broken links
- Check documentation coverage
- Validate examples work with current versions

### 8.3 Contribution Guidelines
- Document how to add TSDoc comments
- Provide templates for common patterns
- Include documentation in code review checklist