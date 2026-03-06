#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const PACKAGE_PATHS = [
    'packages/transformer',
    'packages/skills',
    'packages/cli',
    'packages/vscode-extension'
];

const VERSION_FIELDS = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies'
];

function parseArgs(argv) {
    const args = {};

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith('--')) continue;

        const [rawKey, inlineValue] = token.slice(2).split('=', 2);
        if (inlineValue !== undefined) {
            args[rawKey] = inlineValue;
            continue;
        }

        const nextToken = argv[index + 1];
        if (!nextToken || nextToken.startsWith('--')) {
            args[rawKey] = true;
            continue;
        }

        args[rawKey] = nextToken;
        index += 1;
    }

    return args;
}

function readPackage(packagePath) {
    const filePath = path.join(rootDir, packagePath, 'package.json');
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { filePath, json, packagePath };
}

function writePackage(filePath, json) {
    fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
}

function toNextVersion(version, sha) {
    const stable = version.replace(/-next.*$/, '');
    return `${stable}-next.${sha}`;
}

function toVscodePrereleaseVersion(version, runNumber) {
    const stable = version.replace(/-next.*$/, '');
    const [major, stableMinor] = stable.split('.').map(Number);
    const prereleaseMinor = stableMinor + 1;
    return `${major}.${prereleaseMinor}.${runNumber}`;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const mode = args.mode;

    if (mode !== 'main' && mode !== 'next') {
        console.error('Expected --mode=main or --mode=next');
        process.exit(1);
    }

    if (mode === 'next' && typeof args.sha !== 'string') {
        console.error('Expected --sha when mode is next');
        process.exit(1);
    }

    if (mode === 'next' && typeof args['run-number'] !== 'string') {
        console.error('Expected --run-number when mode is next');
        process.exit(1);
    }

    const packages = PACKAGE_PATHS.map(readPackage);

    for (const pkg of packages) {
        if (mode === 'next') {
            if (pkg.packagePath === 'packages/vscode-extension') {
                pkg.json.version = toVscodePrereleaseVersion(pkg.json.version, args['run-number']);
            } else {
                pkg.json.version = toNextVersion(pkg.json.version, args.sha);
            }
        }
    }

    const workspaceVersions = new Map(packages.map((pkg) => [pkg.json.name, pkg.json.version]));

    for (const pkg of packages) {
        for (const field of VERSION_FIELDS) {
            const dependencies = pkg.json[field];
            if (!dependencies) continue;

            for (const dependencyName of Object.keys(dependencies)) {
                const workspaceVersion = workspaceVersions.get(dependencyName);
                if (!workspaceVersion) continue;
                dependencies[dependencyName] = workspaceVersion;
            }
        }

        writePackage(pkg.filePath, pkg.json);
        console.log(`${pkg.json.name} -> ${pkg.json.version}`);
    }
}

main();