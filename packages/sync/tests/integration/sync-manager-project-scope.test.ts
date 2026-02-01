import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SyncManager } from '../../src/services/sync-manager.js';

/**
 * Integration-ish test: verifies SyncManager builds the project-scoped directory
 * and wires the watcher with the configured projectId.
 */

test('SyncManager initializes project-scoped directory and watcher projectId', async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-sync-'));

    try {
        const projectId = 'proj_123';
        const projectName = 'Test Project';
        const instanceIdentifier = 'inst_abc';

        const manager = new SyncManager({} as any, {
            directory: baseDir,
            pollIntervalMs: 1000,
            syncInactive: true,
            ignoredTags: [],
            syncMode: 'manual',
            instanceIdentifier,
            projectId,
            projectName,
        });

        await (manager as any).ensureInitialized();

        const expectedDir = path.join(baseDir, instanceIdentifier, 'test_project');
        assert.ok(fs.existsSync(expectedDir), `Expected directory to exist: ${expectedDir}`);

        const watcher = (manager as any).watcher;
        assert.ok(watcher, 'Watcher should be initialized');
        assert.strictEqual((watcher as any).projectId, projectId, 'Watcher should be scoped to the configured projectId');
        assert.strictEqual((watcher as any).directory, expectedDir, 'Watcher should watch the project-scoped directory');
    } finally {
        fs.rmSync(baseDir, { recursive: true, force: true });
    }
});
