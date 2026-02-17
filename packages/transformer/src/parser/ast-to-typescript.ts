/**
 * AST to TypeScript Generator
 * 
 * Generates TypeScript code from AST representation
 */

import { WorkflowAST, JsonToTypeScriptOptions } from '../types.js';
import {
    formatTypeScript,
    generateSectionComment,
    generateImportStatement,
    generateClassName
} from '../utils/index.js';

/**
 * Generate TypeScript code from AST
 */
export class AstToTypeScriptGenerator {
    /**
     * Generate TypeScript code
     */
    async generate(ast: WorkflowAST, options: JsonToTypeScriptOptions = {}): Promise<string> {
        const {
            format = true,
            commentStyle = 'verbose',
            className: customClassName
        } = options;
        
        const className = customClassName || generateClassName(ast.metadata.name);
        
        // Generate code sections
        const imports = this.generateImports();
        const classHeader = this.generateClassHeader(ast, className, commentStyle);
        const nodes = this.generateNodes(ast, commentStyle);
        const routing = this.generateRouting(ast, commentStyle);
        const classFooter = '}';
        
        // Combine sections
        let code = [
            imports,
            '',
            classHeader,
            '',
            nodes,
            '',
            routing,
            classFooter
        ].join('\n');
        
        // Format with Prettier if requested
        if (format) {
            code = await formatTypeScript(code);
        }
        
        return code;
    }
    
    /**
     * Generate imports
     */
    private generateImports(): string {
        return generateImportStatement(
            ['workflow', 'node', 'links'],
            '@n8n-as-code/transformer'
        );
    }
    
    /**
     * Generate class header with @workflow decorator
     */
    private generateClassHeader(
        ast: WorkflowAST,
        className: string,
        commentStyle: 'minimal' | 'verbose'
    ): string {
        const lines: string[] = [];
        
        // Section comment
        if (commentStyle === 'verbose') {
            lines.push(generateSectionComment('METADATA DU WORKFLOW'));
            lines.push('');
        }
        
        // Decorator
        const decoratorContent = this.formatWorkflowDecorator(ast.metadata);
        lines.push(`@workflow(${decoratorContent})`);
        
        // Class declaration
        lines.push(`export class ${className} {`);
        
        return lines.join('\n');
    }
    
    /**
     * Format @workflow decorator content
     */
    private formatWorkflowDecorator(metadata: any): string {
        const parts: string[] = [];
        
        parts.push(`id: "${metadata.id}"`);
        parts.push(`name: "${metadata.name}"`);
        parts.push(`active: ${metadata.active}`);
        
        if (metadata.settings && Object.keys(metadata.settings).length > 0) {
            const settings = JSON.stringify(metadata.settings)
                .replace(/"([^"]+)":/g, '$1:'); // Remove quotes from keys
            parts.push(`settings: ${settings}`);
        }
        
        return `{\n    ${parts.join(',\n    ')}\n}`;
    }
    
    /**
     * Generate node declarations
     */
    private generateNodes(ast: WorkflowAST, commentStyle: 'minimal' | 'verbose'): string {
        const lines: string[] = [];
        
        // Section comment
        if (commentStyle === 'verbose') {
            lines.push('    ' + generateSectionComment('CONFIGURATION DES NOEUDS'));
            lines.push('');
        }
        
        // Generate each node
        ast.nodes.forEach(node => {
            lines.push('    ' + this.generateNodeDeclaration(node));
            lines.push('');
        });
        
        return lines.join('\n');
    }
    
    /**
     * Generate single node declaration
     */
    private generateNodeDeclaration(node: any): string {
        const lines: string[] = [];
        
        // Decorator
        const decoratorContent = this.formatNodeDecorator(node);
        lines.push(`@node(${decoratorContent})`);
        
        // Property declaration
        const params = JSON.stringify(node.parameters, null, 4)
            .split('\n')
            .map((line, i) => i === 0 ? line : '    ' + line)
            .join('\n');
        
        lines.push(`${node.propertyName} = ${params};`);
        
        return lines.join('\n    ');
    }
    
    /**
     * Format @node decorator content
     */
    private formatNodeDecorator(node: any): string {
        const parts: string[] = [];
        
        parts.push(`name: "${node.displayName}"`);
        parts.push(`type: "${node.type}"`);
        parts.push(`version: ${node.version}`);
        
        if (node.position) {
            parts.push(`position: [${node.position.join(', ')}]`);
        }
        
        if (node.credentials) {
            const creds = JSON.stringify(node.credentials).replace(/"([^"]+)":/g, '$1:');
            parts.push(`credentials: ${creds}`);
        }
        
        if (node.onError) {
            parts.push(`onError: "${node.onError}"`);
        }
        
        return `{\n        ${parts.join(',\n        ')}\n    }`;
    }
    
    /**
     * Generate routing section (@links)
     */
    private generateRouting(ast: WorkflowAST, commentStyle: 'minimal' | 'verbose'): string {
        const lines: string[] = [];
        
        // Section comment
        if (commentStyle === 'verbose') {
            lines.push('    ' + generateSectionComment('ROUTAGE ET CONNEXIONS'));
            lines.push('');
        }
        
        // Method declaration
        lines.push('    @links()');
        lines.push('    defineRouting() {');
        
        // Generate connections
        if (ast.connections.length > 0) {
            ast.connections.forEach(conn => {
                const fromMethod = conn.from.isError ? 'error()' : `out(${conn.from.output})`;
                const line = `        this.${conn.from.node}.${fromMethod}.to(this.${conn.to.node}.in(${conn.to.input}));`;
                lines.push(line);
            });
        } else {
            lines.push('        // No connections defined');
        }
        
        lines.push('    }');
        
        return lines.join('\n');
    }
}
