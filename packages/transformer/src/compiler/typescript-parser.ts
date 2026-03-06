/**
 * TypeScript Parser
 * 
 * Parses TypeScript workflow files using ts-morph
 * Extracts metadata from decorators and class structure
 */

import { Project, SourceFile, SyntaxKind, ClassDeclaration, PropertyDeclaration, MethodDeclaration, Node } from 'ts-morph';
import { WorkflowAST, NodeAST, ConnectionAST, WorkflowMetadata } from '../types.js';

/**
 * Parse TypeScript workflow file
 */
export class TypeScriptParser {
    private project: Project;
    
    constructor() {
        this.project = new Project({
            compilerOptions: {
                target: 99, // ESNext
                module: 99, // ESNext
                experimentalDecorators: true,
                emitDecoratorMetadata: true
            }
        });
    }
    
    /**
     * Parse TypeScript file
     */
    async parseFile(filePath: string): Promise<WorkflowAST> {
        const sourceFile = this.project.addSourceFileAtPath(filePath);
        return this.parseSourceFile(sourceFile);
    }
    
    /**
     * Parse TypeScript code string
     */
    async parseCode(code: string): Promise<WorkflowAST> {
        const sourceFile = this.project.createSourceFile('temp.ts', code, { overwrite: true });
        return this.parseSourceFile(sourceFile);
    }
    
    /**
     * Parse source file to AST
     */
    private parseSourceFile(sourceFile: SourceFile): WorkflowAST {
        // Find class with @workflow decorator
        const workflowClass = this.findWorkflowClass(sourceFile);
        
        if (!workflowClass) {
            throw new Error('No class with @workflow decorator found in file');
        }
        
        // Extract workflow metadata
        const metadata = this.extractWorkflowMetadata(workflowClass);
        
        // Extract nodes
        const nodes = this.extractNodes(workflowClass);
        
        // Extract connections
        const connections = this.extractConnections(workflowClass);
        
        // Extract AI dependencies and add them to nodes
        this.extractAIDependencies(workflowClass, nodes);
        
        return {
            metadata,
            nodes,
            connections
        };
    }
    
    /**
     * Find class decorated with @workflow
     */
    private findWorkflowClass(sourceFile: SourceFile): ClassDeclaration | null {
        const classes = sourceFile.getClasses();
        
        for (const cls of classes) {
            const decorators = cls.getDecorators();
            for (const decorator of decorators) {
                const decoratorName = decorator.getName();
                if (decoratorName === 'workflow') {
                    return cls;
                }
            }
        }
        
        return null;
    }
    
    /**
     * Extract workflow metadata from @workflow decorator
     */
    private extractWorkflowMetadata(workflowClass: ClassDeclaration): WorkflowMetadata {
        const decorator = workflowClass.getDecorator('workflow');
        
        if (!decorator) {
            throw new Error('Class missing @workflow decorator');
        }
        
        // Get decorator arguments
        const args = decorator.getArguments();
        if (args.length === 0) {
            throw new Error('@workflow decorator missing metadata argument');
        }
        
        // Extract metadata directly from the AST node — no eval needed
        const metadata = this.extractValueFromASTNode(args[0]);
        
        return metadata as WorkflowMetadata;
    }
    
    /**
     * Extract nodes from class properties with @node decorator
     */
    private extractNodes(workflowClass: ClassDeclaration): NodeAST[] {
        const nodes: NodeAST[] = [];
        const properties = workflowClass.getProperties();
        
        for (const prop of properties) {
            const decorator = prop.getDecorator('node');
            
            if (!decorator) {
                continue; // Skip properties without @node decorator
            }
            
            // Extract node metadata from decorator
            const args = decorator.getArguments();
            if (args.length === 0) {
                continue;
            }
            
            const metadata = this.extractValueFromASTNode(args[0]);
            
            // Extract property name
            const propertyName = prop.getName();
            
            // Extract parameters from property initializer
            const initializer = prop.getInitializer();
            const parameters = initializer ? this.extractValueFromASTNode(initializer) : {};
            
            nodes.push({
                propertyName,
                ...(metadata.id && { id: metadata.id }),
                ...(metadata.webhookId && { webhookId: metadata.webhookId }),
                displayName: metadata.name,
                type: metadata.type,
                version: metadata.version,
                position: metadata.position || [0, 0],
                credentials: metadata.credentials,
                onError: metadata.onError,
                parameters
                // aiDependencies will be added by extractAIDependencies()
            });
        }
        
        return nodes;
    }
    
    /**
     * Extract connections from @links method
     */
    private extractConnections(workflowClass: ClassDeclaration): ConnectionAST[] {
        const connections: ConnectionAST[] = [];
        
        // Find method with @links decorator
        const methods = workflowClass.getMethods();
        let linksMethod: MethodDeclaration | null = null;
        
        for (const method of methods) {
            const decorator = method.getDecorator('links');
            if (decorator) {
                linksMethod = method;
                break;
            }
        }
        
        if (!linksMethod) {
            return connections; // No connections defined
        }
        
        // Parse method body to extract connections
        const body = linksMethod.getBody();
        if (!body || !body.isKind(SyntaxKind.Block)) {
            return connections;
        }
        
        // Get all statements in the method
        const statements = body.getStatements();
        
        for (const statement of statements) {
            const text = statement.getText();
            
            // Parse connection statements
            // Format: this.NodeA.out(0).to(this.NodeB.in(0));
            // Format: this.NodeA.error().to(this.NodeB.in(0));
            // Skip .uses() calls (handled by extractAIDependencies)
            
            if (text.includes('.uses(')) {
                continue;
            }
            
            const connection = this.parseConnectionStatement(text);
            if (connection) {
                connections.push(connection);
            }
        }
        
        return connections;
    }
    
    /**
     * Extract AI dependencies from .uses() calls in @links method
     * 
     * Example:
     *   this.AgentIa.uses({
     *     ai_languageModel: this.OpenaiChatModel.output,
     *     ai_memory: this.Mmoire.output,
     *     ai_tool: [this.Tool1.output, this.Tool2.output]
     *   });
     */
    private extractAIDependencies(workflowClass: ClassDeclaration, nodes: NodeAST[]): void {
        // Find method with @links decorator
        const methods = workflowClass.getMethods();
        let linksMethod: MethodDeclaration | null = null;
        
        for (const method of methods) {
            const decorator = method.getDecorator('links');
            if (decorator) {
                linksMethod = method;
                break;
            }
        }
        
        if (!linksMethod) {
            return; // No links method
        }
        
        // Parse method body
        const body = linksMethod.getBody();
        if (!body || !body.isKind(SyntaxKind.Block)) {
            return;
        }
        
        const statements = body.getStatements();
        
        for (const statement of statements) {
            const text = statement.getText();
            
            // Only process .uses() calls
            if (!text.includes('.uses(')) {
                continue;
            }
            
            // Parse: this.NodeName.uses({ ... });
            const usesMatch = text.match(/this\.(\w+)\.uses\s*\(\s*\{([^}]+)\}\s*\)/);
            if (!usesMatch) {
                continue;
            }
            
            const targetNodeProperty = usesMatch[1];
            const depsObjectText = usesMatch[2];
            
            // Find the corresponding node
            const node = nodes.find(n => n.propertyName === targetNodeProperty);
            if (!node) {
                console.warn(`Warning: .uses() called on unknown node: ${targetNodeProperty}`);
                continue;
            }
            
            // Parse dependencies object
            const aiDependencies = this.parseAIDependencies(depsObjectText);
            
            // Add to node
            if (Object.keys(aiDependencies).length > 0) {
                node.aiDependencies = aiDependencies;
            }
        }
    }
    
    /**
     * Parse AI dependencies object from .uses() call
     * 
     * Input: "ai_languageModel: this.Model.output, ai_memory: this.Memory.output"
     * Output: { ai_languageModel: "Model", ai_memory: "Memory" }
     */
    private parseAIDependencies(depsText: string): Record<string, string | string[]> {
        const result: Record<string, string | string[]> = {};
        
        // Split by comma (but not inside brackets)
        const entries = this.splitByTopLevelCommas(depsText);
        
        for (const entry of entries) {
            const trimmed = entry.trim();
            if (!trimmed) continue;
            
            // Parse: key: value
            const colonIndex = trimmed.indexOf(':');
            if (colonIndex === -1) continue;
            
            const key = trimmed.substring(0, colonIndex).trim();
            const value = trimmed.substring(colonIndex + 1).trim();
            
            // Check if it's an array type (ai_tool or ai_document)
            if ((key === 'ai_tool' || key === 'ai_document') && value.startsWith('[')) {
                // Parse array: [this.Tool1.output, this.Tool2.output]
                const itemNames = this.parseToolArray(value);
                if (itemNames.length > 0) {
                    result[key] = itemNames;
                }
            } else {
                // Parse single reference: this.NodeName.output
                const nodeMatch = value.match(/this\.(\w+)\.output/);
                if (nodeMatch) {
                    result[key] = nodeMatch[1];
                }
            }
        }
        
        return result;
    }
    
    /**
     * Split string by commas, but not inside brackets
     */
    private splitByTopLevelCommas(text: string): string[] {
        const result: string[] = [];
        let current = '';
        let bracketDepth = 0;
        
        for (const char of text) {
            if (char === '[') {
                bracketDepth++;
            } else if (char === ']') {
                bracketDepth--;
            } else if (char === ',' && bracketDepth === 0) {
                result.push(current);
                current = '';
                continue;
            }
            current += char;
        }
        
        if (current.trim()) {
            result.push(current);
        }
        
        return result;
    }
    
    /**
     * Parse tool array
     * 
     * Input: "[this.Tool1.output, this.Tool2.output]"
     * Output: ["Tool1", "Tool2"]
     */
    private parseToolArray(arrayText: string): string[] {
        const result: string[] = [];
        
        // Remove brackets
        const content = arrayText.replace(/^\[|\]$/g, '').trim();
        
        // Split by comma
        const items = content.split(',');
        
        for (const item of items) {
            const nodeMatch = item.trim().match(/this\.(\w+)\.output/);
            if (nodeMatch) {
                result.push(nodeMatch[1]);
            }
        }
        
        return result;
    }
    
    /**
     * Parse a connection statement
     * 
     * Examples:
     *   this.ScheduleTrigger.out(0).to(this.HttpRequest.in(0));
     *   this.GithubCheck.error().to(this.CreateBranch.in(0));
     */
    private parseConnectionStatement(statement: string): ConnectionAST | null {
        // Remove whitespace and semicolon
        const cleaned = statement.trim().replace(/;$/, '');
        
        // Pattern: this.{fromNode}.{output}.to(this.{toNode}.in({input}))
        const errorPattern = /this\.(\w+)\.error\(\)\.to\(this\.(\w+)\.in\((\d+)\)\)/;
        const normalPattern = /this\.(\w+)\.out\((\d+)\)\.to\(this\.(\w+)\.in\((\d+)\)\)/;
        
        // Try error pattern first
        let match = cleaned.match(errorPattern);
        if (match) {
            return {
                from: {
                    node: match[1],
                    output: 0,
                    isError: true
                },
                to: {
                    node: match[2],
                    input: parseInt(match[3])
                }
            };
        }
        
        // Try normal pattern
        match = cleaned.match(normalPattern);
        if (match) {
            return {
                from: {
                    node: match[1],
                    output: parseInt(match[2]),
                    isError: false
                },
                to: {
                    node: match[3],
                    input: parseInt(match[4])
                }
            };
        }
        
        return null;
    }
    
    /**
     * Extract a JavaScript value by walking a ts-morph AST node.
     *
     * Supported: string/number/boolean literals, null, undefined, plain object
     * literals, array literals, no-substitution template literals, and
     * negative number literals.
     *
     * For any other expression (function calls, identifiers, template
     * expressions with substitutions, etc.) a clear error is thrown.
     * The parser is intentionally static — the workflow file is TypeScript
     * as a notation, not a runtime.
     */
    private extractValueFromASTNode(node: Node): any {
        switch (node.getKind()) {

            // ── Primitive literals ───────────────────────────────────────
            case SyntaxKind.StringLiteral:
            case SyntaxKind.NoSubstitutionTemplateLiteral:
                return (node as any).getLiteralValue() as string;

            case SyntaxKind.NumericLiteral:
                return Number((node as any).getLiteralValue());

            case SyntaxKind.TrueKeyword:
                return true;

            case SyntaxKind.FalseKeyword:
                return false;

            case SyntaxKind.NullKeyword:
                return null;

            case SyntaxKind.UndefinedKeyword:
                return undefined;

            // ── Negative numbers  (-42, -3.14) ───────────────────────────
            case SyntaxKind.PrefixUnaryExpression: {
                const prefix = node as any;
                if (prefix.getOperatorToken() === SyntaxKind.MinusToken) {
                    const operand = this.extractValueFromASTNode(prefix.getOperand());
                    if (typeof operand === 'number') return -operand;
                }
                throw new Error(
                    `[n8n-as-code] Cannot statically evaluate prefix expression ` +
                    `"${node.getText()}" in a node parameter. ` +
                    `Only literal values are supported.`
                );
            }

            // ── Plain object literals ─────────────────────────────────────
            case SyntaxKind.ObjectLiteralExpression: {
                const result: Record<string, any> = {};
                const objLit = node as any;
                for (const prop of objLit.getProperties()) {
                    if (prop.getKind() === SyntaxKind.PropertyAssignment) {
                        const key: string = prop.getName();
                        const valueNode: Node | undefined = prop.getInitializer();
                        result[key] = valueNode !== undefined
                            ? this.extractValueFromASTNode(valueNode)
                            : undefined;
                    } else {
                        const kindName = prop.getKindName?.() ?? prop.getKind();
                        const rawText = prop.getText();
                        const preview = rawText.length > 80 ? rawText.substring(0, 80) + '...' : rawText;
                        throw new Error(
                            `[n8n-as-code] Unsupported object property "${kindName}" ` +
                            `("${preview}") in a node parameter. ` +
                            `Only inline key: value pairs are supported.`
                        );
                    }
                }
                return result;
            }

            // ── Array literals ────────────────────────────────────────────
            case SyntaxKind.ArrayLiteralExpression: {
                const arrLit = node as any;
                return (arrLit.getElements() as Node[]).map(
                    (elem) => this.extractValueFromASTNode(elem)
                );
            }

            // ── Identifier ───────────────────────────────────────────────
            case SyntaxKind.Identifier: {
                if (node.getText() === 'undefined') return undefined;
                const name = node.getText();
                throw new Error(
                    `[n8n-as-code] Cannot use identifier "${name}" as a node parameter value.\n` +
                    `Only inline literal values are supported (strings, numbers, booleans, null, arrays, objects).`
                );
            }

            // ── Dynamic / unsupported expressions ────────────────────────
            case SyntaxKind.CallExpression: {
                const preview = node.getText().substring(0, 80);
                throw new Error(
                    `[n8n-as-code] Dynamic expression not supported in node parameters:\n` +
                    `  ${preview}\n\n` +
                    `The workflow file is parsed statically — only inline literal values\n` +
                    `(strings, numbers, booleans, null, arrays, plain objects) are supported.`
                );
            }

            default: {
                const kindName = node.getKindName();
                const preview = node.getText().substring(0, 80);
                throw new Error(
                    `[n8n-as-code] Cannot statically evaluate ` +
                    `${kindName} expression "${preview}" in a node parameter.\n` +
                    `Only literal values are supported.`
                );
            }
        }
    }

}
