import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FlexSearch from 'flexsearch';
import { DocsProvider } from './docs-provider.js';
import { NodeSchemaProvider } from './node-schema-provider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface UnifiedSearchResult {
    query: string;
    totalResults: number;
    results: Array<{
        type: 'node' | 'documentation' | 'example';
        id: string;
        name?: string;
        title?: string;
        displayName?: string;
        description?: string;
        url?: string;
        excerpt?: string;
        score: number;
        category: string;
        relevance: 'exact_match' | 'related' | 'partial';
    }>;
    suggestions: string[];
    hints: string[];
}

interface KnowledgeIndex {
    flexIndex: Record<string, any>;
    entries: {
        documentation: any[];
        nodes: any[];
    };
    indexes: {
        quickLookup: any;
    };
}

/**
 * Unified search across nodes and documentation
 */
export class KnowledgeSearch {
    private index: KnowledgeIndex | null = null;
    private flexIndex: any = null;
    private indexPath: string;
    private docsProvider: DocsProvider;
    private nodeProvider: NodeSchemaProvider;

    constructor(customIndexPath?: string) {
        if (customIndexPath) {
            this.indexPath = customIndexPath;
        } else {
            this.indexPath = path.resolve(__dirname, '../assets/n8n-knowledge-index.json');
        }
        this.docsProvider = new DocsProvider();
        this.nodeProvider = new NodeSchemaProvider();
    }

    private loadIndex(): void {
        if (this.index) return;

        if (!fs.existsSync(this.indexPath)) {
            throw new Error(`Knowledge index not found at ${this.indexPath}. Please run build first.`);
        }

        const content = fs.readFileSync(this.indexPath, 'utf-8');
        this.index = JSON.parse(content);

        // Initialize FlexSearch and import data
        // @ts-ignore
        this.flexIndex = new FlexSearch.Document({
            document: {
                id: "uid",
                index: ["keywords", "title", "content"], // Prioritize keywords!
                store: ["id", "type", "title", "displayName", "name", "category", "excerpt"]
            },
            tokenize: "forward",
            context: true
        });

        if (this.index && this.index.flexIndex) {
            for (const key in this.index.flexIndex) {
                this.flexIndex.import(key, this.index.flexIndex[key]);
            }
        }
    }

    /**
     * Unified search across all resources using FlexSearch
     */
    searchAll(query: string, options: { category?: string; type?: 'node' | 'documentation'; limit?: number } = {}): UnifiedSearchResult {
        this.loadIndex();
        if (!this.index || !this.flexIndex) {
            return { query, totalResults: 0, results: [], suggestions: [], hints: [] };
        }

        const results: UnifiedSearchResult['results'] = [];

        // Normalize query for search (remove accents)
        const queryClean = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

        // Perform multi-field search
        const flexResults = this.flexIndex.search(queryClean, {
            limit: options.limit || 20,
            enrich: true,
            suggest: true
        });

        // FlexSearch returns results grouped by field
        const seenIds = new Set<string>();

        for (const fieldResult of flexResults) {
            for (const item of fieldResult.result) {
                const doc = item.doc;
                const uniqueId = `${doc.type}:${doc.id}`;

                if (seenIds.has(uniqueId)) continue;
                if (options.type && doc.type !== options.type) continue;
                if (options.category && doc.category !== options.category) continue;

                seenIds.add(uniqueId);

                const resultType = (doc.category === 'tutorials' || doc.category === 'advanced-ai') ? 'example' : doc.type;

                results.push({
                    type: resultType as 'node' | 'documentation' | 'example',
                    id: doc.id,
                    name: doc.name,
                    displayName: doc.displayName,
                    title: doc.title,
                    description: doc.excerpt,
                    excerpt: doc.excerpt,
                    score: 10, // FlexSearch relevance is implicit in order, we could refine this
                    category: doc.category,
                    relevance: 'related'
                });
            }
        }

        // If no results from FlexSearch, fallback to basic full-text search in docs (Deep Search)
        if (results.length === 0) {
            const deepResults = this.docsProvider.searchDocs(query, { limit: options.limit });
            for (const page of deepResults) {
                const resultType = (page.category === 'tutorials' || page.category === 'advanced-ai') ? 'example' : 'documentation';
                results.push({
                    type: resultType as any,
                    id: page.id,
                    title: page.title,
                    url: page.url,
                    excerpt: page.content.excerpt,
                    score: 5,
                    category: page.category,
                    relevance: 'partial'
                });
            }
        }

        const limit = options.limit || 10;
        const limitedResults = results.slice(0, limit);

        // Generate suggestions
        const suggestions = this.generateSuggestions(query, results);

        // Generate hints
        const hints = this.generateHints(limitedResults);

        return {
            query,
            totalResults: results.length,
            results: limitedResults,
            suggestions,
            hints
        };
    }

    /**
     * Generate search suggestions
     */
    private generateSuggestions(query: string, results: any[]): string[] {
        const suggestions = new Set<string>();

        // Add related terms from top results
        for (const result of results.slice(0, 5)) {
            if (result.type === 'node') {
                const node = this.index?.entries.nodes.find((n: any) => n.name === result.id);
                if (node && node.searchTerms) {
                    node.searchTerms.slice(0, 3).forEach((t: string) => suggestions.add(t));
                }
            }
        }

        return Array.from(suggestions).slice(0, 5);
    }

    /**
     * Generate helpful hints based on search results
     */
    private generateHints(results: any[]): string[] {
        const hints: string[] = [];

        const hasNodes = results.some(r => r.type === 'node');
        const hasDocs = results.some(r => r.type === 'documentation');
        const hasExamples = results.some(r => r.type === 'example');

        if (hasNodes) {
            hints.push("💡 Use 'get <nodeName>' to see complete documentation and schema for a node");
            hints.push("📋 Use 'schema <nodeName>' for quick parameter reference");
        }

        if (hasDocs) {
            hints.push("📖 Use 'docs <title>' to read the full documentation page");
        }

        if (hasExamples) {
            hints.push("🎯 Use 'examples <query>' to find more workflow examples");
        }

        if (hasNodes && hasDocs) {
            hints.push("🔗 Use 'related <nodeName>' to discover related nodes and documentation");
        }

        return hints;
    }
}
