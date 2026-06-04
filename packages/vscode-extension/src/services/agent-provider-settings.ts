import type * as vscode from 'vscode';

export type AgentProviderId =
    | 'anthropic'
    | 'openai'
    | 'google'
    | 'mistral'
    | 'openrouter'
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

function normalizeAgentProviderId(provider?: string): AgentProviderId | undefined {
    const normalized = provider?.trim().toLowerCase();
    if (!normalized) return undefined;
    if (normalized === 'claude') return 'anthropic';
    if (normalized === 'anthropic-proxy') return 'anthropic';
    if (normalized === 'gemini') return 'google';
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
