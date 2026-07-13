import { DocsProvider } from '../src/services/docs-provider';
import { describe, it, expect, beforeAll } from '@jest/globals';
import fs from 'fs';
import { jest } from '@jest/globals';

describe('DocsProvider', () => {
    let provider: DocsProvider;
    const docsPath = '/tmp/mock-n8n-docs-complete.json';

    const mockDocs = {
        generatedAt: '2026-01-01T00:00:00.000Z',
        version: '1.0.0',
        sourceUrl: 'https://docs.n8n.io/llms.txt',
        totalPages: 3,
        statistics: {
            byCategory: {
                workflows: 1,
                tutorials: 1,
                integrations: 1
            },
            withNodeNames: 1,
            withUseCases: 2,
            withCodeExamples: 1
        },
        categories: {
            workflows: {
                description: 'Workflow examples',
                totalPages: 1,
                pages: ['doc-1']
            },
            tutorials: {
                description: 'Step-by-step tutorials',
                totalPages: 1,
                pages: ['doc-2']
            },
            integrations: {
                description: 'Integrations docs',
                totalPages: 1,
                pages: ['doc-3']
            }
        },
        pages: [
            {
                id: 'doc-1',
                title: 'Webhook workflow example',
                url: 'https://docs.n8n.io/workflows/webhook/',
                urlPath: 'workflows/webhook/',
                category: 'workflows',
                subcategory: 'examples',
                nodeName: null,
                nodeType: null,
                content: {
                    markdown: 'Build a webhook workflow using n8n and trigger nodes.',
                    excerpt: 'Webhook workflow guide',
                    sections: []
                },
                metadata: {
                    keywords: ['webhook', 'workflow'],
                    useCases: ['Process inbound events'],
                    operations: [],
                    codeExamples: 1,
                    complexity: 'beginner',
                    readingTime: '2 min',
                    contentLength: 200
                }
            },
            {
                id: 'doc-2',
                title: 'Google Sheets tutorial',
                url: 'https://docs.n8n.io/tutorials/google-sheets/',
                urlPath: 'tutorials/google-sheets/',
                category: 'tutorials',
                subcategory: null,
                nodeName: 'googleSheets',
                nodeType: 'n8n-nodes-base.googleSheets',
                content: {
                    markdown: 'Learn how to automate Google Sheets in n8n.',
                    excerpt: 'Google Sheets automation',
                    sections: []
                },
                metadata: {
                    keywords: ['google', 'sheets'],
                    useCases: ['Spreadsheet automation'],
                    operations: [],
                    codeExamples: 0,
                    complexity: 'beginner',
                    readingTime: '3 min',
                    contentLength: 220
                }
            },
            {
                id: 'doc-3',
                title: 'Slack node reference',
                url: 'https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.slack/',
                urlPath: 'integrations/builtin/app-nodes/n8n-nodes-base.slack/',
                category: 'integrations',
                subcategory: 'app-nodes',
                nodeName: 'slack',
                nodeType: 'n8n-nodes-base.slack',
                content: {
                    markdown: 'Slack integration reference for messaging operations.',
                    excerpt: 'Slack integration',
                    sections: []
                },
                metadata: {
                    keywords: ['slack', 'messaging'],
                    useCases: ['Team notifications'],
                    operations: [],
                    codeExamples: 0,
                    complexity: 'intermediate',
                    readingTime: '4 min',
                    contentLength: 240
                }
            }
        ],
        searchIndex: {
            byKeyword: {},
            byCategory: {},
            byNodeName: {}
        }
    };

    beforeAll(() => {
        jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => String(filePath) === docsPath);
        jest.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
            if (String(filePath) === docsPath) {
                return JSON.stringify(mockDocs);
            }
            throw new Error(`Unexpected file read: ${String(filePath)}`);
        });
        provider = new DocsProvider(docsPath);
    });

    it('should search documentation', () => {
        const results = provider.searchDocs('google sheets', { limit: 5 });
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0]).toHaveProperty('title');
        expect(results[0]).toHaveProperty('url');

        // Validation that results are relevant
        const relevant = results.some(r =>
            r.title.toLowerCase().includes('google') ||
            r.content.markdown.toLowerCase().includes('google')
        );
        expect(relevant).toBe(true);
    });

    it('should get categories', () => {
        const categories = provider.getCategories();
        expect(Array.isArray(categories)).toBe(true);
        expect(categories.length).toBeGreaterThan(0);
        expect(categories[0]).toHaveProperty('name');
        expect(categories[0]).toHaveProperty('description');

        const nodesCategory = categories.find(c => c.name === 'nodes');
        expect(nodesCategory).toBeDefined();
    });

    it('should get guides with fuzzy search', () => {
        const results = provider.getGuides('webhook', 5);
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThan(0);

        // Verify we get results from the expected sections on docs.n8n.io
        const allowedCategories = ['build', 'nodes'];
        const allValid = results.every(r =>
            allowedCategories.includes(r.category) || r.subcategory === 'examples'
        );
        expect(allValid).toBe(true);
    });

    it('should get statistics', () => {
        const stats = provider.getStatistics();
        expect(stats).toHaveProperty('totalPages');
        expect(stats).toHaveProperty('byCategory');
    });
});
