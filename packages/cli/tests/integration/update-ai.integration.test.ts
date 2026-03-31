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
});
