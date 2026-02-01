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
    
    // Organization metadata (extracted from n8n API, stored for display purposes)
    // These fields are preserved in local storage but removed before pushing to API
    projectId?: string;          // ID of the project this workflow belongs to (from shared[0].project.id)
    projectName?: string;        // Name of the project (from shared[0].project.name)
    homeProject?: IProject;      // Full project object for detailed info
    isArchived?: boolean;        // Whether workflow is archived
}

export interface ITag {
    id: string;
    name: string;
}

export interface IProject {
    id: string;
    name: string;
    type?: string;               // e.g., 'personal', 'team', etc.
    createdAt?: string;
    updatedAt?: string;
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
    projectId?: string;
    projectName?: string;
    homeProject?: IProject;
    isArchived?: boolean;
}

export interface ISyncConfig {
    directory: string;
    pollIntervalMs: number;
    syncInactive: boolean;
    ignoredTags: string[];
    instanceIdentifier?: string; // Optional: auto-generated if not provided
    instanceConfigPath?: string; // Optional: explicit path for n8nac-instance.json
    syncMode?: 'auto' | 'manual';
    projectId: string;           // REQUIRED: Project scope for sync
    projectName: string;         // REQUIRED: Project display name
}
