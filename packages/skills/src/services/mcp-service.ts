import { readFileSync } from 'fs';
import { join } from 'path';
import { NodeSchemaProvider } from './node-schema-provider.js';
import { WorkflowValidator } from './workflow-validator.js';
import { DocsProvider } from './docs-provider.js';
import { KnowledgeSearch } from './knowledge-search.js';
import { WorkflowRegistry } from './workflow-registry.js';
import { resolveCustomNodesConfig } from './custom-nodes-config.js';

export interface SkillsMcpServiceOptions {
    assetsDir: string;
    cwd?: string;
}

export interface ValidateWorkflowOptions {
    workflowContent: string;
    format?: 'auto' | 'json' | 'typescript';
}

function detectWorkflowFormat(workflowContent: string, format: 'auto' | 'json' | 'typescript' = 'auto'): boolean {
    if (format === 'typescript') {
        return true;
    }

    if (format === 'json') {
        return false;
    }

    const trimmed = workflowContent.trim();
    return trimmed.startsWith('import ')
        || trimmed.startsWith('@workflow')
        || trimmed.includes('export class');
}

export class SkillsMcpService {
    private provider: NodeSchemaProvider;
    private docsProvider: DocsProvider;
    private knowledgeSearch: KnowledgeSearch;
    private registry: WorkflowRegistry | undefined;
    private validator: WorkflowValidator;
    private workflowIndexPath: string;
    readonly cwd: string;

    constructor(options: SkillsMcpServiceOptions) {
        this.cwd = options.cwd || process.cwd();
        this.workflowIndexPath = join(options.assetsDir, 'workflows-index.json');

        const customNodesConfig = resolveCustomNodesConfig(this.cwd);
        const customNodesPath = customNodesConfig.resolvedPath;

        this.provider = new NodeSchemaProvider(join(options.assetsDir, 'n8n-nodes-technical.json'), customNodesPath);
        this.docsProvider = new DocsProvider(join(options.assetsDir, 'n8n-docs-complete.json'));
        this.knowledgeSearch = new KnowledgeSearch(join(options.assetsDir, 'n8n-knowledge-index.json'));
        this.validator = new WorkflowValidator(join(options.assetsDir, 'n8n-nodes-technical.json'), customNodesPath);
    }

    private getRegistry(): WorkflowRegistry {
        if (!this.registry) {
            this.registry = new WorkflowRegistry(this.workflowIndexPath);
        }

        return this.registry;
    }

    searchKnowledge(query: string, options: { category?: string; type?: 'node' | 'documentation'; limit?: number } = {}) {
        return this.knowledgeSearch.searchAll(query, {
            category: options.category,
            type: options.type,
            limit: options.limit,
        });
    }

    getNodeInfo(name: string) {
        const schema = this.provider.getNodeSchema(name);
        if (!schema) {
            throw new Error(`Node '${name}' not found.`);
        }

        return schema;
    }

    searchDocs(query: string, limit: number = 5) {
        return this.docsProvider.searchDocs(query, { limit });
    }

    searchExamples(query: string, limit: number = 10) {
        return this.getRegistry().search(query, limit);
    }

    getExampleInfo(id: string) {
        const workflow = this.getRegistry().getById(id);
        if (!workflow) {
            throw new Error(`Workflow with ID "${id}" not found.`);
        }

        return {
            ...workflow,
            rawUrl: this.getRegistry().getRawUrl(workflow),
        };
    }

    async validateWorkflow({ workflowContent, format = 'auto' }: ValidateWorkflowOptions) {
        const isTypeScript = detectWorkflowFormat(workflowContent, format);
        const workflowInput = isTypeScript ? workflowContent : JSON.parse(workflowContent);
        return this.validator.validateWorkflow(workflowInput, isTypeScript);
    }

    readWorkflowFile(path: string) {
        return readFileSync(path, 'utf8');
    }
}
