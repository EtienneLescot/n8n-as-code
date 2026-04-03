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
        mockAxiosCall.mockReset();
        mockAxiosGet.mockReset();
        mockAxiosPost.mockReset();
        mockAxiosPut.mockReset();
        mockAxiosDelete.mockReset();
        mockAxiosCreate.mockReset();
        mockAxiosCreate.mockImplementation((config?: { baseURL?: string; headers?: Record<string, string> }) => ({
            defaults: { baseURL: config?.baseURL ?? '' },
            get: mockAxiosGet,
            post: mockAxiosPost,
            put: mockAxiosPut,
            delete: mockAxiosDelete,
        }));
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
            workflowId: '1',
            nodeId: 'node-1',
            nodeName: 'Inbound Webhook',
            webhookId: undefined,
            webhookPath: 'my-path',
            pathSource: 'explicit',
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
        expect(withWebhookId?.pathSource).toBe('webhookId');
        expect(withNodeId?.webhookPath).toBe('node-2');
        expect(withNodeId?.pathSource).toBe('nodeId');
    });

    it('builds the expected test URL for webhook, form and chat triggers', () => {
        const client = new N8nApiClient({ host: 'https://n8n.local/', apiKey: 'secret' });

        expect(client.buildTestUrl({
            type: 'webhook',
            workflowId: 'wf-1',
            nodeId: '1',
            nodeName: 'Inbound Webhook',
            webhookPath: 'webhook-path',
            pathSource: 'explicit',
            httpMethod: 'POST',
        })).toBe('https://n8n.local/webhook-test/webhook-path');

        expect(client.buildTestUrl({
            type: 'form',
            workflowId: 'wf-2',
            nodeId: '2',
            nodeName: 'Form',
            webhookPath: 'form-path',
            pathSource: 'explicit',
        })).toBe('https://n8n.local/form-test/form-path');

        expect(client.buildTestUrl({
            type: 'chat',
            workflowId: 'wf-3',
            nodeId: '3',
            nodeName: 'Chat',
            webhookPath: 'chat-path',
            pathSource: 'explicit',
        })).toBe('https://n8n.local/webhook-test/chat-path/chat');
    });

    it('prefixes webhookId for dynamic explicit paths (containing ":")', () => {
        const client = new N8nApiClient({ host: 'https://n8n.local/', apiKey: 'secret' });

        // Dynamic path: should be prefixed with webhookId
        expect(client.buildTestUrl({
            type: 'webhook',
            workflowId: 'wf-1',
            nodeId: '1',
            nodeName: 'Webhook',
            webhookPath: ':id/process',
            webhookId: 'webhook-uuid',
            pathSource: 'explicit',
            httpMethod: 'POST',
        })).toBe('https://n8n.local/webhook-test/webhook-uuid/%3Aid/process');

        // Static path: should NOT be prefixed with webhookId even when webhookId is provided
        expect(client.buildTestUrl({
            type: 'webhook',
            workflowId: 'wf-2',
            nodeId: '2',
            nodeName: 'Webhook',
            webhookPath: 'static-path',
            webhookId: 'webhook-uuid',
            pathSource: 'explicit',
            httpMethod: 'GET',
        })).toBe('https://n8n.local/webhook-test/static-path');
    });

    it('falls back to a placeholder Personal project when projects endpoint returns 403', async () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });

        mockAxiosGet.mockRejectedValueOnce({
            response: {
                status: 403,
                data: { message: 'unavailable' },
            },
            message: 'Request failed with status code 403',
        });

        await expect(client.getProjects()).resolves.toEqual([
            expect.objectContaining({
                id: 'personal',
                name: 'Personal',
                type: 'personal',
            }),
        ]);
        expect(mockAxiosGet).toHaveBeenNthCalledWith(1, '/api/v1/projects');
    });

    it('does not filter out workflows when using the placeholder personal project id', async () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });

        mockAxiosGet
            .mockResolvedValueOnce({
                data: {
                    data: [
                        {
                            id: 'wf-1',
                            name: 'Workflow 1',
                            shared: [{ projectId: 'actual-project-id' }],
                            active: false,
                            nodes: [],
                            connections: {},
                        },
                    ],
                    meta: { total: 1 },
                },
                headers: {},
            })
            .mockRejectedValueOnce({
                response: {
                    status: 403,
                    data: { message: 'unavailable' },
                },
                message: 'Request failed with status code 403',
            });

        const workflows = await client.getAllWorkflows('personal');

        expect(workflows).toHaveLength(1);
        expect(workflows[0]).toMatchObject({
            id: 'wf-1',
            projectId: 'actual-project-id',
        });
        expect(mockAxiosGet).toHaveBeenCalledTimes(2);
        expect(mockAxiosGet).toHaveBeenNthCalledWith(1, '/api/v1/workflows');
        expect(mockAxiosGet).toHaveBeenNthCalledWith(2, '/api/v1/projects');
    });

    it('normalizes webhook paths with leading slashes and special characters', () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });

        // Leading slash should be stripped
        expect(client.buildTestUrl({
            type: 'webhook',
            workflowId: 'wf-1',
            nodeId: '1',
            nodeName: 'Webhook',
            webhookPath: '/my-path',
            pathSource: 'explicit',
            httpMethod: 'POST',
        })).toBe('https://n8n.local/webhook-test/my-path');

        // Multiple leading slashes
        expect(client.buildTestUrl({
            type: 'form',
            workflowId: 'wf-2',
            nodeId: '2',
            nodeName: 'Form',
            webhookPath: '//form path with spaces',
            pathSource: 'explicit',
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

    it('uses explicit query params when provided for GET webhooks', async () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });
        vi.spyOn(client, 'getWorkflow').mockResolvedValue(createMockWorkflow({
            nodes: [
                {
                    id: 'node-1',
                    name: 'Webhook',
                    type: 'n8n-nodes-base.webhook',
                    parameters: { path: 'wf', httpMethod: 'GET' },
                },
            ],
        }));
        mockAxiosCall.mockResolvedValue({
            status: 200,
            data: { ok: true },
        });

        await client.testWorkflow('wf-1', {
            data: { ignored: 'body-for-get' },
            query: { chatInput: 'hello' },
        });

        expect(mockAxiosCall).toHaveBeenCalledWith(expect.objectContaining({
            method: 'GET',
            url: 'https://n8n.local/webhook-test/wf',
            data: undefined,
            params: { chatInput: 'hello' },
        }));
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

    it('classifies unarmed test webhooks as runtime-state issues', async () => {
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
            status: 404,
            data: {
                message: 'The requested webhook "wf" is not registered.',
                hint: "Click the 'Execute workflow' button on the canvas, then try again.",
            },
        });

        const result = await client.testWorkflow('wf-1', { data: { foo: 'bar' } });

        expect(result.success).toBe(false);
        expect(result.errorClass).toBe('runtime-state');
        expect(result.notes?.join(' ')).toMatch(/manual arm step|Execute workflow/i);
    });

    it('classifies missing production webhook registration as a runtime-state issue', async () => {
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
            status: 404,
            data: {
                message: 'The requested webhook "POST wf" is not registered.',
                hint: 'The workflow must be active for a production URL to run successfully.',
            },
        });

        const result = await client.testWorkflow('wf-1', { data: { foo: 'bar' }, prod: true });

        expect(result.success).toBe(false);
        expect(result.errorClass).toBe('runtime-state');
        expect(result.notes?.join(' ')).toMatch(/active\/published|runtime-state issue/i);
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
        expect(plan.payload?.notes.join(' ')).toMatch(/manual arm step|active\/published/i);
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

    it('posts to activate/deactivate endpoints and returns workflow objects on success', async () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });

        mockAxiosPost.mockResolvedValueOnce({ status: 200, data: { id: 'wf-1', active: true } });
        await expect(client.activateWorkflow('wf-1', true)).resolves.toEqual({ id: 'wf-1', active: true });
        expect(mockAxiosPost).toHaveBeenNthCalledWith(1, '/api/v1/workflows/wf-1/activate');

        mockAxiosPost.mockRejectedValueOnce(new Error('boom'));
        await expect(client.activateWorkflow('wf-1', false)).resolves.toBeNull();
        expect(mockAxiosPost).toHaveBeenNthCalledWith(2, '/api/v1/workflows/wf-1/deactivate');
    });

    it('falls back to fetching the workflow when activation response has no workflow body', async () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });
        mockAxiosPost.mockResolvedValueOnce({ status: 200, data: undefined });
        vi.spyOn(client, 'getWorkflow').mockResolvedValue({ id: 'wf-1', active: true } as any);

        await expect(client.activateWorkflow('wf-1', true)).resolves.toEqual({ id: 'wf-1', active: true });
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

    it('lists executions with query params and normalized IDs', async () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });

        mockAxiosGet.mockResolvedValueOnce({
            data: {
                data: [
                    {
                        id: 42,
                        finished: true,
                        mode: 'webhook',
                        retryOf: null,
                        retrySuccessId: null,
                        startedAt: '2026-03-30T10:00:00.000Z',
                        stoppedAt: '2026-03-30T10:00:01.000Z',
                        workflowId: 7,
                        waitTill: null,
                        status: 'error',
                    },
                ],
                nextCursor: 'cursor-2',
            },
        });

        await expect(client.listExecutions({
            workflowId: '7',
            status: 'error',
            limit: 5,
        })).resolves.toEqual({
            data: [
                {
                    id: '42',
                    finished: true,
                    mode: 'webhook',
                    retryOf: null,
                    retrySuccessId: null,
                    startedAt: '2026-03-30T10:00:00.000Z',
                    stoppedAt: '2026-03-30T10:00:01.000Z',
                    workflowId: '7',
                    waitTill: null,
                    customData: undefined,
                    status: 'error',
                },
            ],
            nextCursor: 'cursor-2',
        });
        expect(mockAxiosGet).toHaveBeenCalledWith('/api/v1/executions', {
            params: {
                workflowId: '7',
                status: 'error',
                limit: 5,
            },
        });
    });

    it('fetches a single execution with includeData=true', async () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });

        mockAxiosGet.mockResolvedValueOnce({
            data: {
                id: 42,
                finished: true,
                mode: 'webhook',
                startedAt: '2026-03-30T10:00:00.000Z',
                stoppedAt: '2026-03-30T10:00:01.000Z',
                workflowId: 7,
                waitTill: null,
                status: 'error',
                data: { resultData: { error: { message: 'OpenAI quota exceeded' } } },
                workflowData: { name: 'Agent Workflow' },
                executedNode: 'OpenAI Chat Model',
                triggerNode: 'Webhook',
            },
        });

        await expect(client.getExecution('42', { includeData: true })).resolves.toEqual({
            id: '42',
            finished: true,
            mode: 'webhook',
            retryOf: null,
            retrySuccessId: null,
            startedAt: '2026-03-30T10:00:00.000Z',
            stoppedAt: '2026-03-30T10:00:01.000Z',
            workflowId: '7',
            waitTill: null,
            customData: undefined,
            status: 'error',
            data: { resultData: { error: { message: 'OpenAI quota exceeded' } } },
            workflowData: { name: 'Agent Workflow' },
            executedNode: 'OpenAI Chat Model',
            triggerNode: 'Webhook',
        });
        expect(mockAxiosGet).toHaveBeenCalledWith('/api/v1/executions/42', {
            params: { includeData: true },
        });
    });
});
