import { describe, it, expect } from 'vitest';
import { applyListCommandOptions, countMatchingWorkflows, matchesWorkflowSearch, matchesWorkflowTags, sortWorkflows } from '../../src/commands/list.js';
import { IWorkflowStatus, WorkflowSyncStatus } from '../../src/core/types.js';

const workflows: IWorkflowStatus[] = [
    {
        id: 'wf-200',
        name: 'Zulu Sync',
        filename: 'zulu-sync.workflow.ts',
        active: true,
        status: WorkflowSyncStatus.TRACKED,
        tags: [{ id: 'tag-prod', name: 'prod' }, { id: 'tag-billing', name: 'folder:billing' }],
    },
    {
        id: 'wf-150',
        name: 'Billing Alerts',
        filename: 'billing-alerts.workflow.ts',
        active: true,
        status: WorkflowSyncStatus.EXIST_ONLY_LOCALLY,
        tags: [{ id: 'tag-billing', name: 'folder:billing' }],
    },
    {
        id: 'wf-300',
        name: 'alpha importer',
        filename: 'imports/alpha-importer.workflow.ts',
        active: false,
        status: WorkflowSyncStatus.CONFLICT,
        tags: [{ id: 'tag-import', name: 'folder:imports' }],
    },
    {
        id: 'remote-44',
        name: 'Remote Orders',
        filename: '',
        active: false,
        status: WorkflowSyncStatus.EXIST_ONLY_REMOTELY,
        tags: [{ id: 'tag-remote', name: 'remote' }],
    },
];

describe('list command helpers', () => {
    it('matches search queries case-insensitively across name, id, and filename', () => {
        expect(matchesWorkflowSearch(workflows[0], 'zulu')).toBe(true);
        expect(matchesWorkflowSearch(workflows[1], 'WF-150')).toBe(true);
        expect(matchesWorkflowSearch(workflows[2], 'imports/alpha')).toBe(true);
        expect(matchesWorkflowSearch(workflows[3], 'missing')).toBe(false);
    });

    it('sorts by status by default and alphabetically when requested', () => {
        expect(sortWorkflows(workflows).map(workflow => workflow.name)).toEqual([
            'alpha importer',
            'Billing Alerts',
            'Remote Orders',
            'Zulu Sync',
        ]);

        expect(sortWorkflows(workflows, 'name').map(workflow => workflow.name)).toEqual([
            'alpha importer',
            'Billing Alerts',
            'Remote Orders',
            'Zulu Sync',
        ]);
    });

    it('filters, sorts, and limits workflows in one pass', () => {
        expect(applyListCommandOptions(workflows, { search: 'wf-', sort: 'name', limit: 2 }).map(workflow => workflow.id)).toEqual([
            'wf-300',
            'wf-150',
        ]);

        expect(applyListCommandOptions(workflows, { remote: true, search: 'remote' }).map(workflow => workflow.id)).toEqual([
            'remote-44',
        ]);
    });

    it('counts matching workflows without sorting or slicing', () => {
        expect(countMatchingWorkflows(workflows, { search: 'wf-' })).toBe(3);
        expect(countMatchingWorkflows(workflows, { remote: true, search: 'remote' })).toBe(1);
        expect(countMatchingWorkflows(workflows, { search: 'missing' })).toBe(0);
    });

    it('matches exact, contains, and starts-with tag filters case-insensitively', () => {
        expect(matchesWorkflowTags(workflows[0], { tags: ['PROD'] })).toBe(true);
        expect(matchesWorkflowTags(workflows[0], { tags: ['prod', 'folder:billing'] })).toBe(true);
        expect(matchesWorkflowTags(workflows[0], { tags: ['prod', 'missing'] })).toBe(false);
        expect(matchesWorkflowTags(workflows[1], { tagContains: 'billing' })).toBe(true);
        expect(matchesWorkflowTags(workflows[2], { tagStartsWith: 'folder:' })).toBe(true);
        expect(matchesWorkflowTags(workflows[3], { tagContains: 'billing' })).toBe(false);
    });

    it('filters workflows by tag options', () => {
        expect(applyListCommandOptions(workflows, { tags: ['folder:billing'], sort: 'name' }).map(workflow => workflow.id)).toEqual([
            'wf-150',
            'wf-200',
        ]);

        expect(applyListCommandOptions(workflows, { tagStartsWith: 'folder:', remote: true }).map(workflow => workflow.id)).toEqual([
            'wf-300',
            'wf-200',
        ]);
    });

    it('ignores sort and limit when counting matches', () => {
        expect(countMatchingWorkflows(workflows, { search: 'wf-', sort: 'name', limit: 1 })).toBe(3);
        expect(countMatchingWorkflows(workflows, { tags: ['folder:billing'], limit: 1 })).toBe(2);
    });
});
