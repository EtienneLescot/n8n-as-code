/**
 * @workflow decorator implementation
 */

import 'reflect-metadata';
import { WorkflowDecoratorMetadata, METADATA_KEYS } from './types.js';

/**
 * @workflow decorator
 * 
 * Marks a class as an n8n workflow and stores metadata
 * 
 * @example
 * ```typescript
 * @workflow({
 *     id: "G9GXzwX97XBKAwcj",
 *     name: "Job Application Assistant",
 *     active: false,
 *     settings: { executionOrder: "v1" }
 * })
 * export class JobApplicationWorkflow {
 *     // ...
 * }
 * ```
 */
export function workflow(metadata: WorkflowDecoratorMetadata) {
    return function <T extends { new (...args: any[]): {} }>(constructor: T) {
        // Store workflow metadata on the class
        Reflect.defineMetadata(METADATA_KEYS.WORKFLOW, metadata, constructor);
        
        return constructor;
    };
}

/**
 * Extract workflow metadata from a class
 * Used by the TypeScript → JSON compiler
 */
export function getWorkflowMetadata(target: any): WorkflowDecoratorMetadata | null {
    return Reflect.getMetadata(METADATA_KEYS.WORKFLOW, target) || null;
}
