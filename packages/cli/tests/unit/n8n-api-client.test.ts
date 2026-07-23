import { beforeEach, describe, expect, it, vi } from 'vitest';
import { N8nApiClient, buildCaBundle } from '../../src/core/services/n8n-api-client.js';
import { createMockWorkflow } from '../helpers/test-helpers.js';

const { mockAxiosCall, mockAxiosGet, mockAxiosPost, mockAxiosPut, mockAxiosDelete, mockAxiosCreate } = vi.hoisted(() => ({
    mockAxiosCall: vi.fn(),
    mockAxiosGet: vi.fn(),
    mockAxiosPost: vi.fn(),
    mockAxiosPut: vi.fn(),
    mockAxiosDelete: vi.fn(),
    mockAxiosCreate: vi.fn(),
}));

type MockAxiosCreateConfig = {
    baseURL?: string;
    headers?: Record<string, string>;
    httpAgent?: unknown;
    httpsAgent?: unknown;
};

vi.mock('axios', () => {
    mockAxiosCreate.mockImplementation((config?: MockAxiosCreateConfig) => ({
        defaults: { baseURL: config?.baseURL ?? '' },
        get: mockAxiosGet,
        post: mockAxiosPost,
        put: mockAxiosPut,
        delete: mockAxiosDelete,
    }));

    return {
        default: Object.assign(mockAxiosCall, {
            create: mockAxiosCreate,
            get: mockAxiosCall,
        }),
    };
});

// Mock tls to control getCACertificates behaviour across tests.
// By default, no system CAs are returned so the baseline tests remain deterministic.
vi.mock('tls', async (importOriginal) => {
    const actual = await importOriginal<typeof import('tls')>();
    return {
        ...actual,
        getCACertificates: vi.fn().mockReturnValue([]),
    };
});

// Mock fs to control NODE_EXTRA_CA_CERTS file reads.
vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        readFileSync: vi.fn().mockImplementation(actual.readFileSync),
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
        mockAxiosCreate.mockImplementation((config?: MockAxiosCreateConfig) => ({
            defaults: { baseURL: config?.baseURL ?? '' },
            get: mockAxiosGet,
            post: mockAxiosPost,
            put: mockAxiosPut,
            delete: mockAxiosDelete,
        }));
        // Reset the TLS environment so each test starts clean.
        delete process.env.NODE_EXTRA_CA_CERTS;
        delete process.env.N8NAC_INSECURE_TLS;
    });

    it('configures shared agents with IPv4-first DNS lookup and no extra CAs', () => {
        new N8nApiClient({ host: 'https://n8n.local/', apiKey: 'secret' });

        const config = mockAxiosCreate.mock.calls[0][0];
        expect(config.httpAgent).toBeDefined();
        expect(config.httpsAgent).toBeDefined();
        expect(typeof config.httpAgent.options.lookup).toBe('function');
        expect(config.httpsAgent.options.lookup).toBe(config.httpAgent.options.lookup);
        // `n8n.local` is a private-network name, so without extra CAs the agent falls back to
        // rejectUnauthorized:false for backward compatibility with self-signed instances.
        expect(config.httpsAgent.options.rejectUnauthorized).toBe(false);
        expect(config.httpsAgent.options.ca).toBeUndefined();
    });

    it('enables certificate validation when NODE_EXTRA_CA_CERTS is set', async () => {
        const { readFileSync } = await import('fs');
        vi.mocked(readFileSync).mockReturnValue('-----BEGIN CERTIFICATE-----\nextra\n-----END CERTIFICATE-----\n' as any);
        process.env.NODE_EXTRA_CA_CERTS = '/custom/ca.pem';

        new N8nApiClient({ host: 'https://n8n.local/', apiKey: 'secret' });

        const config = mockAxiosCreate.mock.calls[0][0];
        expect(config.httpsAgent.options.rejectUnauthorized).toBe(true);
        expect(Array.isArray(config.httpsAgent.options.ca)).toBe(true);
        // Anchors are stored as trimmed PEM blocks, so the trailing newline is gone.
        expect(config.httpsAgent.options.ca).toContain('-----BEGIN CERTIFICATE-----\nextra\n-----END CERTIFICATE-----');
    });

    it('keeps verification off when only the OS trust store is available', async () => {
        // The regression this guards: gating rejectUnauthorized on "the bundle is non-empty"
        // turns verification on for every host, because tls.getCACertificates('system') returns
        // anchors on nearly every machine — breaking the plain self-signed instances on the local
        // network that work today without the user configuring anything.
        const tlsMod = await import('tls');
        vi.mocked((tlsMod as any).getCACertificates).mockReturnValue([
            '-----BEGIN CERTIFICATE-----\nsystem-anchor\n-----END CERTIFICATE-----',
        ]);

        new N8nApiClient({ host: 'https://n8n.local/', apiKey: 'secret' });

        const config = mockAxiosCreate.mock.calls[0][0];
        expect(config.httpsAgent.options.rejectUnauthorized).toBe(false);
        // The anchors are still trusted, they just do not force strict verification on.
        expect(config.httpsAgent.options.ca).toContain('-----BEGIN CERTIFICATE-----\nsystem-anchor\n-----END CERTIFICATE-----');
    });

    it('verifies the certificate of a public host even when no anchor is configured', () => {
        // The hole this closes: a public n8n serves a publicly trusted certificate, so there is
        // no compatibility reason to skip verification — skipping it just makes the API key
        // interceptable by anyone on the path.
        new N8nApiClient({ host: 'https://n8n.example.com/', apiKey: 'secret' });

        const config = mockAxiosCreate.mock.calls[0][0];
        expect(config.httpsAgent.options.rejectUnauthorized).toBe(true);
    });

    it('keeps verification off for an unconfigured loopback host', () => {
        // The compatibility case: a plain self-signed n8n on localhost keeps working with no
        // configuration, which is what the fallback exists for.
        new N8nApiClient({ host: 'https://localhost:5678/', apiKey: 'secret' });

        const config = mockAxiosCreate.mock.calls[0][0];
        expect(config.httpsAgent.options.rejectUnauthorized).toBe(false);
    });

    it('verifies a loopback host once NODE_EXTRA_CA_CERTS is set', async () => {
        const { readFileSync } = await import('fs');
        vi.mocked(readFileSync).mockReturnValue('-----BEGIN CERTIFICATE-----\nextra\n-----END CERTIFICATE-----\n' as any);
        process.env.NODE_EXTRA_CA_CERTS = '/custom/ca.pem';

        new N8nApiClient({ host: 'https://localhost:5678/', apiKey: 'secret' });

        const config = mockAxiosCreate.mock.calls[0][0];
        expect(config.httpsAgent.options.rejectUnauthorized).toBe(true);
    });

    it('lets N8NAC_INSECURE_TLS opt out even when an anchor is configured', async () => {
        // The escape hatch for a self-signed certificate on a public host name, which is the only
        // setup the private-network fallback does not already cover. It has to win over a
        // configured anchor too, otherwise it could not be used to unblock one.
        const { readFileSync } = await import('fs');
        vi.mocked(readFileSync).mockReturnValue('-----BEGIN CERTIFICATE-----\nextra\n-----END CERTIFICATE-----\n' as any);
        process.env.NODE_EXTRA_CA_CERTS = '/custom/ca.pem';
        process.env.N8NAC_INSECURE_TLS = '1';

        new N8nApiClient({ host: 'https://n8n.example.com/', apiKey: 'secret' });

        const config = mockAxiosCreate.mock.calls[0][0];
        expect(config.httpsAgent.options.rejectUnauthorized).toBe(false);
    });

    it('asserts API access through the authenticated workflows endpoint', async () => {
        mockAxiosGet.mockResolvedValueOnce({ data: { data: [] } });
        const client = new N8nApiClient({ host: 'https://n8n.local/', apiKey: 'secret' });

        await expect(client.assertApiAccess()).resolves.toBeUndefined();

        expect(mockAxiosGet).toHaveBeenCalledWith('/api/v1/workflows');
    });

    it('surfaces authentication failures when asserting API access', async () => {
        const unauthorized = Object.assign(new Error('Request failed with status code 401'), {
            response: { status: 401 },
        });
        mockAxiosGet.mockRejectedValueOnce(unauthorized);
        const client = new N8nApiClient({ host: 'https://n8n.local/', apiKey: 'bad-key' });

        await expect(client.assertApiAccess()).rejects.toMatchObject({
            response: { status: 401 },
        });
    });

    it('fetches public project folders with pagination', async () => {
        mockAxiosGet
            .mockResolvedValueOnce({ data: { count: 2, data: [{ id: 'f1', name: 'Parent', parentFolderId: null }] } })
            .mockResolvedValueOnce({ data: { count: 2, data: [{ id: 'f2', name: 'Child', parentFolderId: 'f1' }] } });
        const client = new N8nApiClient({ host: 'https://n8n.local/', apiKey: 'secret' });

        await expect(client.getFolders('project-1')).resolves.toEqual([
            expect.objectContaining({ id: 'f1', name: 'Parent', parentFolderId: null }),
            expect.objectContaining({ id: 'f2', name: 'Child', parentFolderId: 'f1' }),
        ]);

        expect(mockAxiosGet).toHaveBeenCalledWith('/api/v1/projects/project-1/folders', expect.objectContaining({
            params: expect.objectContaining({ skip: '0', take: '100' }),
        }));
        expect(mockAxiosGet).toHaveBeenCalledWith('/api/v1/projects/project-1/folders', expect.objectContaining({
            params: expect.objectContaining({ skip: '100', take: '100' }),
        }));
    });

    it('only selects folder fields n8n accepts', async () => {
        mockAxiosGet.mockResolvedValueOnce({ data: { count: 1, data: [{ id: 'f1', name: 'Parent', parentFolder: null }] } });
        const client = new N8nApiClient({ host: 'https://n8n.local/', apiKey: 'secret' });

        await client.getFolders('project-1');

        // n8n's ListFolderQueryDto allow-list has `parentFolder`, not
        // `parentFolderId` — asking for the latter 400s the whole query.
        const select = JSON.parse(mockAxiosGet.mock.calls[0][1].params.select);
        expect(select).toContain('parentFolder');
        expect(select).not.toContain('parentFolderId');
    });

    it('resolves the folder project id from a workflow share when given the personal placeholder', async () => {
        mockAxiosGet.mockResolvedValueOnce({ data: { data: [
            { id: 'wf-1', shared: [{ projectId: 'real-project-id', role: 'workflow:owner' }] },
        ] } });
        const client = new N8nApiClient({ host: 'https://n8n.local/', apiKey: 'secret' });

        // GET /api/v1/projects is Enterprise-gated, so a Community instance has to
        // learn its own project id from a workflow payload instead.
        await expect(client.resolveFolderProjectId('personal')).resolves.toBe('real-project-id');
        expect(mockAxiosGet).toHaveBeenCalledWith('/api/v1/workflows', expect.objectContaining({
            params: expect.objectContaining({ limit: 1 }),
        }));

        // Memoized: a second call must not re-hit the API.
        await expect(client.resolveFolderProjectId('personal')).resolves.toBe('real-project-id');
        expect(mockAxiosGet).toHaveBeenCalledTimes(1);
    });

    it('passes a real project id straight through without an API round-trip', async () => {
        const client = new N8nApiClient({ host: 'https://n8n.local/', apiKey: 'secret' });

        await expect(client.resolveFolderProjectId('project-42')).resolves.toBe('project-42');
        expect(mockAxiosGet).not.toHaveBeenCalled();
    });

    it('resolves to null instead of throwing when no project id can be found', async () => {
        mockAxiosGet.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { response: { status: 403 } }));
        const client = new N8nApiClient({ host: 'https://n8n.local/', apiKey: 'secret' });

        await expect(client.resolveFolderProjectId('personal')).resolves.toBeNull();
    });

    it('preserves workflow parent folder metadata from workflow payloads', async () => {
        mockAxiosGet
            .mockResolvedValueOnce({ data: {
                id: 'wf-1',
                name: 'Foldered Workflow',
                active: true,
                nodes: [],
                connections: {},
                shared: [],
                parentFolderId: 'folder-1',
                parentFolder: { id: 'folder-1', name: 'Folder' },
            } })
            .mockRejectedValueOnce(new Error('tags unavailable'))
            .mockResolvedValueOnce({ data: { data: [] } });
        const client = new N8nApiClient({ host: 'https://n8n.local/', apiKey: 'secret' });

        await expect(client.getWorkflow('wf-1')).resolves.toEqual(expect.objectContaining({
            parentFolderId: 'folder-1',
            parentFolder: { id: 'folder-1', name: 'Folder' },
        }));
    });

    it('uses a bounded text request for HTML instance identity fallback', async () => {
        mockAxiosGet.mockRejectedValue(new Error('not available'));
        mockAxiosCall.mockResolvedValueOnce({ data: '<html><script>{"instanceId":"instance-from-html"}</script></html>' });
        const client = new N8nApiClient({ host: 'https://n8n.local/', apiKey: 'secret' });

        await expect(client.getInstanceIdentity()).resolves.toEqual({ id: 'instance-from-html' });

        expect(mockAxiosCall).toHaveBeenCalledWith('https://n8n.local/', expect.objectContaining({
            httpAgent: expect.anything(),
            httpsAgent: expect.anything(),
            timeout: 10_000,
            responseType: 'text',
        }));
    });

    it('uses shared agents when scraping the root page for health fallback', async () => {
        mockAxiosGet.mockRejectedValueOnce(new Error('healthz unavailable'));
        mockAxiosCall.mockResolvedValueOnce({ data: '{"release":"n8n@2.20.9"}' });
        const client = new N8nApiClient({ host: 'https://n8n.local/', apiKey: 'secret' });

        await expect(client.getHealth()).resolves.toEqual({ version: '2.20.9' });

        expect(mockAxiosCall).toHaveBeenCalledWith('https://n8n.local/', expect.objectContaining({
            httpAgent: expect.anything(),
            httpsAgent: expect.anything(),
            timeout: 10_000,
            responseType: 'text',
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

    it('strips fields rejected by the workflow create endpoint and restores description via update', async () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });
        mockAxiosPost.mockResolvedValueOnce({
            data: {
                id: 'wf-1',
                name: 'Created Workflow',
                nodes: [],
                connections: {},
                settings: { executionOrder: 'v1' },
            },
        });
        mockAxiosPut.mockResolvedValueOnce({
            status: 200,
            data: {
                id: 'wf-1',
                name: 'Created Workflow',
                description: 'Local-only workflow description',
                nodes: [],
                connections: {},
                settings: { executionOrder: 'v1' },
            },
        });

        await client.createWorkflow({
            id: 'local-id',
            name: 'Created Workflow',
            description: 'Local-only workflow description',
            active: false,
            tags: [{ id: 'tag-1', name: 'Tag 1' }],
            nodes: [],
            connections: {},
            settings: { executionOrder: 'v1' },
            projectId: 'project-1',
        } as any);

        expect(mockAxiosPost).toHaveBeenCalledWith('/api/v1/workflows', {
            name: 'Created Workflow',
            nodes: [],
            connections: {},
            settings: { executionOrder: 'v1' },
            projectId: 'project-1',
        });
        expect(mockAxiosPut).toHaveBeenCalledWith('/api/v1/workflows/wf-1', {
            name: 'Created Workflow',
            description: 'Local-only workflow description',
            nodes: [],
            connections: {},
            settings: { executionOrder: 'v1' },
        });
    });

    it('still returns the created workflow when the follow-up description update fails', async () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        mockAxiosPost.mockResolvedValueOnce({
            data: {
                id: 'wf-created',
                name: 'Created Workflow',
                nodes: [],
                connections: {},
                settings: { executionOrder: 'v1' },
            },
        });
        mockAxiosPut.mockRejectedValueOnce(new Error('update failed'));

        await expect(client.createWorkflow({
            name: 'Created Workflow',
            description: 'Description that may need update support',
            nodes: [],
            connections: {},
            settings: { executionOrder: 'v1' },
        } as any)).resolves.toMatchObject({
            id: 'wf-created',
            name: 'Created Workflow',
        });

        expect(mockAxiosPost).toHaveBeenCalledOnce();
        expect(mockAxiosPut).toHaveBeenCalledOnce();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Workflow wf-created was created'));
    });

    it('omits the personal project placeholder when creating a workflow', async () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });
        mockAxiosPost.mockResolvedValueOnce({
            data: {
                id: 'wf-created',
                name: 'Personal Workflow',
                nodes: [],
                connections: {},
                settings: { executionOrder: 'v1' },
            },
        });

        await client.createWorkflow({
            name: 'Personal Workflow',
            nodes: [],
            connections: {},
            settings: { executionOrder: 'v1' },
            projectId: 'personal',
        } as any);

        expect(mockAxiosPost).toHaveBeenCalledWith('/api/v1/workflows', {
            name: 'Personal Workflow',
            nodes: [],
            connections: {},
            settings: { executionOrder: 'v1' },
        });
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
            httpAgent: expect.anything(),
            httpsAgent: expect.anything(),
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

    describe('getCurrentUser', () => {
        it('resolves the user from JWT sub claim and fetches details from /api/v1/users/{id}', async () => {
            // Mock JWT payload: {"sub":"user-123"}
            const mockJwt = 'header.eyJzdWIiOiJ1c2VyLTEyMyJ9.signature';
            const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: mockJwt });

            mockAxiosGet.mockResolvedValueOnce({
                data: {
                    id: 'user-123',
                    email: 'test@example.com',
                    firstName: 'Test',
                    lastName: 'User'
                }
            });

            const user = await client.getCurrentUser();

            expect(user).toEqual({
                id: 'user-123',
                email: 'test@example.com',
                firstName: 'Test',
                lastName: 'User'
            });
            expect(mockAxiosGet).toHaveBeenCalledWith('/api/v1/users/user-123');
        });

        it('returns only the ID from JWT when the users endpoint returns 403', async () => {
            // Mock JWT payload: {"sub":"user-123"}
            const mockJwt = 'header.eyJzdWIiOiJ1c2VyLTEyMyJ9.signature';
            const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: mockJwt });

            mockAxiosGet.mockRejectedValueOnce({
                response: { status: 403 }
            });

            const user = await client.getCurrentUser();

            expect(user).toEqual({ id: 'user-123' });
            expect(mockAxiosGet).toHaveBeenCalledWith('/api/v1/users/user-123');
        });

        it('propagates transport errors from user detail lookup', async () => {
            const mockJwt = 'header.eyJzdWIiOiJ1c2VyLTEyMyJ9.signature';
            const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: mockJwt });
            const error = { code: 'ECONNREFUSED' };

            mockAxiosGet.mockRejectedValueOnce(error);

            await expect(client.getCurrentUser()).rejects.toBe(error);
            expect(mockAxiosGet).toHaveBeenCalledWith('/api/v1/users/user-123');
        });

        it('returns null when API key has no JWT sub claim', async () => {
            const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'not-a-jwt' });

            const user = await client.getCurrentUser();

            expect(user).toBeNull();
            expect(mockAxiosGet).not.toHaveBeenCalled();
        });
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

    it('strips project and read-only metadata from workflow update payloads', async () => {
        const client = new N8nApiClient({ host: 'https://n8n.local', apiKey: 'secret' });
        mockAxiosPut.mockResolvedValueOnce({ status: 200, data: { id: 'wf-1', name: 'Updated' } });

        await expect(client.updateWorkflow('wf-1', {
            id: 'wf-1',
            name: 'Updated',
            active: true,
            nodes: [{ id: 'node-1' }],
            connections: {},
            settings: { executionOrder: 'v1' },
            tags: [{ id: 'tag-1', name: 'ops' }],
            projectId: 'project-1',
            projectName: 'Project 1',
            homeProject: { id: 'project-1', name: 'Project 1' },
            isArchived: false,
            createdAt: '2026-04-24T00:00:00.000Z',
            updatedAt: '2026-04-24T00:00:01.000Z',
        } as any)).resolves.toEqual({ id: 'wf-1', name: 'Updated' });

        expect(mockAxiosPut).toHaveBeenCalledWith('/api/v1/workflows/wf-1', {
            name: 'Updated',
            nodes: [{ id: 'node-1' }],
            connections: {},
            settings: { executionOrder: 'v1' },
        });
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

describe('buildCaBundle', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        delete process.env.NODE_EXTRA_CA_CERTS;
        // Ensure getCACertificates returns [] by default so each test starts clean.
        const tlsMod = await import('tls');
        vi.mocked((tlsMod as any).getCACertificates).mockReturnValue([]);
    });

    it('returns undefined when no extra CA sources are available', () => {
        // tls mock returns [] and NODE_EXTRA_CA_CERTS is unset
        expect(buildCaBundle()).toBeUndefined();
    });

    it('returns a CA bundle including the extra CA file when NODE_EXTRA_CA_CERTS is set', async () => {
        const { readFileSync } = await import('fs');
        vi.mocked(readFileSync).mockReturnValue('-----BEGIN CERTIFICATE-----\nextra-ca\n-----END CERTIFICATE-----\n' as any);
        process.env.NODE_EXTRA_CA_CERTS = '/path/to/ca.crt';

        const bundle = buildCaBundle();

        expect(bundle).toBeDefined();
        // Anchors are stored as trimmed PEM blocks, so the trailing newline is gone.
        expect(bundle).toContain('-----BEGIN CERTIFICATE-----\nextra-ca\n-----END CERTIFICATE-----');
        expect(readFileSync).toHaveBeenCalledWith('/path/to/ca.crt', 'utf8');
    });

    it('returns a CA bundle including system CAs when getCACertificates provides them', async () => {
        const tlsMod = await import('tls');
        vi.mocked((tlsMod as any).getCACertificates).mockReturnValue(['-----BEGIN CERTIFICATE-----\nsystem-ca\n-----END CERTIFICATE-----\n']);

        const bundle = buildCaBundle();

        expect(bundle).toBeDefined();
        expect(bundle).toContain('-----BEGIN CERTIFICATE-----\nsystem-ca\n-----END CERTIFICATE-----');
    });

    it('includes tls.rootCertificates in the bundle so public CAs still work', async () => {
        const tlsMod = await import('tls');
        vi.mocked((tlsMod as any).getCACertificates).mockReturnValue(['system-cert']);

        const bundle = buildCaBundle();

        // The Mozilla bundle is prepended; check at least one expected entry format
        expect(bundle).toBeDefined();
        expect(Array.isArray(bundle)).toBe(true);
        // Root certs + system cert should be present
        expect(bundle!.length).toBeGreaterThan(1);
    });

    it('falls back gracefully when readFileSync throws', async () => {
        const { readFileSync } = await import('fs');
        vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
        process.env.NODE_EXTRA_CA_CERTS = '/missing/ca.crt';

        // Should return undefined (no system CAs from mock, file read failed)
        expect(buildCaBundle()).toBeUndefined();
    });

    it('falls back gracefully when getCACertificates throws', async () => {
        const tlsMod = await import('tls');
        vi.mocked((tlsMod as any).getCACertificates).mockImplementation(() => { throw new Error('unsupported'); });

        expect(buildCaBundle()).toBeUndefined();
    });
});
