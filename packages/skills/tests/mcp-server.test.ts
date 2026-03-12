import fs from 'fs';
import os from 'os';
import path from 'path';
import { SkillsMcpService } from '../src/services/mcp-service';

describe('SkillsMcpService', () => {
    let tempDir: string;
    let originalProjectDir: string | undefined;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-mcp-'));
        const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures');

        fs.copyFileSync(path.join(fixturesDir, 'n8n-nodes-technical.json'), path.join(tempDir, 'n8n-nodes-technical.json'));
        fs.copyFileSync(path.join(fixturesDir, 'n8n-docs-complete.json'), path.join(tempDir, 'n8n-docs-complete.json'));
        fs.copyFileSync(path.join(fixturesDir, 'n8n-knowledge-index.json'), path.join(tempDir, 'n8n-knowledge-index.json'));
        fs.writeFileSync(path.join(tempDir, 'workflows-index.json'), JSON.stringify({
            generatedAt: new Date().toISOString(),
            repository: 'https://example.test/workflows',
            totalWorkflows: 1,
            workflows: [
                {
                    id: 916,
                    slug: 'slack-alert-workflow',
                    name: 'Slack Alert Workflow',
                    tags: ['slack', 'alerts'],
                    author: 'Example Author',
                    createdAt: '2026-03-07T00:00:00.000Z',
                    description: 'Send a Slack alert when something important happens.',
                    hasWorkflow: true,
                    workflowFile: 'workflow.json',
                },
            ],
        }, null, 2));

        originalProjectDir = process.env.N8N_AS_CODE_PROJECT_DIR;
        delete process.env.N8N_AS_CODE_PROJECT_DIR;
    });

    afterEach(() => {
        if (originalProjectDir === undefined) {
            delete process.env.N8N_AS_CODE_PROJECT_DIR;
        } else {
            process.env.N8N_AS_CODE_PROJECT_DIR = originalProjectDir;
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('searches the local knowledge base', () => {
        const service = new SkillsMcpService({ assetsDir: tempDir });

        const results = service.searchKnowledge('google', { limit: 5 });

        expect(results.results.length).toBeGreaterThan(0);
        expect(results.results.some((result: any) => result.id === 'googleGemini')).toBe(true);
    });

    test('returns node info for bundled nodes', () => {
        const service = new SkillsMcpService({ assetsDir: tempDir });

        const node = service.getNodeInfo('httpRequest');

        expect(node.name).toBe('httpRequest');
        expect(node.type).toBe('n8n-nodes-base.httpRequest');
    });

    test('searches bundled workflow examples', () => {
        const service = new SkillsMcpService({ assetsDir: tempDir });

        const examples = service.searchExamples('slack', 5);

        expect(examples).toHaveLength(1);
        expect(examples[0].id).toBe(916);
    });

    test('validates workflow content passed as JSON text', async () => {
        const service = new SkillsMcpService({ assetsDir: tempDir });

        const result = await service.validateWorkflow({
            workflowContent: JSON.stringify({
                nodes: [
                    {
                        id: '1',
                        name: 'Start',
                        type: 'n8n-nodes-base.start',
                        typeVersion: 1,
                        position: [100, 100],
                        parameters: {},
                    },
                ],
                connections: {},
            }),
            format: 'json',
        });

        expect(result.valid).toBe(true);
    });
});
