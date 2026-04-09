import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService, type IWorkspaceConfig } from '../../src/services/config-service.js';
import fs from 'fs';
import Conf from 'conf';

const { mockResolveInstanceIdentifier, mockCreateFallbackInstanceIdentifier } = vi.hoisted(() => ({
    mockResolveInstanceIdentifier: vi.fn(),
    mockCreateFallbackInstanceIdentifier: vi.fn()
}));

vi.mock('fs');
vi.mock('conf');
vi.mock('../../src/core/index.js', async () => {
    const actual = await vi.importActual<typeof import('../../src/core/index.js')>('../../src/core/index.js');
    return {
        ...actual,
        resolveInstanceIdentifier: mockResolveInstanceIdentifier,
        createFallbackInstanceIdentifier: mockCreateFallbackInstanceIdentifier
    };
});

describe('ConfigService', () => {
    let configService: ConfigService;
    let mockConf: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        vi.clearAllMocks();
        mockResolveInstanceIdentifier.mockReset();
        mockCreateFallbackInstanceIdentifier.mockReset();

        mockConf = {
            get: vi.fn(),
            set: vi.fn()
        };
        (Conf as any).mockImplementation(() => mockConf);

        configService = new ConfigService('/tmp/workspace');
    });

    it('returns the active instance as the local config when the workspace config already contains a library', () => {
        const workspaceConfig: IWorkspaceConfig = {
            version: 2,
            activeInstanceId: 'prod',
            instances: [
                {
                    id: 'test',
                    name: 'Test',
                    host: 'https://test.example.com',
                    syncFolder: 'workflows-test',
                    projectId: 'project-test',
                    projectName: 'Test'
                },
                {
                    id: 'prod',
                    name: 'Production',
                    host: 'https://prod.example.com',
                    syncFolder: 'workflows-prod',
                    projectId: 'project-prod',
                    projectName: 'Production',
                    instanceIdentifier: 'prod_identifier'
                }
            ],
            host: 'https://prod.example.com',
            syncFolder: 'workflows-prod',
            projectId: 'project-prod',
            projectName: 'Production',
            instanceIdentifier: 'prod_identifier'
        };

        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (fs.readFileSync as any).mockReturnValue(JSON.stringify(workspaceConfig));

        expect(configService.getLocalConfig()).toEqual({
            host: 'https://prod.example.com',
            syncFolder: 'workflows-prod',
            projectId: 'project-prod',
            projectName: 'Production',
            instanceIdentifier: 'prod_identifier',
            workflowDir: 'workflows-prod/prod_identifier/production'
        });
        expect(configService.getActiveInstanceId()).toBe('prod');
        expect(configService.listInstances()).toHaveLength(2);
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('migrates a legacy single-instance config into the instance library format', () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((filePath: string) => {
            if (filePath.endsWith('n8nac-config.json')) return false;
            if (filePath.endsWith('n8nac.json')) return true;
            if (filePath.endsWith('n8nac-instance.json')) return true;
            return false;
        });
        (fs.readFileSync as any).mockImplementation((filePath: string) => {
            if (filePath.endsWith('n8nac.json')) {
                return JSON.stringify({
                    host: 'http://localhost:5678',
                    syncFolder: 'workflows',
                    projectId: 'project-1',
                    projectName: 'Personal'
                });
            }

            return JSON.stringify({
                instanceIdentifier: 'legacy_identifier'
            });
        });

        const localConfig = configService.getLocalConfig();

        expect(localConfig).toEqual({
            host: 'http://localhost:5678',
            syncFolder: 'workflows',
            projectId: 'project-1',
            projectName: 'Personal',
            instanceIdentifier: 'legacy_identifier',
            workflowDir: 'workflows/legacy_identifier/personal'
        });
        expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
        const persistedConfig = JSON.parse((fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1]);
        expect(persistedConfig.version).toBe(2);
        expect(persistedConfig.instances).toHaveLength(1);
        expect(persistedConfig.activeInstanceId).toBe(persistedConfig.instances[0].id);
    });

    it('migrates a legacy mono-instance n8nac-config.json into the instance library format', () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((filePath: string) => filePath.endsWith('n8nac-config.json'));
        (fs.readFileSync as any).mockReturnValue(JSON.stringify({
            host: 'http://localhost:5678',
            syncFolder: 'workflows',
            projectId: 'project-1',
            projectName: 'Personal',
            instanceIdentifier: 'legacy_identifier',
            folderSync: true,
        }));

        const workspaceConfig = configService.getWorkspaceConfig();

        expect(workspaceConfig.version).toBe(2);
        expect(workspaceConfig.instances).toHaveLength(1);
        expect(workspaceConfig.activeInstanceId).toBe(workspaceConfig.instances[0].id);
        expect(workspaceConfig.instances[0]).toMatchObject({
            host: 'http://localhost:5678',
            syncFolder: 'workflows',
            projectId: 'project-1',
            projectName: 'Personal',
            instanceIdentifier: 'legacy_identifier',
            workflowDir: 'workflows/legacy_identifier/personal',
            folderSync: true,
        });
        expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('saveLocalConfig creates a named instance config and makes it active', () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

        const savedProfile = configService.saveLocalConfig({
            host: 'https://prod.example.com',
            syncFolder: 'workflows-prod',
            projectId: 'project-prod',
            projectName: 'Production'
        }, {
            instanceName: 'Production'
        });

        expect(savedProfile.name).toBe('Production');
        expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
        const persistedConfig = JSON.parse((fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1]);
        expect(persistedConfig.version).toBe(2);
        expect(persistedConfig.activeInstanceId).toBe(savedProfile.id);
        expect(persistedConfig.instances[0]).toMatchObject({
            id: savedProfile.id,
            name: 'Production',
            host: 'https://prod.example.com',
            syncFolder: 'workflows-prod'
        });
        expect(persistedConfig.host).toBe('https://prod.example.com');
    });

    it('createInstance and updateInstance expose explicit instance operations', () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

        const created = configService.createInstance({
            host: 'https://prod.example.com',
            syncFolder: 'workflows',
            projectId: 'project-prod',
            projectName: 'Production'
        }, {
            instanceName: 'Production',
            setActive: true,
        });

        (fs.readFileSync as any).mockReturnValue((fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1]);
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

        const updated = configService.updateInstance({
            host: 'https://prod.example.com',
            syncFolder: 'n8n/workflows',
            projectId: 'project-prod',
            projectName: 'Production'
        }, {
            instanceId: created.id,
            instanceName: 'Production',
            setActive: true,
        });

        expect(updated.id).toBe(created.id);
        const persistedConfig = JSON.parse((fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1]);
        expect(persistedConfig.instances).toHaveLength(1);
        expect(persistedConfig.instances[0].syncFolder).toBe('n8n/workflows');
    });

    it('normalizes workflowDir for cross-platform syncFolder values', () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

        const savedProfile = configService.saveLocalConfig({
            host: 'https://prod.example.com',
            syncFolder: 'C:\\Users\\etienne\\n8n\\workflows',
            projectId: 'project-prod',
            projectName: 'Production',
            instanceIdentifier: 'windows_instance'
        }, {
            instanceName: 'Production'
        });

        expect(savedProfile.workflowDir).toBe('C:/Users/etienne/n8n/workflows/windows_instance/production');
        const persistedConfig = JSON.parse((fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1]);
        expect(persistedConfig.workflowDir).toBe('C:/Users/etienne/n8n/workflows/windows_instance/production');
    });

    it('preserves UNC prefixes when normalizing workflowDir', () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

        const savedProfile = configService.saveLocalConfig({
            host: 'https://prod.example.com',
            syncFolder: '\\\\server\\share\\workflows',
            projectId: 'project-prod',
            projectName: 'Production',
            instanceIdentifier: 'unc_instance'
        }, {
            instanceName: 'Production'
        });

        expect(savedProfile.workflowDir).toBe('//server/share/workflows/unc_instance/production');
        const persistedConfig = JSON.parse((fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1]);
        expect(persistedConfig.workflowDir).toBe('//server/share/workflows/unc_instance/production');
    });

    it('rejects creating a duplicate verified instance config for the same host and authenticated user', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

        const first = await configService.upsertInstanceConfigWithVerification({
            host: 'https://prod.example.com',
            apiKey: 'prod-key',
            syncFolder: 'workflows',
            projectId: 'project-prod',
            projectName: 'Production'
        }, {
            createNew: true,
            setActive: true,
            client: {
                async getCurrentUser() {
                    return {
                        id: 'user-1',
                        email: 'etienne@example.com',
                        firstName: 'Etienne',
                        lastName: 'Lescot',
                    };
                }
            }
        });

        expect(first.status).toBe('saved');

        const persisted = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1];
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (fs.readFileSync as any).mockReturnValue(persisted);

        const duplicate = await configService.upsertInstanceConfigWithVerification({
            host: 'https://prod.example.com',
            apiKey: 'another-key',
            syncFolder: 'workflows-copy',
            projectId: 'project-prod',
            projectName: 'Production'
        }, {
            createNew: true,
            setActive: true,
            client: {
                async getCurrentUser() {
                    return {
                        id: 'user-1',
                        email: 'etienne@example.com',
                        firstName: 'Etienne',
                        lastName: 'Lescot',
                    };
                }
            }
        });

        expect(duplicate.status).toBe('duplicate');
        if (duplicate.status === 'duplicate') {
            expect(duplicate.duplicateInstance.name).toContain('prod.example.com');
        }
    });

    it('setActiveInstance rewrites the top-level active config cache', () => {
        const workspaceConfig: IWorkspaceConfig = {
            version: 2,
            activeInstanceId: 'test',
            instances: [
                {
                    id: 'test',
                    name: 'Test',
                    host: 'https://test.example.com',
                    syncFolder: 'workflows-test',
                    projectId: 'project-test',
                    projectName: 'Test'
                },
                {
                    id: 'prod',
                    name: 'Production',
                    host: 'https://prod.example.com',
                    syncFolder: 'workflows-prod',
                    projectId: 'project-prod',
                    projectName: 'Production',
                    instanceIdentifier: 'prod_identifier'
                }
            ],
            host: 'https://test.example.com',
            syncFolder: 'workflows-test',
            projectId: 'project-test',
            projectName: 'Test'
        };

        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (fs.readFileSync as any).mockReturnValue(JSON.stringify(workspaceConfig));

        const active = configService.setActiveInstance('prod');

        expect(active.name).toBe('Production');
        const persistedConfig = JSON.parse((fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1]);
        expect(persistedConfig.activeInstanceId).toBe('prod');
        expect(persistedConfig.host).toBe('https://prod.example.com');
        expect(persistedConfig.projectName).toBe('Production');
        expect(persistedConfig.instanceIdentifier).toBe('prod_identifier');
        expect(persistedConfig.workflowDir).toBe('workflows-prod/prod_identifier/production');
    });

    it('deleteInstance removes the scoped secret and promotes the next active instance when deleting the current one', () => {
        const workspaceConfig: IWorkspaceConfig = {
            version: 2,
            activeInstanceId: 'prod',
            instances: [
                {
                    id: 'prod',
                    name: 'Production',
                    host: 'https://prod.example.com',
                    syncFolder: 'workflows-prod',
                    projectId: 'project-prod',
                    projectName: 'Production'
                },
                {
                    id: 'test',
                    name: 'Test',
                    host: 'https://test.example.com',
                    syncFolder: 'workflows-test',
                    projectId: 'project-test',
                    projectName: 'Test'
                }
            ],
            host: 'https://prod.example.com',
            syncFolder: 'workflows-prod',
            projectId: 'project-prod',
            projectName: 'Production'
        };

        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (fs.readFileSync as any).mockReturnValue(JSON.stringify(workspaceConfig));
        mockConf.get.mockImplementation((key: string) => {
            if (key === 'instanceProfiles') {
                return {
                    prod: 'prod-key',
                    test: 'test-key',
                };
            }
            return {};
        });

        const result = configService.deleteInstance('prod');

        expect(result.deletedInstance.id).toBe('prod');
        expect(result.activeInstance?.id).toBe('test');
        const persistedConfig = JSON.parse((fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1]);
        expect(persistedConfig.activeInstanceId).toBe('test');
        expect(persistedConfig.instances).toHaveLength(1);
        expect(persistedConfig.instances[0].id).toBe('test');
        expect(mockConf.set).toHaveBeenCalledWith('instanceProfiles', {
            test: 'test-key',
        });
    });

    it('stores and resolves API keys by instance config when available', () => {
        mockConf.get.mockImplementation((key: string) => {
            if (key === 'hosts') {
                return { 'https://prod.example.com': 'host-level-key' };
            }
            if (key === 'instanceProfiles') {
                return { prod: 'config-level-key' };
            }
            return {};
        });

        expect(configService.getApiKey('https://prod.example.com', 'prod')).toBe('config-level-key');
        expect(configService.getApiKey('https://prod.example.com')).toBe('host-level-key');

        configService.saveApiKey('https://prod.example.com', 'new-key', 'prod');

        expect(mockConf.set).toHaveBeenCalledWith('hosts', {
            'https://prod.example.com': 'new-key'
        });
        expect(mockConf.set).toHaveBeenCalledWith('instanceProfiles', {
            prod: 'new-key'
        });
    });

    it('getOrCreateInstanceIdentifier updates the targeted instance config', async () => {
        const workspaceConfig: IWorkspaceConfig = {
            version: 2,
            activeInstanceId: 'prod',
            instances: [
                {
                    id: 'prod',
                    name: 'Production',
                    host: 'https://prod.example.com',
                    syncFolder: 'workflows-prod',
                    projectId: 'project-prod',
                    projectName: 'Production'
                }
            ],
            host: 'https://prod.example.com',
            syncFolder: 'workflows-prod',
            projectId: 'project-prod',
            projectName: 'Production'
        };

        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (fs.readFileSync as any).mockReturnValue(JSON.stringify(workspaceConfig));
        mockConf.get.mockImplementation((key: string) => {
            if (key === 'instanceProfiles') {
                return { prod: 'test-key' };
            }
            if (key === 'hosts') {
                return {};
            }
            return {};
        });
        mockResolveInstanceIdentifier.mockResolvedValue({
            identifier: 'recomputed-id',
            usedFallback: false
        });

        const result = await configService.getOrCreateInstanceIdentifier('https://prod.example.com', 'prod');

        expect(result).toBe('recomputed-id');
        expect(mockResolveInstanceIdentifier).toHaveBeenCalledWith({
            host: 'https://prod.example.com',
            apiKey: 'test-key'
        });

        const persistedConfig = JSON.parse((fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1]);
        expect(persistedConfig.instanceIdentifier).toBe('recomputed-id');
        expect(persistedConfig.instances[0].instanceIdentifier).toBe('recomputed-id');
    });

    it('selectInstanceConfigWithVerification switches to the already verified duplicate config', async () => {
        const workspaceConfig: IWorkspaceConfig = {
            version: 2,
            activeInstanceId: 'draft',
            instances: [
                {
                    id: 'verified',
                    name: 'prod.example.com · Etienne Lescot',
                    host: 'https://prod.example.com',
                    syncFolder: 'workflows',
                    projectId: 'project-prod',
                    projectName: 'Production',
                    instanceIdentifier: 'prod_example_etienne_l',
                    verification: {
                        status: 'verified',
                        normalizedHost: 'https://prod.example.com',
                        userId: 'user-1',
                        userName: 'Etienne Lescot',
                        userEmail: 'etienne@example.com',
                    }
                },
                {
                    id: 'draft',
                    name: 'Draft',
                    host: 'https://prod.example.com',
                    syncFolder: 'workflows',
                    projectId: 'project-prod',
                    projectName: 'Production',
                    verification: {
                        status: 'unverified',
                    }
                }
            ],
            host: 'https://prod.example.com',
            syncFolder: 'workflows',
            projectId: 'project-prod',
            projectName: 'Production'
        };

        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (fs.readFileSync as any).mockReturnValue(JSON.stringify(workspaceConfig));
        mockConf.get.mockImplementation((key: string) => {
            if (key === 'instanceProfiles') {
                return { draft: 'draft-key' };
            }
            return {};
        });

        const selection = await configService.selectInstanceConfigWithVerification('draft', {
            client: {
                async getCurrentUser() {
                    return {
                        id: 'user-1',
                        email: 'etienne@example.com',
                        firstName: 'Etienne',
                        lastName: 'Lescot',
                    };
                }
            }
        });

        expect(selection.status).toBe('duplicate');
        if (selection.status === 'duplicate') {
            expect(selection.profile.id).toBe('verified');
            expect(selection.duplicateInstance.id).toBe('verified');
        }
    });
});
