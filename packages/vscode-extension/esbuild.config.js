const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Plugin to copy agent-cli assets
const copyAgentCliAssets = {
    name: 'copy-agent-cli-assets',
    setup(build) {
        build.onEnd(() => {
            const agentCliAssetsDir = path.join(
                __dirname,
                'node_modules',
                '@n8n-as-code',
                'agent-cli',
                'dist',
                'assets'
            );
            
            // Fallback to local workspace for development
            const fallbackAssetsDir = path.join(__dirname, '..', 'agent-cli', 'dist', 'assets');
            
            const sourceDir = fs.existsSync(agentCliAssetsDir) ? agentCliAssetsDir : fallbackAssetsDir;
            const targetDir = path.join(__dirname, 'assets');

            if (!fs.existsSync(sourceDir)) {
                console.warn('⚠️  agent-cli assets not found, skipping copy');
                return;
            }

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
        });
    }
};

// Build configuration
esbuild.build({
    entryPoints: ['./src/extension.ts'],
    bundle: true,
    outfile: 'out/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    logOverride: {
        'empty-import-meta': 'silent'
    },
    plugins: [copyAgentCliAssets]
}).catch(() => process.exit(1));
