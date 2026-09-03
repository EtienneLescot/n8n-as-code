import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The tracker constructs RestFolderSource internally; mock it so these tests drive
// its load() result without any network.
const { mockLoad } = vi.hoisted(() => ({ mockLoad: vi.fn() }));

vi.mock('../../src/core/services/rest-folder-source.js', () => ({
    RestFolderSource: class {
        load = mockLoad;
        static login = vi.fn();
    },
}));

// updateSingleRemoteState serialises the workflow before the folder step; stub the
// transformer so minimal fixtures reach the folder logic under test.
vi.mock('../../src/core/services/workflow-transformer-adapter.js', () => ({
    WorkflowTransformerAdapter: {
        convertToTypeScript: vi.fn().mockResolvedValue('// stubbed workflow code'),
        hashWorkflow: vi.fn().mockResolvedValue('stub-hash'),
    },
}));

import { WorkflowStateTracker } from '../../src/core/services/workflow-state-tracker.js';
import { IWorkflow } from '../../src/core/types.js';

const FOLDERS = [
    { id: 'folder-ai-chat', name: 'Ai Chat', parentFolderId: null },
    { id: 'folder-fp', name: 'File Processing', parentFolderId: 'folder-ai-chat' },
];

/** The session source supplies the workflow→folder link the public API omits. */
function sessionData() {
    return { folders: FOLDERS, workflowParentFolderId: new Map([['wf-foldered', 'folder-fp']]) };
}

/** A public client whose workflow read carries NO folder metadata (the real n8n case). */
function makeClient() {
    return {
        getAllWorkflows: vi.fn().mockResolvedValue([
            { id: 'wf-foldered', name: 'Normalize Attachments', active: true, isArchived: false } as IWorkflow,
        ]),
    } as any;
}

describe('WorkflowStateTracker session folder source', () => {
    let tempDir: string;

    beforeEach(() => {
        vi.clearAllMocks();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-tracker-session-'));
    });

    afterEach(() => {
        if (tempDir && fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    });

    function makeTracker(extra: Record<string, unknown> = {}) {
        return new WorkflowStateTracker(makeClient(), {
            directory: tempDir,
            syncInactive: false,
            ignoredTags: [],
            projectId: 'project-1',
            folderSync: true,
            host: 'https://n8n.example.test',
            folderAuth: { cookies: ['n8n-auth=t'] },
            ...extra,
        });
    }

    it('backfills parentFolderId from the session source and builds the nested path', async () => {
        mockLoad.mockResolvedValue(sessionData());
        const tracker = makeTracker();

        await tracker.refreshRemoteState();

        expect(tracker.getFilenameForId('wf-foldered')).toBe(
            'Ai Chat/File Processing/Normalize Attachments.workflow.ts',
        );
        expect(mockLoad).toHaveBeenCalledTimes(1);
    });

    it('places multiple workflows into their reconstructed folders on the initial pull', async () => {
        // Mirrors the shape of a real instance: a deep branch plus a sibling and a root flow.
        mockLoad.mockResolvedValue({
            folders: [
                { id: 'timeless', name: 'Timeless', parentFolderId: null },
                { id: 'ap', name: 'ai-action-plan', parentFolderId: 'timeless' },
                { id: 'pi', name: 'patient-info', parentFolderId: 'ap' },
                { id: 'common', name: 'Common', parentFolderId: null },
            ],
            // Only foldered workflows appear here; a root workflow is absent from the map.
            workflowParentFolderId: new Map([
                ['wf-tl', 'timeless'],
                ['wf-pi', 'pi'],
                ['wf-common', 'common'],
            ]),
        });
        const client = {
            getAllWorkflows: vi.fn().mockResolvedValue([
                { id: 'wf-root', name: 'Root Flow', active: true, isArchived: false },
                { id: 'wf-tl', name: 'TL Flow', active: true, isArchived: false },
                { id: 'wf-pi', name: 'PI Flow', active: true, isArchived: false },
                { id: 'wf-common', name: 'Common Flow', active: true, isArchived: false },
            ]),
        } as any;
        const tracker = new WorkflowStateTracker(client, {
            directory: tempDir,
            syncInactive: false,
            ignoredTags: [],
            projectId: 'project-1',
            folderSync: true,
            host: 'https://n8n.example.test',
            folderAuth: { cookies: ['n8n-auth=t'] },
        });

        await tracker.refreshRemoteState();

        expect(tracker.getFilenameForId('wf-root')).toBe('Root Flow.workflow.ts');
        expect(tracker.getFilenameForId('wf-tl')).toBe('Timeless/TL Flow.workflow.ts');
        expect(tracker.getFilenameForId('wf-pi')).toBe('Timeless/ai-action-plan/patient-info/PI Flow.workflow.ts');
        expect(tracker.getFilenameForId('wf-common')).toBe('Common/Common Flow.workflow.ts');
    });

    it('fails closed when a configured session source cannot load', async () => {
        mockLoad.mockRejectedValue(new Error('401 Unauthorized'));
        const tracker = makeTracker();
        tracker.on('error', () => {}); // swallow the emitter re-raise; we assert on the rejection

        await expect(tracker.refreshRemoteState()).rejects.toThrow(/session folder source failed/i);
    });

    it('preserves prior remote state when a subsequent refreshRemoteState fails closed', async () => {
        mockLoad.mockResolvedValue(sessionData());
        const tracker = makeTracker();
        await tracker.refreshRemoteState();
        expect(tracker.getFilenameForId('wf-foldered')).toBe('Ai Chat/File Processing/Normalize Attachments.workflow.ts');

        // Subsequent refresh fails closed
        mockLoad.mockRejectedValue(new Error('401 Unauthorized'));
        await expect(tracker.refreshRemoteState()).rejects.toThrow(/session folder source failed/i);

        // Prior state must still be intact
        expect(tracker.getFilenameForId('wf-foldered')).toBe('Ai Chat/File Processing/Normalize Attachments.workflow.ts');
    });

    it('degrades to a flat pull when the flat fallback is opted in', async () => {
        mockLoad.mockRejectedValue(new Error('401 Unauthorized'));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const tracker = makeTracker({ folderSessionAllowFlatFallback: true });
            await tracker.refreshRemoteState();
            expect(tracker.getFilenameForId('wf-foldered')).toBe('Normalize Attachments.workflow.ts');
        } finally {
            warn.mockRestore();
        }
    });

    it('degrades to flat pull with a warning when the instance reports no folder support (403 license)', async () => {
        mockLoad.mockResolvedValue({
            folders: [],
            workflowParentFolderId: new Map(),
            licenseUnavailableReason: 'the n8n instance reports no folder support (register the Community instance to unlock folders)',
        });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const tracker = makeTracker();
            await tracker.refreshRemoteState();
            expect(tracker.getFilenameForId('wf-foldered')).toBe('Normalize Attachments.workflow.ts');
            expect(warn).toHaveBeenCalledWith(expect.stringMatching(/register the Community instance to unlock folders/i));
        } finally {
            warn.mockRestore();
        }
    });

    it('re-reads the folder tree on every refresh (failures stay retryable, moves are seen)', async () => {
        mockLoad.mockResolvedValue(sessionData());
        const tracker = makeTracker();

        await tracker.refreshRemoteState();
        await tracker.refreshRemoteState();

        expect(mockLoad).toHaveBeenCalledTimes(2);
    });

    it('fails closed on the single-workflow pull path (updateSingleRemoteState)', async () => {
        mockLoad.mockRejectedValue(new Error('401 Unauthorized'));
        const tracker = makeTracker();

        await expect(
            tracker.updateSingleRemoteState(
                { id: 'wf-foldered', name: 'Normalize Attachments', active: true, isArchived: false } as IWorkflow,
            ),
        ).rejects.toThrow(/session folder source failed/i);
    });

    it('leaves the workflow cache untouched (all-or-nothing) when the single-workflow pull fails closed', async () => {
        mockLoad.mockRejectedValue(new Error('401 Unauthorized'));
        const tracker = makeTracker();

        await expect(
            tracker.updateSingleRemoteState({ id: 'wf-x', name: 'X', active: true, isArchived: false } as IWorkflow),
        ).rejects.toThrow(/session folder source failed/i);

        // Fail-closed happens before any cache write -> the workflow is not half-recorded.
        expect(tracker.isRemoteKnown('wf-x')).toBe(false);
        expect(tracker.getFilenameForId('wf-x')).toBeUndefined();
    });

    it('shares one session load across single-workflow updates within a generation', async () => {
        mockLoad.mockResolvedValue(sessionData());
        const tracker = makeTracker();

        await tracker.updateSingleRemoteState({ id: 'wf-foldered', name: 'A', active: true, isArchived: false } as IWorkflow);
        await tracker.updateSingleRemoteState({ id: 'wf-foldered', name: 'A', active: true, isArchived: false } as IWorkflow);

        expect(mockLoad).toHaveBeenCalledTimes(1); // memoised within the same generation
    });

    it('never touches /rest when folderSync is on but no host/auth is configured', async () => {
        const tracker = new WorkflowStateTracker(makeClient(), {
            directory: tempDir,
            syncInactive: false,
            ignoredTags: [],
            projectId: 'project-1',
            folderSync: true,
            // no host, no folderAuth -> no session source is constructed
        });

        await tracker.refreshRemoteState();

        expect(mockLoad).not.toHaveBeenCalled();
        expect(tracker.getFilenameForId('wf-foldered')).toBe('Normalize Attachments.workflow.ts');
    });
});
