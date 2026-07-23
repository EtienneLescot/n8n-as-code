import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { WorkflowStateTracker } from '../../src/core/services/workflow-state-tracker.js';
import { N8nApiClient } from '../../src/core/services/n8n-api-client.js';
import { WorkflowTransformerAdapter } from '../../src/core/services/workflow-transformer-adapter.js';
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

    it('does not recover a persisted workflow ID when the decorator explicitly sets id undefined', async () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-tracker-'));
        fs.writeFileSync(
            path.join(tempDir, 'new-copy.workflow.ts'),
            `import { workflow, node } from '@n8n-as-code/transformer';

@workflow({
  id: undefined,
  name: 'New Copy',
  active: false
})
export class NewCopyWorkflow {
  @node({
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    version: 2.1,
    position: [0, 0]
  })
  Webhook = { path: 'new-copy', httpMethod: 'POST' };
}
`,
            'utf-8',
        );
        fs.writeFileSync(
            path.join(tempDir, '.n8n-state.json'),
            JSON.stringify({
                workflows: {
                    'stale-wf': {
                        lastSyncedHash: 'abc123',
                        lastSyncedAt: '2026-03-30T12:00:00.000Z',
                        filename: 'new-copy.workflow.ts',
                    },
                },
            }),
            'utf-8',
        );

        const tracker = new WorkflowStateTracker({} as any, {
            directory: tempDir,
            syncInactive: false,
            ignoredTags: [],
            projectId: 'test-project',
        });

        expect(tracker.getWorkflowIdForFilename('new-copy.workflow.ts')).toBe('stale-wf');

        await tracker.refreshLocalState();

        expect(tracker.getWorkflowIdForFilename('new-copy.workflow.ts')).toBeUndefined();
        expect(tracker.getFilenameForId('stale-wf')).toBeUndefined();
    });

    it('extracts the workflow id key without matching id text inside decorator string values', async () => {
        const tracker = createTracker();

        fs.writeFileSync(
            path.join(tempDir!, 'order-id.workflow.ts'),
            `import { workflow, node } from '@n8n-as-code/transformer';

@workflow({
  name: 'Order id: x',
  id: 'real-id',
  active: false
})
export class OrderIdWorkflow {
  @node({
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    version: 2.1,
    position: [0, 0]
  })
  Webhook = { path: 'order-id', httpMethod: 'POST' };
}
`,
            'utf-8',
        );

        await tracker.refreshLocalState();

        expect(tracker.getWorkflowIdForFilename('order-id.workflow.ts')).toBe('real-id');
        expect(tracker.getFilenameForId('real-id')).toBe('order-id.workflow.ts');
    });
});

describe('WorkflowStateTracker drift detection', () => {
    let tempDir: string | undefined;
    let mockClient: N8nApiClient;

    // Remote `updatedAt` returned by the mocked API for every test below.
    const REMOTE_UPDATED_AT = '2026-06-16T22:45:28.755Z';
    // A `lastSyncedAt` strictly older than REMOTE_UPDATED_AT (remote moved on since).
    const OLDER_THAN_REMOTE = '2026-06-16T22:25:13.933Z';

    /**
     * Realistic fixture: a parseable `@workflow` class, so `refreshLocalState`
     * computes and caches a real hash exactly as it does in production. The drift
     * assertions below therefore run against the real local-hash path rather than a
     * hand-seeded cache.
     */
    const workflowSource = (id: string, name: string, webhookPath: string) =>
        `import { workflow, node } from '@n8n-as-code/transformer';

@workflow({
  id: '${id}',
  name: '${name}',
  active: false
})
export class ${name}Workflow {
  @node({
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    version: 2.1,
    position: [0, 0]
  })
  Webhook = { path: '${webhookPath}', httpMethod: 'POST' };
}
`;

    /** Writes the fixture and returns the hash the tracker will compute for it. */
    const writeWorkflowFile = async (id: string, name: string, webhookPath = 'carousel') => {
        const content = workflowSource(id, name, webhookPath);
        fs.writeFileSync(path.join(tempDir!, `${name}.workflow.ts`), content, 'utf-8');
        return WorkflowTransformerAdapter.hashWorkflow(content);
    };

    const writeState = (
        entries: Record<string, { lastSyncedHash: string; lastSyncedAt?: string; filename?: string }>,
    ) => {
        fs.writeFileSync(
            path.join(tempDir!, '.n8n-state.json'),
            JSON.stringify({ workflows: entries }, null, 2),
            'utf-8',
        );
    };

    const mockRemote = (workflows: Partial<IWorkflow>[]) => {
        mockClient = { getAllWorkflows: vi.fn().mockResolvedValue(workflows as IWorkflow[]) } as any;
    };

    /** Runs the same refresh sequence `SyncManager.listWorkflows({ fetchRemote: true })` does. */
    const listWorkflows = async () => {
        const tracker = new WorkflowStateTracker(mockClient, {
            directory: tempDir!,
            syncInactive: true,
            ignoredTags: [],
            projectId: 'test-project',
        });
        await tracker.refreshLocalState();
        await tracker.refreshRemoteState();
        return { tracker, results: await tracker.getLightweightList() };
    };

    beforeEach(() => {
        vi.resetAllMocks();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-drift-'));
        mockRemote([
            { id: 'wf-1', name: 'Carousel', active: true, isArchived: false, updatedAt: REMOTE_UPDATED_AT },
        ]);
    });

    afterEach(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        vi.resetAllMocks();
        tempDir = undefined;
    });

    it('omits drift when there is no reference state (never synced)', async () => {
        await writeWorkflowFile('wf-1', 'Carousel');
        // No .n8n-state.json written.

        const { results } = await listWorkflows();

        expect(results).toHaveLength(1);
        expect(results[0].status).toBe('TRACKED');
        // No reference state => cannot determine drift.
        expect(results[0].drift).toBeUndefined();
        expect(results[0].lastSyncedAt).toBeUndefined();
        // Remote timestamp is still surfaced when available.
        expect(results[0].remoteUpdatedAt).toBe(REMOTE_UPDATED_AT);
    });

    it('reports no drift when the local hash matches and the remote has not moved', async () => {
        const hash = await writeWorkflowFile('wf-1', 'Carousel');
        writeState({
            'wf-1': { lastSyncedHash: hash, lastSyncedAt: REMOTE_UPDATED_AT, filename: 'Carousel.workflow.ts' },
        });

        const { results } = await listWorkflows();

        expect(results[0].drift).toEqual({ local: false, remote: false });
    });

    it('reports drift.remote=true when the remote changed since the last sync', async () => {
        // This is the scenario from issue #537: workflow edited in the n8n UI after a pull.
        const hash = await writeWorkflowFile('wf-1', 'Carousel');
        writeState({
            'wf-1': { lastSyncedHash: hash, lastSyncedAt: OLDER_THAN_REMOTE, filename: 'Carousel.workflow.ts' },
        });

        const { results } = await listWorkflows();

        expect(results[0].status).toBe('TRACKED');
        expect(results[0].drift).toEqual({ local: false, remote: true });
        expect(results[0].lastSyncedAt).toBe(OLDER_THAN_REMOTE);
        expect(results[0].remoteUpdatedAt).toBe(REMOTE_UPDATED_AT);
    });

    it('reports drift.local=true when the local file changed since the last sync', async () => {
        await writeWorkflowFile('wf-1', 'Carousel');
        writeState({
            'wf-1': {
                lastSyncedHash: 'hash-recorded-before-the-local-edit',
                // Same instant as the remote => isolate the local axis.
                lastSyncedAt: REMOTE_UPDATED_AT,
                filename: 'Carousel.workflow.ts',
            },
        });

        const { results } = await listWorkflows();

        expect(results[0].drift).toEqual({ local: true, remote: false });
    });

    it('reports both axes when local and remote each moved since the last sync', async () => {
        await writeWorkflowFile('wf-1', 'Carousel');
        writeState({
            'wf-1': {
                lastSyncedHash: 'hash-recorded-before-the-local-edit',
                lastSyncedAt: OLDER_THAN_REMOTE,
                filename: 'Carousel.workflow.ts',
            },
        });

        const { results } = await listWorkflows();

        expect(results[0].drift).toEqual({ local: true, remote: true });
    });

    it('leaves drift.local undefined when the local file could not be hashed', async () => {
        // The decorator is not attached to a class: `compileToJson` still recovers the id
        // (so the file maps to wf-1 and lists as TRACKED) but `hashWorkflow` throws, and
        // refreshLocalState skips the file. Drift must not claim "local unchanged" for a
        // file whose contents were never read.
        fs.writeFileSync(
            path.join(tempDir!, 'Carousel.workflow.ts'),
            [
                "import { workflow } from '@n8n-as-code/transformer';",
                '',
                '@workflow({ id: "wf-1", name: "Carousel" })',
                'export {};',
                '',
            ].join('\n'),
            'utf-8',
        );
        writeState({
            'wf-1': {
                lastSyncedHash: 'hash-from-the-last-successful-sync',
                lastSyncedAt: OLDER_THAN_REMOTE,
                filename: 'Carousel.workflow.ts',
            },
        });

        const { results } = await listWorkflows();

        expect(results[0].drift?.local).toBeUndefined();
        // The remote axis is independent and still reported.
        expect(results[0].drift?.remote).toBe(true);
    });

    it('omits drift on EXIST_ONLY_LOCALLY workflows (no remote reference)', async () => {
        await writeWorkflowFile('wf-local-only', 'Local', 'local-only');
        mockRemote([]); // Remote returns no workflows.

        const { results } = await listWorkflows();

        expect(results[0].status).toBe('EXIST_ONLY_LOCALLY');
        expect(results[0].drift).toBeUndefined();
        expect(results[0].remoteUpdatedAt).toBeUndefined();
    });

    it('caches remote updatedAt in remoteTimestamps when refreshRemoteState runs', async () => {
        await writeWorkflowFile('wf-1', 'Carousel');

        const { tracker } = await listWorkflows();

        const timestamps = (tracker as any).remoteTimestamps as Map<string, string>;
        expect(timestamps.get('wf-1')).toBe(REMOTE_UPDATED_AT);
    });

    it('omits drift when state has lastSyncedHash but no lastSyncedAt', async () => {
        // Defensive: should never happen in practice (finalizeSync always writes both),
        // but if it does we skip drift rather than report a partial signal.
        const hash = await writeWorkflowFile('wf-1', 'Carousel');
        writeState({ 'wf-1': { lastSyncedHash: hash } });

        const { results } = await listWorkflows();

        expect(results[0].drift).toBeUndefined();
    });

    it('compares timestamps chronologically, not lexically', async () => {
        // Same instant, different ISO representations. A lexical compare would rank
        // 'Z' (0x5A) above '+' (0x2B) and report phantom remote drift.
        const hash = await writeWorkflowFile('wf-1', 'Carousel');
        mockRemote([
            { id: 'wf-1', name: 'Carousel', active: true, isArchived: false, updatedAt: '2026-06-16T22:45:28.755Z' },
        ]);
        writeState({
            'wf-1': {
                lastSyncedHash: hash,
                lastSyncedAt: '2026-06-16T22:45:28.755+00:00',
                filename: 'Carousel.workflow.ts',
            },
        });

        const { results } = await listWorkflows();

        expect(results[0].drift).toEqual({ local: false, remote: false });
    });

    it('does not report remote drift when the remote timestamp is older in another offset', async () => {
        // 2026-06-17T00:00:00+02:00 is 22:00Z on 06-16, i.e. older than lastSyncedAt,
        // even though it sorts higher as a string.
        const hash = await writeWorkflowFile('wf-1', 'Carousel');
        mockRemote([
            { id: 'wf-1', name: 'Carousel', active: true, isArchived: false, updatedAt: '2026-06-17T00:00:00+02:00' },
        ]);
        writeState({
            'wf-1': {
                lastSyncedHash: hash,
                lastSyncedAt: '2026-06-16T23:00:00.000Z',
                filename: 'Carousel.workflow.ts',
            },
        });

        const { results } = await listWorkflows();

        expect(results[0].drift).toEqual({ local: false, remote: false });
    });
});
