import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { shouldAutoEnsureAiContext } from '../../src/utils/ai-context-policy.js';

const extensionPackage = JSON.parse(
    fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json'), 'utf8'),
) as { activationEvents?: string[] };
const extensionSource = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/extension.ts'),
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
