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
 */
export interface AIDependencyMap {
    ai_languageModel?: { output: any };
    ai_memory?: { output: any };
    ai_outputParser?: { output: any };
    ai_tool?: Array<{ output: any }>;
    ai_agent?: { output: any };
    ai_chain?: { output: any };
    ai_document?: Array<{ output: any }>;
    ai_textSplitter?: { output: any };
    ai_embedding?: { output: any };
    ai_retriever?: { output: any };
    ai_reranker?: { output: any };
    ai_vectorStore?: { output: any };
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
