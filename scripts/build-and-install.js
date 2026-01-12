#!/usr/bin/env node

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const extensionDir = path.join(__dirname, '..', 'packages', 'vscode-extension');
const vsixName = 'n8n-as-code.vsix';
let vsixPath = path.join(extensionDir, vsixName);

// Handle WSL path conversion if necessary
try {
    const isWsl = execSync('uname -a').toString().includes('microsoft');
    if (isWsl) {
        vsixPath = execSync(`wslpath -w "${vsixPath}"`).toString().trim();
    }
} catch (e) {
    // Not in a WSL environment or wslpath not available, stick to local path
}

try {
    console.log('🔧 Rebuilding the extension...');
    execSync('npm run build', {
        cwd: extensionDir,
        stdio: 'inherit'
    });

    console.log('📦 Packaging the extension...');
    // Use npx to ensure vsce is available
    // Added --no-dependencies to avoid "invalid relative path" errors with symlinked packages in monorepo
    execSync(`npx @vscode/vsce package --out "${vsixName}" --no-dependencies`, {
        cwd: extensionDir,
        stdio: 'inherit'
    });

    console.log('📁 Installing the extension...');
    try {
        execSync(`code --install-extension "${vsixPath}"`, {
            stdio: 'inherit'
        });
    } catch (installError) {
        console.warn('\n⚠️  Could not automatically install the extension via "code" command.');
        console.warn(`💡 You can install it manually by running: code --install-extension "${vsixPath}"`);
        console.warn('   Or by dragging the VSIX file into VS Code.');
    }

    console.log('\n✅ Extension installed successfully!');
    console.log('💡 To apply changes Reload VS Code (via Command Palette "Reload Window" or your custom shortcut');

} catch (error) {
    console.error('\n❌ Error during build and install process:');
    console.error(error.message);
    process.exit(1);
}
