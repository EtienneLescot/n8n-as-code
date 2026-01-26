import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const _filename = typeof __filename !== 'undefined'
    ? __filename
    : (typeof import.meta !== 'undefined' && typeof import.meta.url === 'string' ? fileURLToPath(import.meta.url) : '');

const _dirname = typeof __dirname !== 'undefined'
    ? __dirname
    : (_filename ? path.dirname(_filename) : '');

export interface DocPage {
    id: string;
    title: string;
    url: string;
    urlPath: string;
    category: string;
    subcategory: string | null;
    nodeName: string | null;
    nodeType: string | null;
    content: {
        markdown: string;
        excerpt: string;
        sections: Array<{
            title: string;
            level: number;
            content: string;
        }>;
    };
    metadata: {
        keywords: string[];
        useCases: string[];
        operations: string[];
        codeExamples: number;
        complexity: string;
        readingTime: string;
        contentLength: number;
        relatedPages?: Array<{
            id: string;
            title: string;
            category: string;
        }>;
    };
}

export interface DocsComplete {
    generatedAt: string;
    version: string;
    sourceUrl: string;
    totalPages: number;
    statistics: {
        byCategory: Record<string, number>;
        withNodeNames: number;
        withUseCases: number;
        withCodeExamples: number;
    };
    categories: Record<string, {
        description: string;
        totalPages: number;
        pages: string[];
    }>;
    pages: DocPage[];
    searchIndex: {
        byKeyword: Record<string, string[]>;
        byCategory: Record<string, string[]>;
        byNodeName: Record<string, string[]>;
    };
}

export interface SearchDocsOptions {
    category?: string;
    complexity?: 'beginner' | 'intermediate' | 'advanced';
    hasCodeExamples?: boolean;
    limit?: number;
    filter?: (page: DocPage) => boolean;
}

/**
 * Provider for accessing n8n documentation
 */
export class DocsProvider {
    private docs: DocsComplete | null = null;
    private docsPath: string;

    constructor(customDocsPath?: string) {
        const envAssetsDir = process.env.N8N_AS_CODE_ASSETS_DIR;
        if (customDocsPath) {
            this.docsPath = customDocsPath;
        } else if (envAssetsDir && fs.existsSync(path.join(envAssetsDir, 'n8n-docs-complete.json'))) {
            this.docsPath = path.join(envAssetsDir, 'n8n-docs-complete.json');
        } else {
            // Check sibling first
            const siblingPath = path.resolve(_dirname, '../assets/n8n-docs-complete.json');
            if (fs.existsSync(siblingPath)) {
                this.docsPath = siblingPath;
            } else {
                // VS Code Extension fallback
                this.docsPath = path.resolve(_dirname, '../../assets/n8n-docs-complete.json');
            }
        }
    }

    /**
     * Load documentation
     */
    private loadDocs(): void {
        if (this.docs) return;

        if (!fs.existsSync(this.docsPath)) {
            throw new Error(
                `Documentation not found at ${this.docsPath}. ` +
                `Please run the build process: npm run build in packages/agent-cli`
            );
        }

        try {
            const content = fs.readFileSync(this.docsPath, 'utf-8');
            this.docs = JSON.parse(content);
        } catch (error: any) {
            throw new Error(
                `Failed to load documentation: ${error.message}. ` +
                `The file may be corrupted. Try rebuilding: npm run build in packages/agent-cli`
            );
        }
    }

    /**
     * Search documentation pages
     */
    searchDocs(query: string, options: SearchDocsOptions = {}): DocPage[] {
        this.loadDocs();
        if (!this.docs) return [];

        const queryLower = query.toLowerCase();
        // Normalization for accented characters (e.g. "génération" -> "generation")
        const queryClean = queryLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const queryTerms = queryClean.split(/\s+/).filter(t => t.length > 2);

        const results: Array<{ page: DocPage; score: number }> = [];

        for (const page of this.docs.pages) {
            // Apply filters
            if (options.category && page.category !== options.category) continue;
            if (options.complexity && page.metadata.complexity !== options.complexity) continue;
            if (options.hasCodeExamples && page.metadata.codeExamples === 0) continue;
            if (options.filter && !options.filter(page)) continue;

            const docTitleClean = page.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const docContentClean = page.content.markdown.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const docKeywordsClean = page.metadata.keywords.join(' ').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            // Calculate score
            let score = 0;

            // 1. Exact title match
            if (docTitleClean === queryClean) {
                score += 100;
            }

            // 2. All terms in title
            if (queryTerms.length > 0 && queryTerms.every(t => docTitleClean.includes(t))) {
                score += 50;
            }

            // 3. Terms match count in title
            const termsInTitle = queryTerms.filter(t => docTitleClean.includes(t)).length;
            score += termsInTitle * 10;

            // 4. Terms match in keywords/metadata
            const termsInKeywords = queryTerms.filter(t => docKeywordsClean.includes(t)).length;
            score += termsInKeywords * 5;

            // 5. Terms match in content
            if (queryTerms.length > 0 && queryTerms.some(t => docContentClean.includes(t))) {
                const termsInContent = queryTerms.filter(t => docContentClean.includes(t)).length;
                score += termsInContent * 2;
            }

            if (score > 0) {
                results.push({ page, score });
            }
        }

        // Sort by score
        results.sort((a, b) => b.score - a.score);

        const limit = options.limit || 10;
        return results.slice(0, limit).map(r => r.page);
    }

    /**
     * Get documentation page by ID
     */
    getDocPage(pageId: string): DocPage | null {
        this.loadDocs();
        if (!this.docs) return null;

        return this.docs.pages.find(p => p.id === pageId) || null;
    }

    /**
     * Get documentation page by title
     */
    getDocPageByTitle(title: string): DocPage | null {
        this.loadDocs();
        if (!this.docs) return null;

        const titleLower = title.toLowerCase();
        return this.docs.pages.find(p =>
            p.title.toLowerCase() === titleLower
        ) || null;
    }

    /**
     * List pages by category
     */
    listByCategory(category: string): DocPage[] {
        this.loadDocs();
        if (!this.docs) return [];

        return this.docs.pages.filter(p => p.category === category);
    }

    /**
     * Get all categories
     */
    getCategories(): Array<{ name: string; description: string; count: number }> {
        this.loadDocs();
        if (!this.docs) return [];

        return Object.entries(this.docs.categories).map(([name, data]) => ({
            name,
            description: data.description,
            count: data.totalPages
        }));
    }

    /**
     * Find related pages
     */
    findRelated(pageId: string, limit: number = 5): DocPage[] {
        this.loadDocs();
        if (!this.docs) return [];

        const page = this.getDocPage(pageId);
        if (!page || !page.metadata.relatedPages) return [];

        const related: DocPage[] = [];
        for (const relatedRef of page.metadata.relatedPages) {
            const relatedPage = this.getDocPage(relatedRef.id);
            if (relatedPage) {
                related.push(relatedPage);
            }
            if (related.length >= limit) break;
        }

        return related;
    }

    /**
     * Search by keywords
     */
    searchByKeywords(keywords: string[]): DocPage[] {
        this.loadDocs();
        if (!this.docs) return [];

        const results: Map<string, number> = new Map();

        for (const keyword of keywords) {
            const keywordLower = keyword.toLowerCase();

            for (const page of this.docs.pages) {
                if (page.metadata.keywords.some(k => k.toLowerCase() === keywordLower)) {
                    const current = results.get(page.id) || 0;
                    results.set(page.id, current + 1);
                }
            }
        }

        // Sort by match count
        const sorted = Array.from(results.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([pageId]) => this.getDocPage(pageId))
            .filter((p): p is DocPage => p !== null);

        return sorted;
    }

    /**
     * Get documentation for a specific node
     */
    getNodeDocumentation(nodeName: string): DocPage[] {
        this.loadDocs();
        if (!this.docs) return [];

        return this.docs.pages.filter(p =>
            p.nodeName?.toLowerCase() === nodeName.toLowerCase()
        );
    }

    /**
     * Get guides (tutorials/advanced-ai/workflows pages)
     */
    getGuides(query?: string, limit: number = 10): DocPage[] {
        this.loadDocs();

        // If no query, return unfiltered list (limited)
        if (!query) {
            if (!this.docs) return [];
            return this.docs.pages.filter(p =>
                ['tutorials', 'advanced-ai', 'workflows'].includes(p.category) ||
                p.subcategory === 'examples'
            ).slice(0, limit);
        }

        // Use fuzzy search with category filter
        return this.searchDocs(query, {
            limit,
            filter: (page) =>
                ['tutorials', 'advanced-ai', 'workflows'].includes(page.category) ||
                page.subcategory === 'examples'
        });
    }

    /**
     * Get statistics
     */
    getStatistics() {
        this.loadDocs();
        if (!this.docs) return null;

        return {
            totalPages: this.docs.totalPages,
            byCategory: this.docs.statistics.byCategory,
            withNodeNames: this.docs.statistics.withNodeNames,
            withUseCases: this.docs.statistics.withUseCases,
            withCodeExamples: this.docs.statistics.withCodeExamples
        };
    }
}
