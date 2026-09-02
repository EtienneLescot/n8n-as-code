const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
    collectRuntimeDependencyNames,
    HOST_PROVIDED_PACKAGES,
} = require('./scripts/runtime-dependency-names.cjs');

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
// Seed the traversal the same way it walks every other node, so the extension's own
// required peers and installed optional dependencies are copied too.
const runtimeDependencyRoots = collectRuntimeDependencyNames(
    JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'))
).filter(packageName => !HOST_PROVIDED_PACKAGES.has(packageName));
const legacyBundledSkillsAssetFiles = new Set([
    'n8n-docs-complete.json',
    'n8n-knowledge-index.json',
    'n8n-nodes-technical.json',
    'workflows-index.json',
]);

function packageNameToParts(packageName) {
    return packageName.startsWith('@') ? packageName.split('/') : [packageName];
}

function getPackageDir(packageName, fromDir) {
    const parts = packageNameToParts(packageName);
    try {
        const packageJsonPath = require.resolve(`${packageName}/package.json`, {
            paths: [fromDir, __dirname, path.join(__dirname, '..', '..')].filter(Boolean),
        });
        return path.dirname(packageJsonPath);
    } catch {
        // Fall back to direct node_modules probing below.
    }
    const candidates = [
        fromDir ? path.join(fromDir, 'node_modules', ...parts) : undefined,
        path.join(__dirname, '..', '..', 'node_modules', ...parts),
        path.join(__dirname, 'node_modules', ...parts),
    ].filter(Boolean);
    return candidates.find(candidate => fs.existsSync(path.join(candidate, 'package.json')));
}

function readPackageJson(packageDir) {
    return JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
}

function collectRuntimeDependencyClosure(packageNames) {
    const seenPackageDirs = new Set();
    const seenPackageNames = new Set();
    const queue = packageNames.map(packageName => ({ packageName, fromDir: __dirname }));

    while (queue.length > 0) {
        const entry = queue.shift();
        const packageName = entry?.packageName;
        if (!packageName) {
            continue;
        }

        const packageDir = getPackageDir(packageName, entry.fromDir);
        if (!packageDir) {
            console.warn(`⚠️  runtime dependency not installed, skipping copy: ${packageName}`);
            continue;
        }
        const realPackageDir = fs.realpathSync(packageDir);
        if (seenPackageDirs.has(realPackageDir)) {
            continue;
        }

        seenPackageDirs.add(realPackageDir);
        seenPackageNames.add(packageName);
        const copiedPackageDir = getPackageDir(packageName, __dirname);
        if (copiedPackageDir) {
            const realCopiedPackageDir = fs.realpathSync(copiedPackageDir);
            if (!seenPackageDirs.has(realCopiedPackageDir)) {
                queue.push({ packageName, fromDir: __dirname });
            }
        }
        const packageJson = readPackageJson(packageDir);
        const dependencyNames = collectRuntimeDependencyNames(packageJson)
            .filter(dependencyName => !HOST_PROVIDED_PACKAGES.has(dependencyName));
        for (const dependencyName of dependencyNames) {
            const dependencyDir = getPackageDir(dependencyName, realPackageDir);
            if (dependencyDir && !seenPackageDirs.has(fs.realpathSync(dependencyDir))) {
                queue.push({ packageName: dependencyName, fromDir: realPackageDir });
            }
        }
    }

    return [...seenPackageNames].sort();
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
    const runtimePath = path.join(__dirname, 'out', 'extension-runtime.mjs');
    const runtimeMapPath = path.join(__dirname, 'out', 'extension-runtime.mjs.map');
    const staleCommonJsRuntimePath = path.join(__dirname, 'out', 'extension-runtime.js');
    const staleCommonJsRuntimeMapPath = path.join(__dirname, 'out', 'extension-runtime.js.map');

    if (!fs.existsSync(extensionPath)) {
        throw new Error('out/extension.js is missing; run `npm run compile` before `npm run package-bundle`.');
    }

    fs.rmSync(runtimePath, { force: true });
    fs.rmSync(runtimeMapPath, { force: true });
    fs.rmSync(staleCommonJsRuntimePath, { force: true });
    fs.rmSync(staleCommonJsRuntimeMapPath, { force: true });

    esbuild.buildSync({
        entryPoints: ['./src/extension.ts'],
        bundle: true,
        outfile: runtimePath,
        format: 'esm',
        platform: 'node',
        target: ['node18'],
        packages: 'external',
        sourcemap: true,
        define: {
            __N8NAC_VERSION__: JSON.stringify(n8nacVersion),
            __N8NAC_CLI_SEMVER__: JSON.stringify(n8nacCliSemver),
        },
    });
    fs.rmSync(extensionMapPath, { force: true });

    fs.writeFileSync(extensionPath, `'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const path = require('node:path');
process.env.N8N_AS_CODE_ASSETS_DIR ??= path.join(__dirname, '..', 'assets');
let runtime;
function loadRuntime() {
  runtime ??= import('./extension-runtime.mjs');
  return runtime;
}
async function activate(context) {
  try {
    return await (await loadRuntime()).activate(context);
  } catch (error) {
    const vscode = require('vscode');
    const message = error && (error.stack || error.message) || String(error);
    const outputChannel = vscode.window.createOutputChannel('n8n-as-code');
    outputChannel.appendLine('[n8n] Failed to load extension runtime: ' + message);
    try {
      context.subscriptions.push(vscode.commands.registerCommand('n8n.configure', async () => {
        outputChannel.show(true);
        vscode.window.showErrorMessage('n8n as code could not load its full runtime. See the n8n-as-code output channel for details.');
      }));
    } catch (registrationError) {
      outputChannel.appendLine('[n8n] Failed to register fallback configure command: ' + ((registrationError && (registrationError.stack || registrationError.message)) || String(registrationError)));
    }
    vscode.window.showErrorMessage('n8n as code could not load its full runtime. See the n8n-as-code output channel for details.');
  }
}
function deactivate() {
  return runtime ? Promise.resolve(runtime).then((loadedRuntime) => typeof loadedRuntime.deactivate === 'function' ? loadedRuntime.deactivate() : undefined) : undefined;
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

    console.log('✅ Split VS Code extension entrypoint into out/extension.js and out/extension-runtime.mjs');
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
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
