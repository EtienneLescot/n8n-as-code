import { ConfigService } from 'n8nac';

export type NativeMcpMode = 'off' | 'assist' | 'direct';

export interface NativeMcpConfig {
    enabled: boolean;
    mode: NativeMcpMode;
    endpoint?: string;
    token?: string;
    timeoutMs: number;
    protocolVersion: string;
    allowMutations: boolean;
    allowPublish: boolean;
    allowDestructive: boolean;
    allowRemoteExposure: boolean;
    allowExecutionData: boolean;
    requireSyncBack: boolean;
}

export interface RedactedNativeMcpConfig {
    enabled: boolean;
    configured: boolean;
    mode: NativeMcpMode;
    endpoint?: string;
    tokenConfigured: boolean;
    timeoutMs: number;
    protocolVersion: string;
    policy: {
        allowMutations: boolean;
        allowPublish: boolean;
        allowDestructive: boolean;
        allowRemoteExposure: boolean;
        allowExecutionData: boolean;
        requireSyncBack: boolean;
    };
}

export interface NativeMcpWorkspaceConfigInput {
    enabled?: boolean;
    url?: string;
    mode?: 'assist' | 'direct';
    timeoutMs?: number;
    allowRemoteExposure?: boolean;
    allowExecutionData?: boolean;
    requireSyncBack?: boolean;
    token?: string;
    defaultEndpoint?: string;
}

export interface LoadNativeMcpConfigOptions {
    cwd?: string;
    environmentNameOrId?: string;
    workspace?: NativeMcpWorkspaceConfigInput;
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

function clean(value: string | undefined): string | undefined {
    const trimmed = value?.trim().replace(/^['"]|['"]$/g, '');
    return trimmed || undefined;
}

function hasEnvValue(value: string | undefined): boolean {
    return clean(value) !== undefined;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
    const cleaned = clean(value)?.toLowerCase();
    if (!cleaned) return defaultValue;
    if (TRUE_VALUES.has(cleaned)) return true;
    if (FALSE_VALUES.has(cleaned)) return false;
    return defaultValue;
}

function parsePositiveInteger(value: string | undefined, defaultValue: number): number {
    const parsed = Number.parseInt(clean(value) || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parseMode(value: string | undefined, enabled: boolean, defaultMode: NativeMcpMode = 'assist'): NativeMcpMode {
    if (!enabled) return 'off';
    const cleaned = clean(value)?.toLowerCase();
    if (cleaned === 'direct') return 'direct';
    if (cleaned === 'assist') return 'assist';
    return defaultMode === 'direct' ? 'direct' : 'assist';
}

function defaultEndpointFromHost(host: string | undefined): string | undefined {
    const cleaned = clean(host);
    if (!cleaned) return undefined;
    return `${cleaned.replace(/\/+$/g, '')}/mcp-server/http`;
}

function resolveWorkspaceNativeMcpConfig(env: NodeJS.ProcessEnv, options: LoadNativeMcpConfigOptions = {}): NativeMcpWorkspaceConfigInput | undefined {
    if (options.workspace) return options.workspace;
    try {
        const configService = new ConfigService(options.cwd);
        const resolved = configService.resolveEnvironment(options.environmentNameOrId || clean(env.N8NAC_ENVIRONMENT));
        const nativeMcp = (resolved.environment as { nativeMcp?: NativeMcpWorkspaceConfigInput }).nativeMcp;
        if (!nativeMcp) return undefined;
        return {
            ...nativeMcp,
            token: (configService as ConfigService & { getNativeMcpToken?: (environmentNameOrId?: string) => string | undefined }).getNativeMcpToken?.(resolved.environmentId),
            defaultEndpoint: defaultEndpointFromHost(resolved.host),
        };
    } catch {
        return undefined;
    }
}

function redactEndpoint(endpoint: string | undefined): string | undefined {
    if (!endpoint) return undefined;
    try {
        const url = new URL(endpoint);
        if (url.username) url.username = 'redacted';
        if (url.password) url.password = 'redacted';
        if (url.search) url.search = '?redacted';
        return url.toString();
    } catch {
        return endpoint.replace(/(token|access_token|key|api_key)=([^&]+)/gi, '$1=redacted');
    }
}

export function loadNativeMcpConfig(env: NodeJS.ProcessEnv = process.env, options: LoadNativeMcpConfigOptions = {}): NativeMcpConfig {
    const workspace = resolveWorkspaceNativeMcpConfig(env, options);
    const endpoint = clean(env.N8N_NATIVE_MCP_URL) || clean(env.N8NAC_NATIVE_MCP_URL) || clean(workspace?.url) || clean(workspace?.defaultEndpoint);
    const token = clean(env.N8N_NATIVE_MCP_TOKEN) || clean(env.N8NAC_NATIVE_MCP_TOKEN) || clean(workspace?.token);
    const workspaceEnabled = workspace ? (workspace.enabled === false ? false : Boolean(workspace.enabled || workspace.url)) : false;
    const enabled = hasEnvValue(env.N8NAC_NATIVE_MCP_ENABLED)
        ? parseBoolean(env.N8NAC_NATIVE_MCP_ENABLED, false)
        : workspaceEnabled;
    const workspaceMode = workspace?.mode === 'direct' ? 'direct' : workspace?.mode === 'assist' ? 'assist' : 'assist';

    return {
        enabled,
        mode: parseMode(env.N8NAC_NATIVE_MCP_MODE, enabled, workspaceMode),
        endpoint,
        token,
        timeoutMs: parsePositiveInteger(env.N8NAC_NATIVE_MCP_TIMEOUT_MS, workspace?.timeoutMs || 30_000),
        protocolVersion: clean(env.N8NAC_NATIVE_MCP_PROTOCOL_VERSION) || '2025-06-18',
        allowMutations: parseBoolean(env.N8NAC_NATIVE_MCP_ALLOW_MUTATIONS, false),
        allowPublish: parseBoolean(env.N8NAC_NATIVE_MCP_ALLOW_PUBLISH, false),
        allowDestructive: parseBoolean(env.N8NAC_NATIVE_MCP_ALLOW_DESTRUCTIVE, false),
        allowRemoteExposure: parseBoolean(env.N8NAC_NATIVE_MCP_ALLOW_REMOTE, workspace?.allowRemoteExposure ?? false),
        allowExecutionData: parseBoolean(env.N8NAC_NATIVE_MCP_ALLOW_EXECUTION_DATA, workspace?.allowExecutionData ?? false),
        requireSyncBack: parseBoolean(env.N8NAC_NATIVE_MCP_REQUIRE_SYNC_BACK, workspace?.requireSyncBack ?? true),
    };
}

export function redactNativeMcpConfig(config: NativeMcpConfig): RedactedNativeMcpConfig {
    return {
        enabled: config.enabled,
        configured: Boolean(config.endpoint),
        mode: config.mode,
        endpoint: redactEndpoint(config.endpoint),
        tokenConfigured: Boolean(config.token),
        timeoutMs: config.timeoutMs,
        protocolVersion: config.protocolVersion,
        policy: {
            allowMutations: config.allowMutations,
            allowPublish: config.allowPublish,
            allowDestructive: config.allowDestructive,
            allowRemoteExposure: config.allowRemoteExposure,
            allowExecutionData: config.allowExecutionData,
            requireSyncBack: config.requireSyncBack,
        },
    };
}
