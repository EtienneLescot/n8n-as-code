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
    SYNCED = 'SYNCED',
    LOCAL_MODIFIED = 'LOCAL_MODIFIED',
    REMOTE_MODIFIED = 'REMOTE_MODIFIED',
    CONFLICT = 'CONFLICT',
    MISSING_LOCAL = 'MISSING_LOCAL', // On n8n but not on disk
    MISSING_REMOTE = 'MISSING_REMOTE' // On disk but not on n8n
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
    instanceConfigPath?: string; // Optional: explicit path for n8n-as-code-instance.json
}
