/**
 * @links decorator implementation
 * 
 * Marker decorator for the defineRouting() method
 * This method defines connections and AI dependencies
 */

import 'reflect-metadata';
import { METADATA_KEYS, OutputConnection, InputConnection, AIDependencyMap } from './types.js';

/**
 * @links decorator
 * 
 * Marks the method that defines workflow routing (connections)
 * 
 * @example
 * ```typescript
 * @links()
 * defineRouting() {
 *     this.ScheduleTrigger.out(0).to(this.Configuration.in(0));
 *     this.Configuration.out(0).to(this.BuildProfile.in(0));
 * }
 * ```
 */
export function links() {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        // Mark this method as the routing definition
        Reflect.defineMetadata(METADATA_KEYS.CONNECTIONS, propertyKey, target.constructor);
        
        return descriptor;
    };
}

/**
 * Get the name of the method marked with @links
 */
export function getLinksMethodName(target: any): string | null {
    return Reflect.getMetadata(METADATA_KEYS.CONNECTIONS, target) || null;
}

// =====================================================================
// CONNECTION TRACKING
// =====================================================================

/**
 * Connection storage for tracking during defineRouting() execution
 */
export class ConnectionTracker {
    private connections: Array<{
        from: { node: string; output: number; isError?: boolean };
        to: { node: string; input: number };
    }> = [];
    
    private aiDependencies: Map<string, AIDependencyMap> = new Map();
    
    /**
     * Record a connection
     */
    addConnection(
        fromNode: string,
        fromOutput: number,
        toNode: string,
        toInput: number,
        isError?: boolean
    ): void {
        this.connections.push({
            from: { node: fromNode, output: fromOutput, isError },
            to: { node: toNode, input: toInput }
        });
    }
    
    /**
     * Record AI dependencies for a node
     */
    addAIDependencies(nodeName: string, dependencies: AIDependencyMap): void {
        this.aiDependencies.set(nodeName, dependencies);
    }
    
    /**
     * Get all recorded connections
     */
    getConnections() {
        return this.connections;
    }
    
    /**
     * Get all AI dependencies
     */
    getAIDependencies() {
        return this.aiDependencies;
    }
    
    /**
     * Clear all tracked data
     */
    clear(): void {
        this.connections = [];
        this.aiDependencies.clear();
    }
}

/**
 * Global connection tracker instance
 * Used during defineRouting() execution to capture connections
 */
export const connectionTracker = new ConnectionTracker();
