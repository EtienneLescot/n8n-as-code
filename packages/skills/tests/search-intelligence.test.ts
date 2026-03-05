import path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeSearch } from '../src/services/knowledge-search';
import { NodeSchemaProvider } from '../src/services/node-schema-provider';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

describe('Search Intelligence Integration', () => {
    let search: KnowledgeSearch;

    beforeAll(() => {
        const indexPath = path.resolve(_dirname, 'fixtures/n8n-nodes-technical.json');
        // Inject mock path into NodeSchemaProvider used by KnowledgeSearch
        // Note: KnowledgeSearch uses NodeSchemaProvider internally, but we can't easily inject it constructor-wise
        // We will mock the process.env to force the provider to pick up our file or use a specific test instance

        // Actually KnowledgeSearch constructor doesn't take path, but it instantiates NodeSchemaProvider.
        // We need to patch KnowledgeSearch or update it to accept a provider/path.
        // Checking KnowledgeSearch code... it doesn't seem to accept arguments.
        // However, NodeSchemaProvider respects process.env.N8N_AS_CODE_ASSETS_DIR.
        // We can cheat by setting a custom property or subclassing.

        // Better approach: Update KnowledgeSearch to allow passing a schema provider or path for testing.
        // For now, let's try to set N8N_AS_CODE_ASSETS_DIR to the directory containing our fixture, 
        // BUT the fixture filename is 'n8n-nodes-technical.json' which matches the expected name.

        process.env.N8N_AS_CODE_ASSETS_DIR = path.resolve(_dirname, 'fixtures');
        search = new KnowledgeSearch();
    });

    afterAll(() => {
        delete process.env.N8N_AS_CODE_ASSETS_DIR;
    });

    it('should find Google Gemini for "image generation"', () => {
        const results = search.searchAll('image generation');
        const geminiNode = results.results.find(r => r.name === 'googleGemini');

        expect(geminiNode).toBeDefined();
        // Should be in top 5 results (prioritized by keywords)
        const geminiRank = results.results.findIndex(r => r.name === 'googleGemini');
        expect(geminiRank).toBeLessThan(5);
    });

    it('should find Google Gemini for "video generation"', () => {
        const results = search.searchAll('video generation');
        const geminiNode = results.results.find(r => r.name === 'googleGemini');
        expect(geminiNode).toBeDefined();
    });

    it('should find nodes by action description (e.g. "send message" -> Gmail)', () => {
        const results = search.searchAll('send message');
        // Gmail or similar nodes should appear
        const gmailNode = results.results.find(r => r.name === 'gmail' || r.displayName?.toLowerCase().includes('mail'));
        expect(gmailNode).toBeDefined();
    });

    it('should have enriched keywords for Google Gemini', () => {
        // Direct check of the node's metadata to ensure enrichment actions happened
        const nodeProvider = new NodeSchemaProvider();
        const results = nodeProvider.getNodeSchema('googleGemini');
        expect(results).toBeDefined();
        // @ts-ignore - accessing internal metadata not always in public schema type
        const keywords = results?.metadata?.keywords || [];

        expect(keywords).toContain('generate');
        expect(keywords).toContain('image');
    });

    // ── httpRequestTool tests ──────────────────────────────────────────────────

    it('httpRequestTool schema should be present in the index', () => {
        const provider = new NodeSchemaProvider();
        const schema = provider.getNodeSchema('httpRequestTool');
        expect(schema).toBeDefined();
        expect(schema.type).toBe('n8n-nodes-base.httpRequestTool');
        expect(schema.displayName).toBe('HTTP Request Tool');
    });

    it('searching for "http request tool" should return httpRequestTool', () => {
        const provider = new NodeSchemaProvider();
        const results = provider.searchNodes('http request tool', 5);
        expect(results.length).toBeGreaterThan(0);
        // httpRequestTool must appear in results
        const tool = results.find(r => r.name === 'httpRequestTool');
        expect(tool).toBeDefined();
    });

    it('httpRequestTool should rank above toolHttpRequest for "http request tool" query', () => {
        const provider = new NodeSchemaProvider();
        const results = provider.searchNodes('http request tool', 10);
        const baseToolIndex = results.findIndex(r => r.name === 'httpRequestTool');
        const langchainToolIndex = results.findIndex(r => r.name === 'toolHttpRequest');
        expect(baseToolIndex).toBeGreaterThanOrEqual(0);
        // httpRequestTool must rank at least as high as the langchain variant
        if (langchainToolIndex >= 0) {
            expect(baseToolIndex).toBeLessThanOrEqual(langchainToolIndex);
        }
    });

    it('searching for "ai tool http" should return httpRequestTool', () => {
        const provider = new NodeSchemaProvider();
        const results = provider.searchNodes('ai tool http', 10);
        const tool = results.find(r => r.name === 'httpRequestTool');
        expect(tool).toBeDefined();
    });

    it('httpRequestTool schema should have the url property', () => {
        const provider = new NodeSchemaProvider();
        const schema = provider.getNodeSchema('httpRequestTool');
        const props: any[] = schema?.schema?.properties ?? [];
        const urlProp = props.find((p: any) => p.name === 'url');
        expect(urlProp).toBeDefined();
        expect(urlProp.required).toBe(true);
    });
});
