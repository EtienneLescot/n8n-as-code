import { NodeSchemaProvider } from './node-schema-provider.js';
import { resolveCustomNodesConfig } from './custom-nodes-config.js';
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

  /**
   * @param customIndexPath - Path to the technical node index (defaults to the bundled asset)
   * @param customNodesPath - Path to the custom-node sidecar. When omitted it is resolved from
   *   the current project (n8nac-config.json / n8nac-custom-nodes.json), so embedders such as
   *   `n8nac push --verify` honour the sidecar without wiring it themselves.
   */
  constructor(customIndexPath?: string, customNodesPath?: string) {
    this.provider = new NodeSchemaProvider(
      customIndexPath,
      customNodesPath ?? resolveCustomNodesConfig().resolvedPath
    );
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

      // Check if node type exists. Look up by full type — the provider falls back to the
      // short name itself, and truncating here would resolve "@n8n/n8n-nodes-langchain.code"
      // to the unrelated "n8n-nodes-base.code" schema.
      const nodeSchema = this.provider.getNodeSchema(node.type);
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
      this.validateFallbackModels(workflow.connections, nodeMap, errors);
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

  private hasOwnProperty(obj: any, key: string): boolean {
    return obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
  }

  private nodeVersionOf(node?: any): number {
    const rawVersion = node?.typeVersion ?? node?.version ?? 1;
    return typeof rawVersion === 'number' ? rawVersion : (Number(rawVersion) || 1);
  }

  /**
   * Whether a schema property entry applies to the node's typeVersion.
   * The technical index stores one property entry per (version, condition)
   * combination, so entries whose `@version` condition excludes the current
   * typeVersion must not influence validation of this node.
   */
  private isVersionRelevant(prop: any, node?: any): boolean {
    const version = this.nodeVersionOf(node);
    const show = prop?.displayOptions?.show;
    if (show && this.hasOwnProperty(show, '@version')) {
      return this.matchesVersionCondition(show['@version'], version);
    }
    const hide = prop?.displayOptions?.hide;
    if (hide && this.hasOwnProperty(hide, '@version')) {
      return !this.matchesVersionCondition(hide['@version'], version);
    }
    return true;
  }

  /**
   * Resolve the effective value of a display-condition parameter the way the
   * n8n server does: the explicitly set parameter wins, otherwise the schema
   * default of the version-appropriate property variant applies.
   *
   * `/`-prefixed condition names always reference the node's root parameters;
   * plain names reference the current parameter level first (nested fixed
   * collection items), then the root level — mirroring n8n's own resolution.
   */
  private effectiveConditionValue(
    condParamName: string,
    nodeParams: Record<string, any>,
    rootParams: Record<string, any>,
    levelProps: any[] | undefined,
    rootProps: any[] | undefined,
    node: any,
    depth = 0
  ): any {
    const isRoot = condParamName.startsWith('/');
    const name = isRoot ? condParamName.slice(1) : condParamName;
    const levelParams = isRoot ? rootParams : nodeParams;

    if (this.hasOwnProperty(levelParams, name)) {
      return levelParams[name];
    }
    if (depth > 3) {
      return undefined;
    }

    const propSource = isRoot ? rootProps || levelProps : levelProps;
    const candidates = (propSource || []).filter(
      (p: any) => p?.name === name && this.isVersionRelevant(p, node)
    );
    if (candidates.length === 0) {
      return undefined;
    }

    // Prefer the variant whose non-@version conditions already hold for the
    // provided parameters (e.g. promptType has separate "auto"/"define"
    // variants with different defaults). Without any satisfied variant, fall
    // back to the first version-relevant entry.
    const satisfied = candidates.find((p: any) =>
      this.isPropertyDisplayed(p, levelParams, levelParams, node, propSource, propSource, depth + 1)
    );
    const chosen = satisfied ?? candidates[0];
    return chosen?.default;
  }

  private matchesVersionCondition(condition: any, nodeVersion: number): boolean {
    if (Array.isArray(condition)) {
      return condition.some((c) => this.evalVersionCondition(c, nodeVersion));
    }
    return this.evalVersionCondition(condition, nodeVersion);
  }

  private evalVersionCondition(cond: any, nodeVersion: number): boolean {
    if (typeof cond === 'number') {
      return nodeVersion === cond;
    }
    if (typeof cond === 'string') {
      const num = Number(cond);
      return !isNaN(num) ? nodeVersion === num : String(nodeVersion) === cond;
    }
    if (!cond || typeof cond !== 'object') {
      return false;
    }

    const rule = (cond._cnd && typeof cond._cnd === 'object') ? cond._cnd : cond;

    if (rule.eq !== undefined && !(nodeVersion === Number(rule.eq))) return false;
    if (rule.lte !== undefined && !(nodeVersion <= Number(rule.lte))) return false;
    if (rule.gte !== undefined && !(nodeVersion >= Number(rule.gte))) return false;
    if (rule.lt !== undefined && !(nodeVersion < Number(rule.lt))) return false;
    if (rule.gt !== undefined && !(nodeVersion > Number(rule.gt))) return false;

    return true;
  }

  /**
   * Check whether a schema property's displayOptions conditions are satisfied
   * by the effective parameters (explicit values first, schema defaults for
   * missing condition parameters). If no displayOptions defined -> always shown.
   *
   * `levelProps` / `rootProps` carry the property lists whose defaults may
   * satisfy condition parameters at the current level / at the node root.
   */
  private isPropertyDisplayed(
    prop: any,
    nodeParams: Record<string, any>,
    rootParams: Record<string, any> = nodeParams,
    node?: any,
    levelProps?: any[],
    rootProps?: any[],
    depth = 0
  ): boolean {
    const nodeVersion = this.nodeVersionOf(node);

    const hide = prop.displayOptions?.hide;
    if (hide && typeof hide === 'object') {
      for (const [condParamName, hiddenValues] of Object.entries(hide)) {
        if (condParamName === '@version') {
          if (this.matchesVersionCondition(hiddenValues, nodeVersion)) return false;
          continue;
        }
        if (!Array.isArray(hiddenValues)) continue;
        const actualValue = this.effectiveConditionValue(condParamName, nodeParams, rootParams, levelProps, rootProps, node, depth);
        if (hiddenValues.includes(actualValue)) return false;
      }
    }

    const show = prop.displayOptions?.show;
    if (!show || typeof show !== 'object') return true;

    for (const [condParamName, allowedValues] of Object.entries(show)) {
      if (condParamName === '@version') {
        if (!this.matchesVersionCondition(allowedValues, nodeVersion)) return false;
        continue;
      }
      if (!Array.isArray(allowedValues)) continue;
      const actualValue = this.effectiveConditionValue(condParamName, nodeParams, rootParams, levelProps, rootProps, node, depth);
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
    this.validateParameterSet(node, schemaProps, node.parameters, node.parameters, `nodes[${node.name}].parameters`, errors, warnings, true, schemaProps);

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
        (p: any) => p.name === 'operation' && (p.type === 'options' || p.type === 'multiOptions') &&
          Array.isArray(p.displayOptions?.show?.resource) &&
          p.displayOptions.show.resource.includes(resourceValue) &&
          this.isPropertyDisplayed(p, node.parameters, node.parameters, node, schemaProps, schemaProps)
      );
      if (scopedOpProps.length > 0) {
        const scopedValues = new Set<string | number>(
          scopedOpProps.flatMap((p: any) => p.options?.map((o: any) => o.value) ?? [])
        );
        const opPath = `nodes[${node.name}].parameters.operation`;
        if (!scopedValues.has(operationValue) && !errors.some(e => e.path === opPath)) {
          const validOps = [...scopedValues].join(', ');
          errors.push({
            type: 'error',
            nodeId: node.id,
            nodeName: node.name,
            message: `Operation "${operationValue}" is not valid for resource "${resourceValue}". n8n will show "Could not find property option". Valid operations for resource "${resourceValue}": [${validOps}].`,
            path: opPath,
          });
        }
      }
    }
  }

  private literalConditionText(value: any): string {
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (value === null) return 'null';
    return String(value);
  }

  private variantConditionText(prop: any): string {
    const conds: string[] = [];
    const render = (map: any, negated: boolean) => {
      for (const [key, values] of Object.entries(map ?? {})) {
        if (key === '@version') continue;
        if (!Array.isArray(values)) continue;
        for (const value of values) {
          conds.push(negated
            ? `${key}!==${this.literalConditionText(value)}`
            : `${key}=${this.literalConditionText(value)}`);
        }
      }
    };
    render(prop.displayOptions?.show, false);
    render(prop.displayOptions?.hide, true);
    return conds.join(', ');
  }

  private parameterDottedPath(path: string, paramKey: string): string {
    // Convert the internal `nodes[<name>].parameters...` path into the server-style
    // `parameters...` path used in validation messages.
    const dotted = path.replace(/^nodes\[[^\]]*\]\.parameters/, 'parameters');
    return `${dotted}.${paramKey}`;
  }

  private hiddenParametersMessage(dottedPath: string, failingVariants: any[]): string {
    const label = `Field "${dottedPath}": This field is only allowed`;
    const descriptions = failingVariants.map((v) => this.variantConditionText(v)).filter(Boolean);
    if (descriptions.length === 0) {
      return `${label} under the current parameter values.`;
    }
    if (descriptions.length === 1) {
      return `${label} when: ${descriptions[0]}`;
    }
    return `${label} when one of: ${descriptions.map((d) => `(${d})`).join(' or ')}`;
  }

  /**
   * Server-equivalent presence gating: n8n's `validate_node_config` rejects any
   * parameter that is explicitly present while every schema variant of that
   * parameter is hidden by the current display conditions (evaluated against
   * effective values, i.e. explicit parameters first, schema defaults second).
   */
  private validateNoHiddenParameters(
    node: any,
    schemaProps: any[],
    params: Record<string, any>,
    rootParams: Record<string, any>,
    path: string,
    rootSchemaProps: any[],
    errors: ValidationError[]
  ): void {
    for (const paramKey of Object.keys(params)) {
      const variants = schemaProps.filter((p: any) => p.name === paramKey);
      if (variants.length === 0) continue; // unknown parameters are reported as warnings

      const relevant = variants.filter((p: any) => this.isVersionRelevant(p, node));
      if (relevant.length === 0) continue; // parameter belongs to another typeVersion

      const shown = relevant.filter((p: any) =>
        this.isPropertyDisplayed(p, params, rootParams, node, schemaProps, rootSchemaProps)
      );
      if (shown.length > 0) continue;

      errors.push({
        type: 'error',
        nodeId: node.id,
        nodeName: node.name,
        message: this.hiddenParametersMessage(this.parameterDottedPath(path, paramKey), relevant),
        path: `${path}.${paramKey}`,
      });
    }
  }

  /**
   * Resource-locator shape invariant: an explicitly-set object value for a
   * `resourceLocator` parameter must carry `__rl: true` plus `mode`/`value`.
   * The n8n server rejects anything else ("parameters.<x>.__rl must be true").
   */
  private validateResourceLocatorShapes(
    node: any,
    schemaProps: any[],
    params: Record<string, any>,
    rootParams: Record<string, any>,
    path: string,
    rootSchemaProps: any[],
    errors: ValidationError[]
  ): void {
    for (const paramKey of Object.keys(params)) {
      const value = params[paramKey];
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      if (!this.hasOwnProperty(value, 'mode') && !this.hasOwnProperty(value, 'value')) continue;

      const relevant = schemaProps.filter(
        (p: any) => p.name === paramKey && p.type === 'resourceLocator' && this.isVersionRelevant(p, node)
      );
      if (relevant.length === 0) continue;

      if (value.__rl !== true) {
        errors.push({
          type: 'error',
          nodeId: node.id,
          nodeName: node.name,
          message: `Validation failed: "parameters.${paramKey}.__rl" must be "true". Resource-locator parameters must be objects shaped like {"__rl": true, "mode": "...", "value": "..."}.`,
          path: `${path}.${paramKey}.__rl`,
        });
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
    warnUnknownParameters: boolean,
    rootSchemaProps: any[] = schemaProps
  ): void {
    // Only consider props whose display conditions are satisfied by the effective
    // params (explicit values first, schema defaults for missing condition params)
    const displayedProps = schemaProps.filter((p: any) => this.isPropertyDisplayed(p, params, rootParams, node, schemaProps, rootSchemaProps));
    const hasUsableDefault = (p: any): boolean => p.default !== undefined && p.default !== null && p.default !== '';
    const requiredProps = displayedProps.filter((p: any) => p.required === true && !hasUsableDefault(p));

    // Server-equivalent presence gating: explicitly-set parameters that every
    // schema variant hides are rejected by validate_node_config.
    this.validateNoHiddenParameters(node, schemaProps, params, rootParams, path, rootSchemaProps, errors);
    this.validateResourceLocatorShapes(node, schemaProps, params, rootParams, path, rootSchemaProps, errors);

    // Check required parameters
    for (const prop of requiredProps) {
      if (!(prop.name in params)) {
        errors.push({
          type: 'error',
          nodeId: node?.id,
          nodeName: node?.name,
          message: `Missing required parameter: "${prop.name}"`,
          path: `${path}.${prop.name}`,
        });
      }
    }

    // Check for unknown parameters (might be typos).
    // A schema declaring no properties says nothing about what is known, so flagging every
    // parameter would be noise — that is how a custom-node override opts out of the check.
    if (warnUnknownParameters && schemaProps.length > 0) {
      const knownParamNames = new Set(schemaProps.map((p: any) => p.name));
      for (const paramName of Object.keys(params)) {
        if (!knownParamNames.has(paramName)) {
          warnings.push({
            type: 'warning',
            nodeId: node?.id,
            nodeName: node?.name,
            message: `Unknown parameter: "${paramName}". This might be a typo or deprecated parameter.`,
            path: `${path}.${paramName}`,
          });
        }
      }
    }

    // Validate 'options' and 'multiOptions' type parameter values
    // Collect all valid values for each options-type property across displayed properties
    const optionValuesByPropName = new Map<string, Set<string | number>>();
    for (const prop of displayedProps) {
      if ((prop.type === 'options' || prop.type === 'multiOptions') && Array.isArray(prop.options)) {
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
      if (validValues.size === 0) continue;
      if (!(propName in params)) continue;
      const actualValue = params[propName];
      // Skip expressions
      if (this.isExpressionValue(actualValue)) continue;
      // Skip ResourceLocator values
      if (actualValue && typeof actualValue === 'object' && actualValue.__rl === true) continue;

      if (Array.isArray(actualValue)) {
        const invalidValues = actualValue.filter(
          (v: any) => !this.isExpressionValue(v) && !(v && typeof v === 'object' && v.__rl === true) && !validValues.has(v)
        );
        if (invalidValues.length > 0) {
          const validList = [...validValues].slice(0, 20).join(', ') + (validValues.size > 20 ? ', ...' : '');
          errors.push({
            type: 'error',
            nodeId: node?.id,
            nodeName: node?.name,
            message: `Invalid value(s) [${invalidValues.join(', ')}] for parameter "${propName}". n8n will reject this with "Could not find property option". All known values: [${validList}].`,
            path: `${path}.${propName}`,
          });
        }
      } else {
        if (!validValues.has(actualValue)) {
          // Try to find which resource this operation belongs to, for a helpful hint
          let hint = '';
          if (propName === 'operation') {
            const resourceValue = rootParams['resource'];
            if (resourceValue) {
              // Find operation props scoped to this resource
              const scopedOps = schemaProps
                .filter((p: any) => p.name === 'operation' && (p.type === 'options' || p.type === 'multiOptions') &&
                  Array.isArray(p.displayOptions?.show?.resource) &&
                  p.displayOptions.show.resource.includes(resourceValue) &&
                  this.isPropertyDisplayed(p, rootParams, rootParams, node, schemaProps, rootSchemaProps))
                .flatMap((p: any) => p.options?.map((o: any) => o.value) ?? []);
              if (scopedOps.length > 0) {
                hint = ` For resource "${resourceValue}", valid operations are: [${scopedOps.join(', ')}].`;
              }
            }
          }
          const validList = [...validValues].slice(0, 20).join(', ') + (validValues.size > 20 ? ', ...' : '');
          errors.push({
            type: 'error',
            nodeId: node?.id,
            nodeName: node?.name,
            message: `Invalid value "${actualValue}" for parameter "${propName}". n8n will reject this with "Could not find property option".${hint} All known values: [${validList}].`,
            path: `${path}.${propName}`,
          });
        }
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
              false,
              rootSchemaProps
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
            false,
            rootSchemaProps
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
   * `needsFallback: true` requires a second model on ai_languageModel input 1.
   * Without it the node fails at run time with "A Fallback Model sub-node must
   * be connected and enabled" — and with onError: continueRegularOutput that
   * failure is invisible, so refuse to push it.
   */
  private validateFallbackModels(
    connections: any,
    nodeMap: Map<string, any>,
    errors: ValidationError[]
  ): void {
    const connectedSlots = new Set<string>();
    for (const [sourceName, sourceConnections] of Object.entries(connections)) {
      // A disabled model never runs, so it cannot satisfy the fallback
      // requirement — n8n rejects it at run time with "must be connected
      // and enabled".
      if (nodeMap.get(sourceName)?.disabled === true) continue;
      const roleGroups = (sourceConnections as any)?.ai_languageModel;
      if (!Array.isArray(roleGroups)) continue;
      for (const group of roleGroups) {
        if (!Array.isArray(group)) {
          // validateConnections only traverses "main"; nothing else reports
          // malformed ai_languageModel wiring, so it must be rejected here.
          errors.push({
            type: 'error',
            nodeName: sourceName,
            message: `Malformed ai_languageModel connection group on node "${sourceName}": expected an array of connections`,
          });
          continue;
        }
        for (const conn of group) {
          if (!conn || typeof conn !== 'object' || typeof conn.node !== 'string') {
            errors.push({
              type: 'error',
              nodeName: sourceName,
              message: `Malformed ai_languageModel connection on node "${sourceName}": missing or invalid "node" field`,
            });
            continue;
          }
          connectedSlots.add(`${conn.node}#${conn.index ?? 0}`);
        }
      }
    }

    for (const [name, node] of nodeMap) {
      if (node.parameters?.needsFallback !== true) continue;
      if (connectedSlots.has(`${name}#1`)) continue;
      errors.push({
        type: 'error',
        nodeId: node.id,
        nodeName: name,
        message: `Node "${name}" has needsFallback: true but no fallback model on ai_languageModel input 1. Declare both models: .uses({ ai_languageModel: [this.Model.output, this.FallbackModel.output] })`,
        path: `nodes[${name}].parameters.needsFallback`,
      });
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
