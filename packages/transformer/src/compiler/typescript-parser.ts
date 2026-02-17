/**
 * TypeScript Parser
 * 
 * Parses TypeScript workflow files using ts-morph
 * Extracts metadata from decorators and class structure
 */

import { Project, SourceFile, SyntaxKind, ClassDeclaration, PropertyDeclaration, MethodDeclaration } from 'ts-morph';
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
        
        // Parse object literal argument
        const metadataArg = args[0];
        const metadataText = metadataArg.getText();
        
        // Use eval in a safe context to parse the object literal
        // This is safe because we're only parsing our own generated code
        const metadata = this.parseObjectLiteral(metadataText);
        
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
            
            const metadataText = args[0].getText();
            const metadata = this.parseObjectLiteral(metadataText);
            
            // Extract property name
            const propertyName = prop.getName();
            
            // Extract parameters from property initializer
            const initializer = prop.getInitializer();
            const parameters = initializer ? this.parseObjectLiteral(initializer.getText()) : {};
            
            nodes.push({
                propertyName,
                displayName: metadata.name,
                type: metadata.type,
                version: metadata.version,
                position: metadata.position || [0, 0],
                credentials: metadata.credentials,
                onError: metadata.onError,
                parameters
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
            // Format: this.NodeA.uses({ ... }); // Skip uses() calls
            
            if (text.includes('.uses(')) {
                // Skip AI dependency injection (handled separately if needed)
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
     * Parse object literal string to object
     * 
     * Uses Function constructor for safe eval of object literals
     * This is safe because we only parse our own generated code
     */
    private parseObjectLiteral(text: string): any {
        try {
            // Wrap in parentheses and use Function constructor
            const func = new Function(`return (${text})`);
            return func();
        } catch (error) {
            console.error('Failed to parse object literal:', text);
            throw new Error(`Failed to parse object literal: ${error}`);
        }
    }
}
