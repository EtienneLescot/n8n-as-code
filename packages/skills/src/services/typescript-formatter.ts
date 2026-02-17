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

        const requiredParams = schema.properties?.filter((p: any) => p.required) || [];
        
        // Get unique top parameters (avoid duplicates by name)
        const seenNames = new Set<string>();
        const uniqueParams: any[] = [];
        
        // First add required params
        for (const prop of requiredParams) {
            if (!seenNames.has(prop.name)) {
                seenNames.add(prop.name);
                uniqueParams.push(prop);
            }
        }
        
        // Then add other common parameters (up to 5 total)
        for (const prop of schema.properties || []) {
            if (uniqueParams.length >= 5) break;
            if (!seenNames.has(prop.name)) {
                seenNames.add(prop.name);
                uniqueParams.push(prop);
            }
        }

        // Build parameter object with comments
        const paramLines: string[] = [];
        
        for (const prop of uniqueParams) {
            const comment = prop.description ? `  // ${prop.description}` : '';
            const required = prop.required ? ' (required)' : ' (optional)';
            const typeHint = prop.type ? ` // type: ${prop.type}` : '';
            
            if (comment) {
                paramLines.push(comment);
            }
            
            const value = this.generateDefaultValue(prop);
            paramLines.push(`  ${prop.name}: ${value},${typeHint}${required}`);
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
        
        for (const prop of uniqueProperties) {
            const optional = prop.required ? '' : '?';
            const description = prop.description ? `  /** ${prop.description} */\n` : '';
            const tsType = this.mapTypeToTypeScript(prop);
            
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
        doc += `// Example usage:\n`;
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
                return 'string';
            case 'number':
                return 'number';
            case 'boolean':
                return 'boolean';
            case 'options':
            case 'multioptions':
                if (prop.options && Array.isArray(prop.options)) {
                    const values = prop.options.map((o: any) => `'${o.value || o.name}'`).slice(0, 5);
                    return values.join(' | ') + (prop.options.length > 5 ? ' | string' : '');
                }
                return 'string';
            case 'json':
                return 'object';
            case 'collection':
                return 'any[]';
            case 'fixedcollection':
                return 'Record<string, any>';
            default:
                return 'any';
        }
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
