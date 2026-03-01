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
        const metadata = this.extractValueFromASTNode(args[0], workflowClass.getSourceFile());
        
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
            
            const sourceFile = prop.getSourceFile();
            const metadata = this.extractValueFromASTNode(args[0], sourceFile);
            
            // Extract property name
            const propertyName = prop.getName();
            
            // Extract parameters from property initializer
            const initializer = prop.getInitializer();
            const parameters = initializer ? this.extractValueFromASTNode(initializer, sourceFile) : {};
            
            nodes.push({
                propertyName,
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
     * literals, array literals, no-substitution template literals, negative
     * number literals, and top-level `const` identifiers whose initializers
     * are themselves statically resolvable.
     *
     * For truly dynamic expressions (function calls, imports, template
     * expressions with substitutions, etc.) a helpful error is thrown
     * explaining what IS supported and how to work around the limitation.
     *
     * @param node - The AST node to evaluate.
     * @param sourceFile - The containing SourceFile, used to resolve
     *   top-level `const` identifier references.
     */
    private extractValueFromASTNode(node: Node, sourceFile?: SourceFile): any {
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
                    const operand = this.extractValueFromASTNode(prefix.getOperand(), sourceFile);
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
                            ? this.extractValueFromASTNode(valueNode, sourceFile)
                            : undefined;
                    } else if (prop.getKind() === SyntaxKind.ShorthandPropertyAssignment) {
                        // { name }  →  try to resolve `name` as a top-level const
                        const key: string = prop.getName();
                        result[key] = this.resolveIdentifier(key, sourceFile);
                    } else {
                        const kindName = prop.getKindName?.() ?? prop.getKind();
                        const rawText = prop.getText();
                        const preview = rawText.length > 80 ? rawText.substring(0, 80) + '...' : rawText;
                        throw new Error(
                            `[n8n-as-code] Unsupported object property kind "${kindName}" ` +
                            `("${preview}") in a node parameter. ` +
                            `Only PropertyAssignment and ShorthandPropertyAssignment are supported.`
                        );
                    }
                }
                return result;
            }

            // ── Array literals ────────────────────────────────────────────
            case SyntaxKind.ArrayLiteralExpression: {
                const arrLit = node as any;
                return (arrLit.getElements() as Node[]).map(
                    (elem) => this.extractValueFromASTNode(elem, sourceFile)
                );
            }

            // ── Identifier reference (e.g. a top-level const) ─────────────
            case SyntaxKind.Identifier: {
                const name = node.getText();
                if (name === 'undefined') return undefined;
                return this.resolveIdentifier(name, sourceFile);
            }

            // ── Dynamic / unsupported expressions ────────────────────────
            case SyntaxKind.CallExpression: {
                const preview = node.getText().substring(0, 80);
                throw new Error(
                    `[n8n-as-code] Dynamic expression not supported in node parameters:\n` +
                    `  ${preview}\n\n` +
                    `Only static literal values (strings, numbers, booleans, null, plain objects,\n` +
                    `arrays) and references to top-level \`const\` literals are supported.\n\n` +
                    `Workaround – move the computation to a top-level const BEFORE the class:\n` +
                    `  import { readFileSync } from 'fs';\n` +
                    `  const jsCode = readFileSync('code/example.js', 'utf-8');  // still a call — not yet supported\n` +
                    `  // For now use a string literal directly, or open an issue to request\n` +
                    `  // dynamic evaluation support.`
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

    /**
     * Try to resolve an identifier name to its value by looking at top-level
     * `const` variable declarations in the given source file.
     *
     * Only plain `const` declarations with a statically-resolvable initializer
     * are supported. `let` / `var` and destructuring are not resolved.
     */
    private resolveIdentifier(name: string, sourceFile?: SourceFile): any {
        if (!sourceFile) {
            throw new Error(
                `[n8n-as-code] Cannot resolve identifier "${name}": no source file context available.`
            );
        }

        const varDecl = sourceFile.getVariableDeclaration(name);
        if (varDecl) {
            const stmt = varDecl.getVariableStatement();
            const isConst = stmt?.getDeclarationKind() === 'const' ||
                (stmt as any)?.getDeclarationKind?.() === 0; // VariableDeclarationKind.Const
            if (!isConst) {
                throw new Error(
                    `[n8n-as-code] Identifier "${name}" is declared with \`let\` or \`var\`. ` +
                    `Only \`const\` top-level declarations can be referenced in node parameters.`
                );
            }
            const init = varDecl.getInitializer();
            if (init) {
                return this.extractValueFromASTNode(init, sourceFile);
            }
        }

        throw new Error(
            `[n8n-as-code] Cannot resolve identifier "${name}" in node parameters.\n` +
            `Only static literal values and references to top-level \`const\` literals are supported.\n` +
            `If "${name}" is a function, calling it dynamically is not yet supported.\n` +
            `Workaround: use a string or object literal directly in the node parameter.`
        );
    }
}
