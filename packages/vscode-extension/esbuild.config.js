const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const managerCoreAgentToolingPath = path.resolve(
    __dirname,
    '..',
    '..',
    'node_modules',
    '@n8n-as-code',
    'n8n-manager-core',
    'dist',
    'agent-tooling.js'
);
const managerCoreAgentToolingPaths = new Set([
    managerCoreAgentToolingPath,
    fs.existsSync(managerCoreAgentToolingPath) ? fs.realpathSync(managerCoreAgentToolingPath) : managerCoreAgentToolingPath,
]);
const runtimeDependencyRoots = [
    '@yagr/agent',
    '@yagr/provider-runtime',
    '@yagr/session-service',
    '@yagr/stream-adapter',
];

function packageNameToParts(packageName) {
    return packageName.startsWith('@') ? packageName.split('/') : [packageName];
}

function getPackageDir(packageName) {
    const parts = packageNameToParts(packageName);
    try {
        const packageJsonPath = require.resolve(`${packageName}/package.json`, {
            paths: [__dirname, path.join(__dirname, '..', '..')],
        });
        return path.dirname(packageJsonPath);
    } catch {
        // Fall back to direct node_modules probing below.
    }
    const candidates = [
        path.join(__dirname, '..', '..', 'node_modules', ...parts),
        path.join(__dirname, 'node_modules', ...parts),
    ];
    return candidates.find(candidate => fs.existsSync(path.join(candidate, 'package.json')));
}

function readPackageJson(packageDir) {
    return JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
}

function collectRuntimeDependencyClosure(packageNames) {
    const seen = new Set();
    const queue = [...packageNames];

    while (queue.length > 0) {
        const packageName = queue.shift();
        if (!packageName || seen.has(packageName)) {
            continue;
        }

        const packageDir = getPackageDir(packageName);
        if (!packageDir) {
            console.warn(`⚠️  runtime dependency not installed, skipping copy: ${packageName}`);
            continue;
        }

        seen.add(packageName);
        const packageJson = readPackageJson(packageDir);
        const dependencyNames = [
            ...Object.keys(packageJson.dependencies || {}),
            ...Object.keys(packageJson.optionalDependencies || {}),
        ];
        for (const dependencyName of dependencyNames) {
            if (!seen.has(dependencyName) && getPackageDir(dependencyName)) {
                queue.push(dependencyName);
            }
        }
    }

    return [...seen].sort();
}

function copyRuntimeDependency(packageName, targetNodeModulesDir) {
    const sourceDir = getPackageDir(packageName);
    if (!sourceDir) {
        return;
    }

    const targetDir = path.join(targetNodeModulesDir, ...packageNameToParts(packageName));
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.cpSync(fs.realpathSync(sourceDir), targetDir, {
        recursive: true,
        dereference: true,
    });
}

const preserveManagerCoreEntrypointResolution = {
    name: 'preserve-manager-core-entrypoint-resolution',
    setup(build) {
        build.onLoad({ filter: /agent-tooling\.js$/ }, async (args) => {
            if (!managerCoreAgentToolingPaths.has(path.resolve(args.path))) {
                return undefined;
            }
            const source = await fs.promises.readFile(args.path, 'utf8');
            return {
                contents: source.replace(
                    /import\.meta\.url/g,
                    'require("node:url").pathToFileURL(__filename).href'
                ),
                loader: 'js',
            };
        });
    }
};

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

            // Copy canonical agent skills so the bundled AiContextGenerator can
            // materialize .agents/skills in user workspaces. The bundled generator
            // resolves these relative to out/extension.js.
            const skillsDirCandidates = [
                path.join(__dirname, 'node_modules', '@n8n-as-code', 'skills', 'dist', 'agent-skills'),
                path.join(__dirname, '..', 'skills', 'src', 'agent-skills'),
                path.join(__dirname, '..', 'skills', 'dist', 'agent-skills'),
            ];
            const skillsDirSrc = skillsDirCandidates.find(p => fs.existsSync(p));
            const bundledSkillsTargetDir = path.join(__dirname, 'out', 'agent-skills');
            if (!skillsDirSrc) {
                console.warn(
                    '⚠️  agent skills not found — AiContextGenerator will be unable to ' +
                    'write .agents/skills to user workspaces. Checked:\n' +
                    skillsDirCandidates.map(p => `  ${p}`).join('\n')
                );
            } else {
                fs.rmSync(bundledSkillsTargetDir, { recursive: true, force: true });
                fs.cpSync(skillsDirSrc, bundledSkillsTargetDir, { recursive: true });
                console.log('✅ Copied agent skills to out/agent-skills/');
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

            const targetNodeModulesDir = path.join(__dirname, 'out', 'node_modules');
            fs.rmSync(targetNodeModulesDir, { recursive: true, force: true });
            const runtimeDependencies = collectRuntimeDependencyClosure(runtimeDependencyRoots);
            for (const packageName of runtimeDependencies) {
                copyRuntimeDependency(packageName, targetNodeModulesDir);
            }
            console.log(`✅ Copied ${runtimeDependencies.length} runtime dependencies to node_modules/`);
        });
    }
};

// Build configuration for Extension
const extensionBuild = esbuild.build({
    entryPoints: ['./src/extension.ts'],
    bundle: true,
    outfile: 'out/extension.js',
    external: ['vscode', 'prettier', '@yagr/*'],
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
    plugins: [preserveManagerCoreEntrypointResolution, copySkillsAssets]
});

const localOpenBridgeBuild = esbuild.build({
    entryPoints: ['./src/local-open-bridge-entrypoint.ts'],
    bundle: true,
    outfile: 'out/local-open-bridge-entrypoint.js',
    format: 'cjs',
    platform: 'node',
    plugins: [preserveManagerCoreEntrypointResolution]
});

Promise.all([extensionBuild, localOpenBridgeBuild]).catch(() => process.exit(1));
