import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
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

    it('rejects legacy workspace configs with embedded instances', () => {
        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 2,
            activeInstanceId: 'prod',
            instances: [],
        }));

        const configService = new ConfigService(workspaceRoot);

        expect(() => configService.getWorkspaceConfig()).toThrow(/Unsupported legacy n8n workspace config/);
    });
});
