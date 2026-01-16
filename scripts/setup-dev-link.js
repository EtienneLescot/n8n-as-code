#!/usr/bin/env node

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.join(__dirname, '..');
const extensionSrcDir = path.join(rootDir, 'packages', 'vscode-extension');
const vscodeServerExtensionsDir = path.join(process.env.HOME, '.vscode-server', 'extensions');

if (!fs.existsSync(vscodeServerExtensionsDir)) {
    console.error(`❌ VS Code Server extensions directory not found at ${vscodeServerExtensionsDir}`);
    process.exit(1);
}

// Get extension info from package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(extensionSrcDir, 'package.json'), 'utf8'));
const extensionId = `etienne-lescot.${packageJson.name}-${packageJson.version}`;
const targetLinkPath = path.join(vscodeServerExtensionsDir, extensionId);

console.log(`🔗 Setting up dev link for ${extensionId}...`);

// 1. Remove existing extension (folder or link)
if (fs.existsSync(targetLinkPath)) {
    console.log(`🗑️ Removing existing extension at ${targetLinkPath}`);
    fs.rmSync(targetLinkPath, { recursive: true, force: true });
}

// 2. Create symbolic link
try {
    // We need to link the whole directory because VS Code expects all files (package.json, out/, assets/)
    fs.symlinkSync(extensionSrcDir, targetLinkPath, 'dir');
    console.log(`✅ Success! Created symlink:`);
    console.log(`   ${targetLinkPath} -> ${extensionSrcDir}`);
    console.log(`\n🚀 NEW WORKFLOW:`);
    console.log(`   1. Run: npm run build`);
    console.log(`   2. In VS Code: Press F1 → "Reload Window"`);
    console.log(`\nNo more VSIX packaging needed for dev!`);
} catch (error) {
    console.error(`❌ Failed to create symlink: ${error.message}`);
    process.exit(1);
}
