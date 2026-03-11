import type { QuickPickItem } from 'vscode';
import { IWorkflowStatus } from 'n8nac';

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
    if (workflow.filename) {
        return 'n8n.openJson';
    }

    if (workflow.id) {
        return 'n8n.openBoard';
    }

    return undefined;
}
