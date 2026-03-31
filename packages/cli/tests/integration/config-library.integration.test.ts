import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '../../src/services/config-service.js';

const tempDirs: string[] = [];

afterEach(() => {
    for (const dir of tempDirs) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
});

function createWorkspaceDir(): string {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-config-library-'));
    tempDirs.push(workspaceDir);
    return workspaceDir;
}

function createService(workspaceDir: string, state?: Record<string, any>): ConfigService {
    const configService = new ConfigService(workspaceDir) as ConfigService & {
        globalStore: {
            get: ReturnType<typeof vi.fn>;
            set: ReturnType<typeof vi.fn>;
        };
    };
    const storeState = state || { hosts: {}, instanceProfiles: {} };
    configService.globalStore = {
        get: vi.fn((key: string) => storeState[key]),
        set: vi.fn((key: string, value: unknown) => {
            storeState[key] = value;
        })
    };
    return configService;
}

describe('ConfigService filesystem integration', () => {
    it('persists multiple instance configs and rehydrates the active instance from disk', () => {
        const workspaceDir = createWorkspaceDir();
        const storeState = { hosts: {}, instanceProfiles: {} };

        const configService = createService(workspaceDir, storeState);
        const testProfile = configService.saveLocalConfig({
            host: 'https://shared.example.com',
            syncFolder: 'workflows-test',
            projectId: 'project-test',
            projectName: 'Test'
        }, {
            instanceName: 'Test'
        });
        configService.saveApiKey('https://shared.example.com', 'test-key', testProfile.id);

        const prodProfile = configService.saveLocalConfig({
            host: 'https://shared.example.com',
            syncFolder: 'workflows-prod',
            projectId: 'project-prod',
            projectName: 'Production'
        }, {
            instanceName: 'Production',
            createNew: true,
        });
        configService.saveApiKey('https://shared.example.com', 'prod-key', prodProfile.id);

        const reloaded = createService(workspaceDir, storeState);
        expect(reloaded.listInstances().map((instance) => instance.name).sort()).toEqual(['Production', 'Test']);
        expect(reloaded.getActiveInstance()?.id).toBe(prodProfile.id);
        expect(reloaded.getLocalConfig()).toMatchObject({
            host: 'https://shared.example.com',
            syncFolder: 'workflows-prod',
            projectId: 'project-prod',
            projectName: 'Production'
        });
        expect(reloaded.getApiKey('https://shared.example.com', testProfile.id)).toBe('test-key');
        expect(reloaded.getApiKey('https://shared.example.com', prodProfile.id)).toBe('prod-key');

        reloaded.setActiveInstance(testProfile.id);

        const switched = createService(workspaceDir, storeState);
        expect(switched.getActiveInstance()?.id).toBe(testProfile.id);
        expect(switched.getLocalConfig()).toMatchObject({
            syncFolder: 'workflows-test',
            projectId: 'project-test',
            projectName: 'Test'
        });

        const rawConfig = JSON.parse(fs.readFileSync(path.join(workspaceDir, 'n8nac-config.json'), 'utf-8'));
        expect(rawConfig.version).toBe(2);
        expect(rawConfig.instances).toHaveLength(2);
        expect(rawConfig.activeInstanceId).toBe(testProfile.id);
        expect(rawConfig.syncFolder).toBe('workflows-test');
    });

    it('deletes an instance, removes its scoped secret, and promotes the next active instance when needed', () => {
        const workspaceDir = createWorkspaceDir();
        const storeState = { hosts: {}, instanceProfiles: {} as Record<string, string> };

        const configService = createService(workspaceDir, storeState);
        const testProfile = configService.saveLocalConfig({
            host: 'https://shared.example.com',
            syncFolder: 'workflows-test',
            projectId: 'project-test',
            projectName: 'Test'
        }, {
            instanceName: 'Test'
        });
        configService.saveApiKey('https://shared.example.com', 'test-key', testProfile.id);

        const prodProfile = configService.saveLocalConfig({
            host: 'https://prod.example.com',
            syncFolder: 'workflows-prod',
            projectId: 'project-prod',
            projectName: 'Production'
        }, {
            instanceName: 'Production',
            createNew: true,
        });
        configService.saveApiKey('https://prod.example.com', 'prod-key', prodProfile.id);

        const deletion = configService.deleteInstance(prodProfile.id);

        expect(deletion.deletedInstance.id).toBe(prodProfile.id);
        expect(deletion.activeInstance?.id).toBe(testProfile.id);
        expect(storeState.instanceProfiles).toEqual({
            [testProfile.id]: 'test-key',
        });

        const reloaded = createService(workspaceDir, storeState);
        expect(reloaded.getActiveInstance()?.id).toBe(testProfile.id);
        expect(reloaded.listInstances()).toHaveLength(1);
        expect(reloaded.listInstances()[0].id).toBe(testProfile.id);
        expect(storeState.instanceProfiles[prodProfile.id]).toBeUndefined();
    });

    it('migrates legacy config files into the unified instance library on first read', () => {
        const workspaceDir = createWorkspaceDir();
        fs.writeFileSync(path.join(workspaceDir, 'n8nac.json'), JSON.stringify({
            host: 'http://localhost:5678',
            syncFolder: 'workflows',
            projectId: 'project-1',
            projectName: 'Personal'
        }, null, 2));
        fs.writeFileSync(path.join(workspaceDir, 'n8nac-instance.json'), JSON.stringify({
            instanceIdentifier: 'legacy_identifier'
        }, null, 2));

        const configService = createService(workspaceDir, { hosts: {}, instanceProfiles: {} });
        const workspaceConfig = configService.getWorkspaceConfig();

        expect(workspaceConfig.version).toBe(2);
        expect(workspaceConfig.instances).toHaveLength(1);
        expect(workspaceConfig.activeInstanceId).toBe(workspaceConfig.instances[0].id);
        expect(workspaceConfig.instances[0]).toMatchObject({
            host: 'http://localhost:5678',
            syncFolder: 'workflows',
            projectId: 'project-1',
            projectName: 'Personal',
            instanceIdentifier: 'legacy_identifier'
        });

        const persisted = JSON.parse(fs.readFileSync(path.join(workspaceDir, 'n8nac-config.json'), 'utf-8'));
        expect(persisted.version).toBe(2);
        expect(persisted.host).toBe('http://localhost:5678');
        expect(persisted.instanceIdentifier).toBe('legacy_identifier');
    });
});
