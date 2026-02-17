/**
 * @n8n-as-code/transformer
 * 
 * Bidirectional transformer: n8n JSON workflows ↔ TypeScript
 */

// Decorators (public API for workflow .ts files)
export {
    workflow,
    node,
    links
} from './decorators/index.js';

export type {
    WorkflowDecoratorMetadata,
    NodeDecoratorMetadata,
    NodeProxy,
    OutputConnection,
    InputConnection,
    AIDependencyMap
} from './decorators/index.js';

// Transformers (for internal use by sync/skills packages)
export { JsonToAstParser } from './parser/index.js';
export { AstToTypeScriptGenerator } from './parser/index.js';
export { TypeScriptParser } from './compiler/index.js';
export { WorkflowBuilder } from './compiler/index.js';

// Types
export type {
    WorkflowAST,
    NodeAST,
    ConnectionAST,
    WorkflowMetadata,
    N8nWorkflow,
    N8nNode,
    N8nConnections,
    JsonToTypeScriptOptions,
    TypeScriptToJsonOptions,
    ValidationResult,
    ValidationError,
    ValidationWarning
} from './types.js';

// Utilities
export {
    generatePropertyName,
    generateClassName,
    createPropertyNameContext
} from './utils/index.js';
