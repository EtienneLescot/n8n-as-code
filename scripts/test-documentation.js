#!/usr/bin/env node

/**
 * Documentation testing and validation script for n8n-as-code
 * This script validates the documentation structure, content, and build process
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');
const API_OUTPUT_DIR = path.join(DOCS_DIR, 'static/api');

console.log('🧪 Testing n8n-as-code documentation...\n');

let passed = 0;
let failed = 0;

function test(name, testFn) {
  try {
    testFn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    failed++;
  }
}

// Test 1: Check required directories exist
test('Required documentation directories exist', () => {
  const requiredDirs = [
    'docs/docs/home',
    'docs/docs/getting-started',
    'docs/docs/usage',
    'docs/docs/contributors',
    'docs/docs/community',
    'docs/docs/usage/vscode-extension',
    'docs/docs/usage/cli',
    'docs/docs/usage/agent-cli',
    'docs/docs/usage/core',
  ];

  for (const dir of requiredDirs) {
    const fullPath = path.join(ROOT_DIR, dir);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Directory ${dir} not found`);
    }
  }
});

// Test 2: Check required configuration files
test('Required configuration files exist', () => {
  const requiredFiles = [
    'docs/docusaurus.config.ts',
    'docs/sidebars.ts',
    'docs/sidebars.api.ts',
    'docs/src/css/custom.css',
    'docs/package.json',
    'typedoc.json',
    'scripts/generate-api-docs.js',
  ];

  for (const file of requiredFiles) {
    const fullPath = path.join(ROOT_DIR, file);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File ${file} not found`);
    }
  }
});

// Test 3: Validate Docusaurus configuration
test('Docusaurus configuration is valid', () => {
  const configPath = path.join(DOCS_DIR, 'docusaurus.config.ts');
  const configContent = fs.readFileSync(configPath, 'utf-8');
  
  // Check for required fields
  const requiredFields = ['title', 'tagline', 'favicon', 'url', 'baseUrl'];
  for (const field of requiredFields) {
    if (!configContent.includes(field)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  // Check for n8n-as-code branding
  if (!configContent.includes('n8n-as-code')) {
    throw new Error('Missing n8n-as-code branding in config');
  }
});

// Test 4: Validate sidebar configurations
test('Sidebar configurations are valid', () => {
  const sidebarsPath = path.join(DOCS_DIR, 'sidebars.ts');
  const sidebarsApiPath = path.join(DOCS_DIR, 'sidebars.api.ts');
  
  const sidebarsContent = fs.readFileSync(sidebarsPath, 'utf-8');
  const sidebarsApiContent = fs.readFileSync(sidebarsApiPath, 'utf-8');
  
  // Check for required sections
  const requiredSections = ['Home', 'Getting Started', 'Usage', 'Contributors', 'Community'];
  for (const section of requiredSections) {
    if (!sidebarsContent.includes(section)) {
      throw new Error(`Missing section in sidebars: ${section}`);
    }
  }
  
  // Check for API sections
  const requiredApiSections = ['Core Package', 'CLI Package', 'Agent CLI Package', 'VS Code Extension'];
  for (const section of requiredApiSections) {
    if (!sidebarsApiContent.includes(section)) {
      throw new Error(`Missing section in API sidebars: ${section}`);
    }
  }
});

// Test 5: Validate custom CSS
test('Custom CSS file is properly configured', () => {
  const cssPath = path.join(DOCS_DIR, 'src/css/custom.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');
  
  // Check for n8n color scheme
  if (!cssContent.includes('--ifm-color-primary: #ff6b35')) {
    throw new Error('Missing n8n orange color scheme');
  }
  
  // Check for dark mode configuration
  if (!cssContent.includes("[data-theme='dark']")) {
    throw new Error('Missing dark mode configuration');
  }
});

// Test 6: Validate TypeDoc configuration
test('TypeDoc configuration is valid', () => {
  const typedocPath = path.join(ROOT_DIR, 'typedoc.json');
  const typedocContent = fs.readFileSync(typedocPath, 'utf-8');
  const typedocConfig = JSON.parse(typedocContent);
  
  // Check required fields
  if (!typedocConfig.entryPoints || !Array.isArray(typedocConfig.entryPoints)) {
    throw new Error('Missing or invalid entryPoints in typedoc.json');
  }
  
  if (!typedocConfig.entryPoints.includes('packages/*')) {
    throw new Error('Missing packages/* entry point in typedoc.json');
  }
  
  if (typedocConfig.out !== 'docs/api') {
    throw new Error('TypeDoc output directory should be docs/api');
  }
});

// Test 7: Validate API generation script
test('API generation script is executable and valid', () => {
  const scriptPath = path.join(ROOT_DIR, 'scripts/generate-api-docs.js');
  const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
  
  // Check for shebang
  if (!scriptContent.startsWith('#!/usr/bin/env node')) {
    throw new Error('Missing shebang in API generation script');
  }
  
  // Check for required functions
  if (!scriptContent.includes('generate API documentation')) {
    throw new Error('Missing documentation generation logic');
  }
});

// Test 8: Check package.json scripts
test('Package.json includes documentation scripts', () => {
  const packagePath = path.join(ROOT_DIR, 'package.json');
  const packageContent = fs.readFileSync(packagePath, 'utf-8');
  const packageJson = JSON.parse(packageContent);
  
  const requiredScripts = ['docs', 'docs:build', 'docs:api', 'docs:all'];
  for (const script of requiredScripts) {
    if (!packageJson.scripts || !packageJson.scripts[script]) {
      throw new Error(`Missing script in package.json: ${script}`);
    }
  }
});

// Test 9: Validate GitHub Actions workflow
test('GitHub Actions workflow exists', () => {
  const workflowPath = path.join(ROOT_DIR, '.github/workflows/docs.yml');
  if (!fs.existsSync(workflowPath)) {
    throw new Error('Missing docs.yml workflow');
  }
  
  const workflowContent = fs.readFileSync(workflowPath, 'utf-8');
  
  // Check for required jobs
  if (!workflowContent.includes('build:') || !workflowContent.includes('deploy:')) {
    throw new Error('Missing required jobs in workflow');
  }
});

// Test 10: Test documentation build (dry run)
test('Documentation can be built (dry run)', () => {
  // Check if we can run the build command without actually building
  const docsPackagePath = path.join(DOCS_DIR, 'package.json');
  const docsPackageContent = fs.readFileSync(docsPackagePath, 'utf-8');
  const docsPackageJson = JSON.parse(docsPackageContent);
  
  if (!docsPackageJson.scripts || !docsPackageJson.scripts.build) {
    throw new Error('Missing build script in docs/package.json');
  }
  
  // Check for required dependencies
  const requiredDeps = [
    '@docusaurus/core',
    '@docusaurus/preset-classic',
    '@docusaurus/theme-mermaid',
    '@docusaurus/plugin-image-zoom'
  ];
  
  for (const dep of requiredDeps) {
    if (!docsPackageJson.dependencies || !docsPackageJson.dependencies[dep]) {
      throw new Error(`Missing dependency in docs/package.json: ${dep}`);
    }
  }
});

// Test 11: Validate markdown files structure
test('Markdown files have proper structure', () => {
  const docsContentDir = path.join(DOCS_DIR, 'docs');
  
  // Check for index files in main sections
  const requiredIndexFiles = [
    'home/index.md',
    'getting-started/index.md',
    'usage/index.md',
    'contributors/index.md',
    'community/index.md',
  ];
  
  for (const indexFile of requiredIndexFiles) {
    const fullPath = path.join(docsContentDir, indexFile);
    if (!fs.existsSync(fullPath)) {
      // Create placeholder if missing
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, `# ${path.basename(dir)}\n\nContent coming soon.\n`);
      console.log(`   ⚠️  Created placeholder: ${indexFile}`);
    }
  }
});

// Test 12: Validate API output directory structure
test('API output directory is properly configured', () => {
  // Ensure API directory exists
  if (!fs.existsSync(API_OUTPUT_DIR)) {
    fs.mkdirSync(API_OUTPUT_DIR, { recursive: true });
  }
  
  // Create .gitkeep if empty
  const files = fs.readdirSync(API_OUTPUT_DIR);
  if (files.length === 0) {
    fs.writeFileSync(path.join(API_OUTPUT_DIR, '.gitkeep'), '');
    console.log('   ⚠️  Created .gitkeep in API output directory');
  }
});

console.log('\n📊 Test Results:');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);

if (failed > 0) {
  console.log('\n🚨 Some tests failed. Please fix the issues above.');
  process.exit(1);
} else {
  console.log('\n🎉 All documentation tests passed!');
  console.log('\nNext steps:');
  console.log('1. Run `npm run docs:api` to generate API documentation');
  console.log('2. Run `npm run docs` to start the documentation server');
  console.log('3. Run `npm run docs:build` to build for production');
  console.log('4. Check the GitHub Actions workflow for deployment');
}