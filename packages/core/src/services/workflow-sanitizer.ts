import { IWorkflow } from '../types.js';

export class WorkflowSanitizer {
    /**
     * Recursively sorts object keys to ensure deterministic JSON output.
     */
    private static sortKeys(obj: any): any {
        if (Array.isArray(obj)) {
            return obj.map(this.sortKeys.bind(this));
        } else if (obj !== null && typeof obj === 'object') {
            return Object.keys(obj)
                .sort()
                .reduce((acc: any, key) => {
                    acc[key] = this.sortKeys(obj[key]);
                    return acc;
                }, {});
        }
        return obj;
    }

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
            'executionOrder'
        ];

        keysToRemove.forEach(k => delete settings[k]);

        const cleaned = {
            id: workflow.id,
            name: workflow.name,
            nodes: workflow.nodes || [],
            connections: workflow.connections || {},
            settings: settings,
            tags: workflow.tags || [],
            active: workflow.active
        };

        // Ensure deterministic key order for hashing consistency
        return this.sortKeys(cleaned);
    }

    /**
     * Prepares a local workflow JSON for pushing to n8n API.
     * Removes read-only fields or fields that shouldn't be overwritten blindly (like tags if needed).
     */
    static cleanForPush(workflow: Partial<IWorkflow>): Partial<IWorkflow> {
        const clean = this.cleanForStorage(workflow as IWorkflow);

        // n8n public API v1 (PUT /workflows/{id})
        // 1. 'active' is read-only and will cause a 400 error if included
        delete clean.active;

        // 2. Tags are often problematic and not always supported in the same way via Public API
        delete clean.tags;

        // 3. Settings must be strictly filtered (Whitelist)
        // Public API schema for settings is very restrictive
        if (clean.settings) {
            const allowedSettings = [
                'errorWorkflow',
                'timezone',
                'saveManualExecutions',
                'saveDataErrorExecution',
                'saveExecutionProgress',
                'executionOrder'
            ];
            const filteredSettings: any = {};
            for (const key of allowedSettings) {
                if (clean.settings[key] !== undefined) {
                    filteredSettings[key] = clean.settings[key];
                }
            }
            clean.settings = filteredSettings;
        }

        return clean;
    }
}
