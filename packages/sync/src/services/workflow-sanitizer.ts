import { IWorkflow } from '../types.js';

export class WorkflowSanitizer {
    /**
     * Prepares a workflow JSON for storage on disk (GIT).
     * Removes dynamic IDs, execution URLs, and standardizes key order.
     */
    static cleanForStorage(workflow: IWorkflow): Partial<IWorkflow> {
        const settings = { ...(workflow.settings || {}) };

        // Remove instance-specific settings
        const keysToRemove = [
            'executionUrl',
            'availableInMCP',
            'callerPolicy',
            'saveDataErrorExecution',
            'saveManualExecutions',
            'saveExecutionProgress',
            'executionOrder',
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
            active: !!workflow.active
        };

        return cleaned;
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
     */
    static cleanForPush(workflow: Partial<IWorkflow>): Partial<IWorkflow> {
        // Start with cleanForStorage to get basic structure
        const clean = this.cleanForStorage(workflow as IWorkflow);

        // Remove all fields that are not in the n8n API v1 PUT schema
        // Keep only: name, nodes, connections, settings, staticData, triggerCount
        const allowedFields = ['name', 'nodes', 'connections', 'settings', 'staticData', 'triggerCount'];
        const result: any = {};
        
        for (const key of allowedFields) {
            if (clean[key as keyof typeof clean] !== undefined) {
                result[key] = clean[key as keyof typeof clean];
            }
        }

        // Ensure settings is properly filtered
        if (result.settings) {
            const allowedSettings = [
                'errorWorkflow',
                'timezone',
                'saveManualExecutions',
                'saveDataErrorExecution',
                'saveExecutionProgress',
                'executionOrder'
            ];
            const filteredSettings: any = {};
            for (const settingKey of allowedSettings) {
                if (result.settings[settingKey] !== undefined) {
                    filteredSettings[settingKey] = result.settings[settingKey];
                }
            }
            result.settings = filteredSettings;
        }

        return result;
    }
}
