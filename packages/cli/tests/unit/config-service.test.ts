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
            instanceIdentifier: 'prod_identifier'
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
            instanceIdentifier: 'legacy_identifier'
        });
        expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
        const persistedConfig = JSON.parse((fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1]);
        expect(persistedConfig.version).toBe(2);
        expect(persistedConfig.instances).toHaveLength(1);
        expect(persistedConfig.activeInstanceId).toBe(persistedConfig.instances[0].id);
    });

    it('saveLocalConfig creates a named instance profile and makes it active', () => {
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
    });

    it('stores and resolves API keys by instance profile when available', () => {
        mockConf.get.mockImplementation((key: string) => {
            if (key === 'hosts') {
                return { 'https://prod.example.com': 'host-level-key' };
            }
            if (key === 'instanceProfiles') {
                return { prod: 'profile-level-key' };
            }
            return {};
        });

        expect(configService.getApiKey('https://prod.example.com', 'prod')).toBe('profile-level-key');
        expect(configService.getApiKey('https://prod.example.com')).toBe('host-level-key');

        configService.saveApiKey('https://prod.example.com', 'new-key', 'prod');

        expect(mockConf.set).toHaveBeenCalledWith('hosts', {
            'https://prod.example.com': 'new-key'
        });
        expect(mockConf.set).toHaveBeenCalledWith('instanceProfiles', {
            prod: 'new-key'
        });
    });

    it('getOrCreateInstanceIdentifier updates the targeted instance profile', async () => {
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
});
