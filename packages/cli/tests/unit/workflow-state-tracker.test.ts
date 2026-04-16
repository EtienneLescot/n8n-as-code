import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { WorkflowStateTracker } from '../../src/core/services/workflow-state-tracker.js';
import { N8nApiClient } from '../../src/core/services/n8n-api-client.js';
import { IWorkflow } from '../../src/core/types.js';

describe('WorkflowStateTracker archive filtering', () => {
    let tempDir: string | undefined;
    let mockClient: N8nApiClient;

    beforeEach(() => {
        vi.resetAllMocks();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-archive-filter-'));

        mockClient = {
            getAllWorkflows: vi.fn().mockResolvedValue([
                { id: 'wf-active', name: 'Active Workflow', active: true, isArchived: false } as IWorkflow,
                { id: 'wf-archived', name: 'Archived Workflow', active: false, isArchived: true } as IWorkflow,
            ]),
        } as any;
    });

    afterEach(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        vi.resetAllMocks();
        tempDir = undefined;
    });

    function createTracker() {
        return new WorkflowStateTracker(mockClient, {
            directory: tempDir!,
            syncInactive: false,
            ignoredTags: [],
            projectId: 'test-project',
        });
    }

    it('excludes archived workflows by default', async () => {
        const tracker = createTracker();
        await tracker.refreshRemoteState();
        const results = await tracker.getLightweightList();

        const names = results.map(w => w.name);
        expect(names).toContain('Active Workflow');
        expect(names).not.toContain('Archived Workflow');
    });

    it('includes archived workflows when includeArchived is true', async () => {
        const tracker = createTracker();
        await tracker.refreshRemoteState();
        const results = await tracker.getLightweightList({ includeArchived: true });

        const names = results.map(w => w.name);
        expect(names).toContain('Active Workflow');
        expect(names).toContain('Archived Workflow');
    });

    it('shows only archived workflows when onlyArchived is true', async () => {
        const tracker = createTracker();
        await tracker.refreshRemoteState();
        const results = await tracker.getLightweightList({ onlyArchived: true });

        const names = results.map(w => w.name);
        expect(names).not.toContain('Active Workflow');
        expect(names).toContain('Archived Workflow');
    });

    it('sets isArchived flag correctly on returned workflows', async () => {
        const tracker = createTracker();
        await tracker.refreshRemoteState();
        const results = await tracker.getLightweightList({ includeArchived: true });

        const active = results.find(w => w.id === 'wf-active');
        const archived = results.find(w => w.id === 'wf-archived');

        expect(active?.isArchived).toBe(false);
        expect(archived?.isArchived).toBe(true);
    });
});

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
