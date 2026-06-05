import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { ConfigService } from '../../src/services/config-service.js';

describe('ConfigService V4 workspace environments', () => {
    let previousManagerHome: string | undefined;
    let previousXdgConfigHome: string | undefined;
    let managerHome: string;
    let workspaceRoot: string;

    beforeEach(() => {
        previousManagerHome = process.env.N8N_MANAGER_HOME;
        previousXdgConfigHome = process.env.XDG_CONFIG_HOME;
        managerHome = mkdtempSync(path.join(tmpdir(), 'n8nac-manager-home-'));
        workspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-workspace-'));
        process.env.N8N_MANAGER_HOME = managerHome;
        process.env.XDG_CONFIG_HOME = managerHome;
    });

    afterEach(() => {
        if (previousManagerHome === undefined) {
            delete process.env.N8N_MANAGER_HOME;
        } else {
            process.env.N8N_MANAGER_HOME = previousManagerHome;
        }
        if (previousXdgConfigHome === undefined) {
            delete process.env.XDG_CONFIG_HOME;
        } else {
            process.env.XDG_CONFIG_HOME = previousXdgConfigHome;
        }
    });

    it('creates and resolves a remote V4 environment', () => {
        const configService = new ConfigService(workspaceRoot);

        const environment = configService.addEnvironment({
            name: 'Dev',
            environmentTarget: configService.ensureEmbeddedInstanceTarget({
                name: 'Dev',
                url: 'https://n8n.example.test',
            }).id,
            projectId: 'personal',
            projectName: 'Personal',
            workflowsPath: 'workflows/dev',
        });
        configService.pinEnvironment(environment.id);

        expect(configService.getWorkspaceConfig()).toMatchObject({
            version: 4,
            activeEnvironmentId: environment.id,
            workflowsPath: path.join(workspaceRoot, 'workflows/dev'),
        });
        expect(configService.resolveEnvironment()).toMatchObject({
            environmentId: environment.id,
            environmentName: 'Dev',
            host: 'https://n8n.example.test',
            projectId: 'personal',
            projectName: 'Personal',
            workflowsPath: path.join(workspaceRoot, 'workflows/dev'),
        });
    });

    it('rejects existing non-V4 workspace config without migration guidance', () => {
        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 3,
            activeInstanceId: 'prod',
        }, null, 2));

        const configService = new ConfigService(workspaceRoot);

        let message = '';
        try {
            configService.getWorkspaceConfig();
        } catch (error) {
            message = error instanceof Error ? error.message : String(error);
        }
        expect(message).toMatch(/Unsupported n8nac workspace config version: 3/);
        expect(message).not.toMatch(/workspace migrate/);
    });

    it('uses workflowsPath as the only environment workflow location', () => {
        const configService = new ConfigService(workspaceRoot);
        const target = configService.ensureEmbeddedInstanceTarget({
            name: 'Prod',
            url: 'https://prod.example.test',
        });

        const environment = configService.addEnvironment({
            name: 'Prod',
            environmentTarget: target.id,
            workflowsPath: 'flows/prod',
        });

        expect(configService.resolveEnvironment(environment.id).workflowsPath).toBe(path.join(workspaceRoot, 'flows/prod'));
    });

    it('persists native MCP environment config without secrets', () => {
        const configService = new ConfigService(workspaceRoot);
        const target = configService.ensureEmbeddedInstanceTarget({
            name: 'Dev',
            url: 'https://dev.example.test',
        });

        const environment = configService.addEnvironment({
            name: 'Dev',
            environmentTarget: target.id,
            workflowsPath: 'workflows/dev',
            nativeMcp: {
                enabled: true,
                url: 'https://dev.example.test/mcp-server/http',
                timeoutMs: 1234,
                allowExecutionData: true,
                allowRemoteExposure: false,
            },
        });

        expect(configService.resolveEnvironment(environment.id).nativeMcp).toMatchObject({
            enabled: true,
            url: 'https://dev.example.test/mcp-server/http',
            timeoutMs: 1234,
            allowExecutionData: true,
            tokenConfigured: false,
        });
    });

    it('rejects native MCP secrets in workspace config files', () => {
        writeFileSync(path.join(workspaceRoot, 'n8nac-config.json'), JSON.stringify({
            version: 4,
            activeEnvironmentId: 'dev',
            environmentTargets: [{ id: 'dev-target', name: 'Dev', kind: 'external-instance', url: 'https://dev.example.test' }],
            environments: [{
                id: 'dev',
                name: 'Dev',
                environmentTargetId: 'dev-target',
                workflowsPath: 'workflows/dev',
                nativeMcp: {
                    enabled: true,
                    url: 'https://dev.example.test/mcp-server/http',
                    token: 'secret-token',
                },
            }],
        }, null, 2));

        const configService = new ConfigService(workspaceRoot);

        expect(() => configService.getWorkspaceConfig()).toThrow(/nativeMcp\.token must not contain secrets/);
    });

    it('prepares a string-requested workspace environment', async () => {
        const configService = new ConfigService(workspaceRoot);
        const devTarget = configService.ensureEmbeddedInstanceTarget({
            name: 'Dev',
            url: 'https://dev.example.test',
        });
        const prodTarget = configService.ensureEmbeddedInstanceTarget({
            name: 'Prod',
            url: 'https://prod.example.test',
        });
        const dev = configService.addEnvironment({
            name: 'Dev',
            environmentTarget: devTarget.id,
            workflowsPath: 'workflows/dev',
        });
        const prod = configService.addEnvironment({
            name: 'Prod',
            environmentTarget: prodTarget.id,
            workflowsPath: 'workflows/prod',
        });
        configService.pinEnvironment(dev.id);

        const context = await configService.prepareWorkspaceContext(prod.id);

        expect(context.environmentId).toBe(prod.id);
        expect(context.host).toBe('https://prod.example.test');
        expect(context.workflowsPath).toBe(path.join(workspaceRoot, 'workflows/prod'));
    });
});
