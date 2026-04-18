import { describe, expect, it } from 'vitest';
import { WorkflowTransformerAdapter } from '../../src/core/services/workflow-transformer-adapter.js';

describe('WorkflowTransformerAdapter tags', () => {
    it('preserves API workflow tags when converting to TypeScript', async () => {
        const tsCode = await WorkflowTransformerAdapter.convertToTypeScript(
            {
                id: 'wf-tags-unit',
                name: 'Tagged Workflow',
                active: false,
                tags: [
                    { id: 'tag-1', name: 'ops' },
                    { id: 'tag-2', name: 'production' }
                ],
                nodes: [],
                connections: {},
                settings: {}
            } as any,
            {
                format: false,
                commentStyle: 'minimal'
            }
        );

        expect(tsCode).toContain('tags: ["ops","production"]');
    });

    it('assigns webhookId during compileToJson for webhook-like trigger nodes', async () => {
        const workflow = await WorkflowTransformerAdapter.compileToJson(`
import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({ id: 'wf-webhooks', name: 'Webhook Workflow', active: false })
export class WebhookWorkflow {
    @node({
        id: 'node-webhook',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        version: 2,
        position: [0, 0],
    })
    Webhook = {
        path: 'incoming',
        httpMethod: 'POST',
    };

    @node({
        id: 'node-form',
        name: 'Form Trigger',
        type: 'n8n-nodes-base.formTrigger',
        version: 1,
        position: [200, 0],
    })
    FormTrigger = {};

    @node({
        id: 'node-chat',
        name: 'Chat Trigger',
        type: '@n8n/n8n-nodes-langchain.chatTrigger',
        version: 1,
        position: [400, 0],
    })
    ChatTrigger = {};

    @node({
        id: 'node-set',
        name: 'Set',
        type: 'n8n-nodes-base.set',
        version: 3,
        position: [600, 0],
    })
    Set = {
        values: {},
    };

    @links()
    defineRouting() {}
}`);

        expect(workflow.nodes[0].webhookId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );
        expect(workflow.nodes[1].webhookId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );
        expect(workflow.nodes[2].webhookId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );
        expect(workflow.nodes[3]).not.toHaveProperty('webhookId');
    });

    it('preserves an existing webhookId during compileToJson', async () => {
        const workflow = await WorkflowTransformerAdapter.compileToJson(`
import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({ id: 'wf-existing-webhook-id', name: 'Existing WebhookId', active: false })
export class ExistingWebhookIdWorkflow {
    @node({
        id: 'node-webhook',
        webhookId: 'existing-webhook-id',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        version: 2,
        position: [0, 0],
    })
    Webhook = {
        path: 'incoming',
        httpMethod: 'POST',
    };

    @links()
    defineRouting() {}
}`);

        expect(workflow.nodes[0].webhookId).toBe('existing-webhook-id');
    });
});

describe('WorkflowTransformerAdapter settings round-trip', () => {
    const baseWorkflow = {
        id: 'wf-settings-test',
        name: 'Settings Test',
        active: false,
        nodes: [],
        connections: {},
    };

    it('compileToJson preserves settings present in WorkflowSettings type', async () => {
        const ts = await WorkflowTransformerAdapter.convertToTypeScript(
            {
                ...baseWorkflow,
                settings: {
                    executionOrder: 'v1',
                    availableInMCP: true,
                    callerPolicy: 'workflowsFromSameOwner',
                    timezone: 'America/New_York',
                },
            } as any,
            { format: false, commentStyle: 'minimal' },
        );

        const result = await WorkflowTransformerAdapter.compileToJson(ts);

        expect(result.settings).toMatchObject({
            executionOrder: 'v1',
            availableInMCP: true,
            callerPolicy: 'workflowsFromSameOwner',
            timezone: 'America/New_York',
        });
    });

    it('hash is stable across TS round-trip and direct JSON paths', async () => {
        const workflow = {
            ...baseWorkflow,
            settings: {
                executionOrder: 'v1',
                availableInMCP: true,
                callerPolicy: 'workflowsFromSameOwner',
                errorWorkflow: 'wf-error',
                timezone: 'UTC',
                saveManualExecutions: true,
                saveDataErrorExecution: 'all',
                saveExecutionProgress: false,
            },
        } as any;

        // Path 1: JSON → TS → compileToJson (cleanForPush) → normalizeForHash
        const tsCode = await WorkflowTransformerAdapter.convertToTypeScript(workflow, {
            format: false,
            commentStyle: 'minimal',
        });
        const hashViaTs = await WorkflowTransformerAdapter.hashWorkflow(tsCode);

        // Path 2: JSON string → normalizeForHash (no cleanForPush)
        const hashViaJson = await WorkflowTransformerAdapter.hashWorkflow(
            JSON.stringify(workflow),
        );

        expect(hashViaTs).toBe(hashViaJson);
    });

    it('changing availableInMCP or callerPolicy changes the hash', async () => {
        const mkWorkflow = (settings: Record<string, unknown>) =>
            JSON.stringify({ ...baseWorkflow, settings: { executionOrder: 'v1', ...settings } });

        const hashBase = await WorkflowTransformerAdapter.hashWorkflow(mkWorkflow({}));

        const hashWithMCP = await WorkflowTransformerAdapter.hashWorkflow(
            mkWorkflow({ availableInMCP: true }),
        );

        const hashWithCaller = await WorkflowTransformerAdapter.hashWorkflow(
            mkWorkflow({ callerPolicy: 'workflowsFromSameOwner' }),
        );

        expect(hashWithMCP).not.toBe(hashBase);
        expect(hashWithCaller).not.toBe(hashBase);
        expect(hashWithMCP).not.toBe(hashWithCaller);
    });
});
