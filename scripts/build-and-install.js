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

// Detect environment
let isWsl = false;
let isRemoteWsl = false;

try {
    const unameOutput = execSync('uname -a').toString().toLowerCase();
    isWsl = unameOutput.includes('microsoft') || unameOutput.includes('wsl');
    
    // Check if we're in a VS Code WSL remote session
    if (process.env.VSCODE_WSL_EXT_INFO || process.env.WSL_DISTRO_NAME) {
        isRemoteWsl = true;
    }
} catch (e) {
    // Not in a WSL environment or uname not available
}

try {
    console.log('🔧 Rebuilding the extension...');
    execSync('npm run build', {
        cwd: extensionDir,
        stdio: 'inherit'
    });

    console.log('📦 Packaging the extension...');
    
    // Read package.json
    const packageJsonPath = path.join(extensionDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const originalPrepublish = packageJson.scripts['vscode:prepublish'];
    
    // Temporarily disable the prepublish script to avoid infinite build loop
    packageJson.scripts['vscode:prepublish'] = 'echo "Prepublish disabled for packaging"';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    
    try {
        // Use npx to ensure vsce is available
        // Added --no-dependencies to avoid "invalid relative path" errors with symlinked packages in monorepo
        execSync(`npx @vscode/vsce package --out "${vsixName}" --no-dependencies`, {
            cwd: extensionDir,
            stdio: 'inherit'
        });
    } finally {
        // Restore original prepublish script
        packageJson.scripts['vscode:prepublish'] = originalPrepublish;
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }

    console.log('📁 Installing the extension...');
    
    if (isRemoteWsl) {
        console.log('🌐 Detected WSL remote environment.');
        
        // Try to use the local vsix path relative to the current dir,
        // as absolute WSL paths often confuse the 'code' command relay.
        const relativeVsixPath = path.relative(process.cwd(), vsixPath);
        
        console.log(`\n🔄 Attempting installation using: code --install-extension ${vsixPath} --force`);
        try {
            // In WSL Remote, 'code' command can be tricky.
            // We try to run it without ELECTRON_RUN_AS_NODE first as it might be a wrapper script.
            execSync(`code --install-extension "${vsixPath}" --force`, {
                stdio: 'inherit'
            });
            console.log('\n✅ Extension installation successful.');
        } catch (installError) {
            console.warn('\n❌ Automatic installation failed with default "code" command.');
            
            try {
                console.log('🔄 Trying with "code-insiders"...');
                execSync(`code-insiders --install-extension "${vsixPath}" --force`, {
                    stdio: 'inherit'
                });
                console.log('\n✅ Extension installed using code-insiders.');
            } catch (e) {
                console.warn('\n❌ All automatic installation attempts failed.');
                console.log(`💡 Manual installation instructions:`);
                console.log(`   1. Copy this path: ${vsixPath}`);
                console.log(`   2. In VS Code, press F1, type "Install from VSIX"`);
                console.log(`   3. Paste the path and press Enter.`);
            }
        }
    } else if (isWsl) {
        console.log('🐧 Detected WSL environment (but not in VS Code remote).');
        console.log('💡 Converting path for Windows VS Code...');
        
        try {
            // Convert WSL path to Windows path
            const windowsVsixPath = execSync(`wslpath -w "${vsixPath}"`).toString().trim();
            console.log(`📦 VSIX path (Windows): ${windowsVsixPath}`);
            
            // Try to install in Windows VS Code
            try {
                execSync(`code --install-extension "${windowsVsixPath}" --force`, {
                    stdio: 'inherit'
                });
                console.log('\n✅ Extension installed in Windows VS Code!');
                console.log('💡 If you want to use it in WSL remote, switch to a WSL window and install it there too.');
            } catch (installError) {
                console.warn('\n⚠️  Could not install in Windows VS Code.');
                console.warn(`💡 You can install it manually:`);
                console.warn(`   1. Open VS Code (Windows)`);
                console.warn(`   2. Go to Extensions view (Ctrl+Shift+X)`);
                console.warn(`   3. Click "..." menu → "Install from VSIX..."`);
                console.warn(`   4. Select the VSIX file from: ${windowsVsixPath}`);
            }
        } catch (wslpathError) {
            console.warn('\n⚠️  Could not convert WSL path to Windows path.');
            console.warn(`💡 VSIX file is at: ${vsixPath}`);
            console.warn('   Install it manually from VS Code.');
        }
    } else {
        // Regular Linux/macOS/Windows environment
        try {
            execSync(`code --install-extension "${vsixPath}" --force`, {
                stdio: 'inherit'
            });
            console.log('\n✅ Extension installed successfully!');
        } catch (installError) {
            console.warn('\n⚠️  Could not automatically install the extension via "code" command.');
            console.warn(`💡 You can install it manually by running: code --install-extension "${vsixPath}" --force`);
            console.warn('   Or by dragging the VSIX file into VS Code.');
        }
    }

    console.log('\n💡 To apply changes, reload VS Code (via Command Palette "Reload Window")');

} catch (error) {
    console.error('\n❌ Error during build and install process:');
    console.error(error.message);
    process.exit(1);
}
