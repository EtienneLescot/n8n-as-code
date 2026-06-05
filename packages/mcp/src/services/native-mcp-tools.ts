export interface NativeMcpToolSummary {
    name: string;
    description?: string;
    annotations?: unknown;
}

export interface NativeMcpCapabilities {
    workflowDiscovery: boolean;
    workflowDetails: boolean;
    workflowExecution: boolean;
    workflowTesting: boolean;
    workflowPublish: boolean;
    workflowBuilderReference: boolean;
    workflowBuilderCreate: boolean;
    workflowBuilderUpdate: boolean;
    projectsAndFolders: boolean;
    executions: boolean;
    credentials: boolean;
    dataTables: boolean;
}

export const NATIVE_MCP_READ_ONLY_TOOL_MAP = {
    searchLiveWorkflows: 'search_workflows',
    getLiveWorkflowDetails: 'get_workflow_details',
    searchLiveProjects: 'search_projects',
    searchLiveFolders: 'search_folders',
    listLiveCredentials: 'list_credentials',
    searchLiveExecutions: 'search_executions',
    getLiveExecution: 'get_execution',
    getNativeSdkReference: 'get_sdk_reference',
    searchNativeNodes: 'search_nodes',
    getNativeNodeTypes: 'get_node_types',
    validateNativeWorkflowCode: 'validate_workflow',
} as const;

export type NativeMcpReadOnlyToolAlias = keyof typeof NATIVE_MCP_READ_ONLY_TOOL_MAP;

export function summarizeNativeMcpTools(tools: Array<Record<string, unknown>>): NativeMcpToolSummary[] {
    return tools
        .map((tool) => ({
            name: String(tool.name || ''),
            description: typeof tool.description === 'string' ? tool.description : undefined,
            annotations: tool.annotations,
        }))
        .filter((tool) => tool.name.length > 0)
        .sort((left, right) => left.name.localeCompare(right.name));
}

export function buildNativeMcpCapabilities(tools: NativeMcpToolSummary[]): NativeMcpCapabilities {
    const names = new Set(tools.map((tool) => tool.name));
    return {
        workflowDiscovery: names.has('search_workflows'),
        workflowDetails: names.has('get_workflow_details'),
        workflowExecution: names.has('execute_workflow'),
        workflowTesting: names.has('test_workflow') && names.has('prepare_test_pin_data'),
        workflowPublish: names.has('publish_workflow') && names.has('unpublish_workflow'),
        workflowBuilderReference: names.has('get_sdk_reference') && names.has('search_nodes') && names.has('get_node_types') && names.has('validate_workflow'),
        workflowBuilderCreate: names.has('create_workflow_from_code'),
        workflowBuilderUpdate: names.has('update_workflow'),
        projectsAndFolders: names.has('search_projects') && names.has('search_folders'),
        executions: names.has('get_execution') || names.has('search_executions'),
        credentials: names.has('list_credentials'),
        dataTables: names.has('search_data_tables'),
    };
}

export function missingNativeMcpTools(tools: NativeMcpToolSummary[]): string[] {
    const names = new Set(tools.map((tool) => tool.name));
    return Object.values(NATIVE_MCP_READ_ONLY_TOOL_MAP).filter((toolName) => !names.has(toolName));
}
