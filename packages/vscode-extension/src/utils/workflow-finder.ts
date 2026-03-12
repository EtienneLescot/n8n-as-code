import type { QuickPickItem } from 'vscode';
import { IWorkflowStatus, WorkflowSyncStatus } from 'n8nac';

export interface WorkflowQuickPickItem extends QuickPickItem {
    workflow: IWorkflowStatus;
}

export function buildWorkflowQuickPickItems(workflows: IWorkflowStatus[]): WorkflowQuickPickItem[] {
    return [...workflows]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
        .map(workflow => ({
            label: workflow.name,
            description: workflow.id ? `ID: ${workflow.id}` : 'Local only',
            detail: workflow.filename
                ? `${workflow.filename} • ${workflow.status}`
                : `Remote only • ${workflow.status}`,
            workflow
        }));
}

export function getWorkflowFinderCommand(workflow: IWorkflowStatus): string | undefined {
    if (workflow.status === WorkflowSyncStatus.EXIST_ONLY_REMOTELY) {
        return workflow.id ? 'n8n.openBoard' : undefined;
    }

    return workflow.filename ? 'n8n.openJson' : (workflow.id ? 'n8n.openBoard' : undefined);
}
