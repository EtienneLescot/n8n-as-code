/**
 * TypeScript Formatter
 * 
 * Converts node schemas and workflows to TypeScript code snippets
 * for AI agent consumption
 */

export class TypeScriptFormatter {
    /** Pick up to 7 representative params: resource/operation first, then required, then the rest. */
    private static selectKeyParams(allProps: any[]): any[] {
        const picked: any[] = [];
        const seen = new Set<string>();
        const take = (prop: any) => { seen.add(prop.name); picked.push(prop); };

        for (const prop of allProps) {
            if ((prop.name === 'resource' || prop.name === 'operation') && !seen.has(prop.name)) take(prop);
        }
        // Required params first, then any other settable one. Notice banners are UI-only.
        for (const requiredOnly of [true, false]) {
            for (const prop of allProps) {
                if (picked.length >= 7) return picked;
                if (seen.has(prop.name) || prop.type?.toLowerCase() === 'notice') continue;
                if (requiredOnly && !prop.required) continue;
                take(prop);
            }
        }
        return picked;
    }

    /**
     * Render a parameter's example value. n8n stores per-dataType fixedCollection rules as
     * separate properties sharing one name; their option groups are merged so the snippet
     * shows every valid value.
     */
    private static renderParamValue(prop: any, allProps: any[]): string {
        if (prop.type?.toLowerCase() !== 'fixedcollection') {
            return TypeScriptFormatter.generateDefaultValue(prop);
        }
        const siblings = allProps.filter((p: any) =>
            p.name === prop.name && p.type?.toLowerCase() === 'fixedcollection');
        const renderProp = siblings.length > 1
            ? { ...prop, options: siblings.flatMap((p: any) => p.options || []) }
            : prop;
        return TypeScriptFormatter.expandFixedCollectionValue(renderProp, '  ');
    }

    /**
     * Generate a TypeScript node usage example from schema
     */
    static generateNodeSnippet(schema: {
        name: string;
        type: string;
        displayName: string;
        description: string;
        version: number | number[];
        properties?: any[];
    }): string {
        const latestVersion = Array.isArray(schema.version)
            ? Math.max(...schema.version)
            : schema.version;

        const allProps = schema.properties || [];
        const paramLines: string[] = [];

        for (const prop of this.selectKeyParams(allProps)) {
            if (prop.description) {
                paramLines.push(`  // ${prop.description}`);
            }
            const typeHint = prop.type ? ` // type: ${prop.type}` : '';
            const requiredLabel = prop.required ? ' (required)' : ' (optional)';
            paramLines.push(`  ${prop.name}: ${this.renderParamValue(prop, allProps)},${typeHint}${requiredLabel}`);
        }

        const paramsStr = paramLines.length > 0 
            ? '\n' + paramLines.join('\n') + '\n  '
            : ' ';

        const nodeProp = schema.name.charAt(0).toUpperCase() + schema.name.slice(1);

        return `// ${schema.displayName}
// ${schema.description}

import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({
  name: 'My Workflow',
  active: false
})
export class MyWorkflow {
  @node({
    name: '${schema.displayName}',
    type: '${schema.type}',
    version: ${latestVersion}
  })
  ${nodeProp} = {${paramsStr}};

  @links()
  defineRouting() {
    // Connect your nodes here
    // Example: this.${nodeProp}.out(0).to(this.NextNode.in(0));
  }
}
`;
    }

    /**
     * Generate TypeScript interface for node parameters
     */
    static generateNodeInterface(schema: {
        name: string;
        properties?: any[];
    }): string {
        if (!schema.properties || schema.properties.length === 0) {
            return `interface ${this.toPascalCase(schema.name)}Parameters {\n  [key: string]: any;\n}\n`;
        }

        // Remove duplicates by name (keep first occurrence); skip UI-only notice banners
        const seenNames = new Set<string>();
        const uniqueProperties: any[] = [];
        
        for (const prop of schema.properties) {
            if (!seenNames.has(prop.name) && prop.type?.toLowerCase() !== 'notice') {
                seenNames.add(prop.name);
                uniqueProperties.push(prop);
            }
        }

        const interfaceLines: string[] = [];
        const allProps = schema.properties || [];
        
        for (const prop of uniqueProperties) {
            const optional = prop.required ? '' : '?';
            const description = prop.description ? `  /** ${prop.description} */\n` : '';
            // Merge same-name fixedCollection siblings so all dataType groups appear in the type
            let renderProp = prop;
            if (prop.type?.toLowerCase() === 'fixedcollection') {
                const siblings = allProps.filter((p: any) =>
                    p.name === prop.name && p.type?.toLowerCase() === 'fixedcollection');
                if (siblings.length > 1) {
                    const mergedOptions = (siblings as any[]).flatMap((p: any) => p.options || []);
                    renderProp = { ...prop, options: mergedOptions };
                }
            }
            const tsType = this.mapTypeToTypeScript(renderProp);
            
            interfaceLines.push(`${description}  ${prop.name}${optional}: ${tsType};`);
        }

        const interfaceBody = interfaceLines.join('\n');

        return `interface ${this.toPascalCase(schema.name)}Parameters {
${interfaceBody}
}\n`;
    }

    /**
     * Generate a complete node documentation in TypeScript format
     */
    static generateCompleteNodeDoc(schema: {
        name: string;
        type: string;
        displayName: string;
        description: string;
        version: number | number[];
        properties?: any[];
        metadata?: {
            keywords?: string[];
            operations?: string[];
            useCases?: string[];
        };
        parameterGating?: Array<{
            flag: string;
            flagDisplay: string;
            default: boolean;
            gatedParams: string[];
            aiConnectionType: string | null;
        }>;
    }): string {
        const keywords = schema.metadata?.keywords?.slice(0, 5).join(', ') || 'none';
        const operations = schema.metadata?.operations?.slice(0, 5).join(', ') || 'none';
        const useCases = schema.metadata?.useCases?.slice(0, 3) || [];

        let doc = `/**
 * ${schema.displayName}
 * 
 * ${schema.description}
 * 
 * @keywords ${keywords}
 * @operations ${operations}
 */

`;

        // Add interface
        doc += this.generateNodeInterface(schema);
        doc += '\n';

        // Add usage example
        doc += `// Example usage (showing key parameters - see interface above for all options):\n`;
        doc += this.generateNodeSnippet(schema);

        // Add use cases if available
        if (useCases.length > 0) {
            doc += `\n// Common use cases:\n`;
            useCases.forEach((useCase, i) => {
                doc += `// ${i + 1}. ${useCase}\n`;
            });
        }

        // Add parameter gating section if present
        const gating = schema.parameterGating;
        if (gating && gating.length > 0) {
            doc += `\n// ⚠️  Conditional boolean flags — set these to true only when you need the gated params or declared connection:\n`;
            for (const g of gating) {
                if (g.aiConnectionType) {
                    doc += `//   ${g.flag}: true  ← set when .uses({ ${g.aiConnectionType}: ... }) is declared\n`;
                    doc += `//              "${g.flagDisplay}" — enables the declared ${g.aiConnectionType} attachment point\n`;
                } else {
                    const MAX_DISPLAY = 5;
                    const displayParams = g.gatedParams.length > MAX_DISPLAY
                        ? `${g.gatedParams.slice(0, MAX_DISPLAY).join(', ')} (+${g.gatedParams.length - MAX_DISPLAY} more)`
                        : g.gatedParams.join(', ');
                    doc += `//   ${g.flag}: true  ← set when using: ${displayParams}\n`;
                    doc += `//              "${g.flagDisplay}" — enables those parameters\n`;
                }
            }
        }

        return doc;
    }

    /**
     * Universal output projection for token-constrained agent loops.
     * Compact doc = identity + truncated description + required params +
     * short snippet + gating flag names. No per-node heuristics: the same
     * truncation rules apply to every node type, so output size is bounded
     * by options, not by node complexity.
     */
    static generateCompactNodeDoc(schema: {
        name: string;
        type: string;
        displayName: string;
        description: string;
        version: number | number[];
        properties?: any[];
        parameterGating?: Array<{
            flag: string;
            gatedParams: string[];
            aiConnectionType: string | null;
        }>;
    }, opts: { maxDesc?: number; maxEnum?: number; maxRequired?: number; maxGating?: number; maxShape?: number } = {}): string {
        const maxDesc = opts.maxDesc ?? 300;
        const maxEnum = opts.maxEnum ?? 10;
        const maxRequired = opts.maxRequired ?? 15;
        const maxGating = opts.maxGating ?? 10;
        const maxShape = opts.maxShape ?? 240;
        const latestVersion = Array.isArray(schema.version)
            ? Math.max(...schema.version)
            : schema.version;
        const desc = this.truncate(schema.description || '', maxDesc);
        const lines: string[] = [];
        lines.push(`// ${schema.displayName} (${schema.type} v${latestVersion})`);
        if (desc) lines.push(`// ${desc}`);
        const allProps = (schema.properties || []) as any[];
        const seenRequired = new Set<string>();
        const required: string[] = [];
        const ENUM_TYPES = new Set(['options', 'multioptions']);
        const STRUCTURED_TYPES = new Set(['resourcelocator', 'resourcemapper', 'fixedcollection', 'collection']);

        for (const p of allProps) {
            if (!p.required || p.type?.toLowerCase() === 'notice' || seenRequired.has(p.name)) continue;
            seenRequired.add(p.name);
            const type = String(p.type || '').toLowerCase();

            // Union across variants, as the discriminators do: reading one variant's
            // options advertised a subset as the whole set, with no marker that the rest
            // existed. And only enum types get a value list — a fixedCollection's
            // `options` are sub-field groups, which read as allowed scalars in brackets.
            if (ENUM_TYPES.has(type)) {
                const values = this.unionOptionValues(allProps, p.name, latestVersion);
                const enums = values.length > 0
                    ? ` [${this.compactEnumList(values.map((value) => ({ value })), maxEnum)}]`
                    : '';
                required.push(`//   - ${p.name}: ${p.type}${enums}`);
                continue;
            }

            // A bare type name is not enough to write one of these, but the full shape can
            // run to thousands of characters and compact exists to be small — under the cap
            // print the shape; over it, name the type and say where the rest went, the way
            // every other cap here does. A mid-token cut is neither small nor usable.
            if (STRUCTURED_TYPES.has(type)) {
                const shape = this.mapTypeToTypeScript(p);
                required.push(shape.length > maxShape
                    ? `//   - ${p.name}: ${p.type} (shape > ${maxShape} chars — see node-info --json)`
                    : `//   - ${p.name}: ${shape}`);
            } else {
                required.push(`//   - ${p.name}: ${p.type}`);
            }
        }
        if (required.length > 0) {
            lines.push(`// required:`);
            lines.push(...required.slice(0, maxRequired));
            if (required.length > maxRequired) {
                lines.push(`//   ... (+${required.length - maxRequired} more required — see node-schema --json)`);
            }
        }
        // The discriminators an author actually needs. Without them compact is a search
        // result rather than a schema: a builder reported paying a second full lookup per
        // node because the snippet body was an empty placeholder.
        const resources = this.unionOptionValues(allProps, 'resource', latestVersion);
        const operationGroups = this.operationGroups(allProps, latestVersion, new Set(resources));

        if (resources.length > 0) {
            lines.push(`// resource: ${this.compactEnumList(resources.map((value) => ({ value })), maxEnum)}`);
        }
        if (operationGroups.length > 0) {
            const enumOf = (values: string[]) => this.compactEnumList(values.map((value) => ({ value })), maxEnum);
            const ungrouped = operationGroups.length === 1 && operationGroups[0].label === '*';
            if (ungrouped) {
                lines.push(`// operation: ${enumOf(operationGroups[0].operations)}`);
            } else {
                lines.push(`// operation, by resource:`);
                for (const group of operationGroups.slice(0, maxGating)) {
                    lines.push(`//   ${group.label}: ${enumOf(group.operations)}`);
                }
                if (operationGroups.length > maxGating) {
                    lines.push(`//   ... (+${operationGroups.length - maxGating} more — see node-info --json)`);
                }
            }
        }

        const firstResource = resources[0];
        // The snippet is emitted verbatim, so prefer a pair with no gate beyond `resource`:
        // a gated one needs a parameter the snippet does not carry and would not validate.
        const candidates = operationGroups.filter((g) => g.resource === (firstResource ?? '*'));
        const firstOperation = (candidates.find((g) => g.label === g.resource) ?? candidates[0])?.operations[0];
        const discriminators = [
            firstResource ? `  resource: '${firstResource}',` : undefined,
            firstOperation ? `  operation: '${firstOperation}',` : undefined,
        ].filter(Boolean) as string[];

        lines.push(this.generateMinimalSnippet({
            name: schema.name,
            type: schema.type,
            displayName: schema.displayName,
            version: schema.version,
        }, discriminators));
        const gating = schema.parameterGating || [];
        if (gating.length > 0) {
            lines.push(`// gating flags (set true only when using the gated params/connection):`);
            for (const g of gating.slice(0, maxGating)) {
                lines.push(`//   - ${g.flag}`);
            }
            if (gating.length > maxGating) {
                lines.push(`//   ... (+${gating.length - maxGating} more flags — see node-info --json)`);
            }
        }
        return lines.join('\n') + '\n';
    }

    private static truncate(s: string, n: number): string {
        const oneLine = s.replace(/\s+/g, ' ').trim();
        return oneLine.length > n ? oneLine.slice(0, n - 1) + '…' : oneLine;
    }

    /**
     * Union the options of every property sharing a name.
     *
     * n8n splits one logical parameter into several properties gated by `displayOptions`,
     * so reading only the first advertises one variant's values as if they were the whole
     * set — compact told an agent `gmail` could only `create|delete|get|getAll`, hiding
     * `send`, and it picked a wrong operation on that basis.
     */
    private static unionOptionValues(allProps: any[], name: string, version?: number): string[] {
        const seen = new Set<string>();
        for (const prop of allProps) {
            if (prop.name !== name || !Array.isArray(prop.options)) continue;
            if (version !== undefined && !this.matchesVersion(prop.displayOptions?.show?.['@version'], version)) continue;
            for (const option of prop.options) {
                const value = option?.value ?? option?.name;
                if (value !== undefined) seen.add(String(value));
            }
        }
        return [...seen];
    }

    /**
     * Operations grouped by the conditions that make them reachable.
     *
     * The validator decides an `operation` variant applies by evaluating every key of its
     * `displayOptions.show`, so grouping on `resource` alone advertised pairs it rejects:
     * variants belonging to another node version, and variants that additionally require
     * `source` or `authentication` to be set. Both are kept honest here rather than
     * dropped — a gated pair is valid once its gate is named.
     */
    private static operationGroups(
        allProps: any[],
        version: number,
        knownResources: Set<string>,
    ): Array<{ resource: string; label: string; operations: string[] }> {
        const groups = new Map<string, { resource: string; label: string; operations: string[] }>();

        for (const prop of allProps) {
            if (prop.name !== 'operation' || !Array.isArray(prop.options)) continue;
            const show: Record<string, unknown> = prop.displayOptions?.show ?? {};
            if (!this.matchesVersion(show['@version'], version)) continue;

            const resources = Array.isArray(show.resource) ? show.resource.map(String) : ['*'];
            const gates = Object.entries(show)
                .filter(([key]) => key !== 'resource' && key !== '@version')
                .map(([key, values]) => `${key}=${(Array.isArray(values) ? values : [values]).join('|')}`);

            for (const resource of resources) {
                // A resource the node's own enum does not carry is not a pair anyone can
                // write: the value is rejected before the operation is ever looked at.
                if (resource !== '*' && knownResources.size > 0 && !knownResources.has(resource)) continue;
                const label = gates.length > 0 ? `${resource} (${gates.join(', ')})` : resource;
                const group = groups.get(label) ?? { resource, label, operations: [] };
                for (const option of prop.options) {
                    const value = option?.value ?? option?.name;
                    if (value === undefined) continue;
                    if (!group.operations.includes(String(value))) group.operations.push(String(value));
                }
                groups.set(label, group);
            }
        }
        return [...groups.values()];
    }

    /**
     * Evaluate a `displayOptions.show['@version']` condition: a list of plain versions, or
     * of `{ _cnd: { gte: 1.1 } }` comparators. Absent condition means every version.
     */
    private static matchesVersion(condition: unknown, version: number): boolean {
        if (!Array.isArray(condition)) return true;
        return condition.some((entry: any) => {
            const cnd = entry?._cnd;
            if (!cnd) return Number(entry) === version;
            return Object.entries(cnd).every(([operator, value]: [string, any]) => {
                switch (operator) {
                    case 'eq': return version === value;
                    case 'not': return version !== value;
                    case 'gt': return version > value;
                    case 'gte': return version >= value;
                    case 'lt': return version < value;
                    case 'lte': return version <= value;
                    case 'between': return version >= value?.from && version <= value?.to;
                    default: return true;
                }
            });
        });
    }

    private static compactEnumList(options: any[], max: number): string {
        const values = options.map((o: any) => String(o.value ?? o.name));
        return values.length > max
            ? [...values.slice(0, max), `+${values.length - max} more`].join(' | ')
            : values.join(' | ');
    }

    /**
     * Generate a minimal node snippet for quick insertion
     */
    static generateMinimalSnippet(schema: {
        name: string;
        type: string;
        displayName: string;
        version: number | number[];
    }, bodyLines: string[] = []): string {
        const latestVersion = Array.isArray(schema.version) 
            ? Math.max(...schema.version) 
            : schema.version;

        const nodeProp = schema.name.charAt(0).toUpperCase() + schema.name.slice(1);

        const body = bodyLines.length > 0
            ? `\n${bodyLines.join('\n')}\n`
            : ' /* parameters */ ';

        return `@node({
  name: '${schema.displayName}',
  type: '${schema.type}',
  version: ${latestVersion}
})
${nodeProp} = {${body}};`;
    }

    /**
     * Format search results as TypeScript snippets
     */
    static formatSearchResults(results: Array<{
        name: string;
        type: string;
        displayName: string;
        description: string;
        version: number | number[];
    }>): string {
        if (results.length === 0) {
            return '// No results found\n';
        }

        let output = '// Search Results - Copy and paste the node you need:\n\n';
        
        results.forEach((result, index) => {
            output += `// ${index + 1}. ${result.displayName}\n`;
            output += `// ${result.description}\n`;
            output += this.generateMinimalSnippet(result);
            output += '\n\n';
        });

        return output;
    }

    // ==================== HELPER METHODS ====================

    private static toPascalCase(str: string): string {
        return str
            .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
            .replace(/^(.)/, (_, c) => c.toUpperCase());
    }

    private static mapTypeToTypeScript(prop: any): string {
        const type = prop.type?.toLowerCase();

        switch (type) {
            case 'string':
            case 'hidden':
            case 'datetime':
                return 'string';
            case 'number':
                return 'number';
            case 'boolean':
                return 'boolean';
            case 'options':
            case 'multioptions':
                if (prop.options && Array.isArray(prop.options)) {
                    // Show ALL valid enum values — `options` is a strict enum, never add | string
                    return prop.options.map((o: any) => `'${o.value || o.name}'`).join(' | ');
                }
                return 'string';
            case 'json':
                return 'object';
            case 'collection':
                return 'any[]';
            // assignmentCollection is the Set node's special type (v3+).
            // At runtime the JSON structure is { assignments: Array<{id,name,value,type}> }
            case 'assignmentcollection':
                return `{ assignments: Array<{ id?: string; name: string; value: string | number | boolean | unknown[] | Record<string, unknown>; type?: 'string' | 'number' | 'boolean' | 'array' | 'object' }> }`;
            case 'resourcelocator':
                return `{ __rl: true; value: string; mode: 'list' | 'id' | 'url' | string }`;
            case 'fixedcollection': {
                const opts = prop.options as any[] | undefined;
                if (!opts || opts.length === 0) return 'Record<string, any>';
                const collKey = opts[0].name as string;
                // Merge field definitions across all groups, aggregating option values and primitive types
                const fieldMap = new Map<string, { field: any; allOptions: any[]; typeSet: Set<string> }>();
                for (const group of opts) {
                    for (const f of (group.values as any[] || [])) {
                        // For nested fixedcollection fields, f.options contains groups (not enum values).
                        // Don't populate allOptions with group names — that would produce `field?: 'groupName'`.
                        const isNestedFixedColl = f.type?.toLowerCase() === 'fixedcollection';
                        if (!fieldMap.has(f.name)) {
                            fieldMap.set(f.name, { field: f, allOptions: (!isNestedFixedColl && f.options) ? [...f.options] : [], typeSet: new Set([f.type]) });
                        } else {
                            const existing = fieldMap.get(f.name)!;
                            if (f.type) existing.typeSet.add(f.type);
                            if (!isNestedFixedColl) {
                                for (const opt of (f.options || [])) {
                                    if (!existing.allOptions.find((o: any) => o.value === opt.value)) existing.allOptions.push(opt);
                                }
                            }
                        }
                    }
                }
                if (fieldMap.size === 0) return 'Record<string, any>';
                const itemFields = Array.from(fieldMap.values())
                    .map(({ field: f, allOptions, typeSet }) => {
                        let t: string;
                        if (allOptions.length > 0) {
                            // Show ALL valid enum values — strict enum, never add | string
                            t = allOptions.map((o: any) => `'${o.value ?? o.name}'`).join(' | ');
                        } else if (typeSet.size > 1) {
                            // Field used with multiple types across dataType groups — build a union
                            t = Array.from(typeSet)
                                .map(tp => TypeScriptFormatter.mapTypeToTypeScript({ ...f, type: tp }))
                                .filter((v, i, arr) => arr.indexOf(v) === i)
                                .join(' | ');
                        } else {
                            t = TypeScriptFormatter.mapTypeToTypeScript(f);
                        }
                        return `${f.name}?: ${t}`;
                    }).join('; ');
                return `{ ${collKey}?: Array<{ ${itemFields} }> }`;
            }
            default:
                return 'any';
        }
    }

    /**
     * Expand a fixedCollection property into a readable multi-line TypeScript value,
     * showing the internal structure with all valid option values as inline comments.
     * Picks the most informative option group (prefers 'string' group, falls back to largest).
     * Aggregates all operation values across groups into the comment for the `operation` field.
     */
    static expandFixedCollectionValue(prop: any, baseIndent: string): string {
        const options = prop.options as any[] | undefined;
        if (!options || options.length === 0) return '{}';

        // Pick the most informative group: prefer one whose displayName matches 'string',
        // otherwise pick the group with the most fields
        let selectedGroup = options.find((g: any) => /string/i.test(g.displayName || g.name));
        if (!selectedGroup) {
            selectedGroup = options.reduce((best: any, g: any) =>
                (g.values?.length || 0) > (best.values?.length || 0) ? g : best, options[0]);
        }

        // The outer collection key is shared across all groups (e.g. 'rules' in Switch)
        const outerKey = options[0].name as string;

        // Aggregate ALL operation values from ALL groups for the operation field comment
        const allOpValues: string[] = [];
        for (const group of options) {
            const opField = (group.values as any[] | undefined)?.find((v: any) => v.name === 'operation');
            for (const opt of (opField?.options || [])) {
                const val = opt.value ?? opt.name;
                if (!allOpValues.includes(val)) allOpValues.push(val);
            }
        }

        const values = selectedGroup.values as any[] | undefined;
        if (!values || values.length === 0) return '{}';

        const inner      = baseIndent + '  ';   // collection key level
        const itemIndent = baseIndent + '    '; // item object level
        const fieldInd   = baseIndent + '      '; // field level inside item

        const fieldLines: string[] = [];
        const renderedFields = new Set<string>();
        for (const field of values) {
            if (renderedFields.has(field.name)) continue; // n8n reuses field names for conditional variants
            renderedFields.add(field.name);
            let value: string;
            let note = '';
            if (field.type?.toLowerCase() === 'fixedcollection') {
                // Recursively expand nested fixedcollections (e.g. fieldOptions inside formFields)
                value = TypeScriptFormatter.expandFixedCollectionValue(field, fieldInd);
            } else {
                value = TypeScriptFormatter.generateDefaultValue(field);
                if (field.name === 'operation' && allOpValues.length > 0) {
                    note = `  // valid: ${allOpValues.join(' | ')}`;
                } else if ((field.options as any[] | undefined)?.length) {
                    note = `  // valid: ${(field.options as any[]).map((o: any) => o.value ?? o.name).join(' | ')}`;
                }
            }
            fieldLines.push(`${fieldInd}${field.name}: ${value},${note}`);
        }

        return [
            `{`,
            `${inner}${outerKey}: [`,
            `${itemIndent}{`,
            ...fieldLines,
            `${itemIndent}}`,
            `${inner}]`,
            `${baseIndent}}`
        ].join('\n');
    }

    private static generateDefaultValue(prop: any): string {
        const type = prop.type?.toLowerCase();

        // assignmentCollection's schema default is `{}` but the runtime structure needs the
        // full assignments array — always override regardless of prop.default.
        if (type === 'assignmentcollection') {
            return `{\n    assignments: [\n      {\n        id: '1',\n        name: 'fieldName',\n        value: 'fieldValue',\n        type: 'string',  // valid: string | number | boolean | array | object\n      }\n    ]\n  }`;
        }

        // resourceLocator runtime structure requires __rl: true, mode, and value
        if (type === 'resourcelocator') {
            const mode = typeof prop.default === 'object' && prop.default !== null && prop.default.mode
                ? prop.default.mode
                : 'list';
            const value = typeof prop.default === 'object' && prop.default !== null && prop.default.value !== undefined
                ? prop.default.value
                : (typeof prop.default === 'string' ? prop.default : '');
            return `{ __rl: true, value: '${value}', mode: '${mode}' }`;
        }

        if (prop.default !== undefined && prop.default !== null) {
            if (typeof prop.default === 'string') {
                return `'${prop.default}'`;
            }
            if (typeof prop.default === 'object') {
                return JSON.stringify(prop.default);
            }
            return String(prop.default);
        }

        switch (type) {
            case 'string':
            case 'hidden':
                return "''";
            case 'number':
                return '0';
            case 'boolean':
                return 'false';
            case 'options':
            case 'multioptions':
                if (prop.options && prop.options[0]) {
                    const firstValue = prop.options[0].value || prop.options[0].name;
                    return `'${firstValue}'`;
                }
                return "''";
            case 'json':
                return '{}';
            case 'collection':
                return '[]';
            case 'fixedcollection':
                return '{}';
            default:
                return "''";
        }
    }
}
