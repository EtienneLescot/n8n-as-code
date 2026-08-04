import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildLangChainReasoningOptions, getReasoningCapability } from '../../src/services/agent-provider-capabilities.js';
import {
    AGENT_PROVIDER_BASE_URL_ENV_KEYS,
    AGENT_PROVIDER_ENV_KEYS,
    ATLAS_CLOUD_DEFAULT_BASE_URL,
    DISABLED_PROVIDERS_STATE_KEY,
    getAtlasCloudModelCatalogUrl,
    mapAtlasCloudTextModels,
    readAgentProviderEnvironmentSecret,
    readAgentProviderSettings,
    readFirstEnvironmentValue,
    updateAgentProviderSettings,
} from '../../src/services/agent-provider-settings.js';

class MemoryMemento {
    private readonly values = new Map<string, unknown>();

    constructor(initial: Record<string, unknown> = {}) {
        for (const [key, value] of Object.entries(initial)) {
            this.values.set(key, value);
        }
    }

    get<T>(key: string, defaultValue?: T): T | undefined {
        return this.values.has(key) ? this.values.get(key) as T : defaultValue;
    }

    async update(key: string, value: unknown): Promise<void> {
        if (value === undefined) {
            this.values.delete(key);
            return;
        }
        this.values.set(key, value);
    }
}

test('agent provider settings normalize Atlas Cloud aliases', async () => {
    const state = new MemoryMemento({ 'n8n.agent.provider': 'atlas-cloud' });
    assert.equal(readAgentProviderSettings(state as any).provider, 'atlascloud');

    await updateAgentProviderSettings(state as any, {
        provider: 'atlascloud',
        model: 'deepseek-ai/deepseek-v4-pro',
    });

    assert.deepEqual(readAgentProviderSettings(state as any), {
        provider: 'atlascloud',
        model: 'deepseek-ai/deepseek-v4-pro',
        baseUrl: undefined,
        reasoningEffort: undefined,
    });
});

test('agent provider source registers Atlas Cloud on OpenAI-compatible runtime paths', () => {
    const root = path.join(__dirname, '../../src/services');
    const providerService = fs.readFileSync(path.join(root, 'agent-provider-service.ts'), 'utf8');
    const runtimeController = fs.readFileSync(path.join(root, 'agent-runtime-controller.ts'), 'utf8');

    assert.ok(providerService.includes("label: 'Atlas Cloud'"), 'Provider service must expose the Atlas Cloud label');
    assert.ok(providerService.includes("defaultModel: 'deepseek-ai/deepseek-v4-pro'"), 'Provider service must set the Atlas Cloud default model');
    assert.ok(providerService.includes("defaultBaseUrl: ATLAS_CLOUD_DEFAULT_BASE_URL"), 'Provider service must set the Atlas Cloud default base URL');
    assert.deepEqual(AGENT_PROVIDER_ENV_KEYS.atlascloud, ['ATLASCLOUD_API_KEY', 'ATLAS_CLOUD_API_KEY']);
    assert.deepEqual(AGENT_PROVIDER_BASE_URL_ENV_KEYS.atlascloud, ['ATLASCLOUD_BASE_URL', 'ATLAS_CLOUD_BASE_URL', 'ATLASCLOUD_API_BASE', 'ATLAS_CLOUD_API_BASE']);
    assert.ok(providerService.includes("normalized === 'atlas' || normalized === 'atlas-cloud'"), 'Provider service must normalize Atlas aliases');

    assert.ok(runtimeController.includes("atlascloud: 'Atlas Cloud'"), 'Runtime registry must expose the Atlas display name');
    assert.ok(runtimeController.includes("provider === 'atlascloud'"), 'Runtime factory must special-case the Atlas default endpoint');
    assert.ok(runtimeController.includes('readAgentProviderEnvironmentSecret(this._context.globalState, provider)'), 'Runtime env fallback must use the shared credential helper');
});

test('Atlas Cloud DeepSeek V4 Pro uses OpenAI-compatible reasoning options', () => {
    assert.deepEqual(getReasoningCapability('atlascloud', 'deepseek-ai/deepseek-v4-pro'), {
        supported: true,
        efforts: ['none', 'low', 'medium', 'high'],
        defaultEffort: 'medium',
        strategy: 'openrouter-reasoning',
    });
    assert.deepEqual(buildLangChainReasoningOptions('atlascloud', 'deepseek-ai/deepseek-v4-pro', 'low'), {
        modelKwargs: {
            reasoning: { effort: 'low' },
            include_reasoning: true,
        },
    });
});

test('disabled providers do not read environment credentials', () => {
    const previousApiKey = process.env.ATLASCLOUD_API_KEY;
    process.env.ATLASCLOUD_API_KEY = 'test-atlas-key';

    try {
        const enabledState = new MemoryMemento();
        assert.equal(readAgentProviderEnvironmentSecret(enabledState as any, 'atlascloud'), 'test-atlas-key');

        const disabledState = new MemoryMemento({
            [DISABLED_PROVIDERS_STATE_KEY]: ['atlas-cloud'],
        });
        assert.equal(readAgentProviderEnvironmentSecret(disabledState as any, 'atlascloud'), undefined);
    } finally {
        if (previousApiKey === undefined) delete process.env.ATLASCLOUD_API_KEY;
        else process.env.ATLASCLOUD_API_KEY = previousApiKey;
    }
});

test('Atlas Cloud catalog helper derives resolved catalog endpoint', () => {
    assert.equal(getAtlasCloudModelCatalogUrl('https://regional.atlas.example/v1/'), 'https://regional.atlas.example/api/v1/models');
    assert.equal(getAtlasCloudModelCatalogUrl(ATLAS_CLOUD_DEFAULT_BASE_URL), 'https://api.atlascloud.ai/api/v1/models');
    assert.equal(getAtlasCloudModelCatalogUrl('not a url'), 'https://api.atlascloud.ai/api/v1/models');
});

test('provider environment helper prefers the first configured value and trims trailing slash', () => {
    const previousPrimary = process.env.ATLASCLOUD_BASE_URL;
    const previousFallback = process.env.ATLAS_CLOUD_BASE_URL;
    process.env.ATLASCLOUD_BASE_URL = 'https://primary.atlas.example/v1/';
    process.env.ATLAS_CLOUD_BASE_URL = 'https://fallback.atlas.example/v1/';

    try {
        assert.equal(readFirstEnvironmentValue(AGENT_PROVIDER_BASE_URL_ENV_KEYS.atlascloud ?? []), 'https://primary.atlas.example/v1');
    } finally {
        if (previousPrimary === undefined) delete process.env.ATLASCLOUD_BASE_URL;
        else process.env.ATLASCLOUD_BASE_URL = previousPrimary;
        if (previousFallback === undefined) delete process.env.ATLAS_CLOUD_BASE_URL;
        else process.env.ATLAS_CLOUD_BASE_URL = previousFallback;
    }
});

test('Atlas Cloud catalog helper keeps text models, model ids, dedupe, and sorted order', () => {
    assert.deepEqual(mapAtlasCloudTextModels({
        data: [
            { id: 'z-by-id', type: 'Text' },
            { id: 'duplicate-id', model: 'a-model-over-id', type: 'text' },
            { id: 'a-model-over-id', model: 'a-model-over-id', type: 'text' },
            { id: 'image-model', model: 'image-model', type: 'image' },
        ],
    }), ['a-model-over-id', 'z-by-id']);
});
