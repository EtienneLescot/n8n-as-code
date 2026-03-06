/**
 * Workflow Builder
 * 
 * Builds n8n workflow JSON from extracted TypeScript metadata
 */

import { WorkflowAST, N8nWorkflow, N8nNode, N8nConnections, NodeAST, ConnectionAST } from '../types.js';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

/**
 * Build n8n workflow JSON from AST
 */
export class WorkflowBuilder {
    /**
     * Build workflow JSON from AST
     */
    build(ast: WorkflowAST, options: { deterministicIds?: boolean } = {}): N8nWorkflow {
        const { deterministicIds = false } = options;
        
        // Create mapping: propertyName → node ID
        const nodeIdMap = new Map<string, string>();
        
        // Generate node IDs
        for (const node of ast.nodes) {
            const nodeId = node.id
                ?? (deterministicIds
                    ? this.generateDeterministicId(node.propertyName, node.position)
                    : randomUUID());
            
            nodeIdMap.set(node.propertyName, nodeId);
        }
        
        // Build nodes array
        const nodes = this.buildNodes(ast.nodes, nodeIdMap);
        
        // Build connections object
        const connections = this.buildConnections(ast.connections, nodeIdMap, ast.nodes);
        
        // Assemble workflow
        const workflow: N8nWorkflow = {
            id: ast.metadata.id,
            name: ast.metadata.name,
            active: ast.metadata.active,
            nodes,
            connections,
            settings: ast.metadata.settings,
            tags: []
        };
        
        // Add optional organization metadata
        if (ast.metadata.projectId) {
            workflow.projectId = ast.metadata.projectId;
        }
        if (ast.metadata.projectName) {
            workflow.projectName = ast.metadata.projectName;
        }
        if (ast.metadata.homeProject) {
            workflow.homeProject = ast.metadata.homeProject;
        }
        if (ast.metadata.isArchived !== undefined) {
            workflow.isArchived = ast.metadata.isArchived;
        }
        
        return workflow;
    }
    
    /**
     * Build nodes array
     */
    private buildNodes(nodes: NodeAST[], nodeIdMap: Map<string, string>): N8nNode[] {
        return nodes.map(node => {
            const n8nNode: N8nNode = {
                id: nodeIdMap.get(node.propertyName),
                ...(node.webhookId && { webhookId: node.webhookId }),
                name: node.displayName,
                type: node.type,
                typeVersion: node.version,
                position: node.position,
                parameters: node.parameters
            };
            
            // Add optional fields
            if (node.credentials) {
                n8nNode.credentials = node.credentials;
            }
            if (node.onError) {
                n8nNode.onError = node.onError;
            }
            
            return n8nNode;
        });
    }
    
    /**
     * Build connections object
     * 
     * Converts from AST format to n8n format:
     * 
     * AST: [{ from: {node, output}, to: {node, input} }]
     * 
     * n8n: {
     *   "NodeA": {
     *     "main": [
     *       [{ node: "NodeB", type: "main", index: 0 }]
     *     ],
     *     "ai_languageModel": [
     *       [{ node: "Agent", type: "ai_languageModel", index: 0 }]
     *     ]
     *   }
     * }
     */
    private buildConnections(
        connections: ConnectionAST[],
        nodeIdMap: Map<string, string>,
        nodes: NodeAST[]
    ): N8nConnections {
        const result: N8nConnections = {};
        
        // Create reverse map: propertyName → displayName
        const displayNameMap = new Map<string, string>();
        for (const node of nodes) {
            displayNameMap.set(node.propertyName, node.displayName);
        }
        
        // Group connections by source node and output index
        for (const conn of connections) {
            const sourceDisplayName = displayNameMap.get(conn.from.node);
            const targetDisplayName = displayNameMap.get(conn.to.node);
            
            if (!sourceDisplayName || !targetDisplayName) {
                console.warn(`Warning: Unknown node in connection: ${conn.from.node} → ${conn.to.node}`);
                continue;
            }
            
            // Initialize source node connections if not exists
            if (!result[sourceDisplayName]) {
                result[sourceDisplayName] = {};
            }
            
            // Determine output type (main vs error)
            const outputType = conn.from.isError ? 'error' : 'main';
            
            // Initialize output type array if not exists
            if (!result[sourceDisplayName][outputType]) {
                result[sourceDisplayName][outputType] = [];
            }
            
            // Ensure output index array exists
            const outputIndex = conn.from.output;
            while (result[sourceDisplayName][outputType].length <= outputIndex) {
                result[sourceDisplayName][outputType].push([]);
            }
            
            // Add connection
            result[sourceDisplayName][outputType][outputIndex].push({
                node: targetDisplayName,
                type: 'main',
                index: conn.to.input
            });
        }
        
        // Add AI dependencies from nodes
        for (const node of nodes) {
            if (!node.aiDependencies) {
                continue;
            }
            
            const deps = node.aiDependencies;
            const targetDisplayName = node.displayName;
            
            // Process each AI dependency type
            const aiDepTypes: Array<{ key: keyof typeof deps; connectionType: string }> = [
                { key: 'ai_languageModel', connectionType: 'ai_languageModel' },
                { key: 'ai_memory', connectionType: 'ai_memory' },
                { key: 'ai_outputParser', connectionType: 'ai_outputParser' },
                { key: 'ai_agent', connectionType: 'ai_agent' },
                { key: 'ai_chain', connectionType: 'ai_chain' },
                { key: 'ai_textSplitter', connectionType: 'ai_textSplitter' },
                { key: 'ai_embedding', connectionType: 'ai_embedding' },
                { key: 'ai_retriever', connectionType: 'ai_retriever' },
                { key: 'ai_reranker', connectionType: 'ai_reranker' },
                { key: 'ai_vectorStore', connectionType: 'ai_vectorStore' }
            ];
            
            for (const { key, connectionType } of aiDepTypes) {
                const sourcePropertyName = deps[key];
                if (sourcePropertyName && typeof sourcePropertyName === 'string') {
                    const sourceDisplayName = displayNameMap.get(sourcePropertyName);
                    
                    if (!sourceDisplayName) {
                        console.warn(`Warning: Unknown AI dependency node "${sourcePropertyName}"`);
                        continue;
                    }
                    
                    // Initialize source node connections if not exists
                    if (!result[sourceDisplayName]) {
                        result[sourceDisplayName] = {};
                    }
                    
                    // Initialize connection type array
                    if (!result[sourceDisplayName][connectionType]) {
                        result[sourceDisplayName][connectionType] = [[]];
                    }
                    
                    // Add AI connection
                    result[sourceDisplayName][connectionType][0].push({
                        node: targetDisplayName,
                        type: connectionType,
                        index: 0
                    });
                }
            }
            
            // Handle ai_tool and ai_document (arrays)
            const arrayTypes: Array<{ key: 'ai_tool' | 'ai_document'; connectionType: 'ai_tool' | 'ai_document' }> = [
                { key: 'ai_tool', connectionType: 'ai_tool' },
                { key: 'ai_document', connectionType: 'ai_document' }
            ];
            
            for (const { key, connectionType } of arrayTypes) {
                if (deps[key] && Array.isArray(deps[key])) {
                    for (const itemPropertyName of deps[key] as string[]) {
                        const sourceDisplayName = displayNameMap.get(itemPropertyName);
                        
                        if (!sourceDisplayName) {
                            console.warn(`Warning: Unknown AI ${connectionType} node "${itemPropertyName}"`);
                            continue;
                        }
                        
                        // Initialize source node connections if not exists
                        if (!result[sourceDisplayName]) {
                            result[sourceDisplayName] = {};
                        }
                        
                        // Initialize connection type array
                        if (!result[sourceDisplayName][connectionType]) {
                            result[sourceDisplayName][connectionType] = [[]];
                        }
                        
                        // Add AI connection
                        result[sourceDisplayName][connectionType][0].push({
                            node: targetDisplayName,
                            type: connectionType,
                            index: 0
                        });
                    }
                }
            }
        }
        
        return result;
    }
    
    /**
     * Generate deterministic UUID based on property name and position
     * 
     * This creates a consistent UUID for the same node across transformations
     * Useful for testing and ensuring stable IDs
     */
    private generateDeterministicId(propertyName: string, position: [number, number]): string {
        // Create hash from property name and position
        const hash = createHash('sha256')
            .update(`${propertyName}-${position[0]}-${position[1]}`)
            .digest('hex');
        
        // Format as UUID v4
        return [
            hash.substring(0, 8),
            hash.substring(8, 12),
            '4' + hash.substring(13, 16),
            hash.substring(16, 20),
            hash.substring(20, 32)
        ].join('-');
    }
}
