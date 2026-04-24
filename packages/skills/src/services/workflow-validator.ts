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

  constructor(customIndexPath?: string, customNodesPath?: string) {
    this.provider = new NodeSchemaProvider(customIndexPath, customNodesPath);
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

  private isExpressionValue(value: any): boolean {
    return typeof value === 'string' && value.includes('{{');
  }

  private getConditionParamValue(
    condParamName: string,
    nodeParams: Record<string, any>,
    rootParams: Record<string, any>
  ): any {
    if (condParamName.startsWith('/')) {
      return rootParams[condParamName.slice(1)];
    }
    return Object.prototype.hasOwnProperty.call(nodeParams, condParamName)
      ? nodeParams[condParamName]
      : rootParams[condParamName];
  }

  /**
   * Check whether a schema property's displayOptions conditions are satisfied
   * by the current parameters. If no displayOptions defined -> always shown.
   */
  private isPropertyDisplayed(
    prop: any,
    nodeParams: Record<string, any>,
    rootParams: Record<string, any> = nodeParams
  ): boolean {
    const hide = prop.displayOptions?.hide;
    if (hide && typeof hide === 'object') {
      for (const [condParamName, hiddenValues] of Object.entries(hide)) {
        if (!Array.isArray(hiddenValues)) continue;
        const actualValue = this.getConditionParamValue(condParamName, nodeParams, rootParams);
        if (this.isExpressionValue(actualValue)) continue;
        if (hiddenValues.includes(actualValue)) return false;
      }
    }

    const show = prop.displayOptions?.show;
    if (!show || typeof show !== 'object') return true;

    for (const [condParamName, allowedValues] of Object.entries(show)) {
      if (!Array.isArray(allowedValues)) continue;
      const actualValue = this.getConditionParamValue(condParamName, nodeParams, rootParams);
      // Skip expression values — can't evaluate at static validation time
      if (this.isExpressionValue(actualValue)) continue;
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
    this.validateParameterSet(node, schemaProps, node.parameters, node.parameters, `nodes[${node.name}].parameters`, errors, warnings, true);

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

  private validateParameterSet(
    node: any,
    schemaProps: any[],
    params: Record<string, any>,
    rootParams: Record<string, any>,
    path: string,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    warnUnknownParameters: boolean
  ): void {
    // Only consider props whose display conditions are satisfied by the current params
    const displayedProps = schemaProps.filter((p: any) => this.isPropertyDisplayed(p, params, rootParams));
    const requiredProps = displayedProps.filter((p: any) => p.required === true);

    // Check required parameters
    for (const prop of requiredProps) {
      if (!(prop.name in params)) {
        errors.push({
          type: 'error',
          nodeId: node.id,
          nodeName: node.name,
          message: `Missing required parameter: "${prop.name}"`,
          path: `${path}.${prop.name}`,
        });
      }
    }

    // Check for unknown parameters (might be typos)
    if (warnUnknownParameters) {
      const knownParamNames = new Set(schemaProps.map((p: any) => p.name));
      for (const paramName of Object.keys(params)) {
        if (!knownParamNames.has(paramName)) {
          warnings.push({
            type: 'warning',
            nodeId: node.id,
            nodeName: node.name,
            message: `Unknown parameter: "${paramName}". This might be a typo or deprecated parameter.`,
            path: `${path}.${paramName}`,
          });
        }
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
      if (!(propName in params)) continue;
      const actualValue = params[propName];
      // Skip expressions
      if (this.isExpressionValue(actualValue)) continue;
      if (!validValues.has(actualValue)) {
        // Try to find which resource this operation belongs to, for a helpful hint
        let hint = '';
        if (propName === 'operation') {
          const resourceValue = rootParams['resource'];
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
          path: `${path}.${propName}`,
        });
      }
    }

    for (const prop of displayedProps) {
      if (prop.type !== 'filter' || !(prop.name in params)) continue;
      this.validateFilterParameter(node, prop, params[prop.name], `${path}.${prop.name}`, errors);
    }

    for (const prop of displayedProps) {
      if (prop.type !== 'fixedCollection' || !Array.isArray(prop.options)) continue;
      if (!(prop.name in params)) continue;

      const fixedCollectionValue = params[prop.name];
      if (!fixedCollectionValue || typeof fixedCollectionValue !== 'object') continue;

      this.validateFixedCollectionDefaultShape(node, prop, fixedCollectionValue, `${path}.${prop.name}`, errors);

      for (const option of prop.options) {
        if (!option?.name || !Array.isArray(option.values)) continue;
        const optionValue = fixedCollectionValue[option.name];
        if (Array.isArray(optionValue)) {
          optionValue.forEach((item, index) => {
            if (!item || typeof item !== 'object') return;
            this.validateParameterSet(
              node,
              option.values,
              item,
              rootParams,
              `${path}.${prop.name}.${option.name}[${index}]`,
              errors,
              warnings,
              false
            );
          });
        } else if (optionValue && typeof optionValue === 'object') {
          this.validateParameterSet(
            node,
            option.values,
            optionValue,
            rootParams,
            `${path}.${prop.name}.${option.name}`,
            errors,
            warnings,
            false
          );
        }
      }
    }
  }

  private validateFixedCollectionDefaultShape(
    node: any,
    prop: any,
    value: Record<string, any>,
    path: string,
    errors: ValidationError[]
  ): void {
    if (!prop.default || typeof prop.default !== 'object' || Array.isArray(prop.default)) return;

    for (const option of prop.options || []) {
      if (!option?.name || !(option.name in prop.default) || !(option.name in value)) continue;
      this.validateDefaultShape(
        node,
        prop.default[option.name],
        value[option.name],
        `${path}.${option.name}`,
        errors
      );
    }
  }

  private validateFilterParameter(
    node: any,
    prop: any,
    value: any,
    path: string,
    errors: ValidationError[]
  ): void {
    if (!value || typeof value !== 'object') return;

    const filterOptions = prop.typeOptions?.filter;
    if (!filterOptions || typeof filterOptions !== 'object') return;

    const requiredOptionNames = ['caseSensitive', 'typeValidation'].filter((name) => name in filterOptions);
    if (requiredOptionNames.length === 0) return;

    if (!value.options || typeof value.options !== 'object') {
      errors.push({
        type: 'error',
        nodeId: node.id,
        nodeName: node.name,
        message: `Missing required parameter: "${path}.options"`,
        path: `${path}.options`,
      });
      return;
    }

    for (const optionName of requiredOptionNames) {
      if (!(optionName in value.options)) {
        errors.push({
          type: 'error',
          nodeId: node.id,
          nodeName: node.name,
          message: `Missing required parameter: "${path}.options.${optionName}"`,
          path: `${path}.options.${optionName}`,
        });
      }
    }
  }

  private hasNestedDefaultShape(value: any): boolean {
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
  }

  private validateDefaultShape(
    node: any,
    defaultValue: any,
    actualValue: any,
    path: string,
    errors: ValidationError[]
  ): void {
    if (Array.isArray(defaultValue)) {
      if (!Array.isArray(actualValue) || defaultValue.length === 0) return;
      actualValue.forEach((item, index) => {
        this.validateDefaultShape(node, defaultValue[0], item, `${path}[${index}]`, errors);
      });
      return;
    }

    if (!defaultValue || typeof defaultValue !== 'object' || !actualValue || typeof actualValue !== 'object') {
      return;
    }

    for (const [key, nestedDefault] of Object.entries(defaultValue)) {
      const nestedPath = `${path}.${key}`;
      if (!(key in actualValue)) {
        if (this.hasNestedDefaultShape(nestedDefault)) {
          errors.push({
            type: 'error',
            nodeId: node.id,
            nodeName: node.name,
            message: `Missing required parameter: "${nestedPath}"`,
            path: nestedPath,
          });
        }
        continue;
      }

      this.validateDefaultShape(node, nestedDefault, actualValue[key], nestedPath, errors);
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
