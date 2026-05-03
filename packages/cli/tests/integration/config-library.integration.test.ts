import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigService } from '../../src/services/config-service.js';

const tempDirs: string[] = [];
const previousManagerHome = process.env.N8N_MANAGER_HOME;

afterEach(() => {
    for (const dir of tempDirs) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
    if (previousManagerHome === undefined) {
        delete process.env.N8N_MANAGER_HOME;
    } else {
        process.env.N8N_MANAGER_HOME = previousManagerHome;
    }
});

function createWorkspaceDir(): string {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-config-library-'));
    tempDirs.push(workspaceDir);
    return workspaceDir;
}

function createManagerHome(): string {
    const managerHome = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-config-library-manager-'));
    tempDirs.push(managerHome);
    process.env.N8N_MANAGER_HOME = managerHome;
    return managerHome;
}

function createService(workspaceDir: string): ConfigService {
    return new ConfigService(workspaceDir);
}

function apiKeyForUser(userId: string): string {
    return `header.${Buffer.from(JSON.stringify({ sub: userId })).toString('base64url')}.signature`;
}

describe('ConfigService filesystem integration', () => {
    it('persists global instances and rehydrates the effective workspace context from disk', () => {
        const workspaceDir = createWorkspaceDir();
        createManagerHome();

        const configService = createService(workspaceDir);
        const testProfile = configService.saveLocalConfig({
            host: 'https://shared.example.com',
            syncFolder: 'workflows-test',
            projectId: 'project-test',
            projectName: 'Test',
            instanceIdentifier: 'n8n_f85ac825d1'
        }, {
            instanceName: 'Test'
        });
        const testApiKey = apiKeyForUser('test-user');
        const prodApiKey = apiKeyForUser('prod-user');
        configService.saveApiKey('https://shared.example.com', testApiKey, testProfile.id);

        const prodProfile = configService.saveLocalConfig({
            host: 'https://shared.example.com',
            syncFolder: 'workflows-prod',
            projectId: 'project-prod',
            projectName: 'Production',
            instanceIdentifier: 'n8n_1bfdd27c80'
        }, {
            instanceName: 'Production',
            createNew: true,
        });
        configService.saveApiKey('https://shared.example.com', prodApiKey, prodProfile.id);

        const reloaded = createService(workspaceDir);
        expect(reloaded.listInstances().map((instance) => instance.name).sort()).toEqual(['Production', 'Test']);
        expect(reloaded.getActiveInstance()?.id).toBe(prodProfile.id);
        expect(reloaded.getLocalConfig()).toMatchObject({
            host: 'https://shared.example.com',
            syncFolder: path.join(workspaceDir, 'workflows-prod'),
            projectId: 'project-prod',
            projectName: 'Production',
            workflowDir: path.join(workspaceDir, 'workflows-prod', 'n8n_1bfdd27c80', 'production')
        });
        expect(reloaded.getApiKey('https://shared.example.com', testProfile.id)).toBe(testApiKey);
        expect(reloaded.getApiKey('https://shared.example.com', prodProfile.id)).toBe(prodApiKey);

        reloaded.pinWorkspaceInstance(testProfile.id);

        const pinned = createService(workspaceDir);
        expect(pinned.getActiveInstance()?.id).toBe(testProfile.id);
        expect(pinned.getLocalConfig()).toMatchObject({
            syncFolder: path.join(workspaceDir, 'workflows-prod'),
            projectId: 'project-prod',
            projectName: 'Production',
            workflowDir: path.join(workspaceDir, 'workflows-prod', 'n8n_f85ac825d1', 'production')
        });

        const rawConfig = JSON.parse(fs.readFileSync(path.join(workspaceDir, 'n8nac-config.json'), 'utf-8'));
        expect(rawConfig).toMatchObject({
            version: 3,
            activeInstanceId: testProfile.id,
            syncFolder: 'workflows-prod',
            projectId: 'project-prod',
            projectName: 'Production',
        });
        expect(rawConfig.instances).toBeUndefined();
        expect(rawConfig.workflowDir).toBeUndefined();
    });

    it('deletes a global instance, removes its scoped secret, and promotes the next active instance when needed', () => {
        const workspaceDir = createWorkspaceDir();
        createManagerHome();

        const configService = createService(workspaceDir);
        const testProfile = configService.saveLocalConfig({
            host: 'https://shared.example.com',
            syncFolder: 'workflows-test',
            projectId: 'project-test',
            projectName: 'Test'
        }, {
            instanceName: 'Test'
        });
        const testApiKey = apiKeyForUser('test-user');
        const prodApiKey = apiKeyForUser('prod-user');
        configService.saveApiKey('https://shared.example.com', testApiKey, testProfile.id);

        const prodProfile = configService.saveLocalConfig({
            host: 'https://prod.example.com',
            syncFolder: 'workflows-prod',
            projectId: 'project-prod',
            projectName: 'Production'
        }, {
            instanceName: 'Production',
            createNew: true,
        });
        configService.saveApiKey('https://prod.example.com', prodApiKey, prodProfile.id);

        const deletion = configService.deleteInstance(prodProfile.id);

        expect(deletion.deletedInstance.id).toBe(prodProfile.id);
        expect(deletion.activeInstance?.id).toBe(testProfile.id);
        expect(configService.getApiKey('https://shared.example.com', testProfile.id)).toBe(testApiKey);
        expect(configService.getApiKey('https://prod.example.com', prodProfile.id)).toBeUndefined();

        const reloaded = createService(workspaceDir);
        expect(reloaded.getCurrentInstanceConfigId()).toBe(testProfile.id);
        expect(reloaded.listInstances()).toHaveLength(1);
        expect(reloaded.listInstances()[0].id).toBe(testProfile.id);
    });

    it('does not migrate legacy sidecar config files into the global instance store', () => {
        const workspaceDir = createWorkspaceDir();
        createManagerHome();
        fs.writeFileSync(path.join(workspaceDir, 'n8nac.json'), JSON.stringify({
            host: 'http://localhost:5678',
            syncFolder: 'workflows',
            projectId: 'project-1',
            projectName: 'Personal'
        }, null, 2));
        fs.writeFileSync(path.join(workspaceDir, 'n8nac-instance.json'), JSON.stringify({
            instanceIdentifier: 'legacy_identifier'
        }, null, 2));

        const configService = createService(workspaceDir);
        const workspaceConfig = configService.getWorkspaceConfig();

        expect(workspaceConfig.version).toBe(3);
        expect(workspaceConfig.instances).toHaveLength(0);
        expect(workspaceConfig.activeInstanceId).toBeUndefined();
        expect(fs.existsSync(path.join(workspaceDir, 'n8nac-config.json'))).toBe(false);
    });

    it('rejects a legacy mono-instance n8nac-config.json without automatic migration', () => {
        const workspaceDir = createWorkspaceDir();
        createManagerHome();
        fs.writeFileSync(path.join(workspaceDir, 'n8nac-config.json'), JSON.stringify({
            host: 'http://localhost:5678',
            syncFolder: 'workflows',
            projectId: 'project-1',
            projectName: 'Personal',
            instanceIdentifier: 'legacy_identifier'
        }, null, 2));

        const configService = createService(workspaceDir);

        expect(() => configService.getWorkspaceConfig()).toThrow(/Unsupported legacy n8n workspace config/);
    });
});
