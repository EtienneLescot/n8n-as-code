import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Helper to get __dirname in ESM and CJS (bundled)
const _filename = typeof import.meta !== 'undefined' && import.meta.url
    ? fileURLToPath(import.meta.url)
    : (typeof __filename !== 'undefined' ? __filename : '');

const _dirname = typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(_filename as string);

export interface INodeSchemaStub {
    name: string;
    displayName: string;
    description: string;
    version: number | number[];
}

export class NodeSchemaProvider {
    private index: any = null;
    private indexPath: string;

    constructor(customIndexPath?: string) {
        if (customIndexPath) {
            this.indexPath = customIndexPath;
        } else {
            // Resolve path to assets/n8n-nodes-index.json
            // In dist structure: dist/services/node-schema-provider.js -> dist/assets/n8n-nodes-index.json
            this.indexPath = path.resolve(_dirname, '../assets/n8n-nodes-index.json');
        }
    }


    private loadIndex() {
        if (this.index) return;
        try {
            if (!fs.existsSync(this.indexPath)) {
                throw new Error(`n8n Node Index not found at: ${this.indexPath}. Run 'npm run build' in @n8n-as-code/agent-cli.`);
            }

            const content = fs.readFileSync(this.indexPath, 'utf-8');
            this.index = JSON.parse(content);
        } catch (error: any) {
            throw new Error(`Failed to load n8n node index: ${error.message}`);
        }
    }

    /**
     * Get the full JSON schema for a specific node by name.
     * Returns null if not found.
     */
    public getNodeSchema(nodeName: string): any | null {
        this.loadIndex();

        // Direct match
        if (this.index.nodes[nodeName]) {
            return this.index.nodes[nodeName];
        }

        // Case insensitive fallback
        const lowerName = nodeName.toLowerCase();
        const found = Object.keys(this.index.nodes).find(k => k.toLowerCase() === lowerName);

        return found ? this.index.nodes[found] : null;
    }

    /**
     * Fuzzy search for nodes.
     * Returns a list of matches (stub only, not full schema).
     */
    public searchNodes(query: string): INodeSchemaStub[] {
        this.loadIndex();
        const lowerQuery = query.toLowerCase();
        const results: INodeSchemaStub[] = [];

        for (const [key, node] of Object.entries<any>(this.index.nodes)) {
            const nameMatch = key.toLowerCase().includes(lowerQuery);
            const displayMatch = node.displayName?.toLowerCase().includes(lowerQuery);
            const descMatch = node.description?.toLowerCase().includes(lowerQuery);

            if (nameMatch || displayMatch || descMatch) {
                results.push({
                    name: node.name || key,
                    displayName: node.displayName || key,
                    description: node.description || '',
                    version: node.version
                });
            }

            // Cap results to avoid overwhelming output
            if (results.length >= 20) break;
        }

        return results;
    }

    /**
     * List all available nodes (compact format).
     */
    public listAllNodes(): INodeSchemaStub[] {
        this.loadIndex();
        return Object.values<any>(this.index.nodes).map(node => ({
            name: node.name,
            displayName: node.displayName,
            description: node.description || '',
            version: node.version
        }));
    }
}
