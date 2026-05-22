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
const runtimeDependencyRoots = Object.keys(
    JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).dependencies || {}
);
const legacyBundledSkillsAssetFiles = new Set([
    'n8n-docs-complete.json',
    'n8n-knowledge-index.json',
    'n8n-nodes-technical.json',
    'workflows-index.json',
]);

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

    const realSourceDir = fs.realpathSync(sourceDir);
    const workspacePackagesDir = path.resolve(__dirname, '..');
    const packageJson = readPackageJson(realSourceDir);
    const isWorkspacePackage = realSourceDir.startsWith(`${workspacePackagesDir}${path.sep}`);

    if (isWorkspacePackage && Array.isArray(packageJson.files) && packageJson.files.length > 0) {
        fs.mkdirSync(targetDir, { recursive: true });
        fs.copyFileSync(path.join(realSourceDir, 'package.json'), path.join(targetDir, 'package.json'));
        for (const entry of packageJson.files) {
            if (entry.includes('*')) {
                continue;
            }
            const sourcePath = path.join(realSourceDir, entry);
            if (!fs.existsSync(sourcePath)) {
                continue;
            }
            const targetPath = path.join(targetDir, entry);
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            fs.cpSync(sourcePath, targetPath, { recursive: true, dereference: true });
        }
        const binEntries = typeof packageJson.bin === 'string'
            ? [packageJson.bin]
            : Object.values(packageJson.bin || {});
        for (const entry of binEntries) {
            const sourcePath = path.join(realSourceDir, entry);
            if (!fs.existsSync(sourcePath)) {
                continue;
            }
            const targetPath = path.join(targetDir, entry);
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            fs.cpSync(sourcePath, targetPath, { recursive: true, dereference: true });
        }
        return;
    }

    fs.cpSync(realSourceDir, targetDir, {
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

function copySkillsAssets() {
    const targetDir = path.join(__dirname, 'assets');

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    for (const file of legacyBundledSkillsAssetFiles) {
        fs.rmSync(path.join(targetDir, file), { force: true });
    }

    const skillsDirCandidates = [
        path.join(__dirname, 'node_modules', '@n8n-as-code', 'skills', 'dist', 'agent-skills'),
        path.join(__dirname, '..', 'skills', 'src', 'agent-skills'),
        path.join(__dirname, '..', 'skills', 'dist', 'agent-skills'),
    ];
    const skillsDirSrc = skillsDirCandidates.find(p => fs.existsSync(p));
    const bundledSkillsTargetDir = path.join(__dirname, 'out', 'agent-skills');
    if (!skillsDirSrc) {
        throw new Error(
            'agent skills not found — AiContextGenerator will be unable to ' +
            'write .agents/skills to user workspaces. Checked:\n' +
            skillsDirCandidates.map(p => `  ${p}`).join('\n')
        );
    } else {
        fs.rmSync(bundledSkillsTargetDir, { recursive: true, force: true });
        fs.cpSync(skillsDirSrc, bundledSkillsTargetDir, { recursive: true });
        console.log('✅ Copied agent skills to out/agent-skills/');
    }

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
}

function copyRuntimeDependencies() {
    const targetNodeModulesDir = path.join(__dirname, 'out', 'node_modules');
    fs.rmSync(targetNodeModulesDir, { recursive: true, force: true });
    const runtimeDependencies = collectRuntimeDependencyClosure(runtimeDependencyRoots);
    for (const packageName of runtimeDependencies) {
        copyRuntimeDependency(packageName, targetNodeModulesDir);
    }
    fs.rmSync(path.join(targetNodeModulesDir, '@n8n-as-code', 'skills', 'dist', 'assets'), { recursive: true, force: true });
    console.log(`✅ Copied ${runtimeDependencies.length} runtime dependencies to node_modules/`);
}

function writeSplitExtensionEntrypoint() {
    const extensionPath = path.join(__dirname, 'out', 'extension.js');
    const extensionMapPath = path.join(__dirname, 'out', 'extension.js.map');
    const runtimePath = path.join(__dirname, 'out', 'extension-runtime.js');
    const runtimeMapPath = path.join(__dirname, 'out', 'extension-runtime.js.map');

    if (!fs.existsSync(extensionPath)) {
        throw new Error('out/extension.js is missing; run `npm run compile` before `npm run package-bundle`.');
    }

    let runtimeSource = fs.readFileSync(extensionPath, 'utf8');
    const buildConstants = [
        `const __N8NAC_VERSION__ = ${JSON.stringify(n8nacVersion)};`,
        `const __N8NAC_CLI_SEMVER__ = ${JSON.stringify(n8nacCliSemver)};`,
    ].join('\n');
    runtimeSource = runtimeSource.replace(
        /^"use strict";\n/,
        `"use strict";\n${buildConstants}\n`
    );
    runtimeSource = runtimeSource.replace('//# sourceMappingURL=extension.js.map', '//# sourceMappingURL=extension-runtime.js.map');
    fs.writeFileSync(runtimePath, runtimeSource);

    if (fs.existsSync(extensionMapPath)) {
        fs.renameSync(extensionMapPath, runtimeMapPath);
    }

    fs.writeFileSync(extensionPath, `'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const path = require('node:path');
process.env.N8N_AS_CODE_ASSETS_DIR ??= path.join(__dirname, '..', 'assets');
let runtime;
function loadRuntime() {
  runtime ??= require('./extension-runtime.js');
  return runtime;
}
async function activate(context) {
  try {
    return await loadRuntime().activate(context);
  } catch (error) {
    const vscode = require('vscode');
    const message = error && (error.stack || error.message) || String(error);
    const outputChannel = vscode.window.createOutputChannel('n8n-as-code');
    outputChannel.appendLine('[n8n] Failed to load extension runtime: ' + message);
    context.subscriptions.push(vscode.commands.registerCommand('n8n.configure', async () => {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'n8n');
      vscode.window.showErrorMessage('n8n as code could not load its full runtime. See the n8n-as-code output channel for details.');
    }));
    vscode.window.showErrorMessage('n8n as code could not load its full runtime. See the n8n-as-code output channel for details.');
  }
}
function deactivate() {
  return runtime && typeof runtime.deactivate === 'function' ? runtime.deactivate() : undefined;
}
//# sourceMappingURL=extension.js.map
`);
    fs.writeFileSync(extensionMapPath, JSON.stringify({
        version: 3,
        file: 'extension.js',
        sources: ['extension.ts'],
        names: [],
        mappings: '',
    }));

    console.log('✅ Split VS Code extension entrypoint into out/extension.js and out/extension-runtime.js');
}

const localOpenBridgeBuild = esbuild.build({
    entryPoints: ['./src/local-open-bridge-entrypoint.ts'],
    bundle: true,
    outfile: 'out/local-open-bridge-entrypoint.js',
    format: 'cjs',
    platform: 'node',
    plugins: [preserveManagerCoreEntrypointResolution]
});

const settingsWebviewBuild = esbuild.build({
    entryPoints: ['./src/ui/settings-webview/app.tsx'],
    bundle: true,
    outfile: 'out/settings-webview.js',
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
});

Promise.all([localOpenBridgeBuild, settingsWebviewBuild])
    .then(() => {
        copySkillsAssets();
        copyRuntimeDependencies();
        writeSplitExtensionEntrypoint();
    })
    .catch(() => process.exit(1));
