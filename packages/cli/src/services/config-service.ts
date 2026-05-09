import fs from 'fs';
import path from 'path';
import Conf from 'conf';
import {
    N8nConfigurationService,
    N8nRuntimeOrchestrator,
    type EffectiveN8nContext,
    type GlobalN8nInstance,
    type N8nInstanceVerification,
    type N8nInstanceVerificationStatus,
} from '@n8n-as-code/n8n-manager-core';
import { N8nApiClient, createInstanceIdentifier, createProjectSlug, isCanonicalUserInstanceIdentifier, resolveInstanceIdentifier } from '../core/index.js';

export interface ILocalConfig {
    host?: string;
    syncFolder?: string;
    projectId?: string;
    projectName?: string;
    instanceIdentifier?: string;
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

export interface IWorkspaceEmbeddedInstance {
    mode: 'existing';
    baseUrl: string;
    name?: string;
    instanceIdentifier?: string;
    verification?: IInstanceVerification;
}

export interface IWorkspaceGlobalInstanceTarget {
    id: string;
    name: string;
    kind: 'global-ref';
    instanceRef: string;
    description?: string;
    globalInstanceId?: string;
    instanceName?: string;
    baseUrl?: string;
    apiKeyAvailable?: boolean;
    credentialSource?: 'env' | 'workspace-local' | 'global' | 'missing';
    accessStatus?: EnvironmentAccessStatus;
}

export interface IWorkspaceEmbeddedInstanceTarget {
    id: string;
    name: string;
    kind: 'embedded';
    instance: IWorkspaceEmbeddedInstance;
    description?: string;
    baseUrl?: string;
    apiKeyAvailable?: boolean;
    credentialSource?: 'env' | 'workspace-local' | 'global' | 'missing';
    accessStatus?: EnvironmentAccessStatus;
}

export type IWorkspaceInstanceTarget = IWorkspaceGlobalInstanceTarget | IWorkspaceEmbeddedInstanceTarget;

export interface IWorkspaceEnvironment {
    id: string;
    name: string;
    instanceTargetId: string;
    projectId?: string;
    projectName?: string;
    syncFolder: string;
    folderSync?: boolean;
    customNodesPath?: string;
    description?: string;
    targetKind?: 'global-ref' | 'embedded';
    instanceTargetName?: string;
    globalInstanceId?: string;
    instanceName?: string;
    baseUrl?: string;
    workflowDir?: string;
    apiKeyAvailable?: boolean;
    credentialSource?: 'env' | 'workspace-local' | 'global' | 'missing';
    accessStatus?: EnvironmentAccessStatus;
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
    instanceTargets: IWorkspaceInstanceTarget[];
    environments: IWorkspaceEnvironment[];
}

export interface IWorkspaceConfig extends ILocalConfig {
    version: 3 | 4;
    activeInstanceId?: string;
    instances: IInstanceProfile[];
    activeEnvironmentId?: string;
    activeEnvironment?: IWorkspaceEnvironment;
    instanceTargets?: IWorkspaceInstanceTarget[];
    environments?: IWorkspaceEnvironment[];
    targetKind?: 'global-ref' | 'embedded';
    instanceTargetId?: string;
    instanceTargetName?: string;
    apiKeyAvailable?: boolean;
    credentialSource?: 'env' | 'workspace-local' | 'global' | 'missing';
}

export interface IResolvedWorkspaceEnvironment extends ILocalConfig {
    environment: IWorkspaceEnvironment;
    instanceTarget: IWorkspaceInstanceTarget;
    instance: IInstanceProfile | IWorkspaceEmbeddedInstance;
    environmentId: string;
    environmentName: string;
    instanceTargetId: string;
    instanceTargetName: string;
    activeInstanceId?: string;
    activeInstanceName: string;
    targetKind: 'global-ref' | 'embedded';
    globalInstanceId?: string;
    host: string;
    apiKey?: string;
    apiKeySource: 'env' | 'workspace-local' | 'global' | 'missing';
    apiKeyAvailable: boolean;
    accessStatus: EnvironmentAccessStatus;
    syncFolder: string;
    instanceIdentifier?: string;
    workflowDir?: string;
    sources: {
        environment: 'explicit' | 'workspace-default' | 'legacy' | 'global-fallback';
        instance: 'global-ref' | 'embedded';
        project: 'environment' | 'instance-default' | 'missing';
        syncFolder: 'environment';
    };
}

export interface ILegacyWorkspaceMigrationInstance extends Partial<ILocalConfig> {
    id: string;
    name: string;
    hasApiKey: boolean;
    verification?: IInstanceVerification;
}

export interface ILegacyWorkspaceMigrationPlan {
    status: 'legacy-detected';
    configPath: string;
    version?: number;
    activeInstanceId?: string;
    instances: ILegacyWorkspaceMigrationInstance[];
    workspace: Partial<ILocalConfig>;
    warnings: string[];
}

export type ILegacyWorkspaceMigrationResult =
    | { status: 'not-needed'; configPath: string }
    | { status: 'dry-run'; plan: ILegacyWorkspaceMigrationPlan }
    | { status: 'migrated'; plan: ILegacyWorkspaceMigrationPlan; backupPath: string; instances: IInstanceProfile[] };

export interface IGlobalInstanceWorkspaceMigrationInstance {
    id: string;
    name: string;
    mode: 'existing' | 'managed-local-docker';
    baseUrl?: string;
    projectId?: string;
    projectName?: string;
    apiKeyAvailable: boolean;
}

export interface IGlobalInstanceWorkspaceMigrationPlan {
    status: 'global-instances-detected';
    configPath: string;
    activeInstanceId?: string;
    instances: IGlobalInstanceWorkspaceMigrationInstance[];
    warnings: string[];
}

export type IGlobalInstanceWorkspaceMigrationResult =
    | { status: 'not-needed'; configPath: string }
    | { status: 'dry-run'; plan: IGlobalInstanceWorkspaceMigrationPlan }
    | { status: 'migrated'; plan: IGlobalInstanceWorkspaceMigrationPlan; migratedEnvironmentIds: string[]; deletedGlobalInstanceIds: string[] };

export interface IPreviousWorkspaceUpgradePlan {
    status: 'upgrade-available';
    configPath: string;
    activeInstanceId?: string;
    activeInstanceName?: string;
    targetKind?: 'global-ref' | 'embedded';
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
        this.workspaceRoot = workspaceRoot ? path.resolve(workspaceRoot) : this.findConfigRoot(process.cwd());
        this.manager = new N8nConfigurationService();
        this.runtime = new N8nRuntimeOrchestrator({ configuration: this.manager });
    }

    getLocalConfig(environmentNameOrId?: string): Partial<ILocalConfig> {
        try {
            return this.environmentToLocalConfig(this.resolveEnvironment(environmentNameOrId));
        } catch {
            try {
                return this.contextToLocalConfig(this.resolveWorkspaceContext());
            } catch {
                return {};
            }
        }
    }

    getWorkspaceConfig(): IWorkspaceConfig {
        const legacyPlan = this.detectLegacyWorkspaceConfig();
        if (legacyPlan) {
            throw new Error(
                `Unsupported legacy n8n workspace config at ${legacyPlan.configPath}. ` +
                'Run `n8nac workspace migrate-v1` to inspect it, then `n8nac workspace migrate-v1 --write` to migrate it.'
            );
        }
        const persisted = this.readWorkspaceConfigFile();
        if (persisted.version === 4) {
            const instances = this.listInstances();
            const effective = tryResolve(() => this.resolveEnvironment());
            const instanceTargets = persisted.instanceTargets.map((target) => this.instanceTargetToSnapshot(target));
            const environments = persisted.environments.map((environment) => this.environmentToSnapshot(environment));
            return {
                version: 4,
                activeEnvironmentId: persisted.activeEnvironmentId,
                activeInstanceId: effective?.activeInstanceId,
                activeEnvironment: effective?.environment,
                instanceTargets,
                environments,
                instances,
                ...(effective ? this.environmentToLocalConfig(effective) : {}),
                targetKind: effective?.targetKind,
                instanceTargetId: effective?.instanceTargetId,
                instanceTargetName: effective?.instanceTargetName,
                apiKeyAvailable: effective?.apiKeyAvailable,
                credentialSource: effective?.apiKeySource,
            };
        }

        const overrides = this.manager.readWorkspaceOverrides(this.workspaceRoot);
        const instances = this.listInstances();
        const effective = tryResolve(() => this.resolveWorkspaceContext());
        const activeInstanceId = effective?.activeInstanceId || overrides.activeInstanceId || this.manager.getGlobalConfig().activeInstanceId;
        const active = activeInstanceId ? instances.find((instance) => instance.id === activeInstanceId) : undefined;
        const activeProfile = effective ? this.contextToInstanceProfile(effective) : active;

        const resolvedSyncFolder = overrides.syncFolder || effective?.syncFolder;
        const resolvedProjectName = overrides.projectName || activeProfile?.projectName;

        return {
            version: 3,
            activeInstanceId,
            instances,
            ...this.toLocalConfig({
                ...activeProfile,
                syncFolder: resolvedSyncFolder,
                projectId: overrides.projectId || activeProfile?.projectId,
                projectName: resolvedProjectName,
                folderSync: overrides.folderSync ?? activeProfile?.folderSync,
                customNodesPath: overrides.customNodesPath || activeProfile?.customNodesPath,
                workflowDir: undefined,
            }),
        };
    }

    listInstanceTargets(): IWorkspaceInstanceTarget[] {
        return this.ensureV4WorkspaceConfig().instanceTargets;
    }

    listEnvironments(): IWorkspaceEnvironment[] {
        return this.ensureV4WorkspaceConfig().environments;
    }

    addInstanceTarget(input: { name: string; instanceRef?: string; baseUrl?: string; id?: string; description?: string }): IWorkspaceInstanceTarget {
        const name = cleanRequired(input.name, 'Instance target name');
        const hasRef = Boolean(input.instanceRef?.trim());
        const hasBaseUrl = Boolean(input.baseUrl?.trim());
        if (hasRef === hasBaseUrl) {
            throw new Error('Provide exactly one of --instance-ref or --base-url.');
        }

        const config = this.ensureV4WorkspaceConfig();
        const id = this.uniqueWorkspaceId(input.id || this.slugId(name), [
            ...config.instanceTargets.map((target) => target.id),
            ...config.environments.map((environment) => environment.id),
        ]);
        this.assertUniqueName(name, config.instanceTargets, 'instance target');

        const target: IWorkspaceInstanceTarget = hasRef
            ? {
                id,
                name,
                kind: 'global-ref',
                instanceRef: this.resolveExistingGlobalInstanceRef(input.instanceRef),
                description: input.description,
            }
            : {
                id,
                name,
                kind: 'embedded',
                instance: {
                    mode: 'existing',
                    baseUrl: cleanRequired(input.baseUrl, 'Base URL'),
                    name,
                },
                description: input.description,
            };

        const next = {
            ...config,
            instanceTargets: [...config.instanceTargets, target],
        };
        this.writeWorkspaceConfigV4(next);
        return target;
    }

    ensureEmbeddedInstanceTarget(input: { name: string; baseUrl: string; id?: string; description?: string }): IWorkspaceInstanceTarget {
        const baseUrl = cleanRequired(input.baseUrl, 'Base URL');
        const normalizedBaseUrl = this.normalizeHost(baseUrl);
        const config = this.ensureV4WorkspaceConfig();
        const existing = config.instanceTargets.find((target) => {
            return target.kind === 'embedded' && this.normalizeHost(target.instance.baseUrl) === normalizedBaseUrl;
        });
        if (existing) return existing;

        const existingNames = new Set(config.instanceTargets.map((target) => target.name.toLowerCase()));
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
            baseUrl,
            description: input.description,
        });
    }

    updateInstanceTarget(nameOrId: string, patch: { name?: string; instanceRef?: string; baseUrl?: string; description?: string }): IWorkspaceInstanceTarget {
        const config = this.ensureV4WorkspaceConfig();
        const target = this.findInstanceTarget(config, nameOrId);
        const nextName = cleanOptional(patch.name) || target.name;
        if (nextName.toLowerCase() !== target.name.toLowerCase()) {
            this.assertUniqueName(nextName, config.instanceTargets.filter((item) => item.id !== target.id), 'instance target');
        }

        const nextTarget: IWorkspaceInstanceTarget = target.kind === 'global-ref'
            ? stripUndefined({
                ...target,
                name: nextName,
                instanceRef: patch.instanceRef ? this.resolveExistingGlobalInstanceRef(patch.instanceRef) : target.instanceRef,
                description: patch.description ?? target.description,
            })
            : stripUndefined({
                ...target,
                name: nextName,
                instance: stripUndefined({
                    ...target.instance,
                    baseUrl: cleanOptional(patch.baseUrl) || target.instance.baseUrl,
                    name: nextName,
                }),
                description: patch.description ?? target.description,
            });

        this.writeWorkspaceConfigV4({
            ...config,
            instanceTargets: config.instanceTargets.map((item) => item.id === target.id ? nextTarget : item),
        });
        return nextTarget;
    }

    removeInstanceTarget(nameOrId: string): IWorkspaceInstanceTarget {
        const config = this.ensureV4WorkspaceConfig();
        const target = this.findInstanceTarget(config, nameOrId);
        const usedBy = config.environments.filter((environment) => environment.instanceTargetId === target.id);
        if (usedBy.length > 0) {
            throw new Error(`Workspace instance target "${target.name}" is used by environment(s): ${usedBy.map((environment) => environment.name).join(', ')}.`);
        }
        this.writeWorkspaceConfigV4({
            ...config,
            instanceTargets: config.instanceTargets.filter((item) => item.id !== target.id),
        });
        return target;
    }

    addEnvironment(input: {
        name: string;
        instanceTarget: string;
        projectId?: string;
        projectName?: string;
        syncFolder: string;
        id?: string;
        folderSync?: boolean;
        customNodesPath?: string;
        description?: string;
    }): IWorkspaceEnvironment {
        const config = this.ensureV4WorkspaceConfig();
        const name = cleanRequired(input.name, 'Environment name');
        const target = this.findInstanceTarget(config, input.instanceTarget);
        const id = this.uniqueWorkspaceId(input.id || this.slugId(name), [
            ...config.instanceTargets.map((item) => item.id),
            ...config.environments.map((item) => item.id),
        ]);
        this.assertUniqueName(name, config.environments, 'environment');

        const environment: IWorkspaceEnvironment = {
            id,
            name,
            instanceTargetId: target.id,
            projectId: cleanOptional(input.projectId),
            projectName: cleanOptional(input.projectName),
            syncFolder: cleanRequired(input.syncFolder, 'Sync folder'),
            folderSync: input.folderSync,
            customNodesPath: input.customNodesPath,
            description: input.description,
        };
        const next = {
            ...config,
            activeEnvironmentId: config.activeEnvironmentId || environment.id,
            environments: [...config.environments, environment],
        };
        this.writeWorkspaceConfigV4(next);
        return environment;
    }

    updateEnvironment(nameOrId: string, patch: Partial<Pick<IWorkspaceEnvironment, 'name' | 'projectId' | 'projectName' | 'syncFolder' | 'folderSync' | 'customNodesPath' | 'description'>> & { instanceTarget?: string }): IWorkspaceEnvironment {
        const config = this.ensureV4WorkspaceConfig();
        const environment = this.findEnvironment(config, nameOrId);
        const target = patch.instanceTarget ? this.findInstanceTarget(config, patch.instanceTarget) : undefined;
        const nextName = cleanOptional(patch.name) || environment.name;
        if (nextName.toLowerCase() !== environment.name.toLowerCase()) {
            this.assertUniqueName(nextName, config.environments.filter((item) => item.id !== environment.id), 'environment');
        }
        const nextEnvironment: IWorkspaceEnvironment = stripUndefined({
            ...environment,
            name: nextName,
            instanceTargetId: target?.id || environment.instanceTargetId,
            projectId: patch.projectId !== undefined ? cleanOptional(patch.projectId) : environment.projectId,
            projectName: patch.projectName !== undefined ? cleanOptional(patch.projectName) : environment.projectName,
            syncFolder: patch.syncFolder !== undefined ? cleanRequired(patch.syncFolder, 'Sync folder') : environment.syncFolder,
            folderSync: patch.folderSync ?? environment.folderSync,
            customNodesPath: patch.customNodesPath ?? environment.customNodesPath,
            description: patch.description ?? environment.description,
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

    getInstanceTarget(nameOrId: string): IWorkspaceInstanceTarget {
        return this.findInstanceTarget(this.ensureV4WorkspaceConfig(), nameOrId);
    }

    resolveEnvironment(environmentNameOrId?: string): IResolvedWorkspaceEnvironment {
        const persisted = this.readWorkspaceConfigFile();
        const config = persisted.version === 4 ? persisted : this.v3ToV4WorkspaceConfig();
        if (config.environments.length === 0) {
            throw new Error('No workspace environment is configured. Run `n8nac env add` first.');
        }
        const environment = environmentNameOrId
            ? this.findEnvironment(config, environmentNameOrId)
            : config.activeEnvironmentId
                ? this.findEnvironment(config, config.activeEnvironmentId)
                : config.environments[0];
        const target = this.findInstanceTarget(config, environment.instanceTargetId);
        return this.resolveEnvironmentFromTarget(environment, target, environmentNameOrId ? 'explicit' : config.activeEnvironmentId ? 'workspace-default' : persisted.version === 4 ? 'workspace-default' : 'legacy');
    }

    async prepareEnvironment(environmentNameOrId?: string): Promise<IResolvedWorkspaceEnvironment> {
        const resolved = this.resolveEnvironment(environmentNameOrId);
        if (resolved.targetKind === 'embedded') {
            if (resolved.apiKey && !resolved.instanceIdentifier) {
                const instanceIdentifier = await this.resolveInstanceIdentifier(resolved.host, resolved.apiKey).catch(() => undefined);
                return {
                    ...resolved,
                    instanceIdentifier,
                    workflowDir: this.buildWorkflowDir(resolved.syncFolder, instanceIdentifier, resolved.projectName),
                };
            }
            return resolved;
        }

        const prepared = await this.runtime.prepareEffectiveContext({
            instanceId: resolved.globalInstanceId,
            syncFolderDefault: 'global',
            consumer: 'cli',
            autoStart: true,
        });
        if (prepared.runtime.blocked) {
            throw new Error(prepared.runtime.blocked.message);
        }

        const context = prepared.context;
        const apiKey = resolved.apiKey || context.apiKey;
        const syncFolder = resolved.syncFolder;
        const projectId = resolved.projectId || context.projectId;
        const projectName = resolved.projectName || context.projectName;
        let instanceIdentifier = this.canonicalInstanceIdentifier(context.instanceIdentifier || resolved.instanceIdentifier);
        if (apiKey && resolved.apiKeySource === 'env') {
            instanceIdentifier = this.canonicalInstanceIdentifier(await this.resolveInstanceIdentifier(context.host, apiKey).catch(() => undefined)) || instanceIdentifier;
        }
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
            projectId,
            projectName,
            syncFolder,
            workflowDir: this.buildWorkflowDir(syncFolder, instanceIdentifier, projectName),
        };
    }

    listInstanceConfigs(): IInstanceProfile[] {
        return this.listInstances();
    }

    listInstances(): IInstanceProfile[] {
        const overrides = this.isWorkspaceConfigV4() ? undefined : tryResolve(() => this.manager.readWorkspaceOverrides(this.workspaceRoot));
        return this.manager.listInstances().map((instance) => this.toInstanceProfile(instance, overrides));
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
        if (effective?.targetKind === 'global-ref' && effective.activeInstanceId) {
            return this.getInstanceConfig(effective.activeInstanceId);
        }
        const legacy = tryResolve(() => this.resolveWorkspaceContext());
        return legacy ? this.contextToInstanceProfile(legacy) : undefined;
    }

    getEffectiveInstanceConfig(instanceId?: string): IInstanceProfile | undefined {
        if (instanceId) {
            const effective = tryResolve(() => this.resolveWorkspaceContext(instanceId));
            return effective ? this.contextToInstanceProfile(effective) : undefined;
        }
        const environment = tryResolve(() => this.resolveEnvironment());
        if (environment) return this.environmentToInstanceProfile(environment);
        const effective = tryResolve(() => this.resolveWorkspaceContext());
        return effective ? this.contextToInstanceProfile(effective) : undefined;
    }

    getEffectiveContext(instanceId?: string): EffectiveN8nContext | undefined {
        if (!instanceId && this.isWorkspaceConfigV4()) {
            return this.resolvedEnvironmentToEffectiveContext(tryResolve(() => this.resolveEnvironment()));
        }
        return tryResolve(() => this.resolveWorkspaceContext(instanceId));
    }

    async prepareWorkspaceContext(input?: string | { instanceId?: string; environment?: string; consumer?: 'cli' | 'vscode' | string }): Promise<EffectiveN8nContext> {
        const instanceId = typeof input === 'string' ? input : input?.instanceId;
        const environment = typeof input === 'string' ? undefined : input?.environment;
        const consumer = typeof input === 'string' ? 'cli' : input?.consumer === 'vscode' ? 'vscode' : 'cli';
        if (environment || (!instanceId && this.isWorkspaceConfigV4())) {
            return this.resolvedEnvironmentToEffectiveContext(await this.prepareEnvironment(environment))!;
        }
        const prepared = await this.runtime.prepareEffectiveContext({
            workspaceRoot: this.workspaceRoot,
            instanceId,
            syncFolderDefault: 'workspace',
            consumer,
            autoStart: true,
        });
        if (prepared.runtime.blocked) {
            throw new Error(prepared.runtime.blocked.message);
        }
        return {
            ...prepared.context,
        };
    }

    getCurrentInstanceConfigId(): string | undefined {
        return this.getActiveInstanceId();
    }

    getActiveInstanceId(): string | undefined {
        const environment = tryResolve(() => this.resolveEnvironment());
        return environment?.activeInstanceId || this.getActiveInstance()?.id || this.manager.getGlobalConfig().activeInstanceId;
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
        const instanceIdentifier = input.host && input.apiKey
            ? await this.resolveInstanceIdentifier(input.host, input.apiKey, options.client)
            : this.canonicalInstanceIdentifier(input.instanceIdentifier);
        const profile = this.saveLocalConfig({
            ...input,
            instanceIdentifier,
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
        const workspaceConfigIsV4 = this.isWorkspaceConfigV4();
        if (workspaceConfigIsV4) {
            this.assertNoLegacyWorkspaceFields(config);
        }
        const current = options.createNew ? undefined : (options.instanceId ? this.manager.getInstance(options.instanceId) : this.manager.getGlobalActiveInstance());
        const host = this.resolveStoredBaseUrl(current, config.host);
        const saved = this.manager.upsertInstance({
            id: options.createNew ? undefined : (options.instanceId || current?.id),
            name: options.instanceName || current?.name || host,
            mode: current?.mode || 'existing',
            baseUrl: host,
            apiKey: options.apiKey,
            instanceIdentifier: this.canonicalInstanceIdentifier(config.instanceIdentifier || current?.instanceIdentifier),
            verification: options.verification || current?.verification,
            defaultProject: current?.defaultProject,
        }, {
            setActive: options.setActive,
        });

        if (workspaceConfigIsV4) {
            return this.toInstanceProfile(saved);
        }

        this.writeWorkspaceFields(saved.id, config, options.setActive !== false);
        return this.toInstanceProfile(saved, this.manager.readWorkspaceOverrides(this.workspaceRoot));
    }

    saveInstanceProfile(profile: Partial<IInstanceProfile>, options: { setActive?: boolean; createNew?: boolean } = {}): IInstanceProfile {
        return this.saveLocalConfig(profile, {
            instanceId: options.createNew ? undefined : profile.id,
            instanceName: profile.name,
            setActive: options.setActive,
            createNew: options.createNew,
        });
    }

    saveBootstrapState(host: string, syncFolder = 'workflows', options: { instanceId?: string; instanceName?: string; createNew?: boolean } = {}): IInstanceProfile {
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
        const updated = this.manager.upsertInstance({
            id: instance.id,
            name: instance.name,
            baseUrl: instance.host,
            instanceIdentifier,
            verification,
        }, { setActive: instance.id === this.getActiveInstanceId() });
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
        if (!instanceIdentifier) {
            throw new Error('Unable to resolve the n8n user ID from the API key.');
        }
        if (target) {
            this.manager.saveApiKey(target.id, apiKey);
            this.manager.upsertInstance({
                id: target.id,
                instanceIdentifier,
            }, { setActive: false });
            return;
        }
        const saved = this.manager.upsertInstance({ baseUrl: host, apiKey, instanceIdentifier }, { setActive: true });
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

    upsertRemoteInstancePreset(input: { host: string; apiKey?: string; name?: string }): IInstanceProfile {
        const host = cleanRequired(input.host, 'n8n URL');
        const normalized = this.normalizeHost(host);
        const existing = this.manager.listInstances().find((candidate) => {
            return candidate.mode !== 'managed-local-docker'
                && (this.normalizeHost(candidate.baseUrl || '') === normalized || this.normalizeHost(candidate.tunnelPublicUrl || '') === normalized);
        });
        const instanceIdentifier = input.apiKey ? this.resolveInstanceIdentifierFromApiKey(input.apiKey) : undefined;
        const saved = this.manager.upsertInstance({
            id: existing?.id,
            name: input.name || existing?.name || host,
            mode: 'existing',
            baseUrl: host,
            apiKey: input.apiKey,
            instanceIdentifier: instanceIdentifier || existing?.instanceIdentifier,
            defaultProject: existing?.defaultProject,
            verification: existing?.verification,
        }, { setActive: false });
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
        const saved = this.manager.upsertInstance({
            id: active?.id || instanceId,
            name: active?.name || host,
            baseUrl: active?.baseUrl || host,
            instanceIdentifier: identifier,
        }, { setActive: true });
        return saved.instanceIdentifier || identifier;
    }

    getInstanceConfigPath(): string {
        return this.manager.getWorkspaceConfigPath(this.workspaceRoot);
    }

    getWorkspaceRoot(): string {
        return this.workspaceRoot;
    }

    detectLegacyWorkspaceConfig(): ILegacyWorkspaceMigrationPlan | undefined {
        const configPath = this.getInstanceConfigPath();
        const raw = this.readRawWorkspaceConfig(configPath);
        if (!raw || !this.isLegacyWorkspaceConfig(raw)) {
            return undefined;
        }

        const instances = this.readLegacyInstances(raw);
        const requestedActiveInstanceId = asString(raw.activeInstanceId);
        const activeInstance = requestedActiveInstanceId
            ? (instances.find((instance) => instance.id === requestedActiveInstanceId) || instances[0])
            : instances[0];
        const activeInstanceId = activeInstance?.id;
        const workspace = stripUndefined({
            syncFolder: asString(raw.syncFolder) || activeInstance?.syncFolder,
            projectId: asString(raw.projectId) || activeInstance?.projectId,
            projectName: asString(raw.projectName) || activeInstance?.projectName,
            customNodesPath: asString(raw.customNodesPath) || activeInstance?.customNodesPath,
            folderSync: asBoolean(raw.folderSync) ?? activeInstance?.folderSync,
        });
        const warnings = [
            'Global n8n instances and API keys now live in n8n-manager, not in n8nac-config.json.',
            'n8nac-config.json will keep workspace environments after migration.',
            requestedActiveInstanceId && requestedActiveInstanceId !== activeInstanceId
                ? `Legacy active instance "${requestedActiveInstanceId}" was not found; migration will use ${activeInstanceId ? `"${activeInstanceId}"` : 'no pinned instance'} instead.`
                : undefined,
            instances.some((instance) => instance.hasApiKey)
                ? 'Embedded API keys found: --write will move them into the local n8n-manager secret store.'
                : 'No embedded API keys found: you may need to run n8n-manager auth set after migration.',
        ].filter(Boolean) as string[];

        return {
            status: 'legacy-detected',
            configPath,
            version: typeof raw.version === 'number' ? raw.version : undefined,
            activeInstanceId,
            instances,
            workspace,
            warnings,
        };
    }

    migrateLegacyWorkspaceConfig(options: { write?: boolean } = {}): ILegacyWorkspaceMigrationResult {
        const plan = this.detectLegacyWorkspaceConfig();
        const configPath = this.getInstanceConfigPath();
        if (!plan) {
            return { status: 'not-needed', configPath };
        }

        if (!options.write) {
            return { status: 'dry-run', plan };
        }

        const backupPath = this.createLegacyConfigBackup(configPath);
        const rawLegacyConfig = this.readRawWorkspaceConfig(configPath) || {};
        const migratedInstances: IInstanceProfile[] = [];
        const migratedPairs: Array<{ legacy: ILegacyWorkspaceMigrationInstance; profile: IInstanceProfile }> = [];
        for (const legacyInstance of plan.instances) {
            const apiKey = this.readLegacyApiKey(legacyInstance.id, rawLegacyConfig)
                || this.readLegacyStoredApiKey(legacyInstance.id, legacyInstance.host);
            const saved = this.saveLocalConfig({
                host: legacyInstance.host,
                syncFolder: legacyInstance.syncFolder || plan.workspace.syncFolder,
                projectId: legacyInstance.projectId || plan.workspace.projectId,
                projectName: legacyInstance.projectName || plan.workspace.projectName,
                instanceIdentifier: legacyInstance.instanceIdentifier,
                customNodesPath: legacyInstance.customNodesPath || plan.workspace.customNodesPath,
                folderSync: legacyInstance.folderSync ?? plan.workspace.folderSync,
            }, {
                instanceId: legacyInstance.id,
                instanceName: legacyInstance.name,
                setActive: legacyInstance.id === plan.activeInstanceId,
                apiKey,
            });
            migratedInstances.push(saved);
            migratedPairs.push({ legacy: legacyInstance, profile: saved });
        }

        if (migratedPairs.length > 0) {
            const usedIds: string[] = [];
            const targetNames = new Set<string>();
            const environmentNames = new Set<string>();
            const instanceTargets: IWorkspaceInstanceTarget[] = [];
            const environments: IWorkspaceEnvironment[] = [];

            for (const { legacy, profile } of migratedPairs) {
                const baseName = profile.name || legacy.name || profile.host || legacy.id;
                const singleInstanceMigration = migratedPairs.length === 1;
                const targetName = this.uniqueDisplayName(baseName, targetNames);
                const environmentName = this.uniqueDisplayName(singleInstanceMigration ? 'Default' : baseName, environmentNames);
                const targetId = this.uniqueWorkspaceId(singleInstanceMigration ? 'default-instance' : `${profile.id || legacy.id || targetName}-instance`, usedIds);
                usedIds.push(targetId);
                const environmentId = this.uniqueWorkspaceId(singleInstanceMigration ? 'default' : profile.id || legacy.id || environmentName, usedIds);
                usedIds.push(environmentId);
                const syncFolder = legacy.syncFolder || plan.workspace.syncFolder || 'workflows';

                instanceTargets.push({
                    id: targetId,
                    name: targetName,
                    kind: 'embedded',
                    instance: stripUndefined({
                        mode: 'existing' as const,
                        baseUrl: cleanRequired(profile.host || legacy.host, 'Legacy instance URL'),
                        name: profile.name || legacy.name,
                        instanceIdentifier: profile.instanceIdentifier || legacy.instanceIdentifier,
                        verification: legacy.verification,
                    }),
                });
                environments.push(stripUndefined({
                    id: environmentId,
                    name: environmentName,
                    instanceTargetId: targetId,
                    projectId: legacy.projectId || plan.workspace.projectId,
                    projectName: legacy.projectName || plan.workspace.projectName,
                    syncFolder,
                    customNodesPath: legacy.customNodesPath || plan.workspace.customNodesPath,
                    folderSync: legacy.folderSync ?? plan.workspace.folderSync,
                }));
            }

            const activePair = migratedPairs.find(({ legacy }) => legacy.id === plan.activeInstanceId) || migratedPairs[0];
            const activeEnvironmentId = environments[migratedPairs.indexOf(activePair)]?.id || environments[0]?.id;
            this.writeWorkspaceConfigV4({
                version: 4,
                activeEnvironmentId,
                instanceTargets,
                environments,
            });
        } else {
            this.manager.writeWorkspaceOverrides(this.workspaceRoot, stripUndefined({
                version: 3 as const,
                syncFolder: plan.workspace.syncFolder,
                projectId: plan.workspace.projectId,
                projectName: plan.workspace.projectName,
                customNodesPath: plan.workspace.customNodesPath,
                folderSync: plan.workspace.folderSync,
            }));
        }

        return { status: 'migrated', plan, backupPath, instances: migratedInstances };
    }

    detectGlobalInstanceWorkspaceMigration(): IGlobalInstanceWorkspaceMigrationPlan | undefined {
        const configPath = this.getInstanceConfigPath();
        const global = this.manager.getGlobalConfig();
        const instances = global.instances
            .filter((instance) => (instance.mode === 'existing' && instance.baseUrl) || instance.mode === 'managed-local-docker')
            .map((instance) => stripUndefined({
                id: instance.id,
                name: instance.name || instance.baseUrl || instance.id,
                mode: instance.mode as 'existing' | 'managed-local-docker',
                baseUrl: instance.baseUrl || '',
                projectId: instance.defaultProject?.id,
                projectName: instance.defaultProject?.name,
                apiKeyAvailable: Boolean(this.manager.getApiKey(instance.id)),
            }));

        if (!instances.length) return undefined;
        return {
            status: 'global-instances-detected',
            configPath,
            activeInstanceId: global.activeInstanceId,
            instances,
            warnings: [
                'Global existing n8n instances belong to the previous v2 workspace model.',
                'Migration will copy existing instances into this workspace as environments, move API keys to workspace target secrets, then remove the old non-managed global instance entries.',
                'Managed local instances will be added to this workspace as global-ref environments and will stay global.',
            ],
        };
    }

    migrateGlobalInstancesToWorkspace(options: { write?: boolean } = {}): IGlobalInstanceWorkspaceMigrationResult {
        const plan = this.detectGlobalInstanceWorkspaceMigration();
        const configPath = this.getInstanceConfigPath();
        if (!plan) return { status: 'not-needed', configPath };
        if (!options.write) return { status: 'dry-run', plan };

        const current = this.readWorkspaceConfigFileSafe();
        const usedIds = [
            ...current.instanceTargets.map((item) => item.id),
            ...current.environments.map((item) => item.id),
        ];
        const targetNames = new Set(current.instanceTargets.map((item) => item.name));
        const environmentNames = new Set(current.environments.map((item) => item.name));
        const instanceTargets = [...current.instanceTargets];
        const environments = [...current.environments];
        const migratedEnvironmentIds: string[] = [];
        const deletedGlobalInstanceIds: string[] = [];
        let activeMigratedEnvironmentId: string | undefined;

        for (const item of plan.instances) {
            const instance = this.manager.getInstance(item.id);
            if (!instance) continue;
            if (instance.mode === 'managed-local-docker') {
                const existingTarget = instanceTargets.find((target) => target.kind === 'global-ref' && target.instanceRef === instance.id);
                let targetId = existingTarget?.id;
                if (!targetId) {
                    const targetName = this.uniqueDisplayName(instance.name || instance.id, targetNames);
                    targetId = this.uniqueWorkspaceId(instance.id, usedIds);
                    usedIds.push(targetId);
                    instanceTargets.push({
                        id: targetId,
                        name: targetName,
                        kind: 'global-ref',
                        instanceRef: instance.id,
                    });
                }

                let existingEnvironment = environments.find((environment) => environment.instanceTargetId === targetId);
                if (!existingEnvironment) {
                    const environmentName = this.uniqueDisplayName(instance.name || instance.id, environmentNames);
                    const environmentId = this.uniqueWorkspaceId(instance.id || environmentName, usedIds);
                    usedIds.push(environmentId);
                    existingEnvironment = stripUndefined({
                        id: environmentId,
                        name: environmentName,
                        instanceTargetId: targetId,
                        projectId: instance.defaultProject?.id || 'personal',
                        projectName: instance.defaultProject?.name || 'Personal',
                        syncFolder: `workflows/${this.slugId(environmentName)}`,
                    });
                    environments.push(existingEnvironment);
                    migratedEnvironmentIds.push(environmentId);
                }
                if (instance.id === plan.activeInstanceId) activeMigratedEnvironmentId = existingEnvironment.id;
                continue;
            }

            if (instance.mode !== 'existing' || !instance.baseUrl) continue;
            const apiKey = this.manager.getApiKey(instance.id);
            const normalizedBaseUrl = this.normalizeHost(instance.baseUrl);
            const existingTargetIndex = instanceTargets.findIndex((target) => {
                if (target.kind === 'global-ref') return target.instanceRef === instance.id;
                return this.normalizeHost(target.instance.baseUrl) === normalizedBaseUrl;
            });
            if (existingTargetIndex >= 0) {
                const existingTarget = instanceTargets[existingTargetIndex];
                if (existingTarget.kind === 'global-ref') {
                    instanceTargets[existingTargetIndex] = {
                        id: existingTarget.id,
                        name: existingTarget.name,
                        kind: 'embedded',
                        instance: stripUndefined({
                            mode: 'existing' as const,
                            baseUrl: instance.baseUrl,
                            name: instance.name,
                            instanceIdentifier: instance.instanceIdentifier,
                            verification: instance.verification,
                        }),
                        description: existingTarget.description,
                    };
                }
                if (apiKey) this.manager.saveApiKey(existingTarget.id, apiKey);
                let existingEnvironment = environments.find((environment) => environment.instanceTargetId === existingTarget.id);
                if (!existingEnvironment) {
                    const environmentName = this.uniqueDisplayName(instance.name || instance.baseUrl || instance.id, environmentNames);
                    const environmentId = this.uniqueWorkspaceId(instance.id || environmentName, usedIds);
                    usedIds.push(environmentId);
                    existingEnvironment = stripUndefined({
                        id: environmentId,
                        name: environmentName,
                        instanceTargetId: existingTarget.id,
                        projectId: instance.defaultProject?.id || 'personal',
                        projectName: instance.defaultProject?.name || 'Personal',
                        syncFolder: `workflows/${this.slugId(environmentName)}`,
                    });
                    environments.push(existingEnvironment);
                    migratedEnvironmentIds.push(environmentId);
                }
                if (instance.id === plan.activeInstanceId) activeMigratedEnvironmentId = existingEnvironment.id;
                continue;
            }
            const targetName = this.uniqueDisplayName(instance.name || instance.baseUrl || instance.id, targetNames);
            const environmentName = this.uniqueDisplayName(instance.name || instance.baseUrl || instance.id, environmentNames);
            const targetId = this.uniqueWorkspaceId(`${instance.id}-instance`, usedIds);
            usedIds.push(targetId);
            const environmentId = this.uniqueWorkspaceId(instance.id || environmentName, usedIds);
            usedIds.push(environmentId);
            const projectId = instance.defaultProject?.id || 'personal';
            const projectName = instance.defaultProject?.name || 'Personal';
            const syncFolder = environments.length === 0 && plan.instances.length === 1
                ? 'workflows'
                : `workflows/${this.slugId(environmentName)}`;

            instanceTargets.push({
                id: targetId,
                name: targetName,
                kind: 'embedded',
                instance: stripUndefined({
                    mode: 'existing' as const,
                    baseUrl: instance.baseUrl,
                    name: instance.name,
                    instanceIdentifier: instance.instanceIdentifier,
                    verification: instance.verification,
                }),
            });
            environments.push(stripUndefined({
                id: environmentId,
                name: environmentName,
                instanceTargetId: targetId,
                projectId,
                projectName,
                syncFolder,
            }));

            if (apiKey) this.manager.saveApiKey(targetId, apiKey);
            migratedEnvironmentIds.push(environmentId);
            if (instance.id === plan.activeInstanceId) activeMigratedEnvironmentId = environmentId;
        }

        const activeEnvironmentId = current.activeEnvironmentId
            || activeMigratedEnvironmentId
            || migratedEnvironmentIds[0]
            || environments[0]?.id;

        this.writeWorkspaceConfigV4(stripUndefined({
            version: 4 as const,
            activeEnvironmentId,
            instanceTargets,
            environments,
        }));

        for (const item of plan.instances) {
            const instance = this.manager.getInstance(item.id);
            if (instance?.mode === 'existing') {
                this.manager.deleteInstance(item.id);
                deletedGlobalInstanceIds.push(item.id);
            }
        }

        return { status: 'migrated', plan, migratedEnvironmentIds, deletedGlobalInstanceIds };
    }

    resolveWorkspacePath(targetPath: string): string {
        return path.isAbsolute(targetPath)
            ? targetPath
            : path.resolve(this.workspaceRoot, targetPath);
    }

    private readRawWorkspaceConfig(configPath: string): Record<string, unknown> | undefined {
        if (!fs.existsSync(configPath)) {
            return undefined;
        }
        try {
            const value = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return value && typeof value === 'object' && !Array.isArray(value)
                ? value as Record<string, unknown>
                : undefined;
        } catch {
            return undefined;
        }
    }

    private isLegacyWorkspaceConfig(raw: Record<string, unknown>): boolean {
        if (raw.version === 1 || raw.version === 2) return true;
        if (Array.isArray(raw.instances)) return true;
        if (typeof raw.apiKey === 'string') return true;
        return false;
    }

    private readLegacyInstances(raw: Record<string, unknown>): ILegacyWorkspaceMigrationInstance[] {
        const rawInstances = Array.isArray(raw.instances) ? raw.instances : [];
        if (rawInstances.length > 0) {
            return rawInstances
                .map((candidate, index) => this.toLegacyInstance(candidate, raw, index, false))
                .filter((instance): instance is ILegacyWorkspaceMigrationInstance => Boolean(instance));
        }
        const candidates = this.hasRootLegacyInstance(raw) ? [raw] : [];
        return candidates
            .map((candidate, index) => this.toLegacyInstance(candidate, raw, index, true))
            .filter((instance): instance is ILegacyWorkspaceMigrationInstance => Boolean(instance));
    }

    private hasRootLegacyInstance(raw: Record<string, unknown>): boolean {
        return Boolean(asString(raw.host) || asString(raw.baseUrl));
    }

    private toLegacyInstance(candidate: unknown, root: Record<string, unknown>, index: number, useRootActiveInstanceId: boolean): ILegacyWorkspaceMigrationInstance | undefined {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
            return undefined;
        }
        const value = candidate as Record<string, unknown>;
        const id = asString(value.id) || (useRootActiveInstanceId ? asString(root.activeInstanceId) : undefined) || `legacy-${index + 1}`;
        const host = asString(value.host) || asString(value.baseUrl) || asString(root.host) || asString(root.baseUrl);
        const name = asString(value.name) || host || id;
        return stripUndefined({
            id,
            name,
            host,
            syncFolder: asString(value.syncFolder) || asString(root.syncFolder),
            projectId: asString(value.projectId) || asString(root.projectId),
            projectName: asString(value.projectName) || asString(root.projectName),
            instanceIdentifier: asString(value.instanceIdentifier) || asString(root.instanceIdentifier),
            workflowDir: asString(value.workflowDir) || asString(root.workflowDir),
            verification: value.verification && typeof value.verification === 'object' && !Array.isArray(value.verification)
                ? value.verification as IInstanceVerification
                : undefined,
            customNodesPath: asString(value.customNodesPath) || asString(root.customNodesPath),
            folderSync: asBoolean(value.folderSync) ?? asBoolean(root.folderSync),
            hasApiKey: Boolean(asString(value.apiKey) || asString(root.apiKey)),
        });
    }

    private readLegacyApiKey(instanceId: string, root: Record<string, unknown>): string | undefined {
        const instances = Array.isArray(root.instances) ? root.instances : [];
        const match = instances.find((candidate) => {
            return candidate && typeof candidate === 'object' && !Array.isArray(candidate)
                && asString((candidate as Record<string, unknown>).id) === instanceId;
        }) as Record<string, unknown> | undefined;
        if (match) {
            return asString(match.apiKey) || asString(root.apiKey);
        }

        const syntheticIndex = this.syntheticLegacyIndex(instanceId);
        const syntheticMatch = syntheticIndex !== undefined ? instances[syntheticIndex] : undefined;
        if (syntheticMatch && typeof syntheticMatch === 'object' && !Array.isArray(syntheticMatch)) {
            return asString((syntheticMatch as Record<string, unknown>).apiKey) || asString(root.apiKey);
        }

        return asString(root.apiKey);
    }

    private readLegacyStoredApiKey(instanceId: string, host?: string): string | undefined {
        try {
            const store = new Conf<Record<string, unknown>>({
                projectName: 'n8nac',
                configName: 'credentials',
                configFileMode: 0o600,
            });
            const instanceProfiles = store.get('instanceProfiles') as Record<string, unknown> | undefined;
            const instanceApiKey = asString(instanceProfiles?.[instanceId]);
            if (instanceApiKey) return instanceApiKey;

            if (!host) return undefined;
            const hosts = store.get('hosts') as Record<string, unknown> | undefined;
            return asString(hosts?.[this.normalizeHost(host)]);
        } catch {
            return undefined;
        }
    }

    private syntheticLegacyIndex(instanceId: string): number | undefined {
        const match = instanceId.match(/^legacy-(\d+)$/);
        if (!match) return undefined;
        const index = Number.parseInt(match[1], 10) - 1;
        return Number.isSafeInteger(index) && index >= 0 ? index : undefined;
    }

    private createLegacyConfigBackup(configPath: string): string {
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
        const backupPath = path.join(path.dirname(configPath), `n8nac-config.v1-backup-${timestamp}.json`);
        fs.copyFileSync(configPath, backupPath);
        return backupPath;
    }

    private readWorkspaceConfigFile(): { version: 3 } | IPersistedWorkspaceConfigV4 {
        const configPath = this.getInstanceConfigPath();
        if (!fs.existsSync(configPath)) return { version: 3 };
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (raw?.version === 4) {
            return this.sanitizeV4Config(raw);
        }
        if (raw?.version !== undefined && raw.version !== 3) {
            throw new Error(`Unsupported legacy n8n workspace config version: ${raw.version}`);
        }
        return { version: 3 };
    }

    private readWorkspaceConfigFileSafe(): IPersistedWorkspaceConfigV4 {
        try {
            return this.ensureV4WorkspaceConfig();
        } catch {
            return { version: 4, instanceTargets: [], environments: [] };
        }
    }

    isWorkspaceConfigV4(): boolean {
        const configPath = this.getInstanceConfigPath();
        if (!fs.existsSync(configPath)) return false;
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return raw?.version === 4;
    }

    private assertLegacyWorkspaceOverridesWritable(): void {
        if (this.isWorkspaceConfigV4()) {
            throw new Error('This workspace uses v4 environments. Use `n8nac instance-target ...` and `n8nac env ...` instead of legacy workspace singleton commands.');
        }
    }

    private ensureV4WorkspaceConfig(): IPersistedWorkspaceConfigV4 {
        const config = this.readWorkspaceConfigFile();
        return config.version === 4 ? config : this.v3ToV4WorkspaceConfig();
    }

    private sanitizeV4Config(raw: any): IPersistedWorkspaceConfigV4 {
        if (!Array.isArray(raw.instanceTargets)) {
            throw new Error('Invalid v4 workspace config: instanceTargets must be an array.');
        }
        if (!Array.isArray(raw.environments)) {
            throw new Error('Invalid v4 workspace config: environments must be an array.');
        }
        const rawInstanceTargets = raw.instanceTargets as unknown[];
        const rawEnvironments = raw.environments as unknown[];
        const instanceTargets = rawInstanceTargets.map((target, index) => this.sanitizeInstanceTarget(target, index));
        const environments = rawEnvironments.map((environment, index) => this.sanitizeEnvironment(environment, index));
        this.assertUniqueIdsAndNames(instanceTargets, 'instance target');
        this.assertUniqueIdsAndNames(environments, 'environment');
        const targetIds = new Set(instanceTargets.map((target) => target.id));
        for (const environment of environments) {
            if (!targetIds.has(environment.instanceTargetId)) {
                throw new Error(`Invalid v4 workspace config: environment "${environment.name}" references unknown instance target "${environment.instanceTargetId}".`);
            }
        }
        if (typeof raw.activeEnvironmentId === 'string' && raw.activeEnvironmentId && !environments.some((environment) => environment.id === raw.activeEnvironmentId)) {
            throw new Error(`Invalid v4 workspace config: activeEnvironmentId references unknown environment "${raw.activeEnvironmentId}".`);
        }
        return stripUndefined({
            version: 4 as const,
            activeEnvironmentId: typeof raw.activeEnvironmentId === 'string' ? raw.activeEnvironmentId : undefined,
            instanceTargets,
            environments,
        });
    }

    private sanitizeInstanceTarget(target: any, index: number): IWorkspaceInstanceTarget {
        if (!target || typeof target !== 'object') {
            throw new Error(`Invalid v4 workspace config: instance target at index ${index} must be an object.`);
        }
        const id = cleanOptional(target.id);
        const name = cleanOptional(target.name) || id;
        if (!id || !name) {
            throw new Error(`Invalid v4 workspace config: instance target at index ${index} needs id and name.`);
        }
        if (target.kind === 'global-ref') {
            if (target.instance) throw new Error(`Invalid v4 workspace config: global-ref target "${name}" must not embed instance details.`);
            const instanceRef = cleanOptional(target.instanceRef);
            if (!instanceRef) throw new Error(`Invalid v4 workspace config: global-ref target "${name}" needs instanceRef.`);
            return stripUndefined({ id, name, kind: 'global-ref' as const, instanceRef, description: cleanOptional(target.description) });
        }
        if (target.kind === 'embedded') {
            if (target.instanceRef) throw new Error(`Invalid v4 workspace config: embedded target "${name}" must not define instanceRef.`);
            if (target.instance?.apiKey || target.instance?.token || target.instance?.password || target.apiKey || target.token || target.password) {
                throw new Error(`Invalid v4 workspace config: embedded target "${name}" must not contain secrets.`);
            }
            if (target.instance?.mode && target.instance.mode !== 'existing') {
                throw new Error(`Invalid v4 workspace config: embedded target "${name}" must use mode "existing".`);
            }
            const baseUrl = cleanOptional(target.instance?.baseUrl);
            if (!baseUrl) throw new Error(`Invalid v4 workspace config: embedded target "${name}" needs instance.baseUrl.`);
            return stripUndefined({
                id,
                name,
                kind: 'embedded' as const,
                instance: stripUndefined({
                    mode: 'existing' as const,
                    baseUrl,
                    name: cleanOptional(target.instance?.name),
                    instanceIdentifier: this.canonicalInstanceIdentifier(target.instance?.instanceIdentifier),
                    verification: target.instance?.verification,
                }),
                description: cleanOptional(target.description),
            });
        }
        throw new Error(`Invalid v4 workspace config: instance target "${name}" has unsupported kind "${String(target.kind)}".`);
    }

    private assertUniqueIdsAndNames<T extends { id: string; name: string }>(items: T[], label: string): void {
        const ids = new Set<string>();
        const names = new Set<string>();
        for (const item of items) {
            if (ids.has(item.id)) throw new Error(`Invalid v4 workspace config: duplicate ${label} ID "${item.id}".`);
            ids.add(item.id);
            const name = item.name.toLowerCase();
            if (names.has(name)) throw new Error(`Invalid v4 workspace config: duplicate ${label} name "${item.name}".`);
            names.add(name);
        }
    }

    private assertUniqueEnvironmentSyncFolders(environments: IWorkspaceEnvironment[]): void {
        const folders = new Map<string, IWorkspaceEnvironment>();
        for (const environment of environments) {
            const folder = this.normalizeWorkspacePathKey(environment.syncFolder);
            const existing = folders.get(folder);
            if (existing) {
                throw new Error(`Invalid v4 workspace config: environments "${existing.name}" and "${environment.name}" share sync folder "${environment.syncFolder}". Each environment needs a dedicated sync folder.`);
            }
            folders.set(folder, environment);
        }
    }

    private normalizeWorkspacePathKey(value: string): string {
        return path.normalize(this.resolveWorkspacePath(value));
    }

    private sanitizeEnvironment(environment: any, index: number): IWorkspaceEnvironment {
        if (!environment || typeof environment !== 'object') {
            throw new Error(`Invalid v4 workspace config: environment at index ${index} must be an object.`);
        }
        const id = cleanOptional(environment.id);
        const name = cleanOptional(environment.name) || id;
        const instanceTargetId = cleanOptional(environment.instanceTargetId);
        const syncFolder = cleanOptional(environment.syncFolder);
        if (!id || !name || !instanceTargetId || !syncFolder) {
            throw new Error(`Invalid v4 workspace config: environment at index ${index} needs id, name, instanceTargetId, and syncFolder.`);
        }
        return stripUndefined({
            id,
            name,
            instanceTargetId,
            projectId: cleanOptional(environment.projectId),
            projectName: cleanOptional(environment.projectName),
            syncFolder,
            folderSync: typeof environment.folderSync === 'boolean' ? environment.folderSync : undefined,
            customNodesPath: cleanOptional(environment.customNodesPath),
            description: cleanOptional(environment.description),
        });
    }

    private v3ToV4WorkspaceConfig(): IPersistedWorkspaceConfigV4 {
        const overrides = tryResolve(() => this.manager.readWorkspaceOverrides(this.workspaceRoot)) || { version: 3 as const };
        const hasWorkspaceOverrides = Boolean(
            overrides.activeInstanceId
            || overrides.syncFolder
            || overrides.projectId
            || overrides.projectName
            || overrides.folderSync !== undefined
            || overrides.customNodesPath
        );
        const instanceRef = hasWorkspaceOverrides ? (overrides.activeInstanceId || this.manager.getGlobalConfig().activeInstanceId) : undefined;
        const instanceTargets: IWorkspaceInstanceTarget[] = instanceRef
            ? [{ id: 'default-instance', name: 'Default Instance', kind: 'global-ref', instanceRef }]
            : [];
        const environments: IWorkspaceEnvironment[] = instanceRef
            ? [stripUndefined({
                id: 'default',
                name: 'Default',
                instanceTargetId: 'default-instance',
                projectId: overrides.projectId,
                projectName: overrides.projectName,
                syncFolder: overrides.syncFolder || 'workflows',
                folderSync: overrides.folderSync,
                customNodesPath: overrides.customNodesPath,
            })]
            : [];
        return {
            version: 4,
            activeEnvironmentId: environments[0]?.id,
            instanceTargets,
            environments,
        };
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

    private findInstanceTarget(config: IPersistedWorkspaceConfigV4, nameOrId: string): IWorkspaceInstanceTarget {
        const key = cleanRequired(nameOrId, 'Instance target');
        const byId = config.instanceTargets.find((target) => target.id === key);
        if (byId) return byId;
        const matches = config.instanceTargets.filter((target) => target.name.toLowerCase() === key.toLowerCase());
        if (matches.length === 1) return matches[0];
        if (matches.length > 1) throw new Error(`Ambiguous instance target name: ${key}`);
        throw new Error(`Unknown workspace instance target: ${key}`);
    }

    private resolveEnvironmentFromTarget(environment: IWorkspaceEnvironment, target: IWorkspaceInstanceTarget, source: IResolvedWorkspaceEnvironment['sources']['environment']): IResolvedWorkspaceEnvironment {
        const syncFolder = this.resolveWorkspacePath(environment.syncFolder);
        if (target.kind === 'global-ref') {
            const instance = this.manager.getInstance(target.instanceRef);
            if (!instance) throw new Error(`Workspace environment "${environment.name}" references missing global n8n-manager instance: ${target.instanceRef}`);
            const host = instance.tunnelPublicUrl || instance.baseUrl || '';
            const envApiKey = this.readEnvApiKey(environment, target);
            const globalApiKey = this.manager.getApiKey(instance.id);
            const apiKey = envApiKey || globalApiKey;
            const projectId = environment.projectId || instance.defaultProject?.id;
            const projectName = environment.projectName || instance.defaultProject?.name;
            const instanceIdentifier = this.canonicalInstanceIdentifier(instance.instanceIdentifier);
            return {
                environment,
                instanceTarget: target,
                environmentId: environment.id,
                environmentName: environment.name,
                instanceTargetId: target.id,
                instanceTargetName: target.name,
                activeInstanceId: instance.id,
                activeInstanceName: instance.name,
                targetKind: 'global-ref',
                globalInstanceId: instance.id,
                instance: this.toInstanceProfile(instance),
                host,
                apiKey,
                apiKeySource: envApiKey ? 'env' : globalApiKey ? 'global' : 'missing',
                apiKeyAvailable: Boolean(apiKey),
                accessStatus: this.deriveAccessStatus({ host, apiKey, projectId, projectName, verification: envApiKey ? undefined : instance.verification }),
                syncFolder,
                projectId,
                projectName,
                instanceIdentifier,
                workflowDir: this.buildWorkflowDir(syncFolder, instanceIdentifier, projectName),
                folderSync: environment.folderSync ?? false,
                customNodesPath: environment.customNodesPath,
                sources: {
                    environment: source,
                    instance: 'global-ref',
                    project: environment.projectId || environment.projectName ? 'environment' : instance.defaultProject ? 'instance-default' : 'missing',
                    syncFolder: 'environment',
                },
            };
        }

        const host = target.instance.baseUrl;
        const envApiKey = this.readEnvApiKey(environment, target);
        const workspaceApiKey = this.manager.getApiKey(target.id);
        const globalApiKey = this.getApiKey(host);
        const apiKey = envApiKey || workspaceApiKey || globalApiKey;
        const instanceIdentifier = this.canonicalInstanceIdentifier(target.instance.instanceIdentifier);
        return {
            environment,
            instanceTarget: target,
            environmentId: environment.id,
            environmentName: environment.name,
            instanceTargetId: target.id,
            instanceTargetName: target.name,
            activeInstanceName: target.name,
            targetKind: 'embedded',
            instance: target.instance,
            host,
            apiKey,
            apiKeySource: envApiKey ? 'env' : workspaceApiKey ? 'workspace-local' : globalApiKey ? 'global' : 'missing',
            apiKeyAvailable: Boolean(apiKey),
            accessStatus: this.deriveAccessStatus({ host, apiKey, projectId: environment.projectId, projectName: environment.projectName, verification: target.instance.verification }),
            syncFolder,
            projectId: environment.projectId,
            projectName: environment.projectName,
            instanceIdentifier,
            workflowDir: this.buildWorkflowDir(syncFolder, instanceIdentifier, environment.projectName),
            folderSync: environment.folderSync ?? false,
            customNodesPath: environment.customNodesPath,
            sources: {
                environment: source,
                instance: 'embedded',
                project: environment.projectId || environment.projectName ? 'environment' : 'missing',
                syncFolder: 'environment',
            },
        };
    }

    private readEnvApiKey(environment: IWorkspaceEnvironment, target: IWorkspaceInstanceTarget): string | undefined {
        const candidates = [
            `N8NAC_ENV_${envVarSlug(environment.id)}_API_KEY`,
            `N8NAC_ENV_${envVarSlug(environment.name)}_API_KEY`,
            `N8NAC_TARGET_${envVarSlug(target.id)}_API_KEY`,
            `N8NAC_TARGET_${envVarSlug(target.name)}_API_KEY`,
        ];
        for (const key of candidates) {
            const value = process.env[key]?.trim().replace(/^['"]|['"]$/g, '');
            if (value) return value;
        }
        return undefined;
    }

    private readTargetEnvApiKey(target: IWorkspaceInstanceTarget): string | undefined {
        const candidates = [
            `N8NAC_TARGET_${envVarSlug(target.id)}_API_KEY`,
            `N8NAC_TARGET_${envVarSlug(target.name)}_API_KEY`,
        ];
        for (const key of candidates) {
            const value = process.env[key]?.trim().replace(/^["']|["']$/g, '');
            if (value) return value;
        }
        return undefined;
    }

    private resolveExistingGlobalInstanceRef(instanceRef: unknown): string {
        const cleaned = cleanRequired(instanceRef, 'Global instance reference');
        const instance = this.manager.getInstance(cleaned);
        if (!instance) {
            throw new Error(`Unknown global n8n-manager instance: ${cleaned}`);
        }
        return instance.id;
    }

    private environmentToLocalConfig(environment: IResolvedWorkspaceEnvironment): Partial<ILocalConfig> {
        return stripUndefined({
            host: environment.host,
            syncFolder: environment.syncFolder,
            projectId: environment.projectId,
            projectName: environment.projectName,
            instanceIdentifier: environment.instanceIdentifier,
            workflowDir: environment.workflowDir,
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
            targetKind: resolved.targetKind,
            instanceTargetName: resolved.instanceTargetName,
            globalInstanceId: resolved.globalInstanceId,
            instanceName: resolved.activeInstanceName,
            baseUrl: resolved.targetKind === 'embedded' ? resolved.host : undefined,
            workflowDir: resolved.workflowDir,
            apiKeyAvailable: resolved.apiKeyAvailable,
            credentialSource: resolved.apiKeySource,
            accessStatus: resolved.accessStatus,
        });
    }

    private instanceTargetToSnapshot(target: IWorkspaceInstanceTarget): IWorkspaceInstanceTarget {
        if (target.kind === 'global-ref') {
            const instance = this.manager.getInstance(target.instanceRef);
            if (!instance) {
                return stripUndefined({
                    ...target,
                    globalInstanceId: target.instanceRef,
                    apiKeyAvailable: false,
                    credentialSource: 'missing' as const,
                    accessStatus: 'runtime-unavailable' as const,
                });
            }
            const host = instance.tunnelPublicUrl || instance.baseUrl || '';
            const envApiKey = this.readTargetEnvApiKey(target);
            const globalApiKey = this.manager.getApiKey(instance.id);
            const apiKey = envApiKey || globalApiKey;
            return stripUndefined({
                ...target,
                globalInstanceId: instance.id,
                instanceName: instance.name,
                baseUrl: host,
                apiKeyAvailable: Boolean(apiKey),
                credentialSource: envApiKey ? 'env' as const : globalApiKey ? 'global' as const : 'missing' as const,
                accessStatus: this.deriveAccessStatus({ host, apiKey, verification: envApiKey ? undefined : instance.verification }),
            });
        }

        const host = target.instance.baseUrl;
        const envApiKey = this.readTargetEnvApiKey(target);
        const workspaceApiKey = this.manager.getApiKey(target.id);
        const globalApiKey = this.getApiKey(host);
        const apiKey = envApiKey || workspaceApiKey || globalApiKey;
        return stripUndefined({
            ...target,
            baseUrl: host,
            apiKeyAvailable: Boolean(apiKey),
            credentialSource: envApiKey ? 'env' as const : workspaceApiKey ? 'workspace-local' as const : globalApiKey ? 'global' as const : 'missing' as const,
            accessStatus: this.deriveAccessStatus({ host, apiKey, verification: target.instance.verification }),
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
            id: environment.activeInstanceId || environment.instanceTargetId,
            name: environment.activeInstanceName || environment.instanceTargetName,
            host: environment.host,
            syncFolder: environment.syncFolder,
            projectId: environment.projectId,
            projectName: environment.projectName,
            instanceIdentifier: environment.instanceIdentifier,
            workflowDir: environment.workflowDir,
            customNodesPath: environment.customNodesPath,
            folderSync: environment.folderSync,
        });
    }

    private resolvedEnvironmentToEffectiveContext(environment?: IResolvedWorkspaceEnvironment): EffectiveN8nContext | undefined {
        if (!environment) return undefined;
        return {
            instance: {
                id: environment.activeInstanceId || environment.instanceTargetId,
                name: environment.activeInstanceName || environment.instanceTargetName,
                mode: environment.targetKind === 'embedded' ? 'existing' : 'existing',
                baseUrl: environment.host,
                instanceIdentifier: environment.instanceIdentifier,
                defaultProject: environment.projectId && environment.projectName ? { id: environment.projectId, name: environment.projectName } : undefined,
            } as GlobalN8nInstance,
            activeInstanceId: environment.activeInstanceId || environment.instanceTargetId,
            activeInstanceName: environment.activeInstanceName || environment.instanceTargetName,
            apiBaseUrl: environment.host,
            host: environment.host,
            baseUrl: environment.host,
            apiKey: environment.apiKey,
            syncFolder: environment.syncFolder,
            projectId: environment.projectId,
            projectName: environment.projectName,
            instanceIdentifier: environment.instanceIdentifier,
            folderSync: environment.folderSync ?? false,
            customNodesPath: environment.customNodesPath,
            environmentId: environment.environmentId,
            environmentName: environment.environmentName,
            instanceTargetId: environment.instanceTargetId,
            instanceTargetName: environment.instanceTargetName,
            targetKind: environment.targetKind,
            apiKeySource: environment.apiKeySource,
            sources: {
                instance: environment.targetKind === 'global-ref' ? 'workspace' : 'explicit',
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

    private async resolveInstanceIdentifier(host: string, apiKey: string, client?: IInstanceVerificationClient): Promise<string> {
        const { identifier } = await resolveInstanceIdentifier({ host, apiKey }, {
            client: client as any,
        });
        return identifier;
    }

    private writeWorkspaceFields(instanceId: string, config: Partial<ILocalConfig>, setActive: boolean): void {
        const current = tryResolve(() => this.manager.readWorkspaceOverrides(this.workspaceRoot)) || { version: 3 as const };
        this.manager.writeWorkspaceOverrides(this.workspaceRoot, {
            ...current,
            activeInstanceId: setActive ? instanceId : current.activeInstanceId,
            syncFolder: config.syncFolder || current.syncFolder,
            projectId: config.projectId || current.projectId,
            projectName: config.projectName || current.projectName,
            folderSync: config.folderSync ?? current.folderSync,
            customNodesPath: config.customNodesPath || current.customNodesPath,
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

    private resolveWorkspaceContext(instanceId?: string): EffectiveN8nContext {
        const context = this.manager.resolveEffectiveContext({
            workspaceRoot: this.workspaceRoot,
            instanceId,
            syncFolderDefault: 'workspace',
        });
        return {
            ...context,
        };
    }

    private toInstanceProfile(instance: GlobalN8nInstance, overrides?: Partial<ILocalConfig>): IInstanceProfile {
        return {
            id: instance.id,
            name: instance.name,
            host: instance.tunnelPublicUrl || instance.baseUrl,
            syncFolder: overrides?.syncFolder,
            projectId: overrides?.projectId || instance.defaultProject?.id,
            projectName: overrides?.projectName || instance.defaultProject?.name,
            instanceIdentifier: this.canonicalInstanceIdentifier(instance.instanceIdentifier),
            customNodesPath: overrides?.customNodesPath,
            folderSync: overrides?.folderSync,
            verification: instance.verification,
        };
    }

    private contextToInstanceProfile(context: EffectiveN8nContext): IInstanceProfile {
        const instanceIdentifier = context.instanceIdentifier;
        return {
            ...this.toInstanceProfile(context.instance),
            host: context.host,
            syncFolder: context.syncFolder,
            projectId: context.projectId,
            projectName: context.projectName,
            instanceIdentifier,
            workflowDir: this.buildWorkflowDir(context.syncFolder, instanceIdentifier, context.projectName),
            customNodesPath: context.customNodesPath,
            folderSync: context.folderSync,
        };
    }

    private contextToLocalConfig(context: EffectiveN8nContext): Partial<ILocalConfig> {
        return this.toLocalConfig(this.contextToInstanceProfile(context));
    }

    private toLocalConfig(profile?: Partial<ILocalConfig>): Partial<ILocalConfig> {
        if (!profile) return {};
        const workflowDir = profile.workflowDir || this.buildWorkflowDir(
            profile.syncFolder,
            profile.instanceIdentifier,
            profile.projectName,
        );
        return stripUndefined({
            host: profile.host,
            syncFolder: profile.syncFolder,
            projectId: profile.projectId,
            projectName: profile.projectName,
            instanceIdentifier: profile.instanceIdentifier,
            workflowDir,
            customNodesPath: profile.customNodesPath,
            folderSync: profile.folderSync,
        });
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

    private buildWorkflowDir(syncFolder?: string, instanceIdentifier?: string, projectName?: string): string | undefined {
        return syncFolder && instanceIdentifier && projectName
            ? path.join(syncFolder, instanceIdentifier, createProjectSlug(projectName))
            : undefined;
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
