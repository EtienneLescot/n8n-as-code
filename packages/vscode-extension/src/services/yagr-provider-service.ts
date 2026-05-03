import * as vscode from 'vscode';
import { getAgentProviderSecretKey } from './agent-runtime-controller.js';

export type YagrModelProvider =
    | 'anthropic'
    | 'openai'
    | 'google'
    | 'mistral'
    | 'openrouter'
    | 'openai-oauth'
    | 'anthropic-proxy'
    | 'copilot-proxy'
    | 'minimax'
    | 'minimax-token-plan'
    | 'openai-compatible';

export type ProviderAuthKind = 'api-key' | 'oauth-device' | 'setup-token' | 'none';

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

type DeviceChallenge = {
    verificationUri: string;
    userCode: string;
    deviceCode?: string;
    deviceAuthId?: string;
    intervalMs: number;
    expiresAt: number;
};

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
    'anthropic-proxy': {
        id: 'anthropic-proxy',
        label: 'Claude Account',
        description: 'Claude setup-token',
        defaultModel: 'claude-haiku-4-5',
        requiresApiKey: false,
        authKind: 'setup-token',
        envKeys: ['YAGR_ANTHROPIC_SETUP_TOKEN'],
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
    if (normalized === 'gemini') return 'google';
    return normalized in YAGR_PROVIDER_DEFINITIONS ? normalized as YagrModelProvider : undefined;
}

export function providerNeedsBaseUrlInput(provider: YagrModelProvider): boolean {
    return provider === 'openai-compatible';
}

export class YagrProviderService {
    constructor(private readonly context: vscode.ExtensionContext) {}

    getDefinition(provider: string): YagrProviderDefinition {
        return YAGR_PROVIDER_DEFINITIONS[normalizeYagrProviderId(provider) || 'openai'];
    }

    async getStoredCredential(provider: YagrModelProvider): Promise<string | undefined> {
        return this.context.secrets.get(getAgentProviderSecretKey(provider));
    }

    hasEnvironmentCredential(provider: YagrModelProvider): boolean {
        return YAGR_PROVIDER_DEFINITIONS[provider].envKeys.some((key) => Boolean(process.env[key]?.trim()));
    }

    async setupProvider(provider: YagrModelProvider): Promise<boolean> {
        const definition = YAGR_PROVIDER_DEFINITIONS[provider];
        const config = vscode.workspace.getConfiguration('n8n.agent');

        if (providerNeedsBaseUrlInput(provider)) {
            const baseUrl = await vscode.window.showInputBox({
                title: 'OpenAI-compatible base URL',
                prompt: 'Only OpenAI-compatible providers allow a custom base URL.',
                value: String(config.get<string>('baseUrl') || ''),
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value.trim()) return 'Base URL is required for OpenAI-compatible providers.';
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
        if (!currentModel) {
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
        return picked.label;
    }

    async fetchAvailableModels(provider: YagrModelProvider): Promise<string[]> {
        const definition = YAGR_PROVIDER_DEFINITIONS[provider];
        if (!definition.canDiscoverModels) return [];
        const apiKey = await this.getStoredCredential(provider) || this.readEnvironmentCredential(provider);
        const config = vscode.workspace.getConfiguration('n8n.agent');
        const configuredBaseUrl = String(config.get<string>('baseUrl') || '').trim();
        const baseUrl = provider === 'openai-compatible' ? configuredBaseUrl : definition.defaultBaseUrl;

        if ((definition.requiresApiKey || provider !== 'openai-compatible') && !apiKey && definition.authKind !== 'none') {
            return [];
        }

        if (provider === 'anthropic' || provider === 'anthropic-proxy') {
            return this.fetchJsonModels('https://api.anthropic.com/v1/models', { 'x-api-key': apiKey || '', 'anthropic-version': '2023-06-01' });
        }
        if (provider === 'google') {
            return (await this.fetchJsonModels('https://generativelanguage.googleapis.com/v1beta/openai/models', { Authorization: `Bearer ${apiKey}` }))
                .map((model) => model.replace(/^models\//, ''))
                .filter((model) => /^gemini-/i.test(model));
        }
        if (provider === 'openai-oauth') {
            return this.fetchJsonModels('https://chatgpt.com/backend-api/codex/models', { Authorization: `Bearer ${apiKey}` });
        }
        if (provider === 'copilot-proxy') {
            return this.fetchJsonModels(`${definition.defaultBaseUrl}/models`, {
                Authorization: `Bearer ${apiKey}`,
                'User-Agent': 'GitHubCopilotChat/0.26.7',
                'Editor-Version': 'vscode/1.96.2',
                'Editor-Plugin-Version': 'copilot-chat/0.26.7',
            });
        }

        const modelsUrl = provider === 'openai-compatible'
            ? (baseUrl ? `${baseUrl.replace(/\/$/, '')}/models` : undefined)
            : `${(baseUrl || '').replace(/\/$/, '')}/models`;
        if (!modelsUrl) return [];
        return this.fetchJsonModels(modelsUrl, apiKey ? { Authorization: `Bearer ${apiKey}` } : {});
    }

    private readEnvironmentCredential(provider: YagrModelProvider): string | undefined {
        for (const key of YAGR_PROVIDER_DEFINITIONS[provider].envKeys) {
            const value = process.env[key]?.trim();
            if (value) return value;
        }
        return undefined;
    }

    private async fetchJsonModels(url: string, headers: Record<string, string>): Promise<string[]> {
        const response = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
        if (!response.ok) return [];
        const payload = await response.json() as Record<string, unknown>;
        return [...new Set(MODEL_LIST_MAPPER(payload))];
    }

    private async runDeviceFlow(provider: YagrModelProvider): Promise<void> {
        const challenge = provider === 'openai-oauth'
            ? await this.beginOpenAiDeviceAuth()
            : await this.beginGitHubDeviceAuth();
        await vscode.env.openExternal(vscode.Uri.parse(challenge.verificationUri));
        const submitted = await vscode.window.showInputBox({
            title: provider === 'openai-oauth' ? 'Complete OpenAI device login' : 'Complete GitHub Copilot device login',
            prompt: `Browser opened. Enter code ${challenge.userCode}, authorize, then press Enter here to continue.`,
            value: challenge.userCode,
            ignoreFocusOut: true,
        });
        if (submitted === undefined) return;
        const token = provider === 'openai-oauth'
            ? await this.completeOpenAiDeviceAuth(challenge)
            : await this.completeGitHubDeviceAuth(challenge);
        await this.context.secrets.store(getAgentProviderSecretKey(provider), token);
    }

    private async beginOpenAiDeviceAuth(): Promise<DeviceChallenge> {
        const response = await fetch('https://auth.openai.com/api/accounts/deviceauth/usercode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: 'app_EMoamEEZ73f0CkXaXp7hrann' }),
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

    private async completeOpenAiDeviceAuth(challenge: DeviceChallenge): Promise<string> {
        while (Date.now() < challenge.expiresAt - 3000) {
            const response = await fetch('https://auth.openai.com/api/accounts/deviceauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
                    device_auth_id: challenge.deviceAuthId,
                    user_code: challenge.userCode,
                }),
            });
            const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
            const accessToken = String(payload.access_token || '');
            if (response.ok && accessToken) return accessToken;
            const error = String(payload.error || '');
            if (error && error !== 'authorization_pending' && error !== 'slow_down') {
                throw new Error(String(payload.error_description || error));
            }
            await new Promise((resolve) => setTimeout(resolve, challenge.intervalMs));
        }
        throw new Error('OpenAI device login expired.');
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

    private async completeGitHubDeviceAuth(challenge: DeviceChallenge): Promise<string> {
        while (Date.now() < challenge.expiresAt) {
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
            await new Promise((resolve) => setTimeout(resolve, challenge.intervalMs));
        }
        throw new Error('GitHub Copilot device login expired.');
    }
}
