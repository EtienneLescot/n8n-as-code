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
});
