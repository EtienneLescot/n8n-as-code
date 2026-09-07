import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UpdateAiCommand, getCliVersion } from '../../src/commands/update-ai.js';

const ENV_KEYS = ['N8NAC_ENVIRONMENT', 'N8NAC_NATIVE_MCP_LEVEL', 'N8N_HOST', 'N8N_API_KEY'];
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
    savedEnv = {};
    for (const key of ENV_KEYS) {
        savedEnv[key] = process.env[key];
        delete process.env[key];
    }
});

afterEach(() => {
    for (const key of ENV_KEYS) {
        if (savedEnv[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = savedEnv[key];
        }
    }
});

function writeConfig(workspaceDir: string, nativeMcpLevel?: number): void {
    const nativeMcp =
        nativeMcpLevel === undefined
            ? undefined
            : { enabled: true, url: 'https://n8n.test/mcp-server/http', mode: 'assist', level: nativeMcpLevel };
    fs.writeFileSync(
        path.join(workspaceDir, 'n8nac-config.json'),
        JSON.stringify({
            version: 4,
            activeEnvironmentId: 'dev',
            environmentTargets: [{
                id: 'dev-target',
                name: 'Dev Target',
                kind: 'external-instance',
                url: 'https://n8n.test',
                instanceIdentifier: 'inst_c6c289e49e',
            }],
            environments: [{
                id: 'dev',
                name: 'Dev',
                environmentTargetId: 'dev-target',
                projectId: 'personal',
                projectName: 'Personal',
                workflowsPath: 'workflows/dev',
                ...(nativeMcp ? { nativeMcp } : {}),
            }],
        }, null, 2),
    );
}

function writeAgentsMd(workspaceDir: string, version: string, level?: number): void {
    const lines = ['# Bench', `<!-- n8nac-version: ${version} -->`];
    if (level !== undefined) lines.push(`<!-- n8nac-mcp-level: ${level} -->`);
    fs.writeFileSync(path.join(workspaceDir, 'AGENTS.md'), lines.join('\n') + '\n');
}

describe('update-ai refresh fingerprint', () => {
    it('does not regenerate when CLI version and MCP level both match', async () => {
        const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-refresh-'));
        try {
            writeConfig(workspaceDir, 1);
            writeAgentsMd(workspaceDir, getCliVersion() ?? 'test', 1);
            const before = fs.readFileSync(path.join(workspaceDir, 'AGENTS.md'), 'utf8');

            await UpdateAiCommand.checkAndRefreshIfStale(workspaceDir);

            expect(fs.readFileSync(path.join(workspaceDir, 'AGENTS.md'), 'utf8')).toBe(before);
        } finally {
            fs.rmSync(workspaceDir, { recursive: true, force: true });
        }
    });

    it('regenerates on MCP level change with an unchanged CLI version', async () => {
        const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-refresh-'));
        try {
            writeConfig(workspaceDir, 1);
            writeAgentsMd(workspaceDir, getCliVersion() ?? 'test', 1);

            writeConfig(workspaceDir, 2);
            await UpdateAiCommand.checkAndRefreshIfStale(workspaceDir);

            const after = fs.readFileSync(path.join(workspaceDir, 'AGENTS.md'), 'utf8');
            expect(after).toContain('<!-- n8nac-mcp-level: 2 -->');
            expect(after).toContain('level 2');
        } finally {
            fs.rmSync(workspaceDir, { recursive: true, force: true });
        }
    });
});
