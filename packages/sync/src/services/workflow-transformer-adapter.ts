/**
 * WorkflowTransformerAdapter
 * 
 * Replaces WorkflowSanitizer with bidirectional TypeScript transformation
 * 
 * Flow:
 * - Pull: n8n JSON → TypeScript file (.workflow.ts)
 * - Push: TypeScript file → n8n JSON
 * - Hash: TypeScript → JSON → normalized → hash
 */

import { IWorkflow } from '../types.js';
import {
    JsonToAstParser,
    AstToTypeScriptGenerator,
    TypeScriptParser,
    WorkflowBuilder,
    WorkflowAST
} from '@n8n-as-code/transformer';
import { HashUtils } from './hash-utils.js';

export class WorkflowTransformerAdapter {
    /**
     * Convert workflow JSON (from n8n API) to TypeScript code
     * 
     * @param workflow - Workflow from n8n API
     * @param options - Transformation options
     * @returns TypeScript code ready to write to .workflow.ts file
     */
    static async convertToTypeScript(
        workflow: IWorkflow,
        options: {
            format?: boolean;
            commentStyle?: 'minimal' | 'verbose';
        } = {}
    ): Promise<string> {
        const { format = true, commentStyle = 'verbose' } = options;
        
        // Parse JSON to AST
        const parser = new JsonToAstParser();
        const ast = parser.parse(workflow as any);
        
        // Generate TypeScript code
        const generator = new AstToTypeScriptGenerator();
        const tsCode = await generator.generate(ast, {
            format,
            commentStyle
        });
        
        return tsCode;
    }
    
    /**
     * Compile TypeScript workflow file to JSON (for pushing to n8n API)
     * 
     * @param tsContent - TypeScript code from .workflow.ts file
     * @returns Workflow JSON ready for n8n API
     */
    static async compileToJson(tsContent: string): Promise<IWorkflow> {
        // Parse TypeScript to AST
        const parser = new TypeScriptParser();
        const ast = await parser.parseCode(tsContent);
        
        // Build JSON workflow
        const builder = new WorkflowBuilder();
        const workflow = builder.build(ast);
        
        // Clean for API push (remove read-only fields) and convert tags
        return this.cleanForPush(this.convertToIWorkflow(workflow));
    }
    
    /**
     * Compile TypeScript workflow file to JSON (from file path)
     */
    static async compileFileToJson(filePath: string): Promise<IWorkflow> {
        const parser = new TypeScriptParser();
        const ast = await parser.parseFile(filePath);
        
        const builder = new WorkflowBuilder();
        const workflow = builder.build(ast);
        
        return this.cleanForPush(this.convertToIWorkflow(workflow));
    }
    
    /**
     * Compute hash of a TypeScript workflow file
     * 
     * Strategy:
     * 1. Compile TypeScript to JSON
     * 2. Normalize JSON (remove volatile fields)
     * 3. Hash the normalized JSON
     * 
     * This ensures consistent hashing across transformations
     */
    static async hashWorkflow(tsContent: string): Promise<string> {
        // Compile to JSON
        const workflow = await this.compileToJson(tsContent);
        
        // Normalize for hashing
        const normalized = this.normalizeForHash(workflow);
        
        // Compute hash
        return HashUtils.computeHash(normalized);
    }
    
    /**
     * Compute hash from a JSON workflow (for remote workflows not yet saved as TypeScript)
     */
    static async hashWorkflowFromJson(workflow: IWorkflow): Promise<string> {
        // Normalize for hashing
        const normalized = this.normalizeForHash(workflow);
        
        // Compute hash
        return HashUtils.computeHash(normalized);
    }
    
    /**
     * Normalize workflow for hashing
     * 
     * Removes fields that should not affect hash:
     * - Organization metadata (projectId, projectName, homeProject, isArchived)
     * - Node IDs (generated during compilation)
     * - Version fields (versionId, activeVersionId, versionCounter)
     * - Execution data (pinData)
     */
    private static normalizeForHash(workflow: IWorkflow): any {
        const clean: any = {
            id: workflow.id,
            name: workflow.name,
            nodes: workflow.nodes || [],
            connections: workflow.connections || {},
            settings: workflow.settings || {},
            tags: workflow.tags || [],
            active: !!workflow.active
        };
        
        // Remove node IDs (generated during compilation)
        if (clean.nodes) {
            clean.nodes = clean.nodes.map((node: any) => {
                const { id, ...rest } = node;
                return rest;
            });
        }
        
        return clean;
    }
    
    /**
     * Clean workflow for pushing to n8n API
     * 
     * Removes read-only and organization metadata fields
     */
    private static cleanForPush(workflow: IWorkflow): IWorkflow {
        // Remove organization metadata (read-only from API)
        const { projectId, projectName, homeProject, isArchived, ...clean } = workflow as any;
        
        // Remove version fields (auto-generated by n8n)
        delete clean.versionId;
        delete clean.activeVersionId;
        delete clean.versionCounter;
        delete clean.pinData;
        
        // Ensure settings has executionOrder
        if (!clean.settings) {
            clean.settings = {};
        }
        if (!clean.settings.executionOrder) {
            clean.settings.executionOrder = 'v1';
        }
        
        return clean as IWorkflow;
    }
    
    /**
     * Convert N8nWorkflow to IWorkflow (convert tags from string[] to ITag[])
     */
    private static convertToIWorkflow(workflow: any): IWorkflow {
        const converted = { ...workflow } as any;
        
        // Convert tags from string[] to ITag[]
        if (workflow.tags && Array.isArray(workflow.tags)) {
            converted.tags = workflow.tags.map((tag: string | { id: string; name: string }) => {
                if (typeof tag === 'string') {
                    // Convert string to ITag format
                    return { id: tag, name: tag };
                }
                return tag;
            });
        }
        
        return converted as IWorkflow;
    }
    
    /**
     * Backwards compatibility: cleanForStorage equivalent
     * 
     * This is used by legacy code that expects JSON normalization
     * In the new TypeScript workflow, we convert to TS instead
     */
    static async convertToStorage(workflow: IWorkflow): Promise<string> {
        return this.convertToTypeScript(workflow, {
            format: true,
            commentStyle: 'verbose'
        });
    }
}
