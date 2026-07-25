import * as vscode from 'vscode';
import { getAgentProviderSecretKey } from './agent-runtime-controller.js';
import { fetchGitHubCopilotModels } from './agent-provider-runtime/copilot-account.js';
import {
    AGENT_PROVIDER_BASE_URL_ENV_KEYS,
    AGENT_PROVIDER_ENV_KEYS,
    ATLAS_CLOUD_DEFAULT_BASE_URL,
    DISABLED_PROVIDERS_STATE_KEY,
    getAtlasCloudModelCatalogUrl,
    mapAtlasCloudTextModels,
    readAgentProviderSettings,
    readFirstEnvironmentValue,
    updateAgentProviderSettings,
} from './agent-provider-settings.js';
import { getReasoningCapability, normalizeReasoningEffortForCapability, type AgentReasoningEffort } from './agent-provider-capabilities.js';

export { AGENT_REASONING_EFFORTS } from './agent-provider-capabilities.js';

export type AgentModelProvider =
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

export type ProviderAuthKind = 'api-key' | 'oauth-device' | 'setup-token' | 'none';

export type AgentProviderReasoningEffort = AgentReasoningEffort;

export interface AgentProviderDefinition {
    id: AgentModelProvider;
    label: string;
    description: string;
    defaultModel: string;
    defaultBaseUrl?: string;
    baseUrlEnvKeys?: string[];
    requiresApiKey: boolean;
    authKind: ProviderAuthKind;
    envKeys: string[];
    canDiscoverModels: boolean;
}

export interface AgentProviderConnectionState {
    id: AgentModelProvider;
    label: string;
    description: string;
    authKind: ProviderAuthKind;
    defaultModel: string;
    defaultBaseUrl?: string;
    requiresApiKey: boolean;
    connected: boolean;
    credentialSource?: 'secret' | 'environment';
    selected: boolean;
    model?: string;
    baseUrl?: string;
    supportsReasoningEffort?: boolean;
    reasoningEffort?: AgentProviderReasoningEffort;
}

type DeviceChallenge = {
    verificationUri: string;
    userCode: string;
    deviceCode?: string;
    deviceAuthId?: string;
    intervalMs: number;
    expiresAt: number;
};

const OPENAI_CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OPENAI_CODEX_DEVICE_REDIRECT_URI = 'https://auth.openai.com/deviceauth/callback';
const MINIMAX_DISCOVERY_CANDIDATE_MODELS = [
    'MiniMax-M2.7',
    'MiniMax-M2.7-highspeed',
    'MiniMax-M2.5',
    'MiniMax-M2.5-highspeed',
    'MiniMax-M2.1',
    'MiniMax-M2.1-highspeed',
    'MiniMax-M2',
] as const;
const PROVIDERS_WITH_PUBLIC_MODEL_CATALOG = new Set<AgentModelProvider>(['atlascloud']);

const MODEL_LIST_MAPPER = (payload: Record<string, unknown>): string[] => {
    const data = Array.isArray(payload.data) ? payload.data : [];
    return data
        .map((entry) => (entry && typeof entry === 'object' ? String((entry as Record<string, unknown>).id || '').trim() : ''))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right));
};

export const AGENT_PROVIDER_DEFINITIONS: Record<AgentModelProvider, AgentProviderDefinition> = {
    anthropic: {
        id: 'anthropic',
        label: 'Claude API',
        description: 'ANTHROPIC_API_KEY',
        defaultModel: 'claude-haiku-4-5',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: [...AGENT_PROVIDER_ENV_KEYS.anthropic],
        canDiscoverModels: true,
    },
    openai: {
        id: 'openai',
        label: 'OpenAI API',
        description: 'OPENAI_API_KEY',
        defaultModel: 'gpt-4o',
        defaultBaseUrl: 'https://api.openai.com/v1',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: [...AGENT_PROVIDER_ENV_KEYS.openai],
        canDiscoverModels: true,
    },
    google: {
        id: 'google',
        label: 'Gemini API',
        description: 'GOOGLE_GENERATIVE_AI_API_KEY',
        defaultModel: 'gemini-3-flash-preview',
        defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: [...AGENT_PROVIDER_ENV_KEYS.google],
        canDiscoverModels: true,
    },
    mistral: {
        id: 'mistral',
        label: 'Mistral API',
        description: 'MISTRAL_API_KEY',
        defaultModel: 'mistral-large-latest',
        defaultBaseUrl: 'https://api.mistral.ai/v1',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: [...AGENT_PROVIDER_ENV_KEYS.mistral],
        canDiscoverModels: true,
    },
    openrouter: {
        id: 'openrouter',
        label: 'OpenRouter API',
        description: 'OPENROUTER_API_KEY',
        defaultModel: 'anthropic/claude-3.5-sonnet',
        defaultBaseUrl: 'https://openrouter.ai/api/v1',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: [...AGENT_PROVIDER_ENV_KEYS.openrouter],
        canDiscoverModels: true,
    },
    atlascloud: {
        id: 'atlascloud',
        label: 'Atlas Cloud',
        description: 'ATLASCLOUD_API_KEY',
        defaultModel: 'deepseek-ai/deepseek-v4-pro',
        defaultBaseUrl: ATLAS_CLOUD_DEFAULT_BASE_URL,
        baseUrlEnvKeys: [...(AGENT_PROVIDER_BASE_URL_ENV_KEYS.atlascloud ?? [])],
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: [...AGENT_PROVIDER_ENV_KEYS.atlascloud],
        canDiscoverModels: true,
    },
    'openai-oauth': {
        id: 'openai-oauth',
        label: 'OpenAI ChatGPT OAuth',
        description: 'ChatGPT subscription, device flow',
        defaultModel: 'gpt-5.4',
        defaultBaseUrl: 'https://chatgpt.com/backend-api',
        requiresApiKey: false,
        authKind: 'oauth-device',
        envKeys: [...AGENT_PROVIDER_ENV_KEYS['openai-oauth']],
        canDiscoverModels: true,
    },
    'copilot-proxy': {
        id: 'copilot-proxy',
        label: 'GitHub Copilot OAuth',
        description: 'GitHub Copilot subscription, device flow',
        defaultModel: 'gpt-4.1',
        defaultBaseUrl: 'https://api.individual.githubcopilot.com',
        requiresApiKey: false,
        authKind: 'oauth-device',
        envKeys: [...AGENT_PROVIDER_ENV_KEYS['copilot-proxy']],
        canDiscoverModels: true,
    },
    minimax: {
        id: 'minimax',
        label: 'MiniMax API',
        description: 'MINIMAX_API_KEY',
        defaultModel: 'MiniMax-M2.7',
        defaultBaseUrl: 'https://api.minimax.io/anthropic',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: [...AGENT_PROVIDER_ENV_KEYS.minimax],
        canDiscoverModels: true,
    },
    'minimax-token-plan': {
        id: 'minimax-token-plan',
        label: 'MiniMax Token Plan',
        description: 'MINIMAX_TOKEN_PLAN_API_KEY',
        defaultModel: 'MiniMax-M2.7',
        defaultBaseUrl: 'https://api.minimax.io/anthropic',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: [...AGENT_PROVIDER_ENV_KEYS['minimax-token-plan']],
        canDiscoverModels: true,
    },
    'openai-compatible': {
        id: 'openai-compatible',
        label: 'OpenAI Compatible',
        description: 'Custom base URL',
        defaultModel: '',
        requiresApiKey: false,
        authKind: 'api-key',
        envKeys: [...AGENT_PROVIDER_ENV_KEYS['openai-compatible']],
        canDiscoverModels: true,
    },
};

export const AGENT_SELECTABLE_PROVIDERS = Object.freeze(Object.keys(AGENT_PROVIDER_DEFINITIONS) as AgentModelProvider[]);

export function normalizeAgentProviderId(provider?: string): AgentModelProvider | undefined {
    const normalized = provider?.trim().toLowerCase();
    if (!normalized) return undefined;
    if (normalized === 'claude') return 'anthropic';
    if (normalized === 'anthropic-proxy') return 'anthropic';
    if (normalized === 'gemini') return 'google';
    if (normalized === 'atlas' || normalized === 'atlas-cloud') return 'atlascloud';
    return normalized in AGENT_PROVIDER_DEFINITIONS ? normalized as AgentModelProvider : undefined;
}

export function providerNeedsBaseUrlInput(provider: AgentModelProvider): boolean {
    return provider === 'openai-compatible';
}

export function providerSupportsReasoningEffort(provider: AgentModelProvider, model?: string): boolean {
    return getReasoningCapability(provider, model).supported;
}

export class AgentProviderService {
    constructor(private readonly context: vscode.ExtensionContext) {}

    getDefinition(provider: string): AgentProviderDefinition {
        return AGENT_PROVIDER_DEFINITIONS[normalizeAgentProviderId(provider) || 'openai'];
    }

    async getStoredCredential(provider: AgentModelProvider): Promise<string | undefined> {
        return this.context.secrets.get(getAgentProviderSecretKey(provider));
    }

    async listProviderConnectionStates(): Promise<AgentProviderConnectionState[]> {
        const settings = readAgentProviderSettings(this.context.globalState);
        const selectedProvider = settings.provider;
        const selectedModel = settings.model;
        const configuredBaseUrl = settings.baseUrl;
        const selectedReasoningEffort = settings.reasoningEffort;
        const disabledProviders = this.getDisabledProviders();
        const states = await Promise.all(AGENT_SELECTABLE_PROVIDERS.map(async (provider) => {
            const definition = AGENT_PROVIDER_DEFINITIONS[provider];
            const hasStoredCredential = Boolean(await this.getStoredCredential(provider));
            const providerDisabled = disabledProviders.has(provider);
            const hasEnvironmentCredential = !providerDisabled && this.hasEnvironmentCredential(provider);
            const connected = !providerDisabled && (hasStoredCredential || hasEnvironmentCredential);
            return {
                id: provider,
                label: definition.label,
                description: definition.description,
                authKind: definition.authKind,
                defaultModel: definition.defaultModel,
                defaultBaseUrl: definition.defaultBaseUrl,
                requiresApiKey: definition.requiresApiKey,
                connected,
                credentialSource: hasStoredCredential ? 'secret' as const : hasEnvironmentCredential ? 'environment' as const : undefined,
                selected: provider === selectedProvider,
                model: provider === selectedProvider ? selectedModel : undefined,
                baseUrl: provider === 'openai-compatible' ? configuredBaseUrl : this.readEnvironmentBaseUrl(provider) || definition.defaultBaseUrl,
                supportsReasoningEffort: providerSupportsReasoningEffort(provider, provider === selectedProvider ? selectedModel : definition.defaultModel),
                reasoningEffort: provider === selectedProvider && providerSupportsReasoningEffort(provider, selectedModel) ? selectedReasoningEffort : undefined,
            };
        }));
        return states;
    }

    async disconnectProvider(provider: AgentModelProvider): Promise<void> {
        await this.context.secrets.delete(getAgentProviderSecretKey(provider));
        await this.setProviderDisabled(provider, true);
        const selectedProvider = readAgentProviderSettings(this.context.globalState).provider;
        if (selectedProvider === provider) {
            await updateAgentProviderSettings(this.context.globalState, {
                provider: 'openai',
                model: AGENT_PROVIDER_DEFINITIONS.openai.defaultModel,
                baseUrl: undefined,
                reasoningEffort: undefined,
            });
        }
    }

    hasEnvironmentCredential(provider: AgentModelProvider): boolean {
        return AGENT_PROVIDER_DEFINITIONS[provider].envKeys.some((key) => Boolean(process.env[key]?.trim()));
    }

    async setupProvider(provider: AgentModelProvider): Promise<boolean> {
        const definition = AGENT_PROVIDER_DEFINITIONS[provider];
        const settings = readAgentProviderSettings(this.context.globalState);
        const previousProvider = settings.provider;
        await this.setProviderDisabled(provider, false);
        let nextBaseUrl: string | undefined;

        if (providerNeedsBaseUrlInput(provider)) {
            const baseUrl = await vscode.window.showInputBox({
                title: 'OpenAI-compatible base URL',
                prompt: 'Only OpenAI-compatible providers allow a custom base URL.',
                value: settings.baseUrl || '',
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value.trim()) return 'Base URL is required for OpenAI-compatible providers.';
                    try { new URL(value.trim()); return undefined; } catch { return 'Enter a valid URL.'; }
                },
            });
            if (baseUrl === undefined) return false;
            nextBaseUrl = baseUrl.trim().replace(/\/$/, '');
        }

        if (definition.authKind === 'api-key') {
            const apiKey = await vscode.window.showInputBox({
                title: `Set ${definition.label} API key`,
                prompt: 'Stored in VS Code Secret Storage. Leave empty to clear the stored key and rely on environment credentials if available.',
                password: true,
                ignoreFocusOut: true,
            });
            if (apiKey === undefined) return false;
            const trimmed = apiKey.trim();
            if (trimmed) {
                await this.context.secrets.store(getAgentProviderSecretKey(provider), trimmed);
            } else {
                await this.context.secrets.delete(getAgentProviderSecretKey(provider));
            }
        } else if (definition.authKind === 'setup-token') {
            const token = await vscode.window.showInputBox({
                title: 'Connect Claude account',
                prompt: 'Run `claude setup-token` in a logged-in Claude CLI, then paste the generated setup-token.',
                password: true,
                ignoreFocusOut: true,
            });
            if (token === undefined) return false;
            if (token.trim()) await this.context.secrets.store(getAgentProviderSecretKey(provider), token.trim());
        } else if (definition.authKind === 'oauth-device') {
            await this.runDeviceFlow(provider);
        }

        const currentModel = settings.model;
        await updateAgentProviderSettings(this.context.globalState, {
            provider,
            baseUrl: nextBaseUrl,
            model: !currentModel || previousProvider !== provider ? definition.defaultModel : currentModel,
        });
        return true;
    }

    async selectModel(provider: AgentModelProvider): Promise<string | undefined> {
        const definition = AGENT_PROVIDER_DEFINITIONS[provider];
        const models = await this.fetchAvailableModels(provider).catch(() => []);
        const currentModel = readAgentProviderSettings(this.context.globalState).model || definition.defaultModel;
        const items = [...new Set([...(models.length ? models : []), definition.defaultModel, currentModel].filter(Boolean))]
            .map((model) => ({ label: model, picked: model === currentModel }));

        const picked = await vscode.window.showQuickPick(items, {
            title: `Select ${definition.label} model`,
            placeHolder: models.length ? 'Live model list from provider' : 'Live model list unavailable; using known defaults',
            ignoreFocusOut: true,
        });
        if (!picked) return undefined;
        await updateAgentProviderSettings(this.context.globalState, { provider, model: picked.label });
        await this.syncReasoningEffortConfiguration(provider, picked.label);
        return picked.label;
    }

    async selectReasoningEffort(provider: AgentModelProvider, model?: string): Promise<AgentProviderReasoningEffort | undefined> {
        if (!providerSupportsReasoningEffort(provider, model)) {
            await updateAgentProviderSettings(this.context.globalState, { reasoningEffort: undefined });
            return undefined;
        }

        const settings = readAgentProviderSettings(this.context.globalState);
        const capability = getReasoningCapability(provider, model || settings.model || '');
        const defaultReasoningEffort = this.getDefaultReasoningEffort(provider, model || settings.model || '');
        const current = normalizeReasoningEffortForCapability(settings.reasoningEffort, capability) || defaultReasoningEffort;
        const picked = await vscode.window.showQuickPick(
            capability.efforts.map((effort) => ({
                label: effort,
                picked: effort === current,
                description: effort === defaultReasoningEffort ? 'Provider default' : undefined,
            })),
            {
                title: 'Select reasoning effort',
                placeHolder: 'Controls provider-specific reasoning or thinking budget when supported.',
                ignoreFocusOut: true,
            },
        );
        if (!picked) return current;
        await updateAgentProviderSettings(this.context.globalState, { reasoningEffort: picked.label as AgentProviderReasoningEffort });
        return picked.label as AgentProviderReasoningEffort;
    }

    async syncReasoningEffortConfiguration(provider: AgentModelProvider, model?: string): Promise<AgentProviderReasoningEffort | undefined> {
        if (!providerSupportsReasoningEffort(provider, model)) {
            await updateAgentProviderSettings(this.context.globalState, { reasoningEffort: undefined });
            return undefined;
        }

        const settings = readAgentProviderSettings(this.context.globalState);
        const capability = getReasoningCapability(provider, model || settings.model || '');
        const current = normalizeReasoningEffortForCapability(settings.reasoningEffort, capability);
        const defaultReasoningEffort = this.getDefaultReasoningEffort(provider, model || settings.model || '');
        const next = current || defaultReasoningEffort;
        await updateAgentProviderSettings(this.context.globalState, { reasoningEffort: next });
        return next;
    }

    async fetchAvailableModels(provider: AgentModelProvider): Promise<string[]> {
        const definition = AGENT_PROVIDER_DEFINITIONS[provider];
        if (!definition.canDiscoverModels) return [];
        if (this.getDisabledProviders().has(provider)) return [];
        const apiKey = await this.getStoredCredential(provider) || this.readEnvironmentCredential(provider);
        const configuredBaseUrl = readAgentProviderSettings(this.context.globalState).baseUrl || '';
        const baseUrl = this.resolveProviderBaseUrl(provider, configuredBaseUrl);

        if (!PROVIDERS_WITH_PUBLIC_MODEL_CATALOG.has(provider) && (definition.requiresApiKey || provider !== 'openai-compatible') && !apiKey && definition.authKind !== 'none') {
            return [];
        }

        if (provider === 'anthropic') {
            return this.fetchJsonModels('https://api.anthropic.com/v1/models', { 'x-api-key': apiKey || '', 'anthropic-version': '2023-06-01' });
        }
        if (provider === 'google') {
            return (await this.fetchJsonModels('https://generativelanguage.googleapis.com/v1beta/openai/models', { Authorization: `Bearer ${apiKey}` }))
                .map((model) => model.replace(/^models\//, ''))
                .filter((model) => /^gemini-/i.test(model));
        }
        if (provider === 'openai-oauth') {
            return this.fetchOpenAiOauthModels(apiKey || '');
        }
        if (provider === 'copilot-proxy') {
            return fetchGitHubCopilotModels(apiKey || '');
        }
        if (provider === 'minimax' || provider === 'minimax-token-plan') {
            return this.probeMiniMaxModels(apiKey || '', baseUrl || definition.defaultBaseUrl);
        }
        if (provider === 'atlascloud') {
            return this.fetchAtlasCloudModels(baseUrl, apiKey);
        }

        const modelsUrl = provider === 'openai-compatible'
            ? (baseUrl ? `${baseUrl.replace(/\/$/, '')}/models` : undefined)
            : `${(baseUrl || '').replace(/\/$/, '')}/models`;
        if (!modelsUrl) return [];
        return this.fetchJsonModels(modelsUrl, apiKey ? { Authorization: `Bearer ${apiKey}` } : {});
    }

    private async fetchAtlasCloudModels(baseUrl?: string, apiKey?: string): Promise<string[]> {
        const response = await fetch(getAtlasCloudModelCatalogUrl(baseUrl), {
            headers: {
                Accept: 'application/json',
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
        });
        if (!response.ok) return [];
        const payload = await response.json() as Record<string, unknown>;
        return mapAtlasCloudTextModels(payload);
    }

    private readEnvironmentCredential(provider: AgentModelProvider): string | undefined {
        if (this.getDisabledProviders().has(provider)) return undefined;
        for (const key of AGENT_PROVIDER_DEFINITIONS[provider].envKeys) {
            const value = process.env[key]?.trim();
            if (value) return value;
        }
        return undefined;
    }

    private readEnvironmentBaseUrl(provider: AgentModelProvider): string | undefined {
        return readFirstEnvironmentValue(AGENT_PROVIDER_BASE_URL_ENV_KEYS[provider] ?? []);
    }

    private resolveProviderBaseUrl(provider: AgentModelProvider, configuredBaseUrl?: string): string | undefined {
        const configured = configuredBaseUrl?.trim().replace(/\/$/, '') || undefined;
        if (provider === 'openai-compatible') return configured;
        if (provider === 'atlascloud') return configured || this.readEnvironmentBaseUrl(provider) || AGENT_PROVIDER_DEFINITIONS[provider].defaultBaseUrl;
        return this.readEnvironmentBaseUrl(provider) || AGENT_PROVIDER_DEFINITIONS[provider].defaultBaseUrl;
    }

    private async probeMiniMaxModels(apiKey: string, baseUrl?: string): Promise<string[]> {
        if (!apiKey) return [];
        const url = this.getMiniMaxCompletionDiscoveryUrl(baseUrl);
        const checks = await Promise.all(
            MINIMAX_DISCOVERY_CANDIDATE_MODELS.map(async (model) => {
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${apiKey}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            model,
                            messages: [{ role: 'user', content: 'ping' }],
                            max_tokens: 1,
                        }),
                    });
                    return response.ok ? model : undefined;
                } catch {
                    return undefined;
                }
            }),
        );
        return checks.filter((model): model is typeof MINIMAX_DISCOVERY_CANDIDATE_MODELS[number] => Boolean(model));
    }

    private getMiniMaxCompletionDiscoveryUrl(baseUrl?: string): string {
        const resolvedBaseUrl = baseUrl || AGENT_PROVIDER_DEFINITIONS.minimax.defaultBaseUrl || 'https://api.minimax.io/anthropic';
        if (resolvedBaseUrl.endsWith('/anthropic')) {
            return resolvedBaseUrl.replace(/\/anthropic\/?$/, '/v1/chat/completions');
        }
        return `${resolvedBaseUrl.replace(/\/$/, '')}/v1/chat/completions`;
    }

    private getDisabledProviders(): Set<AgentModelProvider> {
        const disabled = this.context.globalState.get<string[]>(DISABLED_PROVIDERS_STATE_KEY, []);
        return new Set(disabled.map((provider) => normalizeAgentProviderId(provider)).filter((provider): provider is AgentModelProvider => Boolean(provider)));
    }

    private async setProviderDisabled(provider: AgentModelProvider, disabled: boolean): Promise<void> {
        const providers = this.getDisabledProviders();
        if (disabled) {
            providers.add(provider);
        } else {
            providers.delete(provider);
        }
        await this.context.globalState.update(DISABLED_PROVIDERS_STATE_KEY, [...providers]);
    }

    private async fetchJsonModels(url: string, headers: Record<string, string>): Promise<string[]> {
        const response = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
        if (!response.ok) return [];
        const payload = await response.json() as Record<string, unknown>;
        return [...new Set(MODEL_LIST_MAPPER(payload))];
    }

    private getDefaultReasoningEffort(provider: AgentModelProvider, model: string): AgentProviderReasoningEffort {
        const capability = getReasoningCapability(provider, model || AGENT_PROVIDER_DEFINITIONS[provider].defaultModel);
        if (provider === 'openai-oauth' && model.includes('codex-mini')) return 'minimal';
        return capability.defaultEffort || 'medium';
    }

    private async fetchOpenAiOauthModels(accessToken: string): Promise<string[]> {
        if (!accessToken) return [];
        const headers: Record<string, string> = {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        };
        const accountId = this.extractChatGptAccountId(accessToken);
        if (accountId) {
            headers['chatgpt-account-id'] = accountId;
        }
        const response = await fetch('https://chatgpt.com/backend-api/codex/models?client_version=1.0.0', { headers });
        if (!response.ok) return [];
        const payload = await response.json() as { models?: Array<{ slug?: string; visibility?: string; priority?: number }> };
        return [...new Set((payload.models ?? [])
            .filter((model) => typeof model.slug === 'string' && model.slug.trim().length > 0)
            .filter((model) => (model.visibility ?? 'list') === 'list')
            .sort((left, right) => (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER))
            .map((model) => model.slug!.trim()))];
    }

    private extractChatGptAccountId(accessToken: string): string | undefined {
        try {
            const parts = accessToken.split('.');
            if (parts.length !== 3) return undefined;
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8')) as Record<string, unknown>;
            const claim = payload['https://api.openai.com/auth'] as Record<string, unknown> | undefined;
            return typeof claim?.chatgpt_account_id === 'string' ? claim.chatgpt_account_id : undefined;
        } catch {
            return undefined;
        }
    }

    private async runDeviceFlow(provider: AgentModelProvider): Promise<void> {
        const challenge = provider === 'openai-oauth'
            ? await this.beginOpenAiDeviceAuth()
            : await this.beginGitHubDeviceAuth();

        const cancellationSource = new vscode.CancellationTokenSource();
        const authPanel = this.showDeviceFlowModal(provider, challenge, cancellationSource);

        try {
            const token = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: provider === 'openai-oauth' ? 'Waiting for OpenAI authorization' : 'Waiting for GitHub authorization',
                cancellable: true,
            }, async (progress, cancellationToken) => {
                const disposable = cancellationToken.onCancellationRequested(() => cancellationSource.cancel());
                try {
                    progress.report({ message: `Code ${challenge.userCode}` });
                    return provider === 'openai-oauth'
                        ? this.completeOpenAiDeviceAuth(challenge, cancellationSource.token)
                        : this.completeGitHubDeviceAuth(challenge, cancellationSource.token);
                } finally {
                    disposable.dispose();
                }
            });

            await this.context.secrets.store(getAgentProviderSecretKey(provider), token);
            vscode.window.showInformationMessage(`${AGENT_PROVIDER_DEFINITIONS[provider].label} connected.`);
        } finally {
            authPanel.dispose();
            cancellationSource.dispose();
        }
    }

    private showDeviceFlowModal(provider: AgentModelProvider, challenge: DeviceChallenge, cancellationSource: vscode.CancellationTokenSource): vscode.WebviewPanel {
        const title = provider === 'openai-oauth' ? 'Connect OpenAI account' : 'Connect GitHub Copilot';
        void vscode.env.clipboard.writeText(challenge.userCode).then(undefined, () => undefined);
        void vscode.env.openExternal(vscode.Uri.parse(challenge.verificationUri));
        return this.showDeviceFlowWebview(title, provider, challenge, cancellationSource);
    }

    private showDeviceFlowWebview(title: string, provider: AgentModelProvider, challenge: DeviceChallenge, cancellationSource: vscode.CancellationTokenSource): vscode.WebviewPanel {
        const panel = vscode.window.createWebviewPanel(
            'n8nAgentDeviceAuth',
            title,
            vscode.ViewColumn.Active,
            { enableScripts: true, retainContextWhenHidden: false, localResourceRoots: [] },
        );

        panel.webview.html = this.buildDeviceFlowHtml(title, provider, challenge);
        const disposable = panel.webview.onDidReceiveMessage(async (message: unknown) => {
            if (!message || typeof message !== 'object') return;
            const payload = message as Record<string, unknown>;
            if (payload.type === 'copyCode') {
                await vscode.env.clipboard.writeText(challenge.userCode);
                await panel.webview.postMessage({ type: 'copied' });
                return;
            }
            if (payload.type === 'openBrowser') {
                await vscode.env.openExternal(vscode.Uri.parse(challenge.verificationUri));
                return;
            }
            if (payload.type === 'cancel') {
                cancellationSource.cancel();
                panel.dispose();
            }
        });
        panel.onDidDispose(() => disposable.dispose());
        return panel;
    }

    private buildDeviceFlowHtml(title: string, provider: AgentModelProvider, challenge: DeviceChallenge): string {
        const nonce = this.getNonce();
        const providerLabel = this.escapeHtml(AGENT_PROVIDER_DEFINITIONS[provider].label);
        const safeTitle = this.escapeHtml(title);
        const code = this.escapeHtml(challenge.userCode);
        const verificationUri = this.escapeHtml(challenge.verificationUri);
        const expiresInMinutes = Math.max(1, Math.ceil((challenge.expiresAt - Date.now()) / 60000));
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --panel: var(--vscode-sideBar-background, var(--vscode-editor-background));
      --text: var(--vscode-editor-foreground);
      --muted: var(--vscode-descriptionForeground);
      --border: var(--vscode-panel-border, var(--vscode-input-border));
      --accent: var(--vscode-button-background);
      --accentText: var(--vscode-button-foreground);
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: var(--bg); color: var(--text); font-family: var(--vscode-font-family); }
    main { width: min(560px, 100%); border: 1px solid var(--border); border-radius: 14px; background: var(--panel); padding: 22px; display: grid; gap: 16px; box-shadow: 0 18px 60px rgba(0,0,0,.28); }
    h1, p { margin: 0; }
    h1 { font-size: 22px; }
    .muted { color: var(--muted); line-height: 1.45; }
    .code { border: 1px solid var(--border); border-radius: 12px; padding: 18px; text-align: center; font-size: 34px; font-weight: 800; letter-spacing: .16em; background: var(--vscode-input-background); user-select: all; }
    .url { color: var(--vscode-textLink-foreground); overflow-wrap: anywhere; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; }
    button { min-height: 34px; border: 1px solid transparent; border-radius: 7px; padding: 0 13px; color: var(--accentText); background: var(--accent); font-weight: 650; cursor: pointer; }
    button.secondary { color: var(--text); background: transparent; border-color: var(--border); }
    .copied { display: none; color: var(--vscode-testing-iconPassed, var(--text)); font-size: 12px; }
  </style>
</head>
<body>
  <main>
    <div>
      <h1>${safeTitle}</h1>
      <p class="muted">Authorize ${providerLabel} in your browser. n8n-as-code detects completion automatically.</p>
    </div>
    <div class="code" aria-label="Device code">${code}</div>
    <p class="muted">Open <span class="url">${verificationUri}</span> and enter this code. It expires in about ${expiresInMinutes} minutes.</p>
    <div id="copied" class="copied">Code copied to clipboard.</div>
    <div class="actions">
      <button id="copy" class="secondary" type="button">Copy Code</button>
      <button id="open" class="secondary" type="button">Open Browser</button>
      <button id="cancel" class="secondary" type="button">Cancel</button>
    </div>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('copy').addEventListener('click', () => vscode.postMessage({ type: 'copyCode' }));
    document.getElementById('open').addEventListener('click', () => vscode.postMessage({ type: 'openBrowser' }));
    document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'copied') {
        const copied = document.getElementById('copied');
        copied.style.display = 'block';
        setTimeout(() => copied.style.display = 'none', 1400);
      }
    });
  </script>
</body>
</html>`;
    }

    private escapeHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    private getNonce(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let nonce = '';
        for (let i = 0; i < 32; i++) {
            nonce += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return nonce;
    }

    private async beginOpenAiDeviceAuth(): Promise<DeviceChallenge> {
        const response = await fetch('https://auth.openai.com/api/accounts/deviceauth/usercode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: OPENAI_CODEX_CLIENT_ID }),
        });
        if (!response.ok) throw new Error(`OpenAI device login failed: HTTP ${response.status}`);
        const payload = await response.json() as Record<string, unknown>;
        const deviceAuthId = String(payload.device_auth_id || '');
        const userCode = String(payload.user_code || '');
        if (!deviceAuthId || !userCode) throw new Error('OpenAI device login returned an incomplete challenge.');
        const intervalSeconds = Number.parseInt(String(payload.interval || '5'), 10);
        return {
            verificationUri: 'https://auth.openai.com/codex/device',
            userCode,
            deviceAuthId,
            intervalMs: Math.max(Number.isFinite(intervalSeconds) ? intervalSeconds : 5, 1) * 1000,
            expiresAt: Date.now() + (Number(payload.expires_in || 600) * 1000),
        };
    }

    private async completeOpenAiDeviceAuth(challenge: DeviceChallenge, cancellationToken?: vscode.CancellationToken): Promise<string> {
        return this.completeOpenAiDeviceAuthLegacy(challenge, cancellationToken);
    }

    private async completeOpenAiDeviceAuthLegacy(challenge: DeviceChallenge, cancellationToken?: vscode.CancellationToken): Promise<string> {
        while (Date.now() < challenge.expiresAt - 3000) {
            if (cancellationToken?.isCancellationRequested) throw new Error('OpenAI device login cancelled.');
            const response = await fetch('https://auth.openai.com/api/accounts/deviceauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    device_auth_id: challenge.deviceAuthId,
                    user_code: challenge.userCode,
                }),
            });

            if (response.ok) {
                const deviceToken = await response.json() as Record<string, unknown>;
                const authorizationCode = String(deviceToken.authorization_code || '');
                const codeVerifier = String(deviceToken.code_verifier || '');
                if (!authorizationCode || !codeVerifier) {
                    throw new Error('OpenAI device login returned an incomplete authorization result.');
                }
                return this.exchangeOpenAiDeviceCode(authorizationCode, codeVerifier);
            }

            if (response.status !== 403 && response.status !== 404) {
                const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
                throw new Error(String(payload.error_description || payload.message || payload.error || `OpenAI device flow failed: HTTP ${response.status}`));
            }
            await this.sleep(challenge.intervalMs + 3000, cancellationToken);
        }
        throw new Error('OpenAI device login expired.');
    }

    private async exchangeOpenAiDeviceCode(authorizationCode: string, codeVerifier: string): Promise<string> {
        const body = new URLSearchParams();
        body.set('grant_type', 'authorization_code');
        body.set('code', authorizationCode);
        body.set('redirect_uri', OPENAI_CODEX_DEVICE_REDIRECT_URI);
        body.set('client_id', OPENAI_CODEX_CLIENT_ID);
        body.set('code_verifier', codeVerifier);

        const response = await fetch('https://auth.openai.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        if (!response.ok) {
            throw new Error(`OpenAI token exchange failed: HTTP ${response.status}`);
        }
        const tokens = await response.json() as Record<string, unknown>;
        const accessToken = String(tokens.access_token || '');
        if (!accessToken) throw new Error('OpenAI device login returned no access token.');
        return accessToken;
    }

    private async beginGitHubDeviceAuth(): Promise<DeviceChallenge> {
        const response = await fetch('https://github.com/login/device/code', {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: 'Iv1.b507a08c87ecfe98', scope: 'read:user' }),
        });
        if (!response.ok) throw new Error(`GitHub device code failed: HTTP ${response.status}`);
        const payload = await response.json() as Record<string, unknown>;
        return {
            verificationUri: String(payload.verification_uri || 'https://github.com/login/device'),
            userCode: String(payload.user_code || ''),
            deviceCode: String(payload.device_code || ''),
            intervalMs: Math.max(1000, Number(payload.interval || 5) * 1000),
            expiresAt: Date.now() + Number(payload.expires_in || 900) * 1000,
        };
    }

    private async completeGitHubDeviceAuth(challenge: DeviceChallenge, cancellationToken?: vscode.CancellationToken): Promise<string> {
        return this.completeGitHubDeviceAuthLegacy(challenge, cancellationToken);
    }

    private async completeGitHubDeviceAuthLegacy(challenge: DeviceChallenge, cancellationToken?: vscode.CancellationToken): Promise<string> {
        while (Date.now() < challenge.expiresAt) {
            if (cancellationToken?.isCancellationRequested) throw new Error('GitHub Copilot device login cancelled.');
            const response = await fetch('https://github.com/login/oauth/access_token', {
                method: 'POST',
                headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: 'Iv1.b507a08c87ecfe98',
                    device_code: challenge.deviceCode || '',
                    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                }),
            });
            const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
            const accessToken = String(payload.access_token || '');
            if (accessToken) return accessToken;
            const error = String(payload.error || '');
            if (error && error !== 'authorization_pending' && error !== 'slow_down') {
                throw new Error(String(payload.error_description || error));
            }
            await this.sleep(challenge.intervalMs, cancellationToken);
        }
        throw new Error('GitHub Copilot device login expired.');
    }

    private async sleep(ms: number, cancellationToken?: vscode.CancellationToken): Promise<void> {
        if (!cancellationToken) {
            await new Promise((resolve) => setTimeout(resolve, ms));
            return;
        }
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                disposable.dispose();
                resolve();
            }, ms);
            const disposable = cancellationToken.onCancellationRequested(() => {
                clearTimeout(timeout);
                disposable.dispose();
                reject(new Error('Device login cancelled.'));
            });
        });
    }
}
