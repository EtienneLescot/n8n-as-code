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
            content: [{ type: 'text', text: asJsonText(await service.searchKnowledge(query, { category, type, limit })) }],
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
                    content: [{ type: 'text', text: asJsonText(await service.getNodeInfo(name)) }],
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
            content: [{ type: 'text', text: asJsonText(await service.searchExamples(query, limit)) }],
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
                    content: [{ type: 'text', text: asJsonText(await service.getExampleInfo(id)) }],
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
            category: z.string().optional().describe('Optional documentation category filter.'),
            type: z.enum(['node', 'documentation']).optional().describe('Optional result type filter. Defaults to documentation.'),
            limit: z.number().int().min(1).max(10).optional().describe('Maximum number of pages to return.'),
        },
        async ({ query, category, type, limit }) => ({
            content: [{ type: 'text', text: asJsonText(await service.searchDocs(query, { category, type, limit })) }],
        }),
    );

    server.tool(
        'list_n8n_workflows',
        'List workflows from the configured n8n project, including sync status. Uses `n8nac list --raw`.',
        {
            local: z.boolean().optional().describe('Show only local and tracked workflows.'),
            remote: z.boolean().optional().describe('Show only remote and tracked workflows.'),
            search: z.string().optional().describe('Filter by workflow name, ID, or filename.'),
            sort: z.enum(['status', 'name']).optional().describe('Sort mode for the workflow list.'),
            limit: z.number().int().min(1).optional().describe('Maximum number of workflows to return.'),
        },
        async ({ local, remote, search, sort, limit }) => {
            const result = await service.listWorkflows({ local, remote, search, sort, limit });
            return {
                isError: !result.success,
                content: [{ type: 'text', text: asJsonText(result) }],
            };
        },
    );

    server.tool(
        'find_n8n_workflows',
        'Find workflows by partial name, workflow ID, or local filename. Uses `n8nac find --raw`.',
        {
            query: z.string().min(1).describe('Search query used by `n8nac find`.'),
            local: z.boolean().optional().describe('Show only local and tracked workflows.'),
            remote: z.boolean().optional().describe('Show only remote and tracked workflows.'),
            sort: z.enum(['status', 'name']).optional().describe('Sort mode for the workflow list.'),
            limit: z.number().int().min(1).optional().describe('Maximum number of workflows to return.'),
        },
        async ({ query, local, remote, sort, limit }) => {
            const result = await service.findWorkflows({ query, local, remote, sort, limit });
            return {
                isError: !result.success,
                content: [{ type: 'text', text: asJsonText(result) }],
            };
        },
    );

    server.tool(
        'fetch_n8n_workflow',
        'Fetch and refresh cached remote state for a workflow. Uses `n8nac fetch`.',
        {
            workflowId: z.string().min(1).describe('Workflow ID to fetch from n8n.'),
        },
        async ({ workflowId }) => {
            const result = await service.fetchWorkflow(workflowId);
            return {
                isError: !result.success,
                content: [{ type: 'text', text: asJsonText(result) }],
            };
        },
    );

    server.tool(
        'pull_n8n_workflow',
        'Pull a workflow from n8n into the local sync folder. Uses `n8nac pull`.',
        {
            workflowId: z.string().min(1).describe('Workflow ID to pull from n8n.'),
        },
        async ({ workflowId }) => {
            const result = await service.pullWorkflow(workflowId);
            return {
                isError: !result.success,
                content: [{ type: 'text', text: asJsonText(result) }],
            };
        },
    );

    server.tool(
        'push_n8n_workflow',
        'Push a local workflow file to n8n. Uses `n8nac push`.',
        {
            filename: z.string().min(1).describe('Workflow filename or path inside the active sync scope.'),
            verify: z.boolean().optional().describe('Run remote validation after pushing.'),
        },
        async ({ filename, verify }) => {
            const result = await service.pushWorkflow(filename, { verify });
            return {
                isError: !result.success,
                content: [{ type: 'text', text: asJsonText(result) }],
            };
        },
    );

    server.tool(
        'verify_n8n_remote_workflow',
        'Fetch a workflow from n8n and validate it against the local node schema. Uses `n8nac verify`.',
        {
            workflowId: z.string().min(1).describe('Workflow ID to validate remotely.'),
        },
        async ({ workflowId }) => {
            const result = await service.verifyRemoteWorkflow(workflowId);
            return {
                isError: !result.success,
                content: [{ type: 'text', text: asJsonText(result) }],
            };
        },
    );

    server.tool(
        'test_n8n_workflow',
        'Trigger an n8n workflow through its webhook/chat/form URL and report the result. Uses `n8nac test`.',
        {
            workflowId: z.string().min(1).describe('Workflow ID to test.'),
            prod: z.boolean().optional().describe('Call the production webhook instead of the test webhook.'),
            data: z.any().optional().describe('Optional JSON payload body to send with the request.'),
        },
        async ({ workflowId, prod, data }) => {
            const result = await service.testWorkflow(workflowId, { prod, data });
            return {
                isError: !result.success,
                content: [{ type: 'text', text: asJsonText(result) }],
            };
        },
    );

    server.tool(
        'get_n8n_workflow_test_plan',
        'Inspect how a workflow can be tested over HTTP and infer a suggested payload. Uses `n8nac test-plan --json`.',
        {
            workflowId: z.string().min(1).describe('Workflow ID to inspect for HTTP testability.'),
        },
        async ({ workflowId }) => {
            const result = await service.getWorkflowTestPlan(workflowId);
            return {
                isError: !result.success,
                content: [{ type: 'text', text: asJsonText(result) }],
            };
        },
    );

    server.tool(
        'resolve_n8n_workflow_conflict',
        'Resolve a workflow conflict by keeping either the current local version or the incoming remote version. Uses `n8nac resolve`.',
        {
            workflowId: z.string().min(1).describe('Workflow ID with a conflict.'),
            mode: z.enum(['keep-current', 'keep-incoming']).describe('Conflict resolution strategy.'),
        },
        async ({ workflowId, mode }) => {
            const result = await service.resolveWorkflowConflict(workflowId, mode);
            return {
                isError: !result.success,
                content: [{ type: 'text', text: asJsonText(result) }],
            };
        },
    );

    server.tool(
        'convert_n8n_workflow',
        'Convert a workflow file between JSON and TypeScript formats. Uses `n8nac convert`.',
        {
            file: z.string().min(1).describe('Path to a workflow file (`.json` or `.workflow.ts`).'),
            output: z.string().optional().describe('Optional output path.'),
            force: z.boolean().optional().describe('Overwrite the output file if it already exists.'),
            format: z.enum(['json', 'typescript']).optional().describe('Optional target format override.'),
        },
        async ({ file, output, force, format }) => {
            const result = await service.convertWorkflow({ file, output, force, format });
            return {
                isError: !result.success,
                content: [{ type: 'text', text: asJsonText(result) }],
            };
        },
    );

    server.tool(
        'convert_n8n_workflows_batch',
        'Batch-convert workflow files in a directory between JSON and TypeScript formats. Uses `n8nac convert-batch`.',
        {
            directory: z.string().min(1).describe('Directory containing workflow files.'),
            format: z.enum(['json', 'typescript']).describe('Target format for all workflow files.'),
            force: z.boolean().optional().describe('Overwrite existing output files.'),
        },
        async ({ directory, format, force }) => {
            const result = await service.convertWorkflowsBatch({ directory, format, force });
            return {
                isError: !result.success,
                content: [{ type: 'text', text: asJsonText(result) }],
            };
        },
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);
}
