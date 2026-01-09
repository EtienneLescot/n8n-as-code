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
    assert.deepStrictEqual(keys, ['active', 'connections', 'name', 'nodes', 'settings', 'tags']);
});

test('WorkflowSanitizer: cleanForPush should remove read-only fields (active, tags)', () => {
    const mockWorkflow: any = { name: 'Test', active: true, nodes: [], connections: {}, tags: [{name: 't'}] };
    const pushPayload = WorkflowSanitizer.cleanForPush(mockWorkflow as IWorkflow);
    
    assert.strictEqual(pushPayload.active, undefined);
    assert.strictEqual(pushPayload.tags, undefined);
    assert.strictEqual(pushPayload.name, 'Test');
});
