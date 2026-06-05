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

function runUpdateAi(workspaceDir: string, extraArgs: string[] = [], envOverrides: NodeJS.ProcessEnv = {}): string {
    return execFileSync('node', [cliEntry, 'update-ai', '--cli-cmd', `node ${cliEntry}`, ...extraArgs], {
        cwd: workspaceDir,
        env: {
            ...baseEnv,
            N8N_MANAGER_HOME: createTempDir('n8nac-update-ai-manager-home-'),
            ...envOverrides,
        },
        stdio: 'pipe',
        encoding: 'utf8',
    });
}

function runCli(workspaceDir: string, args: string[], envOverrides: NodeJS.ProcessEnv = {}): string {
    return execFileSync('node', [cliEntry, ...args], {
        cwd: workspaceDir,
        env: {
            ...baseEnv,
            N8N_MANAGER_HOME: createTempDir('n8nac-cli-manager-home-'),
            ...envOverrides,
        },
        stdio: 'pipe',
        encoding: 'utf8',
    });
}

function runCliFailure(workspaceDir: string, args: string[], envOverrides: NodeJS.ProcessEnv = {}): { status: number | null; stdout: string; stderr: string } {
    try {
        execFileSync('node', [cliEntry, ...args], {
            cwd: workspaceDir,
            env: {
                ...baseEnv,
                N8N_MANAGER_HOME: createTempDir('n8nac-cli-manager-home-'),
                ...envOverrides,
            },
            stdio: 'pipe',
            encoding: 'utf8',
        });
        throw new Error('Expected command to fail.');
    } catch (error: any) {
        if (error.message === 'Expected command to fail.') throw error;
        return {
            status: typeof error.status === 'number' ? error.status : null,
            stdout: String(error.stdout || ''),
            stderr: String(error.stderr || ''),
        };
    }
}

function expectNativeMcpRoutingPolicy(content: string, cliCmd: string, skillsCmd: string): void {
    expect(content).toContain('The `n8n-as-code` MCP server is a client adapter for N8NAC tools.');
    expect(content).toContain('The native n8n MCP server is a separate live n8n instance endpoint.');
    expect(content).toContain(`Default to local \`${cliCmd}\` for code-first workflow authoring, validation, pull, push`);
    expect(content).toContain(`Use \`${skillsCmd}\` as the bundled offline knowledge default.`);
    expect(content).toContain(`Check native availability with \`${cliCmd} native-mcp status --include-tools --json\` before relying on native tools.`);
    expect(content).toContain('Do not treat the presence of any MCP server as permission to call native n8n MCP tools.');
    expect(content).toContain('Native n8n MCP is used if and only if the generated execution or investigation strategy needs live n8n capabilities that local N8NAC cannot provide as well.');

    const useCases = [
        'Workflow authoring, editing, pull, push, sync, credentials, and durable workflow changes: use local',
        'Offline node knowledge, examples, documentation, and schema-first authoring: use local',
        'Live workflow discovery, drift investigation, projects, folders, credentials metadata, and execution inspection: use native MCP assist only when it is configured and live n8n state is required.',
        'Connected-version node definitions or server-side validation: use native MCP assist only when bundled knowledge may be stale or the user needs validation against the connected n8n version.',
        `Runtime execution: prefer \`${cliCmd} test\` for real webhook, chat, or form trigger contracts; prefer native runtime execution only for explicit workflow-ID execution, non-webhook testing, native pin-data preparation, or direct execution diagnostics.`,
        'Direct native workflow creation, update, publish, unpublish, archive, or destructive operations: do not use them as an automatic path; require an explicit direct-native request and sync-back plan.',
    ];

    for (const useCase of useCases) {
        expect(content).toContain(useCase);
    }

    expect(content).toContain('do not run it just because the tool exists');
    expect(content).toContain('Do not use native MCP create, update, publish, unpublish, archive, or destructive data-table tools');
    expect(content).toContain('N8NAC_NATIVE_MCP_ALLOW_REMOTE=1');
    expect(content).toContain('N8NAC_NATIVE_MCP_ALLOW_EXECUTION_DATA=1');
    expect(content).toContain('Never put native MCP tokens in project files, generated docs, command arguments, or responses.');
    expect(content).not.toContain('Default to native MCP');
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
    it('generates lightweight AGENTS.md, VS Code agents, and portable local skills', () => {
        const workspaceDir = createTempDir('n8nac-update-ai-workspace-');
        runUpdateAi(workspaceDir);

        const agentsPath = path.join(workspaceDir, 'AGENTS.md');
        const architectAgentPath = path.join(workspaceDir, '.github/agents/n8n-architect.agent.md');
        const architectSkillPath = path.join(workspaceDir, '.agents/skills/n8n-architect/SKILL.md');
        expect(fs.existsSync(agentsPath)).toBe(true);
        expect(fs.existsSync(architectAgentPath)).toBe(true);
        expect(fs.existsSync(architectSkillPath)).toBe(true);

        const agentsContent = fs.readFileSync(agentsPath, 'utf8');
        const architectSkill = fs.readFileSync(architectSkillPath, 'utf8');

        expect(agentsContent).toContain('This file is generated by');
        expect(agentsContent).toContain('Do not infer configuration from this file');
        expect(agentsContent).toContain(`node ${cliEntry} env status --json`);
        expect(agentsContent).not.toContain(`node ${cliEntry} workspace migrate --json`);
        expect(agentsContent).not.toContain(`node ${cliEntry} workspace status --json`);
        expect(agentsContent).toContain('.github/agents/n8n-architect.agent.md');
        expect(agentsContent).toContain('.agents/skills/n8n-architect/SKILL.md');
        expect(agentsContent).not.toContain('.github/agents/n8n-manager.agent.md');
        expect(agentsContent).not.toContain('.agents/skills/n8n-manager/SKILL.md');
        expect(agentsContent).not.toContain('Effective instance');
        expect(agentsContent).not.toContain('Active project');
        expect(architectSkill).toContain(`node ${cliEntry} env status --json`);
        expect(architectSkill).not.toContain(`node ${cliEntry} workspace migrate --json`);
        expect(architectSkill).not.toContain('workspace migrate --json');
        expect(architectSkill).toContain(`node ${cliEntry} env add Local --managed-instance <id> --workflows-path workflows/local`);
        expect(architectSkill).toContain('Managed Local Runtime');
        expect(architectSkill).toContain('--api-key-stdin');
        expect(agentsContent).not.toContain('saved instance configs');
    });

    it('generates native MCP routing guidance that uses live assist only when needed', () => {
        const workspaceDir = createTempDir('n8nac-update-ai-native-mcp-routing-');
        runUpdateAi(workspaceDir);

        const architectSkill = fs.readFileSync(path.join(workspaceDir, '.agents/skills/n8n-architect/SKILL.md'), 'utf8');

        expectNativeMcpRoutingPolicy(architectSkill, `node ${cliEntry}`, `node ${cliEntry} skills`);
    });

    it('embeds the n8nac CLI version stamp in AGENTS.md', () => {
        const workspaceDir = createTempDir('n8nac-update-ai-stamp-');
        runUpdateAi(workspaceDir);

        const agentsContent = fs.readFileSync(path.join(workspaceDir, 'AGENTS.md'), 'utf8');
        expect(agentsContent).toContain(`<!-- n8nac-version: ${cliVersion} -->`);
    });

    it('reports unsupported config versions from workspace status for legacy configs', () => {
        const workspaceDir = createTempDir('n8nac-status-legacy-workspace-');
        fs.writeFileSync(path.join(workspaceDir, 'n8nac-config.json'), JSON.stringify({
            version: 2,
            activeInstanceId: 'legacy-prod',
            instances: [{
                id: 'legacy-prod',
                name: 'Legacy Prod',
                host: 'https://legacy.example.test',
            }],
        }, null, 2));

        const result = runCliFailure(workspaceDir, ['workspace', 'status', '--json']);

        expect(result.status).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('Unsupported n8nac workspace config version: 2');
        expect(result.stderr).toContain('n8nac env add <name> --base-url <url> --workflows-path workflows/<name>');
        expect(result.stderr).not.toContain('workspace migrate');
    });

    it('reports unsupported config versions from environment commands', () => {
        const workspaceDir = createTempDir('n8nac-env-blocked-legacy-workspace-');
        fs.writeFileSync(path.join(workspaceDir, 'n8nac-config.json'), JSON.stringify({
            version: 2,
            activeInstanceId: 'legacy-prod',
            instances: [{
                id: 'legacy-prod',
                name: 'Legacy Prod',
                host: 'https://legacy.example.test',
            }],
        }, null, 2));

        const result = runCliFailure(workspaceDir, ['env', 'list', '--json']);

        expect(result.status).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('Unsupported n8nac workspace config version: 2');
        expect(result.stderr).not.toContain('workspace migrate');
    });

    it('uses n8nac workflow presentation and keeps n8n-manager guidance limited', () => {
        const workspaceDir = createTempDir('n8nac-update-ai-manager-tools-');
        const managerCmd = 'node /tmp/n8n-manager.js';
        runUpdateAi(workspaceDir, ['--manager-cmd', managerCmd]);

        const agentsContent = fs.readFileSync(path.join(workspaceDir, 'AGENTS.md'), 'utf8');
        const architectAgent = fs.readFileSync(path.join(workspaceDir, '.github/agents/n8n-architect.agent.md'), 'utf8');
        const architectSkill = fs.readFileSync(path.join(workspaceDir, '.agents/skills/n8n-architect/SKILL.md'), 'utf8');
        expect(agentsContent).not.toContain('<!-- n8n-manager-agent-tools-start -->');
        expect(architectAgent).toContain(`node ${cliEntry} workflow present <workflowId> --json`);
        expect(architectSkill).toContain(`node ${cliEntry} workflow present <workflowId> --json`);
        expect(architectAgent).toContain(`Do not call \`${managerCmd} presentWorkflowResult\``);
        expect(architectSkill).toContain(`Do not call \`${managerCmd} presentWorkflowResult\``);
        expect(fs.existsSync(path.join(workspaceDir, '.github/agents/n8n-manager.agent.md'))).toBe(false);
        expect(fs.existsSync(path.join(workspaceDir, '.agents/skills/n8n-manager/SKILL.md'))).toBe(false);
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
        const updateAiDistPath = path.join(repoRoot, 'packages/cli/dist/commands/update-ai.js');
        const { UpdateAiCommand } = await import(updateAiDistPath) as typeof import('../../src/commands/update-ai.js');
        await UpdateAiCommand.checkAndRefreshIfStale(workspaceDir);

        const refreshed = fs.readFileSync(agentsPath, 'utf8');
        // Stamp must now match the current version
        expect(refreshed).toContain(`<!-- n8nac-version: ${cliVersion} -->`);
        // Content must be a full lightweight AGENTS.md (not just "old content")
        expect(refreshed).toContain('n8n-as-code Context Root');
        expect(refreshed).toContain('env status --json');
        expect(refreshed).not.toContain('workspace migrate --json');
        expect(fs.existsSync(path.join(workspaceDir, '.github/agents/n8n-architect.agent.md'))).toBe(true);
        expect(fs.existsSync(path.join(workspaceDir, '.agents/skills/n8n-architect/SKILL.md'))).toBe(true);
    });

    it('refreshes n8n-workflows.d.ts for all configured environment directories', () => {
        const workspaceDir = createTempDir('n8nac-update-ai-dts-');

        const instanceIdentifier = 'inst_c6c289e49e';
        const workflowsPath = 'workflows/dev';
        const projectName = 'My Project';

        const instanceDir = path.join(workspaceDir, workflowsPath);
        fs.mkdirSync(instanceDir, { recursive: true });

        const dtsPath = path.join(instanceDir, 'n8n-workflows.d.ts');
        fs.writeFileSync(dtsPath, '// stale', 'utf8');

        const config = {
            version: 4,
            activeEnvironmentId: 'dev',
            environmentTargets: [{
                id: 'dev-target',
                name: 'Dev Target',
                kind: 'external-instance',
                url: 'http://localhost:5678',
                instanceIdentifier,
            }],
            environments: [{
                id: 'dev',
                name: 'Dev',
                environmentTargetId: 'dev-target',
                projectId: 'proj-1',
                projectName,
                workflowsPath,
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
