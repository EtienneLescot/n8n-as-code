import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tempDirs: string[] = [];
const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const cliEntry = path.join(repoRoot, 'packages/cli/dist/index.js');

function createTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

function makeEnv(homeDir: string) {
    return {
        ...process.env,
        HOME: homeDir,
        XDG_CONFIG_HOME: path.join(homeDir, '.config'),
        N8N_MANAGER_HOME: path.join(homeDir, '.n8n-manager'),
        N8N_HOST: '',
        N8N_API_KEY: '',
        FORCE_COLOR: '0',
        NO_COLOR: '1',
    };
}

function stripAnsi(value: string): string {
    return value.replace(/\u001B\[[0-9;]*m/g, '');
}

function runCli(cwd: string, homeDir: string, args: string[]) {
    return execFileSync('node', [cliEntry, ...args], {
        cwd,
        env: makeEnv(homeDir),
        encoding: 'utf8',
    });
}

beforeAll(() => {
    execFileSync('npm', ['run', 'build', '--workspace=packages/cli'], {
        cwd: repoRoot,
        stdio: 'pipe',
        encoding: 'utf8',
    });
});

afterAll(() => {
    for (const dir of tempDirs) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

function runCliExpectFailure(cwd: string, homeDir: string, args: string[]) {
    try {
        runCli(cwd, homeDir, args);
        throw new Error('Expected command to fail');
    } catch (error: any) {
        return `${error.stdout?.toString() || ''}${error.stderr?.toString() || ''}`;
    }
}

describe('CLI workspace integration', () => {
    it('loads full skills help when global options are placed between help and skills', () => {
        const workspaceDir = createTempDir('n8nac-cli-help-workspace-');
        const homeDir = createTempDir('n8nac-cli-help-home-');

        const output = runCli(workspaceDir, homeDir, ['help', '--instance', 'demo', 'skills']);

        expect(stripAnsi(output)).toContain('search [options] <query>');
        expect(stripAnsi(output)).toContain('examples');
    });

    it('does not expose legacy instance management commands and resolves workspace context non-interactively', () => {
        const workspaceDir = createTempDir('n8nac-cli-instance-workspace-');
        const homeDir = createTempDir('n8nac-cli-instance-home-');
        const managerHome = path.join(homeDir, '.n8n-manager');
        const configPath = path.join(workspaceDir, 'n8nac-config.json');
        const managerConfigPath = path.join(managerHome, 'instances.json');

        fs.mkdirSync(managerHome, { recursive: true });
        fs.writeFileSync(managerConfigPath, JSON.stringify({
            version: 1,
            activeInstanceId: 'test',
            defaultSyncFolder: 'workflows',
            instances: [
                {
                    id: 'prod',
                    name: 'Production',
                    mode: 'existing',
                    baseUrl: 'https://prod.example.com',
                    instanceIdentifier: 'user-prod',
                    defaultProject: {
                        id: 'project-prod',
                        name: 'Production Project',
                    },
                    verification: {
                        status: 'verified',
                        normalizedHost: 'https://prod.example.com',
                        userId: 'user-prod',
                    },
                },
                {
                    id: 'test',
                    name: 'Test',
                    mode: 'existing',
                    baseUrl: 'https://test.example.com',
                    instanceIdentifier: 'user-test',
                    defaultProject: {
                        id: 'project-test',
                        name: 'Test Project',
                    },
                    verification: {
                        status: 'verified',
                        normalizedHost: 'https://test.example.com',
                        userId: 'user-test',
                    },
                },
            ],
        }, null, 2));

        fs.writeFileSync(configPath, JSON.stringify({
            version: 3,
            activeInstanceId: 'test',
            syncFolder: 'workflows-test',
            projectId: 'project-test',
            projectName: 'Test Project',
        }, null, 2));

        const legacyOutput = runCliExpectFailure(workspaceDir, homeDir, ['instance', 'list', '--json']);
        expect(stripAnsi(legacyOutput)).toContain("unknown command 'instance'");

        const workspaceStatus = JSON.parse(runCli(workspaceDir, homeDir, ['workspace', 'status', '--json']));
        expect(workspaceStatus).toMatchObject({
            status: 'dry-run',
            required: true,
            nextCommand: 'n8nac workspace migrate --json',
            applyCommand: 'n8nac workspace migrate --write',
        });

        const workspaceConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        expect(workspaceConfig.activeInstanceId).toBe('test');
        expect(workspaceConfig.projectId).toBe('project-test');
    });

    it('creates remote environments directly without exposing low-level targets', () => {
        const workspaceDir = createTempDir('n8nac-cli-env-workspace-');
        const homeDir = createTempDir('n8nac-cli-env-home-');

        const created = JSON.parse(runCli(workspaceDir, homeDir, [
            'env', 'add', 'Dev',
            '--base-url', 'https://dev.example.com',
            '--api-key', 'dev-key',
            '--workflows-path', 'workflows/dev',
            '--json',
        ]));

        expect(created).toMatchObject({
            name: 'Dev',
            workflowsPath: 'workflows/dev',
            projectId: 'personal',
            projectName: 'Personal',
        });

        const workspaceConfig = JSON.parse(fs.readFileSync(path.join(workspaceDir, 'n8nac-config.json'), 'utf8'));
        expect(workspaceConfig).toMatchObject({
            version: 4,
            activeEnvironmentId: created.id,
            environments: [expect.objectContaining({ id: created.id, environmentTargetId: expect.any(String) })],
            environmentTargets: [expect.objectContaining({
                kind: 'external-instance',
                url: 'https://dev.example.com',
            })],
        });
        expect(JSON.stringify(workspaceConfig)).not.toContain('apiKey');
        expect(JSON.stringify(workspaceConfig)).not.toContain('dev-key');

        const migration = JSON.parse(runCli(workspaceDir, homeDir, ['workspace', 'migrate', '--json']));
        expect(migration).toMatchObject({
            status: 'not-needed',
            required: false,
        });
    });

    it('stores env auth locally for external workspace targets', () => {
        const workspaceDir = createTempDir('n8nac-cli-external-auth-workspace-');
        const homeDir = createTempDir('n8nac-cli-external-auth-home-');

        fs.writeFileSync(path.join(workspaceDir, 'n8nac-config.json'), JSON.stringify({
            version: 4,
            activeEnvironmentId: 'dev',
            environmentTargets: [{
                id: 'dev-target',
                name: 'Dev Target',
                kind: 'external-instance',
                url: 'https://dev.example.com',
            }],
            environments: [{
                id: 'dev',
                name: 'Dev',
                environmentTargetId: 'dev-target',
                syncFolder: 'workflows/dev',
            }],
        }, null, 2));

        const authOutput = runCli(workspaceDir, homeDir, ['env', 'auth', 'set', 'Dev', '--api-key', 'dev-key', '--json']);
        const authenticated = JSON.parse(authOutput);
        expect(authenticated).toMatchObject({
            environmentName: 'Dev',
            sourceKind: 'external-instance',
            apiKeyAvailable: true,
            apiKeySource: 'workspace-local',
        });
        expect(authOutput).not.toContain('dev-key');
    });

    it('rejects env auth set for managed environments', () => {
        const workspaceDir = createTempDir('n8nac-cli-managed-auth-workspace-');
        const homeDir = createTempDir('n8nac-cli-managed-auth-home-');
        const managerHome = path.join(homeDir, '.n8n-manager');

        fs.mkdirSync(managerHome, { recursive: true });
        fs.writeFileSync(path.join(managerHome, 'instances.json'), JSON.stringify({
            version: 1,
            activeInstanceId: 'managed-dev',
            instances: [{
                id: 'managed-dev',
                name: 'Managed Dev',
                mode: 'managed-local-docker',
                baseUrl: 'http://127.0.0.1:5678',
            }],
        }, null, 2));
        fs.writeFileSync(path.join(workspaceDir, 'n8nac-config.json'), JSON.stringify({
            version: 4,
            activeEnvironmentId: 'dev',
            environmentTargets: [{
                id: 'managed-dev-target',
                name: 'Managed Dev Target',
                kind: 'managed-instance',
                managedInstanceId: 'managed-dev',
            }],
            environments: [{
                id: 'dev',
                name: 'Dev',
                environmentTargetId: 'managed-dev-target',
                syncFolder: 'workflows/dev',
            }],
        }, null, 2));

        const output = runCliExpectFailure(workspaceDir, homeDir, ['env', 'auth', 'set', 'Dev', '--api-key', 'managed-key']);
        expect(stripAnsi(output)).toContain('uses managed instance "managed-dev"');

        const stdinOutput = runCliExpectFailure(workspaceDir, homeDir, ['env', 'auth', 'set', 'Dev', '--api-key-stdin']);
        expect(stripAnsi(stdinOutput)).toContain('uses managed instance "managed-dev"');
    });
});
