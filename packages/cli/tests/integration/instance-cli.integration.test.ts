import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Each test spawns the built CLI, and node process startup on Windows makes that take
 * seconds — no headroom under vitest's 5s default. Applied per test because vitest 1.x
 * silently ignores a suite-level `timeout` option on `describe`.
 */
const INTEGRATION_TIMEOUT = 30_000;

/**
 * `tsc -b` walks the whole project-reference graph, so on a clean checkout this builds
 * every upstream package, not just the CLI — far past vitest's 10s default hookTimeout.
 */
const BUILD_TIMEOUT = 180_000;

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

function runCliWithInput(cwd: string, homeDir: string, args: string[], input: string) {
    return execFileSync('node', [cliEntry, ...args], {
        cwd,
        env: makeEnv(homeDir),
        input,
        encoding: 'utf8',
    });
}

beforeAll(() => {
    // `npm` is a .cmd shim on Windows, which execFileSync cannot spawn without a shell.
    execFileSync('npm', ['run', 'build', '--workspace=packages/cli'], {
        cwd: repoRoot,
        stdio: 'pipe',
        encoding: 'utf8',
        shell: process.platform === 'win32',
    });
}, BUILD_TIMEOUT);

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
    it('loads full skills help without legacy global instance options', () => {
        const workspaceDir = createTempDir('n8nac-cli-help-workspace-');
        const homeDir = createTempDir('n8nac-cli-help-home-');

        const output = runCli(workspaceDir, homeDir, ['help', 'skills']);

        expect(stripAnsi(output)).toContain('search [options] <query>');
        expect(stripAnsi(output)).toContain('examples');
    }, INTEGRATION_TIMEOUT);

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

        const workspaceStatus = runCliExpectFailure(workspaceDir, homeDir, ['workspace', 'status', '--json']);
        expect(stripAnsi(workspaceStatus)).toContain('Unsupported n8nac workspace config version: 3');
        expect(stripAnsi(workspaceStatus)).not.toContain('workspace migrate');

        const workspaceConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        expect(workspaceConfig.activeInstanceId).toBe('test');
        expect(workspaceConfig.projectId).toBe('project-test');
    }, INTEGRATION_TIMEOUT);

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

        const migration = runCliExpectFailure(workspaceDir, homeDir, ['workspace', 'migrate', '--json']);
        expect(stripAnsi(migration)).toContain("unknown command 'migrate'");
    }, INTEGRATION_TIMEOUT);

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
            apiKeySource: 'workspace-environment',
        });
        expect(authOutput).not.toContain('dev-key');
    }, INTEGRATION_TIMEOUT);

    it('keeps separate API keys for two environments on the same base URL', () => {
        const workspaceDir = createTempDir('n8nac-cli-shared-url-workspace-');
        const homeDir = createTempDir('n8nac-cli-shared-url-home-');

        const prod = JSON.parse(runCli(workspaceDir, homeDir, [
            'env', 'add', 'Prod',
            '--base-url', 'https://shared.example.com',
            '--api-key', 'shared-key',
            '--workflows-path', 'workflows/prod',
            '--json',
        ]));
        const preprod = JSON.parse(runCli(workspaceDir, homeDir, [
            'env', 'add', 'Preprod',
            '--base-url', 'https://shared.example.com',
            '--workflows-path', 'workflows/preprod',
            '--json',
        ]));
        expect(preprod.environmentTargetId).toBe(prod.environmentTargetId);

        runCliWithInput(workspaceDir, homeDir, ['env', 'auth', 'set', 'Preprod', '--api-key-stdin', '--json'], 'preprod-key');
        runCliWithInput(workspaceDir, homeDir, ['env', 'auth', 'set', 'Prod', '--api-key-stdin', '--json'], 'prod-key');

        const secrets = JSON.parse(fs.readFileSync(path.join(homeDir, '.n8n-manager', 'secrets.json'), 'utf8'));
        expect(secrets.instanceApiKeys[`environment:${prod.id}`]).toBe('prod-key');
        expect(secrets.instanceApiKeys[`environment:${preprod.id}`]).toBe('preprod-key');

        for (const name of ['Prod', 'Preprod']) {
            expect(JSON.parse(runCli(workspaceDir, homeDir, ['env', 'status', name, '--json']))).toMatchObject({
                environmentName: name,
                apiKeyAvailable: true,
                apiKeySource: 'workspace-environment',
            });
        }

        // Clearing an environment key leaves that environment with no credential. It must not fall
        // back to `shared-key`, which was supplied as Prod's `--api-key` and belongs to Prod alone.
        const cleared = JSON.parse(runCli(workspaceDir, homeDir, ['env', 'auth', 'clear', 'Preprod', '--json']));
        expect(cleared).toMatchObject({ environmentName: 'Preprod', apiKeyAvailable: false, apiKeySource: 'missing' });
        const secretsAfterClear = JSON.parse(fs.readFileSync(path.join(homeDir, '.n8n-manager', 'secrets.json'), 'utf8'));
        expect(secretsAfterClear.instanceApiKeys[`environment:${preprod.id}`]).toBeUndefined();
        expect(secretsAfterClear.instanceApiKeys[prod.environmentTargetId]).toBeUndefined();
        expect(JSON.parse(runCli(workspaceDir, homeDir, ['env', 'status', 'Prod', '--json']))).toMatchObject({
            apiKeySource: 'workspace-environment',
        });
    });

    it('never authenticates an environment with a credential supplied for another environment', () => {
        const workspaceDir = createTempDir('n8nac-cli-key-leak-workspace-');
        const homeDir = createTempDir('n8nac-cli-key-leak-home-');
        const secretsPath = path.join(homeDir, '.n8n-manager', 'secrets.json');
        const readSecrets = () => JSON.parse(fs.readFileSync(secretsPath, 'utf8')).instanceApiKeys;

        const prod = JSON.parse(runCli(workspaceDir, homeDir, [
            'env', 'add', 'Prod',
            '--base-url', 'https://shared.example.com',
            '--api-key', 'prod-key',
            '--workflows-path', 'workflows/prod',
            '--json',
        ]));
        const preprod = JSON.parse(runCli(workspaceDir, homeDir, [
            'env', 'add', 'Preprod',
            '--base-url', 'https://shared.example.com',
            '--api-key', 'preprod-key',
            '--workflows-path', 'workflows/preprod',
            '--json',
        ]));
        expect(preprod.environmentTargetId).toBe(prod.environmentTargetId);

        // Adding Preprod must not repoint the credential any other environment resolves.
        expect(Object.values(readSecrets())).not.toContain('preprod-key-shared-slot');
        expect(readSecrets()[prod.environmentTargetId]).toBeUndefined();
        expect(JSON.parse(runCli(workspaceDir, homeDir, ['env', 'status', 'Prod', '--json']))).toMatchObject({
            apiKeySource: 'workspace-environment',
        });

        // Clearing Prod's own key must leave Prod with no credential, never Preprod's.
        const cleared = JSON.parse(runCli(workspaceDir, homeDir, ['env', 'auth', 'clear', 'Prod', '--json']));
        expect(cleared).toMatchObject({
            environmentName: 'Prod',
            apiKeyAvailable: false,
            apiKeySource: 'missing',
        });
        expect(readSecrets()[`environment:${prod.id}`]).toBeUndefined();
        expect(readSecrets()[`environment:${preprod.id}`]).toBe('preprod-key');
    });

    it('does not repoint a key-less environment when another environment is added', () => {
        const workspaceDir = createTempDir('n8nac-cli-key-flip-workspace-');
        const homeDir = createTempDir('n8nac-cli-key-flip-home-');
        const secretsPath = path.join(homeDir, '.n8n-manager', 'secrets.json');

        const prod = JSON.parse(runCli(workspaceDir, homeDir, [
            'env', 'add', 'Prod',
            '--base-url', 'https://shared.example.com',
            '--api-key', 'prod-key',
            '--workflows-path', 'workflows/prod',
            '--json',
        ]));
        runCli(workspaceDir, homeDir, [
            'env', 'add', 'Shared',
            '--base-url', 'https://shared.example.com',
            '--workflows-path', 'workflows/shared',
            '--json',
        ]);
        // The credential the key-less Shared environment would resolve, before Preprod exists.
        const before = JSON.parse(fs.readFileSync(secretsPath, 'utf8')).instanceApiKeys[prod.environmentTargetId];

        runCli(workspaceDir, homeDir, [
            'env', 'add', 'Preprod',
            '--base-url', 'https://shared.example.com',
            '--api-key', 'preprod-key',
            '--workflows-path', 'workflows/preprod',
            '--json',
        ]);
        const after = JSON.parse(fs.readFileSync(secretsPath, 'utf8')).instanceApiKeys[prod.environmentTargetId];

        // Adding Preprod must not change the credential the untouched Shared environment resolves.
        expect(after).toBe(before);
        expect(after).not.toBe('preprod-key');
    });

    it('does not carry an environment API key to a new base URL', () => {
        const workspaceDir = createTempDir('n8nac-cli-move-url-workspace-');
        const homeDir = createTempDir('n8nac-cli-move-url-home-');

        const prod = JSON.parse(runCli(workspaceDir, homeDir, [
            'env', 'add', 'Prod',
            '--base-url', 'https://alpha.example.com',
            '--api-key', 'alpha-key',
            '--workflows-path', 'workflows/prod',
            '--json',
        ]));
        runCli(workspaceDir, homeDir, ['env', 'update', 'Prod', '--base-url', 'https://beta.example.com', '--json']);

        expect(JSON.parse(runCli(workspaceDir, homeDir, ['env', 'status', 'Prod', '--json']))).toMatchObject({
            host: 'https://beta.example.com',
            apiKeyAvailable: false,
            apiKeySource: 'missing',
        });

        runCliWithInput(workspaceDir, homeDir, ['env', 'auth', 'set', 'Prod', '--api-key-stdin', '--json'], 'beta-key');
        const secrets = JSON.parse(fs.readFileSync(path.join(homeDir, '.n8n-manager', 'secrets.json'), 'utf8'));
        expect(secrets.instanceApiKeys[`environment:${prod.id}`]).toBe('beta-key');
    });

    it('rejects --api-key for managed instance environments', () => {
        const workspaceDir = createTempDir('n8nac-cli-managed-key-workspace-');
        const homeDir = createTempDir('n8nac-cli-managed-key-home-');

        const failure = stripAnsi(runCliExpectFailure(workspaceDir, homeDir, [
            'env', 'add', 'Local',
            '--managed-instance', 'some-instance',
            '--api-key', 'local-key',
            '--workflows-path', 'workflows/local',
            '--json',
        ]));
        expect(failure).toContain('Managed instance environments do not take an API key.');
    });

    it('configures native MCP assist per environment without committing the token', () => {
        const workspaceDir = createTempDir('n8nac-cli-native-mcp-workspace-');
        const homeDir = createTempDir('n8nac-cli-native-mcp-home-');

        const created = JSON.parse(runCli(workspaceDir, homeDir, [
            'env', 'add', 'Dev',
            '--base-url', 'https://dev.example.com',
            '--api-key', 'dev-key',
            '--workflows-path', 'workflows/dev',
            '--json',
        ]));
        const configured = JSON.parse(runCliWithInput(workspaceDir, homeDir, [
            'native-mcp', 'configure', 'Dev',
            '--url', 'https://dev.example.com/mcp-server/http',
            '--token-stdin',
            '--allow-execution-data',
            '--json',
        ], 'native-secret-token'));

        expect(configured).toMatchObject({
            id: created.id,
            nativeMcp: {
                enabled: true,
                url: 'https://dev.example.com/mcp-server/http',
                allowExecutionData: true,
                tokenConfigured: true,
            },
        });
        const workspaceConfig = fs.readFileSync(path.join(workspaceDir, 'n8nac-config.json'), 'utf8');
        expect(workspaceConfig).toContain('nativeMcp');
        expect(workspaceConfig).not.toContain('native-secret-token');
        expect(workspaceConfig).not.toContain('dev-key');

        const disabled = JSON.parse(runCli(workspaceDir, homeDir, ['native-mcp', 'disable', 'Dev', '--json']));
        expect(disabled.nativeMcp).toMatchObject({ enabled: false, tokenConfigured: false });
    }, INTEGRATION_TIMEOUT);

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
    }, INTEGRATION_TIMEOUT);
});
