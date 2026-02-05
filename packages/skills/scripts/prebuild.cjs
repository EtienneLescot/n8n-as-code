const { execSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '../../..');
const scripts = [
  'ensure-n8n-cache.cjs',
  'generate-n8n-index.cjs',
  'download-complete-docs.cjs',
  'build-complete-index.cjs',
  'enrich-nodes-technical.cjs',
  'build-knowledge-index.cjs',
];

// Skip build-workflow-index.cjs on Windows because of invalid path characters
if (process.platform !== 'win32') {
  scripts.push('build-workflow-index.cjs');
} else {
  console.log('Skipping build-workflow-index.cjs on Windows due to filesystem restrictions.');
}

for (const script of scripts) {
  console.log(`Running ${script}...`);
  try {
    execSync(`node ${path.join(rootDir, 'scripts', script)}`, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Script ${script} failed:`, error.message);
    process.exit(1);
  }
}