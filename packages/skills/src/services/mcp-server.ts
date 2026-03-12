import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SkillsMcpService, type SkillsMcpServiceOptions } from './mcp-service.js';

function asJsonText(data: unknown): string {
    return JSON.stringify(data, null, 2);
}

export async function startSkillsMcpServer(options: SkillsMcpServiceOptions): Promise<void> {
    const service = new SkillsMcpService(options);
    const server = new McpServer({
        name: 'n8n-as-code',
        version: '1.0.0',
    });

    server.tool(
        'search_n8n_knowledge',
        'Search the local n8n-as-code knowledge base for nodes, documentation, and examples.',
        {
            query: z.string().min(1).describe('Natural-language search query, for example "google sheets" or "AI agent".'),
            category: z.string().optional().describe('Optional documentation category filter.'),
            type: z.enum(['node', 'documentation']).optional().describe('Optional result type filter.'),
            limit: z.number().int().min(1).max(25).optional().describe('Maximum number of results to return.'),
        },
        async ({ query, category, type, limit }) => ({
            content: [{ type: 'text', text: asJsonText(service.searchKnowledge(query, { category, type, limit })) }],
        }),
    );

    server.tool(
        'get_n8n_node_info',
        'Get the full offline schema and metadata for a specific n8n node.',
        {
            name: z.string().min(1).describe('Exact or close node name, for example "googleSheets" or "n8n-nodes-base.httpRequest".'),
        },
        async ({ name }) => {
            try {
                return {
                    content: [{ type: 'text', text: asJsonText(service.getNodeInfo(name)) }],
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: 'text', text: error.message }],
                };
            }
        },
    );

    server.tool(
        'search_n8n_workflow_examples',
        'Search the bundled n8n community workflow index for reusable example workflows.',
        {
            query: z.string().min(1).describe('Search query, for example "slack notification" or "invoice processing".'),
            limit: z.number().int().min(1).max(25).optional().describe('Maximum number of workflow examples to return.'),
        },
        async ({ query, limit }) => ({
            content: [{ type: 'text', text: asJsonText(service.searchExamples(query, limit)) }],
        }),
    );

    server.tool(
        'get_n8n_workflow_example',
        'Get metadata and the raw download URL for a specific community workflow example.',
        {
            id: z.string().min(1).describe('Workflow example ID from search_n8n_workflow_examples.'),
        },
        async ({ id }) => {
            try {
                return {
                    content: [{ type: 'text', text: asJsonText(service.getExampleInfo(id)) }],
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: 'text', text: error.message }],
                };
            }
        },
    );

    server.tool(
        'validate_n8n_workflow',
        'Validate an n8n workflow from JSON or TypeScript content against the bundled schema.',
        {
            workflowContent: z.string().min(1).describe('Workflow source as JSON or .workflow.ts text.'),
            format: z.enum(['auto', 'json', 'typescript']).optional().describe('Optional workflow format override.'),
        },
        async ({ workflowContent, format }) => {
            try {
                const result = await service.validateWorkflow({ workflowContent, format });
                return {
                    content: [{ type: 'text', text: asJsonText(result) }],
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: 'text', text: error.message }],
                };
            }
        },
    );

    server.tool(
        'search_n8n_docs',
        'Search bundled n8n documentation pages and return matching excerpts.',
        {
            query: z.string().min(1).describe('Documentation search query.'),
            limit: z.number().int().min(1).max(10).optional().describe('Maximum number of pages to return.'),
        },
        async ({ query, limit }) => ({
            content: [{ type: 'text', text: asJsonText(service.searchDocs(query, limit)) }],
        }),
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);
}
