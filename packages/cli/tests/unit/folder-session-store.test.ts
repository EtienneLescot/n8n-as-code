import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { ConfigService } from '../../src/services/config-service.js';

/**
 * The folder-login cookie is stored through the same secret store as API keys, so
 * it honours N8N_MANAGER_HOME. These tests confirm round-trip, clear, and — most
 * importantly — that a session never leaks across manager homes (so the unit suite
 * can't read a developer's real folder session).
 */
describe('ConfigService folder-login session store', () => {
    let prevManagerHome: string | undefined;
    let prevXdg: string | undefined;
    let managerHome: string;
    let workspaceRoot: string;
    let config: ConfigService;
    let targetId: string;

    function makeConfigWithEnv(root: string): { config: ConfigService; targetId: string } {
        const svc = new ConfigService(root);
        const env = svc.addEnvironment({
            name: 'Prod',
            environmentTarget: svc.ensureEmbeddedInstanceTarget({ name: 'Prod', url: 'https://n8n.example.test' }).id,
            projectId: 'personal',
            projectName: 'Personal',
            workflowsPath: 'workflows/prod',
        });
        return { config: svc, targetId: svc.resolveEnvironment(env.id).environmentTargetId };
    }

    beforeEach(() => {
        prevManagerHome = process.env.N8N_MANAGER_HOME;
        prevXdg = process.env.XDG_CONFIG_HOME;
        managerHome = mkdtempSync(path.join(tmpdir(), 'n8nac-fs-home-'));
        workspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-fs-ws-'));
        process.env.N8N_MANAGER_HOME = managerHome;
        process.env.XDG_CONFIG_HOME = managerHome;
        ({ config, targetId } = makeConfigWithEnv(workspaceRoot));
    });

    afterEach(() => {
        if (prevManagerHome === undefined) delete process.env.N8N_MANAGER_HOME;
        else process.env.N8N_MANAGER_HOME = prevManagerHome;
        if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
        else process.env.XDG_CONFIG_HOME = prevXdg;
    });

    it('round-trips a stored session', () => {
        const session = { cookie: 'n8n-auth=jwt', expiresAt: '2999-01-01T00:00:00.000Z', user: 'you@example.com' };
        config.saveFolderSession(targetId, session);
        expect(config.getFolderSession(targetId)).toEqual(session);
    });

    it('returns undefined when nothing is stored', () => {
        expect(config.getFolderSession(targetId)).toBeUndefined();
    });

    it('clears a stored session', () => {
        config.saveFolderSession(targetId, { cookie: 'n8n-auth=jwt' });
        config.clearFolderSession(targetId);
        expect(config.getFolderSession(targetId)).toBeUndefined();
    });

    it('ignores a stored value with the wrong shape', () => {
        // Simulate a tampered/corrupt secret-store entry (valid JSON, wrong type).
        (config as unknown as { manager: { saveApiKey(k: string, v: string): void } })
            .manager.saveApiKey(`folder-session:${targetId}`, JSON.stringify({ cookie: 123 }));
        expect(config.getFolderSession(targetId)).toBeUndefined();
    });

    it('does not leak a session across manager homes', () => {
        config.saveFolderSession(targetId, { cookie: 'n8n-auth=jwt' });

        // Point at a fresh, empty manager home — a new service must not see it.
        const otherHome = mkdtempSync(path.join(tmpdir(), 'n8nac-fs-home2-'));
        process.env.N8N_MANAGER_HOME = otherHome;
        process.env.XDG_CONFIG_HOME = otherHome;
        const otherWorkspace = mkdtempSync(path.join(tmpdir(), 'n8nac-fs-ws2-'));
        const { config: other, targetId: otherTargetId } = makeConfigWithEnv(otherWorkspace);

        expect(other.getFolderSession(otherTargetId)).toBeUndefined();
        expect(other.getFolderSession(targetId)).toBeUndefined();
    });
});
