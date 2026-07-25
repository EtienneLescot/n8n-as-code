import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { getReasoningCapability } from '../../src/services/agent-provider-capabilities.js';
import { readAgentProviderSettings, updateAgentProviderSettings } from '../../src/services/agent-provider-settings.js';

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
    assert.ok(providerService.includes("ATLAS_CLOUD_MODEL_CATALOG_URL = 'https://api.atlascloud.ai/api/v1/models'"), 'Provider service must use the Atlas model catalog for discovery');
    assert.ok(providerService.includes("'ATLASCLOUD_API_KEY', 'ATLAS_CLOUD_API_KEY'"), 'Provider service must support both Atlas API key env names');
    assert.ok(providerService.includes("normalized === 'atlas' || normalized === 'atlas-cloud'"), 'Provider service must normalize Atlas aliases');

    assert.ok(runtimeController.includes("'atlascloud'"), 'Runtime registry must include the Atlas provider id');
    assert.ok(runtimeController.includes("atlascloud: 'Atlas Cloud'"), 'Runtime registry must expose the Atlas display name');
    assert.ok(runtimeController.includes("provider === 'atlascloud'"), 'Runtime factory must special-case the Atlas default endpoint');
    assert.ok(runtimeController.includes("ATLASCLOUD_BASE_URL', 'ATLAS_CLOUD_BASE_URL'"), 'Runtime must support Atlas base URL environment aliases');
});

test('Atlas Cloud provider does not opt into provider-specific reasoning knobs', () => {
    assert.equal(getReasoningCapability('atlascloud', 'deepseek-ai/deepseek-v4-pro').supported, false);
});
