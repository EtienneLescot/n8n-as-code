import {
  FileBackedN8nLifecycleManager,
  readFileBackedN8nInstance,
  type N8nHealthSnapshot,
  type N8nInstanceRef,
} from '@n8n-as-code/n8n-manager-core';
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
  tunnel?: boolean;
  bootstrapOwner?: boolean;
}

export interface N8nManagerFacade {
  setup(input: N8nFacadeSetupInput): Promise<N8nInstanceRef>;
  status(): Promise<N8nHealthSnapshot>;
  listSetupModes(): typeof N8N_FACADE_SETUP_MODES;
  listCredentialRecipes(): Promise<CredentialRecipe[]>;
  listStarterKits(): Promise<StarterKit[]>;
  getCredentialInventory(): Promise<CredentialInventory>;
  ensureCredential(recipeId: string, input?: EnsureCredentialInput): Promise<N8nCredentialRef>;
  deleteCredential(credentialIdOrRecipeId: string): Promise<{ credentialId?: string; recipeId?: string; deletedRemote: boolean; deletedInventory: boolean }>;
  testCredential(credentialIdOrRecipeId: string): Promise<CredentialTestResult>;
  bootstrapStarterKit(starterKitId: string, inputs?: Record<string, EnsureCredentialInput>): Promise<StarterKitResult>;
}

export function createN8nManagerFacade(options: N8nManagerFacadeOptions = {}): N8nManagerFacade {
  const statePath = options.statePath ?? process.env.N8N_MANAGER_STATE_PATH;
  const lifecycle = new FileBackedN8nLifecycleManager(statePath);

  async function createCredentialsManager(): Promise<N8nCredentialsManager> {
    if (options.n8nHost && options.n8nApiKey) {
      return new N8nCredentialsManager({
        projectId: options.projectId,
        client: new N8nRestCredentialClient({ baseUrl: options.n8nHost, apiKey: options.n8nApiKey }),
      });
    }

    const managed = await readFileBackedN8nInstance(statePath);
    return new N8nCredentialsManager({
      projectId: options.projectId,
      client: managed?.baseUrl && managed.apiKey
        ? new N8nRestCredentialClient({ baseUrl: managed.baseUrl, apiKey: managed.apiKey })
        : undefined,
    });
  }

  return {
    async setup(input) {
      const mode = getN8nFacadeSetupMode(input.mode);
      return lifecycle.setup({
        mode: mode.managerMode,
        baseUrl: input.n8nHost ?? options.n8nHost,
        apiKeyRef: input.n8nApiKeyRef,
        tunnel: input.tunnel,
        bootstrapOwner: input.bootstrapOwner,
      });
    },
    status: () => lifecycle.status(),
    listSetupModes: () => N8N_FACADE_SETUP_MODES,
    listCredentialRecipes: async () => (await createCredentialsManager()).listRecipes(),
    listStarterKits: async () => (await createCredentialsManager()).listStarterKits(),
    getCredentialInventory: async () => (await createCredentialsManager()).getCredentialInventory(),
    ensureCredential: async (recipeId, input) => (await createCredentialsManager()).ensureCredential(recipeId, input),
    deleteCredential: async (credentialIdOrRecipeId) => (await createCredentialsManager()).deleteCredential(credentialIdOrRecipeId),
    testCredential: async (credentialIdOrRecipeId) => (await createCredentialsManager()).testCredential(credentialIdOrRecipeId),
    bootstrapStarterKit: async (starterKitId, inputs) => (await createCredentialsManager()).bootstrapStarterKit(starterKitId, inputs),
  };
}
