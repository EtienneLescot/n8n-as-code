import { NodeSchemaProvider } from './node-schema-provider.js';
import { TypeScriptParser, WorkflowBuilder } from '@n8n-as-code/transformer';

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
   * Validate a workflow (JSON or TypeScript)
   * 
   * @param workflowInput - Either JSON workflow object or TypeScript code string
   * @param isTypeScript - Whether the input is TypeScript code (default: false)
   */
  async validateWorkflow(workflowInput: any | string, isTypeScript: boolean = false): Promise<ValidationResult> {
    let workflow: any;
    
    if (isTypeScript) {
      // Compile TypeScript to JSON
      try {
        if (typeof workflowInput !== 'string') {
          return {
            valid: false,
            errors: [{ type: 'error', message: 'TypeScript workflow must be a string' }],
            warnings: []
          };
        }
        
        const parser = new TypeScriptParser();
        const ast = await parser.parseCode(workflowInput);
        const builder = new WorkflowBuilder();
        workflow = builder.build(ast);
      } catch (error: any) {
        return {
          valid: false,
          errors: [{
            type: 'error',
            message: `Failed to compile TypeScript workflow: ${error.message}`
          }],
          warnings: []
        };
      }
    } else {
      workflow = workflowInput;
    }
    
    return this.validateWorkflowJson(workflow);
  }

  /**
   * Validate a workflow JSON (internal method)
   */
  private validateWorkflowJson(workflow: any): ValidationResult {
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
            message: `Unknown node type: "${node.type}". Use "npx @n8n-as-code/skills search" to find correct node names.`,
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
      } else {
        // Check that typeVersion is a valid version from the schema
        const schemaVersions = Array.isArray(nodeSchema.version)
          ? nodeSchema.version
          : nodeSchema.version !== undefined ? [nodeSchema.version] : [];
        if (schemaVersions.length > 0 && !schemaVersions.includes(node.typeVersion)) {
          const maxVersion = Math.max(...schemaVersions.map(Number));
          errors.push({
            type: 'error',
            nodeId: node.id,
            nodeName: node.name,
            message: `typeVersion ${node.typeVersion} does not exist for node "${node.type}". Valid versions: [${schemaVersions.join(', ')}]. Use ${maxVersion} (latest).`,
            path: `nodes[${node.name}].typeVersion`,
          });
        }
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
      if (node.parameters && (nodeSchema.schema?.properties || nodeSchema.properties)) {
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
   * Check whether a schema property's displayOptions.show conditions are satisfied
   * by the current node parameters. If no displayOptions defined → always shown.
   */
  private isPropertyDisplayed(prop: any, nodeParams: Record<string, any>): boolean {
    const show = prop.displayOptions?.show;
    if (!show || typeof show !== 'object') return true;

    for (const [condParamName, allowedValues] of Object.entries(show)) {
      if (!Array.isArray(allowedValues)) continue;
      const actualValue = nodeParams[condParamName];
      // Skip expression values — can't evaluate at static validation time
      if (typeof actualValue === 'string' && actualValue.includes('{{')) continue;
      if (!allowedValues.includes(actualValue)) return false;
    }
    return true;
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
    const schemaProps = nodeSchema.schema?.properties || nodeSchema.properties || [];
    // Only consider props whose display conditions are satisfied by the current params
    const displayedProps = schemaProps.filter((p: any) => this.isPropertyDisplayed(p, node.parameters));
    const requiredProps = displayedProps.filter((p: any) => p.required === true);

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

    // Validate 'options' type parameter values
    // Collect all valid values for each options-type property across all display conditions
    const optionValuesByPropName = new Map<string, Set<string | number>>();
    for (const prop of schemaProps) {
      if (prop.type === 'options' && Array.isArray(prop.options)) {
        if (!optionValuesByPropName.has(prop.name)) {
          optionValuesByPropName.set(prop.name, new Set());
        }
        const set = optionValuesByPropName.get(prop.name)!;
        for (const opt of prop.options) {
          if (opt.value !== undefined) set.add(opt.value);
        }
      }
    }

    for (const [propName, validValues] of optionValuesByPropName) {
      if (!(propName in node.parameters)) continue;
      const actualValue = node.parameters[propName];
      // Skip expressions
      if (typeof actualValue === 'string' && actualValue.includes('{{')) continue;
      if (!validValues.has(actualValue)) {
        // Try to find which resource this operation belongs to, for a helpful hint
        let hint = '';
        if (propName === 'operation') {
          const resourceValue = node.parameters['resource'];
          if (resourceValue) {
            // Find operation props scoped to this resource
            const scopedOps = schemaProps
              .filter((p: any) => p.name === 'operation' && p.type === 'options' &&
                Array.isArray(p.displayOptions?.show?.resource) &&
                p.displayOptions.show.resource.includes(resourceValue))
              .flatMap((p: any) => p.options?.map((o: any) => o.value) ?? []);
            if (scopedOps.length > 0) {
              hint = ` For resource "${resourceValue}", valid operations are: [${scopedOps.join(', ')}].`;
            }
          }
        }
        const validList = [...validValues].slice(0, 20).join(', ') + (validValues.size > 20 ? ', ...' : '');
        errors.push({
          type: 'error',
          nodeId: node.id,
          nodeName: node.name,
          message: `Invalid value "${actualValue}" for parameter "${propName}". n8n will reject this with "Could not find property option".${hint} All known values: [${validList}].`,
          path: `nodes[${node.name}].parameters.${propName}`,
        });
      }
    }

    // Cross-check: when both 'resource' and 'operation' are set, verify the operation
    // is valid for the specific resource (some operations only exist for certain resources)
    const resourceValue = node.parameters['resource'];
    const operationValue = node.parameters['operation'];
    if (
      resourceValue && operationValue &&
      typeof resourceValue === 'string' && !resourceValue.includes('{{') &&
      typeof operationValue === 'string' && !operationValue.includes('{{')
    ) {
      const scopedOpProps = schemaProps.filter(
        (p: any) => p.name === 'operation' && p.type === 'options' &&
          Array.isArray(p.displayOptions?.show?.resource) &&
          p.displayOptions.show.resource.includes(resourceValue)
      );
      if (scopedOpProps.length > 0) {
        const scopedValues = new Set<string | number>(
          scopedOpProps.flatMap((p: any) => p.options?.map((o: any) => o.value) ?? [])
        );
        if (!scopedValues.has(operationValue)) {
          const validOps = [...scopedValues].join(', ');
          errors.push({
            type: 'error',
            nodeId: node.id,
            nodeName: node.name,
            message: `Operation "${operationValue}" is not valid for resource "${resourceValue}". n8n will show "Could not find property option". Valid operations for resource "${resourceValue}": [${validOps}].`,
            path: `nodes[${node.name}].parameters.operation`,
          });
        }
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
