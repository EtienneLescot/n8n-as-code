/**
 * JSON to AST Parser
 * 
 * Converts n8n workflow JSON to intermediate AST representation
 */

import { N8nWorkflow, WorkflowAST, NodeAST, ConnectionAST, PropertyNameContext, AI_ARRAY_ROLES, AI_SINGLE_ROLES, KNOWN_NODE_METADATA_KEYS } from '../types.js';
import { createPropertyNameContext, generatePropertyName } from '../utils/naming.js';

// AI connection types are handled separately by extractAIDependencies()
// Use a generic prefix-based check so new ai_* types are handled consistently.
const AI_CONNECTION_TYPES = {
    has(type: string | undefined | null): boolean {
        return typeof type === 'string' && type.startsWith('ai_');
    },
};

/**
 * Parse n8n workflow JSON to AST
 */
export class JsonToAstParser {
    /**
     * Parse workflow JSON to AST
     */
    parse(workflow: N8nWorkflow): WorkflowAST {
        // Create context for property name generation
        const nameContext = createPropertyNameContext();
        
        // Create mapping: node displayName → propertyName
        const nodeNameMap = new Map<string, string>();
        
        // Parse nodes
        const nodes = workflow.nodes.map(node => {
            const propertyName = generatePropertyName(node.name, nameContext);
            nodeNameMap.set(node.name, propertyName);
            
            return this.parseNode(node, propertyName);
        });
        
        // Parse connections (main/error) and AI dependencies
        const connections = this.parseConnections(workflow.connections, nodeNameMap);
        this.extractAIDependencies(workflow.connections, nodeNameMap, nodes);
        
        // Build AST
        return {
            metadata: {
                id: workflow.id,
                name: workflow.name,
                active: workflow.active,
                description: typeof workflow.description === 'string' ? workflow.description : undefined,
                tags: this.parseTags(workflow.tags),
                settings: workflow.settings,
                projectId: workflow.projectId,
                projectName: workflow.projectName,
                homeProject: workflow.homeProject,
                isArchived: workflow.isArchived
            },
            nodes,
            connections
        };
    }

    /**
     * Normalize workflow tags from API responses.
     *
     * n8n API responses may expose tags either as strings or as objects
     * containing id/name fields depending on the caller and endpoint.
     */
    private parseTags(tags: N8nWorkflow['tags']): string[] | undefined {
        if (!Array.isArray(tags) || tags.length === 0) {
            return undefined;
        }

        return tags
            .map(tag => typeof tag === 'string' ? tag : tag.name)
            .filter((tag): tag is string => typeof tag === 'string' && tag.length > 0);
    }
    
    /**
     * Parse single node
     */
    private parseNode(node: any, propertyName: string): NodeAST {
        const handledKeys = new Set<string>(KNOWN_NODE_METADATA_KEYS);
        handledKeys.add('parameters');

        const extraProps: Record<string, any> = {};
        for (const [key, value] of Object.entries(node)) {
            if (!handledKeys.has(key) && value !== undefined) {
                extraProps[key] = value;
            }
        }

        return {
            propertyName,
            ...(node.id && { id: node.id }),
            ...(node.webhookId && { webhookId: node.webhookId }),
            displayName: node.name,
            type: node.type,
            version: node.typeVersion || 1,
            position: node.position || [0, 0],
            parameters: node.parameters || {},
            credentials: node.credentials,
            onError: node.onError,
            ...(node.alwaysOutputData !== undefined && { alwaysOutputData: node.alwaysOutputData }),
            ...(node.executeOnce !== undefined && { executeOnce: node.executeOnce }),
            ...(node.retryOnFail !== undefined && { retryOnFail: node.retryOnFail }),
            ...(node.maxTries !== undefined && { maxTries: node.maxTries }),
            ...(node.waitBetweenTries !== undefined && { waitBetweenTries: node.waitBetweenTries }),
            ...(node.disabled !== undefined && { disabled: node.disabled }),
            ...(node.notes !== undefined && { notes: node.notes }),
            ...(node.notesInFlow !== undefined && { notesInFlow: node.notesInFlow }),
            ...(node.continueOnFail !== undefined && { continueOnFail: node.continueOnFail }),
            ...extraProps,
        };
    }
    
    /**
     * Parse connections from n8n format to AST format
     * 
     * n8n format:
     * {
     *   "Node A": {
     *     "main": [
     *       [{ node: "Node B", type: "main", index: 0 }]
     *     ],
     *     "ai_languageModel": [
     *       [{ node: "Agent", type: "ai_languageModel", index: 0 }]
     *     ]
     *   }
     * }
     * 
     * AST format:
     * [
     *   { from: { node: "NodeA", output: 0 }, to: { node: "NodeB", input: 0 } }
     * ]
     * 
     * NOTE: AI connections (ai_*) are extracted separately via extractAIDependencies()
     */
    private parseConnections(
        connections: any,
        nodeNameMap: Map<string, string>
    ): ConnectionAST[] {
        const result: ConnectionAST[] = [];
        
        if (!connections) {
            return result;
        }
        
        for (const [sourceNodeName, outputs] of Object.entries(connections)) {
            const sourcePropertyName = nodeNameMap.get(sourceNodeName);
            
            if (!sourcePropertyName) {
                console.warn(`Warning: Unknown source node "${sourceNodeName}" in connections`);
                continue;
            }
            
            // Iterate output types (usually "main", "error", or ai_*)
            for (const [outputType, outputGroups] of Object.entries(outputs as any)) {
                // Skip AI connection types (handled by extractAIDependencies)
                if (AI_CONNECTION_TYPES.has(outputType)) {
                    continue;
                }
                
                // For each output index
                (outputGroups as any[]).forEach((group, outputIndex) => {
                    // For each target in this output
                    group.forEach((target: any) => {
                        const targetPropertyName = nodeNameMap.get(target.node);
                        
                        if (!targetPropertyName) {
                            console.warn(`Warning: Unknown target node "${target.node}" in connections`);
                            return;
                        }
                        
                        result.push({
                            from: {
                                node: sourcePropertyName,
                                output: outputIndex,
                                isError: outputType === 'error'
                            },
                            to: {
                                node: targetPropertyName,
                                input: target.index || 0
                            }
                        });
                    });
                });
            }
        }
        
        return result;
    }
    
    /**
     * Extract AI dependencies from connections and populate node aiDependencies
     * 
     * AI dependencies are connections like:
     * - ai_languageModel: The LLM model for an agent
     * - ai_memory: Memory buffer for an agent
     * - ai_outputParser: Output parser for structured responses
     * - ai_tool: Tools available to an agent (array)
     * - ai_agent: Agent sub-node
     * - ai_chain: Chain sub-node
     * - ai_document: Document loaders (array)
     * - ai_textSplitter: Text splitter sub-node
     * - ai_embedding: Embedding model sub-node
     * - ai_retriever: Retriever sub-node for RAG
     * - ai_reranker: Reranker sub-node
     * - ai_vectorStore: Vector store sub-node
     */
    private extractAIDependencies(
        connections: any,
        nodeNameMap: Map<string, string>,
        nodes: NodeAST[]
    ): void {
        if (!connections) {
            return;
        }
        
        // Create map for quick node lookup
        const nodesByPropertyName = new Map<string, NodeAST>();
        nodes.forEach(node => nodesByPropertyName.set(node.propertyName, node));
        
        for (const [sourceNodeName, outputs] of Object.entries(connections)) {
            const sourcePropertyName = nodeNameMap.get(sourceNodeName);
            
            if (!sourcePropertyName) {
                continue;
            }
            
            // Check each output type for AI connections
            for (const [outputType, outputGroups] of Object.entries(outputs as any)) {
                if (!outputType.startsWith('ai_')) {
                    continue;
                }
                
                // For each output index
                (outputGroups as any[]).forEach((group: any[]) => {
                    // For each target in this output
                    group.forEach((target: any) => {
                        const targetPropertyName = nodeNameMap.get(target.node);
                        
                        if (!targetPropertyName) {
                            return;
                        }
                        
                        // Get the target node
                        const targetNode = nodesByPropertyName.get(targetPropertyName);
                        if (!targetNode) {
                            return;
                        }
                        
                        // Initialize aiDependencies if not exists
                        if (!targetNode.aiDependencies) {
                            targetNode.aiDependencies = {};
                        }
                        
                        const deps = targetNode.aiDependencies as Record<string, string | string[]>;

                        if ((AI_ARRAY_ROLES as readonly string[]).includes(outputType)) {
                            // ai_tool and ai_document fan in: order of appearance
                            if (!deps[outputType]) {
                                deps[outputType] = [];
                            }
                            (deps[outputType] as string[]).push(sourcePropertyName);
                        } else if ((AI_SINGLE_ROLES as readonly string[]).includes(outputType)) {
                            // One sub-node per input index: index > 0 means a second slot
                            // (fallback model, Model Selector), so keep both.
                            const inputIndex = target.index ?? 0;
                            const existing = deps[outputType];
                            if (inputIndex === 0 && existing === undefined) {
                                deps[outputType] = sourcePropertyName;
                            } else {
                                const slots = Array.isArray(existing)
                                    ? existing
                                    : existing !== undefined ? [existing] : [];
                                while (slots.length < inputIndex) {
                                    slots.push('');
                                }
                                slots[inputIndex] = sourcePropertyName;
                                deps[outputType] = slots;
                            }
                        }
                    });
                });
            }
        }
    }
}
