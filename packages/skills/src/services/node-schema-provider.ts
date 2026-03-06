import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Helper to get __dirname in ESM and CJS (bundled)
const _filename = typeof __filename !== 'undefined'
    ? __filename
    : (typeof import.meta !== 'undefined' && typeof import.meta.url === 'string' ? fileURLToPath(import.meta.url) : '');

const _dirname = typeof __dirname !== 'undefined'
    ? __dirname
    : (_filename ? path.dirname(_filename) : '');

export interface INodeSchemaStub {
    name: string;
    type: string;
    displayName: string;
    description: string;
    version: number | number[];
    keywords?: string[];
    operations?: string[];
    useCases?: string[];
    relevanceScore?: number;
}

export interface IEnrichedNode {
    name: string;
    type: string;
    displayName: string;
    description: string;
    version: number | number[];
    group?: string[];
    icon?: string;
    schema: {
        properties: any;
        sourcePath: string;
    };
    metadata: {
        keywords: string[];
        operations: string[];
        useCases: string[];
        keywordScore: number;
        hasDocumentation: boolean;
        markdownUrl: string | null;
        markdownFile: string | null;
    };
}

export interface NodeSchemaDiagnostics {
    enrichedIndexPath: string;
    customNodesPath?: string;
    officialNodeCount: number;
    totalNodeCount: number;
    customNodeCount: number;
    overriddenNodeCount: number;
    customNodesLoaded: boolean;
    customNodeKeys: string[];
}

export class NodeSchemaProvider {
    private index: any = null;
    private enrichedIndex: any = null;
    private enrichedIndexPath: string;
    private customNodesPath: string | undefined;
    private diagnostics: NodeSchemaDiagnostics | null = null;

    constructor(customIndexPath?: string, customNodesPath?: string) {
        const envAssetsDir = process.env.N8N_AS_CODE_ASSETS_DIR;
        if (customIndexPath) {
            this.enrichedIndexPath = customIndexPath;
        } else if (envAssetsDir && fs.existsSync(path.join(envAssetsDir, 'n8n-nodes-technical.json'))) {
            this.enrichedIndexPath = path.join(envAssetsDir, 'n8n-nodes-technical.json');
        } else {
            const siblingPath = path.resolve(_dirname, '../assets/n8n-nodes-technical.json');
            if (fs.existsSync(siblingPath)) {
                this.enrichedIndexPath = siblingPath;
            } else {
                this.enrichedIndexPath = path.resolve(_dirname, '../../assets/n8n-nodes-technical.json');
            }
        }
        this.customNodesPath = customNodesPath;
    }


    private loadIndex() {
        if (this.index) return;

        // Load technical index (required)
        if (!fs.existsSync(this.enrichedIndexPath)) {
            throw new Error(
                `Technical node index not found at: ${this.enrichedIndexPath}\n` +
                `Please run the build process: npm run build in packages/skills`
            );
        }

        try {
            const content = fs.readFileSync(this.enrichedIndexPath, 'utf-8');
            this.enrichedIndex = JSON.parse(content);
            this.index = this.enrichedIndex;
        } catch (error: any) {
            throw new Error(
                `Failed to load technical node index: ${error.message}\n` +
                `The index file may be corrupted. Try rebuilding: npm run build in packages/skills`
            );
        }

        const officialNodes = (this.index && typeof this.index.nodes === 'object' && !Array.isArray(this.index.nodes))
            ? this.index.nodes
            : {};
        const officialNodeCount = Object.keys(officialNodes).length;
        let customNodeCount = 0;
        let overriddenNodeCount = 0;
        let customNodeKeys: string[] = [];
        let customNodesLoaded = false;

        // Merge user-provided custom nodes on top of the official index
        if (this.customNodesPath && fs.existsSync(this.customNodesPath)) {
            try {
                const customContent = fs.readFileSync(this.customNodesPath, 'utf-8');
                const customIndex = JSON.parse(customContent);
                if (!customIndex || typeof customIndex !== 'object' || !customIndex.nodes || typeof customIndex.nodes !== 'object' || Array.isArray(customIndex.nodes)) {
                    throw new Error('Expected a JSON object with a top-level "nodes" object keyed by node name.');
                }

                customNodeKeys = Object.keys(customIndex.nodes);
                customNodeCount = customNodeKeys.length;
                overriddenNodeCount = customNodeKeys.filter((key) => key in officialNodes).length;
                customNodesLoaded = true;
                this.index = {
                    ...this.index,
                    nodes: {
                        ...officialNodes,
                        ...customIndex.nodes
                    }
                };
            } catch (error: any) {
                throw new Error(
                    `Failed to load custom nodes file at: ${this.customNodesPath}\n` +
                    `${error.message}`
                );
            }
        }

        this.diagnostics = {
            enrichedIndexPath: this.enrichedIndexPath,
            customNodesPath: this.customNodesPath,
            officialNodeCount,
            totalNodeCount: Object.keys(this.index.nodes || {}).length,
            customNodeCount,
            overriddenNodeCount,
            customNodesLoaded,
            customNodeKeys
        };
    }

    public getDiagnostics(): NodeSchemaDiagnostics {
        this.loadIndex();
        return this.diagnostics as NodeSchemaDiagnostics;
    }

    /**
     * Get the full JSON schema for a specific node by name.
     * Accepts short names (httpRequest) or full type prefixed names
     * (n8n-nodes-base.httpRequest, @n8n/n8n-nodes-langchain.agent).
     * Returns null if not found.
     */
    public getNodeSchema(nodeName: string): any | null {
        this.loadIndex();

        // Direct match
        if (this.index.nodes[nodeName]) {
            return this.formatNode(this.index.nodes[nodeName]);
        }

        // Strip package prefix if present (e.g. "n8n-nodes-base.httpRequest" → "httpRequest")
        const dotIdx = nodeName.lastIndexOf('.');
        if (dotIdx !== -1) {
            const shortName = nodeName.substring(dotIdx + 1);
            if (this.index.nodes[shortName]) {
                return this.formatNode(this.index.nodes[shortName]);
            }
        }

        // Case insensitive fallback
        const lowerName = nodeName.toLowerCase();
        const found = Object.keys(this.index.nodes).find(k => k.toLowerCase() === lowerName);
        if (found) return this.formatNode(this.index.nodes[found]);

        // Case insensitive fallback on stripped name
        if (dotIdx !== -1) {
            const shortLower = nodeName.substring(dotIdx + 1).toLowerCase();
            const foundShort = Object.keys(this.index.nodes).find(k => k.toLowerCase() === shortLower);
            if (foundShort) return this.formatNode(this.index.nodes[foundShort]);
        }

        return null;
    }

    private formatNode(node: any): any {
        return {
            name: node.name,
            type: node.type,
            displayName: node.displayName,
            description: node.description,
            version: node.version,
            group: node.group,
            icon: node.icon,
            schema: node.schema,
            metadata: node.metadata
        };
    }

    /**
     * Calculate relevance score for a node based on query
     */
    private calculateRelevance(query: string, node: any, key: string): number {
        const lowerQuery = query.toLowerCase();
        let score = 0;

        // Exact name match (highest priority)
        if (key.toLowerCase() === lowerQuery) {
            score += 1000;
        } else if (key.toLowerCase().includes(lowerQuery)) {
            score += 500;
        }

        // Display name match
        const displayName = (node.displayName || '').toLowerCase();
        if (displayName === lowerQuery) {
            score += 800;
        } else if (displayName.includes(lowerQuery)) {
            score += 400;
        }

        // Keyword match (from enriched metadata)
        if (node.metadata?.keywords) {
            const keywords = node.metadata.keywords;
            if (keywords.includes(lowerQuery)) {
                score += 300;
            }
            // Partial keyword match
            const matchingKeywords = keywords.filter((k: string) =>
                k.includes(lowerQuery) || lowerQuery.includes(k)
            );
            score += matchingKeywords.length * 50;
        }

        // Operations match
        if (node.metadata?.operations) {
            const matchingOps = node.metadata.operations.filter((op: string) =>
                op.toLowerCase().includes(lowerQuery)
            );
            score += matchingOps.length * 100;
        }

        // Use cases match
        if (node.metadata?.useCases) {
            const matchingUseCases = node.metadata.useCases.filter((uc: string) =>
                uc.toLowerCase().includes(lowerQuery)
            );
            score += matchingUseCases.length * 80;
        }

        // Description match (lower priority)
        const description = (node.description || '').toLowerCase();
        if (description.includes(lowerQuery)) {
            score += 100;
        }

        // Bonus for nodes with high keyword scores (AI/popular nodes)
        if (node.metadata?.keywordScore) {
            score += node.metadata.keywordScore * 0.5;
        }

        // Multi-word query: check if all words match
        const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);
        if (queryWords.length > 1) {
            const allFields = [
                key.toLowerCase(),
                displayName,
                description,
                ...(node.metadata?.keywords || []),
                ...(node.metadata?.operations || []),
                ...(node.metadata?.useCases || [])
            ].join(' ');

            const matchedWords = queryWords.filter(word => allFields.includes(word));
            if (matchedWords.length === queryWords.length) {
                score += 200 * queryWords.length;
            }
        }

        return score;
    }

    /**
     * Fuzzy search for nodes with improved relevance scoring.
     * Returns a list of matches (stub only, not full schema).
     */
    public searchNodes(query: string, limit: number = 20): INodeSchemaStub[] {
        this.loadIndex();
        const lowerQuery = query.toLowerCase();
        const scoredResults: Array<INodeSchemaStub & { score: number }> = [];

        for (const [key, node] of Object.entries<any>(this.index.nodes)) {
            const score = this.calculateRelevance(query, node, key);

            if (score > 0) {
                scoredResults.push({
                    name: node.name || key,
                    type: node.type || node.name || key,
                    displayName: node.displayName || key,
                    description: node.description || '',
                    version: node.version,
                    keywords: node.metadata?.keywords || [],
                    operations: node.metadata?.operations || [],
                    useCases: node.metadata?.useCases || [],
                    relevanceScore: score,
                    score
                });
            }
        }

        // Sort by score (highest first) and take top results
        scoredResults.sort((a, b) => b.score - a.score);

        return scoredResults.slice(0, limit).map(({ score, ...rest }) => rest);
    }

    /**
     * List all available nodes (compact format).
     */
    public listAllNodes(): INodeSchemaStub[] {
        this.loadIndex();
        return Object.values<any>(this.index.nodes).map(node => ({
            name: node.name,
            type: node.type || node.name,
            displayName: node.displayName,
            description: node.description || '',
            version: node.version,
            keywords: node.metadata?.keywords || [],
            operations: node.metadata?.operations || [],
            useCases: node.metadata?.useCases || []
        }));
    }
}
