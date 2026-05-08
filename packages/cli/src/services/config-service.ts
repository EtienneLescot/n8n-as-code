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

export interface IWorkspaceConfig extends ILocalConfig {
    version: 3;
    activeInstanceId?: string;
    instances: IInstanceProfile[];
}

export interface ILegacyWorkspaceMigrationInstance extends Partial<ILocalConfig> {
    id: string;
    name: string;
    hasApiKey: boolean;
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
        const legacyPlan = this.detectLegacyWorkspaceConfig();
        if (legacyPlan) {
            throw new Error(
                `Unsupported legacy n8n workspace config at ${legacyPlan.configPath}. ` +
                'Run `n8nac workspace migrate-v1` to inspect it, then `n8nac workspace migrate-v1 --write` to migrate it.'
            );
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
        return {
            ...prepared.context,
        };
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
        const instance = this.manager.listInstances().find((candidate) => this.normalizeHost(candidate.baseUrl || '') === normalized);
        return instance ? this.manager.getApiKey(instance.id) : undefined;
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
        const activeInstanceId = asString(raw.activeInstanceId) || instances[0]?.id;
        const activeInstance = instances.find((instance) => instance.id === activeInstanceId) || instances[0];
        const workspace = stripUndefined({
            syncFolder: asString(raw.syncFolder) || activeInstance?.syncFolder,
            projectId: asString(raw.projectId) || activeInstance?.projectId,
            projectName: asString(raw.projectName) || activeInstance?.projectName,
            customNodesPath: asString(raw.customNodesPath) || activeInstance?.customNodesPath,
            folderSync: asBoolean(raw.folderSync) ?? activeInstance?.folderSync,
        });
        const warnings = [
            'Global n8n instances and API keys now live in n8n-manager, not in n8nac-config.json.',
            'n8nac-config.json will keep only workspace overrides after migration.',
            instances.some((instance) => instance.hasApiKey)
                ? 'Embedded API keys found: --write will move them into the local n8n-manager secret store.'
                : 'No embedded API keys found: you may need to run n8n-manager auth set after migration.',
        ];

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
        for (const legacyInstance of plan.instances) {
            const apiKey = this.readLegacyApiKey(legacyInstance.id, rawLegacyConfig);
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
        }

        this.manager.writeWorkspaceOverrides(this.workspaceRoot, stripUndefined({
            version: 3 as const,
            activeInstanceId: plan.activeInstanceId || migratedInstances[0]?.id,
            syncFolder: plan.workspace.syncFolder,
            projectId: plan.workspace.projectId,
            projectName: plan.workspace.projectName,
            customNodesPath: plan.workspace.customNodesPath,
            folderSync: plan.workspace.folderSync,
        }));

        return { status: 'migrated', plan, backupPath, instances: migratedInstances };
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
        if (typeof raw.version === 'number' && raw.version !== 3) return true;
        if (Array.isArray(raw.instances)) return true;
        if (typeof raw.apiKey === 'string') return true;
        return false;
    }

    private readLegacyInstances(raw: Record<string, unknown>): ILegacyWorkspaceMigrationInstance[] {
        const rawInstances = Array.isArray(raw.instances) ? raw.instances : [];
        const candidates = rawInstances.length > 0 ? rawInstances : [raw];
        return candidates
            .map((candidate, index) => this.toLegacyInstance(candidate, raw, index))
            .filter((instance): instance is ILegacyWorkspaceMigrationInstance => Boolean(instance));
    }

    private toLegacyInstance(candidate: unknown, root: Record<string, unknown>, index: number): ILegacyWorkspaceMigrationInstance | undefined {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
            return undefined;
        }
        const value = candidate as Record<string, unknown>;
        const id = asString(value.id) || asString(root.activeInstanceId) || `legacy-${index + 1}`;
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
        return asString(match?.apiKey) || asString(root.apiKey);
    }

    private createLegacyConfigBackup(configPath: string): string {
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
        const backupPath = path.join(path.dirname(configPath), `n8nac-config.v1-backup-${timestamp}.json`);
        fs.copyFileSync(configPath, backupPath);
        return backupPath;
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
