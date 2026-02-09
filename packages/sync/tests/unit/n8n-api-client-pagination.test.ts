import test from 'node:test';
import assert from 'node:assert';
import axios from 'axios';
import { N8nApiClient } from '../../src/services/n8n-api-client.js';

test('N8nApiClient getAllWorkflows follows cursor pagination', async () => {
    const originalCreate = (axios as any).create;
    const calls: Array<{ url: string; params?: Record<string, unknown> }> = [];

    const buildWorkflows = (start: number, count: number) => {
        return Array.from({ length: count }, (_, idx) => ({
            id: `wf_${start + idx}`,
            name: `Workflow ${start + idx}`
        }));
    };

    const fakeClient = {
        get: async (url: string, config?: { params?: Record<string, unknown> }) => {
            calls.push({ url, params: config?.params });

            if (url === '/api/v1/projects') {
                return { data: { data: [] } };
            }

            if (url === '/api/v1/workflows') {
                const cursor = config?.params?.cursor as string | undefined;
                if (!cursor) {
                    return {
                        data: {
                            data: buildWorkflows(0, 100),
                            nextCursor: 'cursor_1'
                        }
                    };
                }

                if (cursor === 'cursor_1') {
                    return {
                        data: {
                            data: buildWorkflows(100, 2),
                            nextCursor: undefined
                        }
                    };
                }

                return { data: { data: [], nextCursor: undefined } };
            }

            throw new Error(`Unexpected URL ${url}`);
        }
    };

    (axios as any).create = () => fakeClient;

    try {
        const client = new N8nApiClient({ host: 'https://example.com', apiKey: 'test-key' });
        const workflows = await client.getAllWorkflows();

        assert.strictEqual(workflows.length, 102);
        assert.ok(calls.some(call => call.params?.cursor === 'cursor_1'));
    } finally {
        (axios as any).create = originalCreate;
    }
});

test('N8nApiClient getAllWorkflows honors total header without cursor', async () => {
    const originalCreate = (axios as any).create;
    const calls: Array<{ url: string; params?: Record<string, unknown> }> = [];

    const buildWorkflows = (start: number, count: number) => {
        return Array.from({ length: count }, (_, idx) => ({
            id: `wf_${start + idx}`,
            name: `Workflow ${start + idx}`
        }));
    };

    const fakeClient = {
        get: async (url: string, config?: { params?: Record<string, unknown> }) => {
            calls.push({ url, params: config?.params });

            if (url === '/api/v1/projects') {
                return { data: { data: [] } };
            }

            if (url === '/api/v1/workflows') {
                return {
                    data: {
                        data: buildWorkflows(0, 3)
                    },
                    headers: {
                        'x-total-count': '3'
                    }
                };
            }

            throw new Error(`Unexpected URL ${url}`);
        }
    };

    (axios as any).create = () => fakeClient;

    try {
        const client = new N8nApiClient({ host: 'https://example.com', apiKey: 'test-key' });
        const workflows = await client.getAllWorkflows();

        assert.strictEqual(workflows.length, 3);
        assert.ok(!calls.some(call => call.params?.cursor));
    } finally {
        (axios as any).create = originalCreate;
    }
});
