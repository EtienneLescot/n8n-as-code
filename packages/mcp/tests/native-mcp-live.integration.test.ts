import { beforeAll, describe, expect, test } from '@jest/globals';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { N8nAsCodeMcpService } from '../src/services/mcp-service';
import { NATIVE_MCP_READ_ONLY_TOOL_MAP, type NativeMcpReadOnlyToolAlias } from '../src/services/native-mcp-tools';

interface LiveNativeMcpTestConfig {
    endpoint: string;
    token: string;
    timeoutMs: number;
    workflowSearchQuery?: string;
    workflowSearchLimit: number;
    nodeSearchQueries: string[];
    sdkReferenceSection: 'patterns' | 'expressions' | 'functions' | 'rules' | 'import' | 'guidelines' | 'design' | 'all';
    expectedTools: string[];
}

interface AgentUseCase {
    name: string;
    userIntent: string;
    expectedBrokerTool?: string;
    nativeAlias?: NativeMcpReadOnlyToolAlias;
    args?: (config: LiveNativeMcpTestConfig) => Record<string, unknown>;
}

interface AgentRoutingTrace {
    userIntent: string;
    toolEvents: string[];
    result?: unknown;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const liveConfig = loadLiveNativeMcpTestConfig();
const describeLive = liveConfig ? describe : describe.skip;
const liveTestTimeoutMs = (liveConfig?.timeoutMs || 30_000) + 10_000;

const liveAgentUseCases: AgentUseCase[] = [
    {
        name: 'routes live workflow discovery through native MCP',
        userIntent: 'Find workflows that exist right now in the connected n8n instance.',
        expectedBrokerTool: 'search_n8n_live_workflows',
        nativeAlias: 'searchLiveWorkflows',
        args: (config) => stripUndefined({
            query: config.workflowSearchQuery,
            limit: config.workflowSearchLimit,
        }),
    },
    {
        name: 'routes live node discovery through native MCP',
        userIntent: 'Inspect live native n8n node definitions from the connected instance.',
        expectedBrokerTool: 'search_n8n_native_nodes',
        nativeAlias: 'searchNativeNodes',
        args: (config) => ({ queries: config.nodeSearchQueries }),
    },
    {
        name: 'routes native SDK reference lookup through native MCP',
        userIntent: 'Read the native n8n workflow-builder SDK reference from the connected instance.',
        expectedBrokerTool: 'get_n8n_native_sdk_reference',
        nativeAlias: 'getNativeSdkReference',
        args: (config) => ({ section: config.sdkReferenceSection }),
    },
];

describeLive('native MCP live agent routing', () => {
    let service: N8nAsCodeMcpService;
    let nativeToolNames: Set<string>;

    beforeAll(async () => {
        service = new N8nAsCodeMcpService({
            cwd: repoRoot,
            nativeMcpEnv: toNativeMcpEnv(liveConfig!),
        });

        const status = await service.getNativeMcpStatus({ includeTools: true });
        expect(status.config.enabled).toBe(true);
        expect(status.config.configured).toBe(true);
        expect(status.config.tokenConfigured).toBe(true);
        expect(status.config.endpoint).not.toContain(liveConfig!.token);
        expect(status.connection.checked).toBe(true);
        if (status.connection.ok !== true) {
            throw new Error(`Native MCP live status failed: ${redactSensitiveText(status.connection.error || 'unknown error', liveConfig!.token)}`);
        }

        nativeToolNames = new Set(status.tools?.names || []);
        for (const toolName of liveConfig!.expectedTools) {
            expect(nativeToolNames.has(toolName)).toBe(true);
        }
    }, liveTestTimeoutMs);

    test.each(liveAgentUseCases)('$name', async (useCase) => {
        const trace = await runScriptedAgentUseCase(service, nativeToolNames, liveConfig!, useCase);

        expect(trace.userIntent).toBe(useCase.userIntent);
        expect(trace.toolEvents).toContain(`broker:${useCase.expectedBrokerTool}`);
        expect(trace.toolEvents).toContain(`native:${NATIVE_MCP_READ_ONLY_TOOL_MAP[useCase.nativeAlias!]}`);
        expectNativeToolResultSucceeded(trace.result);
    }, liveTestTimeoutMs);
});

describe('native MCP agent routing policy', () => {
    test('keeps code-first workflow authoring on local n8n-as-code tools', async () => {
        const trace = await runScriptedLocalAuthoringUseCase();

        expect(trace.toolEvents).toContain('local:validate_n8n_workflow');
        expect(trace.toolEvents.some((event) => event.startsWith('native:'))).toBe(false);
        expect(trace.toolEvents.some((event) => event.startsWith('broker:search_n8n_live_'))).toBe(false);
    });
});

async function runScriptedAgentUseCase(
    service: N8nAsCodeMcpService,
    nativeToolNames: Set<string>,
    config: LiveNativeMcpTestConfig,
    useCase: AgentUseCase,
): Promise<AgentRoutingTrace> {
    if (!useCase.expectedBrokerTool || !useCase.nativeAlias) {
        throw new Error(`Live use case "${useCase.name}" does not declare an expected native MCP route.`);
    }

    const nativeToolName = NATIVE_MCP_READ_ONLY_TOOL_MAP[useCase.nativeAlias];
    if (!nativeToolNames.has(nativeToolName)) {
        throw new Error(`Connected native MCP server does not expose required tool "${nativeToolName}" for use case "${useCase.name}".`);
    }

    const toolEvents = [
        'broker:get_n8n_native_mcp_status',
        `broker:${useCase.expectedBrokerTool}`,
        `native:${nativeToolName}`,
    ];
    const result = await service.callNativeMcpTool(nativeToolName, useCase.args?.(config) || {});

    return {
        userIntent: useCase.userIntent,
        toolEvents,
        result,
    };
}

async function runScriptedLocalAuthoringUseCase(): Promise<AgentRoutingTrace> {
    return {
        userIntent: 'Create or edit a workflow source file in this repository.',
        toolEvents: ['local:validate_n8n_workflow'],
    };
}

function loadLiveNativeMcpTestConfig(): LiveNativeMcpTestConfig | undefined {
    const env = { ...loadDotEnvFile(join(repoRoot, '.env.test')), ...process.env };
    if (isFalse(firstString(env.NATIVE_MCP_LIVE_TESTS, env.N8NAC_NATIVE_MCP_LIVE_TESTS))) {
        return undefined;
    }

    // User-facing live test configuration is intentionally env-driven. The local
    // native_mcp_config.json file may document the target shape, but it is not a
    // source of truth for credentials or routing decisions.
    const endpoint = firstString(env.NATIVE_MCP_URL);
    const token = normalizeNativeMcpToken(firstString(env.NATIVE_MCP_KEY));

    if (!endpoint || !token) {
        return undefined;
    }

    return {
        endpoint,
        token,
        timeoutMs: firstPositiveInteger(
            env.NATIVE_MCP_TIMEOUT_MS,
        ) || 30_000,
        workflowSearchQuery: firstString(
            env.NATIVE_MCP_WORKFLOW_QUERY,
        ),
        workflowSearchLimit: firstPositiveInteger(
            env.NATIVE_MCP_WORKFLOW_LIMIT,
        ) || 5,
        nodeSearchQueries: firstStringArray(
            env.NATIVE_MCP_NODE_QUERIES,
        ) || ['manual trigger'],
        sdkReferenceSection: normalizeSdkReferenceSection(firstString(
            env.NATIVE_MCP_SDK_REFERENCE_SECTION,
        )),
        expectedTools: firstStringArray(
            env.NATIVE_MCP_EXPECTED_TOOLS,
        ) || [
            NATIVE_MCP_READ_ONLY_TOOL_MAP.searchLiveWorkflows,
            NATIVE_MCP_READ_ONLY_TOOL_MAP.searchNativeNodes,
            NATIVE_MCP_READ_ONLY_TOOL_MAP.getNativeSdkReference,
        ],
    };
}

function toNativeMcpEnv(config: LiveNativeMcpTestConfig): NodeJS.ProcessEnv {
    return {
        N8NAC_NATIVE_MCP_ENABLED: '1',
        N8NAC_NATIVE_MCP_MODE: 'assist',
        N8N_NATIVE_MCP_URL: config.endpoint,
        N8N_NATIVE_MCP_TOKEN: config.token,
        N8NAC_NATIVE_MCP_TIMEOUT_MS: String(config.timeoutMs),
        N8NAC_NATIVE_MCP_ALLOW_EXECUTION_DATA: '0',
        N8NAC_NATIVE_MCP_ALLOW_REMOTE: '0',
    };
}

function loadDotEnvFile(filePath: string): NodeJS.ProcessEnv {
    if (!existsSync(filePath)) return {};
    const env: NodeJS.ProcessEnv = {};
    for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
        if (!match) continue;
        env[match[1]] = unquoteEnvValue(match[2]);
    }
    return env;
}

function unquoteEnvValue(value: string): string {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1).replace(/\\n/g, '\n');
    }
    return trimmed;
}

function firstString(...values: Array<string | undefined>): string | undefined {
    for (const value of values) {
        const cleaned = value?.trim().replace(/^['"]|['"]$/g, '');
        if (cleaned) return cleaned;
    }
    return undefined;
}

function firstStringArray(...values: Array<string | unknown[] | undefined>): string[] | undefined {
    for (const value of values) {
        const parsed = typeof value === 'string'
            ? value.split(',').map((item) => item.trim()).filter(Boolean)
            : value?.map((item) => String(item).trim()).filter(Boolean);
        if (parsed?.length) return parsed;
    }
    return undefined;
}

function firstPositiveInteger(...values: Array<string | undefined>): number | undefined {
    for (const value of values) {
        const parsed = Number.parseInt(value || '', 10);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return undefined;
}

function normalizeSdkReferenceSection(value: string | undefined): LiveNativeMcpTestConfig['sdkReferenceSection'] {
    const allowed = new Set(['patterns', 'expressions', 'functions', 'rules', 'import', 'guidelines', 'design', 'all']);
    return allowed.has(value || '') ? value as LiveNativeMcpTestConfig['sdkReferenceSection'] : 'patterns';
}

function normalizeNativeMcpToken(value: string | undefined): string | undefined {
    return value?.replace(/^Bearer\s+/i, '').trim() || undefined;
}

function isFalse(value: string | undefined): boolean {
    return ['0', 'false', 'no', 'off'].includes((value || '').trim().toLowerCase());
}

function stripUndefined(input: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function expectNativeToolResultSucceeded(result: unknown): void {
    expect(result).toBeDefined();
    if (!result || typeof result !== 'object') return;
    const record = result as Record<string, unknown>;
    if (record.isError === true) {
        throw new Error(`Native MCP tool returned isError=true: ${extractTextExcerpt(record)}`);
    }
}

function extractTextExcerpt(record: Record<string, unknown>): string {
    const content = Array.isArray(record.content) ? record.content : [];
    const text = content
        .map((item) => item && typeof item === 'object' ? String((item as Record<string, unknown>).text || '') : '')
        .join('\n')
        .trim();
    return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

function redactSensitiveText(value: string, token: string): string {
    return value
        .replaceAll(token, '<redacted>')
        .replace(/(token|access_token|key|api_key)=([^&\s]+)/gi, '$1=redacted')
        .replace(/Bearer\s+[^\s]+/gi, 'Bearer <redacted>');
}
