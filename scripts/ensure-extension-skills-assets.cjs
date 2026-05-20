const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const REQUIRED_ASSETS = [
    'n8n-docs-complete.json',
    'n8n-knowledge-index.json',
    'n8n-nodes-technical.json',
    'workflows-index.json',
];

const candidateDirs = [
    path.join(ROOT_DIR, 'packages', 'skills', 'dist', 'assets'),
    path.join(ROOT_DIR, 'packages', 'skills', 'src', 'assets'),
    path.join(ROOT_DIR, 'packages', 'vscode-extension', 'assets'),
];

function hasRequiredAssets(dir) {
    return REQUIRED_ASSETS.every(file => fs.existsSync(path.join(dir, file)));
}

function rel(filePath) {
    return path.relative(ROOT_DIR, filePath) || '.';
}

const existingAssetsDir = candidateDirs.find(hasRequiredAssets);
if (existingAssetsDir) {
    console.log(`✅ Skills assets available at ${rel(existingAssetsDir)}`);
    process.exit(0);
}

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] || '0', 10);
if (nodeMajor >= 26) {
    console.error(
        '❌ Skills assets are missing and Node 26 cannot currently build n8n\'s isolated-vm dependency.\n' +
        '   Use Node 22 for the first asset generation, for example:\n' +
        '   npx -y -p node@22 -p pnpm@10.32.1 npm run build:extension',
    );
    process.exit(1);
}

console.log('🧱 Skills assets are missing; generating them from packages/skills...');
const result = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'build', '--workspace=packages/skills'],
    {
        cwd: ROOT_DIR,
        stdio: 'inherit',
        env: process.env,
    },
);

process.exit(result.status ?? 1);
