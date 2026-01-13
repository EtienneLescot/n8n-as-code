# TypeDoc Configuration with Cross-References

## Overview
Complete configuration for TypeDoc to generate API documentation with cross-package references for the n8n-as-code monorepo.

## 1. Root Configuration Files

### 1.1 Root `typedoc.json`
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
  "plugin": [
    "@typedoc/plugin-cross-package-references",
    "@typedoc/plugin-versions"
  ],
  "theme": "default",
  "exclude": [
    "**/node_modules/**",
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/tests/**",
    "**/dist/**",
    "**/out/**"
  ],
  "excludePrivate": true,
  "excludeProtected": false,
  "excludeExternals": true,
  "readme": "none",
  "disableSources": false,
  "cleanOutputDir": true,
  "favicon": "../static/img/favicon.ico",
  "githubPages": false,
  "hideGenerator": false,
  "customCss": "./docs/api/css/custom.css",
  "crossPackageReferences": {
    "enabled": true,
    "packagePrefixes": {
      "@n8n-as-code/core": "core",
      "@n8n-as-code/cli": "cli",
      "@n8n-as-code/agent-cli": "agent-cli"
    }
  },
  "validation": {
    "notExported": true,
    "invalidLink": true,
    "notDocumented": false
  }
}
```

### 1.2 Root `tsconfig.typedoc.json`
```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": false,
    "noEmit": false,
    "outDir": "./dist-typedoc",
    "paths": {
      "@n8n-as-code/core": ["./packages/core/src"],
      "@n8n-as-code/cli": ["./packages/cli/src"],
      "@n8n-as-code/agent-cli": ["./packages/agent-cli/src"]
    }
  },
  "include": [
    "packages/**/src/**/*.ts"
  ],
  "exclude": [
    "packages/**/node_modules",
    "packages/**/dist",
    "packages/**/tests",
    "packages/**/*.test.ts",
    "packages/**/*.spec.ts"
  ]
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
  "customDescription": "Core library providing n8n API interactions, synchronization logic, and workflow sanitization.",
  "groupOrder": [
    "Classes",
    "Interfaces",
    "Functions",
    "Type Aliases",
    "Variables"
  ],
  "sort": ["source-order"],
  "visibilityFilters": {
    "protected": false,
    "private": false,
    "inherited": true,
    "external": false
  }
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
  "customDescription": "Command-line interface for managing n8n workflows with local file synchronization.",
  "groupOrder": [
    "Classes",
    "Interfaces",
    "Functions",
    "Type Aliases",
    "Variables"
  ],
  "sort": ["source-order"]
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
  "customDescription": "AI Agent tools for n8n workflow context generation, node schema retrieval, and snippet creation.",
  "groupOrder": [
    "Classes",
    "Interfaces",
    "Functions",
    "Type Aliases",
    "Variables"
  ],
  "sort": ["source-order"]
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
  "customDescription": "VS Code extension providing real-time n8n workflow synchronization and AI assistance.",
  "groupOrder": [
    "Classes",
    "Interfaces",
    "Functions",
    "Type Aliases",
    "Variables"
  ],
  "sort": ["source-order"]
}
```

## 3. Build Scripts

### 3.1 Documentation Generation Script (`scripts/generate-api-docs.js`)
```javascript
#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

console.log('🚀 Generating API documentation with TypeDoc...');

// Clean previous API docs
const apiDir = path.join(rootDir, 'docs/api');
if (fs.existsSync(apiDir)) {
  console.log('Cleaning previous API documentation...');
  fs.rmSync(apiDir, { recursive: true, force: true });
}

// Generate documentation
try {
  console.log('Running TypeDoc...');
  execSync('npx typedoc', { 
    stdio: 'inherit',
    cwd: rootDir
  });
  
  console.log('✅ TypeDoc generation completed successfully!');
  
  // Copy API docs to Docusaurus static directory
  const staticApiDir = path.join(rootDir, 'docs/static/api');
  if (fs.existsSync(staticApiDir)) {
    fs.rmSync(staticApiDir, { recursive: true, force: true });
  }
  
  console.log('Copying API docs to Docusaurus static directory...');
  fs.cpSync(apiDir, staticApiDir, { recursive: true });
  
  // Generate sidebar configuration from TypeDoc output
  generateSidebarConfig();
  
  console.log('✅ API documentation setup complete!');
  console.log('\n📁 Output locations:');
  console.log(`  - Raw TypeDoc output: ${apiDir}`);
  console.log(`  - Docusaurus static: ${staticApiDir}`);
  
} catch (error) {
  console.error('❌ TypeDoc generation failed:', error.message);
  process.exit(1);
}

function generateSidebarConfig() {
  console.log('Generating sidebar configuration...');
  
  const packages = ['core', 'cli', 'agent-cli', 'vscode-extension'];
  const sidebarConfig = {};
  
  packages.forEach(pkg => {
    const pkgApiDir = path.join(apiDir, pkg);
    if (fs.existsSync(pkgApiDir)) {
      const configPath = path.join(pkgApiDir, 'typedoc-sidebar.cjs');
      
      // Create a simple sidebar config for each package
      const configContent = `module.exports = [
  {
    type: 'link',
    label: 'Modules',
    href: '/api/${pkg}/modules'
  },
  {
    type: 'link',
    label: 'Classes',
    href: '/api/${pkg}/classes'
  },
  {
    type: 'link',
    label: 'Interfaces',
    href: '/api/${pkg}/interfaces'
  },
  {
    type: 'link',
    label: 'Functions',
    href: '/api/${pkg}/functions'
  },
  {
    type: 'link',
    label: 'Type Aliases',
    href: '/api/${pkg}/type-aliases'
  },
  {
    type: 'link',
    label: 'Variables',
    href: '/api/${pkg}/variables'
  }
];`;
      
      fs.writeFileSync(configPath, configContent);
      console.log(`  - Generated sidebar config for ${pkg}`);
    }
  });
}
```

### 3.2 Package.json Script Updates
Add to root `package.json`:
```json
{
  "scripts": {
    "docs:api": "node scripts/generate-api-docs.js",
    "docs:build": "npm run docs:api && cd docs && npm run build",
    "docs:dev": "npm run docs:api && cd docs && npm run start",
    "docs:validate": "node scripts/validate-tsdoc.js"
  },
  "devDependencies": {
    "typedoc": "^0.25.0",
    "@typedoc/plugin-cross-package-references": "^0.1.0",
    "@typedoc/plugin-versions": "^0.1.0"
  }
}
```

## 4. Cross-Reference Configuration

### 4.1 TypeDoc Plugin Setup
```bash
npm install --save-dev typedoc @typedoc/plugin-cross-package-references @typedoc/plugin-versions
```

### 4.2 Cross-Package Reference Examples

#### 4.2.1 Core Package TSDoc Example (`packages/core/src/services/n8n-api-client.ts`)
```typescript
/**
 * Client for interacting with the n8n REST API.
 * 
 * @example
 * ```typescript
 * import { N8nApiClient } from '@n8n-as-code/core';
 * 
 * const client = new N8nApiClient({
 *   host: 'https://n8n.example.com',
 *   apiKey: 'your-api-key'
 * });
 * 
 * const workflows = await client.getWorkflows();
 * ```
 * 
 * @see {@link SyncManager} for synchronization functionality
 * @see {@link @n8n-as-code/cli!WatchCommand} for CLI integration
 * @category API Client
 */
export class N8nApiClient {
  // Implementation...
}
```

#### 4.2.2 CLI Package TSDoc Example (`packages/cli/src/commands/watch.ts`)
```typescript
/**
 * Watch command for real-time synchronization.
 * 
 * This command uses the {@link @n8n-as-code/core!SyncManager} to monitor
 * file changes and synchronize with the n8n instance.
 * 
 * @example
 * ```bash
 * n8n-as-code watch
 * ```
 * 
 * @see {@link @n8n-as-code/core!N8nApiClient} for API interactions
 * @see {@link @n8n-as-code/core!StateManager} for state tracking
 * @category Commands
 */
export class WatchCommand {
  // Implementation...
}
```

## 5. Validation and Quality Assurance

### 5.1 TSDoc Validation Script (`scripts/validate-tsdoc.js`)
```javascript
#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const PACKAGES = ['core', 'cli', 'agent-cli', 'vscode-extension'];
const EXCLUDED_DIRS = ['node_modules', 'dist', 'tests', 'out'];
const EXCLUDED_FILES = ['.test.ts', '.spec.ts', '.d.ts'];

let issues = 0;

console.log('🔍 Validating TSDoc comments across packages...\n');

PACKAGES.forEach(packageName => {
  const packageDir = join(rootDir, 'packages', packageName, 'src');
  if (!statSync(packageDir).isDirectory()) return;
  
  console.log(`📦 Checking ${packageName}...`);
  
  const files = collectTypeScriptFiles(packageDir);
  
  files.forEach(file => {
    const content = readFileSync(file, 'utf8');
    const issuesInFile = validateTSDoc(file, content);
    issues += issuesInFile;
  });
});

console.log('\n' + '='.repeat(50));
if (issues === 0) {
  console.log('✅ All TSDoc comments are valid!');
} else {
  console.log(`❌ Found ${issues} TSDoc validation issue(s)`);
  process.exit(1);
}

function collectTypeScriptFiles(dir) {
  const files = [];
  
  function traverse(currentDir) {
    const items = readdirSync(currentDir);
    
    items.forEach(item => {
      const fullPath = join(currentDir, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        if (!EXCLUDED_DIRS.includes(item)) {
          traverse(fullPath);
        }
      } else if (extname(item) === '.ts') {
        if (!EXCLUDED_FILES.some(ext => item.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    });
  }
  
  traverse(dir);
  return files;
}

function validateTSDoc(filePath, content) {
  let fileIssues = 0;
  const lines = content.split('\n');
  
  // Check for exported classes/functions without TSDoc
  const exportRegex = /^(export\s+(class|function|interface|type|const|let)\s+(\w+))/;
  const tsdocRegex = /^\/\*\*\s*$/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const exportMatch = line.match(exportRegex);
    
    if (exportMatch) {
      const exportName = exportMatch[3];
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      
      // Check if previous line is a TSDoc comment
      if (!tsdocRegex.test(prevLine)) {
        console.log(`  ⚠️  ${filePath}:${i + 1} - Exported ${exportMatch[2]} "${exportName}" missing TSDoc`);
        fileIssues++;
      }
    }
  }
  
  return fileIssues;
}
```

### 5.2 Pre-commit Hook Configuration
Add to root `package.json`:
```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run docs:validate"
    }
  },
  "devDependencies": {
    "husky": "^8.0.0"
  }
}
```

## 6. Integration with Docusaurus

### 6.1 Docusaurus Plugin Configuration
Update `docs/docusaurus.config.js`:
```javascript
plugins: [
  [
    '@docusaurus/plugin-content-docs',
    {
      id: 'api',
      path: 'static/api',
      routeBasePath: 'api',
      sidebarPath: require.resolve('./sidebars.api.js'),
      editUrl: 'https://github.com/EtienneLescot/n8n-as-code/tree/main/',
      showLastUpdateAuthor: true,
      showLastUpdateTime: true,
      breadcrumbs: true,
    },
  ],
],
```

### 6.2 Custom CSS for API Documentation (`docs/src/css/api.css`)
```css
/* API documentation styling */
.api-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.api-package-header {
  background: linear-gradient(135deg, var(--ifm-color-primary) 0%, var(--ifm-color-primary-dark) 100%);
  color: white;
  padding: 2rem;
  border-radius: 0.5rem;
  margin-bottom: 2rem;
}

.api-package-header h1 {
  color: white;
  margin-bottom: 0.5rem;
}

.api-package-description {
  font-size: 1.1rem;
  opacity: 0.9;
}

/* Cross-reference styling */
.tsd-cross-package-ref {
  color: var(--ifm-color-primary);
  font-weight: 600;
  text-decoration: none;
  border-bottom: 1px dotted var(--ifm-color-primary-light);
}

.tsd-cross-package-ref:hover {
  color: var(--ifm-color-primary-dark);
  border-bottom-style: solid;
}

/* TypeDoc theme adjustments */
.tsd-page-title {
  border-bottom: 2px solid var(--ifm-color-emphasis-300);
  padding-bottom: 1rem;
  margin-bottom: 2rem;
}

.tsd-navigation {
  border-right: 1px solid var(--ifm-color-emphasis-300);
}

.tsd-signature {
  background-color: var(--ifm-color-emphasis-100);
  border-radius: 0.25rem;
  padding: 0.5rem;
  font