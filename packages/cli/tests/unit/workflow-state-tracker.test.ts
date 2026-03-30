import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkflowStateTracker } from '../../src/core/services/workflow-state-tracker.js';

describe('WorkflowStateTracker filename sanitization', () => {
    let tempDir: string | undefined;

    afterEach(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        tempDir = undefined;
    });

    function createTracker() {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-tracker-'));
        return new WorkflowStateTracker({} as any, {
            directory: tempDir,
            syncInactive: false,
            ignoredTags: [],
            projectId: 'test-project'
        });
    }

    it('sanitizes Windows-invalid characters in workflow filenames', () => {
        const tracker = createTracker();

        expect((tracker as any).safeName('AI Assistant | Email Sender')).toBe('AI Assistant _ Email Sender');
        expect((tracker as any).safeName('db: backup <nightly>?*')).toBe('db_ backup _nightly___');
    });

    it('removes trailing dots and spaces and protects reserved device names', () => {
        const tracker = createTracker();

        expect((tracker as any).safeName('NUL')).toBe('NUL_');
        expect((tracker as any).safeName('report. ')).toBe('report');
        expect((tracker as any).safeName('   ')).toBe('workflow');
    });

    it('recovers a workflow ID from the persisted filename hint when the decorator ID is missing', async () => {
        const tracker = createTracker();

        fs.writeFileSync(
            path.join(tempDir!, 'recovered.workflow.ts'),
            `import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({
  name: 'Recovered Workflow',
  active: false
})
export class RecoveredWorkflow {
  @node({
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    version: 2.1,
    position: [0, 0]
  })
  Webhook = {
    path: 'recovered',
    httpMethod: 'POST',
    responseMode: 'onReceived',
    responseBinaryPropertyName: 'data'
  };

  @links()
  defineRouting() {}
}
`,
            'utf-8',
        );

        fs.writeFileSync(
            path.join(tempDir!, '.n8n-state.json'),
            JSON.stringify({
                workflows: {
                    'wf-123': {
                        lastSyncedHash: 'abc123',
                        lastSyncedAt: '2026-03-30T12:00:00.000Z',
                        filename: 'recovered.workflow.ts',
                    },
                },
            }),
            'utf-8',
        );

        await tracker.refreshLocalState();

        expect(tracker.getWorkflowIdForFilename('recovered.workflow.ts')).toBe('wf-123');
        expect(tracker.getFilenameForId('wf-123')).toBe('recovered.workflow.ts');
    });
});
