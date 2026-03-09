/**
 * TypeScript Formatter
 * 
 * Converts node schemas and workflows to TypeScript code snippets
 * for AI agent consumption
 */

export class TypeScriptFormatter {
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

        // Get unique parameters with smart prioritization
        const seenNames = new Set<string>();
        const uniqueParams: any[] = [];
        const allProps = schema.properties || [];
        
        // Priority 1: resource and operation (essential for most nodes)
        for (const prop of allProps) {
            if ((prop.name === 'resource' || prop.name === 'operation') && !seenNames.has(prop.name)) {
                seenNames.add(prop.name);
                uniqueParams.push(prop);
            }
        }
        
        // Priority 2: Required params (up to 7 total including resource/operation)
        for (const prop of allProps) {
            if (uniqueParams.length >= 7) break;
            if (prop.required && !seenNames.has(prop.name)) {
                seenNames.add(prop.name);
                uniqueParams.push(prop);
            }
        }
        
        // Priority 3: Common optional params (to reach ~7 total)
        for (const prop of allProps) {
            if (uniqueParams.length >= 7) break;
            if (!seenNames.has(prop.name)) {
                seenNames.add(prop.name);
                uniqueParams.push(prop);
            }
        }

        // Build parameter object with comments
        const paramLines: string[] = [];
        
        for (const prop of uniqueParams) {
            const comment = prop.description ? `  // ${prop.description}` : '';
            const requiredLabel = prop.required ? ' (required)' : ' (optional)';
            const typeHint = prop.type ? ` // type: ${prop.type}` : '';
            
            if (comment) {
                paramLines.push(comment);
            }

            const isFixedColl = prop.type?.toLowerCase() === 'fixedcollection';
            let renderProp = prop;
            if (isFixedColl) {
                // n8n stores per-dataType fixedCollection rules as separate properties with the
                // same name but different displayOptions. Merge their options groups so we can
                // show all valid operation values in one snippet.
                const siblings = allProps.filter((p: any) =>
                    p.name === prop.name && p.type?.toLowerCase() === 'fixedcollection');
                if (siblings.length > 1) {
                    const mergedOptions = (siblings as any[]).flatMap((p: any) => p.options || []);
                    renderProp = { ...prop, options: mergedOptions };
                }
            }
            const value = isFixedColl
                ? TypeScriptFormatter.expandFixedCollectionValue(renderProp, '  ')
                : this.generateDefaultValue(prop);
            paramLines.push(`  ${prop.name}: ${value},${typeHint}${requiredLabel}`);
        }

        const paramsStr = paramLines.length > 0 
            ? '\n' + paramLines.join('\n') + '\n  '
            : ' ';

        const className = this.toPascalCase(schema.name);
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

        // Remove duplicates by name (keep first occurrence)
        const seenNames = new Set<string>();
        const uniqueProperties: any[] = [];
        
        for (const prop of schema.properties) {
            if (!seenNames.has(prop.name)) {
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

        return doc;
    }

    /**
     * Generate a minimal node snippet for quick insertion
     */
    static generateMinimalSnippet(schema: {
        name: string;
        type: string;
        displayName: string;
        version: number | number[];
    }): string {
        const latestVersion = Array.isArray(schema.version) 
            ? Math.max(...schema.version) 
            : schema.version;

        const nodeProp = schema.name.charAt(0).toUpperCase() + schema.name.slice(1);

        return `@node({
  name: '${schema.displayName}',
  type: '${schema.type}',
  version: ${latestVersion}
})
${nodeProp} = { /* parameters */ };`;
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
