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
        test('should create new files with markers on fresh install', async () => {
            const version = '1.0.0';
            await generator.generate(tempDir, version);

            const agentsPath = path.join(tempDir, 'AGENTS.md');
            const cursorPath = path.join(tempDir, '.cursorrules');

            expect(fs.existsSync(agentsPath)).toBe(true);
            expect(fs.existsSync(cursorPath)).toBe(true);

            const agentsContent = fs.readFileSync(agentsPath, 'utf-8');
            expect(agentsContent).toContain('<!-- n8n-as-code-start -->');
            expect(agentsContent).toContain(`- **n8n Version**: ${version}`);
            expect(agentsContent).toContain('<!-- n8n-as-code-end -->');

            const cursorContent = fs.readFileSync(cursorPath, 'utf-8');
            expect(cursorContent).toContain('### 🤖 n8n-as-code-start');
            expect(cursorContent).toContain('### 🤖 n8n-as-code-end');
        });

        test('should preserve existing user content and append n8n block', async () => {
            const cursorPath = path.join(tempDir, '.cursorrules');
            const existingContent = '# User specific rules\n- Do not touch this.\n';
            fs.writeFileSync(cursorPath, existingContent);

            await generator.generate(tempDir, '1.0.0');

            const content = fs.readFileSync(cursorPath, 'utf-8');
            expect(content).toContain(existingContent.trim());
            expect(content).toContain('### 🤖 n8n-as-code-start');
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

    describe('Tool Expansion', () => {
        test('should generate all supported rule files', async () => {
            await generator.generate(tempDir);

            const expectedFiles = [
                '.cursorrules',
                '.clinerules',
                '.windsurfrules',
                '.ai-rules.md'
            ];

            for (const file of expectedFiles) {
                expect(fs.existsSync(path.join(tempDir, file))).toBe(true);
            }
        });

        test('should inject custom role description in specialized files', async () => {
            await generator.generate(tempDir);

            const clineContent = fs.readFileSync(path.join(tempDir, '.clinerules'), 'utf-8');
            expect(clineContent).toContain('n8n_engineer_role:');

            const windsurfContent = fs.readFileSync(path.join(tempDir, '.windsurfrules'), 'utf-8');
            expect(windsurfContent).toContain('### n8n Development Rules');
        });
    });
    describe('Shim Generation', () => {
        test('should generate robust shim checking for local node_modules', async () => {
            await generator.generate(tempDir);

            const shimPath = path.join(tempDir, 'n8n-agent');
            expect(fs.existsSync(shimPath)).toBe(true);

            const content = fs.readFileSync(shimPath, 'utf-8');

            // Should contain standard NPM path check
            expect(content).toContain('CLI_PATH="./node_modules/@n8n-as-code/agent-cli/dist/cli.js"');
            expect(content).toContain('if [ -f "$CLI_PATH" ]; then');

            // Should NOT contain absolute build paths
            expect(content).not.toContain(path.resolve(__dirname, '../src/services'));
        });

        test('should prioritize extension path if provided', async () => {
            const mockExtPath = '/mock/extension/path';
            await generator.generate(tempDir, '1.0.0', mockExtPath);

            const shimPath = path.join(tempDir, 'n8n-agent');
            const content = fs.readFileSync(shimPath, 'utf-8');

            // Should contain explicit extension path check with new subpath
            expect(content).toContain(`if [ -f "${mockExtPath}/out/agent-cli/cli.js" ]; then`);
        });
    });
});
