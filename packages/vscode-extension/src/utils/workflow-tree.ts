import { IWorkflowStatus } from 'n8nac';

export interface WorkflowFolderNode {
    name: string;
    path: string;
    folders: WorkflowFolderNode[];
    workflows: IWorkflowStatus[];
}

export interface WorkflowTree {
    folders: WorkflowFolderNode[];
    workflows: IWorkflowStatus[];
}

function normalizeFolderPath(value: string | null | undefined): string | null {
    if (!value) {
        return null;
    }

    const normalized = value
        .replace(/\\/g, '/')
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join('/');

    return normalized || null;
}

export function getWorkflowFolderPath(workflow: IWorkflowStatus): string | null {
    const explicitFolderPath = normalizeFolderPath(workflow.folderPath);
    if (explicitFolderPath) {
        return explicitFolderPath;
    }

    const normalizedFilename = normalizeFolderPath(workflow.filename);
    if (!normalizedFilename || !normalizedFilename.includes('/')) {
        return null;
    }

    return normalizedFilename.split('/').slice(0, -1).join('/');
}

export function buildWorkflowTree(workflows: IWorkflowStatus[]): WorkflowTree {
    const rootFolders = new Map<string, WorkflowFolderNode>();
    const allFolders = new Map<string, WorkflowFolderNode>();
    const rootWorkflows: IWorkflowStatus[] = [];

    const ensureFolder = (folderPath: string): WorkflowFolderNode => {
        const existing = allFolders.get(folderPath);
        if (existing) {
            return existing;
        }

        const parts = folderPath.split('/');
        const name = parts[parts.length - 1];
        const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : null;
        const node: WorkflowFolderNode = {
            name,
            path: folderPath,
            folders: [],
            workflows: [],
        };

        allFolders.set(folderPath, node);

        if (parentPath) {
            ensureFolder(parentPath).folders.push(node);
        } else {
            rootFolders.set(folderPath, node);
        }

        return node;
    };

    for (const workflow of workflows) {
        const folderPath = getWorkflowFolderPath(workflow);
        if (!folderPath) {
            rootWorkflows.push(workflow);
            continue;
        }

        ensureFolder(folderPath).workflows.push(workflow);
    }

    const sortTree = (folder: WorkflowFolderNode): void => {
        folder.folders.sort((a, b) => a.name.localeCompare(b.name));
        folder.workflows.sort((a, b) => a.name.localeCompare(b.name));
        for (const child of folder.folders) {
            sortTree(child);
        }
    };

    const folders = Array.from(rootFolders.values()).sort((a, b) => a.name.localeCompare(b.name));
    for (const folder of folders) {
        sortTree(folder);
    }

    rootWorkflows.sort((a, b) => a.name.localeCompare(b.name));

    return {
        folders,
        workflows: rootWorkflows,
    };
}
