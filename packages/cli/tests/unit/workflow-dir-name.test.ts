import { describe, expect, it } from 'vitest';
import {
    WORKFLOW_DIR_NAME_ADJECTIVES,
    WORKFLOW_DIR_NAME_NOUNS,
    createWorkflowDirNameV1,
    serializeWorkflowDirIdentityV1,
} from '../../src/core/services/workflow-dir-name.js';

const identity = {
    environmentId: 'dev',
    instanceIdentifier: 'inst_1111111111',
    instanceUserIdentifier: 'user_2222222222',
    projectId: 'personal',
};

describe('workflow directory names', () => {
    it('creates deterministic filesystem-safe names from identity', () => {
        const first = createWorkflowDirNameV1(identity);
        const second = createWorkflowDirNameV1({ ...identity });

        expect(first).toBe(second);
        expect(first).toMatch(/^[a-z][a-z0-9-]+-[a-f0-9]{12}$/);
    });

    it('changes when stable identity fields change', () => {
        const base = createWorkflowDirNameV1(identity);

        expect(createWorkflowDirNameV1({ ...identity, environmentId: 'prod' })).not.toBe(base);
        expect(createWorkflowDirNameV1({ ...identity, instanceIdentifier: 'inst_3333333333' })).not.toBe(base);
        expect(createWorkflowDirNameV1({ ...identity, instanceUserIdentifier: 'user_4444444444' })).not.toBe(base);
        expect(createWorkflowDirNameV1({ ...identity, projectId: 'marketing' })).not.toBe(base);
    });

    it('serializes only stable identity fields', () => {
        expect(serializeWorkflowDirIdentityV1(identity)).toBe(JSON.stringify([
            ['namespace', 'n8nac-workflow-dir'],
            ['version', 'v1'],
            ['environmentId', 'dev'],
            ['instanceIdentifier', 'inst_1111111111'],
            ['instanceUserIdentifier', 'user_2222222222'],
            ['projectId', 'personal'],
        ]));
    });

    it('keeps the v1 wordlists at the expected minimum size', () => {
        expect(WORKFLOW_DIR_NAME_ADJECTIVES.length).toBeGreaterThanOrEqual(128);
        expect(WORKFLOW_DIR_NAME_NOUNS.length).toBeGreaterThanOrEqual(256);
    });
});
