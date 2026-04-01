const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Detect whether this is a pre-release (next) build.
// Stable builds → AGENTS.md will use `npx --yes n8nac <cmd>`
// Pre-release builds → AGENTS.md will use `npx --yes n8nac@next <cmd>`
const githubRef = process.env.GITHUB_REF || '';
let gitBranch = '';
try {
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: __dirname, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
} catch { /* ignore */ }
const n8nacVersion = (githubRef.includes('next') || gitBranch === 'next') ? 'next' : '';

// Read the n8nac CLI semver for the AGENTS.md version stamp.
let n8nacCliSemver = '';
try {
    const cliPkgCandidates = [
        path.join(__dirname, 'node_modules', 'n8nac', 'package.json'),
        path.join(__dirname, '..', 'cli', 'package.json'),
    ];
    for (const candidate of cliPkgCandidates) {
        if (fs.existsSync(candidate)) {
            n8nacCliSemver = JSON.parse(fs.readFileSync(candidate, 'utf8')).version || '';
            break;
        }
    }
} catch { /* ignore */ }

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

            // Copy n8n-workflows.d.ts so WorkspaceSetupService can locate it when
            // n8nac is bundled into out/extension.js (resolveAssetPath looks at
            // path.join(__dirname, '..', 'assets') relative to the bundle, which
            // resolves to the extension's top-level assets/ directory).
            //
            // Candidate paths (in order):
            //   1. node_modules/n8nac/dist/core/assets/ — installed npm package layout
            //      (n8nac package.json "files": ["dist/"], build copies the .d.ts there)
            //   2. ../cli/dist/core/assets/             — local workspace after `npm run build`
            //   3. ../cli/src/core/assets/              — local workspace source (dev fallback)
            const declarationFileCandidates = [
                path.join(__dirname, 'node_modules', 'n8nac', 'dist', 'core', 'assets', 'n8n-workflows.d.ts'),
                path.join(__dirname, '..', 'cli', 'dist', 'core', 'assets', 'n8n-workflows.d.ts'),
                path.join(__dirname, '..', 'cli', 'src', 'core', 'assets', 'n8n-workflows.d.ts'),
            ];
            const declarationFileSrc = declarationFileCandidates.find(p => fs.existsSync(p));
            if (!declarationFileSrc) {
                console.warn(
                    '⚠️  n8n-workflows.d.ts not found — WorkspaceSetupService will be unable to ' +
                    'write the TypeScript stub to user workspaces. Checked:\n' +
                    declarationFileCandidates.map(p => `  ${p}`).join('\n')
                );
            } else {
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }
                const declarationFileDest = path.join(targetDir, 'n8n-workflows.d.ts');
                fs.copyFileSync(declarationFileSrc, declarationFileDest);
                console.log('✅ Copied n8n-workflows.d.ts to assets/');
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
        // 'next' on pre-release builds, '' on stable — drives npx dist-tag in AGENTS.md
        '__N8NAC_VERSION__': JSON.stringify(n8nacVersion),
        // Installed n8nac CLI semver — stamped into AGENTS.md for stale-detection
        '__N8NAC_CLI_SEMVER__': JSON.stringify(n8nacCliSemver),
    },
    plugins: [copySkillsAssets]
});

Promise.all([extensionBuild]).catch(() => process.exit(1));
