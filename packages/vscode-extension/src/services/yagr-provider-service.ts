import * as vscode from 'vscode';
import { getAgentProviderSecretKey } from './agent-runtime-controller.js';

export type YagrModelProvider =
    | 'anthropic'
    | 'openai'
    | 'azure_openai'
    | 'cohere'
    | 'google'
    | 'google-vertexai'
    | 'google-vertexai-web'
    | 'google-genai'
    | 'mistral'
    | 'mistralai'
    | 'ollama'
    | 'groq'
    | 'bedrock'
    | 'aws'
    | 'deepseek'
    | 'xai'
    | 'cerebras'
    | 'fireworks'
    | 'together'
    | 'perplexity'
    | 'openrouter'
    | 'openai-oauth'
    | 'copilot-proxy'
    | 'minimax'
    | 'minimax-token-plan'
    | 'openai-compatible';

export type ProviderAuthKind = 'api-key' | 'oauth-device' | 'setup-token' | 'none';

export type YagrReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export const YAGR_REASONING_EFFORTS: readonly YagrReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

export interface YagrProviderDefinition {
    id: YagrModelProvider;
    label: string;
    description: string;
    defaultModel: string;
    defaultBaseUrl?: string;
    requiresApiKey: boolean;
    authKind: ProviderAuthKind;
    envKeys: string[];
    canDiscoverModels: boolean;
}

export interface YagrProviderConnectionState {
    id: YagrModelProvider;
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
    reasoningEffort?: YagrReasoningEffort;
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
const DISABLED_PROVIDERS_STATE_KEY = 'n8n.agent.disabledProviders';

const MODEL_LIST_MAPPER = (payload: Record<string, unknown>): string[] => {
    const data = Array.isArray(payload.data) ? payload.data : [];
    return data
        .map((entry) => (entry && typeof entry === 'object' ? String((entry as Record<string, unknown>).id || '').trim() : ''))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right));
};

export const YAGR_PROVIDER_DEFINITIONS: Record<YagrModelProvider, YagrProviderDefinition> = {
    anthropic: {
        id: 'anthropic',
        label: 'Claude API',
        description: 'ANTHROPIC_API_KEY',
        defaultModel: 'claude-haiku-4-5',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: ['ANTHROPIC_LLM_API_KEY', 'ANTHROPIC_API_KEY'],
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
        envKeys: ['OPENAI_LLM_API_KEY', 'OPENAI_API_KEY'],
        canDiscoverModels: true,
    },
    azure_openai: {
        id: 'azure_openai',
        label: 'Azure OpenAI',
        description: 'AZURE_OPENAI_API_KEY + endpoint',
        defaultModel: 'gpt-4o',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_API_KEY_LLM'],
        canDiscoverModels: false,
    },
    cohere: {
        id: 'cohere',
        label: 'Cohere API',
        description: 'COHERE_API_KEY',
        defaultModel: 'command-a-03-2025',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: ['COHERE_API_KEY', 'COHERE_LLM_API_KEY'],
        canDiscoverModels: false,
    },
    google: {
        id: 'google',
        label: 'Gemini API',
        description: 'GOOGLE_GENERATIVE_AI_API_KEY',
        defaultModel: 'gemini-3-flash-preview',
        defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_LLM_API_KEY', 'GOOGLE_LLM_API_KEY'],
        canDiscoverModels: true,
    },
    'google-vertexai': {
        id: 'google-vertexai',
        label: 'Google Vertex AI',
        description: 'Google ADC / Vertex AI credentials',
        defaultModel: 'gemini-2.5-pro',
        requiresApiKey: false,
        authKind: 'none',
        envKeys: ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT'],
        canDiscoverModels: false,
    },
    'google-vertexai-web': {
        id: 'google-vertexai-web',
        label: 'Google Vertex AI Web',
        description: 'Google ADC / Vertex AI web credentials',
        defaultModel: 'gemini-2.5-pro',
        requiresApiKey: false,
        authKind: 'none',
        envKeys: ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT'],
        canDiscoverModels: false,
    },
    'google-genai': {
        id: 'google-genai',
        label: 'Google GenAI',
        description: 'GOOGLE_GENERATIVE_AI_API_KEY',
        defaultModel: 'gemini-3-flash-preview',
        defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_LLM_API_KEY', 'GOOGLE_LLM_API_KEY'],
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
        envKeys: ['MISTRAL_API_KEY', 'MISTRAL_LLM_API_KEY'],
        canDiscoverModels: true,
    },
    mistralai: {
        id: 'mistralai',
        label: 'Mistral AI',
        description: 'MISTRAL_API_KEY',
        defaultModel: 'mistral-large-latest',
        defaultBaseUrl: 'https://api.mistral.ai/v1',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: ['MISTRAL_API_KEY', 'MISTRAL_LLM_API_KEY'],
        canDiscoverModels: true,
    },
    ollama: {
        id: 'ollama',
        label: 'Ollama',
        description: 'Local Ollama server',
        defaultModel: 'llama3.1',
        defaultBaseUrl: 'http://127.0.0.1:11434',
        requiresApiKey: false,
        authKind: 'none',
        envKeys: [],
        canDiscoverModels: true,
    },
    groq: {
        id: 'groq',
        label: 'Groq API',
        description: 'GROQ_API_KEY',
        defaultModel: 'llama-3.3-70b-versatile',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: ['GROQ_API_KEY', 'GROQ_LLM_API_KEY'],
        canDiscoverModels: true,
    },
    bedrock: {
        id: 'bedrock',
        label: 'AWS Bedrock',
        description: 'AWS credentials',
        defaultModel: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        requiresApiKey: false,
        authKind: 'none',
        envKeys: ['AWS_ACCESS_KEY_ID', 'AWS_PROFILE'],
        canDiscoverModels: false,
    },
    aws: {
        id: 'aws',
        label: 'AWS Bedrock',
        description: 'AWS credentials',
        defaultModel: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        requiresApiKey: false,
        authKind: 'none',
        envKeys: ['AWS_ACCESS_KEY_ID', 'AWS_PROFILE'],
        canDiscoverModels: false,
    },
    deepseek: {
        id: 'deepseek',
        label: 'DeepSeek API',
        description: 'DEEPSEEK_API_KEY',
        defaultModel: 'deepseek-chat',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: ['DEEPSEEK_API_KEY'],
        canDiscoverModels: true,
    },
    xai: {
        id: 'xai',
        label: 'xAI API',
        description: 'XAI_API_KEY',
        defaultModel: 'grok-4',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: ['XAI_API_KEY'],
        canDiscoverModels: true,
    },
    cerebras: {
        id: 'cerebras',
        label: 'Cerebras API',
        description: 'CEREBRAS_API_KEY',
        defaultModel: 'llama3.1-8b',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: ['CEREBRAS_API_KEY'],
        canDiscoverModels: false,
    },
    fireworks: {
        id: 'fireworks',
        label: 'Fireworks AI',
        description: 'FIREWORKS_API_KEY',
        defaultModel: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: ['FIREWORKS_API_KEY'],
        canDiscoverModels: true,
    },
    together: {
        id: 'together',
        label: 'Together AI',
        description: 'TOGETHER_API_KEY',
        defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: ['TOGETHER_API_KEY'],
        canDiscoverModels: true,
    },
    perplexity: {
        id: 'perplexity',
        label: 'Perplexity API',
        description: 'PPLX_API_KEY',
        defaultModel: 'sonar',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: ['PPLX_API_KEY', 'PERPLEXITY_API_KEY'],
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
        envKeys: ['OPENROUTER_API_KEY', 'OPENROUTER_LLM_API_KEY'],
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
        envKeys: [],
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
        envKeys: ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'],
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
        envKeys: ['MINIMAX_API_KEY'],
        canDiscoverModels: false,
    },
    'minimax-token-plan': {
        id: 'minimax-token-plan',
        label: 'MiniMax Token Plan',
        description: 'MINIMAX_TOKEN_PLAN_API_KEY',
        defaultModel: 'MiniMax-M2.7',
        defaultBaseUrl: 'https://api.minimax.io/anthropic',
        requiresApiKey: true,
        authKind: 'api-key',
        envKeys: ['MINIMAX_TOKEN_PLAN_API_KEY'],
        canDiscoverModels: false,
    },
    'openai-compatible': {
        id: 'openai-compatible',
        label: 'OpenAI Compatible',
        description: 'Custom base URL',
        defaultModel: '',
        requiresApiKey: false,
        authKind: 'api-key',
        envKeys: ['OPENAI_COMPATIBLE_API_KEY'],
        canDiscoverModels: true,
    },
};

export const YAGR_SELECTABLE_PROVIDERS = Object.freeze(Object.keys(YAGR_PROVIDER_DEFINITIONS) as YagrModelProvider[]);

export function normalizeYagrProviderId(provider?: string): YagrModelProvider | undefined {
    const normalized = provider?.trim().toLowerCase();
    if (!normalized) return undefined;
    if (normalized === 'claude') return 'anthropic';
    if (normalized === 'anthropic-proxy') return 'anthropic';
    if (normalized === 'gemini') return 'google';
    if (normalized === 'azure-openai') return 'azure_openai';
    if (normalized === 'google-vertex') return 'google-vertexai';
    if (normalized === 'google-ai') return 'google-genai';
    return normalized in YAGR_PROVIDER_DEFINITIONS ? normalized as YagrModelProvider : undefined;
}

export function providerNeedsBaseUrlInput(provider: YagrModelProvider): boolean {
    return provider === 'openai-compatible' || provider === 'azure_openai' || provider === 'ollama';
}

export function providerSupportsReasoningEffort(provider: YagrModelProvider, _model?: string): boolean {
    return provider === 'openai-oauth';
}

export class YagrProviderService {
    constructor(private readonly context: vscode.ExtensionContext) {}

    getDefinition(provider: string): YagrProviderDefinition {
        return YAGR_PROVIDER_DEFINITIONS[normalizeYagrProviderId(provider) || 'openai'];
    }

    async getStoredCredential(provider: YagrModelProvider): Promise<string | undefined> {
        return this.context.secrets.get(getAgentProviderSecretKey(provider));
    }

    async listProviderConnectionStates(): Promise<YagrProviderConnectionState[]> {
        const config = vscode.workspace.getConfiguration('n8n.agent');
        const selectedProvider = normalizeYagrProviderId(String(config.get<string>('provider') || 'openai')) || 'openai';
        const selectedModel = String(config.get<string>('model') || '').trim() || undefined;
        const configuredBaseUrl = String(config.get<string>('baseUrl') || '').trim() || undefined;
        const selectedReasoningEffort = this.readReasoningEffort();
        const disabledProviders = this.getDisabledProviders();
        const states = await Promise.all(YAGR_SELECTABLE_PROVIDERS.map(async (provider) => {
            const definition = YAGR_PROVIDER_DEFINITIONS[provider];
            const hasStoredCredential = Boolean(await this.getStoredCredential(provider));
            const providerDisabled = disabledProviders.has(provider);
            const hasEnvironmentCredential = !providerDisabled && this.hasEnvironmentCredential(provider);
            const connected = !providerDisabled && (hasStoredCredential || hasEnvironmentCredential || provider === selectedProvider);
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
                baseUrl: providerNeedsBaseUrlInput(provider) ? configuredBaseUrl || definition.defaultBaseUrl : definition.defaultBaseUrl,
                supportsReasoningEffort: providerSupportsReasoningEffort(provider, provider === selectedProvider ? selectedModel : definition.defaultModel),
                reasoningEffort: provider === selectedProvider && providerSupportsReasoningEffort(provider, selectedModel) ? selectedReasoningEffort : undefined,
            };
        }));
        return states;
    }

    async disconnectProvider(provider: YagrModelProvider): Promise<void> {
        await this.context.secrets.delete(getAgentProviderSecretKey(provider));
        await this.setProviderDisabled(provider, true);
        const config = vscode.workspace.getConfiguration('n8n.agent');
        const selectedProvider = normalizeYagrProviderId(String(config.get<string>('provider') || ''));
        if (selectedProvider === provider) {
            await config.update('provider', 'openai', vscode.ConfigurationTarget.Global);
            await config.update('model', YAGR_PROVIDER_DEFINITIONS.openai.defaultModel, vscode.ConfigurationTarget.Global);
            await config.update('baseUrl', '', vscode.ConfigurationTarget.Global);
            await config.update('reasoningEffort', undefined, vscode.ConfigurationTarget.Global);
        }
    }

    hasEnvironmentCredential(provider: YagrModelProvider): boolean {
        return YAGR_PROVIDER_DEFINITIONS[provider].envKeys.some((key) => Boolean(process.env[key]?.trim()));
    }

    async setupProvider(provider: YagrModelProvider): Promise<boolean> {
        const definition = YAGR_PROVIDER_DEFINITIONS[provider];
        const config = vscode.workspace.getConfiguration('n8n.agent');
        const previousProvider = normalizeYagrProviderId(String(config.get<string>('provider') || ''));
        await this.setProviderDisabled(provider, false);

        if (providerNeedsBaseUrlInput(provider)) {
            const baseUrl = await vscode.window.showInputBox({
                title: 'OpenAI-compatible base URL',
                prompt: provider === 'azure_openai'
                    ? 'Azure OpenAI endpoint, for example https://my-resource.openai.azure.com.'
                    : provider === 'ollama'
                        ? 'Ollama server URL.'
                        : 'OpenAI-compatible provider base URL.',
                value: String(config.get<string>('baseUrl') || definition.defaultBaseUrl || ''),
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value.trim()) return 'Base URL is required for this provider.';
                    try { new URL(value.trim()); return undefined; } catch { return 'Enter a valid URL.'; }
                },
            });
            if (baseUrl === undefined) return false;
            await config.update('baseUrl', baseUrl.trim().replace(/\/$/, ''), vscode.ConfigurationTarget.Global);
        } else {
            await config.update('baseUrl', '', vscode.ConfigurationTarget.Global);
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

        await config.update('provider', provider, vscode.ConfigurationTarget.Global);
        const currentModel = String(config.get<string>('model') || '').trim();
        if (!currentModel || previousProvider !== provider) {
            await config.update('model', definition.defaultModel, vscode.ConfigurationTarget.Global);
        }
        return true;
    }

    async selectModel(provider: YagrModelProvider): Promise<string | undefined> {
        const definition = YAGR_PROVIDER_DEFINITIONS[provider];
        const models = await this.fetchAvailableModels(provider).catch(() => []);
        const config = vscode.workspace.getConfiguration('n8n.agent');
        const currentModel = String(config.get<string>('model') || '').trim() || definition.defaultModel;
        const items = [...new Set([...(models.length ? models : []), definition.defaultModel, currentModel].filter(Boolean))]
            .map((model) => ({ label: model, picked: model === currentModel }));

        const picked = await vscode.window.showQuickPick(items, {
            title: `Select ${definition.label} model`,
            placeHolder: models.length ? 'Live model list from provider' : 'Live model list unavailable; using known defaults',
            ignoreFocusOut: true,
        });
        if (!picked) return undefined;
        await config.update('model', picked.label, vscode.ConfigurationTarget.Global);
        await this.syncReasoningEffortConfiguration(provider, picked.label);
        return picked.label;
    }

    async selectReasoningEffort(provider: YagrModelProvider, model?: string): Promise<YagrReasoningEffort | undefined> {
        if (!providerSupportsReasoningEffort(provider, model)) {
            const config = vscode.workspace.getConfiguration('n8n.agent');
            await config.update('reasoningEffort', undefined, vscode.ConfigurationTarget.Global);
            return undefined;
        }

        const config = vscode.workspace.getConfiguration('n8n.agent');
        const defaultReasoningEffort = await this.getDefaultReasoningEffort(model || String(config.get<string>('model') || '').trim());
        const current = this.readReasoningEffort() || defaultReasoningEffort;
        const picked = await vscode.window.showQuickPick(
            YAGR_REASONING_EFFORTS.map((effort) => ({
                label: effort,
                picked: effort === current,
                description: effort === defaultReasoningEffort ? 'Provider default' : undefined,
            })),
            {
                title: 'Select reasoning effort',
                placeHolder: 'Controls how much reasoning budget eligible OpenAI account models can use.',
                ignoreFocusOut: true,
            },
        );
        if (!picked) return current;
        await config.update('reasoningEffort', picked.label as YagrReasoningEffort, vscode.ConfigurationTarget.Global);
        return picked.label as YagrReasoningEffort;
    }

    async syncReasoningEffortConfiguration(provider: YagrModelProvider, model?: string): Promise<YagrReasoningEffort | undefined> {
        if (!providerSupportsReasoningEffort(provider, model)) {
            const config = vscode.workspace.getConfiguration('n8n.agent');
            await config.update('reasoningEffort', undefined, vscode.ConfigurationTarget.Global);
            return undefined;
        }

        const config = vscode.workspace.getConfiguration('n8n.agent');
        const current = this.readReasoningEffort();
        const defaultReasoningEffort = await this.getDefaultReasoningEffort(model || String(config.get<string>('model') || '').trim());
        const next = current || defaultReasoningEffort;
        await config.update('reasoningEffort', next, vscode.ConfigurationTarget.Global);
        return next;
    }

    async fetchAvailableModels(provider: YagrModelProvider): Promise<string[]> {
        const definition = YAGR_PROVIDER_DEFINITIONS[provider];
        if (!definition.canDiscoverModels) return [];
        const apiKey = await this.getStoredCredential(provider) || this.readEnvironmentCredential(provider);
        const config = vscode.workspace.getConfiguration('n8n.agent');
        const configuredBaseUrl = String(config.get<string>('baseUrl') || '').trim();
        const baseUrl = providerNeedsBaseUrlInput(provider) ? configuredBaseUrl || definition.defaultBaseUrl : definition.defaultBaseUrl;

        if ((definition.requiresApiKey || provider !== 'openai-compatible') && !apiKey && definition.authKind !== 'none') {
            return [];
        }

        if (provider === 'anthropic') {
            return this.fetchJsonModels('https://api.anthropic.com/v1/models', { 'x-api-key': apiKey || '', 'anthropic-version': '2023-06-01' });
        }
        if (provider === 'google' || provider === 'google-genai') {
            return (await this.fetchJsonModels('https://generativelanguage.googleapis.com/v1beta/openai/models', { Authorization: `Bearer ${apiKey}` }))
                .map((model) => model.replace(/^models\//, ''))
                .filter((model) => /^gemini-/i.test(model));
        }
        if (provider === 'ollama') {
            const response = await fetch(`${(baseUrl || definition.defaultBaseUrl || '').replace(/\/$/, '')}/api/tags`, { headers: { Accept: 'application/json' } });
            if (!response.ok) return [];
            const payload = await response.json() as Record<string, unknown>;
            const models = Array.isArray(payload.models) ? payload.models : [];
            return models.map((entry) => entry && typeof entry === 'object' ? String((entry as Record<string, unknown>).name || '').trim() : '').filter(Boolean);
        }
        if (provider === 'openai-oauth') {
            return this.fetchOpenAiOauthModels(apiKey || '');
        }
        if (provider === 'copilot-proxy') {
            return this.fetchJsonModels(`${definition.defaultBaseUrl}/models`, {
                Authorization: `Bearer ${apiKey}`,
                'User-Agent': 'GitHubCopilotChat/0.26.7',
                'Editor-Version': 'vscode/1.96.2',
                'Editor-Plugin-Version': 'copilot-chat/0.26.7',
            });
        }

        const openAiCompatibleProviders = new Set<YagrModelProvider>(['openai-compatible', 'openrouter', 'mistral', 'mistralai', 'groq', 'deepseek', 'xai', 'fireworks', 'together', 'perplexity']);
        if (!openAiCompatibleProviders.has(provider)) return [];

        const modelsUrl = provider === 'openai-compatible'
            ? (baseUrl ? `${baseUrl.replace(/\/$/, '')}/models` : undefined)
            : `${(baseUrl || '').replace(/\/$/, '')}/models`;
        if (!modelsUrl) return [];
        return this.fetchJsonModels(modelsUrl, apiKey ? { Authorization: `Bearer ${apiKey}` } : {});
    }

    private readEnvironmentCredential(provider: YagrModelProvider): string | undefined {
        if (this.getDisabledProviders().has(provider)) return undefined;
        for (const key of YAGR_PROVIDER_DEFINITIONS[provider].envKeys) {
            const value = process.env[key]?.trim();
            if (value) return value;
        }
        return undefined;
    }

    private getDisabledProviders(): Set<YagrModelProvider> {
        const disabled = this.context.globalState.get<string[]>(DISABLED_PROVIDERS_STATE_KEY, []);
        return new Set(disabled.map((provider) => normalizeYagrProviderId(provider)).filter((provider): provider is YagrModelProvider => Boolean(provider)));
    }

    private async setProviderDisabled(provider: YagrModelProvider, disabled: boolean): Promise<void> {
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

    private readReasoningEffort(): YagrReasoningEffort | undefined {
        const config = vscode.workspace.getConfiguration('n8n.agent');
        const value = String(config.get<string>('reasoningEffort') || '').trim();
        return YAGR_REASONING_EFFORTS.includes(value as YagrReasoningEffort) ? value as YagrReasoningEffort : undefined;
    }

    private async getDefaultReasoningEffort(model: string): Promise<YagrReasoningEffort> {
        const modelId = model || YAGR_PROVIDER_DEFINITIONS['openai-oauth'].defaultModel;
        return modelId.includes('codex-mini') ? 'minimal' : 'medium';
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

    private async runDeviceFlow(provider: YagrModelProvider): Promise<void> {
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
            vscode.window.showInformationMessage(`${YAGR_PROVIDER_DEFINITIONS[provider].label} connected.`);
        } finally {
            authPanel.dispose();
            cancellationSource.dispose();
        }
    }

    private showDeviceFlowModal(provider: YagrModelProvider, challenge: DeviceChallenge, cancellationSource: vscode.CancellationTokenSource): vscode.WebviewPanel {
        const title = provider === 'openai-oauth' ? 'Connect OpenAI account' : 'Connect GitHub Copilot';
        void vscode.env.clipboard.writeText(challenge.userCode).then(undefined, () => undefined);
        void vscode.env.openExternal(vscode.Uri.parse(challenge.verificationUri));
        return this.showDeviceFlowWebview(title, provider, challenge, cancellationSource);
    }

    private showDeviceFlowWebview(title: string, provider: YagrModelProvider, challenge: DeviceChallenge, cancellationSource: vscode.CancellationTokenSource): vscode.WebviewPanel {
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

    private buildDeviceFlowHtml(title: string, provider: YagrModelProvider, challenge: DeviceChallenge): string {
        const nonce = this.getNonce();
        const providerLabel = this.escapeHtml(YAGR_PROVIDER_DEFINITIONS[provider].label);
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
