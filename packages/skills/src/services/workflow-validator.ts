import { NodeSchemaProvider } from './node-schema-provider.js';
import { WorkflowSanitizer } from '@n8n-as-code/sync';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type: 'error';
  nodeId?: string;
  nodeName?: string;
  message: string;
  path?: string;
}

export interface ValidationWarning {
  type: 'warning';
  nodeId?: string;
  nodeName?: string;
  message: string;
  path?: string;
}

export class WorkflowValidator {
  private provider: NodeSchemaProvider;

  constructor(customIndexPath?: string) {
    this.provider = new NodeSchemaProvider(customIndexPath);
  }

  /**
   * Validate a workflow JSON
   */
  validateWorkflow(workflow: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 1. Check basic structure
    if (!workflow) {
      errors.push({ type: 'error', message: 'Workflow is null or undefined' });
      return { valid: false, errors, warnings };
    }

    if (typeof workflow !== 'object') {
      errors.push({ type: 'error', message: 'Workflow must be a JSON object' });
      return { valid: false, errors, warnings };
    }

    // 2. Check required fields
    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
      errors.push({ type: 'error', message: 'Workflow must have a "nodes" array' });
    }

    if (!workflow.connections || typeof workflow.connections !== 'object') {
      errors.push({ type: 'error', message: 'Workflow must have a "connections" object' });
    }

    if (errors.length > 0) {
      return { valid: false, errors, warnings };
    }

    // 3. Validate each node
    const nodeMap = new Map<string, any>();

    for (const node of workflow.nodes) {
      // Store node for connection validation
      nodeMap.set(node.name, node);

      // Check required node fields
      // NOTE: node.id is optional for "as-code" workflows (sanitized)
      if (!node.id) {
        warnings.push({
          type: 'warning',
          nodeName: node.name || 'unknown',
          message: 'Node is missing "id" (this is normal for sanitized workflows)',
        });
      }

      if (!node.name) {
        errors.push({
          type: 'error',
          nodeId: node.id,
          message: 'Node is missing required field: "name"',
        });
      }

      if (!node.type) {
        errors.push({
          type: 'error',
          nodeId: node.id,
          nodeName: node.name,
          message: 'Node is missing required field: "type"',
        });
        continue; // Can't validate further without type
      }

      // Extract node name from type (e.g., "n8n-nodes-base.httpRequest" -> "httpRequest")
      const nodeTypeName = node.type.split('.').pop();

      // Detect if this is a community node
      // Community nodes formats:
      // - @scope/n8n-nodes-* (where scope is NOT 'n8n')
      // - n8n-nodes-* (without base/langchain)
      // Official n8n nodes:
      // - n8n-nodes-base.*
      // - @n8n/n8n-nodes-langchain.*
      const isCommunityNode =
        (node.type.startsWith('@') && !node.type.startsWith('@n8n/')) ||
        (node.type.startsWith('n8n-nodes-') && !node.type.startsWith('n8n-nodes-base.') && !node.type.startsWith('n8n-nodes-langchain.'));

      // Check if node type exists
      const nodeSchema = this.provider.getNodeSchema(nodeTypeName);
      if (!nodeSchema) {
        if (isCommunityNode) {
          // Community nodes: emit a warning but don't fail validation
          warnings.push({
            type: 'warning',
            nodeId: node.id,
            nodeName: node.name,
            message: `Community node type "${node.type}" is not in the schema. Parameter validation will be skipped for this node.`,
          });
          // Skip further validation for this node (no schema available)
          continue;
        } else {
          // Official n8n nodes: this is an error
          errors.push({
            type: 'error',
            nodeId: node.id,
            nodeName: node.name,
            message: `Unknown node type: "${node.type}". Use "npx @n8n-as-code/agent-cli search" to find correct node names.`,
          });
          continue;
        }
      }

      // Check typeVersion
      if (node.typeVersion === undefined) {
        warnings.push({
          type: 'warning',
          nodeId: node.id,
          nodeName: node.name,
          message: 'Node is missing "typeVersion" field',
        });
      }

      // Check position
      if (!node.position || !Array.isArray(node.position) || node.position.length !== 2) {
        warnings.push({
          type: 'warning',
          nodeId: node.id,
          nodeName: node.name,
          message: 'Node should have "position" as [x, y] array',
        });
      }

      // Check parameters
      if (!node.parameters) {
        warnings.push({
          type: 'warning',
          nodeId: node.id,
          nodeName: node.name,
          message: 'Node is missing "parameters" object',
        });
      }

      // Validate parameters against schema
      if (node.parameters && nodeSchema.properties) {
        this.validateNodeParameters(node, nodeSchema, errors, warnings);
      }
    }

    // 4. Validate connections
    if (workflow.connections) {
      this.validateConnections(workflow.connections, nodeMap, errors, warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate node parameters against schema
   */
  private validateNodeParameters(
    node: any,
    nodeSchema: any,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const schemaProps = nodeSchema.properties || [];
    const requiredProps = schemaProps.filter((p: any) => p.required === true);

    // Check required parameters
    for (const prop of requiredProps) {
      if (!(prop.name in node.parameters)) {
        errors.push({
          type: 'error',
          nodeId: node.id,
          nodeName: node.name,
          message: `Missing required parameter: "${prop.name}"`,
          path: `nodes[${node.name}].parameters.${prop.name}`,
        });
      }
    }

    // Check for unknown parameters (might be typos)
    const knownParamNames = new Set(schemaProps.map((p: any) => p.name));
    for (const paramName of Object.keys(node.parameters)) {
      if (!knownParamNames.has(paramName)) {
        warnings.push({
          type: 'warning',
          nodeId: node.id,
          nodeName: node.name,
          message: `Unknown parameter: "${paramName}". This might be a typo or deprecated parameter.`,
          path: `nodes[${node.name}].parameters.${paramName}`,
        });
      }
    }
  }

  /**
   * Validate connections between nodes
   */
  private validateConnections(
    connections: any,
    nodeMap: Map<string, any>,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    for (const [sourceName, sourceConnections] of Object.entries(connections)) {
      // Check if source node exists
      if (!nodeMap.has(sourceName)) {
        errors.push({
          type: 'error',
          message: `Connection references non-existent source node: "${sourceName}"`,
        });
        continue;
      }

      if (typeof sourceConnections !== 'object' || sourceConnections === null) {
        errors.push({
          type: 'error',
          nodeName: sourceName,
          message: `Invalid connections format for node "${sourceName}"`,
        });
        continue;
      }

      // Check main connections
      const mainConnections = (sourceConnections as any).main;
      if (mainConnections && Array.isArray(mainConnections)) {
        for (let outputIndex = 0; outputIndex < mainConnections.length; outputIndex++) {
          const outputConnections = mainConnections[outputIndex];
          if (Array.isArray(outputConnections)) {
            for (const conn of outputConnections) {
              // Check connection structure
              if (!conn.node) {
                errors.push({
                  type: 'error',
                  nodeName: sourceName,
                  message: `Connection missing "node" field`,
                });
                continue;
              }

              // Check if target node exists
              if (!nodeMap.has(conn.node)) {
                errors.push({
                  type: 'error',
                  nodeName: sourceName,
                  message: `Connection references non-existent target node: "${conn.node}"`,
                });
              }

              // Check connection type
              if (conn.type && conn.type !== 'main') {
                warnings.push({
                  type: 'warning',
                  nodeName: sourceName,
                  message: `Unusual connection type: "${conn.type}" (expected "main")`,
                });
              }

              // Check index
              if (conn.index === undefined) {
                warnings.push({
                  type: 'warning',
                  nodeName: sourceName,
                  message: `Connection to "${conn.node}" missing "index" field`,
                });
              }
            }
          }
        }
      }
    }
  }
}
