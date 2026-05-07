import { describe, expect, it } from 'vitest';
import { adaptWorkflowForPromotion } from '../../src/commands/promote.js';

describe('PromoteCommand', () => {
    it('strips source workflow identity and project metadata before promotion', () => {
        const source = `import { workflow } from '@n8n-as-code/transformer';

@workflow({
  id: 'source-workflow-id',
  name: 'Promoted Workflow',
  projectId: 'source-project',
  projectName: 'Source Project',
  isArchived: false,
  active: false
})
export class PromotedWorkflow {}
`;

        const promoted = adaptWorkflowForPromotion(source);

        expect(promoted).not.toContain("id: 'source-workflow-id'");
        expect(promoted).not.toContain("projectId: 'source-project'");
        expect(promoted).not.toContain("projectName: 'Source Project'");
        expect(promoted).not.toContain('isArchived: false');
        expect(promoted).toContain("name: 'Promoted Workflow'");
        expect(promoted).toContain('active: false');
    });
});
