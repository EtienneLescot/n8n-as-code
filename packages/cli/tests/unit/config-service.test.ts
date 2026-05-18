import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { ConfigService } from '../../src/services/config-service.js';
import { createWorkflowDirNameV1 } from '../../src/core/services/workflow-dir-name.js';

describe('ConfigService', () => {
    let previousManagerHome: string | undefined;
    let previousXdgConfigHome: string | undefined;
    let previousN8nApiKey: string | undefined;
    let previousTargetApiKey: string | undefined;
    let previousTargetDevelopmentApiKey: string | undefined;
    let previousTargetManagedDevelopmentApiKey: string | undefined;
    let managerHome: string;
    let workspaceRoot: string;

    beforeEach(() => {
        previousManagerHome = process.env.N8N_MANAGER_HOME;
        previousXdgConfigHome = process.env.XDG_CONFIG_HOME;
        previousN8nApiKey = process.env.N8N_API_KEY;
        previousTargetApiKey = process.env.N8NAC_TARGET_PRODUCTION_N8N_API_KEY;
        previousTargetDevelopmentApiKey = process.env.N8NAC_TARGET_DEVELOPMENT_API_KEY;
        previousTargetManagedDevelopmentApiKey = process.env.N8NAC_TARGET_DEVELOPMENT_MANAGED_API_KEY;
        managerHome = mkdtempSync(path.join(tmpdir(), 'n8nac-manager-home-'));
        workspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-workspace-'));
        process.env.N8N_MANAGER_HOME = managerHome;
        process.env.XDG_CONFIG_HOME = managerHome;
        delete process.env.N8N_API_KEY;
        delete process.env.N8NAC_TARGET_PRODUCTION_N8N_API_KEY;
        delete process.env.N8NAC_TARGET_DEVELOPMENT_API_KEY;
        delete process.env.N8NAC_TARGET_DEVELOPMENT_MANAGED_API_KEY;
    });

    afterEach(() => {
        if (previousManagerHome === undefined) {
            delete process.env.N8N_MANAGER_HOME;
        } else {
            process.env.N8N_MANAGER_HOME = previousManagerHome;
        }
        if (previousN8nApiKey === undefined) {
            delete process.env.N8N_API_KEY;
        } else {
            process.env.N8N_API_KEY = previousN8nApiKey;
        }
        if (previousXdgConfigHome === undefined) {
            delete process.env.XDG_CONFIG_HOME;
        } else {
            process.env.XDG_CONFIG_HOME = previousXdgConfigHome;
        }
        if (previousTargetApiKey === undefined) {
            delete process.env.N8NAC_TARGET_PRODUCTION_N8N_API_KEY;
        } else {
            process.env.N8NAC_TARGET_PRODUCTION_N8N_API_KEY = previousTargetApiKey;
        }
        if (previousTargetDevelopmentApiKey === undefined) {
            delete process.env.N8NAC_TARGET_DEVELOPMENT_API_KEY;
        } else {
            process.env.N8NAC_TARGET_DEVELOPMENT_API_KEY = previousTargetDevelopmentApiKey;
        }
        if (previousTargetManagedDevelopmentApiKey === undefined) {
            delete process.env.N8NAC_TARGET_DEVELOPMENT_MANAGED_API_KEY;
        } else {
            process.env.N8NAC_TARGET_DEVELOPMENT_MANAGED_API_KEY = previousTargetManagedDevelopmentApiKey;
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

        expect(() => configService.getWorkspaceConfig()).toThrow(/n8nac workspace migrate --json/);
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
            version: 4,
            activeEnvironmentId: 'default',
            projectId: 'project-1',
            projectName: 'Main',
            syncFolder: path.join(workspaceRoot, 'flows'),
            environmentTargets: [expect.objectContaining({
                id: 'default-instance',
                name: 'Production',
                kind: 'external-instance',
                url: 'https://prod.example.test',
            })],
            environments: [expect.objectContaining({
                id: 'default',
                name: 'Default',
                environmentTargetId: 'default-instance',
                syncFolder: 'flows',
                projectId: 'project-1',
                projectName: 'Main',
            })],
        });
        expect(configService.getInstanceConfig('prod')).toMatchObject({
            name: 'Production',
            host: 'https://prod.example.test',
        });
        expect(configService.getApiKey('https://prod.example.test', 'prod')).toBe('legacy-api-key');

        const migratedConfig = JSON.parse(readFileSync(path.join(workspaceRoot, 'n8nac-config.json'), 'utf8'));
        expect(migratedConfig.instances).toBeUndefined();
        expect(migratedConfig.apiKey).toBeUndefined();
        expect(migratedConfig).toMatchObject({
            version: 4,
            activeEnvironmentId: 'default',
        });
    });

    it('uses the first migrated instance when the legacy active instance is stale', () => {
        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 2,
            activeInstanceId: 'missing',
            instances: [{
                id: 'prod',
                name: 'Production',
                host: 'https://prod.example.test',
            }],
        }, null, 2));

        const configService = new ConfigService(workspaceRoot);
        const dryRun = configService.migrateLegacyWorkspaceConfig();

        expect(dryRun.status).toBe('dry-run');
        expect(dryRun.status === 'dry-run' ? dryRun.plan.activeInstanceId : undefined).toBe('prod');
        expect(dryRun.status === 'dry-run' ? dryRun.plan.warnings.join('\n') : '').toContain('"missing" was not found');

        const migrated = configService.migrateLegacyWorkspaceConfig({ write: true });

        expect(migrated.status).toBe('migrated');
        expect(configService.resolveEnvironment()).toMatchObject({
            environmentId: 'default',
            sourceKind: 'external-instance',
            host: 'https://prod.example.test',
        });
        expect(configService.getWorkspaceConfig().activeEnvironmentId).toBe('default');
    });

    it('migrates multiple legacy instances without ids with unique ids and API keys', () => {
        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 2,
            activeInstanceId: 'old-active',
            instances: [{
                name: 'Production',
                host: 'https://prod.example.test',
                apiKey: 'prod-key',
            }, {
                name: 'Staging',
                host: 'https://staging.example.test',
                apiKey: 'staging-key',
            }],
        }, null, 2));

        const configService = new ConfigService(workspaceRoot);
        const dryRun = configService.migrateLegacyWorkspaceConfig();

        expect(dryRun.status).toBe('dry-run');
        expect(dryRun.status === 'dry-run' ? dryRun.plan.instances.map((instance) => instance.id) : []).toEqual(['legacy-1', 'legacy-2']);

        const migrated = configService.migrateLegacyWorkspaceConfig({ write: true });

        expect(migrated.status).toBe('migrated');
        expect(migrated.status === 'migrated' ? migrated.instances.map((instance) => instance.id) : []).toEqual(['legacy-1', 'legacy-2']);
        expect(configService.getInstanceConfig('legacy-1')).toMatchObject({
            name: 'Production',
            host: 'https://prod.example.test',
        });
        expect(configService.getInstanceConfig('legacy-2')).toMatchObject({
            name: 'Staging',
            host: 'https://staging.example.test',
        });
        expect(configService.getApiKey('https://prod.example.test', 'legacy-1')).toBe('prod-key');
        expect(configService.getApiKey('https://staging.example.test', 'legacy-2')).toBe('staging-key');
        expect(configService.resolveEnvironment()).toMatchObject({
            environmentId: 'legacy-1',
            sourceKind: 'external-instance',
            host: 'https://prod.example.test',
        });
        const workspaceConfig = configService.getWorkspaceConfig();
        expect(workspaceConfig.activeEnvironmentId).toBe('legacy-1');
        expect(workspaceConfig.environmentTargets).toHaveLength(2);
        expect(workspaceConfig.environments).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: 'legacy-1',
                name: 'Production',
            }),
            expect.objectContaining({
                id: 'legacy-2',
                name: 'Staging',
            }),
        ]));
        expect(workspaceConfig.environments?.map((env) => env.syncFolder)).toEqual(['workflows', 'workflows']);
    });

    it('migrates each configured v2 instance to its own environment and keeps the active instance pinned', () => {
        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 2,
            activeInstanceId: 'instance-86ea2ff2',
            instances: [{
                id: 'instance-ce718986',
                name: 'etiennel.app.n8n.cloud · Etienne Lescot',
                host: 'https://etiennel.app.n8n.cloud',
                syncFolder: 'workflows',
                projectId: 'sD2aDWI5bIJF3Km3',
                projectName: 'Personal',
                instanceIdentifier: 'etiennel_cloud_etienne_l',
                workflowDir: 'workflows/etiennel_cloud_etienne_l/personal',
            }, {
                id: 'instance-86ea2ff2',
                name: 'localhost · Etienne Lescot',
                host: 'http://localhost:5678',
                syncFolder: 'workflows',
                projectId: 'personal',
                projectName: 'Personal',
                instanceIdentifier: 'local_5678_etienne_l',
                workflowDir: 'workflows/local_5678_etienne_l/personal',
            }],
            host: 'http://localhost:5678',
            syncFolder: 'workflows',
            projectId: 'personal',
            projectName: 'Personal',
            instanceIdentifier: 'local_5678_etienne_l',
            workflowDir: 'workflows/local_5678_etienne_l/personal',
        }, null, 2));

        const configService = new ConfigService(workspaceRoot);
        const migrated = configService.migrateLegacyWorkspaceConfig({ write: true });

        expect(migrated.status).toBe('migrated');
        const workspaceConfig = configService.getWorkspaceConfig();
        expect(workspaceConfig.environmentTargets).toHaveLength(2);
        expect(workspaceConfig.environments).toHaveLength(2);
        expect(workspaceConfig.activeEnvironmentId).toBe('instance-86ea2ff2');
        expect(workspaceConfig.environments).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: 'instance-ce718986',
                name: 'etiennel.app.n8n.cloud · Etienne Lescot',
                projectId: 'sD2aDWI5bIJF3Km3',
                syncFolder: 'workflows',
            }),
            expect.objectContaining({
                id: 'instance-86ea2ff2',
                name: 'localhost · Etienne Lescot',
                projectId: 'personal',
                syncFolder: 'workflows',
            }),
        ]));
        expect(configService.resolveEnvironment()).toMatchObject({
            environmentId: 'instance-86ea2ff2',
            host: 'http://localhost:5678',
        });
    });

    it('runs legacy and global instance migration as one combined workspace migration', () => {
        const configService = new ConfigService(workspaceRoot);
        (configService as any).manager.upsertInstance({
            id: 'global-external',
            name: 'Global External',
            mode: 'existing',
            baseUrl: 'https://global.example.test',
        }, { setActive: false });
        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 2,
            activeInstanceId: 'legacy-prod',
            instances: [{
                id: 'legacy-prod',
                name: 'Legacy Prod',
                host: 'https://legacy.example.test',
                workflowDir: 'legacy/custom-prod',
            }],
        }, null, 2));

        const dryRun = configService.migrateWorkspaceConfiguration();

        expect(dryRun.status).toBe('dry-run');
        expect(dryRun.status === 'dry-run' ? dryRun.plan.legacyMigration?.instances.map((item) => item.id) : []).toEqual(['legacy-prod']);
        expect(dryRun.status === 'dry-run' ? dryRun.plan.globalInstancesMigration?.instances.map((item) => item.id) : []).toEqual(['global-external']);

        const migrated = configService.migrateWorkspaceConfiguration({ write: true });
        const persisted = JSON.parse(readFileSync(path.join(workspaceRoot, 'n8nac-config.json'), 'utf8'));

        expect(migrated.status).toBe('migrated');
        expect(configService.detectWorkspaceMigration()).toBeUndefined();
        expect((configService as any).manager.getInstance('global-external')).toBeUndefined();
        expect(persisted.version).toBe(4);
        expect(persisted.environments).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'default', name: 'Default', legacyWorkflowDir: 'legacy/custom-prod' }),
            expect.objectContaining({ id: 'global-external', name: 'Global External' }),
        ]));
    });

    it('detects unmarked managed global instances as migration candidates', () => {
        const configService = new ConfigService(workspaceRoot);
        (configService as any).manager.upsertInstance({
            id: 'managed-old',
            name: 'Managed Old',
            mode: 'managed-local-docker',
            baseUrl: 'http://127.0.0.1:5678',
        }, { setActive: false });

        const plan = configService.detectWorkspaceMigration();

        expect(plan?.globalInstancesMigration?.instances).toEqual([
            expect.objectContaining({
                id: 'managed-old',
                mode: 'managed-instance',
            }),
        ]);
    });

    it('does not detect marked managed global instances as migration candidates', () => {
        const configService = new ConfigService(workspaceRoot);
        (configService as any).manager.upsertInstance({
            id: 'managed-new',
            name: 'Managed New',
            mode: 'managed-local-docker',
            baseUrl: 'http://127.0.0.1:5678',
            metadata: {
                containerName: 'managed-new',
                n8nacWorkspaceEnvironmentModel: 'v4',
            },
        }, { setActive: false });

        expect(configService.detectWorkspaceMigration()).toBeUndefined();
    });

    it('marks migrated managed global instances as v4 workspace environment model', () => {
        const configService = new ConfigService(workspaceRoot);
        (configService as any).manager.upsertInstance({
            id: 'managed-old',
            name: 'Managed Old',
            mode: 'managed-local-docker',
            baseUrl: 'http://127.0.0.1:5678',
            metadata: { containerName: 'managed-old' },
        }, { setActive: false });

        const migrated = configService.migrateWorkspaceConfiguration({ write: true });
        const instance = (configService as any).manager.getInstance('managed-old');

        expect(migrated.status).toBe('migrated');
        expect(instance.metadata).toMatchObject({
            containerName: 'managed-old',
            n8nacWorkspaceEnvironmentModel: 'v4',
        });
        expect(configService.detectWorkspaceMigration()).toBeUndefined();
    });

    it('rolls back combined workspace migration when any migration phase remains pending', () => {
        const configService = new ConfigService(workspaceRoot);
        (configService as any).manager.upsertInstance({
            id: 'global-external',
            name: 'Global External',
            mode: 'existing',
            baseUrl: 'https://global.example.test',
        }, { setActive: false });
        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 2,
            activeInstanceId: 'legacy-prod',
            instances: [{
                id: 'legacy-prod',
                name: 'Legacy Prod',
                host: 'https://legacy.example.test',
            }],
        }, null, 2));
        vi.spyOn(configService as any, 'migrateGlobalInstancesToEnvironments').mockReturnValue({
            status: 'not-needed',
            configPath: path.join(workspaceRoot, 'n8nac-config.json'),
        });

        expect(() => configService.migrateWorkspaceConfiguration({ write: true })).toThrow(/did not complete atomically/);

        const restored = JSON.parse(readFileSync(path.join(workspaceRoot, 'n8nac-config.json'), 'utf8'));
        expect(restored.version).toBe(2);
        expect((configService as any).manager.getInstance('legacy-prod')).toBeUndefined();
        expect((configService as any).manager.getInstance('global-external')).toBeDefined();
    });

    it('migrates legacy v1 credentials from the n8nac conf store', () => {
        const legacyStoreDir = path.join(managerHome, 'n8nac-nodejs');
        mkdirSync(legacyStoreDir, { recursive: true });
        writeFileSync(path.join(legacyStoreDir, 'credentials.json'), JSON.stringify({
            hosts: {
                'https://prod.example.test': 'prod-host-key',
            },
            instanceProfiles: {
                'instance-2': 'staging-profile-key',
            },
        }, null, 2));
        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 2,
            activeInstanceId: 'instance-2',
            instances: [{
                id: 'instance-1',
                name: 'Production',
                host: 'https://prod.example.test',
                syncFolder: 'workflows',
                workflowDir: 'workflows/prod/personal',
            }, {
                id: 'instance-2',
                name: 'Staging',
                host: 'https://staging.example.test',
                syncFolder: 'workflows',
                workflowDir: 'workflows/staging/personal',
            }],
        }, null, 2));

        const configService = new ConfigService(workspaceRoot);
        const migrated = configService.migrateLegacyWorkspaceConfig({ write: true });

        expect(migrated.status).toBe('migrated');
        expect(configService.getApiKey('https://prod.example.test', 'instance-1')).toBe('prod-host-key');
        expect(configService.getApiKey('https://staging.example.test', 'instance-2')).toBe('staging-profile-key');
        expect(configService.getWorkspaceConfig().activeEnvironmentId).toBe('instance-2');
    });

    it('resolves a host API key even when an older matching profile has no secret', () => {
        const configService = new ConfigService(workspaceRoot);
        configService.saveLocalConfig({ host: 'https://prod.example.test' }, {
            instanceId: 'without-key',
            instanceName: 'Without key',
            setActive: false,
        });
        configService.saveLocalConfig({ host: 'https://prod.example.test' }, {
            instanceId: 'with-key',
            instanceName: 'With key',
            setActive: false,
            apiKey: 'stored-key',
        });

        expect(configService.getApiKey('https://prod.example.test')).toBe('stored-key');
    });

    it('does not synthesize an invalid instance from an empty legacy instances array', () => {
        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 2,
            activeInstanceId: 'missing',
            syncFolder: 'flows',
            instances: [],
        }, null, 2));

        const configService = new ConfigService(workspaceRoot);
        const dryRun = configService.migrateLegacyWorkspaceConfig();

        expect(dryRun.status).toBe('dry-run');
        expect(dryRun.status === 'dry-run' ? dryRun.plan.instances : []).toEqual([]);

        const migrated = configService.migrateLegacyWorkspaceConfig({ write: true });

        expect(migrated.status).toBe('migrated');
        expect(migrated.status === 'migrated' ? migrated.instances : []).toEqual([]);
        expect(configService.listInstances()).toEqual([]);
        expect(configService.getWorkspaceConfig()).toMatchObject({
            version: 3,
            syncFolder: 'flows',
        });
        expect(configService.getWorkspaceConfig().activeInstanceId).toBeUndefined();
    });

    it('does not treat unknown future config versions as legacy by version alone', () => {
        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 4,
            syncFolder: 'flows',
        }, null, 2));

        const configService = new ConfigService(workspaceRoot);

        expect(configService.detectLegacyWorkspaceConfig()).toBeUndefined();
        expect(configService.migrateLegacyWorkspaceConfig()).toMatchObject({
            status: 'not-needed',
        });
    });

    it('does not synthesize a workspace environment from only the global active instance', () => {
        const configService = new ConfigService(workspaceRoot);
        configService.saveLocalConfig({ host: 'https://prod.example.test' }, {
            instanceId: 'prod',
            instanceName: 'Production',
            apiKey: 'prod-key',
        });
        unlinkSync(path.join(workspaceRoot, 'n8nac-config.json'));

        expect(() => configService.resolveEnvironment()).toThrow(/No workspace environment/);
    });

    it('creates and resolves v4 workspace instance targets and environments', () => {
        const configService = new ConfigService(workspaceRoot);
        configService.saveLocalConfig({ host: 'https://dev.example.test', instanceIdentifier: 'n8n_1234567890' }, {
            instanceId: 'dev-instance',
            instanceName: 'Dev Instance',
            apiKey: 'dev-key',
        });

        const target = configService.addInstanceTarget({
            name: 'Dev Target',
            managedInstanceId: 'dev-instance',
        });
        const environment = configService.addEnvironment({
            name: 'Dev',
            environmentTarget: target.id,
            projectId: 'personal',
            projectName: 'Personal',
            syncFolder: 'workflows',
        });
        configService.pinEnvironment(environment.id);

        const resolved = configService.resolveEnvironment('Dev');
        const expectedWorkflowDir = path.join(workspaceRoot, 'workflows', 'dev');

        expect(configService.getWorkspaceConfig()).toMatchObject({
            version: 4,
            activeEnvironmentId: environment.id,
            environmentTargets: expect.arrayContaining([expect.objectContaining({ id: target.id, name: 'Dev Target', kind: 'managed-instance', managedInstanceId: 'dev-instance' })]),
            environments: expect.arrayContaining([expect.objectContaining({ id: environment.id, name: 'Dev', syncSlug: 'dev', environmentTargetId: target.id, projectId: 'personal', projectName: 'Personal', syncFolder: 'workflows', workflowDir: expectedWorkflowDir })]),
        });
        expect(resolved).toMatchObject({
            environmentId: environment.id,
            environmentName: 'Dev',
            environmentTargetId: target.id,
            sourceKind: 'managed-instance',
            host: 'https://dev.example.test',
            apiKey: 'dev-key',
            projectId: 'personal',
            projectName: 'Personal',
            syncFolder: path.join(workspaceRoot, 'workflows'),
            workflowDir: expectedWorkflowDir,
        });
        expect(resolved.workflowDir).not.toContain('Dev');
        expect(resolved.workflowDir).not.toContain('Personal');
        expect(resolved.workflowDir).not.toContain('n8n_1234567890');
    });

    it('keeps the environment sync directory stable when target, project, or display name changes', () => {
        const configService = new ConfigService(workspaceRoot);
        const firstTarget = configService.addInstanceTarget({ name: 'Dev Target', url: 'https://dev.example.test' });
        const secondTarget = configService.addInstanceTarget({ name: 'Team Target', url: 'https://team.example.test' });
        const environment = configService.addEnvironment({
            name: 'Customer Dev',
            environmentTarget: firstTarget.id,
            projectId: 'personal',
            projectName: 'Personal',
            syncFolder: 'workflows',
        });

        const originalWorkflowDir = configService.resolveEnvironment(environment.id).workflowDir;
        expect(originalWorkflowDir).toBe(path.join(workspaceRoot, 'workflows', 'customer-dev'));

        configService.updateEnvironment(environment.id, {
            name: 'Renamed Customer Dev',
            environmentTarget: secondTarget.id,
            projectId: 'team',
            projectName: 'Team',
        });

        const resolved = configService.resolveEnvironment(environment.id);
        expect(resolved.workflowDir).toBe(originalWorkflowDir);
        expect(resolved.environment.syncSlug).toBe('customer-dev');
        expect(resolved.environmentName).toBe('Renamed Customer Dev');
        expect(resolved.environmentTargetId).toBe(secondTarget.id);
        expect(resolved.projectId).toBe('team');
    });

    it('uses an existing legacy v4 workflow directory when a slugged replacement has not been created yet', () => {
        const legacyDirName = createWorkflowDirNameV1({
            environmentId: 'dev',
            instanceIdentifier: 'inst_1234567890',
            instanceUserIdentifier: 'user_abcdef1234',
            projectId: 'personal',
        });
        const legacyWorkflowDir = path.join(workspaceRoot, 'workflows', legacyDirName);
        mkdirSync(legacyWorkflowDir, { recursive: true });
        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 4,
            activeEnvironmentId: 'dev',
            environmentTargets: [{
                id: 'target',
                name: 'Target',
                kind: 'external-instance',
                url: 'https://target.example.test',
                instanceIdentifier: 'inst_1234567890',
                instanceUserIdentifier: 'user_abcdef1234',
            }, {
                id: 'target-2',
                name: 'Target 2',
                kind: 'external-instance',
                url: 'https://target-2.example.test',
                instanceIdentifier: 'inst_2222222222',
                instanceUserIdentifier: 'user_2222222222',
            }],
            environments: [{
                id: 'dev',
                name: 'Dev',
                environmentTargetId: 'target',
                projectId: 'personal',
                projectName: 'Personal',
                syncFolder: 'workflows',
            }],
        }));

        const configService = new ConfigService(workspaceRoot);
        const resolved = configService.resolveEnvironment('Dev');
        expect(resolved.environment.syncSlug).toBe('dev');
        expect(resolved.workflowDir).toBe(legacyWorkflowDir);

        configService.updateEnvironment('Dev', {
            environmentTarget: 'target-2',
            projectId: 'team',
            projectName: 'Team',
        });
        const retargeted = configService.resolveEnvironment('Dev');
        expect(retargeted.workflowDir).toBe(legacyWorkflowDir);
        expect(retargeted.environment.legacyWorkflowDir).toBe(path.relative(workspaceRoot, legacyWorkflowDir));

        const slugWorkflowDir = path.join(workspaceRoot, 'workflows', 'dev');
        mkdirSync(slugWorkflowDir, { recursive: true });
        expect(new ConfigService(workspaceRoot).resolveEnvironment('Dev').workflowDir).toBe(slugWorkflowDir);
    });

    it('clears a preserved legacy workflow directory when the sync root changes', () => {
        const legacyDirName = createWorkflowDirNameV1({
            environmentId: 'dev',
            instanceIdentifier: 'inst_1234567890',
            instanceUserIdentifier: 'user_abcdef1234',
            projectId: 'personal',
        });
        const legacyWorkflowDir = path.join(workspaceRoot, 'workflows', legacyDirName);
        mkdirSync(legacyWorkflowDir, { recursive: true });
        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 4,
            activeEnvironmentId: 'dev',
            environmentTargets: [{
                id: 'target',
                name: 'Target',
                kind: 'external-instance',
                url: 'https://target.example.test',
                instanceIdentifier: 'inst_1234567890',
                instanceUserIdentifier: 'user_abcdef1234',
            }],
            environments: [{
                id: 'dev',
                name: 'Dev',
                environmentTargetId: 'target',
                projectId: 'personal',
                projectName: 'Personal',
                syncFolder: 'workflows',
            }],
        }));

        const configService = new ConfigService(workspaceRoot);
        configService.updateEnvironment('Dev', { syncFolder: 'other-workflows' });

        const resolved = configService.resolveEnvironment('Dev');
        expect(resolved.workflowDir).toBe(path.join(workspaceRoot, 'other-workflows', 'dev'));
        expect(resolved.environment.legacyWorkflowDir).toBeUndefined();
    });

    it('reuses managed instance targets and avoids generated name collisions with connected targets', () => {
        const configService = new ConfigService(workspaceRoot);
        (configService as any).manager.upsertInstance({
            id: 'dev-instance',
            name: 'Development',
            mode: 'managed-local-docker',
            baseUrl: 'https://dev.example.test',
        }, { setActive: false });

        const existingTarget = configService.addInstanceTarget({
            name: 'Development',
            url: 'https://connected.example.test',
        });
        const target = configService.ensureManagedInstanceTarget({
            name: 'Development',
            managedInstanceId: 'dev-instance',
        });
        const reused = configService.ensureManagedInstanceTarget({
            name: 'Development',
            managedInstanceId: 'dev-instance',
        });

        expect(target).toMatchObject({ name: 'Development 2', managedInstanceId: 'dev-instance' });
        expect(reused.id).toBe(target.id);
        expect(configService.listInstanceTargets()).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: existingTarget.id, name: 'Development', kind: 'external-instance', url: 'https://connected.example.test' }),
            expect.objectContaining({ id: target.id, name: 'Development 2', managedInstanceId: 'dev-instance' }),
        ]));
    });

    it('loads existing configs with duplicate instance target names when environments reference target IDs', () => {
        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 4,
            environmentTargets: [{
                id: 'development-connected',
                name: 'Development',
                kind: 'external-instance',
                url: 'https://connected.example.test',
            }, {
                id: 'development-managed',
                name: 'Development',
                kind: 'managed-instance',
                managedInstanceId: 'dev-instance',
            }],
            environments: [{
                id: 'dev',
                name: 'dev',
                environmentTargetId: 'development-managed',
                syncFolder: 'workflows',
            }],
        }));

        (new ConfigService(workspaceRoot) as any).manager.upsertInstance({
            id: 'dev-instance',
            name: 'Development',
            mode: 'managed-local-docker',
            baseUrl: 'https://dev.example.test',
        }, { setActive: false });

        const config = new ConfigService(workspaceRoot).getWorkspaceConfig();

        expect(config.environmentTargets?.filter((target) => target.name === 'Development')).toHaveLength(2);
        expect(config.environments?.[0]).toMatchObject({ environmentTargetId: 'development-managed' });
    });

    it('ignores name-based target API key variables when instance target names are ambiguous', () => {
        const configService = new ConfigService(workspaceRoot);
        (configService as any).manager.upsertInstance({
            id: 'dev-instance',
            name: 'Development',
            mode: 'managed-local-docker',
            baseUrl: 'https://dev.example.test',
        }, { setActive: false });
        (configService as any).manager.saveApiKey('dev-instance', 'managed-key');
        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 4,
            environmentTargets: [{
                id: 'development-connected',
                name: 'Development',
                kind: 'external-instance',
                url: 'https://connected.example.test',
            }, {
                id: 'development-managed',
                name: 'Development',
                kind: 'managed-instance',
                managedInstanceId: 'dev-instance',
            }],
            environments: [{
                id: 'dev',
                name: 'dev',
                environmentTargetId: 'development-managed',
                syncFolder: 'workflows',
            }],
        }));
        process.env.N8NAC_TARGET_DEVELOPMENT_API_KEY = 'ambiguous-key';

        const resolved = new ConfigService(workspaceRoot).resolveEnvironment('dev');

        expect(resolved.apiKey).toBe('managed-key');
        expect(resolved.apiKeySource).toBe('global');

        process.env.N8NAC_TARGET_DEVELOPMENT_MANAGED_API_KEY = 'id-specific-key';

        const resolvedWithIdKey = new ConfigService(workspaceRoot).resolveEnvironment('dev');

        expect(resolvedWithIdKey.apiKey).toBe('id-specific-key');
        expect(resolvedWithIdKey.apiKeySource).toBe('env');
    });

    it('prefers managed base URL over public tunnel URL for API resolution', () => {
        const configService = new ConfigService(workspaceRoot);
        (configService as any).manager.upsertInstance({
            id: 'managed-dev',
            name: 'Managed Dev',
            mode: 'managed-local-docker',
            baseUrl: 'http://127.0.0.1:5678',
            tunnelPublicUrl: 'https://stale.trycloudflare.com',
            defaultProject: { id: 'personal', name: 'Personal' },
            metadata: {
                n8nacWorkspaceEnvironmentModel: 'v4',
            },
        }, { setActive: false });

        const target = configService.addInstanceTarget({
            name: 'Managed Target',
            managedInstanceId: 'managed-dev',
        });
        const environment = configService.addEnvironment({
            name: 'Managed',
            environmentTarget: target.id,
            syncFolder: 'workflows/managed',
        });
        configService.pinEnvironment(environment.id);

        expect(configService.resolveEnvironment('Managed')).toMatchObject({
            sourceKind: 'managed-instance',
            host: 'http://127.0.0.1:5678',
            projectId: 'personal',
            projectName: 'Personal',
        });
        expect(configService.getEffectiveContext()).toMatchObject({
            apiBaseUrl: 'http://127.0.0.1:5678',
            host: 'http://127.0.0.1:5678',
        });
    });

    it('resolves embedded v4 targets without storing secrets in workspace config', () => {
        const configService = new ConfigService(workspaceRoot);

        const target = configService.addInstanceTarget({
            name: 'Production n8n',
            url: 'https://prod.example.test',
        });
        process.env.N8NAC_TARGET_PRODUCTION_N8N_API_KEY = 'embedded-key';
        configService.addEnvironment({
            name: 'Prod',
            environmentTarget: target.id,
            projectId: 'cgi',
            projectName: 'CGI',
            syncFolder: 'workflows/prod',
        });

        const resolved = configService.resolveEnvironment('Prod');
        expect(resolved).toMatchObject({
            sourceKind: 'external-instance',
            host: 'https://prod.example.test',
            apiKey: 'embedded-key',
            apiKeySource: 'env',
            accessStatus: 'unknown',
        });
        const raw = JSON.parse(readFileSync(path.join(workspaceRoot, 'n8nac-config.json'), 'utf8'));
        expect(JSON.stringify(raw)).not.toContain('embedded-key');
    });

    it('keeps v4 workspace config when saving global instances and rejects legacy workspace fields', () => {
        const configService = new ConfigService(workspaceRoot);
        const target = configService.addInstanceTarget({ name: 'Target', url: 'https://target.example.test' });
        configService.addEnvironment({
            name: 'Dev',
            environmentTarget: target.id,
            projectId: 'personal',
            projectName: 'Personal',
            syncFolder: 'workflows/dev',
        });

        configService.saveLocalConfig({ host: 'https://other.example.test' }, {
            instanceId: 'other',
            instanceName: 'Other Instance',
        });

        const raw = JSON.parse(readFileSync(path.join(workspaceRoot, 'n8nac-config.json'), 'utf8'));
        expect(raw).toMatchObject({
            version: 4,
            environmentTargets: expect.arrayContaining([expect.objectContaining({ id: target.id })]),
            environments: expect.arrayContaining([expect.objectContaining({ name: 'Dev', syncFolder: 'workflows/dev' })]),
        });
        expect(() => configService.saveLocalConfig({
            host: 'https://legacy.example.test',
            syncFolder: 'legacy-workflows',
        }, { instanceId: 'legacy', instanceName: 'Legacy' })).toThrow(/v4 environments/);
    });

    it('exposes per-environment access status in v4 workspace snapshots', () => {
        const configService = new ConfigService(workspaceRoot);
        const target = configService.addInstanceTarget({ name: 'Target', url: 'https://target.example.test' });
        configService.addEnvironment({
            name: 'Dev',
            environmentTarget: target.id,
            projectId: 'personal',
            projectName: 'Personal',
            syncFolder: 'workflows/dev',
        });

        expect(configService.getWorkspaceConfig().environments?.[0]).toMatchObject({
            name: 'Dev',
            sourceKind: 'external-instance',
            apiKeyAvailable: false,
            credentialSource: 'missing',
            accessStatus: 'missing-api-key',
        });
        expect(configService.getWorkspaceConfig().environmentTargets?.[0]).toMatchObject({
            name: 'Target',
            kind: 'external-instance',
            url: 'https://target.example.test',
            apiKeyAvailable: false,
            credentialSource: 'missing',
            accessStatus: 'missing-api-key',
        });
    });

    it('does not mark access ready until credentials are verified', () => {
        const configService = new ConfigService(workspaceRoot);
        configService.saveLocalConfig({ host: 'https://dev.example.test' }, {
            instanceId: 'dev-instance',
            instanceName: 'Dev Instance',
            apiKey: 'dev-key',
        });

        const target = configService.addInstanceTarget({ name: 'Dev Target', managedInstanceId: 'dev-instance' });
        configService.addEnvironment({
            name: 'Dev',
            environmentTarget: target.id,
            projectId: 'personal',
            projectName: 'Personal',
            syncFolder: 'workflows/dev',
        });

        expect(configService.resolveEnvironment('Dev').accessStatus).toBe('unknown');
    });

    it('rejects global-ref v4 targets that do not reference a known global instance', () => {
        const configService = new ConfigService(workspaceRoot);

        expect(() => configService.addInstanceTarget({
            name: 'Missing Target',
            managedInstanceId: 'missing-instance',
        })).toThrow(/Unknown global n8n-manager instance/);
    });

    it('does not use generic N8N_API_KEY as a v4 environment credential', () => {
        process.env.N8N_API_KEY = 'generic-key';
        const configService = new ConfigService(workspaceRoot);
        const target = configService.addInstanceTarget({
            name: 'Production n8n',
            url: 'https://prod.example.test',
        });
        configService.addEnvironment({
            name: 'Prod',
            environmentTarget: target.id,
            projectId: 'cgi',
            projectName: 'CGI',
            syncFolder: 'workflows/prod',
        });

        const resolved = configService.resolveEnvironment('Prod');
        expect(resolved.apiKey).toBeUndefined();
        expect(resolved.apiKeySource).toBe('missing');
    });

    it('rejects legacy singleton workspace writes for v4 environment configs', () => {
        const configService = new ConfigService(workspaceRoot);
        const target = configService.addInstanceTarget({ name: 'Target', url: 'https://target.example.test' });
        configService.addEnvironment({
            name: 'Dev',
            environmentTarget: target.id,
            projectId: 'personal',
            projectName: 'Personal',
            syncFolder: 'workflows/dev',
        });

        expect(() => configService.setWorkspaceProject({ projectId: 'x', projectName: 'X' })).toThrow(/v4 environments/);
        expect(() => configService.setWorkspaceSyncFolder('other')).toThrow(/v4 environments/);
        expect(() => configService.pinWorkspaceInstance('anything')).toThrow(/v4 environments/);
    });

    it('allows environments that share the same sync root folder', () => {
        const configService = new ConfigService(workspaceRoot);
        const target = configService.addInstanceTarget({ name: 'Target', url: 'https://target.example.test', instanceIdentifier: 'n8n_1111111111' });
        configService.addEnvironment({
            name: 'Dev',
            environmentTarget: target.id,
            projectId: 'personal',
            projectName: 'Personal',
            syncFolder: 'workflows',
        });

        const prod = configService.addEnvironment({
            name: 'Prod',
            environmentTarget: target.id,
            projectId: 'cgi',
            projectName: 'CGI',
            syncFolder: './workflows/shared',
        });

        expect(prod.syncFolder).toBe('./workflows/shared');

        expect(configService.updateEnvironment('Prod', {
            syncFolder: 'workflows/shared',
        }).syncFolder).toBe('workflows/shared');
    });

    it('backfills missing sync slugs without colliding with later explicit slugs', () => {
        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 4,
            environmentTargets: [{ id: 'target', name: 'Target', kind: 'external-instance', url: 'https://target.example.test' }],
            environments: [{
                id: 'dev',
                name: 'Dev',
                environmentTargetId: 'target',
                syncFolder: 'workflows',
            }, {
                id: 'prod',
                name: 'Prod',
                syncSlug: 'dev',
                environmentTargetId: 'target',
                syncFolder: 'workflows',
            }],
        }));

        expect(new ConfigService(workspaceRoot).getWorkspaceConfig().environments).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'dev', syncSlug: 'dev-2' }),
            expect.objectContaining({ id: 'prod', syncSlug: 'dev' }),
        ]));
    });

    it('rejects clearing required environment sync folder on update', () => {
        const configService = new ConfigService(workspaceRoot);
        const target = configService.addInstanceTarget({ name: 'Target', url: 'https://target.example.test' });
        configService.addEnvironment({
            name: 'Dev',
            environmentTarget: target.id,
            projectId: 'personal',
            projectName: 'Personal',
            syncFolder: 'workflows/dev',
        });

        expect(() => configService.updateEnvironment('Dev', { syncFolder: '' })).toThrow(/Sync folder is required/);
    });

    it('does not auto-pin another environment when removing the active environment', () => {
        const configService = new ConfigService(workspaceRoot);
        const target = configService.addInstanceTarget({ name: 'Target', url: 'https://target.example.test' });
        configService.addEnvironment({
            name: 'Dev',
            environmentTarget: target.id,
            projectId: 'personal',
            projectName: 'Personal',
            syncFolder: 'workflows/dev',
        });
        configService.addEnvironment({
            name: 'Prod',
            environmentTarget: target.id,
            projectId: 'cgi',
            projectName: 'CGI',
            syncFolder: 'workflows/prod',
        });

        expect(() => configService.removeEnvironment('Dev')).toThrow(/active/);

        configService.removeEnvironment('Dev', { force: true });

        const workspaceConfig = configService.getWorkspaceConfig();
        expect(workspaceConfig.activeEnvironmentId).toBeUndefined();
        expect(workspaceConfig.environments).toEqual([expect.objectContaining({ name: 'Prod' })]);
    });

    it('rejects ambiguous v4 instance targets', () => {
        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 4,
            activeEnvironmentId: 'dev',
            environmentTargets: [{
                id: 'target',
                name: 'Target',
                kind: 'external-instance',
                url: 'https://target.example.test',
                managedInstanceId: 'global-instance',
            }],
            environments: [{
                id: 'dev',
                name: 'Dev',
                environmentTargetId: 'target',
                projectId: 'personal',
                projectName: 'Personal',
                syncFolder: 'workflows/dev',
            }],
        }));

        expect(() => new ConfigService(workspaceRoot).getWorkspaceConfig()).toThrow(/must not define managedInstanceId/);
    });

    it('rejects malformed v4 entries instead of silently dropping them', () => {
        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 4,
            environmentTargets: [{ name: 'Missing ID', kind: 'external-instance', url: 'https://target.example.test' }],
            environments: [],
        }));

        expect(() => new ConfigService(workspaceRoot).getWorkspaceConfig()).toThrow(/needs id and name/);

        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 4,
            environmentTargets: [{ id: 'target', name: 'Target', kind: 'external-instance', url: 'https://target.example.test' }],
            environments: [{ id: 'dev', name: 'Dev', environmentTargetId: 'target' }],
        }));

        expect(() => new ConfigService(workspaceRoot).getWorkspaceConfig()).toThrow(/needs id, name, environmentTargetId, and syncFolder/);

        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 4,
            environmentTargets: [{ id: 'target', name: 'Target', kind: 'external-instance', url: 'https://target.example.test' }],
            environments: [{
                id: 'dev',
                name: 'Dev',
                environmentTargetId: 'target',
                syncFolder: 'workflows/shared',
            }, {
                id: 'prod',
                name: 'Prod',
                environmentTargetId: 'target',
                syncFolder: './workflows/shared',
            }],
        }));

        expect(new ConfigService(workspaceRoot).getWorkspaceConfig().environments).toHaveLength(2);
    });
});
