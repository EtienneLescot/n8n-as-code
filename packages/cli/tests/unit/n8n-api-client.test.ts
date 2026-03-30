import { beforeEach, describe, expect, it, vi } from 'vitest';
import { N8nApiClient } from '../../src/core/services/n8n-api-client.js';
import { createMockWorkflow } from '../helpers/test-helpers.js';

const { mockAxiosCall, mockAxiosGet, mockAxiosPost, mockAxiosPut, mockAxiosDelete, mockAxiosCreate } = vi.hoisted(() => ({
    mockAxiosCall: vi.fn(),
    mockAxiosGet: vi.fn(),
    mockAxiosPost: vi.fn(),
    mockAxiosPut: vi.fn(),
    mockAxiosDelete: vi.fn(),
    mockAxiosCreate: vi.fn(),
}));

vi.mock('axios', () => {
    mockAxiosCreate.mockImplementation((config?: { baseURL?: string; headers?: Record<string, string> }) => ({
        defaults: { baseURL: config?.baseURL ?? '' },
        get: mockAxiosGet,
        post: mockAxiosPost,
        put: mockAxiosPut,
        delete: mockAxiosDelete,
    }));

    return {
        default: Object.assign(mockAxiosCall, {
            create: mockAxiosCreate,
        }),
    };
});

describe('N8nApiClient test workflow support', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('detects a webhook trigger and uses explicit path and HTTP method', () => {
        const client = new N8nApiClient({ host: 'https://n8n.local/', apiKey: 'secret' });
        const trigger = client.detectTrigger(createMockWorkflow({
            nodes: [
                {
                    id: 'node-1',
                    name: 'Inbound Webhook',
                    type: 'n8n-nodes-base.webhook',
                    parameters: {
                        path: 'my-path',
                        httpMethod: 'post',
                    },
                },
            ],
        }));

        expect(trigger).toEqual({
            type: 'webhook',
            nodeId: 'node-1',
            nodeName: 'Inbound Webhook',
            webhookPath: 'my-path',
            httpMethod: 'POST',
        });
    });

    it('falls back to webhookId and node id when trigger path is missing', () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });

        const withWebhookId = client.detectTrigger(createMockWorkflow({
            nodes: [
                {
                    id: 'node-1',
                    name: 'Chat Trigger',
                    type: '@n8n/n8n-nodes-langchain.chatTrigger',
                    webhookId: 'webhook-123',
                    parameters: {},
                },
            ],
        }));

        const withNodeId = client.detectTrigger(createMockWorkflow({
            nodes: [
                {
                    id: 'node-2',
                    name: 'Form Trigger',
                    type: 'n8n-nodes-base.formTrigger',
                    parameters: {},
                },
            ],
        }));

        expect(withWebhookId?.webhookPath).toBe('webhook-123');
        expect(withNodeId?.webhookPath).toBe('node-2');
    });

    it('builds the expected test URL for webhook, form and chat triggers', () => {
        const client = new N8nApiClient({ host: 'https://n8n.local/', apiKey: 'secret' });

        expect(client.buildTestUrl({
            type: 'webhook',
            nodeId: '1',
            nodeName: 'Webhook',
            webhookPath: 'webhook-path',
            httpMethod: 'POST',
        })).toBe('https://n8n.local/webhook-test/webhook-path');

        expect(client.buildTestUrl({
            type: 'form',
            nodeId: '2',
            nodeName: 'Form',
            webhookPath: 'form-path',
        })).toBe('https://n8n.local/form-test/form-path');

        expect(client.buildTestUrl({
            type: 'chat',
            nodeId: '3',
            nodeName: 'Chat',
            webhookPath: 'chat-path',
        })).toBe('https://n8n.local/webhook-test/chat-path/chat');
    });

    it('normalizes webhook paths with leading slashes and special characters', () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });

        // Leading slash should be stripped
        expect(client.buildTestUrl({
            type: 'webhook',
            nodeId: '1',
            nodeName: 'Webhook',
            webhookPath: '/my-path',
            httpMethod: 'POST',
        })).toBe('https://n8n.local/webhook-test/my-path');

        // Multiple leading slashes
        expect(client.buildTestUrl({
            type: 'form',
            nodeId: '2',
            nodeName: 'Form',
            webhookPath: '//form path with spaces',
        })).toBe('https://n8n.local/form-test/form%20path%20with%20spaces');
    });

    it('classifies missing credentials as a config gap', async () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });
        vi.spyOn(client, 'getWorkflow').mockResolvedValue(createMockWorkflow({
            nodes: [
                {
                    id: 'node-1',
                    name: 'Webhook',
                    type: 'n8n-nodes-base.webhook',
                    parameters: { path: 'wf', httpMethod: 'POST' },
                },
            ],
        }));
        mockAxiosCall.mockResolvedValue({
            status: 401,
            data: { message: 'Credentials are missing for this node' },
        });

        const result = await client.testWorkflow('wf-1', { data: { foo: 'bar' } });

        expect(result.success).toBe(false);
        expect(result.errorClass).toBe('config-gap');
        expect(result.statusCode).toBe(401);
        expect(result.webhookUrl).toBe('https://n8n.local/webhook-test/wf');
    });

    it('classifies expression failures as wiring errors', async () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });
        vi.spyOn(client, 'getWorkflow').mockResolvedValue(createMockWorkflow({
            nodes: [
                {
                    id: 'node-1',
                    name: 'Webhook',
                    type: 'n8n-nodes-base.webhook',
                    parameters: { path: 'wf', httpMethod: 'POST' },
                },
            ],
        }));
        mockAxiosCall.mockResolvedValue({
            status: 500,
            data: { message: "Can't get data for expression" },
        });

        const result = await client.testWorkflow('wf-1', { data: { foo: 'bar' } });

        expect(result.success).toBe(false);
        expect(result.errorClass).toBe('wiring-error');
        expect(result.statusCode).toBe(500);
    });

    it('returns a non-failing classification for schedule triggers', async () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });
        vi.spyOn(client, 'getWorkflow').mockResolvedValue(createMockWorkflow({
            nodes: [
                {
                    id: 'node-1',
                    name: 'Schedule Trigger',
                    type: 'n8n-nodes-base.scheduleTrigger',
                    parameters: {},
                },
            ],
        }));

        const result = await client.testWorkflow('wf-1');

        expect(result.success).toBe(false);
        expect(result.errorClass).toBeNull();
        expect(result.errorMessage).toMatch(/cannot be called via HTTP/i);
    });

    it('builds a test plan with inferred payload fields', async () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });
        vi.spyOn(client, 'getWorkflow').mockResolvedValue(createMockWorkflow({
            name: 'Webhook Workflow',
            nodes: [
                {
                    id: 'node-1',
                    name: 'Webhook',
                    type: 'n8n-nodes-base.webhook',
                    parameters: { path: 'wf', httpMethod: 'POST' },
                },
                {
                    id: 'node-2',
                    name: 'Set',
                    type: 'n8n-nodes-base.set',
                    parameters: {
                        values: {
                            string: [
                                { name: 'email', value: '={{ $json.body.email }}' },
                                { name: 'message', value: '={{ $json.body.message }}' },
                            ],
                            boolean: [
                                { name: 'isPriority', value: '={{ $json.query.priority }}' },
                            ],
                        },
                    },
                },
            ],
        }));

        const plan = await client.getTestPlan('wf-1');

        expect(plan.testable).toBe(true);
        expect(plan.endpoints.testUrl).toBe('https://n8n.local/webhook-test/wf');
        expect(plan.endpoints.productionUrl).toBe('https://n8n.local/webhook/wf');
        expect(plan.payload?.inferred).toEqual({
            body: {
                email: 'user@example.com',
                message: 'example message',
            },
            query: {
                priority: 'example',
            },
        });
        expect(plan.payload?.fields.map(field => `${field.source}.${field.path}`)).toEqual([
            'body.email',
            'body.message',
            'query.priority',
        ]);
    });

    it('returns a non-testable plan for schedule triggers', async () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });
        vi.spyOn(client, 'getWorkflow').mockResolvedValue(createMockWorkflow({
            name: 'Schedule Workflow',
            nodes: [
                {
                    id: 'node-1',
                    name: 'Schedule Trigger',
                    type: 'n8n-nodes-base.scheduleTrigger',
                    parameters: {},
                },
            ],
        }));

        const plan = await client.getTestPlan('wf-1');

        expect(plan.testable).toBe(false);
        expect(plan.reason).toMatch(/cannot be invoked via HTTP/i);
        expect(plan.payload).toBeNull();
    });

    it('posts to activate/deactivate endpoints and returns false on failure', async () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });

        mockAxiosPost.mockResolvedValueOnce({ status: 200 });
        await expect(client.activateWorkflow('wf-1', true)).resolves.toBe(true);
        expect(mockAxiosPost).toHaveBeenNthCalledWith(1, '/api/v1/workflows/wf-1/activate');

        mockAxiosPost.mockRejectedValueOnce(new Error('boom'));
        await expect(client.activateWorkflow('wf-1', false)).resolves.toBe(false);
        expect(mockAxiosPost).toHaveBeenNthCalledWith(2, '/api/v1/workflows/wf-1/deactivate');
    });

    it('paginates listCredentials() until nextCursor is empty', async () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });

        mockAxiosGet
            .mockResolvedValueOnce({
                data: {
                    data: [{ id: 'cred-1', name: 'Primary', type: 'httpBasicAuth' }],
                    nextCursor: 'cursor-2',
                },
            })
            .mockResolvedValueOnce({
                data: {
                    data: [{ id: 'cred-2', name: 'Backup', type: 'httpBasicAuth' }],
                    nextCursor: undefined,
                },
            });

        await expect(client.listCredentials()).resolves.toEqual([
            { id: 'cred-1', name: 'Primary', type: 'httpBasicAuth' },
            { id: 'cred-2', name: 'Backup', type: 'httpBasicAuth' },
        ]);
        expect(mockAxiosGet).toHaveBeenNthCalledWith(1, '/api/v1/credentials', { params: {} });
        expect(mockAxiosGet).toHaveBeenNthCalledWith(2, '/api/v1/credentials', { params: { cursor: 'cursor-2' } });
    });

    it('posts createCredential() payloads without remapping fields', async () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });
        const payload = {
            type: 'slackApi',
            name: 'Slack Prod',
            data: { accessToken: 'secret' },
            projectId: 'proj-1',
        };

        mockAxiosPost.mockResolvedValueOnce({ data: { id: 'cred-1', ...payload } });

        await expect(client.createCredential(payload)).resolves.toEqual({ id: 'cred-1', ...payload });
        expect(mockAxiosPost).toHaveBeenCalledWith('/api/v1/credentials', payload);
    });
});
