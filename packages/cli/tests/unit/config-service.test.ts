import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { ConfigService } from '../../src/services/config-service.js';

describe('ConfigService', () => {
    let previousManagerHome: string | undefined;
    let managerHome: string;
    let workspaceRoot: string;

    beforeEach(() => {
        previousManagerHome = process.env.N8N_MANAGER_HOME;
        managerHome = mkdtempSync(path.join(tmpdir(), 'n8nac-manager-home-'));
        workspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-workspace-'));
        process.env.N8N_MANAGER_HOME = managerHome;
    });

    afterEach(() => {
        if (previousManagerHome === undefined) {
            delete process.env.N8N_MANAGER_HOME;
        } else {
            process.env.N8N_MANAGER_HOME = previousManagerHome;
        }
    });

    it('stores instances globally and workspace fields as version 3 overrides', () => {
        const configService = new ConfigService(workspaceRoot);

        const saved = configService.saveLocalConfig({
            host: 'https://prod.example.test',
            syncFolder: 'flows',
            projectId: 'project-1',
            projectName: 'Main',
        }, {
            instanceId: 'prod',
            instanceName: 'Production',
        });

        expect(saved.id).toBe('prod');
        expect(configService.getLocalConfig()).toMatchObject({
            host: 'https://prod.example.test',
            projectId: 'project-1',
            projectName: 'Main',
        });
        expect(configService.getWorkspaceConfig()).toMatchObject({
            version: 3,
            activeInstanceId: 'prod',
            syncFolder: 'flows',
            projectId: 'project-1',
        });
    });

    it('lets workspace instance pin override the global active instance', () => {
        const configService = new ConfigService(workspaceRoot);
        configService.saveLocalConfig({ host: 'https://prod.example.test' }, { instanceId: 'prod', instanceName: 'Production' });
        configService.saveLocalConfig({ host: 'https://dev.example.test' }, { instanceId: 'dev', instanceName: 'Development' });
        configService.setActiveInstance('dev');

        configService.pinWorkspaceInstance('prod');

        expect(configService.getActiveInstance()?.id).toBe('prod');
    });

    it('preserves the active workspace instance when saving another instance with setActive false', () => {
        const configService = new ConfigService(workspaceRoot);
        configService.saveLocalConfig({ host: 'https://prod.example.test' }, { instanceId: 'prod', instanceName: 'Production' });

        const saved = configService.saveLocalConfig({ host: 'https://dev.example.test' }, {
            instanceId: 'dev',
            instanceName: 'Development',
            setActive: false,
        });

        expect(saved.id).toBe('dev');
        expect(configService.getActiveInstance()?.id).toBe('prod');
        expect(configService.getWorkspaceConfig().activeInstanceId).toBe('prod');
    });

    it('resolves workspace default sync folder for effective instance configs', () => {
        const configService = new ConfigService(workspaceRoot);
        configService.saveLocalConfig({
            host: 'https://prod.example.test',
            projectId: 'personal',
            projectName: 'Personal',
            instanceIdentifier: 'n8n_1234567890',
        }, {
            instanceId: 'prod',
            instanceName: 'Production',
        });

        const effective = configService.getEffectiveInstanceConfig('prod');

        expect(effective?.syncFolder).toBe(path.join(workspaceRoot, 'workflows'));
        expect(effective?.workflowDir).toBe(path.join(workspaceRoot, 'workflows', 'n8n_1234567890', 'personal'));
        expect(configService.getLocalConfig()).toMatchObject({
            syncFolder: path.join(workspaceRoot, 'workflows'),
            workflowDir: path.join(workspaceRoot, 'workflows', 'n8n_1234567890', 'personal'),
        });
    });

    it('does not expose non-canonical stored instance identifiers', () => {
        const configService = new ConfigService(workspaceRoot);
        configService.saveLocalConfig({
            host: 'https://prod.example.test',
            projectId: 'personal',
            projectName: 'Personal',
            instanceIdentifier: 'invalid_identifier',
        }, {
            instanceId: 'prod',
            instanceName: 'Production',
        });

        expect(configService.getEffectiveInstanceConfig('prod')?.instanceIdentifier).toBeUndefined();
        expect(configService.getEffectiveInstanceConfig('prod')?.workflowDir).toBeUndefined();
    });

    it('resolves canonical identifiers from API key user identity during verified upsert', async () => {
        const configService = new ConfigService(workspaceRoot);

        const result = await configService.upsertInstanceConfigWithVerification({
            host: 'https://prod.example.test',
            apiKey: 'test-key',
            projectId: 'personal',
            projectName: 'Personal',
            instanceIdentifier: 'invalid_identifier',
        }, {
            instanceId: 'prod',
            instanceName: 'Production',
            client: {
                async getCurrentUser() {
                    return {
                        id: 'user-1',
                        email: 'etienne@example.com',
                        firstName: 'Etienne',
                        lastName: 'Lescot',
                    };
                },
            },
        });

        expect(result.profile.instanceIdentifier).toBe('n8n_c6c289e49e');
        expect(configService.getEffectiveInstanceConfig('prod')?.instanceIdentifier).toBe('n8n_c6c289e49e');
    });

    it('prepares effective workspace context through n8n-manager runtime service', async () => {
        const configService = new ConfigService(workspaceRoot);
        configService.saveLocalConfig({
            host: 'https://prod.example.test',
            projectId: 'personal',
            projectName: 'Personal',
        }, {
            instanceId: 'prod',
            instanceName: 'Production',
            apiKey: 'prod-key',
        });

        const prepared = await configService.prepareWorkspaceContext('prod');

        expect(prepared.activeInstanceId).toBe('prod');
        expect(prepared.host).toBe('https://prod.example.test');
        expect(prepared.apiKey).toBe('prod-key');
        expect(prepared.syncFolder).toBe(path.join(workspaceRoot, 'workflows'));
    });

    it('stores workspace project overrides without managing the n8n instance', () => {
        const configService = new ConfigService(workspaceRoot);
        configService.saveLocalConfig({
            host: 'https://prod.example.test',
            projectId: 'global-project',
            projectName: 'Global Project',
        }, {
            instanceId: 'prod',
            instanceName: 'Production',
        });

        configService.setWorkspaceProject({
            projectId: 'workspace-project',
            projectName: 'Workspace Project',
        });

        expect(configService.getWorkspaceConfig()).toMatchObject({
            activeInstanceId: 'prod',
            projectId: 'workspace-project',
            projectName: 'Workspace Project',
        });

        configService.clearWorkspaceProjectOverride();
        expect(configService.getWorkspaceConfig().projectId).toBeUndefined();
        expect(configService.getWorkspaceConfig().projectName).toBeUndefined();
    });

    it('rejects legacy workspace configs with embedded instances', () => {
        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 2,
            activeInstanceId: 'prod',
            instances: [],
        }));

        const configService = new ConfigService(workspaceRoot);

        expect(() => configService.getWorkspaceConfig()).toThrow(/Unsupported legacy n8n workspace config/);
    });

    it('migrates legacy workspace configs into manager storage with a backup', () => {
        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 2,
            activeInstanceId: 'prod',
            syncFolder: 'flows',
            projectId: 'project-1',
            projectName: 'Main',
            instances: [{
                id: 'prod',
                name: 'Production',
                host: 'https://prod.example.test',
                apiKey: 'legacy-api-key',
            }],
        }, null, 2));

        const configService = new ConfigService(workspaceRoot);
        const dryRun = configService.migrateLegacyWorkspaceConfig();

        expect(dryRun.status).toBe('dry-run');
        expect(dryRun.status === 'dry-run' ? dryRun.plan.instances[0]?.hasApiKey : false).toBe(true);

        const migrated = configService.migrateLegacyWorkspaceConfig({ write: true });

        expect(migrated.status).toBe('migrated');
        expect(migrated.status === 'migrated' && existsSync(migrated.backupPath)).toBe(true);
        expect(configService.getWorkspaceConfig()).toMatchObject({
            version: 3,
            activeInstanceId: 'prod',
            syncFolder: 'flows',
            projectId: 'project-1',
            projectName: 'Main',
        });
        expect(configService.getInstanceConfig('prod')).toMatchObject({
            name: 'Production',
            host: 'https://prod.example.test',
        });
        expect(configService.getApiKey('https://prod.example.test', 'prod')).toBe('legacy-api-key');

        const migratedConfig = JSON.parse(readFileSync(path.join(workspaceRoot, 'n8nac-config.json'), 'utf8'));
        expect(migratedConfig.instances).toBeUndefined();
        expect(migratedConfig.apiKey).toBeUndefined();
    });
});
