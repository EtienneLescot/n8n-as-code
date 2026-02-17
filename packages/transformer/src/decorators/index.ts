/**
 * Decorator exports
 * 
 * Public API for workflow TypeScript files
 */

export { workflow, getWorkflowMetadata } from './workflow.js';
export { node, getNodeMetadata } from './node.js';
export { links, getLinksMethodName, connectionTracker, ConnectionTracker } from './links.js';
export { createNodeProxy, createOutputReference } from './helpers.js';

export type {
    WorkflowDecoratorMetadata,
    NodeDecoratorMetadata,
    NodeProxy,
    OutputConnection,
    InputConnection,
    AIDependencyMap
} from './types.js';
