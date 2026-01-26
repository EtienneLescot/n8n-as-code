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
    });

    describe('Shim Generation', () => {
        test('should generate robust shim checking for local node_modules', async () => {
            await generator.generate(tempDir);

            const shimPath = path.join(tempDir, 'n8nac-skills');
            expect(fs.existsSync(shimPath)).toBe(true);

            const content = fs.readFileSync(shimPath, 'utf-8');

            // Should contain standard NPM path check
            expect(content).toContain('CLI_PATH="./node_modules/@n8n-as-code/skills/dist/cli.js"');
            expect(content).toContain('if [ -f "$CLI_PATH" ]; then');

            // Should NOT contain absolute build paths
            expect(content).not.toContain(path.resolve(__dirname, '../src/services'));
        });

        test('should prioritize extension path if provided', async () => {
            const mockExtPath = '/mock/extension/path';
            await generator.generate(tempDir, '1.0.0', mockExtPath);

            const shimPath = path.join(tempDir, 'n8nac-skills');
            const content = fs.readFileSync(shimPath, 'utf-8');

            // Should contain explicit extension path check with new subpath
            expect(content).toContain(`if [ -f "${mockExtPath}/out/skills/cli.js" ]; then`);
        });
    });
});
