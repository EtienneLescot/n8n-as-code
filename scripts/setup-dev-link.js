#!/usr/bin/env node

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.join(__dirname, '..');
const extensionSrcDir = path.join(rootDir, 'packages', 'vscode-extension');

// Determine home directory
const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
if (!homeDir) {
    console.error('❌ Could not determine home directory');
    process.exit(1);
}

function resolveVsCodeExtensionsDir(homePath) {
    const explicitAgentFolder = process.env.VSCODE_AGENT_FOLDER;
    if (explicitAgentFolder) {
        return path.join(explicitAgentFolder, 'extensions');
    }

    const envPathCandidates = [
        process.env.VSCODE_GIT_ASKPASS_MAIN,
        process.env.VSCODE_GIT_ASKPASS_NODE,
        process.env.VSCODE_GIT_ASKPASS_EXTRA_ARGS,
    ].filter(Boolean);

    for (const candidate of envPathCandidates) {
        // Example: ~/.vscode-server/bin/<commit>/extensions/git/dist/askpass-main.js
        const match = candidate.match(/(.*\/\.(?:vscode-server|vscode-server-insiders))\/bin\/[^/]+\//);
        if (match?.[1]) {
            return path.join(match[1], 'extensions');
        }
    }

    const remoteLike = Boolean(
        process.env.VSCODE_WSL_EXT_INFO ||
            process.env.REMOTE_CONTAINERS ||
            process.env.CODESPACES ||
            process.env.SSH_CONNECTION ||
            process.env.VSCODE_IPC_HOOK_CLI
    );

    const serverCandidates = [
        path.join(homePath, '.vscode-server', 'extensions'),
        path.join(homePath, '.vscode-server-insiders', 'extensions'),
    ];

    // In WSL Remote, the server dir exists and is the right target.
    if (process.env.WSL_DISTRO_NAME || remoteLike) {
        for (const serverDir of serverCandidates) {
            if (fs.existsSync(serverDir)) return serverDir;
        }
        // If we look remote-like but the folder isn't there yet, default to the stable server location.
        if (process.env.WSL_DISTRO_NAME) return serverCandidates[0];
    }

    return path.join(homePath, '.vscode', 'extensions');
}

const extensionsDir = resolveVsCodeExtensionsDir(homeDir);
const isRemote = extensionsDir.includes(`${path.sep}.vscode-server${path.sep}`) ||
    extensionsDir.includes(`${path.sep}.vscode-server-insiders${path.sep}`);

console.log(`📁 Using extensions directory: ${extensionsDir}`);
console.log(`🌐 Environment: ${isRemote ? 'Remote (VS Code Server)' : 'Local'}`);

// Create directory if it doesn't exist
if (!fs.existsSync(extensionsDir)) {
    console.log(`📂 Creating extensions directory at ${extensionsDir}`);
    try {
        fs.mkdirSync(extensionsDir, { recursive: true });
    } catch (err) {
        console.error(`❌ Failed to create extensions directory: ${err.message}`);
        process.exit(1);
    }
}

// Get extension info from package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(extensionSrcDir, 'package.json'), 'utf8'));
const extensionBaseId = `etienne-lescot.${packageJson.name}`;
const extensionId = `etienne-lescot.${packageJson.name}-${packageJson.version}`;
const targetLinkPath = path.join(extensionsDir, extensionId);

console.log(`🔗 Setting up dev link for ${extensionId}...`);

// 0. Remove any other installed versions of this extension in the same target directory
try {
    for (const entry of fs.readdirSync(extensionsDir)) {
        if (!entry.startsWith(`${extensionBaseId}-`)) continue;
        if (entry === extensionId) continue;

        const entryPath = path.join(extensionsDir, entry);
        console.log(`🧹 Removing old version at ${entryPath}`);
        fs.rmSync(entryPath, { recursive: true, force: true });
    }
} catch (err) {
    console.warn(`⚠️  Could not clean old versions: ${err.message}`);
}

// 1. Remove existing extension (folder or link)
if (fs.existsSync(targetLinkPath)) {
    console.log(`🗑️ Removing existing extension at ${targetLinkPath}`);
    fs.rmSync(targetLinkPath, { recursive: true, force: true });
}

// 2. Create symbolic link
try {
    // Determine link type based on platform
    const isWindows = process.platform === 'win32';
    const linkType = isWindows ? 'junction' : 'dir';
    // We need to link the whole directory because VS Code expects all files (package.json, out/, assets/)
    fs.symlinkSync(extensionSrcDir, targetLinkPath, linkType);
    console.log(`✅ Success! Created ${isWindows ? 'junction' : 'symlink'}:`);
    console.log(`   ${targetLinkPath} -> ${extensionSrcDir}`);
    console.log(`\n🚀 NEW WORKFLOW:`);
    console.log(`   1. Run: npm run build`);
    console.log(`   2. In VS Code: Press F1 → "Reload Window"`);
    console.log(`\nNo more VSIX packaging needed for dev!`);
} catch (error) {
    console.error(`❌ Failed to create symlink: ${error.message}`);
    console.error(`💡 On Windows, ensure Developer Mode is enabled or run as administrator.`);
    process.exit(1);
}
