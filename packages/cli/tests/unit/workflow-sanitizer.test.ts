import { describe, expect, it } from 'vitest';

import { WorkflowSanitizer } from '../../src/core/services/workflow-sanitizer.js';

describe('WorkflowSanitizer.cleanForPush', () => {
    it('assigns webhookId to webhook-like trigger nodes that are missing one', () => {
        const cleaned = WorkflowSanitizer.cleanForPush({
            id: 'wf-1',
            name: 'Webhook Workflow',
            active: false,
            nodes: [
                {
                    id: 'node-1',
                    name: 'Webhook',
                    type: 'n8n-nodes-base.webhook',
                    parameters: { path: 'incoming' }
                },
                {
                    id: 'node-2',
                    name: 'Form Trigger',
                    type: 'n8n-nodes-base.formTrigger',
                    parameters: {}
                },
                {
                    id: 'node-3',
                    name: 'Chat Trigger',
                    type: '@n8n/n8n-nodes-langchain.chatTrigger',
                    parameters: {}
                }
            ],
            connections: {},
            settings: {}
        } as any);

        expect(cleaned.nodes).toHaveLength(3);
        for (const node of cleaned.nodes ?? []) {
            expect(node.webhookId).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            );
        }
    });

    it('preserves an existing webhookId and leaves non-webhook nodes untouched', () => {
        const cleaned = WorkflowSanitizer.cleanForPush({
            id: 'wf-2',
            name: 'Mixed Workflow',
            active: false,
            nodes: [
                {
                    id: 'node-1',
                    name: 'Webhook',
                    type: 'n8n-nodes-base.webhook',
                    webhookId: 'existing-webhook-id',
                    parameters: { path: 'incoming' }
                },
                {
                    id: 'node-2',
                    name: 'Set',
                    type: 'n8n-nodes-base.set',
                    parameters: { values: {} }
                }
            ],
            connections: {},
            settings: {}
        } as any);

        expect(cleaned.nodes?.[0].webhookId).toBe('existing-webhook-id');
        expect(cleaned.nodes?.[1]).not.toHaveProperty('webhookId');
    });

    it('does not assign webhookId during cleanForStorage', () => {
        const cleaned = WorkflowSanitizer.cleanForStorage({
            id: 'wf-3',
            name: 'Stored Workflow',
            active: false,
            nodes: [
                {
                    id: 'node-1',
                    name: 'Webhook',
                    type: 'n8n-nodes-base.webhook',
                    parameters: { path: 'incoming' }
                }
            ],
            connections: {},
            settings: {}
        } as any);

        expect(cleaned.nodes?.[0]).not.toHaveProperty('webhookId');
    });
});