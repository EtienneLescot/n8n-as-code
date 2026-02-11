import test from 'node:test';
import assert from 'node:assert';
import { WorkflowSanitizer } from '../../src/services/workflow-sanitizer.js';
import { IWorkflow } from '../../src/types.js';

test('WorkflowSanitizer: cleanForStorage should remove dynamic keys and sort keys', () => {
    const mockWorkflow: any = {
        name: 'Test test',
        active: true,
        nodes: [
            { id: '1', name: 'Node 1', position: [0, 0] },
            { id: '2', name: 'Node 2', position: [100, 100] }
        ],
        connections: {
            'Node 1': { main: [[{ node: 'Node 2', type: 'main', index: 0 }]] }
        },
        settings: {
            timezone: 'Europe/Paris',
            executionUrl: 'http://deleted.com',
            availableInMCP: true
        },
        tags: [{ id: 'tag1', name: 'Tag 1' }],
        updatedAt: '2023-10-27T10:00:00Z'
    };

    const cleaned = WorkflowSanitizer.cleanForStorage(mockWorkflow as IWorkflow);

    // Check removed keys
    assert.strictEqual(cleaned.settings.executionUrl, undefined);
    assert.strictEqual(cleaned.settings.availableInMCP, undefined);
    assert.strictEqual((cleaned as any).updatedAt, undefined);

    // Check kept keys
    assert.strictEqual(cleaned.name, 'Test test');
    assert.strictEqual(cleaned.settings.timezone, 'Europe/Paris');

    // Check sorting (deterministic output)
    const keys = Object.keys(cleaned);
    assert.deepStrictEqual(keys, ['id', 'name', 'nodes', 'connections', 'settings', 'tags', 'active']);
});

test('WorkflowSanitizer: cleanForPush should remove read-only fields (active, tags)', () => {
    const mockWorkflow: any = { name: 'Test', active: true, nodes: [], connections: {}, tags: [{ name: 't' }] };
    const pushPayload = WorkflowSanitizer.cleanForPush(mockWorkflow as IWorkflow);

    assert.strictEqual(pushPayload.active, undefined);
    assert.strictEqual(pushPayload.tags, undefined);
    assert.strictEqual(pushPayload.name, 'Test');
});

test('WorkflowSanitizer: cleanForStorage should preserve executionOrder', () => {
    const mockWorkflow: any = {
        name: 'Test',
        nodes: [],
        connections: {},
        settings: {
            executionOrder: 'v1',
            timezone: 'Europe/Paris',
            availableInMCP: true,
            executionUrl: 'http://deleted.com'
        }
    };

    const cleaned = WorkflowSanitizer.cleanForStorage(mockWorkflow as IWorkflow);

    // executionOrder should be preserved (not stripped)
    assert.strictEqual(cleaned.settings.executionOrder, 'v1');
    
    // But instance-specific fields should be removed
    assert.strictEqual(cleaned.settings.availableInMCP, undefined);
    assert.strictEqual(cleaned.settings.executionUrl, undefined);
    
    // Other settings preserved
    assert.strictEqual(cleaned.settings.timezone, 'Europe/Paris');
});

test('WorkflowSanitizer: cleanForPush should add executionOrder v1 if missing', () => {
    const mockWorkflow: any = {
        name: 'Test',
        nodes: [],
        connections: {},
        settings: {}
    };

    const pushPayload = WorkflowSanitizer.cleanForPush(mockWorkflow as IWorkflow);

    // executionOrder should be added with default "v1"
    assert.strictEqual(pushPayload.settings.executionOrder, 'v1');
});

test('WorkflowSanitizer: cleanForPush should preserve existing executionOrder', () => {
    const mockWorkflow: any = {
        name: 'Test',
        nodes: [],
        connections: {},
        settings: {
            executionOrder: 'v2',
            timezone: 'Europe/Paris'
        }
    };

    const pushPayload = WorkflowSanitizer.cleanForPush(mockWorkflow as IWorkflow);

    // Existing executionOrder should be preserved
    assert.strictEqual(pushPayload.settings.executionOrder, 'v2');
    assert.strictEqual(pushPayload.settings.timezone, 'Europe/Paris');
});

test('WorkflowSanitizer: cleanForPush should add executionOrder even without settings', () => {
    const mockWorkflow: any = {
        name: 'Test',
        nodes: [],
        connections: {}
        // No settings at all
    };

    const pushPayload = WorkflowSanitizer.cleanForPush(mockWorkflow as IWorkflow);

    // Settings should be created with executionOrder
    assert.ok(pushPayload.settings);
    assert.strictEqual(pushPayload.settings.executionOrder, 'v1');
});

test('WorkflowSanitizer: cleanForPush should preserve explicit v0 (user choice)', () => {
    const mockWorkflow: any = {
        name: 'Legacy Workflow',
        nodes: [],
        connections: {},
        settings: {
            executionOrder: 'v0',  // Explicit user choice
            timezone: 'Europe/Paris'
        }
    };

    const pushPayload = WorkflowSanitizer.cleanForPush(mockWorkflow as IWorkflow);

    // Explicit v0 should be preserved (respect user choice)
    assert.strictEqual(pushPayload.settings.executionOrder, 'v0');
    // Other settings preserved
    assert.strictEqual(pushPayload.settings.timezone, 'Europe/Paris');
});

test('WorkflowSanitizer: cleanForPush should preserve any explicit executionOrder value', () => {
    const mockWorkflow: any = {
        name: 'Test',
        nodes: [],
        connections: {},
        settings: {
            executionOrder: 'v2',  // Future version
            timezone: 'Europe/Paris'
        }
    };

    const pushPayload = WorkflowSanitizer.cleanForPush(mockWorkflow as IWorkflow);

    // Any explicit executionOrder value should be preserved
    assert.strictEqual(pushPayload.settings.executionOrder, 'v2');
});
