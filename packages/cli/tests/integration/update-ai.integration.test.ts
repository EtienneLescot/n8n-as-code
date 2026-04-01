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

describe('CLI update-ai integration', () => {
    it('generates AGENTS.md with the current instance-management guidance', () => {
        const workspaceDir = createTempDir('n8nac-update-ai-workspace-');

        execFileSync('node', [
            cliEntry,
            'update-ai',
            '--cli-cmd',
            `node ${cliEntry}`,
        ], {
            cwd: workspaceDir,
            env: {
                ...process.env,
                N8N_HOST: '',
                N8N_API_KEY: '',
            },
            stdio: 'pipe',
            encoding: 'utf8',
        });

        const agentsPath = path.join(workspaceDir, 'AGENTS.md');
        expect(fs.existsSync(agentsPath)).toBe(true);

        const agentsContent = fs.readFileSync(agentsPath, 'utf8');
        expect(agentsContent).toContain(`node ${cliEntry} instance add`);
        expect(agentsContent).toContain(`node ${cliEntry} instance list --json`);
        expect(agentsContent).toContain(`node ${cliEntry} instance select --instance-id <id>`);
        expect(agentsContent).toContain(`node ${cliEntry} instance delete --instance-id <id> --yes`);
    });

    it('refreshes n8n-workflows.d.ts for all configured instance directories', () => {
        const workspaceDir = createTempDir('n8nac-update-ai-dts-');

        // Create a minimal n8nac-config.json with one instance that has an existing workflow dir
        const instanceIdentifier = 'local_5678_testuser';
        const syncFolder = 'workflows';
        const projectName = 'My Project';
        const projectSlug = 'my_project';

        const instanceDir = path.join(workspaceDir, syncFolder, instanceIdentifier, projectSlug);
        fs.mkdirSync(instanceDir, { recursive: true });

        // Write a stale (empty) d.ts file to simulate an outdated workspace
        const dtsPath = path.join(instanceDir, 'n8n-workflows.d.ts');
        fs.writeFileSync(dtsPath, '// stale', 'utf8');

        const config = {
            version: 2,
            activeInstanceId: 'inst-1',
            instances: [{
                id: 'inst-1',
                name: 'Test Instance',
                host: 'http://localhost:5678',
                syncFolder,
                projectId: 'proj-1',
                projectName,
                instanceIdentifier,
            }],
        };
        fs.writeFileSync(
            path.join(workspaceDir, 'n8nac-config.json'),
            JSON.stringify(config, null, 2),
            'utf8'
        );

        execFileSync('node', [
            cliEntry,
            'update-ai',
            '--cli-cmd',
            `node ${cliEntry}`,
        ], {
            cwd: workspaceDir,
            env: {
                ...process.env,
                N8N_HOST: '',
                N8N_API_KEY: '',
            },
            stdio: 'pipe',
            encoding: 'utf8',
        });

        // The d.ts file should have been refreshed (no longer "stale")
        expect(fs.existsSync(dtsPath)).toBe(true);
        const dtsContent = fs.readFileSync(dtsPath, 'utf8');
        expect(dtsContent).not.toBe('// stale');
        expect(dtsContent.length).toBeGreaterThan(100);
    });
});
