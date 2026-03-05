/**
 * JSON to AST Parser
 * 
 * Converts n8n workflow JSON to intermediate AST representation
 */

import { N8nWorkflow, WorkflowAST, NodeAST, ConnectionAST, PropertyNameContext } from '../types.js';
import { createPropertyNameContext, generatePropertyName } from '../utils/naming.js';

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
     * Parse single node
     */
    private parseNode(node: any, propertyName: string): NodeAST {
        return {
            propertyName,
            ...(node.id && { id: node.id }),
            displayName: node.name,
            type: node.type,
            version: node.typeVersion || 1,
            position: node.position || [0, 0],
            parameters: node.parameters || {},
            credentials: node.credentials,
            onError: node.onError
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
        
        // AI connection types (these are handled separately by extractAIDependencies)
        const AI_CONNECTION_TYPES = [
            'ai_languageModel', 'ai_memory', 'ai_outputParser', 'ai_tool',
            'ai_agent', 'ai_chain', 'ai_textSplitter', 'ai_embedding',
            'ai_retriever', 'ai_reranker', 'ai_vectorStore', 'ai_document',
        ];
        
        for (const [sourceNodeName, outputs] of Object.entries(connections)) {
            const sourcePropertyName = nodeNameMap.get(sourceNodeName);
            
            if (!sourcePropertyName) {
                console.warn(`Warning: Unknown source node "${sourceNodeName}" in connections`);
                continue;
            }
            
            // Iterate output types (usually "main", "error", or ai_*)
            for (const [outputType, outputGroups] of Object.entries(outputs as any)) {
                // Skip AI connection types (handled by extractAIDependencies)
                if (AI_CONNECTION_TYPES.includes(outputType)) {
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
                        
                        // Add dependency based on type
                        if (outputType === 'ai_languageModel') {
                            targetNode.aiDependencies.ai_languageModel = sourcePropertyName;
                        } else if (outputType === 'ai_memory') {
                            targetNode.aiDependencies.ai_memory = sourcePropertyName;
                        } else if (outputType === 'ai_outputParser') {
                            targetNode.aiDependencies.ai_outputParser = sourcePropertyName;
                        } else if (outputType === 'ai_agent') {
                            targetNode.aiDependencies.ai_agent = sourcePropertyName;
                        } else if (outputType === 'ai_chain') {
                            targetNode.aiDependencies.ai_chain = sourcePropertyName;
                        } else if (outputType === 'ai_textSplitter') {
                            targetNode.aiDependencies.ai_textSplitter = sourcePropertyName;
                        } else if (outputType === 'ai_embedding') {
                            targetNode.aiDependencies.ai_embedding = sourcePropertyName;
                        } else if (outputType === 'ai_retriever') {
                            targetNode.aiDependencies.ai_retriever = sourcePropertyName;
                        } else if (outputType === 'ai_reranker') {
                            targetNode.aiDependencies.ai_reranker = sourcePropertyName;
                        } else if (outputType === 'ai_vectorStore') {
                            targetNode.aiDependencies.ai_vectorStore = sourcePropertyName;
                        } else if (outputType === 'ai_tool' || outputType === 'ai_document') {
                            // ai_tool and ai_document are arrays
                            const arrayKey = outputType as 'ai_tool' | 'ai_document';
                            if (!targetNode.aiDependencies[arrayKey]) {
                                (targetNode.aiDependencies as any)[arrayKey] = [];
                            }
                            (targetNode.aiDependencies[arrayKey] as string[]).push(sourcePropertyName);
                        }
                    });
                });
            }
        }
    }
}
