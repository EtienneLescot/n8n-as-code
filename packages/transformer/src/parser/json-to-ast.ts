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
        
        // Parse connections
        const connections = this.parseConnections(workflow.connections, nodeNameMap);
        
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
     *     ]
     *   }
     * }
     * 
     * AST format:
     * [
     *   { from: { node: "NodeA", output: 0 }, to: { node: "NodeB", input: 0 } }
     * ]
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
            
            // Iterate output types (usually "main")
            for (const [outputType, outputGroups] of Object.entries(outputs as any)) {
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
                                // TODO: Detect error outputs
                                isError: false
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
}
