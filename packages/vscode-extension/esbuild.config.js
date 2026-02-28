const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Read n8nac version at build time for pre-release detection
let n8nacVersion = 'unknown';
try {
    const n8nacPkg = require('./node_modules/n8nac/package.json');
    n8nacVersion = n8nacPkg.version;
} catch {
    // Fallback: read from workspace sibling
    try {
        const n8nacPkg = require('../cli/package.json');
        n8nacVersion = n8nacPkg.version;
    } catch { /* ignore */ }
}

// Plugin to copy skills assets and CLI assets
const copySkillsAssets = {
    name: 'copy-skills-assets',
    setup(build) {
        build.onEnd(() => {
            const skillsAssetsDir = path.join(
                __dirname,
                'node_modules',
                '@n8n-as-code',
                'skills',
                'dist',
                'assets'
            );

            // Fallback to local workspace for development
            const fallbackAssetsDir = path.join(__dirname, '..', 'skills', 'dist', 'assets');

            const sourceDir = fs.existsSync(skillsAssetsDir) ? skillsAssetsDir : fallbackAssetsDir;
            const targetDir = path.join(__dirname, 'assets');

            if (!fs.existsSync(sourceDir)) {
                console.warn('⚠️  skills assets not found, skipping copy');
            } else {
                // Create target directory
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }

                // Copy JSON files
                const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.json'));
                for (const file of files) {
                    const src = path.join(sourceDir, file);
                    const dest = path.join(targetDir, file);
                    fs.copyFileSync(src, dest);
                    console.log(`✅ Copied ${file} to assets/`);
                }
            }

        });
    }
};

// Build configuration for Extension
const extensionBuild = esbuild.build({
    entryPoints: ['./src/extension.ts'],
    bundle: true,
    outfile: 'out/extension.js',
    external: ['vscode', 'prettier'],
    format: 'cjs',
    platform: 'node',
    logOverride: {
        'empty-import-meta': 'silent'
    },
    define: {
        '__N8NAC_VERSION__': JSON.stringify(n8nacVersion)
    },
    plugins: [copySkillsAssets]
});

Promise.all([extensionBuild]).catch(() => process.exit(1));
