/**
 * AST to TypeScript Generator
 * 
 * Generates TypeScript code from AST representation
 */

import { WorkflowAST, NodeAST, ConnectionAST, JsonToTypeScriptOptions } from '../types.js';
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
        const workflowMap = this.generateWorkflowMap(ast);
        const classHeader = this.generateClassHeader(ast, className, commentStyle);
        const nodes = this.generateNodes(ast, commentStyle);
        const routing = this.generateRouting(ast, commentStyle);
        const classFooter = '}';
        
        // Combine sections
        let code = [
            imports,
            '',
            workflowMap,
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
     * Generate the workflow-map comment block.
     * This block is ignored by TypeScriptParser (it is a plain comment) but
     * provides a fast orientation index for AI agents and human developers:
     *   1. NODE INDEX  — property name, line hint (approximate), short node type
     *   2. ROUTING MAP — ASCII flow of main + AI connections
     *
     * Agents should read this block first (between <workflow-map> tags) before
     * opening the full file, to quickly locate the sections they need to edit.
     */
    private generateWorkflowMap(ast: WorkflowAST): string {
        const lines: string[] = [];
        lines.push('// <workflow-map>');
        lines.push(`// Workflow : ${ast.metadata.name}`);
        lines.push(`// Nodes   : ${ast.nodes.length}  |  Connections: ${ast.connections.length}`);
        lines.push('//');

        // ── NODE INDEX ────────────────────────────────────────────────────────
        lines.push('// NODE INDEX');
        lines.push('// ──────────────────────────────────────────────────────────────────');
        lines.push('// Property name                    Node type (short)         Flags');

        const shortType = (type: string) => type.split('.').pop() ?? type;

        // Build reverse map: subNodePropertyName → [ai_role1, ai_role2, ...]
        // Derived from each consumer node's aiDependencies so sub-nodes can be
        // annotated with their AI connection role(s) in the NODE INDEX.
        const subNodeRoles = new Map<string, string[]>();
        for (const n of ast.nodes) {
            if (!n.aiDependencies) continue;
            for (const [role, target] of Object.entries(n.aiDependencies)) {
                const targets = Array.isArray(target) ? target : [target as string];
                for (const subNode of targets) {
                    if (!subNode) continue;
                    if (!subNodeRoles.has(subNode)) subNodeRoles.set(subNode, []);
                    subNodeRoles.get(subNode)!.push(role);
                }
            }
        }

        for (const n of ast.nodes) {
            const prop = n.propertyName.padEnd(34);
            const t = shortType(n.type).padEnd(26);
            const flags: string[] = [];
            if (n.aiDependencies && Object.keys(n.aiDependencies).length > 0) flags.push('[AI]');
            if (n.onError === 'continueErrorOutput') flags.push('[onError→out(1)]');
            if (n.onError === 'continueRegularOutput') flags.push('[onError→regular]');
            if (n.credentials && Object.keys(n.credentials).length > 0) flags.push('[creds]');
            if (n.alwaysOutputData) flags.push('[alwaysOutput]');
            if (n.executeOnce) flags.push('[executeOnce]');
            if (n.retryOnFail) flags.push('[retry]');
            for (const role of subNodeRoles.get(n.propertyName) ?? []) flags.push(`[${role}]`);
            lines.push(`// ${prop} ${t} ${flags.join(' ')}`);
        }

        lines.push('//');

        // ── ROUTING MAP ───────────────────────────────────────────────────────
        lines.push('// ROUTING MAP');
        lines.push('// ──────────────────────────────────────────────────────────────────');

        // Build adjacency: from-node → [{to, fromOutput}]
        const adj = new Map<string, Array<{ to: string; out: number; in: number }>>();
        for (const conn of ast.connections) {
            if (!adj.has(conn.from.node)) adj.set(conn.from.node, []);
            adj.get(conn.from.node)!.push({ to: conn.to.node, out: conn.from.output, in: conn.to.input });
        }

        // Find root nodes (no incoming main connections)
        const hasIncoming = new Set(ast.connections.map(c => c.to.node));
        const roots = ast.nodes
            .filter(n => !hasIncoming.has(n.propertyName))
            .filter(n => adj.has(n.propertyName)); // Only nodes that have outgoing connections

        // If no clear roots, just list all connections flat
        if (roots.length === 0) {
            for (const conn of ast.connections) {
                const outLabel = conn.from.output > 0 ? `.out(${conn.from.output})` : '';
                const inLabel = conn.to.input > 0 ? `.in(${conn.to.input})` : '';
                lines.push(`// ${conn.from.node}${outLabel} → ${conn.to.node}${inLabel}`);
            }
        } else {
            // DFS from each root, tracking visited to handle loops
            const visited = new Set<string>();
            const renderNode = (name: string, indent: string, parentIndent: string) => {
                const children = adj.get(name) ?? [];
                // Sort by output index so out(0) comes before out(1)
                const sorted = [...children].sort((a, b) => a.out - b.out);
                for (const child of sorted) {
                    const outLabel = child.out > 0 ? `.out(${child.out})` : '';
                    const inLabel = child.in > 0 ? `.in(${child.in})` : '';
                    const arrow = `${outLabel} → ${child.to}${inLabel}`;
                    if (visited.has(child.to)) {
                        lines.push(`// ${indent}${arrow} (↩ loop)`);
                    } else {
                        lines.push(`// ${indent}${arrow}`);
                        visited.add(child.to);
                        renderNode(child.to, indent + '  ', indent);
                    }
                }
            };

            for (const root of roots) {
                lines.push(`// ${root.propertyName}`);
                visited.add(root.propertyName);
                renderNode(root.propertyName, '  ', '');
            }
        }

        // AI connections — aiDependencies is stored on the CONSUMER node
        // e.g. ExtractKeyDetails.aiDependencies = { ai_languageModel: 'ExtractorModel' }
        // so no inversion needed: just emit consumerNode.uses({ role: subNode })
        const aiConsumers = ast.nodes.filter(n => n.aiDependencies && Object.keys(n.aiDependencies).length > 0);
        if (aiConsumers.length > 0) {
            lines.push('//');
            lines.push('// AI CONNECTIONS');
            for (const consumerNode of aiConsumers) {
                const deps: string[] = [];
                for (const [role, subNodeRef] of Object.entries(consumerNode.aiDependencies!)) {
                    if (Array.isArray(subNodeRef)) {
                        deps.push(`${role}: [${(subNodeRef as string[]).join(', ')}]`);
                    } else {
                        deps.push(`${role}: ${subNodeRef as string}`);
                    }
                }
                if (deps.length > 0) {
                    lines.push(`// ${consumerNode.propertyName}.uses({ ${deps.join(', ')} })`);
                }
            }
        }

        lines.push('// </workflow-map>');
        return lines.join('\n');
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
        
        parts.push(`id: ${JSON.stringify(metadata.id)}`);
        parts.push(`name: ${JSON.stringify(metadata.name)}`);
        parts.push(`active: ${metadata.active}`);

        if (metadata.tags && metadata.tags.length > 0) {
            parts.push(`tags: ${JSON.stringify(metadata.tags)}`);
        }
        
        if (metadata.settings && Object.keys(metadata.settings).length > 0) {
            const settings = JSON.stringify(metadata.settings, null, 1)
                .replace(/\n\s*/g, ' ') // Make it single line
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
        const params = this.formatValue(node.parameters, 1);
        
        lines.push(`${node.propertyName} = ${params};`);
        
        return lines.join('\n    ');
    }
    
    /**
     * Format @node decorator content
     */
    private formatNodeDecorator(node: any): string {
        const parts: string[] = [];
        
        if (node.id) {
            parts.push(`id: ${JSON.stringify(node.id)}`);
        }
        if (node.webhookId) {
            parts.push(`webhookId: ${JSON.stringify(node.webhookId)}`);
        }
        parts.push(`name: ${JSON.stringify(node.displayName)}`);
        parts.push(`type: ${JSON.stringify(node.type)}`);
        parts.push(`version: ${node.version}`);
        
        if (node.position) {
            parts.push(`position: [${node.position.join(', ')}]`);
        }
        
        if (node.credentials) {
            const creds = JSON.stringify(node.credentials).replace(/"([^"]+)":/g, '$1:');
            parts.push(`credentials: ${creds}`);
        }
        
        if (node.onError) {
            parts.push(`onError: ${JSON.stringify(node.onError)}`);
        }
        
        if (node.alwaysOutputData !== undefined) {
            parts.push(`alwaysOutputData: ${node.alwaysOutputData}`);
        }
        if (node.executeOnce !== undefined) {
            parts.push(`executeOnce: ${node.executeOnce}`);
        }
        if (node.retryOnFail !== undefined) {
            parts.push(`retryOnFail: ${node.retryOnFail}`);
        }
        if (node.maxTries !== undefined) {
            parts.push(`maxTries: ${node.maxTries}`);
        }
        if (node.waitBetweenTries !== undefined) {
            parts.push(`waitBetweenTries: ${node.waitBetweenTries}`);
        }
        
        return `{\n        ${parts.join(',\n        ')}\n    }`;
    }

    private formatValue(value: any, indentLevel = 0): string {
        if (typeof value === 'string') {
            return this.formatString(value);
        }

        if (Array.isArray(value)) {
            if (value.length === 0) return '[]';

            const indent = '    '.repeat(indentLevel);
            const childIndent = '    '.repeat(indentLevel + 1);

            return `[\n${value
                .map((item) => `${childIndent}${this.formatValue(item, indentLevel + 1)}`)
                .join(',\n')}\n${indent}]`;
        }

        if (value && typeof value === 'object') {
            const entries = Object.entries(value);

            if (entries.length === 0) return '{}';

            const indent = '    '.repeat(indentLevel);
            const childIndent = '    '.repeat(indentLevel + 1);

            return `{\n${entries
                .map(([key, item]) => `${childIndent}${this.formatPropertyKey(key)}: ${this.formatValue(item, indentLevel + 1)}`)
                .join(',\n')}\n${indent}}`;
        }

        if (value === undefined) {
            return 'undefined';
        }

        return JSON.stringify(value);
    }

    private formatPropertyKey(key: string): string {
        return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
    }

    private formatString(value: string): string {
        if (!value.includes('\n') && !value.includes('\r')) {
            return JSON.stringify(value);
        }

        // Preserve carriage returns by emitting them as \r escape sequences
        const escaped = value
            .replace(/\r/g, '\\r')
            .replace(/[`\\]|\$\{/g, (match) => {
                if (match === '\\') return '\\\\';
                return `\\${match}`;
            });

        return `\`${escaped}\``;
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
        
        // Generate regular connections (main/error)
        if (ast.connections.length > 0) {
            ast.connections.forEach(conn => {
                const fromMethod = conn.from.isError ? 'error()' : `out(${conn.from.output})`;
                const line = `        this.${conn.from.node}.${fromMethod}.to(this.${conn.to.node}.in(${conn.to.input}));`;
                lines.push(line);
            });
        }
        
        // Generate AI dependency injections (.uses() calls)
        const nodesWithAIDeps = ast.nodes.filter(node => node.aiDependencies && Object.keys(node.aiDependencies).length > 0);
        if (nodesWithAIDeps.length > 0) {
            if (ast.connections.length > 0) {
                lines.push(''); // Blank line separator
            }
            
            nodesWithAIDeps.forEach(node => {
                const deps = node.aiDependencies!;
                const depLines: string[] = [];
                
                // Single AI dependencies
                if (deps.ai_languageModel) {
                    depLines.push(`ai_languageModel: this.${deps.ai_languageModel}.output`);
                }
                if (deps.ai_memory) {
                    depLines.push(`ai_memory: this.${deps.ai_memory}.output`);
                }
                if (deps.ai_outputParser) {
                    depLines.push(`ai_outputParser: this.${deps.ai_outputParser}.output`);
                }
                if (deps.ai_agent) {
                    depLines.push(`ai_agent: this.${deps.ai_agent}.output`);
                }
                if (deps.ai_chain) {
                    depLines.push(`ai_chain: this.${deps.ai_chain}.output`);
                }
                if (deps.ai_textSplitter) {
                    depLines.push(`ai_textSplitter: this.${deps.ai_textSplitter}.output`);
                }
                if (deps.ai_embedding) {
                    depLines.push(`ai_embedding: this.${deps.ai_embedding}.output`);
                }
                if (deps.ai_retriever) {
                    depLines.push(`ai_retriever: this.${deps.ai_retriever}.output`);
                }
                if (deps.ai_reranker) {
                    depLines.push(`ai_reranker: this.${deps.ai_reranker}.output`);
                }
                if (deps.ai_vectorStore) {
                    depLines.push(`ai_vectorStore: this.${deps.ai_vectorStore}.output`);
                }
                
                // Array AI dependencies
                if (deps.ai_tool && deps.ai_tool.length > 0) {
                    const tools = deps.ai_tool.map(t => `this.${t}.output`).join(', ');
                    depLines.push(`ai_tool: [${tools}]`);
                }
                if (deps.ai_document && deps.ai_document.length > 0) {
                    const documents = deps.ai_document.map(d => `this.${d}.output`).join(', ');
                    depLines.push(`ai_document: [${documents}]`);
                }
                
                if (depLines.length > 0) {
                    lines.push(`        this.${node.propertyName}.uses({`);
                    depLines.forEach((depLine, idx) => {
                        const comma = idx < depLines.length - 1 ? ',' : '';
                        lines.push(`            ${depLine}${comma}`);
                    });
                    lines.push('        });');
                }
            });
        }
        
        // If no connections or AI deps
        if (ast.connections.length === 0 && nodesWithAIDeps.length === 0) {
            lines.push('        // No connections defined');
        }
        
        lines.push('    }');
        
        return lines.join('\n');
    }
}
