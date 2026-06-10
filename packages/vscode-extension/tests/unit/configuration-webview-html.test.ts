import test from 'node:test';
import assert from 'node:assert';
import {
    ConfigurationInstanceEnrichmentCache,
    INSTANCE_ENRICHMENT_CACHE_TTL_MS,
    type InstanceEnrichmentFacade,
    type InstanceStatusResponse,
} from '../../src/ui/configuration-instance-enrichment.js';

test('Configuration webview HTML: renders bundled React shell with CSP nonce', () => {
    const { getConfigurationHtml } = require('../../src/ui/configuration-webview-html.js');
    const html: string = getConfigurationHtml('nonce', 'vscode-resource://settings-webview.js');

    assert.ok(html.includes("script-src 'nonce-nonce'"), 'CSP must require the generated nonce');
    assert.ok(html.includes("style-src 'nonce-nonce'"), 'CSP must require the generated nonce for styles');
    assert.ok(html.includes('<style nonce="nonce">'), 'Inline styles must carry the CSP nonce');
    assert.ok(html.includes('<div id="root"></div>'), 'React root must be present');
    assert.ok(html.includes('<script nonce="nonce" src="vscode-resource://settings-webview.js"></script>'), 'Bundled webview script must be loaded with nonce');
    assert.ok(!html.includes('external instance'), 'Shell must not expose legacy external instance copy');
    assert.ok(!html.includes('existing instance'), 'Shell must not expose legacy existing instance copy');
});

test('Settings React webview: expensive derived values are memoized', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.join(__dirname, '../../src/ui/settings-webview/app.tsx'), 'utf8');

    assert.ok(source.includes('const EMPTY_ARRAY'), 'Selectors should use stable empty arrays');
    assert.ok(source.includes('useMemo(() => buildEnvironmentInstanceChoices'), 'Environment choice derivation should be memoized');
    assert.ok(source.includes('useMemo(() => allInstances.filter'), 'Managed instance filtering should be memoized');
    assert.ok(source.includes('useMemo(() => [...providers].sort'), 'Provider sorting should be memoized');
    assert.ok(source.includes('state.jobs[instance.id]'), 'Managed instance cards should subscribe to the specific setup job');
    assert.ok(source.includes('state.jobs[instanceId]'), 'Managed instance detail should subscribe to the specific setup job');
    assert.ok(source.includes('selectedInstanceId ? state.jobs[selectedInstanceId] : undefined'), 'Environment form status should subscribe to the selected instance job');
});

function createInstanceFacade() {
    const calls = { status: 0, access: 0 };
    const facade: InstanceEnrichmentFacade = {
        async status() {
            calls.status += 1;
            return { status: 'ready', ready: true, instance: { ownerCredentialsAvailable: true } };
        },
        async resolveInstanceAccess() {
            calls.access += 1;
            return {
                authUrl: '',
                publicN8nUrl: '',
                publicUrlEnabled: false,
                apiBaseUrl: 'http://localhost:5678',
                warnings: [],
                tunnel: { running: false },
            };
        },
    };
    return { facade, calls };
}

test('Configuration instance enrichment cache reuses repeat calls within TTL', async () => {
    const cache = new ConfigurationInstanceEnrichmentCache();
    const { facade, calls } = createInstanceFacade();
    const instance = { id: 'managed-1', mode: 'managed-local-docker', baseUrl: 'http://localhost:5678' };

    const first = await cache.enrich(instance, facade);
    const second = await cache.enrich(instance, facade);

    assert.strictEqual(first, second);
    assert.strictEqual(calls.status, 1);
    assert.strictEqual(calls.access, 1);
    assert.strictEqual(second.runtimeStatus, 'ready');
});

test('Configuration instance enrichment cache deduplicates concurrent reads', async () => {
    const calls = { status: 0, access: 0 };
    let releaseStatus: (() => void) | undefined;
    const facade: InstanceEnrichmentFacade = {
        async status() {
            calls.status += 1;
            return await new Promise<InstanceStatusResponse>((resolve) => {
                releaseStatus = () => resolve({ status: 'ready', ready: true });
            });
        },
        async resolveInstanceAccess() {
            calls.access += 1;
            return {
                authUrl: '',
                publicN8nUrl: '',
                publicUrlEnabled: false,
                apiBaseUrl: 'http://localhost:5678',
                warnings: [],
                tunnel: { running: false },
            };
        },
    };
    const cache = new ConfigurationInstanceEnrichmentCache();
    const instance = { id: 'managed-1', mode: 'managed-local-docker', baseUrl: 'http://localhost:5678' };

    const first = cache.enrich(instance, facade);
    const second = cache.enrich(instance, facade);
    assert.strictEqual(calls.status, 1);

    releaseStatus?.();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    assert.strictEqual(firstResult, secondResult);
    assert.strictEqual(calls.status, 1);
    assert.strictEqual(calls.access, 1);
});

test('Configuration instance enrichment cache fetches fresh data after TTL expiry', async () => {
    const originalNow = Date.now;
    let now = 10_000;
    Date.now = () => now;
    try {
        const cache = new ConfigurationInstanceEnrichmentCache();
        const { facade, calls } = createInstanceFacade();
        const instance = { id: 'managed-1', mode: 'managed-local-docker', baseUrl: 'http://localhost:5678' };

        await cache.enrich(instance, facade);
        now += INSTANCE_ENRICHMENT_CACHE_TTL_MS + 1;
        await cache.enrich(instance, facade);

        assert.strictEqual(calls.status, 2);
        assert.strictEqual(calls.access, 2);
    } finally {
        Date.now = originalNow;
    }
});

test('Configuration instance enrichment cache refetches after invalidation', async () => {
    const cache = new ConfigurationInstanceEnrichmentCache();
    const { facade, calls } = createInstanceFacade();
    const instance = { id: 'managed-1', mode: 'managed-local-docker', baseUrl: 'http://localhost:5678' };

    await cache.enrich(instance, facade);
    cache.invalidate(instance.id);
    await cache.enrich(instance, facade);

    assert.strictEqual(calls.status, 2);
    assert.strictEqual(calls.access, 2);
});

test('Configuration instance enrichment cache evicts the oldest entry beyond its size limit', async () => {
    const cache = new ConfigurationInstanceEnrichmentCache();
    const { facade, calls } = createInstanceFacade();

    for (let index = 0; index <= 100; index += 1) {
        await cache.enrich({ id: `managed-${index}`, mode: 'managed-local-docker', baseUrl: `http://localhost:${5678 + index}` }, facade);
    }
    await cache.enrich({ id: 'managed-0', mode: 'managed-local-docker', baseUrl: 'http://localhost:5678' }, facade);

    assert.strictEqual(calls.status, 102);
    assert.strictEqual(calls.access, 102);
});

test('Configuration instance enrichment cache skips caching when instance id is missing', async () => {
    const cache = new ConfigurationInstanceEnrichmentCache();
    const { facade, calls } = createInstanceFacade();

    const result = await cache.enrich({ baseUrl: 'http://localhost:5678' }, facade);

    assert.strictEqual(calls.status, 0);
    assert.strictEqual(calls.access, 0);
    assert.strictEqual(result.runtimeStatus, 'unknown');
});

test('Configuration instance enrichment cache times out hung facade calls', async () => {
    const calls = { status: 0, access: 0 };
    const facade: InstanceEnrichmentFacade = {
        async status() {
            calls.status += 1;
            return await new Promise(() => undefined);
        },
        async resolveInstanceAccess() {
            calls.access += 1;
            return {
                authUrl: '',
                publicN8nUrl: '',
                publicUrlEnabled: false,
                apiBaseUrl: 'http://localhost:5678',
                warnings: [],
                tunnel: { running: false },
            };
        },
    };
    const cache = new ConfigurationInstanceEnrichmentCache(INSTANCE_ENRICHMENT_CACHE_TTL_MS, 1);

    const result = await cache.enrich({ id: 'managed-1', mode: 'managed-local-docker', baseUrl: 'http://localhost:5678' }, facade);

    assert.strictEqual(calls.status, 1);
    assert.strictEqual(calls.access, 0);
    assert.strictEqual(result.runtimeStatus, 'unknown');
    assert.ok(String(result.runtimeBlockedMessage).includes('Runtime status timed out after 1ms'));
});
