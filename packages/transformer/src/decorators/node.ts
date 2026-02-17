/**
 * @node decorator implementation
 */

import 'reflect-metadata';
import { NodeDecoratorMetadata, METADATA_KEYS } from './types.js';

/**
 * @node decorator
 * 
 * Marks a property as an n8n node and stores metadata
 * 
 * @example
 * ```typescript
 * @node({
 *     name: "🕘 Schedule Trigger",
 *     type: "n8n-nodes-base.scheduleTrigger",
 *     version: 1.2,
 *     position: [-1072, 720]
 * })
 * ScheduleTrigger = {
 *     rule: { interval: [{ field: "cronExpression", expression: "0 9 * * 1-5" }] }
 * };
 * ```
 */
export function node(metadata: NodeDecoratorMetadata) {
    return function (target: any, propertyKey: string) {
        // Get existing nodes metadata or create new map
        const existingNodes = Reflect.getMetadata(METADATA_KEYS.NODE, target.constructor) || new Map();
        
        // Store metadata for this specific property
        existingNodes.set(propertyKey, metadata);
        
        // Update metadata on class
        Reflect.defineMetadata(METADATA_KEYS.NODE, existingNodes, target.constructor);
    };
}

/**
 * Extract all node metadata from a class
 * Used by the TypeScript → JSON compiler
 * 
 * @returns Map of propertyName → NodeDecoratorMetadata
 */
export function getNodeMetadata(target: any): Map<string, NodeDecoratorMetadata> {
    return Reflect.getMetadata(METADATA_KEYS.NODE, target) || new Map();
}
