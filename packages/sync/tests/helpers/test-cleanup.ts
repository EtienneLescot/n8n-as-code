import { N8nApiClient } from '../../src/services/n8n-api-client.js';

/**
 * Test cleanup utilities to prevent test workflows from polluting the n8n instance
 */

/**
 * Deletes all workflows matching the given prefix or name patterns
 * 
 * @param client - N8nApiClient instance
 * @param patterns - Array of workflow name patterns (exact match or prefix)
 * @param projectId - Optional project ID to scope the cleanup
 * @example
 * ```typescript
 * await cleanupTestWorkflows(client, ['Test Workflow', 'E2E Test']);
 * ```
 */
export async function cleanupTestWorkflows(
    client: N8nApiClient,
    patterns: string[],
    projectId?: string
): Promise<number> {
    try {
        const allWorkflows = await client.getAllWorkflows(projectId);
        let deleted = 0;

        for (const workflow of allWorkflows) {
            const shouldDelete = patterns.some(pattern => {
                // Exact match
                if (workflow.name === pattern) return true;
                // Prefix match
                if (workflow.name.startsWith(pattern)) return true;
                return false;
            });

            if (shouldDelete) {
                try {
                    await client.deleteWorkflow(workflow.id);
                    deleted++;
                } catch (error) {
                    // Ignore delete errors (workflow might already be deleted)
                    console.warn(`Failed to delete workflow ${workflow.name}: ${error}`);
                }
            }
        }

        return deleted;
    } catch (error) {
        console.error('Cleanup failed:', error);
        return 0;
    }
}

/**
 * Creates a cleanup function that deletes all workflows created during a test
 * 
 * @param client - N8nApiClient instance
 * @param projectId - Optional project ID to scope the cleanup
 * @returns A cleanup function that accepts workflow patterns
 * @example
 * ```typescript
 * const cleanup = createTestCleanup(client, projectId);
 * 
 * // In after() block:
 * after(async () => {
 *     await cleanup(['My Test Workflow']);
 * });
 * ```
 */
export function createTestCleanup(client: N8nApiClient, projectId?: string) {
    return async (patterns: string[]) => {
        return await cleanupTestWorkflows(client, patterns, projectId);
    };
}

/**
 * Deletes all workflows matching a timestamp-based prefix
 * Useful for tests that create workflows with timestamps
 * 
 * @param client - N8nApiClient instance
 * @param basePrefix - Base prefix (e.g., "Test Workflow")
 * @param projectId - Optional project ID to scope the cleanup
 * @example
 * ```typescript
 * // Will delete "Test Workflow 1234567890", "Test Workflow 9876543210", etc.
 * await cleanupTimestampedWorkflows(client, 'Test Workflow');
 * ```
 */
export async function cleanupTimestampedWorkflows(
    client: N8nApiClient,
    basePrefix: string,
    projectId?: string
): Promise<number> {
    try {
        const allWorkflows = await client.getAllWorkflows(projectId);
        let deleted = 0;

        for (const workflow of allWorkflows) {
            // Match workflows like "Test Workflow 1234567890"
            if (workflow.name.startsWith(basePrefix)) {
                try {
                    await client.deleteWorkflow(workflow.id);
                    deleted++;
                } catch (error) {
                    console.warn(`Failed to delete workflow ${workflow.name}: ${error}`);
                }
            }
        }

        return deleted;
    } catch (error) {
        console.error('Cleanup failed:', error);
        return 0;
    }
}
