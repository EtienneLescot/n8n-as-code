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

describe('CLI instance management integration', () => {
    it('lists, selects, and deletes saved instance configs non-interactively', () => {
        const workspaceDir = createTempDir('n8nac-cli-instance-workspace-');
        const homeDir = createTempDir('n8nac-cli-instance-home-');
        const configPath = path.join(workspaceDir, 'n8nac-config.json');

        fs.writeFileSync(configPath, JSON.stringify({
            version: 2,
            activeInstanceId: 'test',
            instances: [
                {
                    id: 'prod',
                    name: 'Production',
                    host: 'https://prod.example.com',
                    syncFolder: 'workflows-prod',
                    projectId: 'project-prod',
                    projectName: 'Production Project',
                    verification: {
                        status: 'verified',
                        normalizedHost: 'https://prod.example.com',
                        userId: 'user-prod',
                    },
                },
                {
                    id: 'test',
                    name: 'Test',
                    host: 'https://test.example.com',
                    syncFolder: 'workflows-test',
                    projectId: 'project-test',
                    projectName: 'Test Project',
                    verification: {
                        status: 'verified',
                        normalizedHost: 'https://test.example.com',
                        userId: 'user-test',
                    },
                },
            ],
            host: 'https://test.example.com',
            syncFolder: 'workflows-test',
            projectId: 'project-test',
            projectName: 'Test Project',
        }, null, 2));

        const listed = runCli(workspaceDir, homeDir, ['instance', 'list', '--json']);
        const listedInstances = JSON.parse(listed);
        expect(listedInstances).toHaveLength(2);
        expect(listedInstances.find((instance: any) => instance.id === 'test')?.active).toBe(true);

        const selected = runCli(workspaceDir, homeDir, ['instance', 'select', '--instance-name', 'Production']);
        expect(stripAnsi(selected)).toContain('Selected instance: Production');

        const selectedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        expect(selectedConfig.activeInstanceId).toBe('prod');
        expect(selectedConfig.projectId).toBe('project-prod');

        const deleted = runCli(workspaceDir, homeDir, ['instance', 'delete', '--instance-id', 'prod', '--yes']);
        expect(stripAnsi(deleted)).toContain('Deleted saved config: Production');

        const deletedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        expect(deletedConfig.instances).toHaveLength(1);
        expect(deletedConfig.instances[0].id).toBe('test');
        expect(deletedConfig.activeInstanceId).toBe('test');
    });
});
