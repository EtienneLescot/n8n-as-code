import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const INTEGRATION_TIMEOUT = 30_000;
const BUILD_TIMEOUT = 180_000;
const tempDirs: string[] = [];
const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const cliEntry = path.join(repoRoot, 'packages/cli/dist/index.js');

function createTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

function makeEnv(homeDir: string, overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    return {
        ...process.env,
        N8N_MANAGER_HOME: path.join(homeDir, '.n8n-manager'),
        N8N_MANAGER_STATE_PATH: path.join(homeDir, '.n8n-manager', 'instances.json'),
        N8NAC_TELEMETRY_DISABLED: '1',
        N8N_HOST: '',
        N8N_API_KEY: '',
        N8NAC_ENVIRONMENT: '',
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        ...overrides,
    };
}

function writeWorkspace(workspaceDir: string, environments: Array<{ id: string; name: string; environmentTargetId: string; projectId?: string; projectName?: string; workflowsPath?: string }>, targets: Array<{ id: string; name: string; url: string }>): void {
    fs.writeFileSync(path.join(workspaceDir, 'n8nac-config.json'), JSON.stringify({
        version: 4,
        activeEnvironmentId: environments[0]?.id,
        environmentTargets: targets.map((target) => ({ ...target, kind: 'external-instance' })),
        environments,
    }));
}

function runCli(workspaceDir: string, homeDir: string, args: string[], overrides: NodeJS.ProcessEnv = {}): string {
    return execFileSync(process.execPath, [cliEntry, ...args], {
        cwd: workspaceDir,
        env: makeEnv(homeDir, overrides),
        encoding: 'utf8',
        timeout: INTEGRATION_TIMEOUT,
    });
}

async function runCliAsync(workspaceDir: string, homeDir: string, args: string[], overrides: NodeJS.ProcessEnv = {}, nodeArgs: string[] = []): Promise<{ stdout: string; stderr: string }> {
    const result = await execFileAsync(process.execPath, [...nodeArgs, cliEntry, ...args], {
        cwd: workspaceDir,
        env: makeEnv(homeDir, overrides),
        encoding: 'utf8',
        timeout: INTEGRATION_TIMEOUT,
    });
    return { stdout: result.stdout, stderr: result.stderr };
}

function writeManagedWorkspace(workspaceDir: string, homeDir: string): void {
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
    }));
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
            projectId: 'personal',
            projectName: 'Personal',
            workflowsPath: 'workflows/dev',
        }],
    }));
}

function writePrepareEnvironmentPreload(homeDir: string): { preloadPath: string; markerPath: string } {
    const preloadPath = path.join(homeDir, 'prepare-environment-preload.mjs');
    const markerPath = path.join(homeDir, 'prepare-environment-called');
    const configServiceUrl = pathToFileURL(path.join(repoRoot, 'packages/cli/dist/services/config-service.js')).href;
    fs.writeFileSync(preloadPath, [
        "import fs from 'node:fs';",
        `import { ConfigService } from ${JSON.stringify(configServiceUrl)};`,
        'ConfigService.prototype.prepareEnvironment = async function() {',
        "  fs.writeFileSync(process.env.N8NAC_PREPARE_MARKER, 'called');",
        "  throw new Error('prepareEnvironment called during workspace inspection');",
        '};',
    ].join('\n'));
    return { preloadPath, markerPath };
}

function findAccessStatuses(value: unknown, prefix = ''): Array<{ path: string; value: unknown }> {
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value).flatMap(([key, entry]) => {
        const location = prefix ? `${prefix}.${key}` : key;
        const matches = key === 'accessStatus' ? [{ path: location, value: entry }] : [];
        return [...matches, ...findAccessStatuses(entry, location)];
    });
}

async function createUnauthorizedServer(): Promise<{ url: string; requests: string[]; close: () => Promise<void> }> {
    const requests: string[] = [];
    const server = http.createServer((request, response) => {
        requests.push(request.url || '');
        response.writeHead(401, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ message: 'Unauthorized' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected an ephemeral HTTP server address');
    return {
        url: `http://127.0.0.1:${address.port}`,
        requests,
        close: async () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    };
}

beforeAll(() => {
    execFileSync('npm', ['run', 'build', '--workspace=packages/cli'], {
        cwd: repoRoot,
        stdio: 'pipe',
        encoding: 'utf8',
        shell: process.platform === 'win32',
    });
}, BUILD_TIMEOUT);

afterAll(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('workspace status integration', () => {
    it('reports local workspace context without access status or secrets', () => {
        const workspaceDir = createTempDir('n8nac-workspace-status-workspace-');
        const homeDir = createTempDir('n8nac-workspace-status-home-');
        writeWorkspace(workspaceDir, [
            { id: 'dev', name: 'Dev', environmentTargetId: 'dev-target', projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/dev' },
            { id: 'prod', name: 'Prod', environmentTargetId: 'prod-target', projectId: 'production', projectName: 'Production', workflowsPath: 'workflows/prod' },
        ], [
            { id: 'dev-target', name: 'Dev Target', url: 'https://dev.example.test' },
            { id: 'prod-target', name: 'Prod Target', url: 'https://prod.example.test' },
        ]);

        const configured = JSON.parse(runCli(workspaceDir, homeDir, ['workspace', 'status', '--json'], {
            N8NAC_ENV_DEV_API_KEY: 'synthetic-dev-key',
        }));
        expect(configured.activeEnvironmentId).toBe('dev');
        expect(configured.apiKeyAvailable).toBe(true);
        expect(configured.credentialSource).toBe('env');
        expect(configured.host).toBe('https://dev.example.test');
        expect(configured.environments[0]).toMatchObject({ id: 'dev', apiKeyAvailable: true, credentialSource: 'env' });
        expect(configured.environmentTargets[0]).toMatchObject({ id: 'dev-target', url: 'https://dev.example.test' });
        expect(findAccessStatuses(configured)).toEqual([]);
        expect(JSON.stringify(configured)).not.toContain('synthetic-dev-key');

        const selected = JSON.parse(runCli(workspaceDir, homeDir, ['--env', 'prod', 'workspace', 'status', '--json'], {
            N8NAC_ENV_PROD_API_KEY: 'synthetic-prod-key',
        }));
        expect(selected.selectedEnvironment).toMatchObject({ environmentId: 'prod', environmentName: 'Prod', host: 'https://prod.example.test' });
        expect(findAccessStatuses(selected)).toEqual([]);
        expect(JSON.stringify(selected)).not.toContain('synthetic-prod-key');

        const missingKey = JSON.parse(runCli(workspaceDir, homeDir, ['workspace', 'status', '--json']));
        expect(missingKey.apiKeyAvailable).toBe(false);
        expect(missingKey.credentialSource).toBe('missing');
        expect(findAccessStatuses(missingKey)).toEqual([]);
    }, INTEGRATION_TIMEOUT);

    it('reports empty workspaces and text guidance without probing', () => {
        const workspaceDir = createTempDir('n8nac-workspace-status-empty-');
        const homeDir = createTempDir('n8nac-workspace-status-empty-home-');
        const output = runCli(workspaceDir, homeDir, ['workspace', 'status', '--json']);
        expect(findAccessStatuses(JSON.parse(output))).toEqual([]);

        const text = runCli(workspaceDir, homeDir, ['workspace', 'status']);
        expect(text).toContain('Run `n8nac env status` to check the instance is reachable.');
        expect(text).not.toContain('Access  :');
    }, INTEGRATION_TIMEOUT);

    it('does not request during workspace inspection while env status probes and supports --no-probe', async () => {
        const fixture = await createUnauthorizedServer();
        try {
            const workspaceDir = createTempDir('n8nac-workspace-status-probe-');
            const homeDir = createTempDir('n8nac-workspace-status-probe-home-');
            writeWorkspace(workspaceDir, [
                { id: 'dev', name: 'Dev', environmentTargetId: 'dev-target', projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/dev' },
            ], [{ id: 'dev-target', name: 'Dev Target', url: fixture.url }]);
            const overrides = { N8NAC_ENV_DEV_API_KEY: 'synthetic-probe-key' };

            const workspaceStatusResult = await runCliAsync(workspaceDir, homeDir, ['workspace', 'status', '--json'], overrides);
            const workspaceStatus = JSON.parse(workspaceStatusResult.stdout);
            expect(findAccessStatuses(workspaceStatus)).toEqual([]);
            expect(fixture.requests).toEqual([]);

            const noProbeResult = await runCliAsync(workspaceDir, homeDir, ['env', 'status', '--json', '--no-probe'], overrides);
            const noProbe = JSON.parse(noProbeResult.stdout);
            expect(noProbe.accessStatus).toBe('unknown');
            expect(noProbe.apiKeyAvailable).toBe(true);
            expect(JSON.stringify(noProbe)).not.toContain('synthetic-probe-key');
            expect(fixture.requests).toEqual([]);

            const probed = await runCliAsync(workspaceDir, homeDir, ['env', 'status', '--json'], overrides);
            expect(JSON.parse(probed.stdout).accessStatus).toBe('invalid-api-key');
            expect(fixture.requests.length).toBeGreaterThan(0);
            expect(JSON.stringify(probed)).not.toContain('synthetic-probe-key');
        } finally {
            await fixture.close();
        }
    }, INTEGRATION_TIMEOUT);

    it('does not prepare or start a managed runtime during workspace inspection', async () => {
        const workspaceDir = createTempDir('n8nac-workspace-status-managed-');
        const homeDir = createTempDir('n8nac-workspace-status-managed-home-');
        writeManagedWorkspace(workspaceDir, homeDir);
        const { preloadPath, markerPath } = writePrepareEnvironmentPreload(homeDir);

        const result = await runCliAsync(workspaceDir, homeDir, ['workspace', 'status', '--json'], {
            N8NAC_PREPARE_MARKER: markerPath,
        }, ['--import', preloadPath]);

        expect(JSON.parse(result.stdout)).toMatchObject({
            activeEnvironmentId: 'dev',
            activeInstanceId: 'managed-dev',
            host: 'http://127.0.0.1:5678',
        });
        expect(fs.existsSync(markerPath)).toBe(false);
    }, INTEGRATION_TIMEOUT);
});
