import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const tempDirs: string[] = [];
const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const cliEntry = path.join(repoRoot, 'packages/cli/dist/index.js');
const cliVersion: string = JSON.parse(
    readFileSync(path.join(repoRoot, 'packages/cli/package.json'), 'utf8')
).version;

function createTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

const baseEnv = { ...process.env, N8N_HOST: '', N8N_API_KEY: '' };

function runUpdateAi(workspaceDir: string): string {
    return execFileSync('node', [cliEntry, 'update-ai', '--cli-cmd', `node ${cliEntry}`], {
        cwd: workspaceDir,
        env: baseEnv,
        stdio: 'pipe',
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

describe('CLI update-ai integration', () => {
    it('generates AGENTS.md with the current instance-management guidance', () => {
        const workspaceDir = createTempDir('n8nac-update-ai-workspace-');
        runUpdateAi(workspaceDir);

        const agentsPath = path.join(workspaceDir, 'AGENTS.md');
        expect(fs.existsSync(agentsPath)).toBe(true);

        const agentsContent = fs.readFileSync(agentsPath, 'utf8');
        expect(agentsContent).toContain(`node ${cliEntry} instance add`);
        expect(agentsContent).toContain(`node ${cliEntry} instance list --json`);
        expect(agentsContent).toContain(`node ${cliEntry} instance select --instance-id <id>`);
        expect(agentsContent).toContain(`node ${cliEntry} instance delete --instance-id <id> --yes`);
    });

    it('embeds the n8nac CLI version stamp in AGENTS.md', () => {
        const workspaceDir = createTempDir('n8nac-update-ai-stamp-');
        runUpdateAi(workspaceDir);

        const agentsContent = fs.readFileSync(path.join(workspaceDir, 'AGENTS.md'), 'utf8');
        expect(agentsContent).toContain(`<!-- n8nac-version: ${cliVersion} -->`);
    });

    it('checkAndRefreshIfStale silently refreshes AGENTS.md when the version stamp is stale', async () => {
        const workspaceDir = createTempDir('n8nac-update-ai-stale-');

        // Seed AGENTS.md with a fake old version stamp
        const agentsPath = path.join(workspaceDir, 'AGENTS.md');
        fs.writeFileSync(agentsPath, [
            '# 🤖 AI Agents Guidelines',
            '<!-- n8n-as-code-start -->',
            '<!-- n8nac-version: 0.0.1 -->',
            '## old content',
            '<!-- n8n-as-code-end -->',
        ].join('\n'), 'utf8');

        // Call checkAndRefreshIfStale directly — this exercises the actual stale-detection
        // logic rather than just running update-ai (which always regenerates unconditionally).
        const initAiDistPath = path.join(repoRoot, 'packages/cli/dist/commands/init-ai.js');
        const { UpdateAiCommand } = await import(initAiDistPath) as typeof import('../../src/commands/init-ai.js');
        await UpdateAiCommand.checkAndRefreshIfStale(workspaceDir);

        const refreshed = fs.readFileSync(agentsPath, 'utf8');
        // Stamp must now match the current version
        expect(refreshed).toContain(`<!-- n8nac-version: ${cliVersion} -->`);
        // Content must be a full AGENTS.md (not just "old content")
        expect(refreshed).toContain('Expert n8n Workflow Engineer');
    });

    it('refreshes n8n-workflows.d.ts for all configured instance directories', () => {
        const workspaceDir = createTempDir('n8nac-update-ai-dts-');

        const instanceIdentifier = 'local_5678_testuser';
        const syncFolder = 'workflows';
        const projectName = 'My Project';
        const projectSlug = 'my_project';

        const instanceDir = path.join(workspaceDir, syncFolder, instanceIdentifier, projectSlug);
        fs.mkdirSync(instanceDir, { recursive: true });

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

        runUpdateAi(workspaceDir);

        expect(fs.existsSync(dtsPath)).toBe(true);
        const dtsContent = fs.readFileSync(dtsPath, 'utf8');
        expect(dtsContent).not.toBe('// stale');
        expect(dtsContent.length).toBeGreaterThan(100);
    });
});
