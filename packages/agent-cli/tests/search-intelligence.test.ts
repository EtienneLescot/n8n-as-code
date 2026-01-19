
import { KnowledgeSearch } from '../src/services/knowledge-search';
import { NodeSchemaProvider } from '../src/services/node-schema-provider';
import { describe, it, expect, beforeAll } from '@jest/globals';

describe('Search Intelligence Integration', () => {
    let search: KnowledgeSearch;

    beforeAll(() => {
        search = new KnowledgeSearch();
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
