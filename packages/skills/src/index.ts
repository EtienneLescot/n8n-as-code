// Library Exports for Consumers
export { NodeSchemaProvider, resolveNode, suggestNodes } from './services/node-schema-provider.js';
export { AiContextGenerator } from './services/ai-context-generator.js';
export {
  getN8nacDevConfigFilenames,
  resolveN8nacCommandRefs,
  type N8nacCommandRefs,
  type ResolveN8nacCommandOptions,
} from './services/cli-command-resolver.js';
export { WorkflowValidator } from './services/workflow-validator.js';
export { DocsProvider } from './services/docs-provider.js';
export { KnowledgeSearch } from './services/knowledge-search.js';
export { WorkflowRegistry } from './services/workflow-registry.js';
export { resolveSkillsAssetsDir } from './services/assets-dir.js';
export { resolveCustomNodesConfig, type CustomNodesResolution } from './services/custom-nodes-config.js';
export { TypeScriptFormatter } from './services/typescript-formatter.js';

// CLI Command Registration (used by unified n8nac CLI)
export { registerSkillsCommands } from './commands/skills-commander.js';

// Type Exports
export type { ValidationResult, ValidationError, ValidationWarning } from './services/workflow-validator.js';
export type { DocPage, SearchDocsOptions, DocsComplete } from './services/docs-provider.js';
export type { UnifiedSearchResult } from './services/knowledge-search.js';
