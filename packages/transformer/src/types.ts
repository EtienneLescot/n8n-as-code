/**
 * Core Types for n8n Workflow Transformer
 * 
 * Bidirectional transformation: n8n JSON ↔ TypeScript
 */

// =====================================================================
// 1. INTERMEDIATE REPRESENTATION (AST)
// =====================================================================

/**
 * Intermediate AST representation of a workflow
 * Used as bridge between JSON and TypeScript
 */
export interface WorkflowAST {
    metadata: WorkflowMetadata;
    nodes: NodeAST[];
    connections: ConnectionAST[];
}

/**
 * Workflow metadata (from @workflow decorator)
 */
export interface WorkflowMetadata {
    id: string;
    name: string;
    active: boolean;
    description?: string;
    tags?: string[];
    settings?: WorkflowSettings;
    
    // Organization metadata (optional)
    projectId?: string;
    projectName?: string;
    homeProject?: {
        id: string;
        name: string;
        type: string;
    };
    isArchived?: boolean;
}

/**
 * Workflow settings
 */
export interface WorkflowSettings {
    executionOrder?: 'v0' | 'v1' | 'v2';
    timeSavedMode?: 'fixed' | 'calculated';
    errorWorkflow?: string;
    timezone?: string;
    saveManualExecutions?: boolean;
    saveDataErrorExecution?: 'all' | 'none';
    saveExecutionProgress?: boolean;
    availableInMCP?: boolean;
    callerPolicy?: string;
}

/**
 * Node in AST representation
 */
export interface NodeAST {
    // TypeScript property name (identifier)
    propertyName: string;           // "ScheduleTrigger", "Configuration1"
    
    // Node ID (UUID) — retained from existing JSON to avoid regenerating on every round-trip
    id?: string;
    webhookId?: string;
    
    // Node metadata (from @node decorator)
    displayName: string;            // "🕘 Schedule Trigger"
    type: string;                   // "n8n-nodes-base.scheduleTrigger"
    version: number;                // 1.2
    position: [number, number];     // [-1072, 720]
    
    // Optional metadata
    credentials?: Record<string, CredentialReference>;
    onError?: 'continueErrorOutput' | 'continueRegularOutput' | 'stopWorkflow';

    // Node execution settings
    alwaysOutputData?: boolean;
    executeOnce?: boolean;
    retryOnFail?: boolean;
    maxTries?: number;
    waitBetweenTries?: number;

    // Node state & documentation
    disabled?: boolean;
    notes?: string;
    notesInFlow?: boolean;
    
    // Node parameters (property value in TypeScript)
    parameters: Record<string, any>;
    
    // AI node dependencies (from .uses() calls)
    aiDependencies?: AIDependencies;
}

/**
 * Credential reference
 */
export interface CredentialReference {
    id: string;
    name: string;
}

/**
 * AI roles that fan in: every sub-node connects to input index 0.
 */
export const AI_ARRAY_ROLES = ['ai_tool', 'ai_document'] as const;

/**
 * AI roles with one sub-node per input index. An array wires index 0, 1, ...,
 * which is how n8n exposes a fallback model or a Model Selector's inputs.
 */
export const AI_SINGLE_ROLES = [
    'ai_languageModel', 'ai_memory', 'ai_outputParser', 'ai_agent', 'ai_chain',
    'ai_textSplitter', 'ai_embedding', 'ai_retriever', 'ai_reranker', 'ai_vectorStore'
] as const;

/**
 * AI node dependencies (langchain sub-nodes)
 *
 * Single-valued roles accept an array: position = target input index
 * (e.g. `ai_languageModel: ['Model', 'FallbackModel']`).
 */
export interface AIDependencies {
    ai_languageModel?: string | string[];   // Property name(s) of model node(s)
    ai_memory?: string | string[];          // Property name of memory node
    ai_outputParser?: string | string[];    // Property name of parser node
    ai_tool?: string[];                     // Property names of tool nodes
    ai_agent?: string | string[];           // Property name of agent node
    ai_chain?: string | string[];           // Property name of chain node
    ai_document?: string[];                 // Property names of document nodes
    ai_textSplitter?: string | string[];    // Property name of text splitter node
    ai_embedding?: string | string[];       // Property name of embedding node
    ai_retriever?: string | string[];       // Property name of retriever node
    ai_reranker?: string | string[];        // Property name of reranker node
    ai_vectorStore?: string | string[];     // Property name of vector store node
}

/**
 * Connection between nodes
 */
export interface ConnectionAST {
    from: {
        node: string;               // Property name
        output: number;             // Output index (0, 1, ...)
        isError?: boolean;          // true if error output
    };
    to: {
        node: string;               // Property name
        input: number;              // Input index (usually 0)
    };
}

// =====================================================================
// 2. N8N JSON SCHEMA (input/output)
// =====================================================================

/**
 * n8n workflow JSON structure
 */
export interface N8nWorkflow {
    id: string;
    name: string;
    active: boolean;
    description?: string;
    nodes: N8nNode[];
    connections: N8nConnections;
    settings?: WorkflowSettings;
    tags?: N8nWorkflowTag[];
    
    // Organization metadata
    projectId?: string;
    projectName?: string;
    homeProject?: {
        id: string;
        name: string;
        type: string;
    };
    isArchived?: boolean;
    
    // Fields to ignore (auto-generated by n8n)
    versionId?: string;
    activeVersionId?: string;
    versionCounter?: number;
    pinData?: any;
}

export type N8nWorkflowTag = string | {
    id?: string;
    name?: string;
};

/**
 * n8n node JSON structure
 */
export interface N8nNode {
    id?: string;                    // UUID (generated)
    webhookId?: string;
    name: string;                   // Display name
    type: string;                   // Node type
    typeVersion?: number;           // Version
    position: [number, number];     // [x, y]
    parameters: Record<string, any>;
    credentials?: Record<string, CredentialReference>;
    onError?: 'continueErrorOutput' | 'continueRegularOutput' | 'stopWorkflow';

    // Node execution settings
    alwaysOutputData?: boolean;
    executeOnce?: boolean;
    retryOnFail?: boolean;
    maxTries?: number;
    waitBetweenTries?: number;

    // Node state & documentation
    disabled?: boolean;
    notes?: string;
    notesInFlow?: boolean;
}

/**
 * Type aliases for AST / Metadata nodes
 */
export type IAstNode = NodeAST;
export type INodeMetadata = NodeAST;

/**
 * n8n connections structure
 * 
 * Format: { [sourceNodeName]: { [outputType]: [ [{ node, type, index }] ] } }
 */
export interface N8nConnections {
    [sourceNodeName: string]: {
        [outputType: string]: Array<Array<{
            node: string;
            type: string;
            index: number;
        }>>;
    };
}

// =====================================================================
// 3. TRANSFORMER OPTIONS
// =====================================================================

/**
 * Options for JSON → TypeScript transformation
 */
export interface JsonToTypeScriptOptions {
    /** Apply Prettier formatting to generated code */
    format?: boolean;
    
    /** Comment style for generated code */
    commentStyle?: 'minimal' | 'verbose';
    
    /** Group nodes by type in comments */
    groupNodes?: boolean;
    
    /** Auto-layout positions (for AI-generated workflows) */
    autoLayout?: boolean;
    
    /** Class name (if not derived from workflow name) */
    className?: string;
}

/**
 * Options for TypeScript → JSON transformation
 */
export interface TypeScriptToJsonOptions {
    /** Validate against n8n schema */
    validate?: boolean;
    
    /** Generate deterministic node IDs (for testing) */
    deterministicIds?: boolean;
}

// =====================================================================
// 4. VALIDATION & RESULTS
// =====================================================================

/**
 * Validation result
 */
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings?: ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
    type: 'syntax' | 'structure' | 'reference' | 'schema';
    message: string;
    location?: {
        file?: string;
        line?: number;
        column?: number;
        node?: string;
    };
}

/**
 * Validation warning
 */
export interface ValidationWarning {
    type: 'deprecated' | 'performance' | 'best-practice';
    message: string;
    location?: {
        node?: string;
    };
}

// =====================================================================
// 5. UTILITY TYPES
// =====================================================================

/**
 * Property name generation context
 * Tracks used names to avoid collisions
 */
export interface PropertyNameContext {
    usedNames: Set<string>;
    collisionCounter: Map<string, number>;
}

/**
 * Position for auto-layout
 */
export interface LayoutPosition {
    x: number;
    y: number;
}

/**
 * Auto-layout configuration
 */
export interface AutoLayoutConfig {
    startX: number;
    startY: number;
    horizontalSpacing: number;
    verticalSpacing: number;
    columnWidth: number;
}
