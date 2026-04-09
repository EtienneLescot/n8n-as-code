import { AiContextGenerator } from '../src/services/ai-context-generator.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('AiContextGenerator', () => {
    let tempDir: string;
    let generator: AiContextGenerator;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-ai-test-'));
        generator = new AiContextGenerator();
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    describe('Safe Injection (Markers)', () => {
        test('should create AGENTS.md with markers on fresh install', async () => {
            const version = '1.0.0';
            await generator.generate(tempDir, version);

            const agentsPath = path.join(tempDir, 'AGENTS.md');

            expect(fs.existsSync(agentsPath)).toBe(true);

            const agentsContent = fs.readFileSync(agentsPath, 'utf-8');
            expect(agentsContent).toContain('<!-- n8n-as-code-start -->');
            expect(agentsContent).toContain(`- **n8n Version**: ${version}`);
            expect(agentsContent).toContain('<!-- n8n-as-code-end -->');
        });

        test('should update existing n8n block without duplication', async () => {
            const agentsPath = path.join(tempDir, 'AGENTS.md');

            // First run
            await generator.generate(tempDir, '1.0.0');
            const run1 = fs.readFileSync(agentsPath, 'utf-8');
            expect(run1).toContain('1.0.0');

            // Second run with updated version
            await generator.generate(tempDir, '2.0.0');
            const run2 = fs.readFileSync(agentsPath, 'utf-8');

            expect(run2).toContain('2.0.0');
            expect(run2).not.toContain('1.0.0');

            // Check that markers only appear once
            const startMarkers = run2.match(/<!-- n8n-as-code-start -->/g);
            expect(startMarkers?.length).toBe(1);
        });

        test('should use npx n8nac skills commands (no shims)', async () => {
            await generator.generate(tempDir, '1.0.0');

            const agentsPath = path.join(tempDir, 'AGENTS.md');
            const agentsContent = fs.readFileSync(agentsPath, 'utf-8');

            // New unified command format
            expect(agentsContent).toContain('npx --yes n8nac skills');

            // No old shim-style commands
            expect(agentsContent).not.toContain('./n8nac-skills');
            expect(agentsContent).not.toContain('./n8nac ');
        });

        test('should use npx n8nac@next skills when distTag is next', async () => {
            await generator.generate(tempDir, '1.0.0', 'next');

            const agentsPath = path.join(tempDir, 'AGENTS.md');
            const agentsContent = fs.readFileSync(agentsPath, 'utf-8');

            expect(agentsContent).toContain('npx --yes n8nac@next skills');
            expect(agentsContent).not.toContain('./n8nac-skills');
        });

        test('should allow overriding the generated CLI command for local dev workspaces', async () => {
            const cliCmd = 'node /tmp/n8n-as-code/packages/cli/dist/index.js';
            await generator.generate(tempDir, '1.0.0', undefined, { cliCommandOverride: cliCmd });

            const agentsPath = path.join(tempDir, 'AGENTS.md');
            const agentsContent = fs.readFileSync(agentsPath, 'utf-8');

            expect(agentsContent).toContain(cliCmd);
            expect(agentsContent).toContain(`${cliCmd} skills`);
            expect(agentsContent).not.toContain('npx --yes n8nac skills');
        });

        test('should NOT create shim files (shims removed)', async () => {
            await generator.generate(tempDir, '1.0.0');

            expect(fs.existsSync(path.join(tempDir, 'n8nac-skills'))).toBe(false);
            expect(fs.existsSync(path.join(tempDir, 'n8nac-skills.cmd'))).toBe(false);
            expect(fs.existsSync(path.join(tempDir, 'n8nac'))).toBe(false);
            expect(fs.existsSync(path.join(tempDir, 'n8nac.cmd'))).toBe(false);
        });
    });

    describe('AI Tool Guidance (Integration)', () => {
        test('AGENTS.md should include generic ai_tool connection guidance', async () => {
            await generator.generate(tempDir, '1.0.0');

            const agentsContent = fs.readFileSync(path.join(tempDir, 'AGENTS.md'), 'utf-8');
            expect(agentsContent).toContain('### AI Tool Nodes');
            expect(agentsContent).toContain('ai_tool: [this.Tool.output]');
        });

        test('AGENTS.md should avoid node-specific HTTP tool warnings', async () => {
            await generator.generate(tempDir, '1.0.0');

            const agentsContent = fs.readFileSync(path.join(tempDir, 'AGENTS.md'), 'utf-8');
            expect(agentsContent).not.toContain('@n8n/n8n-nodes-langchain.toolHttpRequest');
            expect(agentsContent).not.toContain('### HTTP Tool for AI Agents');
        });

        test('AGENTS.md should emphasize schema-first tool configuration', async () => {
            await generator.generate(tempDir, '1.0.0');

            const agentsContent = fs.readFileSync(path.join(tempDir, 'AGENTS.md'), 'utf-8');
            expect(agentsContent).toContain('ai_tool');
            expect(agentsContent).toContain('Run `npx --yes n8nac skills node-info <nodeName>` before writing parameters.');
            expect(agentsContent).toContain('Do not assume tool parameter names or reuse stale node-specific guidance.');
        });

        test('getSkillContent() should include generic ai_tool guidance', () => {
            const content = generator.getSkillContent();
            expect(content).toContain('### AI Tool Nodes');
            expect(content).toContain('this.Agent.uses({ ai_tool: [this.Tool.output] })');
        });

        test('getSkillContent() should avoid node-specific HTTP tool warnings', () => {
            const content = generator.getSkillContent();
            expect(content).not.toContain('@n8n/n8n-nodes-langchain.toolHttpRequest');
            expect(content).not.toContain('### HTTP Tool for AI Agents');
        });

        test('getSkillContent() should require schema lookup for tool nodes', () => {
            const content = generator.getSkillContent();
            expect(content).toContain('ai_tool');
            expect(content).toContain('node-info <nodeName>');
        });

        test('AGENTS.md and SKILL.md should share workspace bootstrap guidance', async () => {
            await generator.generate(tempDir, '1.0.0');

            const agentsContent = fs.readFileSync(path.join(tempDir, 'AGENTS.md'), 'utf-8');
            const skillContent = generator.getSkillContent();

            expect(agentsContent).toContain('Look for `n8nac-config.json` in the workspace root.');
            expect(skillContent).toContain('Look for `n8nac-config.json` in the workspace root.');
            expect(agentsContent).toContain('does not yet contain `projectId` and `projectName`');
            expect(skillContent).toContain('does not yet contain `projectId` and `projectName`');
            expect(agentsContent).toContain('Never write `n8nac-config.json` by hand.');
            expect(skillContent).toContain('Never write `n8nac-config.json` by hand.');
            expect(agentsContent).toContain('npx --yes n8nac instance add');
            expect(skillContent).toContain('npx --yes n8nac instance add');
            expect(agentsContent).toContain('npx --yes n8nac instance list --json');
            expect(skillContent).toContain('npx --yes n8nac instance list --json');
            expect(agentsContent).toContain('npx --yes n8nac init-auth');
            expect(skillContent).toContain('npx --yes n8nac init-auth');
            expect(agentsContent).toContain('npx --yes n8nac init-project');
            expect(skillContent).toContain('npx --yes n8nac init-project');
        });

        test('getOpenClawSkillContent() should describe OpenClaw tool usage and AGENTS handoff', () => {
            const content = generator.getOpenClawSkillContent();

            expect(content).toContain('Use this skill only for explicit n8n workflow work.');
            expect(content).toContain('use the `n8nac` tool with `action: "init_auth"` and `action: "init_project"`');
            expect(content).toContain('`action: "instance_list"`');
            expect(content).toContain('`action: "instance_select"`');
            expect(content).toContain('`action: "instance_delete"`');
            expect(content).toContain('Treat `AGENTS.md` as the authoritative workflow-engineering protocol once this skill is active.');
            expect(content).toContain('npx --yes n8nac workflow credential-required <workflowId> --json');
            expect(content).toContain('credential create --type <type> --name "<name>" --file cred.json --json');
            expect(content).toContain('Do not invent unsupported `n8nac` tool actions or CLI flags; use `--help` if you are unsure.');
            expect(content).toContain('npx --yes n8nac execution list --workflow-id <workflowId> --limit 5 --json');
            expect(content).toContain('npx --yes n8nac execution get <executionId> --include-data --json');
            expect(content).toContain('n8nac test --query <json>');
            expect(content).toContain('manual arm step in the n8n editor');
            expect(content).toContain('### AI tool nodes');
        });

        test('AGENTS.md should include runtime-state guidance for webhook test arming', async () => {
            await generator.generate(tempDir, '1.0.0');

            const agentsContent = fs.readFileSync(path.join(tempDir, 'AGENTS.md'), 'utf-8');
            expect(agentsContent).toContain('Runtime-state issue');
            expect(agentsContent).toContain('manual arm step in the n8n editor');
            expect(agentsContent).toContain('There is no documented public n8n API in this project for arming test webhooks');
        });

        test('AGENTS.md should describe workflowDir as relative-or-absolute and push paths accordingly', async () => {
            await generator.generate(tempDir, '1.0.0');

            const agentsContent = fs.readFileSync(path.join(tempDir, 'AGENTS.md'), 'utf-8');
            expect(agentsContent).toContain('In the common case it is workspace-relative, but it can be absolute if `syncFolder` is absolute.');
            expect(agentsContent).toContain('Use either the absolute path from `workflowDir` or the workspace-root-relative path that starts with `workflowDir`');
            expect(agentsContent).toContain('`push` always starts from **the full path of the local workflow file** — either absolute or workspace-root-relative');
        });
    });
});
