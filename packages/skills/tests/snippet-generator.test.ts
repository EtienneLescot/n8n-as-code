import { SnippetGenerator } from '../src/services/snippet-generator';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('SnippetGenerator', () => {
    let tempDir: string;
    let projectDir: string;
    let indexPath: string;

    const mockIndex = {
        nodes: {
            googleSheets: {
                name: 'googleSheets',
                displayName: 'Google Sheets',
                version: [1, 2, 3]
            }
        }
    };

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-snippet-test-'));
        projectDir = path.join(tempDir, 'project');
        fs.mkdirSync(projectDir);
        indexPath = path.join(tempDir, 'n8n-nodes-enriched.json');
        fs.writeFileSync(indexPath, JSON.stringify(mockIndex));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('should generate VS Code snippets from index', async () => {
        const generator = new SnippetGenerator(indexPath);
        await generator.generate(projectDir);

        const snippetPath = path.join(projectDir, '.vscode', 'n8n.code-snippets');
        expect(fs.existsSync(snippetPath)).toBe(true);

        const content = JSON.parse(fs.readFileSync(snippetPath, 'utf-8'));
        expect(content['n8n-googleSheets']).toBeDefined();
        expect(content['n8n-googleSheets'].body.some((l: string) => l.includes('n8n-nodes-base.googleSheets'))).toBe(true);
        expect(content['n8n-googleSheets'].body.some((l: string) => l.includes('"typeVersion": 3'))).toBe(true);
    });

    test('should fallback to hardcoded snippets if index is missing', async () => {
        const originalWarn = console.warn;
        console.warn = () => { };
        const invalidPath = path.join(tempDir, 'missing.json');
        const generator = new SnippetGenerator(invalidPath);
        await generator.generate(projectDir);

        const snippetPath = path.join(projectDir, '.vscode', 'n8n.code-snippets');
        expect(fs.existsSync(snippetPath)).toBe(true);

        const content = JSON.parse(fs.readFileSync(snippetPath, 'utf-8'));
        expect(content['n8n-webhook']).toBeDefined();
        expect(content['n8n-code']).toBeDefined();
        console.warn = originalWarn;
    });
});
