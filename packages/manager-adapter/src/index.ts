import { FileBackedN8nLifecycleManager, type N8nHealthSnapshot, type N8nInstanceRef } from '@n8n-as-code/n8n-manager-core';
import {
  N8nCredentialsManager,
  N8nRestCredentialClient,
  type CredentialInventory,
  type CredentialRecipe,
  type CredentialTestResult,
  type EnsureCredentialInput,
  type N8nCredentialRef,
  type StarterKit,
  type StarterKitResult,
} from '@n8n-as-code/n8n-credentials-manager';
import {
  N8N_FACADE_SETUP_MODES,
  getN8nFacadeSetupMode,
  type N8nFacadeSetupMode,
} from '@n8n-as-code/workflow-core';

export interface N8nManagerFacadeOptions {
  n8nHost?: string;
  n8nApiKey?: string;
  projectId?: string;
  statePath?: string;
}

export interface N8nFacadeSetupInput {
  mode: N8nFacadeSetupMode;
  n8nHost?: string;
  n8nApiKeyRef?: string;
}

export interface N8nManagerFacade {
  setup(input: N8nFacadeSetupInput): Promise<N8nInstanceRef>;
  status(): Promise<N8nHealthSnapshot>;
  listSetupModes(): typeof N8N_FACADE_SETUP_MODES;
  listCredentialRecipes(): Promise<CredentialRecipe[]>;
  listStarterKits(): Promise<StarterKit[]>;
  getCredentialInventory(): Promise<CredentialInventory>;
  ensureCredential(recipeId: string, input?: EnsureCredentialInput): Promise<N8nCredentialRef>;
  testCredential(credentialIdOrRecipeId: string): Promise<CredentialTestResult>;
  bootstrapStarterKit(starterKitId: string, inputs?: Record<string, EnsureCredentialInput>): Promise<StarterKitResult>;
}

export function createN8nManagerFacade(options: N8nManagerFacadeOptions = {}): N8nManagerFacade {
  const lifecycle = new FileBackedN8nLifecycleManager(options.statePath ?? process.env.N8N_MANAGER_STATE_PATH);
  const credentials = new N8nCredentialsManager({
    projectId: options.projectId,
    client: options.n8nHost && options.n8nApiKey
      ? new N8nRestCredentialClient({ baseUrl: options.n8nHost, apiKey: options.n8nApiKey })
      : undefined,
  });

  return {
    async setup(input) {
      const mode = getN8nFacadeSetupMode(input.mode);
      return lifecycle.setup({
        mode: mode.managerMode,
        baseUrl: input.n8nHost ?? options.n8nHost,
        apiKeyRef: input.n8nApiKeyRef,
      });
    },
    status: () => lifecycle.status(),
    listSetupModes: () => N8N_FACADE_SETUP_MODES,
    listCredentialRecipes: () => credentials.listRecipes(),
    listStarterKits: () => credentials.listStarterKits(),
    getCredentialInventory: () => credentials.getCredentialInventory(),
    ensureCredential: (recipeId, input) => credentials.ensureCredential(recipeId, input),
    testCredential: (credentialIdOrRecipeId) => credentials.testCredential(credentialIdOrRecipeId),
    bootstrapStarterKit: (starterKitId, inputs) => credentials.bootstrapStarterKit(starterKitId, inputs),
  };
}
