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

        test('should NOT create shim files (shims removed)', async () => {
            await generator.generate(tempDir, '1.0.0');

            expect(fs.existsSync(path.join(tempDir, 'n8nac-skills'))).toBe(false);
            expect(fs.existsSync(path.join(tempDir, 'n8nac-skills.cmd'))).toBe(false);
            expect(fs.existsSync(path.join(tempDir, 'n8nac'))).toBe(false);
            expect(fs.existsSync(path.join(tempDir, 'n8nac.cmd'))).toBe(false);
        });
    });});