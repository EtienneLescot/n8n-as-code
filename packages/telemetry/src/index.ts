import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';

export type TelemetryFacade = 'cli' | 'vscode' | 'mcp' | 'skills' | 'openclaw' | 'claude' | 'docs' | 'yagr';
export type TelemetryOutcome = 'success' | 'failure' | 'cancelled' | 'skipped';
export type ErrorCategory =
    | 'configuration_error'
    | 'network_error'
    | 'authentication_error'
    | 'authorization_error'
    | 'validation_error'
    | 'conflict_error'
    | 'runtime_unavailable'
    | 'not_found'
    | 'rate_limited'
    | 'timeout'
    | 'unknown_error';

export type TelemetryEventName =
    | 'first_seen'
    | 'product_active'
    | 'setup_started'
    | 'setup_mode_selected'
    | 'setup_completed'
    | 'setup_failed'
    | 'cli_command_completed'
    | 'vscode_extension_activated'
    | 'vscode_command_completed'
    | 'vscode_workflow_view_opened'
    | 'mcp_server_started'
    | 'mcp_tool_called'
    | 'skills_command_completed'
    | 'workflow_listed'
    | 'workflow_pulled'
    | 'workflow_pushed'
    | 'workflow_fetched'
    | 'conflict_detected'
    | 'conflict_resolved'
    | 'workflow_converted'
    | 'workflow_validated'
    | 'ai_context_initialized'
    | 'credential_recipe_listed'
    | 'credential_starter_kit_used'
    | 'credential_tested'
    | 'credential_created'
    | 'workflow_activated'
    | 'workflow_deactivated'
    | 'workflow_execution_listed'
    | 'workflow_execution_inspected'
    | 'openclaw_service_started'
    | 'openclaw_cli_command_completed';

export type TelemetryPropertyValue = string | number | boolean | null | undefined;
export type TelemetryProperties = Record<string, TelemetryPropertyValue>;

export interface TelemetryContext {
    facade: TelemetryFacade;
    version?: string;
    workspaceId?: string;
    sessionId?: string;
    forceDisabled?: boolean;
}

export interface TelemetryStatus {
    enabled: boolean;
    configured: boolean;
    disabledReason?: string;
    configPath: string;
    anonymousId?: string;
    posthogHost: string;
    noticeShownAt?: string;
}

export interface TelemetryClient {
    track(event: TelemetryEventName, properties?: TelemetryProperties): void;
    trackActive(properties?: TelemetryProperties): void;
    withTelemetry<T>(event: TelemetryEventName, properties: TelemetryProperties, operation: () => Promise<T>): Promise<T>;
    flush(timeoutMs?: number): Promise<void>;
    isEnabled(): boolean;
    isConfigured(): boolean;
}

interface TelemetryConfigFile {
    anonymousId?: string;
    createdAt?: string;
    telemetryVersion?: number;
    enabled?: boolean;
    activeByFacade?: Record<string, string>;
    noticeShownAt?: string;
}

interface QueuedEvent {
    event: TelemetryEventName;
    properties: TelemetryProperties;
}

const TELEMETRY_SCHEMA_VERSION = 1;
const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';

const ALLOWED_PROPERTY_KEYS = new Set([
    'activation_source_event',
    'app',
    'archive_filter',
    'command',
    'conflict_count',
    'conflict_detected',
    'credential_type',
    'credential_type_count',
    'custom_nodes_configured',
    'duration_ms',
    'entrypoint',
    'error_category',
    'error_count',
    'execution_status',
    'extension_state',
    'extension_version',
    'facade',
    'format',
    'has_api_key',
    'has_project',
    'has_sync_folder',
    'has_workspace',
    'host_type',
    'include_data',
    'input_format',
    'is_ci',
    'limit',
    'local_only_count',
    'mode',
    'node_major',
    'operation',
    'os',
    'outcome',
    'output_format',
    'package_version',
    'port_configured',
    'remote_only_count',
    'resolution',
    'result_count',
    'session_id',
    'setup_mode',
    'source',
    'status_filter',
    'subcommand',
    'target',
    'telemetry_schema_version',
    'tool_name',
    'tracked_count',
    'transport',
    'valid',
    'vscode_version',
    'warning_count',
    'workflow_count',
    'workflow_state',
    'workspace_initialized',
    'workspace_id',
]);

export function getTelemetryConfigPath(): string {
    const configHome = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config');
    return join(configHome, 'n8n-as-code', 'telemetry.json');
}

function readConfig(path = getTelemetryConfigPath()): TelemetryConfigFile {
    try {
        if (!existsSync(path)) return {};
        return JSON.parse(readFileSync(path, 'utf8')) as TelemetryConfigFile;
    } catch {
        return {};
    }
}

function writeConfig(config: TelemetryConfigFile, path = getTelemetryConfigPath()): void {
    try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    } catch {
        // Telemetry config must never break product behavior.
    }
}

function ensureConfig(): { config: TelemetryConfigFile; created: boolean; path: string } {
    const path = getTelemetryConfigPath();
    const config = readConfig(path);
    let created = false;

    if (!config.anonymousId) {
        config.anonymousId = randomUUID();
        config.createdAt = new Date().toISOString();
        config.telemetryVersion = TELEMETRY_SCHEMA_VERSION;
        created = true;
        writeConfig(config, path);
    }

    return { config, created, path };
}

function getEnvDisabledReason(): string | undefined {
    if (process.env.CI === 'true') return 'ci';
    if (process.env.DO_NOT_TRACK === '1') return 'do_not_track';
    if (process.env.N8NAC_TELEMETRY_DISABLED === '1') return 'environment';

    const raw = process.env.N8NAC_TELEMETRY?.trim().toLowerCase();
    if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') {
        return 'environment';
    }

    return undefined;
}

function normalizeOs(): 'linux' | 'macos' | 'windows' | 'other' {
    const value = platform();
    if (value === 'linux') return 'linux';
    if (value === 'darwin') return 'macos';
    if (value === 'win32') return 'windows';
    return 'other';
}

function getNodeMajor(): number | undefined {
    const [major] = process.versions.node.split('.');
    const parsed = Number.parseInt(major, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function getPostHogKey(): string | undefined {
    return process.env.N8NAC_POSTHOG_KEY?.trim() || process.env.POSTHOG_KEY?.trim() || undefined;
}

function getPostHogHost(): string {
    return (process.env.N8NAC_POSTHOG_HOST?.trim() || process.env.POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST).replace(/\/$/, '');
}

function sanitizeProperties(properties: TelemetryProperties): TelemetryProperties {
    const sanitized: TelemetryProperties = {};

    for (const [key, value] of Object.entries(properties)) {
        if (!ALLOWED_PROPERTY_KEYS.has(key)) continue;
        if (value === undefined) continue;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
            sanitized[key] = value;
        }
    }

    return sanitized;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(undefined), timeoutMs);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            () => {
                clearTimeout(timer);
                resolve(undefined);
            },
        );
    });
}

function debugEvent(event: QueuedEvent): void {
    if (process.env.N8NAC_TELEMETRY_DEBUG !== '1') return;
    try {
        process.stderr.write(`[n8n-as-code telemetry] ${JSON.stringify(event)}\n`);
    } catch {
        // ignore debug logging failures
    }
}

async function sendPostHogEvent(host: string, apiKey: string, distinctId: string, queued: QueuedEvent): Promise<void> {
    await fetch(`${host}/capture/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            api_key: apiKey,
            event: queued.event,
            distinct_id: distinctId,
            properties: queued.properties,
        }),
    });
}

export function classifyTelemetryError(error: unknown): ErrorCategory {
    const anyError = error as any;
    const status = anyError?.response?.status ?? anyError?.status;
    const code = typeof anyError?.code === 'string' ? anyError.code.toLowerCase() : '';
    const message = typeof anyError?.message === 'string' ? anyError.message.toLowerCase() : '';

    if (status === 401 || message.includes('api key') || message.includes('authentication')) return 'authentication_error';
    if (status === 403 || message.includes('forbidden') || message.includes('authorization')) return 'authorization_error';
    if (status === 404 || message.includes('not found')) return 'not_found';
    if (status === 409 || message.includes('conflict') || message.includes('push rejected')) return 'conflict_error';
    if (status === 422 || message.includes('validation') || message.includes('invalid')) return 'validation_error';
    if (status === 429 || message.includes('rate limit')) return 'rate_limited';
    if (code.includes('timeout') || message.includes('timeout') || message.includes('timed out')) return 'timeout';
    if (code.includes('econn') || code.includes('enotfound') || message.includes('network')) return 'network_error';
    if (message.includes('not configured') || message.includes('missing required') || message.includes('configuration')) return 'configuration_error';
    if (message.includes('runtime') || message.includes('docker')) return 'runtime_unavailable';
    return 'unknown_error';
}

export function getTelemetryStatus(context?: Pick<TelemetryContext, 'forceDisabled'>): TelemetryStatus {
    const { config, path } = ensureConfig();
    const envDisabledReason = getEnvDisabledReason();
    const disabledReason = context?.forceDisabled
        ? 'forced_disabled'
        : envDisabledReason ?? (config.enabled === false ? 'user_disabled' : undefined);

    return {
        enabled: !disabledReason,
        configured: Boolean(getPostHogKey()),
        disabledReason,
        configPath: path,
        anonymousId: config.anonymousId,
        posthogHost: getPostHogHost(),
        noticeShownAt: config.noticeShownAt,
    };
}

export function shouldShowTelemetryNotice(context?: Pick<TelemetryContext, 'forceDisabled'>): boolean {
    const { config } = ensureConfig();
    const status = getTelemetryStatus(context);
    return status.enabled && !config.noticeShownAt;
}

export function markTelemetryNoticeShown(): void {
    const { config, path } = ensureConfig();
    if (config.noticeShownAt) return;
    config.noticeShownAt = new Date().toISOString();
    config.telemetryVersion = TELEMETRY_SCHEMA_VERSION;
    writeConfig(config, path);
}

export function setTelemetryEnabled(enabled: boolean): TelemetryStatus {
    const { config, path } = ensureConfig();
    config.enabled = enabled;
    config.telemetryVersion = TELEMETRY_SCHEMA_VERSION;
    writeConfig(config, path);
    return getTelemetryStatus();
}

export function createTelemetryClient(context: TelemetryContext): TelemetryClient {
    const { config, created, path } = ensureConfig();
    const sessionId = context.sessionId ?? randomUUID();
    const posthogHost = getPostHogHost();
    const posthogKey = getPostHogKey();
    const status = getTelemetryStatus({ forceDisabled: context.forceDisabled });
    const queue: QueuedEvent[] = [];

    const baseProperties = (): TelemetryProperties => ({
        app: 'n8n-as-code',
        facade: context.facade,
        telemetry_schema_version: TELEMETRY_SCHEMA_VERSION,
        package_version: context.version,
        session_id: sessionId,
        workspace_id: context.workspaceId,
        os: normalizeOs(),
        node_major: getNodeMajor(),
        is_ci: process.env.CI === 'true',
    });

    const enqueue = (event: TelemetryEventName, properties: TelemetryProperties = {}): void => {
        if (!status.enabled) return;

        const queued: QueuedEvent = {
            event,
            properties: sanitizeProperties({ ...baseProperties(), ...properties }),
        };
        debugEvent(queued);
        queue.push(queued);
    };

    const client: TelemetryClient = {
        track(event, properties = {}) {
            enqueue(event, properties);
        },

        trackActive(properties = {}) {
            if (!status.enabled) return;
            const today = new Date().toISOString().slice(0, 10);
            const activeByFacade = config.activeByFacade ?? {};
            if (activeByFacade[context.facade] === today) return;

            activeByFacade[context.facade] = today;
            config.activeByFacade = activeByFacade;
            writeConfig(config, path);
            enqueue('product_active', properties);
        },

        async withTelemetry(event, properties, operation) {
            const startedAt = Date.now();
            try {
                const result = await operation();
                enqueue(event, { ...properties, outcome: 'success', duration_ms: Date.now() - startedAt });
                return result;
            } catch (error) {
                enqueue(event, {
                    ...properties,
                    outcome: 'failure',
                    duration_ms: Date.now() - startedAt,
                    error_category: classifyTelemetryError(error),
                });
                throw error;
            }
        },

        async flush(timeoutMs = 500) {
            if (!status.enabled || !posthogKey || queue.length === 0) return;

            const pending = queue.splice(0, queue.length);
            await withTimeout(Promise.all(pending.map((event) => sendPostHogEvent(posthogHost, posthogKey, config.anonymousId!, event))).then(() => undefined), timeoutMs);
        },

        isEnabled() {
            return status.enabled;
        },

        isConfigured() {
            return Boolean(posthogKey);
        },
    };

    if (created) {
        enqueue('first_seen');
    }

    return client;
}
