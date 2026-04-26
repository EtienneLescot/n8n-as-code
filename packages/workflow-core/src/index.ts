export {
  AstToTypeScriptGenerator,
  JsonToAstParser,
  TypeScriptParser,
  WorkflowBuilder,
  createPropertyNameContext,
  generateClassName,
  generatePropertyName,
  links,
  node,
  workflow,
} from '@n8n-as-code/transformer';

export type {
  AIDependencyMap,
  ConnectionAST,
  InputConnection,
  JsonToTypeScriptOptions,
  N8nConnections,
  N8nNode,
  N8nWorkflow,
  NodeAST,
  NodeDecoratorMetadata,
  NodeProxy,
  OutputConnection,
  TypeScriptToJsonOptions,
  ValidationError,
  ValidationResult,
  ValidationWarning,
  WorkflowAST,
  WorkflowDecoratorMetadata,
  WorkflowMetadata,
} from '@n8n-as-code/transformer';

export type N8nFacadeSetupMode =
  | 'managed-local'
  | 'connect-existing'
  | 'generation-only';

export type N8nManagerRuntimeMode =
  | 'managed-local-docker'
  | 'existing'
  | 'generation-only';

export interface N8nFacadeSetupModeDefinition {
  id: N8nFacadeSetupMode;
  label: string;
  description: string;
  managerMode: N8nManagerRuntimeMode;
  requiresN8nAccess: boolean;
  enablesRuntimeActions: boolean;
}

export const N8N_FACADE_SETUP_MODES: readonly N8nFacadeSetupModeDefinition[] = [
  {
    id: 'managed-local',
    label: 'Create and manage local n8n',
    description: 'The facade asks n8n-manager to prepare a local n8n runtime and starter credentials.',
    managerMode: 'managed-local-docker',
    requiresN8nAccess: false,
    enablesRuntimeActions: true,
  },
  {
    id: 'connect-existing',
    label: 'Connect existing n8n',
    description: 'The facade stores an existing n8n URL and API key, then uses n8n-manager for runtime readiness.',
    managerMode: 'existing',
    requiresN8nAccess: true,
    enablesRuntimeActions: true,
  },
  {
    id: 'generation-only',
    label: 'Generation only',
    description: 'The facade uses workflow intelligence without configuring a live n8n runtime.',
    managerMode: 'generation-only',
    requiresN8nAccess: false,
    enablesRuntimeActions: false,
  },
] as const;

export function getN8nFacadeSetupMode(mode: N8nFacadeSetupMode): N8nFacadeSetupModeDefinition {
  const definition = N8N_FACADE_SETUP_MODES.find((candidate) => candidate.id === mode);
  if (!definition) {
    throw new Error(`Unknown n8n facade setup mode: ${mode}`);
  }
  return definition;
}

export function isN8nFacadeSetupMode(value: string): value is N8nFacadeSetupMode {
  return N8N_FACADE_SETUP_MODES.some((candidate) => candidate.id === value);
}

export interface WorkflowCoreRole {
  packageName: '@n8n-as-code/workflow-core';
  owns: readonly string[];
  doesNotOwn: readonly string[];
}

export function getWorkflowCoreRole(): WorkflowCoreRole {
  return {
    packageName: '@n8n-as-code/workflow-core',
    owns: [
      'workflow authoring contracts',
      'workflow JSON <-> TypeScript transformation API',
      'facade setup mode contracts',
    ],
    doesNotOwn: [
      'n8n runtime lifecycle',
      'credential creation or tests',
      'workflow deployment or execution',
    ],
  };
}
