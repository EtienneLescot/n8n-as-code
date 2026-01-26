import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService, ILocalConfig } from '../../src/services/config-service.js';
import fs from 'fs';
import path from 'path';
import Conf from 'conf';

// Mock dependencies
vi.mock('fs');
vi.mock('conf');

describe('ConfigService', () => {
    let configService: ConfigService;
    let mockConf: any;

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();

        // Mock Conf instance
        mockConf = {
            get: vi.fn(),
            set: vi.fn()
        };
        (Conf as any).mockImplementation(() => mockConf);

        configService = new ConfigService();
    });

    describe('getLocalConfig', () => {
        it('should return parsed config when file exists', () => {
            const mockConfig: ILocalConfig = {
                host: 'http://localhost:5678',
                syncFolder: 'workflows',
                instanceIdentifier: 'test-id',
                pollInterval: 3000,
                syncInactive: true,
                ignoredTags: ['archive']
            };

            (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue(JSON.stringify(mockConfig));

            const result = configService.getLocalConfig();

            expect(result).toEqual(mockConfig);
            expect(fs.existsSync).toHaveBeenCalled();
            expect(fs.readFileSync).toHaveBeenCalled();
        });

        it('should return empty object when file does not exist', () => {
            (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

            const result = configService.getLocalConfig();

            expect(result).toEqual({});
            expect(fs.readFileSync).not.toHaveBeenCalled();
        });

        it('should return empty object when JSON parse fails', () => {
            // Mock console.error to suppress the error output
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue('invalid json');

            const result = configService.getLocalConfig();

            expect(result).toEqual({});
            expect(consoleErrorSpy).toHaveBeenCalled();

            consoleErrorSpy.mockRestore();
        });
    });

    describe('saveLocalConfig', () => {
        it('should write config to file as formatted JSON', () => {
            const config: ILocalConfig = {
                host: 'http://localhost:5678',
                syncFolder: 'workflows',
                pollInterval: 3000,
                syncInactive: true,
                ignoredTags: ['archive']
            };

            configService.saveLocalConfig(config);

            expect(fs.writeFileSync).toHaveBeenCalledWith(
                expect.stringContaining('n8nac.json'),
                JSON.stringify(config, null, 2)
            );
        });
    });

    describe('getApiKey', () => {
        it('should return API key for normalized host', () => {
            const hosts = {
                'http://localhost:5678': 'test-api-key'
            };
            mockConf.get.mockReturnValue(hosts);

            const apiKey = configService.getApiKey('http://localhost:5678');

            expect(apiKey).toBe('test-api-key');
            expect(mockConf.get).toHaveBeenCalledWith('hosts');
        });

        it('should normalize host URL before lookup', () => {
            const hosts = {
                'http://localhost:5678': 'test-api-key'
            };
            mockConf.get.mockReturnValue(hosts);

            const apiKey = configService.getApiKey('http://localhost:5678/');

            expect(apiKey).toBe('test-api-key');
        });

        it('should return undefined if host not found', () => {
            mockConf.get.mockReturnValue({});

            const apiKey = configService.getApiKey('http://unknown:5678');

            expect(apiKey).toBeUndefined();
        });

        it('should return undefined if hosts object is null', () => {
            mockConf.get.mockReturnValue(null);

            const apiKey = configService.getApiKey('http://localhost:5678');

            expect(apiKey).toBeUndefined();
        });
    });

    describe('saveApiKey', () => {
        it('should save API key with normalized host', () => {
            const existingHosts = {
                'http://other:5678': 'other-key'
            };
            mockConf.get.mockReturnValue(existingHosts);

            configService.saveApiKey('http://localhost:5678', 'new-api-key');

            expect(mockConf.set).toHaveBeenCalledWith('hosts', {
                'http://other:5678': 'other-key',
                'http://localhost:5678': 'new-api-key'
            });
        });

        it('should create hosts object if it does not exist', () => {
            mockConf.get.mockReturnValue(null);

            configService.saveApiKey('http://localhost:5678', 'new-api-key');

            expect(mockConf.set).toHaveBeenCalledWith('hosts', {
                'http://localhost:5678': 'new-api-key'
            });
        });

        it('should overwrite existing API key for same host', () => {
            const existingHosts = {
                'http://localhost:5678': 'old-key'
            };
            mockConf.get.mockReturnValue(existingHosts);

            configService.saveApiKey('http://localhost:5678', 'new-key');

            expect(mockConf.set).toHaveBeenCalledWith('hosts', {
                'http://localhost:5678': 'new-key'
            });
        });
    });

    describe('hasConfig', () => {
        it('should return true when host and API key exist', () => {
            (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue(JSON.stringify({
                host: 'http://localhost:5678'
            }));
            mockConf.get.mockReturnValue({
                'http://localhost:5678': 'test-key'
            });

            const result = configService.hasConfig();

            expect(result).toBe(true);
        });

        it('should return false when host is missing', () => {
            (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue(JSON.stringify({}));

            const result = configService.hasConfig();

            expect(result).toBe(false);
        });

        it('should return false when API key is missing', () => {
            (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue(JSON.stringify({
                host: 'http://localhost:5678'
            }));
            mockConf.get.mockReturnValue({});

            const result = configService.hasConfig();

            expect(result).toBe(false);
        });
    });

    describe('getOrCreateInstanceIdentifier', () => {
        it('should return existing instance identifier from config', async () => {
            (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue(JSON.stringify({
                host: 'http://localhost:5678',
                instanceIdentifier: 'existing-id'
            }));

            const result = await configService.getOrCreateInstanceIdentifier('http://localhost:5678');

            expect(result).toBe('existing-id');
        });

        it('should create new instance identifier when not exists', async () => {
            (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue(JSON.stringify({
                host: 'http://localhost:5678'
            }));
            mockConf.get.mockReturnValue({
                'http://localhost:5678': 'test-key'
            });

            // Mock the Sync imports
            const mockCreateInstanceIdentifier = vi.fn().mockReturnValue('local_5678_user');
            const mockN8nApiClient = vi.fn().mockImplementation(() => ({
                getCurrentUser: vi.fn().mockResolvedValue({
                    id: '1',
                    email: 'user@example.com',
                    firstName: 'Test',
                    lastName: 'User'
                })
            }));

            vi.doMock('@n8n-as-code/sync', () => ({
                N8nApiClient: mockN8nApiClient,
                createInstanceIdentifier: mockCreateInstanceIdentifier,
                createFallbackInstanceIdentifier: vi.fn()
            }));

            const result = await configService.getOrCreateInstanceIdentifier('http://localhost:5678');

            expect(result).toBeTruthy();
            expect(fs.writeFileSync).toHaveBeenCalled();
        });
    });

    describe('getInstanceConfigPath', () => {
        it('should return path to instance config file', () => {
            const result = configService.getInstanceConfigPath();

            expect(result).toContain('n8nac-instance.json');
            expect(path.isAbsolute(result)).toBe(true);
        });
    });
});
