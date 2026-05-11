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

export interface IManagedEnvironmentTarget {
    id: string;
    name: string;
    kind: 'managed-instance';
    managedInstanceId: string;
    description?: string;
    managedInstanceName?: string;
    url?: string;
    instanceName?: string;
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
    verification?: IInstanceVerification;
    description?: string;
    apiKeyAvailable?: boolean;
    credentialSource?: 'env' | 'workspace-local' | 'global' | 'missing';
    accessStatus?: EnvironmentAccessStatus;
}

export type IEnvironmentTarget = IManagedEnvironmentTarget | IExternalEnvironmentTarget;

export interface IWorkspaceEnvironment {
    id: string;
    name: string;
    environmentTargetId: string;
    projectId?: string;
    projectName?: string;
    syncFolder: string;
    folderSync?: boolean;
    customNodesPath?: string;
    description?: string;
    sourceKind?: 'managed-instance' | 'external-instance';
    environmentTargetName?: string;
    managedInstanceId?: string;
    instanceName?: string;
    url?: string;
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
    environmentTargets: IEnvironmentTarget[];
    environments: IWorkspaceEnvironment[];
}

export interface IWorkspaceConfig extends ILocalConfig {
    version: 3 | 4;
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
    syncFolder: string;
    instanceIdentifier?: string;
    workflowDir?: string;
    sources: {
        environment: 'explicit' | 'workspace-default' | 'legacy' | 'global-fallback';
        instance: 'managed-instance' | 'external-instance';
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

export interface IGlobalInstancesMigrationInstance {
    id: string;
    name: string;
    mode: 'external-instance' | 'managed-instance';
    url?: string;
    projectId?: string;
    projectName?: string;
    apiKeyAvailable: boolean;
}

export interface IGlobalInstancesMigrationPlan {
    status: 'global-instances-detected';
    configPath: string;
    activeInstanceId?: string;
    instances: IGlobalInstancesMigrationInstance[];
    warnings: string[];
}

export type IGlobalInstancesMigrationResult =
    | { status: 'not-needed'; configPath: string }
    | { status: 'dry-run'; plan: IGlobalInstancesMigrationPlan }
    | { status: 'migrated'; plan: IGlobalInstancesMigrationPlan; migratedEnvironmentIds: string[]; deletedGlobalInstanceIds: string[] };

export interface IWorkspaceMigrationPlan {
    status: 'migration-required';
    configPath: string;
    legacyMigration?: ILegacyWorkspaceMigrationPlan;
    globalInstancesMigration?: IGlobalInstancesMigrationPlan;
    warnings: string[];
}

export type IWorkspaceMigrationResult =
    | { status: 'not-needed'; configPath: string }
    | { status: 'dry-run'; plan: IWorkspaceMigrationPlan }
    | {
        status: 'migrated';
        plan: IWorkspaceMigrationPlan;
        legacyMigration?: Extract<ILegacyWorkspaceMigrationResult, { status: 'migrated' }>;
        globalInstancesMigration?: Extract<IGlobalInstancesMigrationResult, { status: 'migrated' }>;
        backupPath?: string;
        migratedEnvironmentIds: string[];
        deletedGlobalInstanceIds: string[];
    };

export interface IWorkspaceMigrationOptions {
    write?: boolean;
    legacyApiKeyFallback?: { host?: string; apiKey?: string };
}

export interface IWorkspaceMigrationReportInstance {
    id: string;
    name: string;
    kind: 'legacy-workspace-instance' | 'managed-instance' | 'external-instance';
    url?: string;
    projectId?: string;
    projectName?: string;
    apiKeyAvailable?: boolean;
}

export interface IWorkspaceMigrationReportOperation {
    id: 'legacy-workspace-config' | 'global-instances';
    label: string;
    description: string;
    instanceCount: number;
    instances: IWorkspaceMigrationReportInstance[];
    warnings: string[];
}

export interface IWorkspaceMigrationReport {
    status: IWorkspaceMigrationResult['status'];
    configPath: string;
    required: boolean;
    operations: IWorkspaceMigrationReportOperation[];
    warnings: string[];
    nextCommand?: string;
    applyCommand?: string;
    backupPath?: string;
    migratedEnvironmentIds?: string[];
    deletedGlobalInstanceIds?: string[];
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
                'Run `n8nac workspace migrate --json` to inspect it, then `n8nac workspace migrate --write` to migrate it after confirmation.'
            );
        }
        const persisted = this.readWorkspaceConfigFile();
        if (persisted.version === 4) {
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
        syncFolder: string;
        id?: string;
        folderSync?: boolean;
        customNodesPath?: string;
        description?: string;
    }): IWorkspaceEnvironment {
        const config = this.ensureV4WorkspaceConfig();
        const name = cleanRequired(input.name, 'Environment name');
        const target = this.findInstanceTarget(config, input.environmentTarget);
        const id = this.uniqueWorkspaceId(input.id || this.slugId(name), [
            ...config.environmentTargets.map((item) => item.id),
            ...config.environments.map((item) => item.id),
        ]);
        this.assertUniqueName(name, config.environments, 'environment');

        const environment: IWorkspaceEnvironment = {
            id,
            name,
            environmentTargetId: target.id,
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

    updateEnvironment(nameOrId: string, patch: Partial<Pick<IWorkspaceEnvironment, 'name' | 'projectId' | 'projectName' | 'syncFolder' | 'folderSync' | 'customNodesPath' | 'description'>> & { environmentTarget?: string }): IWorkspaceEnvironment {
        const config = this.ensureV4WorkspaceConfig();
        const environment = this.findEnvironment(config, nameOrId);
        const target = patch.environmentTarget ? this.findInstanceTarget(config, patch.environmentTarget) : undefined;
        const nextName = cleanOptional(patch.name) || environment.name;
        if (nextName.toLowerCase() !== environment.name.toLowerCase()) {
            this.assertUniqueName(nextName, config.environments.filter((item) => item.id !== environment.id), 'environment');
        }
        const nextEnvironment: IWorkspaceEnvironment = stripUndefined({
            ...environment,
            name: nextName,
            environmentTargetId: target?.id || environment.environmentTargetId,
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

    getInstanceTarget(nameOrId: string): IEnvironmentTarget {
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
        const target = this.findInstanceTarget(config, environment.environmentTargetId);
        return this.resolveEnvironmentFromTarget(environment, target, environmentNameOrId ? 'explicit' : config.activeEnvironmentId ? 'workspace-default' : persisted.version === 4 ? 'workspace-default' : 'legacy');
    }

    async prepareEnvironment(environmentNameOrId?: string): Promise<IResolvedWorkspaceEnvironment> {
        const resolved = this.resolveEnvironment(environmentNameOrId);
        if (resolved.sourceKind === 'external-instance') {
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
        if (effective?.sourceKind === 'managed-instance' && effective.activeInstanceId) {
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
        const externalInstance = this.manager.listInstances().find((candidate) => {
            return candidate.mode !== 'managed-local-docker'
                && (this.normalizeHost(candidate.baseUrl || '') === normalized || this.normalizeHost(candidate.tunnelPublicUrl || '') === normalized);
        });
        const instanceIdentifier = input.apiKey ? this.resolveInstanceIdentifierFromApiKey(input.apiKey) : undefined;
        const saved = this.manager.upsertInstance({
            id: externalInstance?.id,
            name: input.name || externalInstance?.name || host,
            mode: 'existing',
            baseUrl: host,
            apiKey: input.apiKey,
            instanceIdentifier: instanceIdentifier || externalInstance?.instanceIdentifier,
            defaultProject: externalInstance?.defaultProject,
            verification: externalInstance?.verification,
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
                : 'No externalInstance API keys found: you may need to run n8n-manager auth set after migration.',
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
            const environmentTargets: IEnvironmentTarget[] = [];
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
                const syncFolder = this.uniqueEnvironmentSyncFolder(legacy.syncFolder || plan.workspace.syncFolder || 'workflows', environments, environmentName);

                environmentTargets.push({
                    id: targetId,
                    name: targetName,
                    kind: 'external-instance',
                    url: cleanRequired(profile.host || legacy.host, 'Legacy instance URL'),
                    instanceIdentifier: profile.instanceIdentifier || legacy.instanceIdentifier,
                    verification: legacy.verification,
                });
                environments.push(stripUndefined({
                    id: environmentId,
                    name: environmentName,
                    environmentTargetId: targetId,
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
                environmentTargets,
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

    detectWorkspaceMigration(): IWorkspaceMigrationPlan | undefined {
        const configPath = this.getInstanceConfigPath();
        const legacyMigration = this.detectLegacyWorkspaceConfig();
        const globalInstancesMigration = this.detectGlobalInstancesMigration();
        if (!legacyMigration && !globalInstancesMigration) return undefined;
        return {
            status: 'migration-required',
            configPath,
            legacyMigration,
            globalInstancesMigration,
            warnings: [
                ...(legacyMigration?.warnings || []),
                ...(globalInstancesMigration?.warnings || []),
            ],
        };
    }

    migrateWorkspaceConfiguration(options: IWorkspaceMigrationOptions = {}): IWorkspaceMigrationResult {
        const initialPlan = this.detectWorkspaceMigration();
        const configPath = this.getInstanceConfigPath();
        if (!initialPlan) return { status: 'not-needed', configPath };
        if (!options.write) return { status: 'dry-run', plan: initialPlan };

        const snapshot = this.createWorkspaceMigrationSnapshot();
        try {
            let legacyMigration: Extract<ILegacyWorkspaceMigrationResult, { status: 'migrated' }> | undefined;
            if (initialPlan.legacyMigration) {
                const legacyResult = this.migrateLegacyWorkspaceConfig({ write: true });
                if (legacyResult.status === 'migrated') {
                    legacyMigration = legacyResult;
                    this.preserveWorkspaceMigrationApiKeyFallback(options.legacyApiKeyFallback, legacyResult.instances);
                }
            }

            const currentGlobalPlan = this.detectGlobalInstancesMigration();
            let globalInstancesMigration: Extract<IGlobalInstancesMigrationResult, { status: 'migrated' }> | undefined;
            if (currentGlobalPlan) {
                const globalResult = this.migrateGlobalInstancesToEnvironments({ write: true });
                if (globalResult.status === 'migrated') {
                    globalInstancesMigration = globalResult;
                }
            }

            const remainingPlan = this.detectWorkspaceMigration();
            if (remainingPlan) {
                throw new Error(this.formatIncompleteWorkspaceMigrationError(remainingPlan));
            }

            return {
                status: 'migrated',
                plan: initialPlan,
                legacyMigration,
                globalInstancesMigration,
                backupPath: legacyMigration?.backupPath,
                migratedEnvironmentIds: globalInstancesMigration?.migratedEnvironmentIds || [],
                deletedGlobalInstanceIds: globalInstancesMigration?.deletedGlobalInstanceIds || [],
            };
        } catch (error) {
            this.restoreWorkspaceMigrationSnapshot(snapshot);
            throw error;
        }
    }

    toWorkspaceMigrationReport(result: IWorkspaceMigrationResult): IWorkspaceMigrationReport {
        if (result.status === 'not-needed') {
            return {
                status: result.status,
                configPath: result.configPath,
                required: false,
                operations: [],
                warnings: [],
            };
        }

        return {
            status: result.status,
            configPath: result.plan.configPath,
            required: result.status === 'dry-run',
            operations: this.workspaceMigrationPlanToOperations(result.plan),
            warnings: result.plan.warnings,
            nextCommand: result.status === 'dry-run' ? 'n8nac workspace migrate --json' : undefined,
            applyCommand: result.status === 'dry-run' ? 'n8nac workspace migrate --write' : undefined,
            backupPath: result.status === 'migrated' ? result.backupPath : undefined,
            migratedEnvironmentIds: result.status === 'migrated' ? result.migratedEnvironmentIds : undefined,
            deletedGlobalInstanceIds: result.status === 'migrated' ? result.deletedGlobalInstanceIds : undefined,
        };
    }

    workspaceMigrationPlanToReport(plan: IWorkspaceMigrationPlan): IWorkspaceMigrationReport {
        return {
            status: 'dry-run',
            configPath: plan.configPath,
            required: true,
            operations: this.workspaceMigrationPlanToOperations(plan),
            warnings: plan.warnings,
            nextCommand: 'n8nac workspace migrate --json',
            applyCommand: 'n8nac workspace migrate --write',
        };
    }

    private workspaceMigrationPlanToOperations(plan: IWorkspaceMigrationPlan): IWorkspaceMigrationReportOperation[] {
        const operations: IWorkspaceMigrationReportOperation[] = [];
        if (plan.legacyMigration) {
            operations.push({
                id: 'legacy-workspace-config',
                label: 'Legacy workspace config',
                description: 'Convert legacy n8nac workspace config into workspace environments and local n8n-manager secrets.',
                instanceCount: plan.legacyMigration.instances.length,
                instances: plan.legacyMigration.instances.map((instance) => stripUndefined({
                    id: instance.id,
                    name: instance.name,
                    kind: 'legacy-workspace-instance' as const,
                    url: instance.host,
                    projectId: instance.projectId,
                    projectName: instance.projectName,
                    apiKeyAvailable: instance.hasApiKey,
                })),
                warnings: plan.legacyMigration.warnings,
            });
        }
        if (plan.globalInstancesMigration) {
            operations.push({
                id: 'global-instances',
                label: 'Global/v2 instances',
                description: 'Attach managed instances to this workspace and copy external global instances into workspace environments.',
                instanceCount: plan.globalInstancesMigration.instances.length,
                instances: plan.globalInstancesMigration.instances.map((instance) => stripUndefined({
                    id: instance.id,
                    name: instance.name,
                    kind: instance.mode,
                    url: instance.url,
                    projectId: instance.projectId,
                    projectName: instance.projectName,
                    apiKeyAvailable: instance.apiKeyAvailable,
                })),
                warnings: plan.globalInstancesMigration.warnings,
            });
        }
        return operations;
    }

    detectGlobalInstancesMigration(): IGlobalInstancesMigrationPlan | undefined {
        const configPath = this.getInstanceConfigPath();
        const global = this.manager.getGlobalConfig();
        const workspace = this.readWorkspaceConfigFileSafe();
        const environmentTargetIds = new Set(workspace.environments.map((environment) => environment.environmentTargetId));
        const instances = global.instances
            .filter((instance) => {
                if (this.getGlobalExternalInstanceUrl(instance)) return true;
                if (instance.mode !== 'managed-local-docker') return false;
                const migratedTarget = workspace.environmentTargets.find((target) => {
                    return target.kind === 'managed-instance'
                        && target.managedInstanceId === instance.id
                        && environmentTargetIds.has(target.id);
                });
                return !migratedTarget
                    && instance.metadata?.n8nacWorkspaceEnvironmentModel !== 'v4';
            })
            .map((instance) => stripUndefined({
                id: instance.id,
                name: instance.name || this.getGlobalExternalInstanceUrl(instance) || instance.id,
                mode: instance.mode === 'managed-local-docker' ? 'managed-instance' as const : 'external-instance' as const,
                url: this.getGlobalExternalInstanceUrl(instance) || '',
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
                'Global n8n instances belong to the previous v2 workspace model.',
                'Migration will copy external instances into this workspace as environments, move API keys to workspace target secrets, then remove the old external global instance entries.',
                'Managed instances will be added to this workspace as environments and will stay global.',
            ],
        };
    }

    migrateGlobalInstancesToEnvironments(options: { write?: boolean } = {}): IGlobalInstancesMigrationResult {
        const plan = this.detectGlobalInstancesMigration();
        const configPath = this.getInstanceConfigPath();
        if (!plan) return { status: 'not-needed', configPath };
        if (!options.write) return { status: 'dry-run', plan };

        const current = this.readWorkspaceConfigFileSafe();
        const usedIds = [
            ...current.environmentTargets.map((item) => item.id),
            ...current.environments.map((item) => item.id),
        ];
        const targetNames = new Set(current.environmentTargets.map((item) => item.name));
        const environmentNames = new Set(current.environments.map((item) => item.name));
        const environmentTargets = [...current.environmentTargets];
        const environments = [...current.environments];
        const migratedEnvironmentIds: string[] = [];
        const deletedGlobalInstanceIds: string[] = [];
        let activeMigratedEnvironmentId: string | undefined;

        for (const item of plan.instances) {
            const instance = this.manager.getInstance(item.id);
            if (!instance) continue;
            if (instance.mode === 'managed-local-docker') {
                const existingTarget = environmentTargets.find((target) => target.kind === 'managed-instance' && target.managedInstanceId === instance.id);
                let targetId = existingTarget?.id;
                if (!targetId) {
                    const targetName = this.uniqueDisplayName(instance.name || instance.id, targetNames);
                    targetId = this.uniqueWorkspaceId(instance.id, usedIds);
                    usedIds.push(targetId);
                    environmentTargets.push({
                        id: targetId,
                        name: targetName,
                        kind: 'managed-instance',
                        managedInstanceId: instance.id,
                    });
                }

                let existingEnvironment = environments.find((environment) => environment.environmentTargetId === targetId);
                if (!existingEnvironment) {
                    const environmentName = this.uniqueDisplayName(instance.name || instance.id, environmentNames);
                    const environmentId = this.uniqueWorkspaceId(instance.id || environmentName, usedIds);
                    usedIds.push(environmentId);
                    const syncFolder = this.uniqueEnvironmentSyncFolder(`workflows/${this.slugId(environmentName)}`, environments, environmentName);
                    existingEnvironment = stripUndefined({
                        id: environmentId,
                        name: environmentName,
                        environmentTargetId: targetId,
                        projectId: instance.defaultProject?.id || 'personal',
                        projectName: instance.defaultProject?.name || 'Personal',
                        syncFolder,
                    });
                    environments.push(existingEnvironment);
                    migratedEnvironmentIds.push(environmentId);
                }
                if (instance.id === plan.activeInstanceId) activeMigratedEnvironmentId = existingEnvironment.id;
                continue;
            }

            const externalUrl = this.getGlobalExternalInstanceUrl(instance);
            if (!externalUrl) continue;
            const apiKey = this.manager.getApiKey(instance.id);
            const normalizedBaseUrl = this.normalizeHost(externalUrl);
            const existingTargetIndex = environmentTargets.findIndex((target) => {
                if (target.kind === 'managed-instance') return target.managedInstanceId === instance.id;
                return this.normalizeHost(target.url) === normalizedBaseUrl;
            });
            if (existingTargetIndex >= 0) {
                const existingTarget = environmentTargets[existingTargetIndex];
                if (existingTarget.kind === 'managed-instance') {
                    environmentTargets[existingTargetIndex] = {
                        id: existingTarget.id,
                        name: existingTarget.name,
                        kind: 'external-instance',
                        url: externalUrl,
                        instanceIdentifier: instance.instanceIdentifier,
                        verification: instance.verification,
                        description: existingTarget.description,
                    };
                }
                if (apiKey) this.manager.saveApiKey(existingTarget.id, apiKey);
                let existingEnvironment = environments.find((environment) => environment.environmentTargetId === existingTarget.id);
                if (!existingEnvironment) {
                    const environmentName = this.uniqueDisplayName(instance.name || externalUrl || instance.id, environmentNames);
                    const environmentId = this.uniqueWorkspaceId(instance.id || environmentName, usedIds);
                    usedIds.push(environmentId);
                    const syncFolder = this.uniqueEnvironmentSyncFolder(`workflows/${this.slugId(environmentName)}`, environments, environmentName);
                    existingEnvironment = stripUndefined({
                        id: environmentId,
                        name: environmentName,
                        environmentTargetId: existingTarget.id,
                        projectId: instance.defaultProject?.id || 'personal',
                        projectName: instance.defaultProject?.name || 'Personal',
                        syncFolder,
                    });
                    environments.push(existingEnvironment);
                    migratedEnvironmentIds.push(environmentId);
                }
                if (instance.id === plan.activeInstanceId) activeMigratedEnvironmentId = existingEnvironment.id;
                continue;
            }
            const targetName = this.uniqueDisplayName(instance.name || externalUrl || instance.id, targetNames);
            const environmentName = this.uniqueDisplayName(instance.name || externalUrl || instance.id, environmentNames);
            const targetId = this.uniqueWorkspaceId(`${instance.id}-instance`, usedIds);
            usedIds.push(targetId);
            const environmentId = this.uniqueWorkspaceId(instance.id || environmentName, usedIds);
            usedIds.push(environmentId);
            const projectId = instance.defaultProject?.id || 'personal';
            const projectName = instance.defaultProject?.name || 'Personal';
            const preferredSyncFolder = environments.length === 0 && plan.instances.length === 1
                ? 'workflows'
                : `workflows/${this.slugId(environmentName)}`;
            const syncFolder = this.uniqueEnvironmentSyncFolder(preferredSyncFolder, environments, environmentName);

            environmentTargets.push({
                id: targetId,
                name: targetName,
                kind: 'external-instance',
                url: externalUrl,
                instanceIdentifier: instance.instanceIdentifier,
                verification: instance.verification,
            });
            environments.push(stripUndefined({
                id: environmentId,
                name: environmentName,
                environmentTargetId: targetId,
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
            environmentTargets,
            environments,
        }));

        for (const item of plan.instances) {
            const instance = this.manager.getInstance(item.id);
            if (instance && this.getGlobalExternalInstanceUrl(instance)) {
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
        return Boolean(asString(raw.host) || asString(raw.url) || asString(raw.baseUrl));
    }

    private toLegacyInstance(candidate: unknown, root: Record<string, unknown>, index: number, useRootActiveInstanceId: boolean): ILegacyWorkspaceMigrationInstance | undefined {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
            return undefined;
        }
        const value = candidate as Record<string, unknown>;
        const id = asString(value.id) || (useRootActiveInstanceId ? asString(root.activeInstanceId) : undefined) || `legacy-${index + 1}`;
        const host = asString(value.host) || asString(value.url) || asString(value.baseUrl) || asString(root.host) || asString(root.url) || asString(root.baseUrl);
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

    private createWorkspaceMigrationSnapshot(): Array<{ path: string; content?: Buffer }> {
        const managerPaths = this.manager as unknown as { instancesPath?: string; secretsPath?: string };
        const paths = [
            this.getInstanceConfigPath(),
            managerPaths.instancesPath,
            managerPaths.secretsPath,
        ].filter((value): value is string => Boolean(value));
        return paths.map((filePath) => ({
            path: filePath,
            content: fs.existsSync(filePath) ? fs.readFileSync(filePath) : undefined,
        }));
    }

    private restoreWorkspaceMigrationSnapshot(snapshot: Array<{ path: string; content?: Buffer }>): void {
        for (const entry of snapshot) {
            if (entry.content === undefined) {
                fs.rmSync(entry.path, { force: true });
                continue;
            }
            fs.mkdirSync(path.dirname(entry.path), { recursive: true });
            fs.writeFileSync(entry.path, entry.content);
        }
    }

    private formatIncompleteWorkspaceMigrationError(plan: IWorkspaceMigrationPlan): string {
        const legacyCount = plan.legacyMigration?.instances.length || 0;
        const globalCount = plan.globalInstancesMigration?.instances.length || 0;
        return [
            'Workspace migration did not complete atomically; all migration file changes were rolled back.',
            `Remaining legacy migration items: ${legacyCount}`,
            `Remaining global/v2 migration items: ${globalCount}`,
            'Run `n8nac workspace migrate --json` to inspect the remaining plan before retrying.',
        ].join(' ');
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
            return { version: 4, environmentTargets: [], environments: [] };
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
        const environments = rawEnvironments.map((environment, index) => this.sanitizeEnvironment(environment, index));
        this.assertUniqueIdsAndNames(environmentTargets, 'instance target');
        this.assertUniqueIdsAndNames(environments, 'environment');
        this.assertUniqueEnvironmentSyncFolders(environments);
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
                instanceIdentifier: this.canonicalInstanceIdentifier(target.instanceIdentifier || target.instance?.instanceIdentifier),
                verification: target.verification || target.instance?.verification,
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
            const externalInstance = folders.get(folder);
            if (externalInstance) {
                throw new Error(`Invalid v4 workspace config: environments "${externalInstance.name}" and "${environment.name}" share sync folder "${environment.syncFolder}". Each environment needs a dedicated sync folder.`);
            }
            folders.set(folder, environment);
        }
    }

    private normalizeWorkspacePathKey(value: string): string {
        return path.normalize(this.resolveWorkspacePath(value));
    }

    private uniqueEnvironmentSyncFolder(baseFolder: string, environments: IWorkspaceEnvironment[], suffix: string): string {
        const folder = cleanRequired(baseFolder, 'Sync folder');
        if (!this.hasEnvironmentSyncFolder(folder, environments)) return folder;

        const slug = this.slugId(suffix);
        let candidate = path.join(folder, slug);
        let counter = 2;
        while (this.hasEnvironmentSyncFolder(candidate, environments)) {
            candidate = path.join(folder, `${slug}-${counter}`);
            counter += 1;
        }
        return candidate;
    }

    private hasEnvironmentSyncFolder(folder: string, environments: IWorkspaceEnvironment[]): boolean {
        const normalized = this.normalizeWorkspacePathKey(folder);
        return environments.some((environment) => this.normalizeWorkspacePathKey(environment.syncFolder) === normalized);
    }

    private sanitizeEnvironment(environment: any, index: number): IWorkspaceEnvironment {
        if (!environment || typeof environment !== 'object') {
            throw new Error(`Invalid v4 workspace config: environment at index ${index} must be an object.`);
        }
        const id = cleanOptional(environment.id);
        const name = cleanOptional(environment.name) || id;
        const environmentTargetId = cleanOptional(environment.environmentTargetId) || cleanOptional(environment.instanceTargetId);
        const syncFolder = cleanOptional(environment.syncFolder);
        if (!id || !name || !environmentTargetId || !syncFolder) {
            throw new Error(`Invalid v4 workspace config: environment at index ${index} needs id, name, environmentTargetId, and syncFolder.`);
        }
        return stripUndefined({
            id,
            name,
            environmentTargetId,
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
        const managedInstanceId = hasWorkspaceOverrides ? (overrides.activeInstanceId || this.manager.getGlobalConfig().activeInstanceId) : undefined;
        const environmentTargets: IEnvironmentTarget[] = managedInstanceId
            ? [{ id: 'default-instance', name: 'Default Instance', kind: 'managed-instance', managedInstanceId }]
            : [];
        const environments: IWorkspaceEnvironment[] = managedInstanceId
            ? [stripUndefined({
                id: 'default',
                name: 'Default',
                environmentTargetId: 'default-instance',
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
            environmentTargets,
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

    private findInstanceTarget(config: IPersistedWorkspaceConfigV4, nameOrId: string): IEnvironmentTarget {
        const key = cleanRequired(nameOrId, 'Instance target');
        const byId = config.environmentTargets.find((target) => target.id === key);
        if (byId) return byId;
        const matches = config.environmentTargets.filter((target) => target.name.toLowerCase() === key.toLowerCase());
        if (matches.length === 1) return matches[0];
        if (matches.length > 1) throw new Error(`Ambiguous instance target name: ${key}`);
        throw new Error(`Unknown workspace instance target: ${key}`);
    }

    private resolveEnvironmentFromTarget(environment: IWorkspaceEnvironment, target: IEnvironmentTarget, source: IResolvedWorkspaceEnvironment['sources']['environment']): IResolvedWorkspaceEnvironment {
        const syncFolder = this.resolveWorkspacePath(environment.syncFolder);
        if (target.kind === 'managed-instance') {
            const instance = this.manager.getInstance(target.managedInstanceId);
            if (!instance) throw new Error(`Workspace environment "${environment.name}" references missing global n8n-manager instance: ${target.managedInstanceId}`);
            const host = instance.baseUrl || instance.tunnelPublicUrl || '';
            const envApiKey = this.readEnvApiKey(environment, target);
            const globalApiKey = this.manager.getApiKey(instance.id);
            const apiKey = envApiKey || globalApiKey;
            const projectId = environment.projectId || instance.defaultProject?.id;
            const projectName = environment.projectName || instance.defaultProject?.name;
            const instanceIdentifier = this.canonicalInstanceIdentifier(instance.instanceIdentifier);
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
                syncFolder,
                projectId,
                projectName,
                instanceIdentifier,
                workflowDir: this.buildWorkflowDir(syncFolder, instanceIdentifier, projectName),
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
        const instanceIdentifier = this.canonicalInstanceIdentifier(target.instanceIdentifier);
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
            syncFolder,
            projectId: environment.projectId,
            projectName: environment.projectName,
            instanceIdentifier,
            workflowDir: this.buildWorkflowDir(syncFolder, instanceIdentifier, environment.projectName),
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
            `N8NAC_TARGET_${envVarSlug(target.name)}_API_KEY`,
        ];
        for (const key of candidates) {
            const value = process.env[key]?.trim().replace(/^['"]|['"]$/g, '');
            if (value) return value;
        }
        return undefined;
    }

    private readTargetEnvApiKey(target: IEnvironmentTarget): string | undefined {
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
            sourceKind: resolved.sourceKind,
            environmentTargetName: resolved.environmentTargetName,
            managedInstanceId: resolved.managedInstanceId,
            instanceName: resolved.activeInstanceName,
            url: resolved.sourceKind === 'external-instance' ? resolved.host : undefined,
            workflowDir: resolved.workflowDir,
            apiKeyAvailable: resolved.apiKeyAvailable,
            credentialSource: resolved.apiKeySource,
            accessStatus: resolved.accessStatus,
        });
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
            return stripUndefined({
                ...target,
                managedInstanceId: instance.id,
                instanceName: instance.name,
                url: host,
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
        return stripUndefined({
            ...target,
            url: host,
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
                id: environment.activeInstanceId || environment.environmentTargetId,
                name: environment.activeInstanceName || environment.environmentTargetName,
                mode: 'existing',
                baseUrl: environment.host,
                instanceIdentifier: environment.instanceIdentifier,
                defaultProject: environment.projectId && environment.projectName ? { id: environment.projectId, name: environment.projectName } : undefined,
            } as GlobalN8nInstance,
            activeInstanceId: environment.activeInstanceId || environment.environmentTargetId,
            activeInstanceName: environment.activeInstanceName || environment.environmentTargetName,
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
            host: instance.baseUrl || instance.tunnelPublicUrl,
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

    private getGlobalExternalInstanceUrl(instance: GlobalN8nInstance): string | undefined {
        if (instance.mode === 'managed-local-docker' || instance.mode === 'generation-only') return undefined;
        const mode = String(instance.mode);
        if (mode !== 'existing' && mode !== 'external-instance') return undefined;
        const compatibilityUrl = (instance as GlobalN8nInstance & { url?: string }).url;
        return cleanOptional(instance.baseUrl) || cleanOptional(compatibilityUrl);
    }

    private preserveWorkspaceMigrationApiKeyFallback(fallback: IWorkspaceMigrationOptions['legacyApiKeyFallback'], migratedInstances: IInstanceProfile[]): void {
        const apiKey = fallback?.apiKey?.trim();
        if (!apiKey) return;
        const environment = this.resolveEnvironment();
        const environmentHost = this.normalizeHost(environment.host || '');
        if (!environmentHost) return;
        if (fallback?.host && this.normalizeHost(fallback.host) !== environmentHost) return;
        const migratedInstance = migratedInstances.find((instance) => this.normalizeHost(instance.host || '') === environmentHost);
        this.saveLocalConfig({ host: environmentHost }, {
            instanceId: migratedInstance?.id,
            instanceName: environment.activeInstanceName || environment.environmentTargetName,
            createNew: !migratedInstance?.id,
            setActive: false,
            apiKey,
        });
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
