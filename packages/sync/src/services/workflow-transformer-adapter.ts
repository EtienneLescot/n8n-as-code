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
        // Auto-detect format: if it starts with '{', it's JSON (for tests/compatibility)
        const trimmed = tsContent.trim();
        let workflow;
        
        if (trimmed.startsWith('{')) {
            // JSON format (for tests/legacy)
            workflow = JSON.parse(tsContent);
        } else {
            // TypeScript format - compile to JSON
            workflow = await this.compileToJson(tsContent);
        }
        
        // Normalize for hashing
        const normalized = this.normalizeForHash(workflow);
        
        // Compute hash
        return HashUtils.computeHash(normalized);
    }
    
    /**
     * Compute hash from a JSON workflow (for remote workflows not yet saved as TypeScript)
     * 
     * Strategy: convert to TypeScript and back to JSON first, so that the same
     * normalisation path is used as in hashWorkflow(tsContent).  This guarantees
     * that hashWorkflowFromJson(w) === hashWorkflow(convertToTypeScript(w)) for any
     * workflow, regardless of volatile fields (webhookId, node id, active, tags …).
     */
    static async hashWorkflowFromJson(workflow: IWorkflow): Promise<string> {
        // Round-trip through TypeScript to apply the exact same normalisation as
        // hashWorkflow(tsContent) does.  Restore the id so convertToTypeScript can
        // emit the @WorkflowId decorator.
        const tsCode = await this.convertToTypeScript(workflow, { format: false, commentStyle: 'minimal' });
        return this.hashWorkflow(tsCode);
    }
    
    /**
     * Normalize workflow for hashing
     * 
     * Removes fields that should not affect hash:
     * - Organization metadata (projectId, projectName, homeProject, isArchived)
     * - Node IDs (generated during compilation)
     * - Version fields (versionId, activeVersionId, versionCounter)
     * - Execution data (pinData)
     * - Non-round-trippable settings fields (callerPolicy, availableInMCP, etc.)
     *
     * Settings are filtered to the same allowed set as cleanForPush so that
     * hashFromJson and hashWorkflow(convertToTypeScript(sameJson)) always match.
     */
    private static normalizeForHash(workflow: IWorkflow): any {
        // Filter settings to only the fields that survive a TS round-trip
        // (must mirror the allowedSettings list in cleanForPush)
        const allowedSettings = [
            'errorWorkflow',
            'timezone',
            'saveManualExecutions',
            'saveDataErrorExecution',
            'saveExecutionProgress',
            'executionOrder'
        ];
        const filteredSettings: any = {};
        const rawSettings: any = (workflow as any).settings || {};
        for (const key of allowedSettings) {
            if (rawSettings[key] !== undefined) {
                filteredSettings[key] = rawSettings[key];
            }
        }
        // Always include executionOrder (default v1) — mirrors cleanForPush behaviour
        if (!filteredSettings.executionOrder) {
            filteredSettings.executionOrder = 'v1';
        }

        // NOTE: 'active' and 'tags' are intentionally excluded — they are
        // stripped by cleanForPush and managed separately by n8n (activation
        // endpoint, tags endpoint). Including them would cause a mismatch
        // between hashFromJson (has the real values) and hashWorkflow (sees
        // undefined after cleanForPush strips them).
        //
        // NOTE: 'id' is intentionally excluded — cleanForPush strips it, so
        // hashWorkflow (TS → compileToJson → cleanForPush) would see id=undefined
        // while hashWorkflowFromJson would see the real id, causing mismatch.
        const clean: any = {
            name: workflow.name,
            nodes: workflow.nodes || [],
            connections: workflow.connections || {},
            settings: filteredSettings
        };

        // Remove node IDs and webhookIds (generated/auto-assigned during compilation)
        if (clean.nodes) {
            clean.nodes = clean.nodes.map((node: any) => {
                const { id, webhookId, ...rest } = node;
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
        
        // Remove id (read-only, should be in URL path for UPDATE)
        delete clean.id;
        
        // Remove active (read-only, must use separate activation endpoint)
        delete clean.active;
        
        // Remove tags (read-only, must use separate tags endpoint)
        delete clean.tags;
        
        // Remove version fields (auto-generated by n8n)
        delete clean.versionId;
        delete clean.activeVersionId;
        delete clean.versionCounter;
        delete clean.pinData;
        
        // Filter settings to only include allowed properties
        const allowedSettings = [
            'errorWorkflow',
            'timezone',
            'saveManualExecutions',
            'saveDataErrorExecution',
            'saveExecutionProgress',
            'executionOrder'
        ];
        const filteredSettings: any = {};
        
        if (clean.settings) {
            for (const settingKey of allowedSettings) {
                if (clean.settings[settingKey] !== undefined) {
                    filteredSettings[settingKey] = clean.settings[settingKey];
                }
            }
        }
        
        // Ensure executionOrder is always set
        if (!filteredSettings.executionOrder) {
            filteredSettings.executionOrder = 'v1';
        }
        
        clean.settings = filteredSettings;
        
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
