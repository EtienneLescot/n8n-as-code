import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseCommand } from '../../src/commands/base.js';

const configServiceMock = vi.hoisted(() => ({
    getLocalConfig: vi.fn(() => ({
        host: 'https://n8n.test',
        syncFolder: 'workflows',
        projectId: 'personal',
        projectName: 'Personal',
        folderSync: false,
    })),
    getActiveInstanceId: vi.fn(() => 'prod'),
    getEffectiveContext: vi.fn(() => undefined),
    getApiKey: vi.fn(() => 'stored-key'),
    resolveWorkspacePath: vi.fn((targetPath: string) => `/workspace/${targetPath}`),
    prepareWorkspaceContext: vi.fn(async () => ({
        activeInstanceId: 'prod',
        activeInstanceName: 'Production',
        host: 'https://n8n.test',
        apiKey: 'stored-key',
        syncFolder: 'workflows',
        projectId: 'personal',
        projectName: 'Personal',
        folderSync: false,
    })),
    getOrCreateInstanceIdentifier: vi.fn(async () => 'n8n_1234567890'),
    getEffectiveInstanceConfig: vi.fn(() => ({
        host: 'https://n8n.test',
        syncFolder: 'workflows',
        projectId: 'personal',
        projectName: 'Personal',
        folderSync: false,
    })),
    getInstanceConfigPath: vi.fn(() => '/workspace/n8nac-config.json'),
    listInstances: vi.fn(() => []),
}));

vi.mock('../../src/services/config-service.js', () => ({
    ConfigService: vi.fn(() => configServiceMock),
}));

vi.mock('child_process', async (importOriginal) => ({
    ...await importOriginal<typeof import('child_process')>(),
    spawn: vi.fn(() => ({ unref: vi.fn() })),
}));

class ExposedCommand extends BaseCommand {
    async readSyncConfig(): Promise<any> {
        return this.getSyncConfig();
    }

    getApiKey(): string {
        return (this.client as any).apiKey;
    }
}

describe('BaseCommand', () => {
    let previousHost: string | undefined;
    let previousApiKey: string | undefined;
    let previousInstanceName: string | undefined;

    beforeEach(() => {
        previousHost = process.env.N8N_HOST;
        previousApiKey = process.env.N8N_API_KEY;
        previousInstanceName = process.env.N8NAC_INSTANCE_NAME;

        vi.clearAllMocks();
        delete process.env.N8N_HOST;
        delete process.env.N8NAC_INSTANCE_NAME;
    });

    afterEach(() => {
        restoreEnv('N8N_HOST', previousHost);
        restoreEnv('N8N_API_KEY', previousApiKey);
        restoreEnv('N8NAC_INSTANCE_NAME', previousInstanceName);
        vi.restoreAllMocks();
    });

    it('preserves N8N_API_KEY when host comes from workspace config', async () => {
        process.env.N8N_API_KEY = 'env-key';

        const command = new ExposedCommand();
        await command.readSyncConfig();

        expect(configServiceMock.prepareWorkspaceContext).not.toHaveBeenCalled();
        expect(command.getApiKey()).toBe('env-key');
    });
});

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) {
        delete process.env[name];
    } else {
        process.env[name] = value;
    }
}
