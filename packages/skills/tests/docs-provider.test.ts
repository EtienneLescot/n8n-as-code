import { DocsProvider } from '../src/services/docs-provider';
import { describe, it, expect, beforeAll } from '@jest/globals';

describe('DocsProvider', () => {
    let provider: DocsProvider;

    beforeAll(() => {
        provider = new DocsProvider();
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
