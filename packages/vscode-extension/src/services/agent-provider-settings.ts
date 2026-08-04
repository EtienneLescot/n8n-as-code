import type * as vscode from 'vscode';

export type AgentProviderId =
    | 'anthropic'
    | 'openai'
    | 'google'
    | 'mistral'
    | 'openrouter'
    | 'atlascloud'
    | 'openai-oauth'
    | 'copilot-proxy'
    | 'minimax'
    | 'minimax-token-plan'
    | 'openai-compatible';

export type AgentProviderReasoningEffortSetting = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

const AGENT_PROVIDER_IDS = new Set<AgentProviderId>([
    'anthropic',
    'openai',
    'google',
    'mistral',
    'openrouter',
    'atlascloud',
    'openai-oauth',
    'copilot-proxy',
    'minimax',
    'minimax-token-plan',
    'openai-compatible',
]);
const AGENT_REASONING_EFFORT_SETTINGS: readonly AgentProviderReasoningEffortSetting[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

const SELECTED_PROVIDER_STATE_KEY = 'n8n.agent.provider';
const SELECTED_MODEL_STATE_KEY = 'n8n.agent.model';
const BASE_URL_STATE_KEY = 'n8n.agent.baseUrl';
const REASONING_EFFORT_STATE_KEY = 'n8n.agent.reasoningEffort';
const MANAGED_SETTINGS_STATE_KEY = 'n8n.agent.settingsManaged';
export const DISABLED_PROVIDERS_STATE_KEY = 'n8n.agent.disabledProviders';
export const ATLAS_CLOUD_DEFAULT_BASE_URL = 'https://api.atlascloud.ai/v1';
export const ATLAS_CLOUD_MODEL_CATALOG_URL = 'https://api.atlascloud.ai/api/v1/models';

export const AGENT_PROVIDER_ENV_KEYS: Record<AgentProviderId, readonly string[]> = {
    anthropic: ['ANTHROPIC_LLM_API_KEY', 'ANTHROPIC_API_KEY'],
    openai: ['OPENAI_LLM_API_KEY', 'OPENAI_API_KEY'],
    google: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_LLM_API_KEY', 'GOOGLE_LLM_API_KEY'],
    mistral: ['MISTRAL_API_KEY', 'MISTRAL_LLM_API_KEY'],
    openrouter: ['OPENROUTER_API_KEY', 'OPENROUTER_LLM_API_KEY'],
    atlascloud: ['ATLASCLOUD_API_KEY', 'ATLAS_CLOUD_API_KEY'],
    'openai-oauth': [],
    'copilot-proxy': ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'],
    minimax: ['MINIMAX_API_KEY'],
    'minimax-token-plan': ['MINIMAX_TOKEN_PLAN_API_KEY'],
    'openai-compatible': ['OPENAI_COMPATIBLE_API_KEY'],
};

export const AGENT_PROVIDER_BASE_URL_ENV_KEYS: Partial<Record<AgentProviderId, readonly string[]>> = {
    atlascloud: ['ATLASCLOUD_BASE_URL', 'ATLAS_CLOUD_BASE_URL', 'ATLASCLOUD_API_BASE', 'ATLAS_CLOUD_API_BASE'],
};

export interface AgentProviderSettings {
    provider: AgentProviderId;
    model?: string;
    baseUrl?: string;
    reasoningEffort?: AgentProviderReasoningEffortSetting;
}

type LegacyConfiguration = {
    get<T>(key: string): T | undefined;
};

const EMPTY_LEGACY_CONFIGURATION: LegacyConfiguration = {
    get: () => undefined,
};

export function readAgentProviderSettings(state: vscode.Memento): AgentProviderSettings {
    const legacyConfig = getLegacyAgentConfiguration();
    const legacyProvider = readOptionalString(legacyConfig.get<string>('provider'));
    const useManagedSettings = state.get<boolean>(MANAGED_SETTINGS_STATE_KEY) === true || !legacyProvider;
    const provider = normalizeAgentProviderId(useManagedSettings
        ? readPersistedString(state, SELECTED_PROVIDER_STATE_KEY, legacyProvider)
        : legacyProvider) || 'openai';
    const model = (useManagedSettings
        ? readPersistedString(state, SELECTED_MODEL_STATE_KEY, legacyConfig.get<string>('model'))
        : readOptionalString(legacyConfig.get<string>('model'))) || undefined;
    const baseUrl = (useManagedSettings
        ? readPersistedString(state, BASE_URL_STATE_KEY, legacyConfig.get<string>('baseUrl'))
        : readOptionalString(legacyConfig.get<string>('baseUrl'))) || undefined;
    const reasoningValue = useManagedSettings
        ? readPersistedString(state, REASONING_EFFORT_STATE_KEY, legacyConfig.get<string>('reasoningEffort'))
        : readOptionalString(legacyConfig.get<string>('reasoningEffort'));
    const reasoningEffort = AGENT_REASONING_EFFORT_SETTINGS.includes(reasoningValue as AgentProviderReasoningEffortSetting)
        ? reasoningValue as AgentProviderReasoningEffortSetting
        : undefined;
    return { provider, model, baseUrl, reasoningEffort };
}

function getLegacyAgentConfiguration(): LegacyConfiguration {
    const runtimeRequire = typeof require === 'function' ? require : undefined;
    if (!runtimeRequire) return EMPTY_LEGACY_CONFIGURATION;
    try {
        const vscodeModule = runtimeRequire('vscode') as { workspace?: { getConfiguration(section: string): LegacyConfiguration } };
        return vscodeModule.workspace?.getConfiguration('n8n.agent') || EMPTY_LEGACY_CONFIGURATION;
    } catch {
        return EMPTY_LEGACY_CONFIGURATION;
    }
}

export function normalizeAgentProviderId(provider?: string): AgentProviderId | undefined {
    const normalized = provider?.trim().toLowerCase();
    if (!normalized) return undefined;
    if (normalized === 'claude') return 'anthropic';
    if (normalized === 'anthropic-proxy') return 'anthropic';
    if (normalized === 'gemini') return 'google';
    if (normalized === 'atlas' || normalized === 'atlas-cloud') return 'atlascloud';
    return AGENT_PROVIDER_IDS.has(normalized as AgentProviderId) ? normalized as AgentProviderId : undefined;
}

export async function updateAgentProviderSettings(state: vscode.Memento, patch: Partial<AgentProviderSettings>): Promise<void> {
    await state.update(MANAGED_SETTINGS_STATE_KEY, true);
    if ('provider' in patch) await state.update(SELECTED_PROVIDER_STATE_KEY, patch.provider);
    if ('model' in patch) await state.update(SELECTED_MODEL_STATE_KEY, patch.model || undefined);
    if ('baseUrl' in patch) await state.update(BASE_URL_STATE_KEY, patch.baseUrl || undefined);
    if ('reasoningEffort' in patch) await state.update(REASONING_EFFORT_STATE_KEY, patch.reasoningEffort || undefined);
}

function readPersistedString(state: vscode.Memento, key: string, legacyValue: unknown): string {
    const value = state.get<string>(key);
    return readOptionalString(value ?? legacyValue);
}

function readOptionalString(value: unknown): string {
    return String(value ?? '').trim();
}

export function readFirstEnvironmentValue(keys: readonly string[]): string | undefined {
    for (const key of keys) {
        const value = process.env[key]?.trim();
        if (value) return value.replace(/\/$/, '');
    }
    return undefined;
}

export function readAgentProviderEnvironmentSecret(state: vscode.Memento, provider: string): string | undefined {
    const normalizedProvider = normalizeAgentProviderId(provider);
    if (!normalizedProvider) return undefined;
    const disabledProviders = state.get<string[]>(DISABLED_PROVIDERS_STATE_KEY, [])
        .map((disabledProvider) => normalizeAgentProviderId(disabledProvider));
    if (disabledProviders.includes(normalizedProvider)) return undefined;
    for (const key of AGENT_PROVIDER_ENV_KEYS[normalizedProvider]) {
        const value = process.env[key]?.trim();
        if (value) return value;
    }
    return undefined;
}

export function getAtlasCloudModelCatalogUrl(baseUrl?: string): string {
    try {
        const parsed = new URL(baseUrl || ATLAS_CLOUD_DEFAULT_BASE_URL);
        return `${parsed.origin}/api/v1/models`;
    } catch {
        return ATLAS_CLOUD_MODEL_CATALOG_URL;
    }
}

export function mapAtlasCloudTextModels(payload: Record<string, unknown>): string[] {
    const data = Array.isArray(payload.data) ? payload.data : [];
    return [...new Set(data
        .filter((entry) => entry && typeof entry === 'object')
        .filter((entry) => String((entry as Record<string, unknown>).type || '').toLowerCase() === 'text')
        .map((entry) => String((entry as Record<string, unknown>).model || (entry as Record<string, unknown>).id || '').trim())
        .filter(Boolean))]
        .sort((left, right) => left.localeCompare(right));
}
