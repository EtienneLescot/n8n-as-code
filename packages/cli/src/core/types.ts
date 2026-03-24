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
    TRACKED = 'TRACKED',
    CONFLICT = 'CONFLICT'
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
    syncInactive: boolean; // internal default true
    ignoredTags: string[]; // internal default []
    instanceIdentifier?: string; // Optional: auto-generated if not provided
    instanceConfigPath?: string; // Optional: explicit path for n8nac-config.json
    projectId: string;           // REQUIRED: Project scope for sync
    projectName: string;         // REQUIRED: Project display name
}

// ── Execution / Test types ────────────────────────────────────────────────────

/** Identifies how a workflow can be triggered externally */
export type TriggerType = 'webhook' | 'form' | 'chat' | 'schedule' | 'unknown';

/** Information extracted from a workflow's trigger node */
export interface ITriggerInfo {
    type: TriggerType;
    nodeId: string;
    nodeName: string;
    /** Path segment used to build the webhook URL (undefined for schedule/unknown) */
    webhookPath?: string;
    /** HTTP method accepted by the trigger (default 'GET' for webhook) */
    httpMethod?: string;
}

/** Classification of why a test execution failed */
export type TestErrorClass =
    /** Legitimate config gap: missing credentials, unset LLM model, env vars.
     *  NOT fixable by the agent — inform the user instead. */
    | 'config-gap'
    /** Structural wiring error: bad expression, wrong field name, HTTP failure.
     *  Agent SHOULD attempt to fix and re-test. */
    | 'wiring-error'
    | null;

/** Result returned by a workflow test run */
export interface ITestResult {
    /** Whether the HTTP call to the webhook URL succeeded (2xx response) */
    success: boolean;
    /** Trigger info detected from the workflow definition */
    triggerInfo: ITriggerInfo | null;
    /** URL that was called */
    webhookUrl?: string;
    /** HTTP status code returned by n8n */
    statusCode?: number;
    /** Response body from the webhook call */
    responseData?: unknown;
    /** Human-readable error message (if any) */
    errorMessage?: string;
    /** Error classification (null when success === true) */
    errorClass: TestErrorClass;
    /** Extra detail to show in the CLI output */
    notes?: string[];
}

export type PayloadConfidence = 'low' | 'medium' | 'high';

export interface IInferredPayloadField {
    path: string;
    source: 'body' | 'query' | 'headers' | 'root';
    example: unknown;
    required: boolean;
    evidence: string[];
}

export interface IInferredPayload {
    inferred: Record<string, unknown> | null;
    confidence: PayloadConfidence;
    fields: IInferredPayloadField[];
    notes: string[];
}

export interface ITestPlan {
    workflowId: string;
    workflowName?: string;
    testable: boolean;
    reason: string | null;
    triggerInfo: ITriggerInfo | null;
    endpoints: {
        testUrl?: string;
        productionUrl?: string;
    };
    payload: IInferredPayload | null;
}
