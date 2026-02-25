import { IWorkflow } from '../types.js';

export class WorkflowSanitizer {
    /**
     * Prepares a workflow JSON for storage on disk (GIT).
     * Removes dynamic IDs, execution URLs, and standardizes key order.
     */
    static cleanForStorage(workflow: IWorkflow): Partial<IWorkflow> {
        const settings = { ...(workflow.settings || {}) };

        // Remove instance-specific settings that should not be version-controlled
        // IMPORTANT: executionOrder is PRESERVED because it affects workflow behavior
        const keysToRemove = [
            'executionUrl',
            'availableInMCP',
            'callerPolicy',
            'saveDataErrorExecution',
            'saveManualExecutions',
            'saveExecutionProgress',
            // 'executionOrder', // ✅ KEPT - this affects execution behavior and must be preserved
            'trialStartedAt'
        ];

        keysToRemove.forEach(k => delete settings[k]);

        // Clean nodes
        const nodes = (workflow.nodes || []).map(node => {
            const newNode = { ...node };
            // Remove node-level metadata that might vary
            delete newNode.id; // n8n 2.x often adds node IDs
            
            // Standardize parameters
            if (newNode.parameters && Object.keys(newNode.parameters).length === 0) {
                newNode.parameters = {};
            }
            
            return newNode;
        });

        // Build cleaned object with ONLY the fields we want to keep
        // Explicitly exclude version-related fields that n8n auto-generates:
        // - versionId: UUID that changes on every update
        // - activeVersionId: Version tracking field
        // - versionCounter: Increments on every update
        // - pinData: Execution pin data (not part of workflow definition)
        // These fields cause false conflicts if included in hashing
        //
        // IMPORTANT: We build the object with a deterministic key order
        // (id, name, nodes, connections, settings, tags, active)
        // No need to call sortKeys() which would recursively sort ALL keys
        // including inside nodes, which can cause massive diffs
        const cleaned = {
            id: workflow.id,
            name: workflow.name,
            nodes: nodes,
            connections: workflow.connections || {},
            settings: settings,
            tags: workflow.tags || [],
            active: !!workflow.active,
            
            // Organization metadata (kept for local display, removed before API push)
            ...(workflow.projectId && { projectId: workflow.projectId }),
            ...(workflow.projectName && { projectName: workflow.projectName }),
            ...(workflow.homeProject && {
                homeProject: {
                    id: workflow.homeProject.id,
                    name: workflow.homeProject.name,
                    type: workflow.homeProject.type
                }
            }),
            ...(workflow.isArchived !== undefined && { isArchived: workflow.isArchived })
        };

        return cleaned;
    }

    /**
     * Prepares a workflow for hashing / change detection.
     *
     * We intentionally exclude organization metadata (project, archived, etc.)
     * so that changes in those fields do not trigger sync conflicts.
     */
    static cleanForHash(workflow: IWorkflow): Partial<IWorkflow> {
        const clean = { ...(this.cleanForStorage(workflow) as any) };
        delete clean.projectId;
        delete clean.projectName;
        delete clean.homeProject;
        delete clean.isArchived;
        return clean;
    }

    /**
     * Prepares a local workflow JSON for pushing to n8n API.
     * Removes read-only fields or fields that shouldn't be overwritten blindly (like tags if needed).
     *
     * n8n API v1 PUT /workflows/{id} expects a very specific schema.
     * Based on n8n 2.2.6 API documentation, the allowed fields are:
     * - name (string, required)
     * - nodes (array, required)
     * - connections (object, required)
     * - settings (object, optional but with strict schema)
     * - staticData (object, optional)
     * - triggerCount (number, optional)
     * 
     * IMPORTANT: Organization metadata (projectId, projectName, homeProject, isArchived)
     * is explicitly EXCLUDED here as it's read-only API information stored locally
     * for display purposes only.
     * 
     * CRITICAL: We must preserve executionOrder from the original workflow if present,
     * or default to "v1" if not specified. Without this, workflows may execute in the
     * wrong order, causing agents to produce output before calling their tools.
     */
    static cleanForPush(workflow: Partial<IWorkflow>): Partial<IWorkflow> {
        // IMPORTANT: Preserve executionOrder from original workflow BEFORE calling cleanForStorage
        // because cleanForStorage strips it out
        const originalExecutionOrder = workflow.settings?.executionOrder;
        
        // Start with cleanForStorage to get basic structure (but it removes executionOrder!)
        const clean = this.cleanForStorage(workflow as IWorkflow);

        // Remove all fields that are not in the n8n API v1 PUT schema
        // Keep only: name, nodes, connections, settings, staticData, triggerCount
        // Explicitly exclude: projectId, projectName, homeProject, isArchived (read-only metadata)
        const allowedFields = ['name', 'nodes', 'connections', 'settings', 'staticData', 'triggerCount'];
        const result: any = {};
        
        for (const key of allowedFields) {
            if (clean[key as keyof typeof clean] !== undefined) {
                result[key] = clean[key as keyof typeof clean];
            }
        }

        // Ensure settings is properly filtered and executionOrder is always set
        // This runs for all workflows to guarantee executionOrder is present
        const allowedSettings = [
            'errorWorkflow',
            'timezone',
            'saveManualExecutions',
            'saveDataErrorExecution',
            'saveExecutionProgress',
            'executionOrder'
        ];
        const filteredSettings: any = {};
        
        // If we have settings from clean, filter them
        if (result.settings) {
            for (const settingKey of allowedSettings) {
                if (result.settings[settingKey] !== undefined) {
                    filteredSettings[settingKey] = result.settings[settingKey];
                }
            }
        }
        
        // CRITICAL: Always ensure executionOrder is set
        // 
        // Background: When n8n API receives a workflow without executionOrder,
        // it defaults to "v0" (legacy mode) which can cause execution order issues,
        // especially with AI agents that need tools to execute before the final response.
        //
        // Strategy:
        // - If workflow has EXPLICIT executionOrder (any value) → preserve it (respect user choice)
        // - If workflow has NO executionOrder → default to "v1" (recommended by n8n)
        //
        // This ensures workflows created via n8n-as-code use proper execution order by default,
        // while respecting explicit user choices (including v0 if they specifically want it).
        const currentExecutionOrder = originalExecutionOrder || filteredSettings.executionOrder;
        
        if (!currentExecutionOrder) {
            // No executionOrder specified → default to v1 (recommended)
            filteredSettings.executionOrder = 'v1';
        } else {
            // Explicit executionOrder (v0, v1, v2, etc.) → preserve user choice
            filteredSettings.executionOrder = currentExecutionOrder;
        }
        
        result.settings = filteredSettings;

        return result;
    }
}
