import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { shouldAutoEnsureAiContext } from '../../src/utils/ai-context-policy.js';

const extensionPackage = JSON.parse(
    fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json'), 'utf8'),
) as { activationEvents?: string[]; contributes?: { configuration?: { properties?: Record<string, { included?: boolean }> } } };
const extensionSource = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/extension.ts'),
    'utf8',
);
const esbuildSource = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../esbuild.config.js'),
    'utf8',
);
const proxyServiceSource = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/services/proxy-service.ts'),
    'utf8',
);

test('extension does not activate on every VS Code startup', () => {
    assert.ok(Array.isArray(extensionPackage.activationEvents));
    assert.ok(!extensionPackage.activationEvents?.includes('onStartupFinished'));
    assert.ok(extensionPackage.activationEvents?.includes('onView:n8n-explorer.workflows'));
    assert.ok(extensionPackage.activationEvents?.includes('workspaceContains:n8nac-config.json'));
});

test('configure command is registered before activation can initialize optional services', () => {
    const configureRegistration = extensionSource.indexOf("registerTelemetryCommand('n8n.configure'");
    const treeViewInitialization = extensionSource.indexOf('vscode.window.createTreeView');

    assert.ok(configureRegistration >= 0);
    assert.ok(treeViewInitialization >= 0);
    assert.ok(configureRegistration < treeViewInitialization);
});

test('fallback configure command never opens VS Code settings', () => {
    const fallbackConfigureRegistration = esbuildSource.indexOf("vscode.commands.registerCommand('n8n.configure'");
    const fallbackConfigureEnd = esbuildSource.indexOf("} catch (registrationError)", fallbackConfigureRegistration);

    assert.ok(fallbackConfigureRegistration >= 0);
    assert.ok(fallbackConfigureEnd > fallbackConfigureRegistration);
    assert.ok(!esbuildSource.slice(fallbackConfigureRegistration, fallbackConfigureEnd).includes('workbench.action.openSettings'));
});

test('extension runtime is loaded as ESM for ESM-only dependencies', () => {
    assert.ok(esbuildSource.includes("format: 'esm'"));
    assert.ok(esbuildSource.includes("runtime ??= import('./extension-runtime.mjs')"));
    assert.ok(!esbuildSource.includes("require('./extension-runtime"));
});

test('extension runtime source avoids CommonJS import assignments', () => {
    assert.ok(!proxyServiceSource.includes("import httpProxy = require('http-proxy')"));
});

test('all legacy n8n configuration properties are hidden from Settings UI', () => {
    const properties = extensionPackage.contributes?.configuration?.properties ?? {};
    const n8nProperties = Object.entries(properties).filter(([key]) => key.startsWith('n8n.'));

    assert.ok(n8nProperties.length > 0);
    for (const [key, property] of n8nProperties) {
        assert.strictEqual(property.included, false, `${key} must stay hidden; use the n8n settings webview instead`);
    }
});

test('AI context auto-refresh requires explicit workspace configuration', () => {
    assert.strictEqual(shouldAutoEnsureAiContext({
        workspaceRoot: '/workspace/project',
        snapshot: {
            workspaceRoot: '/workspace/project',
            hasWorkspaceConfig: false,
        },
    }), false);

    assert.strictEqual(shouldAutoEnsureAiContext({
        workspaceRoot: '/workspace/project',
        snapshot: {
            workspaceRoot: '/workspace/project',
            hasWorkspaceConfig: true,
        },
    }), true);

    assert.strictEqual(shouldAutoEnsureAiContext({
        workspaceRoot: '/workspace/project',
        snapshot: {
            workspaceRoot: '/workspace/project',
            hasWorkspaceConfig: true,
        },
    }), true);
});

test('sync initialization does not force-regenerate fresh AI context', () => {
    const updateFunction = extensionSource.slice(
        extensionSource.indexOf('async function updateAiContextAfterSyncInitialization'),
        extensionSource.indexOf('async function initializeSyncManager'),
    );

    assert.ok(updateFunction.includes("ensureAiContextFresh(context, 'sync-initialized'"), 'Sync init must still check AI context freshness');
    assert.ok(!updateFunction.includes('force: true'), 'Sync init should use freshness metadata instead of forcing regeneration');
});

test('sync event journal polling skips unchanged files', () => {
    const journalFunction = extensionSource.slice(
        extensionSource.indexOf('async function processSyncEventJournal'),
        extensionSource.indexOf('function trimProcessedSyncEvents'),
    );
    const resetFunction = extensionSource.slice(
        extensionSource.indexOf('function resetExtensionRuntimeState'),
        extensionSource.indexOf('async function determineInitialState'),
    );

    assert.ok(extensionSource.includes('const syncEventJournalSignatures = new Map<string, string>();'));
    assert.ok(journalFunction.includes('const signature = getFileChangeSignature(journalUri.fsPath);'));
    assert.ok(journalFunction.includes('syncEventJournalSignatures.get(journalUri.fsPath) === signature'));
    assert.ok(journalFunction.includes('return;'), 'unchanged journal polls should avoid rereading JSONL');
    assert.ok(journalFunction.includes('syncEventJournalSignatures.set(journalUri.fsPath, signature);'));
    assert.ok(extensionSource.includes('return `${stat.mtimeMs}:${stat.size}`;'));
    assert.ok(resetFunction.includes('syncEventJournalSignatures.clear();'));
});
