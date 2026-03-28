import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';
import { SkillsMcpService } from '../src/services/mcp-service';

describe('SkillsMcpService', () => {
    let tempDir: string;
    let service: SkillsMcpService;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-mcp-'));
        service = new SkillsMcpService({ assetsDir: tempDir });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('searches the local knowledge base via CLI', async () => {
        const mockResults = {
            query: 'google',
            totalResults: 1,
            results: [{ id: 'googleGemini', type: 'node' }],
        };
        const cliSpy = jest.spyOn(service as any, 'runCliJsonCommand').mockResolvedValue(mockResults);

        const results = await service.searchKnowledge('google', { limit: 5 });

        expect(cliSpy).toHaveBeenCalledWith(['skills', 'search', 'google', '--json', '--limit', '5']);
        expect(results).toEqual(mockResults);
    });

    test('returns node info for bundled nodes via CLI', async () => {
        const mockNode = {
            name: 'httpRequest',
            type: 'n8n-nodes-base.httpRequest',
        };
        const cliSpy = jest.spyOn(service as any, 'runCliJsonCommand').mockResolvedValue(mockNode);

        const node = await service.getNodeInfo('httpRequest');

        expect(cliSpy).toHaveBeenCalledWith(['skills', 'node-info', 'httpRequest', '--json']);
        expect(node.name).toBe('httpRequest');
        expect(node.type).toBe('n8n-nodes-base.httpRequest');
    });

    test('searches bundled workflow examples via CLI', async () => {
        const mockExamples = [
            {
                id: 916,
                name: 'Slack Alert Workflow',
            },
        ];
        const cliSpy = jest.spyOn(service as any, 'runCliJsonCommand').mockResolvedValue(mockExamples);

        const examples = await service.searchExamples('slack', 5);

        expect(cliSpy).toHaveBeenCalledWith(['skills', 'examples', 'search', 'slack', '--json', '--limit', '5']);
        expect(examples).toHaveLength(1);
        expect(examples[0].id).toBe(916);
    });

    test('searches docs via canonical skills search CLI and returns results array', async () => {
        const mockSearchResponse = {
            query: 'webhook',
            results: [
                {
                    id: 'page-1',
                    type: 'documentation',
                    title: 'Webhook docs',
                },
            ],
        };
        const cliSpy = jest.spyOn(service as any, 'runCliJsonCommand').mockResolvedValue(mockSearchResponse);

        const docs = await service.searchDocs('webhook', { category: 'hosting', limit: 3 });

        expect(cliSpy).toHaveBeenCalledWith([
            'skills',
            'search',
            'webhook',
            '--json',
            '--category',
            'hosting',
            '--type',
            'documentation',
            '--limit',
            '3',
        ]);
        expect(docs).toEqual(mockSearchResponse.results);
    });

    test('returns workflow example info via CLI', async () => {
        const mockExample = {
            id: 916,
            name: 'Slack Alert Workflow',
            rawUrl: 'https://example.test/workflow.json',
        };
        const cliSpy = jest.spyOn(service as any, 'runCliJsonCommand').mockResolvedValue(mockExample);

        const example = await service.getExampleInfo('916');

        expect(cliSpy).toHaveBeenCalledWith(['skills', 'examples', 'info', '916', '--json']);
        expect(example).toEqual(mockExample);
    });

    test('validates workflow content passed as JSON text via CLI', async () => {
        const mockValidationResult = {
            valid: true,
            errors: [],
            warnings: [],
        };
        const cliSpy = jest.spyOn(service as any, 'runCliJsonCommand').mockImplementation(async (args: string[]) => {
            expect(args[0]).toBe('skills');
            expect(args[1]).toBe('validate');
            expect(args[3]).toBe('--json');

            const tempFile = args[2];
            const written = fs.readFileSync(tempFile, 'utf8');
            expect(JSON.parse(written)).toEqual({
                nodes: [
                    {
                        id: '1',
                        name: 'Webhook',
                        type: 'n8n-nodes-base.webhook',
                        typeVersion: 2.1,
                        position: [100, 100],
                        parameters: {},
                    },
                ],
                connections: {},
            });

            return mockValidationResult;
        });

        const result = await service.validateWorkflow({
            workflowContent: JSON.stringify({
                nodes: [
                    {
                        id: '1',
                        name: 'Webhook',
                        type: 'n8n-nodes-base.webhook',
                        typeVersion: 2.1,
                        position: [100, 100],
                        parameters: {},
                    },
                ],
                connections: {},
            }),
            format: 'json',
        });

        expect(cliSpy).toHaveBeenCalledTimes(1);
        expect(result.valid).toBe(true);
    });
});
