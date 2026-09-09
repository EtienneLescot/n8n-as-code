import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { Command } from 'commander';
import { resolveCustomNodesConfig } from '../src/services/custom-nodes-config';
import { registerSkillsCommands } from '../src/commands/skills-commander';

describe('resolveCustomNodesConfig', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-skills-'));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('resolves customNodesPath from n8nac-config.json', () => {
        const customNodesPath = path.join(tempDir, 'config', 'custom-nodes.json');
        fs.mkdirSync(path.dirname(customNodesPath), { recursive: true });
        fs.writeFileSync(customNodesPath, JSON.stringify({ nodes: {} }));
        fs.writeFileSync(path.join(tempDir, 'n8nac-config.json'), JSON.stringify({
            customNodesPath: './config/custom-nodes.json'
        }));

        const result = resolveCustomNodesConfig(tempDir);

        expect(result.source).toBe('config');
        expect(result.resolvedPath).toBe(customNodesPath);
        expect(result.warnings).toEqual([]);
    });

    test('warns when configured customNodesPath does not exist', () => {
        fs.writeFileSync(path.join(tempDir, 'n8nac-config.json'), JSON.stringify({
            customNodesPath: './missing/custom-nodes.json'
        }));

        const result = resolveCustomNodesConfig(tempDir);

        expect(result.source).toBe('none');
        expect(result.resolvedPath).toBeUndefined();
        expect(result.warnings[0]).toMatch(/Configured customNodesPath was not found/);
    });

    test('falls back to the default sidecar file when configured path is missing', () => {
        const defaultPath = path.join(tempDir, 'n8nac-custom-nodes.json');
        fs.writeFileSync(defaultPath, JSON.stringify({ nodes: {} }));
        fs.writeFileSync(path.join(tempDir, 'n8nac-config.json'), JSON.stringify({
            customNodesPath: './missing/custom-nodes.json'
        }));

        const result = resolveCustomNodesConfig(tempDir);

        expect(result.source).toBe('default');
        expect(result.resolvedPath).toBe(defaultPath);
        expect(result.warnings[0]).toMatch(/Configured customNodesPath was not found/);
    });
});

describe('skills node-info / node-schema batching', () => {
    const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

    async function run(argv: string[]): Promise<{ stdout: string; stderr: string }> {
        const program = new Command();
        program.exitOverride();
        registerSkillsCommands(program, FIXTURES);

        let stdout = '';
        let stderr = '';
        const origLog = console.log;
        const origErr = console.error;
        console.log = (...args: any[]) => { stdout += args.join(' ') + '\n'; };
        console.error = (...args: any[]) => { stderr += args.join(' ') + '\n'; };
        try {
            await program.parseAsync(['node', 'skills', ...argv]);
        } finally {
            console.log = origLog;
            console.error = origErr;
        }
        return { stdout, stderr };
    }

    it('renders every requested node in one compact call', async () => {
        const { stdout } = await run(['node-info', 'gmail', 'httpRequest', '--compact']);

        expect(stdout).toContain('n8n-nodes-base.gmail');
        expect(stdout).toContain('n8n-nodes-base.httpRequest');
        // compact output skips the full interface dump
        expect(stdout).not.toContain('class MyWorkflow');
    });

    it('reports missing nodes but still renders the ones it found', async () => {
        const { stdout, stderr } = await run(['node-schema', 'gmail', 'definitelyNotANode']);

        expect(stdout).toContain('n8n-nodes-base.gmail');
        expect(stderr).toContain("Node 'definitelyNotANode' not found.");
    });

    it('emits a JSON array for several nodes and a bare object for one', async () => {
        const many = await run(['node-schema', 'gmail', 'httpRequest', '--json']);
        expect(Array.isArray(JSON.parse(many.stdout))).toBe(true);

        const one = await run(['node-schema', 'gmail', '--json']);
        expect(JSON.parse(one.stdout)).toMatchObject({ type: 'n8n-nodes-base.gmail' });
    });
});
