import { KnowledgeSearch } from '../src/services/knowledge-search';
import { describe, it, expect, beforeAll } from '@jest/globals';

describe('KnowledgeSearch', () => {
    let search: KnowledgeSearch;

    beforeAll(() => {
        search = new KnowledgeSearch();
    });

    it('should perform unified search', () => {
        const results = search.searchAll('google sheets');
        expect(results).toHaveProperty('query');
        expect(results).toHaveProperty('results');
        expect(results).toHaveProperty('hints');
        expect(Array.isArray(results.results)).toBe(true);
        expect(results.results.length).toBeGreaterThan(0);
    });

    it('should filter by type', () => {
        const results = search.searchAll('database', { type: 'node' });
        expect(results.results.every(r => r.type === 'node')).toBe(true);
    });

    it('should include hints', () => {
        const results = search.searchAll('http');
        expect(Array.isArray(results.hints)).toBe(true);
    });

    it('should handle empty results gracefully', () => {
        const results = search.searchAll('NONEXISTENTSTRING123456789XYZ');
        expect(results.totalResults).toBeLessThan(20);
        expect(results.results.length).toBeLessThan(20);
    });
});
