import {
  FileBackedN8nLifecycleManager,
  N8nConfigurationService,
  N8nRuntimeOrchestrator,
  createManagedLocalLifecycleManager,
  getN8nManagerAgentInstructions,
  readFileBackedN8nInstance,
  resolveWorkflowWebviewOpen,
  resolveN8nManagerHome,
  resolveFileBackedN8nStatePath,
  listN8nProjects,
  type EffectiveN8nContext,
  type GlobalN8nInstance,
  type N8nGlobalConfiguration,
  type N8nSyncFolderDefaultPolicy,
  type UpsertGlobalN8nInstanceInput,
  type N8nHealthSnapshot,
  type N8nInstanceRef,
  type N8nRuntimeConsumer,
  type N8nRuntimeStatusSnapshot,
  type PreparedEffectiveN8nContext,
  type N8nWorkspaceOverrides,
  type WorkflowWebviewOpenPayload,
  type N8nProjectSnapshot,
} from '@n8n-as-code/n8n-manager-core';

export { getN8nManagerAgentInstructions };
import path from 'node:path';
import {
  N8nCredentialsManager,
  N8nRestCredentialClient,
  type CredentialCatalogEntry,
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
  workspaceRoot?: string;
}

export interface N8nFacadeSetupInput {
  mode: N8nFacadeSetupMode;
  instanceId?: string;
  instanceName?: string;
  n8nHost?: string;
  n8nApiKeyRef?: string;
  tunnel?: boolean;
  bootstrapOwner?: boolean;
}

export interface N8nManagerFacade {
  setup(input: N8nFacadeSetupInput): Promise<N8nInstanceRef>;
  status(input?: { instanceId?: string }): Promise<N8nRuntimeStatusSnapshot | N8nHealthSnapshot>;
  startInstance(instanceId: string): Promise<N8nRuntimeStatusSnapshot>;
  stopInstance(instanceId: string): Promise<N8nRuntimeStatusSnapshot>;
  restartInstance(instanceId: string): Promise<N8nRuntimeStatusSnapshot>;
  getManagedInstance(): Promise<N8nInstanceRef | undefined>;
  listInstances(): Promise<GlobalN8nInstance[]>;
  getGlobalConfig(): Promise<N8nGlobalConfiguration>;
  upsertInstance(input: UpsertGlobalN8nInstanceInput, options?: { setActive?: boolean }): Promise<GlobalN8nInstance>;
  getGlobalActiveInstance(): Promise<GlobalN8nInstance | undefined>;
  setGlobalActiveInstance(instanceId: string): Promise<GlobalN8nInstance>;
  setDefaultSyncFolder(syncFolder: string): Promise<unknown>;
  deleteInstance(instanceId: string): Promise<{ deletedInstance: GlobalN8nInstance; activeInstance?: GlobalN8nInstance }>;
  readWorkspaceOverrides(workspaceRoot?: string): Promise<N8nWorkspaceOverrides>;
  writeWorkspaceOverrides(overrides: Partial<N8nWorkspaceOverrides>, workspaceRoot?: string): Promise<N8nWorkspaceOverrides>;
  clearWorkspaceOverrides(workspaceRoot?: string): Promise<void>;
  resolveEffectiveContext(input?: { workspaceRoot?: string; instanceId?: string; requireProject?: boolean; syncFolderDefault?: N8nSyncFolderDefaultPolicy }): Promise<EffectiveN8nContext>;
  prepareEffectiveContext(input?: {
    workspaceRoot?: string;
    instanceId?: string;
    requireProject?: boolean;
    syncFolderDefault?: N8nSyncFolderDefaultPolicy;
    consumer?: N8nRuntimeConsumer;
    autoStart?: boolean;
  }): Promise<PreparedEffectiveN8nContext>;
  listProjects(input?: {
    workspaceRoot?: string;
    instanceId?: string;
    syncFolderDefault?: N8nSyncFolderDefaultPolicy;
    consumer?: N8nRuntimeConsumer;
    autoStart?: boolean;
  }): Promise<N8nProjectSnapshot[]>;
  resolveWorkflowWebviewOpen(input: { workflowId: string; proxyBaseUrl: string; workflowUrl?: string; workspaceRoot?: string; instanceId?: string; routePath?: string }): Promise<WorkflowWebviewOpenPayload>;
  listSetupModes(): typeof N8N_FACADE_SETUP_MODES;
  listCredentialRecipes(): Promise<CredentialRecipe[]>;
  listCredentialCatalog(): Promise<CredentialCatalogEntry[]>;
  getCredentialSchema(typeName: string): Promise<Record<string, unknown>>;
  listCredentials(): Promise<N8nCredentialRef[]>;
  listStarterKits(): Promise<StarterKit[]>;
  getCredentialInventory(): Promise<CredentialInventory>;
  ensureCredentialType(input: { credentialId?: string; credentialName: string; credentialTypeName: string; values: Record<string, unknown> }): Promise<N8nCredentialRef>;
  ensureCredential(recipeId: string, input?: EnsureCredentialInput): Promise<N8nCredentialRef>;
  deleteCredential(credentialIdOrRecipeId: string): Promise<{ credentialId?: string; recipeId?: string; deletedRemote: boolean; deletedInventory: boolean }>;
  testCredential(credentialIdOrRecipeId: string): Promise<CredentialTestResult>;
  bootstrapStarterKit(starterKitId: string, inputs?: Record<string, EnsureCredentialInput>): Promise<StarterKitResult>;
}

export function createN8nManagerFacade(options: N8nManagerFacadeOptions = {}): N8nManagerFacade {
  const statePath = options.statePath ?? process.env.N8N_MANAGER_STATE_PATH;
  const lifecycle = new FileBackedN8nLifecycleManager(statePath);
  const configuration = new N8nConfigurationService();
  const runtime = new N8nRuntimeOrchestrator({ configuration });

  async function createCredentialsManager(): Promise<N8nCredentialsManager> {
    if (options.n8nHost && options.n8nApiKey) {
      return new N8nCredentialsManager({
        projectId: options.projectId,
        client: new N8nRestCredentialClient({ baseUrl: options.n8nHost, apiKey: options.n8nApiKey }),
      });
    }

    const prepared = await tryPrepareEffectiveContext(runtime, options.workspaceRoot);
    const apiBaseUrl = prepared?.context.apiBaseUrl ?? prepared?.context.host;
    if (apiBaseUrl && prepared?.context.apiKey && !prepared.runtime.blocked) {
      return new N8nCredentialsManager({
        projectId: options.projectId ?? prepared.context.projectId,
        client: new N8nRestCredentialClient({ baseUrl: apiBaseUrl, apiKey: prepared.context.apiKey }),
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
      const managedRuntime = mode.managerMode === 'managed-local-docker'
        ? await createManagedLocalLifecycleManager(configuration, {
          instanceId: input.instanceId,
          name: input.instanceName,
        })
        : undefined;
      const selectedLifecycle = managedRuntime?.lifecycle ?? lifecycle;
      const selectedStatePath = managedRuntime?.statePath ?? statePath;
      const instance = await selectedLifecycle.setup({
        mode: mode.managerMode,
        baseUrl: input.n8nHost ?? options.n8nHost,
        apiKeyRef: input.n8nApiKeyRef,
        tunnel: input.tunnel,
        bootstrapOwner: input.bootstrapOwner,
      });
      const privateInstance = await readFileBackedN8nInstance(selectedStatePath);
      const lifecycleInstance = {
        ...instance,
        ...(privateInstance ?? {}),
        runtimeStatePath: resolveFileBackedN8nStatePath(selectedStatePath),
      };
      configuration.upsertInstanceFromLifecycle(lifecycleInstance, {
        name: input.instanceName,
        apiKey: options.n8nApiKey ?? privateInstance?.apiKey,
        setActive: true,
      });
      if (mode.managerMode === 'managed-local-docker' && input.tunnel && instance.tunnelPublicUrl) {
        const status = await runtime.ensureTunnel(instance.id);
        return {
          ...instance,
          warnings: (status as { warnings?: string[] }).warnings,
        };
      }
      return instance;
    },
    status: async (input = {}) => {
      const selected = input.instanceId
        ? configuration.getInstance(input.instanceId)
        : configuration.getGlobalActiveInstance();
      return selected ? runtime.getRuntimeStatus(selected.id) : lifecycle.status();
    },
    startInstance: async (instanceId) => runtime.startInstance(instanceId),
    stopInstance: async (instanceId) => runtime.stopInstance(instanceId),
    restartInstance: async (instanceId) => runtime.restartInstance(instanceId),
    getManagedInstance: () => readFileBackedN8nInstance(statePath),
    listInstances: async () => configuration.listInstances(),
    getGlobalConfig: async () => configuration.getGlobalConfig(),
    upsertInstance: async (input, upsertOptions) => configuration.upsertInstance(input, upsertOptions),
    getGlobalActiveInstance: async () => configuration.getGlobalActiveInstance(),
    setGlobalActiveInstance: async (instanceId) => configuration.setGlobalActiveInstance(instanceId),
    setDefaultSyncFolder: async (syncFolder) => configuration.setDefaultSyncFolder(syncFolder),
    deleteInstance: async (instanceId) => {
      const instance = configuration.getInstance(instanceId);
      if (instance?.mode === 'managed-local-docker') {
        await runtime.cleanupInstanceProcesses(instanceId);
      }
      return configuration.deleteInstance(instanceId);
    },
    readWorkspaceOverrides: async (workspaceRoot = options.workspaceRoot) => {
      if (!workspaceRoot) return { version: 3 };
      return configuration.readWorkspaceOverrides(workspaceRoot);
    },
    writeWorkspaceOverrides: async (overrides, workspaceRoot = options.workspaceRoot) => {
      if (!workspaceRoot) throw new Error('workspaceRoot is required to write n8n workspace overrides.');
      return configuration.writeWorkspaceOverrides(workspaceRoot, overrides);
    },
    clearWorkspaceOverrides: async (workspaceRoot = options.workspaceRoot) => {
      if (!workspaceRoot) return;
      configuration.clearWorkspaceOverrides(workspaceRoot);
    },
    resolveEffectiveContext: async (input = {}) => configuration.resolveEffectiveContext({
      workspaceRoot: input.workspaceRoot ?? options.workspaceRoot,
      instanceId: input.instanceId,
      requireProject: input.requireProject,
      syncFolderDefault: input.syncFolderDefault,
    }),
    prepareEffectiveContext: async (input = {}) => runtime.prepareEffectiveContext({
      workspaceRoot: input.workspaceRoot ?? options.workspaceRoot,
      instanceId: input.instanceId,
      requireProject: input.requireProject,
      syncFolderDefault: input.syncFolderDefault,
      consumer: input.consumer ?? 'plugin',
      autoStart: input.autoStart,
    }),
    listProjects: async (input = {}) => {
      const prepared = await runtime.prepareEffectiveContext({
        workspaceRoot: input.workspaceRoot ?? options.workspaceRoot,
        instanceId: input.instanceId,
        syncFolderDefault: input.syncFolderDefault,
        consumer: input.consumer ?? 'plugin',
        autoStart: input.autoStart,
      });
      if (prepared.runtime.blocked) {
        throw new Error(prepared.runtime.blocked.message);
      }
      const { host, apiKey, activeInstanceName } = prepared.context;
      if (!host || !apiKey) {
        throw new Error(`Instance "${activeInstanceName}" needs a host and API key before projects can be loaded.`);
      }
      return listN8nProjects({ baseUrl: host, apiKey });
    },
    resolveWorkflowWebviewOpen: async (input) => resolveWorkflowWebviewOpen({
      ...input,
      workspaceRoot: input.workspaceRoot ?? options.workspaceRoot,
    }, configuration),
    listSetupModes: () => N8N_FACADE_SETUP_MODES,
    listCredentialRecipes: async () => (await createCredentialsManager()).listRecipes(),
    listCredentialCatalog: async () => (await createCredentialsManager()).listCredentialCatalog(),
    getCredentialSchema: async (typeName) => (await createCredentialsManager()).getCredentialSchema(typeName),
    listCredentials: async () => (await createCredentialsManager()).listCredentials(),
    listStarterKits: async () => (await createCredentialsManager()).listStarterKits(),
    getCredentialInventory: async () => (await createCredentialsManager()).getCredentialInventory(),
    ensureCredentialType: async (input) => (await createCredentialsManager()).ensureCredentialType(input),
    ensureCredential: async (recipeId, input) => (await createCredentialsManager()).ensureCredential(recipeId, input),
    deleteCredential: async (credentialIdOrRecipeId) => (await createCredentialsManager()).deleteCredential(credentialIdOrRecipeId),
    testCredential: async (credentialIdOrRecipeId) => (await createCredentialsManager()).testCredential(credentialIdOrRecipeId),
    bootstrapStarterKit: async (starterKitId, inputs) => (await createCredentialsManager()).bootstrapStarterKit(starterKitId, inputs),
  };
}

export function resolveN8nManagerConfigurationPaths(): {
  homeDir: string;
  instancesPath: string;
  secretsPath: string;
} {
  const homeDir = resolveN8nManagerHome();
  return {
    homeDir,
    instancesPath: path.join(homeDir, 'instances.json'),
    secretsPath: path.join(homeDir, 'secrets.json'),
  };
}

async function tryPrepareEffectiveContext(
  runtime: N8nRuntimeOrchestrator,
  workspaceRoot?: string,
): Promise<PreparedEffectiveN8nContext | undefined> {
  try {
    return await runtime.prepareEffectiveContext({
      workspaceRoot,
      syncFolderDefault: workspaceRoot ? 'workspace' : 'global',
      consumer: 'plugin',
      autoStart: true,
    });
  } catch {
    return undefined;
  }
}
