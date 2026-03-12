import { describe, it, expect } from 'vitest';
import { applyListCommandOptions, countMatchingWorkflows, matchesWorkflowSearch, sortWorkflows } from '../../src/commands/list.js';
import { IWorkflowStatus, WorkflowSyncStatus } from '../../src/core/types.js';

const workflows: IWorkflowStatus[] = [
    {
        id: 'wf-200',
        name: 'Zulu Sync',
        filename: 'zulu-sync.workflow.ts',
        active: true,
        status: WorkflowSyncStatus.TRACKED,
    },
    {
        id: 'wf-150',
        name: 'Billing Alerts',
        filename: 'billing-alerts.workflow.ts',
        active: true,
        status: WorkflowSyncStatus.EXIST_ONLY_LOCALLY,
    },
    {
        id: 'wf-300',
        name: 'alpha importer',
        filename: 'imports/alpha-importer.workflow.ts',
        active: false,
        status: WorkflowSyncStatus.CONFLICT,
    },
    {
        id: 'remote-44',
        name: 'Remote Orders',
        filename: '',
        active: false,
        status: WorkflowSyncStatus.EXIST_ONLY_REMOTELY,
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

    it('ignores sort and limit when counting matches', () => {
        expect(countMatchingWorkflows(workflows, { search: 'wf-', sort: 'name', limit: 1 })).toBe(3);
    });
});
