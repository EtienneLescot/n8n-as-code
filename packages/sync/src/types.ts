export interface IN8nCredentials {
    host: string;
    apiKey: string;
}

export interface IWorkflow {
    id: string;
    name: string;
    active: boolean;
    nodes: any[];
    connections: any;
    settings?: any;
    tags?: ITag[];
    updatedAt?: string;
    createdAt?: string;
}

export interface ITag {
    id: string;
    name: string;
}

export enum WorkflowSyncStatus {
    EXIST_ONLY_LOCALLY = 'EXIST_ONLY_LOCALLY',
    EXIST_ONLY_REMOTELY = 'EXIST_ONLY_REMOTELY',
    IN_SYNC = 'IN_SYNC',
    MODIFIED_LOCALLY = 'MODIFIED_LOCALLY',
    MODIFIED_REMOTELY = 'MODIFIED_REMOTELY',
    CONFLICT = 'CONFLICT',
    DELETED_LOCALLY = 'DELETED_LOCALLY',
    DELETED_REMOTELY = 'DELETED_REMOTELY'
}

export interface IWorkflowStatus {
    id: string;
    name: string;
    filename: string;
    active: boolean;
    status: WorkflowSyncStatus;
}

export interface ISyncConfig {
    directory: string;
    pollIntervalMs: number;
    syncInactive: boolean;
    ignoredTags: string[];
    instanceIdentifier?: string; // Optional: auto-generated if not provided
    instanceConfigPath?: string; // Optional: explicit path for n8nac-instance.json
    syncMode?: 'auto' | 'manual';
}
