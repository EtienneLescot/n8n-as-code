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
    searchLiveExecutions: 'search_workflow_executions',
    getLiveExecution: 'get_workflow_execution',
    getNativeSdkReference: 'get_workflow_sdk_reference',
    searchNativeNodes: 'search_nodes',
    getNativeNodeTypes: 'get_node_types',
    validateNativeWorkflowCode: 'validate_workflow',
} as const;

export type NativeMcpReadOnlyToolAlias = keyof typeof NATIVE_MCP_READ_ONLY_TOOL_MAP;

/**
 * n8n gained a `workflow_` prefix on these three tools. Older instances still advertise
 * the bare names, and the bridge calls whatever the instance advertises today, so both
 * spellings have to be accepted rather than tracking a single n8n version.
 */
export const NATIVE_MCP_TOOL_NAME_ALIASES: Readonly<Record<string, readonly string[]>> = {
    search_workflow_executions: ['search_executions'],
    get_workflow_execution: ['get_execution'],
    get_workflow_sdk_reference: ['get_sdk_reference'],
};

/** The canonical name first, then its legacy spellings. */
export function nativeMcpToolNameCandidates(canonicalName: string): string[] {
    const aliases = NATIVE_MCP_TOOL_NAME_ALIASES[canonicalName];
    return aliases ? [canonicalName, ...aliases] : [canonicalName];
}

/** The spelling this tool list actually exposes, or undefined when it exposes none of them. */
export function resolveNativeMcpToolName(canonicalName: string, availableNames: Iterable<string>): string | undefined {
    const available = new Set(availableNames);
    return nativeMcpToolNameCandidates(canonicalName).find((name) => available.has(name));
}

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
    const has = (canonicalName: string) => resolveNativeMcpToolName(canonicalName, names) !== undefined;
    return {
        workflowDiscovery: names.has('search_workflows'),
        workflowDetails: names.has('get_workflow_details'),
        workflowExecution: names.has('execute_workflow'),
        workflowTesting: names.has('test_workflow') && names.has('prepare_test_pin_data'),
        workflowPublish: names.has('publish_workflow') && names.has('unpublish_workflow'),
        workflowBuilderReference: has(NATIVE_MCP_READ_ONLY_TOOL_MAP.getNativeSdkReference) && names.has('search_nodes') && names.has('get_node_types') && names.has('validate_workflow'),
        workflowBuilderCreate: names.has('create_workflow_from_code'),
        workflowBuilderUpdate: names.has('update_workflow'),
        projectsAndFolders: names.has('search_projects') && names.has('search_folders'),
        executions: has(NATIVE_MCP_READ_ONLY_TOOL_MAP.getLiveExecution) || has(NATIVE_MCP_READ_ONLY_TOOL_MAP.searchLiveExecutions),
        credentials: names.has('list_credentials'),
        dataTables: names.has('search_data_tables'),
    };
}

export function missingNativeMcpTools(tools: NativeMcpToolSummary[]): string[] {
    const names = new Set(tools.map((tool) => tool.name));
    return Object.values(NATIVE_MCP_READ_ONLY_TOOL_MAP).filter((toolName) => resolveNativeMcpToolName(toolName, names) === undefined);
}
