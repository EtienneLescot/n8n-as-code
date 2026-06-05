import fs from 'fs';
import path from 'path';
import {
    N8nConfigurationService,
    N8nRuntimeOrchestrator,
    type EffectiveN8nContext,
    type GlobalN8nInstance,
    type N8nInstanceVerification,
    type N8nInstanceVerificationStatus,
    type UpsertGlobalN8nInstanceInput,
} from '@n8n-as-code/n8n-manager-core';
import { N8nApiClient, createCanonicalInstanceIdentifier, createInstanceIdentifier, createInstanceUserIdentifier, isCanonicalInstanceIdentifier, isCanonicalInstanceUserIdentifier, isCanonicalUserInstanceIdentifier, resolveInstanceIdentifier, resolveN8nIdentity as resolveN8nIdentityFromApi, type IResolvedN8nIdentity } from '../core/index.js';

const DEFAULT_SYNC_FOLDER = 'workflows';

type GlobalN8nInstanceWithUserIdentifier = GlobalN8nInstance & { instanceUserIdentifier?: string };
type UpsertGlobalN8nInstanceInputWithUserIdentifier = UpsertGlobalN8nInstanceInput & { instanceUserIdentifier?: string };

export interface ILocalConfig {
    host?: string;
    syncFolder?: string;
    projectId?: string;
    projectName?: string;
    instanceIdentifier?: string;
    instanceUserIdentifier?: string;
    workflowsPath?: string;
    workflowDir?: string;
    customNodesPath?: string;
    folderSync?: boolean;
}

export type IInstanceVerificationStatus = N8nInstanceVerificationStatus;
export type IInstanceVerification = N8nInstanceVerification;

export interface IInstanceProfile extends ILocalConfig {
    id: string;
    name: string;
    verification?: IInstanceVerification;
}

export interface IManagedEnvironmentTarget {
    id: string;
    name: string;
    kind: 'managed-instance';
    managedInstanceId: string;
    description?: string;
    managedInstanceName?: string;
    url?: string;
    instanceName?: string;
    instanceIdentifier?: string;
    instanceUserIdentifier?: string;
    apiKeyAvailable?: boolean;
    credentialSource?: 'env' | 'workspace-local' | 'global' | 'missing';
    accessStatus?: EnvironmentAccessStatus;
}

export interface IExternalEnvironmentTarget {
    id: string;
    name: string;
    kind: 'external-instance';
    url: string;
    instanceIdentifier?: string;
    instanceUserIdentifier?: string;
    verification?: IInstanceVerification;
    description?: string;
    apiKeyAvailable?: boolean;
    credentialSource?: 'env' | 'workspace-local' | 'global' | 'missing';
    accessStatus?: EnvironmentAccessStatus;
}

export type IEnvironmentTarget = IManagedEnvironmentTarget | IExternalEnvironmentTarget;

export type IWorkspaceNativeMcpMode = 'assist' | 'direct';

export interface IWorkspaceNativeMcpConfig {
    enabled?: boolean;
    url?: string;
    mode?: IWorkspaceNativeMcpMode;
    timeoutMs?: number;
    allowRemoteExposure?: boolean;
    allowExecutionData?: boolean;
    requireSyncBack?: boolean;
    tokenConfigured?: boolean;
}

export interface IWorkspaceEnvironment {
    id: string;
    name: string;
    syncSlug?: string;
    legacyWorkflowDir?: string;
    environmentTargetId: string;
    projectId?: string;
    projectName?: string;
    workflowsPath?: string;
    syncFolder?: string;
    folderSync?: boolean;
    customNodesPath?: string;
    description?: string;
    sourceKind?: 'managed-instance' | 'external-instance';
    environmentTargetName?: string;
    managedInstanceId?: string;
    instanceName?: string;
    url?: string;
    workflowsPathResolved?: string;
    workflowDir?: string;
    instanceIdentifier?: string;
    instanceUserIdentifier?: string;
    apiKeyAvailable?: boolean;
    credentialSource?: 'env' | 'workspace-local' | 'global' | 'missing';
    accessStatus?: EnvironmentAccessStatus;
    nativeMcp?: IWorkspaceNativeMcpConfig;
}

export type EnvironmentAccessStatus =
    | 'ready'
    | 'missing-api-key'
    | 'invalid-api-key'
    | 'project-inaccessible'
    | 'insufficient-workflow-permissions'
    | 'runtime-unavailable'
    | 'unknown';

export interface IPersistedWorkspaceConfigV4 {
    version: 4;
    activeEnvironmentId?: string;
    environmentTargets: IEnvironmentTarget[];
    environments: IWorkspaceEnvironment[];
}

export interface IWorkspaceConfig extends ILocalConfig {
    version: 4;
    activeInstanceId?: string;
    instances: IInstanceProfile[];
    activeEnvironmentId?: string;
    activeEnvironment?: IWorkspaceEnvironment;
    environmentTargets?: IEnvironmentTarget[];
    environments?: IWorkspaceEnvironment[];
    sourceKind?: 'managed-instance' | 'external-instance';
    environmentTargetId?: string;
    environmentTargetName?: string;
    apiKeyAvailable?: boolean;
    credentialSource?: 'env' | 'workspace-local' | 'global' | 'missing';
}

export interface IResolvedWorkspaceEnvironment extends ILocalConfig {
    environment: IWorkspaceEnvironment;
    environmentTarget: IEnvironmentTarget;
    instance: IInstanceProfile | IExternalEnvironmentTarget;
    environmentId: string;
    environmentName: string;
    environmentTargetId: string;
    environmentTargetName: string;
    activeInstanceId?: string;
    activeInstanceName: string;
    sourceKind: 'managed-instance' | 'external-instance';
    managedInstanceId?: string;
    host: string;
    apiKey?: string;
    apiKeySource: 'env' | 'workspace-local' | 'global' | 'missing';
    apiKeyAvailable: boolean;
    accessStatus: EnvironmentAccessStatus;
    nativeMcp?: IWorkspaceNativeMcpConfig;
    workflowsPath: string;
    syncFolder?: string;
    instanceIdentifier?: string;
    instanceUserIdentifier?: string;
    workflowDir?: string;
    sources: {
        environment: 'explicit' | 'workspace-default' | 'legacy' | 'global-fallback';
        instance: 'managed-instance' | 'external-instance';
        project: 'environment' | 'instance-default' | 'missing';
        syncFolder: 'environment';
    };
}

export interface IPreviousWorkspaceUpgradePlan {
    status: 'upgrade-available';
    configPath: string;
    activeInstanceId?: string;
    activeInstanceName?: string;
    sourceKind?: 'managed-instance' | 'external-instance';
    workspace: Partial<ILocalConfig>;
    warnings: string[];
}

export type IPreviousWorkspaceUpgradeResult =
    | { status: 'not-needed'; configPath: string }
    | { status: 'dry-run'; plan: IPreviousWorkspaceUpgradePlan }
    | { status: 'upgraded'; plan: IPreviousWorkspaceUpgradePlan; backupPath: string; config: IPersistedWorkspaceConfigV4 };

export interface IInstanceVerificationClient {
    getCurrentUser(): Promise<{ id?: string; email?: string; firstName?: string; lastName?: string } | null>;
}

export interface IUpsertInstanceConfigInput extends Partial<ILocalConfig> {
    apiKey?: string;
}

export type IUpsertInstanceConfigResult =
    | { status: 'saved'; profile: IInstanceProfile; verificationStatus: IInstanceVerificationStatus }
    | { status: 'duplicate'; duplicateInstance: IInstanceProfile; normalizedHost: string; userId: string; userName?: string; userEmail?: string };

export type ISelectInstanceResult =
    | { status: 'selected'; profile: IInstanceProfile; verificationStatus: IInstanceVerificationStatus }
    | { status: 'duplicate'; profile: IInstanceProfile; duplicateInstance: IInstanceProfile };

export class ConfigService {
    private readonly manager: N8nConfigurationService;
    private readonly runtime: N8nRuntimeOrchestrator;
    private readonly workspaceRoot: string;

    constructor(workspaceRoot?: string) {
        const testWorkspaceRoot = process.env.NODE_ENV === 'test'
            ? process.env.N8NAC_TEST_WORKSPACE_ROOT?.trim()
            : undefined;
        this.workspaceRoot = workspaceRoot ? path.resolve(workspaceRoot) : testWorkspaceRoot ? path.resolve(testWorkspaceRoot) : this.findConfigRoot(process.cwd());
        this.manager = new N8nConfigurationService();
        this.runtime = new N8nRuntimeOrchestrator({ configuration: this.manager });
    }

    getLocalConfig(environmentNameOrId?: string): Partial<ILocalConfig> {
        try {
            return this.environmentToLocalConfig(this.resolveEnvironment(environmentNameOrId));
        } catch {
            return {};
        }
    }

    getWorkspaceConfig(): IWorkspaceConfig {
        const persisted = this.readWorkspaceConfigFile();
        const instances = this.listInstances();
        const effective = tryResolve(() => this.resolveEnvironment());
        const environmentTargets = persisted.environmentTargets.map((target) => this.environmentTargetToSnapshot(target));
        const environments = persisted.environments.map((environment) => this.environmentToSnapshot(environment));
        return {
            version: 4,
            activeEnvironmentId: persisted.activeEnvironmentId,
            activeInstanceId: effective?.activeInstanceId,
            activeEnvironment: effective?.environment,
            environmentTargets,
            environments,
            instances,
            ...(effective ? this.environmentToLocalConfig(effective) : {}),
            sourceKind: effective?.sourceKind,
            environmentTargetId: effective?.environmentTargetId,
            environmentTargetName: effective?.environmentTargetName,
            apiKeyAvailable: effective?.apiKeyAvailable,
            credentialSource: effective?.apiKeySource,
        };
    }

    listInstanceTargets(): IEnvironmentTarget[] {
        return this.ensureV4WorkspaceConfig().environmentTargets;
    }

    listEnvironments(): IWorkspaceEnvironment[] {
        return this.ensureV4WorkspaceConfig().environments;
    }

    addInstanceTarget(input: { name: string; managedInstanceId?: string; url?: string; id?: string; description?: string }): IEnvironmentTarget {
        const name = cleanRequired(input.name, 'Instance target name');
        const hasRef = Boolean(input.managedInstanceId?.trim());
        const hasBaseUrl = Boolean(input.url?.trim());
        if (hasRef === hasBaseUrl) {
            throw new Error('Provide exactly one of --instance-ref or --base-url.');
        }

        const config = this.ensureV4WorkspaceConfig();
        const id = this.uniqueWorkspaceId(input.id || this.slugId(name), [
            ...config.environmentTargets.map((target) => target.id),
            ...config.environments.map((environment) => environment.id),
        ]);
        this.assertUniqueName(name, config.environmentTargets, 'instance target');

        const target: IEnvironmentTarget = hasRef
            ? {
                id,
                name,
                kind: 'managed-instance',
                managedInstanceId: this.resolveExistingGlobalInstanceRef(input.managedInstanceId),
                description: input.description,
            }
            : {
                id,
                name,
                kind: 'external-instance',
                url: cleanRequired(input.url, 'Base URL'),
                description: input.description,
            };

        const next = {
            ...config,
            environmentTargets: [...config.environmentTargets, target],
        };
        this.writeWorkspaceConfigV4(next);
        return target;
    }

    ensureEmbeddedInstanceTarget(input: { name: string; url: string; id?: string; description?: string }): IEnvironmentTarget {
        const url = cleanRequired(input.url, 'Base URL');
        const normalizedBaseUrl = this.normalizeHost(url);
        const config = this.ensureV4WorkspaceConfig();
        const externalInstance = config.environmentTargets.find((target) => {
            return target.kind === 'external-instance' && this.normalizeHost(target.url) === normalizedBaseUrl;
        });
        if (externalInstance) return externalInstance;

        const existingNames = new Set(config.environmentTargets.map((target) => target.name.toLowerCase()));
        const baseName = cleanRequired(input.name, 'Instance name');
        let name = baseName;
        let counter = 2;
        while (existingNames.has(name.toLowerCase())) {
            name = `${baseName} ${counter}`;
            counter += 1;
        }

        return this.addInstanceTarget({
            name,
            id: input.id,
            url,
            description: input.description,
        });
    }

    ensureManagedInstanceTarget(input: { name: string; managedInstanceId: string; id?: string; description?: string }): IEnvironmentTarget {
        const managedInstanceId = cleanRequired(input.managedInstanceId, 'Managed instance ID');
        const config = this.ensureV4WorkspaceConfig();
        const managedInstance = config.environmentTargets.find((target) => {
            return target.kind === 'managed-instance' && target.managedInstanceId === managedInstanceId;
        });
        if (managedInstance) return managedInstance;

        const existingNames = new Set(config.environmentTargets.map((target) => target.name.toLowerCase()));
        const baseName = cleanRequired(input.name, 'Instance name');
        let name = baseName;
        let counter = 2;
        while (existingNames.has(name.toLowerCase())) {
            name = `${baseName} ${counter}`;
            counter += 1;
        }

        return this.addInstanceTarget({
            name,
            id: input.id,
            managedInstanceId,
            description: input.description,
        });
    }

    updateInstanceTarget(nameOrId: string, patch: { name?: string; managedInstanceId?: string; url?: string; description?: string }): IEnvironmentTarget {
        const config = this.ensureV4WorkspaceConfig();
        const target = this.findInstanceTarget(config, nameOrId);
        const nextName = cleanOptional(patch.name) || target.name;
        if (nextName.toLowerCase() !== target.name.toLowerCase()) {
            this.assertUniqueName(nextName, config.environmentTargets.filter((item) => item.id !== target.id), 'instance target');
        }

        const nextTarget: IEnvironmentTarget = target.kind === 'managed-instance'
            ? stripUndefined({
                ...target,
                name: nextName,
                managedInstanceId: patch.managedInstanceId ? this.resolveExistingGlobalInstanceRef(patch.managedInstanceId) : target.managedInstanceId,
                description: patch.description ?? target.description,
            })
            : stripUndefined({
                ...target,
                name: nextName,
                url: cleanOptional(patch.url) || target.url,
                description: patch.description ?? target.description,
            });

        this.writeWorkspaceConfigV4({
            ...config,
            environmentTargets: config.environmentTargets.map((item) => item.id === target.id ? nextTarget : item),
        });
        return nextTarget;
    }

    removeInstanceTarget(nameOrId: string): IEnvironmentTarget {
        const config = this.ensureV4WorkspaceConfig();
        const target = this.findInstanceTarget(config, nameOrId);
        const usedBy = config.environments.filter((environment) => environment.environmentTargetId === target.id);
        if (usedBy.length > 0) {
            throw new Error(`Workspace instance target "${target.name}" is used by environment(s): ${usedBy.map((environment) => environment.name).join(', ')}.`);
        }
        this.writeWorkspaceConfigV4({
            ...config,
            environmentTargets: config.environmentTargets.filter((item) => item.id !== target.id),
        });
        return target;
    }

    addEnvironment(input: {
        name: string;
        environmentTarget: string;
        projectId?: string;
        projectName?: string;
        workflowsPath?: string;
        workflowDir?: string;
        syncFolder?: string;
        id?: string;
        folderSync?: boolean;
        customNodesPath?: string;
        description?: string;
        nativeMcp?: IWorkspaceNativeMcpConfig;
    }): IWorkspaceEnvironment {
        const config = this.ensureV4WorkspaceConfig();
        const name = cleanRequired(input.name, 'Environment name');
        const target = this.findInstanceTarget(config, input.environmentTarget);
        const id = this.uniqueWorkspaceId(input.id || this.slugId(name), [
            ...config.environmentTargets.map((item) => item.id),
            ...config.environments.map((item) => item.id),
        ]);
        this.assertUniqueName(name, config.environments, 'environment');
        const syncSlug = this.uniqueEnvironmentSyncSlug(name, config.environments);
        const workflowsPath = this.resolveInputWorkflowsPath({
            workflowsPath: input.workflowsPath,
            workflowDir: input.workflowDir,
            syncFolder: input.syncFolder,
            syncSlug,
        }, config.environments, name);

        const environment: IWorkspaceEnvironment = {
            id,
            name,
            syncSlug,
            environmentTargetId: target.id,
            projectId: cleanOptional(input.projectId),
            projectName: cleanOptional(input.projectName),
            workflowsPath,
            folderSync: input.folderSync,
            customNodesPath: input.customNodesPath,
            description: input.description,
            nativeMcp: this.sanitizeNativeMcpConfig(input.nativeMcp),
        };
        const next = {
            ...config,
            activeEnvironmentId: config.activeEnvironmentId || environment.id,
            environments: [...config.environments, environment],
        };
        this.writeWorkspaceConfigV4(next);
        return environment;
    }

    updateEnvironment(nameOrId: string, patch: Partial<Pick<IWorkspaceEnvironment, 'name' | 'projectId' | 'projectName' | 'workflowsPath' | 'workflowDir' | 'syncFolder' | 'folderSync' | 'customNodesPath' | 'description'>> & { environmentTarget?: string; nativeMcp?: IWorkspaceNativeMcpConfig | null }): IWorkspaceEnvironment {
        const config = this.ensureV4WorkspaceConfig();
        const environment = this.findEnvironment(config, nameOrId);
        const currentTarget = this.findInstanceTarget(config, environment.environmentTargetId);
        const target = patch.environmentTarget ? this.findInstanceTarget(config, patch.environmentTarget) : undefined;
        const nextName = cleanOptional(patch.name) || environment.name;
        if (nextName.toLowerCase() !== environment.name.toLowerCase()) {
            this.assertUniqueName(nextName, config.environments.filter((item) => item.id !== environment.id), 'environment');
        }
        const currentWorkflowsPath = cleanRequired(environment.workflowsPath, 'Workflows path');
        const workflowsPathPatch = this.patchWorkflowsPath(environment, patch);
        const workflowsPathChanged = workflowsPathPatch !== undefined
            && this.resolveWorkspacePath(workflowsPathPatch) !== this.resolveWorkspacePath(currentWorkflowsPath);
        if (workflowsPathChanged) {
            this.migrateWorkflowsPath(currentWorkflowsPath, workflowsPathPatch);
        }
        const nextEnvironment: IWorkspaceEnvironment = stripUndefined({
            ...environment,
            name: nextName,
            workflowsPath: workflowsPathPatch ?? environment.workflowsPath,
            legacyWorkflowDir: undefined,
            workflowDir: undefined,
            syncFolder: undefined,
            environmentTargetId: target?.id || environment.environmentTargetId,
            projectId: patch.projectId !== undefined ? cleanOptional(patch.projectId) : environment.projectId,
            projectName: patch.projectName !== undefined ? cleanOptional(patch.projectName) : environment.projectName,
            folderSync: patch.folderSync ?? environment.folderSync,
            customNodesPath: patch.customNodesPath ?? environment.customNodesPath,
            description: patch.description ?? environment.description,
            nativeMcp: patch.nativeMcp !== undefined ? this.sanitizeNativeMcpConfig(patch.nativeMcp) : environment.nativeMcp,
        });
        const next = {
            ...config,
            environments: config.environments.map((item) => item.id === environment.id ? nextEnvironment : item),
        };
        this.writeWorkspaceConfigV4(next);
        return nextEnvironment;
    }

    pinEnvironment(nameOrId: string): IWorkspaceEnvironment {
        const config = this.ensureV4WorkspaceConfig();
        const environment = this.findEnvironment(config, nameOrId);
        this.writeWorkspaceConfigV4({
            ...config,
            activeEnvironmentId: environment.id,
        });
        return environment;
    }

    removeEnvironment(nameOrId: string, options: { force?: boolean } = {}): IWorkspaceEnvironment {
        const config = this.ensureV4WorkspaceConfig();
        const environment = this.findEnvironment(config, nameOrId);
        if (config.activeEnvironmentId === environment.id && !options.force) {
            throw new Error(`Workspace environment "${environment.name}" is active. Pin another environment first, or re-run with --force to remove it and clear the active environment.`);
        }
        this.deleteNativeMcpToken(environment.id);
        const nextEnvironments = config.environments.filter((item) => item.id !== environment.id);
        this.writeWorkspaceConfigV4({
            ...config,
            activeEnvironmentId: config.activeEnvironmentId === environment.id ? undefined : config.activeEnvironmentId,
            environments: nextEnvironments,
        });
        return environment;
    }

    getEnvironment(nameOrId: string): IWorkspaceEnvironment {
        return this.findEnvironment(this.ensureV4WorkspaceConfig(), nameOrId);
    }

    getInstanceTarget(nameOrId: string): IEnvironmentTarget {
        return this.findInstanceTarget(this.ensureV4WorkspaceConfig(), nameOrId);
    }

    resolveEnvironment(environmentNameOrId?: string): IResolvedWorkspaceEnvironment {
        const config = this.readWorkspaceConfigFile();
        if (config.environments.length === 0) {
            throw new Error('No workspace environment is configured. Run `n8nac env add` first.');
        }
        const environment = environmentNameOrId
            ? this.findEnvironment(config, environmentNameOrId)
            : config.activeEnvironmentId
                ? this.findEnvironment(config, config.activeEnvironmentId)
                : config.environments[0];
        const target = this.findInstanceTarget(config, environment.environmentTargetId);
        return this.resolveEnvironmentFromTarget(environment, target, environmentNameOrId ? 'explicit' : 'workspace-default');
    }

    async prepareEnvironment(environmentNameOrId?: string): Promise<IResolvedWorkspaceEnvironment> {
        const resolved = this.resolveEnvironment(environmentNameOrId);
        if (resolved.sourceKind === 'external-instance') {
            if (resolved.apiKey && (!resolved.instanceIdentifier || !resolved.instanceUserIdentifier)) {
                const identity = await this.resolveN8nIdentity(resolved.host, resolved.apiKey, undefined, resolved.instanceIdentifier || resolved.environmentTargetId).catch(() => undefined);
                const instanceIdentifier = identity?.instanceIdentifier || resolved.instanceIdentifier;
                const instanceUserIdentifier = identity?.instanceUserIdentifier || resolved.instanceUserIdentifier;
                const workflowsPath = this.resolveEnvironmentWorkflowsPath(resolved.environment);
                return {
                    ...resolved,
                    workflowsPath,
                    syncFolder: workflowsPath,
                    instanceIdentifier,
                    instanceUserIdentifier,
                    workflowDir: workflowsPath,
                };
            }
            return resolved;
        }

        const prepared = await this.runtime.prepareEffectiveContext({
            instanceId: resolved.managedInstanceId,
            syncFolderDefault: 'global',
            consumer: 'cli',
            autoStart: true,
        });
        if (prepared.runtime.blocked) {
            throw new Error(prepared.runtime.blocked.message);
        }

        const context = prepared.context;
        const apiKey = resolved.apiKey || context.apiKey;
        const projectId = resolved.projectId || context.projectId;
        const projectName = resolved.projectName || context.projectName;
        let instanceIdentifier = this.canonicalWorkflowInstanceIdentifier((context as any).n8nInstanceIdentifier)
            || this.canonicalWorkflowInstanceIdentifier(context.instanceIdentifier)
            || resolved.instanceIdentifier;
        let instanceUserIdentifier = this.canonicalInstanceUserIdentifier((context as any).instanceUserIdentifier)
            || this.readStoredInstanceUserIdentifier(context.instanceIdentifier)
            || resolved.instanceUserIdentifier;
        if (apiKey && resolved.apiKeySource === 'env') {
            const identity = await this.resolveN8nIdentity(context.host, apiKey, undefined, instanceIdentifier || resolved.activeInstanceId || resolved.environmentTargetId).catch(() => undefined);
            instanceIdentifier = identity?.instanceIdentifier || instanceIdentifier;
            instanceUserIdentifier = identity?.instanceUserIdentifier || instanceUserIdentifier;
        }
        const workflowsPath = this.resolveEnvironmentWorkflowsPath(resolved.environment);
        return {
            ...resolved,
            host: context.host,
            apiKey,
            apiKeyAvailable: Boolean(apiKey),
            apiKeySource: resolved.apiKey ? resolved.apiKeySource : context.apiKey ? 'global' : 'missing',
            accessStatus: this.deriveAccessStatus({ host: context.host, apiKey, projectId, projectName, verification: resolved.apiKeySource === 'env' ? undefined : context.instance.verification }),
            activeInstanceId: context.activeInstanceId,
            activeInstanceName: context.activeInstanceName,
            instanceIdentifier,
            instanceUserIdentifier,
            projectId,
            projectName,
            workflowsPath,
            syncFolder: workflowsPath,
            workflowDir: workflowsPath,
        };
    }

    listInstanceConfigs(): IInstanceProfile[] {
        return this.listInstances();
    }

    listInstances(): IInstanceProfile[] {
        return this.manager.listInstances().map((instance) => this.toInstanceProfile(instance));
    }

    getInstanceConfig(instanceId: string): IInstanceProfile | undefined {
        return this.listInstances().find((instance) => instance.id === instanceId);
    }

    getInstance(instanceId: string): IInstanceProfile | undefined {
        return this.getInstanceConfig(instanceId);
    }

    getCurrentInstanceConfig(): IInstanceProfile | undefined {
        return this.getActiveInstance();
    }

    getActiveInstance(): IInstanceProfile | undefined {
        const effective = tryResolve(() => this.resolveEnvironment());
        if (effective?.sourceKind === 'managed-instance' && effective.activeInstanceId) {
            return this.getInstanceConfig(effective.activeInstanceId);
        }
        return undefined;
    }

    getEffectiveInstanceConfig(instanceId?: string): IInstanceProfile | undefined {
        if (instanceId) {
            const instance = this.manager.getInstance(instanceId);
            return instance ? this.toInstanceProfile(instance) : undefined;
        }
        const environment = tryResolve(() => this.resolveEnvironment());
        return environment ? this.environmentToInstanceProfile(environment) : undefined;
    }

    getEffectiveContext(instanceId?: string): EffectiveN8nContext | undefined {
        if (instanceId) {
            throw new Error('Explicit instance context is not supported with V4 workspace environments. Resolve a workspace environment instead.');
        }
        return this.resolvedEnvironmentToEffectiveContext(tryResolve(() => this.resolveEnvironment()));
    }

    async prepareWorkspaceContext(input?: string | { instanceId?: string; environment?: string; consumer?: 'cli' | 'vscode' | string }): Promise<EffectiveN8nContext> {
        const environment = typeof input === 'string' ? input : input?.environment;
        if (typeof input === 'object' && input?.instanceId) {
            throw new Error('Explicit instance context is not supported with V4 workspace environments. Resolve a workspace environment instead.');
        }
        if (typeof input === 'object' && input?.consumer && input.consumer !== 'cli') {
            throw new Error(`Unsupported workspace context consumer: ${input.consumer}`);
        }
        return this.resolvedEnvironmentToEffectiveContext(await this.prepareEnvironment(environment))!;
    }

    getCurrentInstanceConfigId(): string | undefined {
        return this.getActiveInstanceId();
    }

    getActiveInstanceId(): string | undefined {
        const environment = tryResolve(() => this.resolveEnvironment());
        return environment?.activeInstanceId;
    }

    getCurrentInstance(): IInstanceProfile | undefined {
        return this.getActiveInstance();
    }

    getCurrentInstanceId(): string | undefined {
        return this.getActiveInstanceId();
    }

    getCurrentInstanceProfile(): IInstanceProfile | undefined {
        return this.getActiveInstance();
    }

    setActiveInstance(instanceId: string): IInstanceProfile {
        return this.toInstanceProfile(this.manager.setGlobalActiveInstance(instanceId));
    }

    pinWorkspaceInstance(instanceId: string): IInstanceProfile {
        this.assertLegacyWorkspaceOverridesWritable();
        const instance = this.manager.getInstance(instanceId);
        if (!instance) {
            throw new Error(`Unknown global n8n-manager instance: ${instanceId}`);
        }
        const current = this.manager.readWorkspaceOverrides(this.workspaceRoot);
        this.manager.writeWorkspaceOverrides(this.workspaceRoot, {
            ...current,
            activeInstanceId: instance.id,
        });
        return this.toInstanceProfile(instance, this.manager.readWorkspaceOverrides(this.workspaceRoot));
    }

    clearWorkspaceInstanceOverride(): void {
        this.assertLegacyWorkspaceOverridesWritable();
        const current = this.manager.readWorkspaceOverrides(this.workspaceRoot);
        this.manager.writeWorkspaceOverrides(this.workspaceRoot, {
            ...current,
            activeInstanceId: undefined,
        });
    }

    setWorkspaceSyncFolder(syncFolder: string): void {
        this.assertLegacyWorkspaceOverridesWritable();
        const current = this.manager.readWorkspaceOverrides(this.workspaceRoot);
        this.manager.writeWorkspaceOverrides(this.workspaceRoot, {
            ...current,
            syncFolder,
        });
    }

    clearWorkspaceSyncFolderOverride(): void {
        this.assertLegacyWorkspaceOverridesWritable();
        const current = this.manager.readWorkspaceOverrides(this.workspaceRoot);
        this.manager.writeWorkspaceOverrides(this.workspaceRoot, {
            ...current,
            syncFolder: undefined,
        });
    }

    setWorkspaceProject(project: { projectId: string; projectName: string }): void {
        this.assertLegacyWorkspaceOverridesWritable();
        const current = this.manager.readWorkspaceOverrides(this.workspaceRoot);
        this.manager.writeWorkspaceOverrides(this.workspaceRoot, {
            ...current,
            projectId: project.projectId,
            projectName: project.projectName,
        });
    }

    clearWorkspaceProjectOverride(): void {
        this.assertLegacyWorkspaceOverridesWritable();
        const current = this.manager.readWorkspaceOverrides(this.workspaceRoot);
        this.manager.writeWorkspaceOverrides(this.workspaceRoot, {
            ...current,
            projectId: undefined,
            projectName: undefined,
        });
    }

    selectInstance(instanceId: string): IInstanceProfile {
        return this.setActiveInstance(instanceId);
    }

    selectInstanceConfig(instanceId: string): IInstanceProfile {
        return this.setActiveInstance(instanceId);
    }

    selectInstanceProfile(instanceId: string): IInstanceProfile {
        return this.setActiveInstance(instanceId);
    }

    async selectInstanceConfigWithVerification(instanceId: string): Promise<ISelectInstanceResult> {
        const selected = this.setActiveInstance(instanceId);
        return {
            status: 'selected',
            profile: selected,
            verificationStatus: selected.verification?.status || 'unverified',
        };
    }

    createInstance(config: Partial<ILocalConfig>, options: { instanceName?: string; setActive?: boolean } = {}): IInstanceProfile {
        return this.createInstanceConfig(config, options);
    }

    createInstanceConfig(config: Partial<ILocalConfig>, options: { instanceName?: string; setActive?: boolean } = {}): IInstanceProfile {
        return this.saveLocalConfig(config, { ...options, createNew: true });
    }

    updateInstance(config: Partial<ILocalConfig>, options: { instanceId?: string; instanceName?: string; setActive?: boolean } = {}): IInstanceProfile {
        return this.updateInstanceConfig(config, options);
    }

    updateInstanceConfig(config: Partial<ILocalConfig>, options: { instanceId?: string; instanceName?: string; setActive?: boolean } = {}): IInstanceProfile {
        return this.saveLocalConfig(config, options);
    }

    async upsertInstanceConfigWithVerification(
        input: IUpsertInstanceConfigInput,
        options: {
            instanceId?: string;
            instanceName?: string;
            setActive?: boolean;
            createNew?: boolean;
            client?: IInstanceVerificationClient;
            persistCredentials?: boolean;
            preferStoredApiKey?: boolean;
        } = {}
    ): Promise<IUpsertInstanceConfigResult> {
        const verification = input.host && input.apiKey
            ? await this.verifyConnection(input.host, input.apiKey, options.client)
            : undefined;
        const identity = input.host && input.apiKey
            ? await this.resolveN8nIdentity(input.host, input.apiKey, options.client).catch(() => undefined)
            : undefined;
        const instanceIdentifier = input.host && input.apiKey
            ? await this.resolveInstanceIdentifier(input.host, input.apiKey, options.client)
            : this.canonicalInstanceIdentifier(input.instanceIdentifier);
        const profile = this.saveLocalConfig({
            ...input,
            instanceIdentifier,
            instanceUserIdentifier: identity?.instanceUserIdentifier || input.instanceUserIdentifier,
        }, {
            instanceId: options.createNew ? undefined : options.instanceId,
            instanceName: options.instanceName,
            setActive: options.setActive,
            apiKey: options.persistCredentials === false ? undefined : input.apiKey,
            verification,
        });

        return {
            status: 'saved',
            profile,
            verificationStatus: profile.verification?.status || 'unverified',
        };
    }

    deleteInstance(instanceId: string): { deletedInstance: IInstanceProfile; activeInstance?: IInstanceProfile } {
        return this.deleteInstanceConfig(instanceId);
    }

    deleteInstanceConfig(instanceId: string): { deletedInstance: IInstanceProfile; activeInstance?: IInstanceProfile } {
        const result = this.manager.deleteInstance(instanceId);
        return {
            deletedInstance: this.toInstanceProfile(result.deletedInstance),
            activeInstance: result.activeInstance ? this.toInstanceProfile(result.activeInstance) : undefined,
        };
    }

    saveLocalConfig(
        config: Partial<ILocalConfig>,
        options: { instanceId?: string; instanceName?: string; setActive?: boolean; createNew?: boolean; apiKey?: string; verification?: IInstanceVerification } = {}
    ): IInstanceProfile {
        const current = (options.createNew ? undefined : (options.instanceId ? this.manager.getInstance(options.instanceId) : this.manager.getGlobalActiveInstance())) as GlobalN8nInstanceWithUserIdentifier | undefined;
        const host = this.resolveStoredBaseUrl(current, config.host);
        const input: UpsertGlobalN8nInstanceInputWithUserIdentifier = {
            id: options.createNew ? undefined : (options.instanceId || current?.id),
            name: options.instanceName || current?.name || host,
            mode: current?.mode || 'existing',
            baseUrl: host,
            apiKey: options.apiKey,
            instanceIdentifier: this.canonicalInstanceIdentifier(config.instanceIdentifier || current?.instanceIdentifier),
            instanceUserIdentifier: this.canonicalInstanceUserIdentifier(config.instanceUserIdentifier || current?.instanceUserIdentifier)
                || this.readStoredInstanceUserIdentifier(config.instanceIdentifier || current?.instanceIdentifier),
            verification: options.verification || current?.verification,
            defaultProject: current?.defaultProject,
        };
        const saved = this.manager.upsertInstance(input, {
            setActive: options.setActive,
        });
        if (options.apiKey) {
            this.manager.saveApiKey(saved.id, options.apiKey);
        }

        return this.toInstanceProfile(saved);
    }

    saveInstanceProfile(profile: Partial<IInstanceProfile>, options: { setActive?: boolean; createNew?: boolean } = {}): IInstanceProfile {
        return this.saveLocalConfig(profile, {
            instanceId: options.createNew ? undefined : profile.id,
            instanceName: profile.name,
            setActive: options.setActive,
            createNew: options.createNew,
        });
    }

    saveBootstrapState(host: string, syncFolder = DEFAULT_SYNC_FOLDER, options: { instanceId?: string; instanceName?: string; createNew?: boolean } = {}): IInstanceProfile {
        return this.saveLocalConfig({ host, syncFolder }, {
            instanceId: options.instanceId,
            instanceName: options.instanceName,
            createNew: options.createNew,
            setActive: true,
        });
    }

    async verifyInstanceConfig(instanceId: string): Promise<
        | ({ status: 'verified'; instance: IInstanceProfile; normalizedHost: string; userId: string; userName?: string; userEmail?: string; instanceIdentifier: string })
        | ({ status: 'failed'; instance: IInstanceProfile; error: string })
        | ({ status: 'duplicate'; instance: IInstanceProfile; duplicateInstance: IInstanceProfile; normalizedHost: string; userId: string; userName?: string; userEmail?: string })
        | ({ status: 'skipped'; instance: IInstanceProfile; reason: string })
    > {
        const instance = this.getInstanceConfig(instanceId);
        if (!instance) throw new Error(`Unknown global n8n-manager instance: ${instanceId}`);
        if (!instance.host) return { status: 'skipped', instance, reason: 'Missing host' };
        const apiKey = this.getApiKey(instance.host, instance.id);
        if (!apiKey) return { status: 'skipped', instance, reason: 'Missing API key' };

        const verification = await this.verifyConnection(instance.host, apiKey);
        const instanceIdentifier = await this.resolveInstanceIdentifier(instance.host, apiKey);
        const identity = await this.resolveN8nIdentity(instance.host, apiKey).catch(() => undefined);
        const input: UpsertGlobalN8nInstanceInputWithUserIdentifier = {
            id: instance.id,
            name: instance.name,
            baseUrl: instance.host,
            instanceIdentifier,
            instanceUserIdentifier: identity?.instanceUserIdentifier,
            verification,
        };
        const updated = this.manager.upsertInstance(input, { setActive: instance.id === this.getActiveInstanceId() });
        const profile = this.toInstanceProfile(updated);

        if (verification.status === 'verified') {
            return {
                status: 'verified',
                instance: profile,
                normalizedHost: verification.normalizedHost || '',
                userId: verification.userId || '',
                userName: verification.userName,
                userEmail: verification.userEmail,
                instanceIdentifier: profile.instanceIdentifier || '',
            };
        }

        return { status: 'failed', instance: profile, error: verification.lastError || 'Verification failed' };
    }

    getApiKey(host: string, instanceId?: string): string | undefined {
        if (instanceId) {
            return this.manager.getApiKey(instanceId);
        }
        const normalized = this.normalizeHost(host);
        const instances = this.manager.listInstances().filter((candidate) => {
            return this.normalizeHost(candidate.baseUrl || '') === normalized
                || this.normalizeHost(candidate.tunnelPublicUrl || '') === normalized;
        });
        for (const instance of instances) {
            const apiKey = this.manager.getApiKey(instance.id);
            if (apiKey) return apiKey;
        }
        return undefined;
    }

    saveApiKey(host: string, apiKey: string, instanceId?: string): void {
        const target = instanceId
            ? this.manager.getInstance(instanceId)
            : this.manager.listInstances().find((candidate) => this.normalizeHost(candidate.baseUrl || '') === this.normalizeHost(host));
        const instanceIdentifier = this.resolveInstanceIdentifierFromApiKey(apiKey);
        const instanceUserIdentifier = this.resolveInstanceUserIdentifierFromApiKey(apiKey);
        if (!instanceIdentifier) {
            throw new Error('Unable to resolve the n8n user ID from the API key.');
        }
        if (target) {
            this.manager.saveApiKey(target.id, apiKey);
            const input: UpsertGlobalN8nInstanceInputWithUserIdentifier = {
                id: target.id,
                instanceIdentifier,
                instanceUserIdentifier,
            };
            this.manager.upsertInstance(input, { setActive: false });
            return;
        }
        const input: UpsertGlobalN8nInstanceInputWithUserIdentifier = { baseUrl: host, apiKey, instanceIdentifier, instanceUserIdentifier };
        const saved = this.manager.upsertInstance(input, { setActive: true });
        this.manager.saveApiKey(saved.id, apiKey);
    }

    getWorkspaceTargetApiKey(targetId: string): string | undefined {
        const target = this.getInstanceTarget(targetId);
        return this.manager.getApiKey(target.id);
    }

    saveWorkspaceTargetApiKey(targetId: string, apiKey: string): void {
        const target = this.getInstanceTarget(targetId);
        this.manager.saveApiKey(target.id, apiKey);
    }

    getNativeMcpToken(environmentNameOrId?: string): string | undefined {
        const environment = environmentNameOrId
            ? this.findEnvironment(this.ensureV4WorkspaceConfig(), environmentNameOrId)
            : this.resolveEnvironment().environment;
        return this.manager.getApiKey(this.nativeMcpSecretKey(environment.id));
    }

    saveNativeMcpToken(environmentNameOrId: string, token: string): void {
        const environment = this.findEnvironment(this.ensureV4WorkspaceConfig(), environmentNameOrId);
        this.manager.saveApiKey(this.nativeMcpSecretKey(environment.id), cleanRequired(token, 'Native n8n MCP token'));
    }

    deleteNativeMcpToken(environmentNameOrId: string): void {
        try {
            const environment = this.findEnvironment(this.ensureV4WorkspaceConfig(), environmentNameOrId);
            this.manager.deleteApiKey(this.nativeMcpSecretKey(environment.id));
        } catch {
            this.manager.deleteApiKey(this.nativeMcpSecretKey(environmentNameOrId));
        }
    }

    upsertRemoteInstancePreset(input: { host: string; apiKey?: string; name?: string }): IInstanceProfile {
        const host = cleanRequired(input.host, 'n8n URL');
        const normalized = this.normalizeHost(host);
        const externalInstance = this.manager.listInstances().find((candidate) => {
            return candidate.mode !== 'managed-local-docker'
                && (this.normalizeHost(candidate.baseUrl || '') === normalized || this.normalizeHost(candidate.tunnelPublicUrl || '') === normalized);
        });
        const instanceIdentifier = input.apiKey ? this.resolveInstanceIdentifierFromApiKey(input.apiKey) : undefined;
        const instanceUserIdentifier = input.apiKey ? this.resolveInstanceUserIdentifierFromApiKey(input.apiKey) : undefined;
        const externalInstanceWithUserIdentifier = externalInstance as GlobalN8nInstanceWithUserIdentifier | undefined;
        const upsertInput: UpsertGlobalN8nInstanceInputWithUserIdentifier = {
            id: externalInstance?.id,
            name: input.name || externalInstance?.name || host,
            mode: 'existing',
            baseUrl: host,
            apiKey: input.apiKey,
            instanceIdentifier: instanceIdentifier || externalInstance?.instanceIdentifier,
            instanceUserIdentifier: instanceUserIdentifier || externalInstanceWithUserIdentifier?.instanceUserIdentifier,
            defaultProject: externalInstance?.defaultProject,
            verification: externalInstance?.verification,
        };
        const saved = this.manager.upsertInstance(upsertInput, { setActive: false });
        return this.toInstanceProfile(saved);
    }

    getApiKeyForActiveInstance(): string | undefined {
        const active = this.getActiveInstance();
        return active ? this.manager.getApiKey(active.id) : undefined;
    }

    hasConfig(): boolean {
        const active = this.getActiveInstance();
        return !!(active?.host && this.manager.getApiKey(active.id));
    }

    async getOrCreateInstanceIdentifier(host: string, instanceId?: string): Promise<string> {
        const active = instanceId ? this.manager.getInstance(instanceId) : this.manager.getGlobalActiveInstance();
        if (isCanonicalUserInstanceIdentifier(active?.instanceIdentifier)) {
            return active!.instanceIdentifier!;
        }
        const apiKey = active ? this.manager.getApiKey(active.id) : this.getApiKey(host, instanceId);
        if (!apiKey) {
            throw new Error('API key not found');
        }
        const identifier = await this.resolveInstanceIdentifier(host, apiKey);
        const instanceUserIdentifier = this.resolveInstanceUserIdentifierFromApiKey(apiKey) || identifier;
        const input: UpsertGlobalN8nInstanceInputWithUserIdentifier = {
            id: active?.id || instanceId,
            name: active?.name || host,
            baseUrl: active?.baseUrl || host,
            instanceIdentifier: identifier,
            instanceUserIdentifier,
        };
        const saved = this.manager.upsertInstance(input, { setActive: true });
        return saved.instanceIdentifier || identifier;
    }

    getInstanceConfigPath(): string {
        return this.manager.getWorkspaceConfigPath(this.workspaceRoot);
    }

    getWorkspaceRoot(): string {
        return this.workspaceRoot;
    }

    resolveWorkspacePath(targetPath: string): string {
        return path.isAbsolute(targetPath)
            ? targetPath
            : path.resolve(this.workspaceRoot, targetPath);
    }

    private readWorkspaceConfigFile(): IPersistedWorkspaceConfigV4 {
        const configPath = this.getInstanceConfigPath();
        if (!fs.existsSync(configPath)) return { version: 4, environmentTargets: [], environments: [] };
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (raw?.version === 4) {
            return this.sanitizeV4Config(raw);
        }
        const version = raw?.version === undefined ? 'missing' : String(raw.version);
        throw new Error(`Unsupported n8nac workspace config version: ${version}. Recreate a V4 workspace environment with \`n8nac env add <name> --base-url <url> --workflows-path workflows/<name>\`.`);
    }

    isWorkspaceConfigV4(): boolean {
        const configPath = this.getInstanceConfigPath();
        if (!fs.existsSync(configPath)) return false;
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return raw?.version === 4;
    }

    private assertLegacyWorkspaceOverridesWritable(): void {
        throw new Error('Legacy workspace singleton commands are not supported. Use `n8nac env ...` with V4 workspace environments.');
    }

    private ensureV4WorkspaceConfig(): IPersistedWorkspaceConfigV4 {
        return this.readWorkspaceConfigFile();
    }

    private sanitizeV4Config(raw: any): IPersistedWorkspaceConfigV4 {
        const rawTargets = Array.isArray(raw.environmentTargets) ? raw.environmentTargets : raw.instanceTargets;
        if (!Array.isArray(rawTargets)) {
            throw new Error('Invalid v4 workspace config: environmentTargets must be an array.');
        }
        if (!Array.isArray(raw.environments)) {
            throw new Error('Invalid v4 workspace config: environments must be an array.');
        }
        const rawInstanceTargets = rawTargets as unknown[];
        const rawEnvironments = raw.environments as unknown[];
        const environmentTargets = rawInstanceTargets.map((target, index) => this.sanitizeInstanceTarget(target, index));
        const environments = this.ensureEnvironmentWorkflowsPaths(rawEnvironments.map((environment, index) => this.sanitizeEnvironment(environment, index)));
        this.assertUniqueIds(environmentTargets, 'instance target');
        this.assertUniqueIdsAndNames(environments, 'environment');
        const targetIds = new Set(environmentTargets.map((target) => target.id));
        for (const environment of environments) {
            if (!targetIds.has(environment.environmentTargetId)) {
                throw new Error(`Invalid v4 workspace config: environment "${environment.name}" references unknown instance target "${environment.environmentTargetId}".`);
            }
        }
        if (typeof raw.activeEnvironmentId === 'string' && raw.activeEnvironmentId && !environments.some((environment) => environment.id === raw.activeEnvironmentId)) {
            throw new Error(`Invalid v4 workspace config: activeEnvironmentId references unknown environment "${raw.activeEnvironmentId}".`);
        }
        return stripUndefined({
            version: 4 as const,
            activeEnvironmentId: typeof raw.activeEnvironmentId === 'string' ? raw.activeEnvironmentId : undefined,
            environmentTargets,
            environments,
        });
    }

    private sanitizeInstanceTarget(target: any, index: number): IEnvironmentTarget {
        if (!target || typeof target !== 'object') {
            throw new Error(`Invalid v4 workspace config: instance target at index ${index} must be an object.`);
        }
        const id = cleanOptional(target.id);
        const name = cleanOptional(target.name) || id;
        if (!id || !name) {
            throw new Error(`Invalid v4 workspace config: instance target at index ${index} needs id and name.`);
        }
        const kind = target.kind === 'global-ref' ? 'managed-instance' : target.kind === 'embedded' ? 'external-instance' : target.kind;
        if (kind === 'managed-instance') {
            if (target.instance) throw new Error(`Invalid v4 workspace config: managedInstance target "${name}" must not embed instance details.`);
            const managedInstanceId = cleanOptional(target.managedInstanceId) || cleanOptional(target.instanceRef);
            if (!managedInstanceId) throw new Error(`Invalid v4 workspace config: managedInstance target "${name}" needs managedInstanceId.`);
            return stripUndefined({ id, name, kind: 'managed-instance' as const, managedInstanceId, description: cleanOptional(target.description) });
        }
        if (kind === 'external-instance') {
            if (target.managedInstanceId) throw new Error(`Invalid v4 workspace config: externalInstance target "${name}" must not define managedInstanceId.`);
            if (target.instance?.apiKey || target.instance?.token || target.instance?.password || target.apiKey || target.token || target.password) {
                throw new Error(`Invalid v4 workspace config: externalInstance target "${name}" must not contain secrets.`);
            }
            const url = cleanOptional(target.url) || cleanOptional(target.instance?.url) || cleanOptional(target.instance?.baseUrl);
            if (!url) throw new Error(`Invalid v4 workspace config: externalInstance target "${name}" needs url.`);
            return stripUndefined({
                id,
                name,
                kind: 'external-instance' as const,
                url,
                instanceIdentifier: this.canonicalWorkflowInstanceIdentifier(target.instanceIdentifier || target.instance?.instanceIdentifier)
                    || cleanOptional(target.instanceIdentifier || target.instance?.instanceIdentifier),
                instanceUserIdentifier: this.readStoredInstanceUserIdentifier(
                    target.instanceUserIdentifier || target.instance?.instanceUserIdentifier || target.instanceIdentifier || target.instance?.instanceIdentifier,
                ) || cleanOptional(target.instanceUserIdentifier || target.instance?.instanceUserIdentifier),
                verification: target.verification || target.instance?.verification,
                description: cleanOptional(target.description),
            });
        }
        throw new Error(`Invalid v4 workspace config: instance target "${name}" has unsupported kind "${String(target.kind)}".`);
    }

    private assertUniqueIdsAndNames<T extends { id: string; name: string }>(items: T[], label: string): void {
        this.assertUniqueIds(items, label);
        const names = new Set<string>();
        for (const item of items) {
            const name = item.name.toLowerCase();
            if (names.has(name)) throw new Error(`Invalid v4 workspace config: duplicate ${label} name "${item.name}".`);
            names.add(name);
        }
    }

    private assertUniqueIds<T extends { id: string }>(items: T[], label: string): void {
        const ids = new Set<string>();
        for (const item of items) {
            if (ids.has(item.id)) throw new Error(`Invalid v4 workspace config: duplicate ${label} ID "${item.id}".`);
            ids.add(item.id);
        }
    }

    private ensureEnvironmentWorkflowsPaths(environments: IWorkspaceEnvironment[]): IWorkspaceEnvironment[] {
        const usedSlugs = new Set<string>();
        const normalized = environments.map((environment) => {
            const syncSlug = environment.syncSlug
                ? this.createEnvironmentSyncSlug(environment.syncSlug)
                : undefined;
            if (syncSlug) {
                const key = syncSlug.toLowerCase();
                if (usedSlugs.has(key)) {
                    throw new Error(`Invalid v4 workspace config: duplicate environment sync slug "${syncSlug}".`);
                }
                usedSlugs.add(key);
            }
            return { ...environment, syncSlug };
        });

        return normalized.map((environment) => {
            const syncSlug = environment.syncSlug || this.uniqueEnvironmentSyncSlug(environment.name, [], usedSlugs);
            usedSlugs.add(syncSlug.toLowerCase());
            const workflowsPath = environment.workflowsPath
                || this.resolveInputWorkflowsPath({ syncFolder: environment.syncFolder, syncSlug }, environments, environment.name);
            return stripUndefined({ ...environment, syncSlug, workflowsPath, workflowDir: undefined });
        });
    }

    private sanitizeEnvironment(environment: any, index: number): IWorkspaceEnvironment {
        if (!environment || typeof environment !== 'object') {
            throw new Error(`Invalid v4 workspace config: environment at index ${index} must be an object.`);
        }
        const id = cleanOptional(environment.id);
        const name = cleanOptional(environment.name) || id;
        const environmentTargetId = cleanOptional(environment.environmentTargetId) || cleanOptional(environment.instanceTargetId);
        const workflowsPath = cleanOptional(environment.workflowsPath) || cleanOptional(environment.workflowDir);
        const syncFolder = cleanOptional(environment.syncFolder);
        if (!id || !name || !environmentTargetId || (!workflowsPath && !syncFolder)) {
            throw new Error(`Invalid v4 workspace config: environment at index ${index} needs id, name, environmentTargetId, and workflowsPath.`);
        }
        return stripUndefined({
            id,
            name,
            syncSlug: cleanOptional(environment.syncSlug),
            legacyWorkflowDir: cleanOptional(environment.legacyWorkflowDir),
            environmentTargetId,
            projectId: cleanOptional(environment.projectId),
            projectName: cleanOptional(environment.projectName),
            workflowsPath,
            syncFolder,
            folderSync: typeof environment.folderSync === 'boolean' ? environment.folderSync : undefined,
            customNodesPath: cleanOptional(environment.customNodesPath),
            description: cleanOptional(environment.description),
            nativeMcp: this.sanitizeNativeMcpConfig(environment.nativeMcp),
        });
    }

    private sanitizeNativeMcpConfig(nativeMcp: unknown): IWorkspaceNativeMcpConfig | undefined {
        if (nativeMcp === undefined || nativeMcp === null) return undefined;
        if (!nativeMcp || typeof nativeMcp !== 'object' || Array.isArray(nativeMcp)) {
            throw new Error('Invalid v4 workspace config: environment nativeMcp must be an object.');
        }
        this.assertNoNativeMcpSecrets(nativeMcp);
        const input = nativeMcp as Record<string, unknown>;
        const url = cleanOptional(input.url);
        if (url) {
            this.assertNativeMcpUrl(url);
        }
        const timeoutMs = this.parseOptionalPositiveInteger(input.timeoutMs, 'nativeMcp.timeoutMs');
        const mode: IWorkspaceNativeMcpMode | undefined = input.mode === 'direct' ? 'direct' : input.mode === 'assist' ? 'assist' : undefined;
        return stripUndefined({
            enabled: typeof input.enabled === 'boolean' ? input.enabled : url ? true : undefined,
            url,
            mode,
            timeoutMs,
            allowRemoteExposure: typeof input.allowRemoteExposure === 'boolean' ? input.allowRemoteExposure : undefined,
            allowExecutionData: typeof input.allowExecutionData === 'boolean' ? input.allowExecutionData : undefined,
            requireSyncBack: typeof input.requireSyncBack === 'boolean' ? input.requireSyncBack : undefined,
        });
    }

    private assertNoNativeMcpSecrets(value: unknown, pathLabel = 'nativeMcp'): void {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return;
        const secretKeys = new Set(['token', 'apikey', 'api_key', 'password', 'secret', 'authorization', 'bearertoken', 'access_token', 'accesstoken', 'clientsecret', 'client_secret']);
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
            if (secretKeys.has(key.toLowerCase())) {
                throw new Error(`Invalid v4 workspace config: ${pathLabel}.${key} must not contain secrets.`);
            }
            this.assertNoNativeMcpSecrets(child, `${pathLabel}.${key}`);
        }
    }

    private assertNativeMcpUrl(url: string): void {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            throw new Error(`Invalid v4 workspace config: nativeMcp.url must be a valid HTTP URL.`);
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new Error(`Invalid v4 workspace config: nativeMcp.url must use http or https.`);
        }
    }

    private parseOptionalPositiveInteger(value: unknown, label: string): number | undefined {
        if (value === undefined || value === null || value === '') return undefined;
        const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            throw new Error(`Invalid v4 workspace config: ${label} must be a positive integer.`);
        }
        return parsed;
    }

    private writeWorkspaceConfigV4(config: IPersistedWorkspaceConfigV4): void {
        const configPath = this.getInstanceConfigPath();
        const sanitized = this.sanitizeV4Config({ ...config, version: 4 });
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf8');
    }

    private findEnvironment(config: IPersistedWorkspaceConfigV4, nameOrId: string): IWorkspaceEnvironment {
        const key = cleanRequired(nameOrId, 'Environment');
        const byId = config.environments.find((environment) => environment.id === key);
        if (byId) return byId;
        const matches = config.environments.filter((environment) => environment.name.toLowerCase() === key.toLowerCase());
        if (matches.length === 1) return matches[0];
        if (matches.length > 1) throw new Error(`Ambiguous environment name: ${key}`);
        throw new Error(`Unknown workspace environment: ${key}`);
    }

    private findInstanceTarget(config: IPersistedWorkspaceConfigV4, nameOrId: string): IEnvironmentTarget {
        const key = cleanRequired(nameOrId, 'Instance target');
        const byId = config.environmentTargets.find((target) => target.id === key);
        if (byId) return byId;
        const matches = config.environmentTargets.filter((target) => target.name.toLowerCase() === key.toLowerCase());
        if (matches.length === 1) return matches[0];
        if (matches.length > 1) throw new Error(`Ambiguous instance target name: ${key}`);
        throw new Error(`Unknown workspace instance target: ${key}`);
    }

    private resolveManagedEnvironmentIdentity(instance: GlobalN8nInstance, host: string, apiKey?: string): Pick<IResolvedWorkspaceEnvironment, 'instanceIdentifier' | 'instanceUserIdentifier'> {
        const instanceAny = instance as GlobalN8nInstance & { instanceUserIdentifier?: string; n8nInstanceIdentifier?: string; n8nInstanceId?: string };
        const instanceIdentifier = this.canonicalWorkflowInstanceIdentifier(instanceAny.n8nInstanceIdentifier)
            || this.canonicalWorkflowInstanceIdentifier(instanceAny.instanceIdentifier)
            || this.readInstanceIdentifierFromSeed(instanceAny.n8nInstanceId || instance.id || host);
        const instanceUserIdentifier = this.canonicalInstanceUserIdentifier(instanceAny.instanceUserIdentifier)
            || this.readStoredInstanceUserIdentifier(instance.instanceIdentifier)
            || this.readInstanceUserIdentifierFromUserId(instance.verification?.userId)
            || (apiKey ? this.resolveInstanceUserIdentifierFromApiKey(apiKey) : undefined);
        return stripUndefined({ instanceIdentifier, instanceUserIdentifier });
    }

    private resolveExternalEnvironmentIdentity(target: IExternalEnvironmentTarget, apiKey?: string): Pick<IResolvedWorkspaceEnvironment, 'instanceIdentifier' | 'instanceUserIdentifier'> {
        const targetAny = target as IExternalEnvironmentTarget & { n8nInstanceIdentifier?: string; n8nInstanceId?: string };
        const instanceIdentifier = this.canonicalWorkflowInstanceIdentifier(targetAny.n8nInstanceIdentifier)
            || this.canonicalWorkflowInstanceIdentifier(target.instanceIdentifier)
            || this.readInstanceIdentifierFromSeed(targetAny.n8nInstanceId || target.url);
        const instanceUserIdentifier = this.canonicalInstanceUserIdentifier(target.instanceUserIdentifier)
            || this.readStoredInstanceUserIdentifier(target.instanceIdentifier)
            || this.readInstanceUserIdentifierFromUserId(target.verification?.userId)
            || (apiKey ? this.resolveInstanceUserIdentifierFromApiKey(apiKey) : undefined);
        return stripUndefined({ instanceIdentifier, instanceUserIdentifier });
    }

    private resolveEnvironmentFromTarget(environment: IWorkspaceEnvironment, target: IEnvironmentTarget, source: IResolvedWorkspaceEnvironment['sources']['environment']): IResolvedWorkspaceEnvironment {
        if (target.kind === 'managed-instance') {
            const instance = this.manager.getInstance(target.managedInstanceId);
            if (!instance) throw new Error(`Workspace environment "${environment.name}" references missing global n8n-manager instance: ${target.managedInstanceId}`);
            const host = instance.baseUrl || instance.tunnelPublicUrl || '';
            const envApiKey = this.readEnvApiKey(environment, target);
            const globalApiKey = this.manager.getApiKey(instance.id);
            const apiKey = envApiKey || globalApiKey;
            const projectId = environment.projectId || instance.defaultProject?.id;
            const projectName = environment.projectName || instance.defaultProject?.name;
            const identity = this.resolveManagedEnvironmentIdentity(instance, host, apiKey);
            const workflowsPath = this.resolveEnvironmentWorkflowsPath(environment);
            const syncFolder = workflowsPath;
            return {
                environment,
                environmentTarget: target,
                environmentId: environment.id,
                environmentName: environment.name,
                environmentTargetId: target.id,
                environmentTargetName: target.name,
                activeInstanceId: instance.id,
                activeInstanceName: instance.name,
                sourceKind: 'managed-instance',
                managedInstanceId: instance.id,
                instance: this.toInstanceProfile(instance),
                host,
                apiKey,
                apiKeySource: envApiKey ? 'env' : globalApiKey ? 'global' : 'missing',
                apiKeyAvailable: Boolean(apiKey),
                accessStatus: this.deriveAccessStatus({ host, apiKey, projectId, projectName, verification: envApiKey ? undefined : instance.verification }),
                nativeMcp: this.nativeMcpToSnapshot(environment.nativeMcp, environment.id),
                workflowsPath,
                syncFolder,
                projectId,
                projectName,
                instanceIdentifier: identity.instanceIdentifier,
                instanceUserIdentifier: identity.instanceUserIdentifier,
                workflowDir: workflowsPath,
                folderSync: environment.folderSync ?? false,
                customNodesPath: environment.customNodesPath,
                sources: {
                    environment: source,
                    instance: 'managed-instance',
                    project: environment.projectId || environment.projectName ? 'environment' : instance.defaultProject ? 'instance-default' : 'missing',
                    syncFolder: 'environment',
                },
            };
        }

        const host = target.url;
        const envApiKey = this.readEnvApiKey(environment, target);
        const workspaceApiKey = this.manager.getApiKey(target.id);
        const globalApiKey = this.getApiKey(host);
        const apiKey = envApiKey || workspaceApiKey || globalApiKey;
        const identity = this.resolveExternalEnvironmentIdentity(target, apiKey);
        const workflowsPath = this.resolveEnvironmentWorkflowsPath(environment);
        const syncFolder = workflowsPath;
        return {
            environment,
            environmentTarget: target,
            environmentId: environment.id,
            environmentName: environment.name,
            environmentTargetId: target.id,
            environmentTargetName: target.name,
            activeInstanceName: target.name,
            sourceKind: 'external-instance',
            instance: target,
            host,
            apiKey,
            apiKeySource: envApiKey ? 'env' : workspaceApiKey ? 'workspace-local' : globalApiKey ? 'global' : 'missing',
            apiKeyAvailable: Boolean(apiKey),
            accessStatus: this.deriveAccessStatus({ host, apiKey, projectId: environment.projectId, projectName: environment.projectName, verification: target.verification }),
            nativeMcp: this.nativeMcpToSnapshot(environment.nativeMcp, environment.id),
            workflowsPath,
            syncFolder,
            projectId: environment.projectId,
            projectName: environment.projectName,
            instanceIdentifier: identity.instanceIdentifier,
            instanceUserIdentifier: identity.instanceUserIdentifier,
            workflowDir: workflowsPath,
            folderSync: environment.folderSync ?? false,
            customNodesPath: environment.customNodesPath,
            sources: {
                environment: source,
                instance: 'external-instance',
                project: environment.projectId || environment.projectName ? 'environment' : 'missing',
                syncFolder: 'environment',
            },
        };
    }

    private readEnvApiKey(environment: IWorkspaceEnvironment, target: IEnvironmentTarget): string | undefined {
        const candidates = [
            `N8NAC_ENV_${envVarSlug(environment.id)}_API_KEY`,
            `N8NAC_ENV_${envVarSlug(environment.name)}_API_KEY`,
            `N8NAC_TARGET_${envVarSlug(target.id)}_API_KEY`,
        ];
        if (this.isUniqueInstanceTargetName(target)) {
            candidates.push(`N8NAC_TARGET_${envVarSlug(target.name)}_API_KEY`);
        }
        for (const key of candidates) {
            const value = process.env[key]?.trim().replace(/^['"]|['"]$/g, '');
            if (value) return value;
        }
        return undefined;
    }

    private readTargetEnvApiKey(target: IEnvironmentTarget): string | undefined {
        const candidates = [
            `N8NAC_TARGET_${envVarSlug(target.id)}_API_KEY`,
        ];
        if (this.isUniqueInstanceTargetName(target)) {
            candidates.push(`N8NAC_TARGET_${envVarSlug(target.name)}_API_KEY`);
        }
        for (const key of candidates) {
            const value = process.env[key]?.trim().replace(/^["']|["']$/g, '');
            if (value) return value;
        }
        return undefined;
    }

    private isUniqueInstanceTargetName(target: IEnvironmentTarget): boolean {
        const name = target.name.toLowerCase();
        const config = this.ensureV4WorkspaceConfig();
        return config.environmentTargets.filter((item) => item.name.toLowerCase() === name).length === 1;
    }

    private resolveExistingGlobalInstanceRef(managedInstanceId: unknown): string {
        const cleaned = cleanRequired(managedInstanceId, 'Global instance reference');
        const instance = this.manager.getInstance(cleaned);
        if (!instance) {
            throw new Error(`Unknown global n8n-manager instance: ${cleaned}`);
        }
        return instance.id;
    }

    private environmentToLocalConfig(environment: IResolvedWorkspaceEnvironment): Partial<ILocalConfig> {
        return stripUndefined({
            host: environment.host,
            workflowsPath: environment.workflowsPath,
            workflowDir: environment.workflowsPath,
            syncFolder: environment.workflowsPath,
            projectId: environment.projectId,
            projectName: environment.projectName,
            instanceIdentifier: environment.instanceIdentifier,
            instanceUserIdentifier: environment.instanceUserIdentifier,
            customNodesPath: environment.customNodesPath,
            folderSync: environment.folderSync,
        });
    }

    private environmentToSnapshot(environment: IWorkspaceEnvironment): IWorkspaceEnvironment {
        const resolved = tryResolve(() => this.resolveEnvironment(environment.id));
        if (!resolved) {
            return {
                ...environment,
                apiKeyAvailable: false,
                credentialSource: 'missing',
                accessStatus: 'unknown',
            };
        }
        return stripUndefined({
            ...environment,
            sourceKind: resolved.sourceKind,
            environmentTargetName: resolved.environmentTargetName,
            managedInstanceId: resolved.managedInstanceId,
            instanceName: resolved.activeInstanceName,
            url: resolved.sourceKind === 'external-instance' ? resolved.host : undefined,
            workflowsPathResolved: resolved.workflowsPath,
            workflowDir: resolved.workflowsPath,
            instanceIdentifier: resolved.instanceIdentifier,
            instanceUserIdentifier: resolved.instanceUserIdentifier,
            apiKeyAvailable: resolved.apiKeyAvailable,
            credentialSource: resolved.apiKeySource,
            accessStatus: resolved.accessStatus,
            nativeMcp: this.nativeMcpToSnapshot(environment.nativeMcp, environment.id),
        });
    }

    private nativeMcpToSnapshot(nativeMcp: IWorkspaceNativeMcpConfig | undefined, environmentId: string): IWorkspaceNativeMcpConfig | undefined {
        if (!nativeMcp) return undefined;
        return stripUndefined({
            ...nativeMcp,
            tokenConfigured: Boolean(this.manager.getApiKey(this.nativeMcpSecretKey(environmentId))),
        });
    }

    private nativeMcpSecretKey(environmentId: string): string {
        return `native-mcp:${environmentId}`;
    }

    private environmentTargetToSnapshot(target: IEnvironmentTarget): IEnvironmentTarget {
        if (target.kind === 'managed-instance') {
            const instance = this.manager.getInstance(target.managedInstanceId);
            if (!instance) {
                return stripUndefined({
                    ...target,
                    managedInstanceId: target.managedInstanceId,
                    apiKeyAvailable: false,
                    credentialSource: 'missing' as const,
                    accessStatus: 'runtime-unavailable' as const,
                });
            }
            const host = instance.baseUrl || instance.tunnelPublicUrl || '';
            const envApiKey = this.readTargetEnvApiKey(target);
            const globalApiKey = this.manager.getApiKey(instance.id);
            const apiKey = envApiKey || globalApiKey;
            const identity = this.resolveManagedEnvironmentIdentity(instance, host, apiKey);
            return stripUndefined({
                ...target,
                managedInstanceId: instance.id,
                instanceName: instance.name,
                url: host,
                instanceIdentifier: identity.instanceIdentifier,
                instanceUserIdentifier: identity.instanceUserIdentifier,
                apiKeyAvailable: Boolean(apiKey),
                credentialSource: envApiKey ? 'env' as const : globalApiKey ? 'global' as const : 'missing' as const,
                accessStatus: this.deriveAccessStatus({ host, apiKey, verification: envApiKey ? undefined : instance.verification }),
            });
        }

        const host = target.url;
        const envApiKey = this.readTargetEnvApiKey(target);
        const workspaceApiKey = this.manager.getApiKey(target.id);
        const globalApiKey = this.getApiKey(host);
        const apiKey = envApiKey || workspaceApiKey || globalApiKey;
        const identity = this.resolveExternalEnvironmentIdentity(target, apiKey);
        return stripUndefined({
            ...target,
            url: host,
            instanceIdentifier: identity.instanceIdentifier,
            instanceUserIdentifier: identity.instanceUserIdentifier,
            apiKeyAvailable: Boolean(apiKey),
            credentialSource: envApiKey ? 'env' as const : workspaceApiKey ? 'workspace-local' as const : globalApiKey ? 'global' as const : 'missing' as const,
            accessStatus: this.deriveAccessStatus({ host, apiKey, verification: target.verification }),
        });
    }

    private deriveAccessStatus(input: { host?: string; apiKey?: string; projectId?: string; projectName?: string; verification?: IInstanceVerification }): EnvironmentAccessStatus {
        if (!input.host) return 'runtime-unavailable';
        if (!input.apiKey) return 'missing-api-key';
        if (input.verification?.status === 'failed') return 'invalid-api-key';
        if (!input.projectId || !input.projectName) return 'unknown';
        return input.verification?.status === 'verified' ? 'ready' : 'unknown';
    }

    private environmentToInstanceProfile(environment: IResolvedWorkspaceEnvironment): IInstanceProfile {
        return stripUndefined({
            id: environment.activeInstanceId || environment.environmentTargetId,
            name: environment.activeInstanceName || environment.environmentTargetName,
            host: environment.host,
            workflowsPath: environment.workflowsPath,
            workflowDir: environment.workflowsPath,
            syncFolder: environment.workflowsPath,
            projectId: environment.projectId,
            projectName: environment.projectName,
            instanceIdentifier: environment.instanceIdentifier,
            instanceUserIdentifier: environment.instanceUserIdentifier,
            customNodesPath: environment.customNodesPath,
            folderSync: environment.folderSync,
        });
    }

    private resolvedEnvironmentToEffectiveContext(environment?: IResolvedWorkspaceEnvironment): EffectiveN8nContext | undefined {
        if (!environment) return undefined;
        return {
            instance: {
                id: environment.activeInstanceId || environment.environmentTargetId,
                name: environment.activeInstanceName || environment.environmentTargetName,
                mode: 'existing',
                baseUrl: environment.host,
                instanceIdentifier: environment.instanceIdentifier,
                instanceUserIdentifier: environment.instanceUserIdentifier,
                defaultProject: environment.projectId && environment.projectName ? { id: environment.projectId, name: environment.projectName } : undefined,
            } as GlobalN8nInstance,
            activeInstanceId: environment.activeInstanceId || environment.environmentTargetId,
            activeInstanceName: environment.activeInstanceName || environment.environmentTargetName,
            apiBaseUrl: environment.host,
            host: environment.host,
            baseUrl: environment.host,
            apiKey: environment.apiKey,
            workflowsPath: environment.workflowsPath,
            workflowDir: environment.workflowsPath,
            syncFolder: environment.workflowsPath,
            projectId: environment.projectId,
            projectName: environment.projectName,
            instanceIdentifier: environment.instanceIdentifier,
            instanceUserIdentifier: environment.instanceUserIdentifier,
            folderSync: environment.folderSync ?? false,
            customNodesPath: environment.customNodesPath,
            environmentId: environment.environmentId,
            environmentName: environment.environmentName,
            environmentTargetId: environment.environmentTargetId,
            environmentTargetName: environment.environmentTargetName,
            sourceKind: environment.sourceKind,
            apiKeySource: environment.apiKeySource,
            sources: {
                instance: environment.sourceKind === 'managed-instance' ? 'workspace' : 'explicit',
                syncFolder: 'workspace',
                project: environment.projectId || environment.projectName ? 'workspace' : 'missing',
            },
        } as EffectiveN8nContext;
    }

    private uniqueWorkspaceId(baseId: string, existingIds: string[]): string {
        const base = this.slugId(baseId) || 'item';
        if (!existingIds.includes(base)) return base;
        let counter = 2;
        while (existingIds.includes(`${base}-${counter}`)) counter += 1;
        return `${base}-${counter}`;
    }

    private uniqueEnvironmentSyncSlug(baseName: string, environments: Array<Pick<IWorkspaceEnvironment, 'syncSlug'>>, usedSlugs = new Set<string>()): string {
        for (const environment of environments) {
            if (environment.syncSlug) usedSlugs.add(this.createEnvironmentSyncSlug(environment.syncSlug).toLowerCase());
        }
        const base = this.createEnvironmentSyncSlug(baseName);
        if (!usedSlugs.has(base.toLowerCase())) return base;
        let counter = 2;
        while (usedSlugs.has(`${base}-${counter}`.toLowerCase())) counter += 1;
        return `${base}-${counter}`;
    }

    private createEnvironmentSyncSlug(value: string): string {
        return this.slugId(value);
    }

    private uniqueDisplayName(baseName: string, existingNames: Set<string>): string {
        const base = cleanRequired(baseName, 'Name');
        let name = base;
        let counter = 2;
        while (existingNames.has(name.toLowerCase())) {
            name = `${base} ${counter}`;
            counter += 1;
        }
        existingNames.add(name.toLowerCase());
        return name;
    }

    private assertUniqueName<T extends { id: string; name: string }>(name: string, items: T[], label: string): void {
        if (items.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
            throw new Error(`A workspace ${label} named "${name}" already exists.`);
        }
    }

    private slugId(value: string): string {
        return value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'item';
    }

    private canonicalInstanceIdentifier(identifier?: string): string | undefined {
        return isCanonicalUserInstanceIdentifier(identifier) ? identifier : undefined;
    }

    private canonicalWorkflowInstanceIdentifier(identifier?: string): string | undefined {
        return isCanonicalInstanceIdentifier(identifier) ? identifier : undefined;
    }

    private canonicalInstanceUserIdentifier(identifier?: string): string | undefined {
        return isCanonicalInstanceUserIdentifier(identifier) ? identifier : undefined;
    }

    private readInstanceIdentifierFromSeed(seed?: string): string | undefined {
        try {
            return seed ? createCanonicalInstanceIdentifier(seed) : undefined;
        } catch {
            return undefined;
        }
    }

    private readInstanceUserIdentifierFromUserId(userId?: string): string | undefined {
        try {
            return userId ? createInstanceUserIdentifier({ id: userId }) : undefined;
        } catch {
            return undefined;
        }
    }

    private readStoredInstanceUserIdentifier(value?: string): string | undefined {
        return this.canonicalInstanceUserIdentifier(value)
            || (isCanonicalUserInstanceIdentifier(value) ? value : undefined);
    }

    private resolveInstanceIdentifierFromApiKey(apiKey: string): string | undefined {
        try {
            const parts = apiKey.split('.');
            if (parts.length !== 3) return undefined;
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url' as BufferEncoding).toString('utf8'));
            return typeof payload.sub === 'string' && payload.sub
                ? createInstanceIdentifier({ id: payload.sub })
                : undefined;
        } catch {
            return undefined;
        }
    }

    private resolveInstanceUserIdentifierFromApiKey(apiKey: string): string | undefined {
        try {
            const parts = apiKey.split('.');
            if (parts.length !== 3) return undefined;
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url' as BufferEncoding).toString('utf8'));
            return typeof payload.sub === 'string' && payload.sub
                ? createInstanceUserIdentifier({ id: payload.sub })
                : undefined;
        } catch {
            return undefined;
        }
    }

    private async resolveInstanceIdentifier(host: string, apiKey: string, client?: IInstanceVerificationClient): Promise<string> {
        const { identifier } = await resolveInstanceIdentifier({ host, apiKey }, {
            client: client as any,
        });
        return identifier;
    }

    private async resolveN8nIdentity(host: string, apiKey: string, client?: IInstanceVerificationClient, instanceSeed?: string): Promise<IResolvedN8nIdentity> {
        return resolveN8nIdentityFromApi({ host, apiKey }, {
            client: client as any,
            instanceSeed,
        });
    }

    private assertNoLegacyWorkspaceFields(config: Partial<ILocalConfig>): void {
        const fields = [
            config.syncFolder ? 'syncFolder' : undefined,
            config.projectId ? 'projectId' : undefined,
            config.projectName ? 'projectName' : undefined,
            config.folderSync !== undefined ? 'folderSync' : undefined,
            config.customNodesPath ? 'customNodesPath' : undefined,
        ].filter(Boolean);
        if (fields.length > 0) {
            throw new Error(`This workspace uses v4 environments. Configure ${fields.join(', ')} with \`n8nac env ...\` instead of legacy workspace fields.`);
        }
    }

    private toInstanceProfile(instance: GlobalN8nInstance, overrides?: Partial<ILocalConfig>): IInstanceProfile {
        return {
            id: instance.id,
            name: instance.name,
            host: instance.baseUrl || instance.tunnelPublicUrl,
            syncFolder: overrides?.syncFolder,
            projectId: overrides?.projectId || instance.defaultProject?.id,
            projectName: overrides?.projectName || instance.defaultProject?.name,
            instanceIdentifier: this.canonicalInstanceIdentifier(instance.instanceIdentifier),
            instanceUserIdentifier: this.canonicalInstanceUserIdentifier((instance as GlobalN8nInstance & { instanceUserIdentifier?: string }).instanceUserIdentifier)
                || this.readStoredInstanceUserIdentifier(instance.instanceIdentifier),
            customNodesPath: overrides?.customNodesPath,
            folderSync: overrides?.folderSync,
            verification: instance.verification,
        };
    }

    private async verifyConnection(host: string, apiKey: string, client?: IInstanceVerificationClient): Promise<IInstanceVerification> {
        try {
            const resolvedClient = client ?? new N8nApiClient({ host, apiKey });
            const user = await resolvedClient.getCurrentUser();
            const userId = user?.id || user?.email?.toLowerCase();
            if (!userId) {
                throw new Error('Unable to resolve the authenticated n8n user.');
            }
            return {
                status: 'verified',
                normalizedHost: this.normalizeHost(host),
                userId,
                userName: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email,
                userEmail: user?.email,
                lastCheckedAt: new Date().toISOString(),
            };
        } catch (error) {
            return {
                status: 'failed',
                lastCheckedAt: new Date().toISOString(),
                lastError: error instanceof Error ? error.message : String(error),
            };
        }
    }

    private normalizeHost(host: string): string {
        try {
            return new URL(host).origin;
        } catch {
            return host.replace(/\/$/, '');
        }
    }

    private resolveStoredBaseUrl(current: GlobalN8nInstance | undefined, requestedHost?: string): string | undefined {
        const host = requestedHost || current?.baseUrl;
        if (
            current?.baseUrl
            && current.tunnelPublicUrl
            && requestedHost
            && this.normalizeHost(requestedHost) === this.normalizeHost(current.tunnelPublicUrl)
        ) {
            return current.baseUrl;
        }
        return host;
    }

    private resolveInputWorkflowsPath(input: {
        workflowsPath?: string;
        workflowDir?: string;
        syncFolder?: string;
        syncSlug?: string;
    }, environments: Array<Pick<IWorkspaceEnvironment, 'workflowsPath' | 'syncFolder' | 'syncSlug'>>, name: string): string {
        const explicit = cleanOptional(input.workflowsPath) || cleanOptional(input.workflowDir);
        if (explicit) return explicit;
        const syncFolder = cleanOptional(input.syncFolder) || DEFAULT_SYNC_FOLDER;
        const syncSlug = input.syncSlug || this.uniqueEnvironmentSyncSlug(name, environments);
        return path.join(syncFolder, syncSlug);
    }

    private patchWorkflowsPath(environment: IWorkspaceEnvironment, patch: Partial<Pick<IWorkspaceEnvironment, 'workflowsPath' | 'workflowDir' | 'syncFolder'>>): string | undefined {
        const explicit = patch.workflowsPath !== undefined
            ? cleanRequired(patch.workflowsPath, 'Workflows path')
            : patch.workflowDir !== undefined
                ? cleanRequired(patch.workflowDir, 'Workflow directory')
                : undefined;
        if (explicit !== undefined) return explicit;
        if (patch.syncFolder === undefined) return undefined;
        return this.resolveInputWorkflowsPath({
            syncFolder: cleanRequired(patch.syncFolder, 'Sync folder'),
            syncSlug: environment.syncSlug,
        }, [], environment.name);
    }

    private resolveEnvironmentWorkflowsPath(environment: IWorkspaceEnvironment): string {
        return this.resolveWorkspacePath(cleanRequired(environment.workflowsPath, 'Workflows path'));
    }

    private migrateWorkflowsPath(previousPath: string, nextPath: string): void {
        const previous = this.resolveWorkspacePath(previousPath);
        const next = this.resolveWorkspacePath(nextPath);
        if (previous === next || !fs.existsSync(previous)) return;
        const relative = path.relative(previous, next);
        const reverseRelative = path.relative(next, previous);
        if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative)) || !reverseRelative || (!reverseRelative.startsWith('..') && !path.isAbsolute(reverseRelative))) {
            throw new Error('Cannot migrate workflowsPath into itself or one of its child directories.');
        }
        if (fs.existsSync(next) && !this.isDirectoryEmpty(next)) {
            throw new Error(`Cannot migrate workflowsPath to "${nextPath}" because the destination is not empty.`);
        }
        fs.mkdirSync(path.dirname(next), { recursive: true });
        if (fs.existsSync(next)) fs.rmSync(next, { recursive: true, force: true });
        try {
            fs.renameSync(previous, next);
        } catch (error: any) {
            if (error?.code !== 'EXDEV') throw error;
            fs.cpSync(previous, next, { recursive: true, errorOnExist: false });
            fs.rmSync(previous, { recursive: true, force: true });
        }
    }

    private isDirectoryEmpty(directory: string): boolean {
        try {
            return fs.statSync(directory).isDirectory() && fs.readdirSync(directory).length === 0;
        } catch {
            return false;
        }
    }

    private findConfigRoot(startDir: string): string {
        let currentDir = path.resolve(startDir);
        while (true) {
            if (fs.existsSync(path.join(currentDir, 'n8nac-config.json'))) {
                return currentDir;
            }
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) {
                return path.resolve(startDir);
            }
            currentDir = parentDir;
        }
    }
}

function tryResolve<T>(callback: () => T): T | undefined {
    try {
        return callback();
    } catch {
        return undefined;
    }
}

function stripUndefined<T extends object>(value: T): T {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function cleanOptional(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function cleanRequired(value: unknown, label: string): string {
    const cleaned = cleanOptional(value);
    if (!cleaned) throw new Error(`${label} is required.`);
    return cleaned;
}

function envVarSlug(value: string): string {
    return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
