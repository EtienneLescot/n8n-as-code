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
});