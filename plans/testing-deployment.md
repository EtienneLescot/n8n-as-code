# Testing Documentation Build and Deployment Process

## Overview
Comprehensive testing strategy for the n8n-as-code documentation system, covering build validation, deployment verification, and ongoing monitoring.

## 1. Build Testing

### 1.1 Local Build Validation
```bash
# Test script: scripts/test-docs-build.sh
#!/bin/bash
set -e

echo "🧪 Testing documentation build process..."

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf docs/api docs/build docs/static/api

# Build project
echo "Building project..."
npm run build

# Generate API documentation
echo "Generating API documentation..."
npm run docs:api

# Build Docusaurus site
echo "Building Docusaurus site..."
cd docs && npm run build

# Verify build output
echo "Verifying build output..."
if [ ! -d "build" ]; then
  echo "❌ Build directory not created"
  exit 1
fi

if [ ! -f "build/index.html" ]; then
  echo "❌ index.html not found"
  exit 1
fi

# Check for common issues
echo "Checking for common issues..."
if grep -r "404" build/; then
  echo "❌ Found 404 errors in build"
  exit 1
fi

echo "✅ Build test passed successfully!"
```

### 1.2 TypeDoc Generation Testing
```javascript
// scripts/test-typedoc.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('Testing TypeDoc generation...');

try {
  // Generate API docs
  execSync('npm run docs:api', { stdio: 'pipe' });
  
  // Check output directories
  const packages = ['core', 'cli', 'agent-cli', 'vscode-extension'];
  let allPassed = true;
  
  packages.forEach(pkg => {
    const pkgDir = path.join('docs/api', pkg);
    const indexFile = path.join(pkgDir, 'index.html');
    
    if (!fs.existsSync(pkgDir)) {
      console.log(`❌ Package directory missing: ${pkg}`);
      allPassed = false;
    }
    
    if (!fs.existsSync(indexFile)) {
      console.log(`❌ Index file missing: ${indexFile}`);
      allPassed = false;
    }
    
    // Check for empty directories
    const files = fs.readdirSync(pkgDir);
    if (files.length === 0) {
      console.log(`❌ Empty directory: ${pkgDir}`);
      allPassed = false;
    }
  });
  
  if (allPassed) {
    console.log('✅ TypeDoc generation test passed!');
  } else {
    process.exit(1);
  }
  
} catch (error) {
  console.error('❌ TypeDoc generation failed:', error.message);
  process.exit(1);
}
```

## 2. Deployment Testing

### 2.1 GitHub Actions Test Workflow
```yaml
# .github/workflows/test-docs.yml
name: Test Documentation Build

on:
  pull_request:
    paths:
      - 'docs/**'
      - 'packages/**'
      - 'scripts/**'
      - 'typedoc.json'
  push:
    branches: [main, develop]
  workflow_dispatch:

jobs:
  test-build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run build tests
        run: |
          chmod +x scripts/test-docs-build.sh
          ./scripts/test-docs-build.sh

      - name: Run TypeDoc tests
        run: node scripts/test-typedoc.js

      - name: Validate links
        run: |
          cd docs
          npm ci
          npx broken-link-checker --filter-level 3 --verbose

      - name: Lighthouse audit
        uses: treosh/lighthouse-ci-action@v10
        with:
          configPath: './.github/lighthouserc.json'
          uploadArtifacts: true
          temporaryPublicStorage: true

  test-deploy-preview:
    needs: test-build
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Build for preview
        run: |
          npm ci
          npm run build
          npm run docs:api
          cd docs && npm run build

      - name: Upload preview artifact
        uses: actions/upload-pages-artifact@v2
        with:
          path: ./docs/build

      - name: Deploy to GitHub Pages preview
        uses: actions/deploy-pages@v3
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          preview: true
```

### 2.2 Lighthouse Configuration
```json
{
  "ci": {
    "collect": {
      "staticDistDir": "./docs/build",
      "url": ["http://localhost:3000"],
      "numberOfRuns": 3
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", {"minScore": 0.9}],
        "categories:accessibility": ["error", {"minScore": 0.9}],
        "categories:best-practices": ["error", {"minScore": 0.9}],
        "categories:seo": ["error", {"minScore": 0.9}],
        "categories:pwa": ["warn", {"minScore": 0.5}]
      }
    }
  }
}
```

## 3. Content Validation

### 3.1 Markdown Validation
```javascript
// scripts/validate-markdown.js
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname } from 'path';
import { remark } from 'remark';
import remarkValidateLinks from 'remark-validate-links';

const DOCS_DIR = 'docs/docs';

function validateMarkdownFiles() {
  console.log('Validating Markdown files...');
  
  const files = collectMarkdownFiles(DOCS_DIR);
  let errors = 0;
  
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const issues = validateFile(file, content);
    
    if (issues.length > 0) {
      console.log(`\n${file}:`);
      issues.forEach(issue => console.log(`  ❌ ${issue}`));
      errors += issues.length;
    }
  }
  
  if (errors === 0) {
    console.log('✅ All Markdown files are valid!');
  } else {
    console.log(`\n❌ Found ${errors} validation issue(s)`);
    process.exit(1);
  }
}

function collectMarkdownFiles(dir) {
  const files = [];
  
  function traverse(currentDir) {
    const items = readdirSync(currentDir);
    
    items.forEach(item => {
      const fullPath = join(currentDir, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (extname(item) === '.md') {
        files.push(fullPath);
      }
    });
  }
  
  traverse(dir);
  return files;
}

function validateFile(filePath, content) {
  const issues = [];
  
  // Check for broken internal links
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  
  while ((match = linkRegex.exec(content)) !== null) {
    const [, text, link] = match;
    
    // Check for absolute links without protocol
    if (link.startsWith('/') && !link.startsWith('/docs/') && !link.startsWith('/api/')) {
      issues.push(`Absolute link may be broken: ${link}`);
    }
    
    // Check for empty links
    if (!link.trim()) {
      issues.push(`Empty link for text: "${text}"`);
    }
  }
  
  // Check for proper frontmatter
  if (!content.startsWith('---\n')) {
    issues.push('Missing frontmatter');
  }
  
  return issues;
}

validateMarkdownFiles();
```

### 3.2 API Documentation Validation
```javascript
// scripts/validate-api-docs.js
import fs from 'fs';
import path from 'path';

console.log('Validating API documentation...');

const API_DIR = 'docs/api';
const packages = ['core', 'cli', 'agent-cli', 'vscode-extension'];

let totalIssues = 0;

packages.forEach(pkg => {
  console.log(`\nChecking ${pkg}...`);
  const pkgDir = path.join(API_DIR, pkg);
  
  if (!fs.existsSync(pkgDir)) {
    console.log(`  ❌ Directory missing: ${pkgDir}`);
    totalIssues++;
    return;
  }
  
  // Check essential files
  const essentialFiles = [
    'index.html',
    'assets/style.css',
    'assets/highlight.css'
  ];
  
  essentialFiles.forEach(file => {
    const filePath = path.join(pkgDir, file);
    if (!fs.existsSync(filePath)) {
      console.log(`  ❌ Missing essential file: ${file}`);
      totalIssues++;
    }
  });
  
  // Check for empty documentation
  const modulesDir = path.join(pkgDir, 'modules');
  if (fs.existsSync(modulesDir)) {
    const modules = fs.readdirSync(modulesDir);
    if (modules.length === 0) {
      console.log(`  ⚠️  No modules documented for ${pkg}`);
    }
  }
});

if (totalIssues === 0) {
  console.log('\n✅ API documentation validation passed!');
} else {
  console.log(`\n❌ Found ${totalIssues} validation issue(s)`);
  process.exit(1);
}
```

## 4. Integration Testing

### 4.1 End-to-End Deployment Test
```yaml
# .github/workflows/e2e-deploy-test.yml
name: End-to-End Deployment Test

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to test'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production

jobs:
  deploy-and-test:
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install and build
        run: |
          npm ci
          npm run build
          npm run docs:api
          cd docs && npm ci && npm run build

      - name: Deploy to test environment
        run: |
          # Deployment logic here
          echo "Deploying to ${{ github.event.inputs.environment }}..."

      - name: Wait for deployment
        run: sleep 30

      - name: Test deployed site
        run: |
          SITE_URL="https://${{ github.event.inputs.environment }}.n8n-as-code.dev"
          
          # Test HTTP status
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" $SITE_URL)
          if [ "$STATUS" != "200" ]; then
            echo "❌ Site returned status $STATUS"
            exit 1
          fi
          
          # Test key pages
          PAGES=("/" "/docs/getting-started" "/api" "/docs/contributors")
          for page in "${PAGES[@]}"; do
            echo "Testing $page..."
            curl -s -f "$SITE_URL$page" > /dev/null || {
              echo "❌ Page failed: $page"
              exit 1
            }
          done
          
          echo "✅ All tests passed!"

      - name: Cleanup test deployment
        if: always()
        run: |
          echo "Cleaning up test deployment..."
```

## 5. Performance Testing

### 5.1 Load Testing Script
```javascript
// scripts/load-test-docs.js
import autocannon from 'autocannon';
import { writeFileSync } from 'fs';

const url = 'http://localhost:3000'; // Change for production

const instance = autocannon({
  url,
  connections: 10, // Concurrent connections
  duration: 30, // Test duration in seconds
  requests: [
    {
      method: 'GET',
      path: '/'
    },
    {
      method: 'GET',
      path: '/docs/getting-started'
    },
    {
      method: 'GET',
      path: '/api'
    }
  ]
}, (err, result) => {
  if (err) {
    console.error('Load test failed:', err);
    process.exit(1);
  }
  
  console.log('Load test results:');
  console.log(`Requests/sec: ${result.requests.average}`);
  console.log(`Latency (avg): ${result.latency.average}ms`);
  console.log(`Throughput: ${result.throughput.average} bytes/sec`);
  
  // Save results
  writeFileSync('load-test-results.json', JSON.stringify(result, null, 2));
  
  // Check performance thresholds
  if (result.latency.average > 1000) {
    console.log('❌ Average latency too high');
    process.exit(1);
  }
  
  if (result['2xx'] / result.requests.total < 0.99) {
    console.log('❌ Success rate below 99%');
    process.exit(1);
  }
  
  console.log('✅ Load test passed!');
});

// Track progress
autocannon.track(instance, { renderProgressBar: true });
```

## 6. Monitoring and Alerting

### 6.1 Health Check Endpoint
```javascript
// docs/src/pages/health.js
import React from 'react';

const HealthPage = () => {
  return null;
};

export async function getServerSideProps() {
  // Perform health checks
  const checks = {
    api_docs: checkApiDocs(),
    search: checkSearch(),
    build_time: checkBuildTime(),
  };
  
  const allHealthy = Object.values(checks).every(check => check.healthy);
  
  return {
    props: {
      status: allHealthy ? 'healthy' : 'unhealthy',
      checks,
      timestamp: new Date().toISOString(),
    },
  };
};

function checkApiDocs() {
  // Implementation
  return { healthy: true, message: 'API docs available' };
}

function checkSearch() {
  // Implementation
  return { healthy: true, message: 'Search functional' };
}

function checkBuildTime() {
  // Implementation
  return { healthy: true, message: 'Build within limits' };
}

export default HealthPage;
```

### 6.2 Alert Configuration
```yaml
# .github/workflows/alert-docs.yml
name: Documentation Alerts

on:
  schedule:
    - cron: '0 */6 * * *' # Every 6 hours
  workflow_dispatch:

jobs:
  alert:
    runs-on: ubuntu-latest
    steps:
      - name: Check documentation health
        run: |
          curl -s https://docs.n8n-as-code.dev/health | jq -r '.status'
          # If not healthy, send alert
          
      - name: Send alert on failure
        if: failure()
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: 'Documentation Health Check Failed',
              body: 'The documentation site health check failed. Please investigate.',
              labels: ['documentation', 'alert', 'health-check']
            })
```

## 7. Test Automation

### 7.1 Pre-commit Hooks
```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run test:docs",
      "commit-msg": "commitlint -E HUSKY_GIT_PARAMS"
    }
  },
  "scripts": {
    "test:docs": "npm run docs:validate && npm run docs:test-build",
    "docs:validate": "node scripts/validate-markdown.js && node scripts/validate-api-docs.js",
    "docs:test-build": "node scripts/test-typedoc.js"
  }
}
```

### 7.2 Continuous Testing Pipeline
```yaml
# .github/workflows/continuous-testing.yml
name: Continuous Documentation Testing

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [16, 18, 20]
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          
      - name: Run documentation tests
        run: |
          npm ci
          npm run test:docs
          
      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results-${{ matrix.node-version }}
          path: |
            test-results/
            coverage/
```

## 8. Test Reporting

### 8.1 Test Results Dashboard
Create a simple dashboard to track documentation quality:

```markdown
# Documentation Quality Dashboard

## Build Status
- Last build: [TIMESTAMP]
- Status: ✅/❌
- Build time: [DURATION]

## Test Coverage
- Markdown validation: ✅/❌
- Link validation: ✅/❌
- API docs generation: ✅/❌
- Performance: ✅/❌

## Performance Metrics
- Page load time: [TIME]ms
- Lighthouse score: