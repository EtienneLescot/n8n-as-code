#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

console.log('🚀 Setting up Docusaurus documentation site for n8n-as-code...');

// Create docs directory if it doesn't exist
const docsDir = path.join(rootDir, 'docs');
if (!fs.existsSync(docsDir)) {
  console.log('Creating docs directory...');
  fs.mkdirSync(docsDir, { recursive: true });
}

// Check if Docusaurus is already initialized
const docusaurusConfig = path.join(docsDir, 'docusaurus.config.js');
if (fs.existsSync(docusaurusConfig)) {
  console.log('⚠️  Docusaurus appears to be already initialized. Skipping setup.');
  process.exit(0);
}

console.log('Initializing Docusaurus project with TypeScript...');
try {
  // Initialize Docusaurus project
  execSync('npx create-docusaurus@latest docs classic --typescript', { 
    stdio: 'inherit',
    cwd: rootDir
  });
  
  console.log('✅ Docusaurus project created successfully!');
  
  // Install additional dependencies
  console.log('Installing additional dependencies...');
  const dependencies = [
    '@docusaurus/theme-mermaid',
    'docusaurus-plugin-image-zoom',
    'prism-react-renderer',
    '@docusaurus/plugin-google-analytics',
    '@docusaurus/plugin-google-gtag',
    '@docusaurus/plugin-sitemap',
    '@easyops-cn/docusaurus-search-local', // Local search fallback
  ];
  
  execSync(`cd docs && npm install ${dependencies.join(' ')}`, { stdio: 'inherit' });
  
  // Install TypeDoc dependencies at root
  console.log('Installing TypeDoc dependencies...');
  const typedocDeps = [
    'typedoc',
    '@typedoc/plugin-cross-package-references',
    '@typedoc/plugin-versions',
  ];
  
  execSync(`npm install --save-dev ${typedocDeps.join(' ')}`, { stdio: 'inherit' });
  
  console.log('✅ All dependencies installed!');
  
  // Create basic directory structure
  console.log('Creating documentation directory structure...');
  const dirs = [
    'docs/docs/home',
    'docs/docs/getting-started',
    'docs/docs/usage/vscode-extension',
    'docs/docs/usage/cli',
    'docs/docs/usage/agent-cli',
    'docs/docs/usage/core',
    'docs/docs/contribution',
    'docs/docs/community',
    'docs/src/components',
    'docs/src/css',
    'docs/src/pages',
    'docs/static/img',
    'docs/static/api',
    'docs/static/downloads',
  ];
  
  dirs.forEach(dir => {
    const fullPath = path.join(rootDir, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });
  
  console.log('✅ Directory structure created!');
  
  console.log('\n🎉 Documentation setup complete!');
  console.log('\nNext steps:');
  console.log('1. cd docs');
  console.log('2. npm run start');
  console.log('3. Customize configuration in docusaurus.config.js');
  console.log('4. Add content to the docs/docs/ directory');
  
} catch (error) {
  console.error('❌ Setup failed:', error.message);
  process.exit(1);
}