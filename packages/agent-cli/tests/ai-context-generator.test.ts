import { AiContextGenerator } from '../src/services/ai-context-generator';
import fs from 'fs';
import path from 'path';
import os from 'os';

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

    test('should generate AGENTS.md with correct version', async () => {
        const version = '1.23.4';
        await generator.generate(tempDir, version);

        const agentsPath = path.join(tempDir, 'AGENTS.md');
        expect(fs.existsSync(agentsPath)).toBe(true);

        const content = fs.readFileSync(agentsPath, 'utf-8');
        expect(content).toContain(`- **n8n Version**: ${version}`);
        expect(content).toContain('npx @n8n-as-code/agent-cli search');
    });

    test('should generate .cursorrules and .clinerules', async () => {
        await generator.generate(tempDir);

        expect(fs.existsSync(path.join(tempDir, '.cursorrules'))).toBe(true);
        expect(fs.existsSync(path.join(tempDir, '.clinerules'))).toBe(true);

        const cursorRules = fs.readFileSync(path.join(tempDir, '.cursorrules'), 'utf-8');
        expect(cursorRules).toContain('AGENTS.md');
    });
});
