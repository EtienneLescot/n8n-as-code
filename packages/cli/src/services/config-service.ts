import fs from 'fs';
import path from 'path';
import {
    N8nConfigurationService,
    N8nRuntimeOrchestrator,
    type EffectiveN8nContext,
    type GlobalN8nInstance,
    type N8nInstanceVerification,
    type N8nInstanceVerificationStatus,
} from '@n8n-as-code/n8n-manager-core';
import { N8nApiClient, createProjectSlug } from '../core/index.js';

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

export interface IWorkspaceConfig extends ILocalConfig {
    version: 3;
    activeInstanceId?: string;
    instances: IInstanceProfile[];
}

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

    getLocalConfig(): Partial<ILocalConfig> {
        this.manager.readWorkspaceOverrides(this.workspaceRoot);
        try {
            return this.contextToLocalConfig(this.resolveWorkspaceContext());
        } catch {
            return {};
        }
    }

    getWorkspaceConfig(): IWorkspaceConfig {
        const overrides = this.manager.readWorkspaceOverrides(this.workspaceRoot);
        const instances = this.listInstances();
        const effective = tryResolve(() => this.resolveWorkspaceContext());
        const activeInstanceId = effective?.activeInstanceId || overrides.activeInstanceId || this.manager.getGlobalConfig().activeInstanceId;
        const active = activeInstanceId ? instances.find((instance) => instance.id === activeInstanceId) : undefined;
        const activeProfile = effective ? this.contextToInstanceProfile(effective) : active;

        return {
            version: 3,
            activeInstanceId,
            instances,
            ...this.toLocalConfig({
                ...activeProfile,
                syncFolder: overrides.syncFolder || effective?.syncFolder,
                projectId: overrides.projectId || activeProfile?.projectId,
                projectName: overrides.projectName || activeProfile?.projectName,
                folderSync: overrides.folderSync ?? activeProfile?.folderSync,
                customNodesPath: overrides.customNodesPath || activeProfile?.customNodesPath,
            }),
        };
    }

    listInstanceConfigs(): IInstanceProfile[] {
        return this.listInstances();
    }

    listInstances(): IInstanceProfile[] {
        const overrides = tryResolve(() => this.manager.readWorkspaceOverrides(this.workspaceRoot));
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
        const effective = tryResolve(() => this.resolveWorkspaceContext());
        return effective ? this.contextToInstanceProfile(effective) : undefined;
    }

    getEffectiveInstanceConfig(instanceId?: string): IInstanceProfile | undefined {
        const effective = tryResolve(() => this.resolveWorkspaceContext(instanceId));
        return effective ? this.contextToInstanceProfile(effective) : undefined;
    }

    getEffectiveContext(instanceId?: string): EffectiveN8nContext | undefined {
        return tryResolve(() => this.resolveWorkspaceContext(instanceId));
    }

    async prepareWorkspaceContext(instanceId?: string): Promise<EffectiveN8nContext> {
        const prepared = await this.runtime.prepareEffectiveContext({
            workspaceRoot: this.workspaceRoot,
            instanceId,
            syncFolderDefault: 'workspace',
            consumer: 'cli',
            autoStart: true,
        });
        if (prepared.runtime.blocked) {
            throw new Error(prepared.runtime.blocked.message);
        }
        return prepared.context;
    }

    getCurrentInstanceConfigId(): string | undefined {
        return this.getActiveInstanceId();
    }

    getActiveInstanceId(): string | undefined {
        return this.getActiveInstance()?.id || this.manager.getGlobalConfig().activeInstanceId;
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
        const current = this.manager.readWorkspaceOverrides(this.workspaceRoot);
        this.manager.writeWorkspaceOverrides(this.workspaceRoot, {
            ...current,
            activeInstanceId: undefined,
        });
    }

    setWorkspaceSyncFolder(syncFolder: string): void {
        const current = this.manager.readWorkspaceOverrides(this.workspaceRoot);
        this.manager.writeWorkspaceOverrides(this.workspaceRoot, {
            ...current,
            syncFolder,
        });
    }

    clearWorkspaceSyncFolderOverride(): void {
        const current = this.manager.readWorkspaceOverrides(this.workspaceRoot);
        this.manager.writeWorkspaceOverrides(this.workspaceRoot, {
            ...current,
            syncFolder: undefined,
        });
    }

    setWorkspaceProject(project: { projectId: string; projectName: string }): void {
        const current = this.manager.readWorkspaceOverrides(this.workspaceRoot);
        this.manager.writeWorkspaceOverrides(this.workspaceRoot, {
            ...current,
            projectId: project.projectId,
            projectName: project.projectName,
        });
    }

    clearWorkspaceProjectOverride(): void {
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
        const profile = this.saveLocalConfig({
            ...input,
            instanceIdentifier: input.instanceIdentifier,
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
        const current = options.createNew ? undefined : (options.instanceId ? this.manager.getInstance(options.instanceId) : this.manager.getGlobalActiveInstance());
        const host = this.resolveStoredBaseUrl(current, config.host);
        const saved = this.manager.upsertInstance({
            id: options.createNew ? undefined : (options.instanceId || current?.id),
            name: options.instanceName || current?.name || host,
            mode: current?.mode || 'existing',
            baseUrl: host,
            apiKey: options.apiKey,
            instanceIdentifier: config.instanceIdentifier || current?.instanceIdentifier,
            verification: options.verification || current?.verification,
            defaultProject: current?.defaultProject,
        }, {
            setActive: options.setActive,
        });

        this.writeWorkspaceFields(saved.id, config);
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
        const updated = this.manager.upsertInstance({
            id: instance.id,
            name: instance.name,
            baseUrl: instance.host,
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
        const instance = this.manager.listInstances().find((candidate) => this.normalizeHost(candidate.baseUrl || '') === normalized);
        return instance ? this.manager.getApiKey(instance.id) : undefined;
    }

    saveApiKey(host: string, apiKey: string, instanceId?: string): void {
        const target = instanceId
            ? this.manager.getInstance(instanceId)
            : this.manager.listInstances().find((candidate) => this.normalizeHost(candidate.baseUrl || '') === this.normalizeHost(host));
        if (target) {
            this.manager.saveApiKey(target.id, apiKey);
            return;
        }
        const saved = this.manager.upsertInstance({ baseUrl: host, apiKey }, { setActive: true });
        this.manager.saveApiKey(saved.id, apiKey);
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
        if (active?.instanceIdentifier) {
            return active.instanceIdentifier;
        }
        const apiKey = active ? this.manager.getApiKey(active.id) : this.getApiKey(host, instanceId);
        if (!apiKey) {
            throw new Error('API key not found');
        }
        const { resolveInstanceIdentifier } = await import('../core/index.js');
        const { identifier } = await resolveInstanceIdentifier({ host, apiKey });
        const saved = this.manager.upsertInstance({
            id: active?.id || instanceId,
            name: active?.name || host,
            baseUrl: host,
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

    resolveWorkspacePath(targetPath: string): string {
        return path.isAbsolute(targetPath)
            ? targetPath
            : path.resolve(this.workspaceRoot, targetPath);
    }

    private writeWorkspaceFields(instanceId: string, config: Partial<ILocalConfig>): void {
        const current = tryResolve(() => this.manager.readWorkspaceOverrides(this.workspaceRoot)) || { version: 3 as const };
        this.manager.writeWorkspaceOverrides(this.workspaceRoot, {
            ...current,
            activeInstanceId: instanceId,
            syncFolder: config.syncFolder || current.syncFolder,
            projectId: config.projectId || current.projectId,
            projectName: config.projectName || current.projectName,
            folderSync: config.folderSync ?? current.folderSync,
            customNodesPath: config.customNodesPath || current.customNodesPath,
        });
    }

    private resolveWorkspaceContext(instanceId?: string): EffectiveN8nContext {
        return this.manager.resolveEffectiveContext({
            workspaceRoot: this.workspaceRoot,
            instanceId,
            syncFolderDefault: 'workspace',
        });
    }

    private toInstanceProfile(instance: GlobalN8nInstance, overrides?: Partial<ILocalConfig>): IInstanceProfile {
        return {
            id: instance.id,
            name: instance.name,
            host: instance.tunnelPublicUrl || instance.baseUrl,
            syncFolder: overrides?.syncFolder,
            projectId: overrides?.projectId || instance.defaultProject?.id,
            projectName: overrides?.projectName || instance.defaultProject?.name,
            instanceIdentifier: instance.instanceIdentifier,
            customNodesPath: overrides?.customNodesPath,
            folderSync: overrides?.folderSync,
            verification: instance.verification,
        };
    }

    private contextToInstanceProfile(context: EffectiveN8nContext): IInstanceProfile {
        return {
            ...this.toInstanceProfile(context.instance),
            host: context.host,
            syncFolder: context.syncFolder,
            projectId: context.projectId,
            projectName: context.projectName,
            instanceIdentifier: context.instanceIdentifier,
            workflowDir: this.buildWorkflowDir(context.syncFolder, context.instanceIdentifier, context.projectName),
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
