/**
 * Decorator Types and Metadata
 */

import { WorkflowSettings, CredentialReference } from '../types.js';

// =====================================================================
// DECORATOR METADATA INTERFACES
// =====================================================================

/**
 * Metadata for @workflow decorator
 */
export interface WorkflowDecoratorMetadata {
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
 * Metadata for @node decorator
 */
export interface NodeDecoratorMetadata {
    webhookId?: string;

    /** Unique identifier of the node (matches workflow JSON) */
    id?: string;

    /** Display name of the node */
    name: string;
    
    /** Node type (e.g., "n8n-nodes-base.scheduleTrigger") */
    type: string;
    
    /** Node version */
    version: number;
    
    /** Position [x, y] - optional for auto-layout */
    position?: [number, number];
    
    /** Credentials for this node */
    credentials?: Record<string, CredentialReference>;
    
    /** Error handling behavior */
    onError?: 'continueErrorOutput' | 'continueRegularOutput' | 'stopWorkflow';

    /** Always output data even when the node has no results */
    alwaysOutputData?: boolean;

    /** Execute this node only once, for the first item */
    executeOnce?: boolean;

    /** Retry on failure */
    retryOnFail?: boolean;

    /** Maximum number of retry attempts (used with retryOnFail) */
    maxTries?: number;

    /** Milliseconds to wait between retries (used with retryOnFail) */
    waitBetweenTries?: number;
}

// =====================================================================
// RUNTIME HELPERS (for .uses(), .out(), .to(), etc.)
// =====================================================================

/**
 * Node proxy for fluent API in defineRouting()
 */
export interface NodeProxy {
    /** Reference to property name */
    _propertyName: string;
    
    /** Output connection builder */
    out(index: number): OutputConnection;
    
    /** Input connection builder */
    in(index: number): InputConnection;
    
    /** Error output connection builder */
    error(): OutputConnection;
    
    /** AI dependency injection */
    uses(dependencies: AIDependencyMap): void;
}

/**
 * Output connection (from node)
 */
export interface OutputConnection {
    _from: {
        node: string;
        output: number;
        isError?: boolean;
    };
    
    /** Connect to input */
    to(input: InputConnection): void;
}

/**
 * Input connection (to node)
 */
export interface InputConnection {
    _to: {
        node: string;
        input: number;
    };
}

/**
 * AI dependency map (for .uses())
 *
 * Single-valued roles also accept an array, where the position is the target
 * input index — that is how n8n wires a fallback model or a Model Selector:
 *   ai_languageModel: [this.Model.output, this.FallbackModel.output]
 */
export interface AIDependencyMap {
    ai_languageModel?: AIRef | AIRef[];
    ai_memory?: AIRef | AIRef[];
    ai_outputParser?: AIRef | AIRef[];
    ai_tool?: AIRef[];
    ai_agent?: AIRef | AIRef[];
    ai_chain?: AIRef | AIRef[];
    ai_document?: AIRef[];
    ai_textSplitter?: AIRef | AIRef[];
    ai_embedding?: AIRef | AIRef[];
    ai_retriever?: AIRef | AIRef[];
    ai_reranker?: AIRef | AIRef[];
    ai_vectorStore?: AIRef | AIRef[];
}

/** Reference to an AI sub-node output (`this.Model.output`) */
export interface AIRef {
    output: any;
}

// =====================================================================
// METADATA KEYS (for reflect-metadata)
// =====================================================================

export const METADATA_KEYS = {
    WORKFLOW: 'n8n:workflow',
    NODE: 'n8n:node',
    CONNECTIONS: 'n8n:connections',
    AI_DEPENDENCIES: 'n8n:ai_dependencies'
} as const;
