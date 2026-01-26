import { Index } from 'flexsearch';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { readFileSync, existsSync } from 'fs';

// Helper to get __dirname in ESM and CJS (bundled)
const _filename = typeof __filename !== 'undefined'
    ? __filename
    : (typeof import.meta !== 'undefined' && typeof import.meta.url === 'string' ? fileURLToPath(import.meta.url) : '');

const _dirname = typeof __dirname !== 'undefined'
    ? __dirname
    : (_filename ? dirname(_filename) : '');

export interface WorkflowMetadata {
    id: number | string;
    slug: string;
    name: string;
    tags: string[];
    author: string;
    createdAt: string | null;
    description: string | null;
    hasWorkflow: boolean;
    workflowFile: string | null;
}

interface WorkflowIndex {
    generatedAt: string;
    repository: string;
    totalWorkflows: number;
    workflows: WorkflowMetadata[];
}

export class WorkflowRegistry {
    private index: WorkflowIndex;
    private searchIndex: Index;
    private workflowsById: Map<string | number, WorkflowMetadata>;

    constructor(customIndexPath?: string) {
        // Load the index
        let indexPath: string | undefined;
        const envAssetsDir = process.env.N8N_AS_CODE_ASSETS_DIR;

        if (customIndexPath) {
            indexPath = customIndexPath;
        } else if (envAssetsDir) {
            const possiblePath = join(envAssetsDir, 'workflows-index.json');
            if (existsSync(possiblePath)) {
                indexPath = possiblePath;
            }
        }

        // If not found yet, try local paths
        if (!indexPath) {
            // Fallback to assets directory relative to this file
            indexPath = resolve(_dirname, '../assets/workflows-index.json');

            if (!existsSync(indexPath)) {
                // Try one level up just in case of different build structure
                indexPath = resolve(_dirname, '../../assets/workflows-index.json');
            }
        }

        if (!indexPath || !existsSync(indexPath)) {
            // Return empty index if not found to prevent crash, but log error
            console.error(`Workflow index not found (searched ${indexPath || 'none'}). AI workflow search will be disabled.`);
            this.index = {
                generatedAt: new Date().toISOString(),
                repository: '',
                totalWorkflows: 0,
                workflows: []
            };
            this.workflowsById = new Map();
            this.searchIndex = new Index({
                tokenize: 'forward',
                resolution: 9,
                cache: true,
            });
            return;
        }

        const raw = readFileSync(indexPath, 'utf-8');
        this.index = JSON.parse(raw);

        // Build lookup map
        this.workflowsById = new Map();
        for (const workflow of this.index.workflows) {
            this.workflowsById.set(workflow.id, workflow);
        }

        // Initialize FlexSearch
        this.searchIndex = new Index({
            tokenize: 'forward',
            resolution: 9,
            cache: true,
        });

        // Index all workflows
        for (const workflow of this.index.workflows) {
            const searchableText = [
                workflow.name,
                workflow.description || '',
                ...workflow.tags,
                workflow.author,
            ].join(' ');

            this.searchIndex.add(workflow.id, searchableText);
        }
    }

    /**
     * Search workflows using FlexSearch
     */
    search(query: string, limit: number = 10): WorkflowMetadata[] {
        const results = this.searchIndex.search(query, { limit }) as Array<string | number>;

        return results
            .map((id: string | number) => this.workflowsById.get(id))
            .filter((w): w is WorkflowMetadata => w !== undefined);
    }

    /**
     * Get workflow by ID
     */
    getById(id: string | number): WorkflowMetadata | undefined {
        // Try numeric conversion if string
        const numericId = typeof id === 'string' ? parseInt(id, 10) : id;

        return this.workflowsById.get(id) || this.workflowsById.get(numericId);
    }

    /**
     * Get all workflows
     */
    getAll(): WorkflowMetadata[] {
        return this.index.workflows;
    }

    /**
     * Generate the raw GitHub URL for a workflow
     */
    getRawUrl(workflow: WorkflowMetadata, branch: string = 'main'): string {
        const baseUrl = 'https://raw.githubusercontent.com/nusquama/n8nworkflows.xyz';
        const filename = workflow.workflowFile || 'workflow.json';
        return `${baseUrl}/${branch}/workflows/${workflow.slug}/${filename}`;
    }

    /**
     * Get index metadata
     */
    getMetadata() {
        return {
            generatedAt: this.index.generatedAt,
            repository: this.index.repository,
            totalWorkflows: this.index.totalWorkflows,
        };
    }
}
