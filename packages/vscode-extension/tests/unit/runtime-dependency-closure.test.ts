import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { findMissingRuntimeDependencies } from '../../scripts/verify-runtime-dependency-closure.mjs';

const require = createRequire(import.meta.url);
const { collectRequiredDependencyNames, collectRuntimeDependencyNames } =
    require('../../scripts/runtime-dependency-names.cjs') as {
        collectRequiredDependencyNames: (packageJson: unknown) => string[];
        collectRuntimeDependencyNames: (packageJson: unknown) => string[];
    };

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const extensionPackage = JSON.parse(
    fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
) as { dependencies?: Record<string, string> };

function writePackage(
    nodeModulesDir: string,
    name: string,
    packageJson: Record<string, unknown>,
): void {
    const packageDir = path.join(nodeModulesDir, ...(name.startsWith('@') ? name.split('/') : [name]));
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
        path.join(packageDir, 'package.json'),
        JSON.stringify({ name, version: '1.0.0', ...packageJson }),
    );
}

test('required peer dependencies are part of the packaged closure', () => {
    // Regression guard for #566: `@langchain/anthropic` declares `@langchain/core` as a
    // peer, so a closure walking only `dependencies` shipped a VSIX without it.
    const names = collectRuntimeDependencyNames({
        dependencies: { '@anthropic-ai/sdk': '^0.103.0' },
        peerDependencies: { '@langchain/core': '^1.2.1' },
    });

    assert.deepStrictEqual(names.sort(), ['@anthropic-ai/sdk', '@langchain/core']);
});

test('optional peer dependencies are neither copied nor required', () => {
    const packageJson = {
        dependencies: { always: '^1.0.0' },
        peerDependencies: { 'maybe-installed': '^1.0.0', 'must-be-installed': '^1.0.0' },
        peerDependenciesMeta: { 'maybe-installed': { optional: true } },
    };

    assert.deepStrictEqual(collectRequiredDependencyNames(packageJson).sort(), [
        'always',
        'must-be-installed',
    ]);
    assert.ok(!collectRuntimeDependencyNames(packageJson).includes('maybe-installed'));
});

test('optionalDependencies are copied when installed but never required', () => {
    const packageJson = {
        dependencies: { always: '^1.0.0' },
        optionalDependencies: { 'platform-binary': '^1.0.0' },
    };

    assert.deepStrictEqual(collectRequiredDependencyNames(packageJson), ['always']);
    assert.deepStrictEqual(collectRuntimeDependencyNames(packageJson).sort(), [
        'always',
        'platform-binary',
    ]);
});

test('the closure verifier reports a packaged package missing a required peer', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-closure-'));
    try {
        const nodeModulesDir = path.join(tempRoot, 'node_modules');
        writePackage(nodeModulesDir, '@scope/consumer', {
            peerDependencies: { '@scope/peer': '^1.0.0' },
        });

        assert.deepStrictEqual(findMissingRuntimeDependencies(nodeModulesDir), [
            '@scope/consumer -> @scope/peer',
        ]);

        writePackage(nodeModulesDir, '@scope/peer', {});
        assert.deepStrictEqual(findMissingRuntimeDependencies(nodeModulesDir), []);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('the closure verifier ignores peers supplied by the VS Code host', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-closure-host-'));
    try {
        const nodeModulesDir = path.join(tempRoot, 'node_modules');
        writePackage(nodeModulesDir, 'host-consumer', { peerDependencies: { vscode: '^1.85.0' } });

        assert.deepStrictEqual(findMissingRuntimeDependencies(nodeModulesDir), []);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('@langchain/core is declared as a direct dependency', () => {
    // The runtime imports it directly (`importRuntimeModule('@langchain/core/messages')`),
    // so it must not rely on peer hoisting from another LangChain package.
    assert.ok(extensionPackage.dependencies?.['@langchain/core']);
});
