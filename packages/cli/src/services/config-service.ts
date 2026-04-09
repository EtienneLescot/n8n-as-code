import Conf from 'conf';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { N8nApiClient, createInstanceIdentifier, createProjectSlug, normalizeHostForIdentity } from '../core/index.js';

// Unified local config written to n8nac-config.json (legacy n8nac.json/n8nac-instance.json deprecated)
export interface ILocalConfig {
    host?: string;
    syncFolder?: string;
    projectId?: string;          // REQUIRED: Active project scope
    projectName?: string;        // REQUIRED: Project display name
    instanceIdentifier?: string; // Auto-generated once; stored for consistent paths
    workflowDir?: string;        // Computed: <syncFolder>/<instanceIdentifier>/<projectSlug> — stored for agent use
    customNodesPath?: string;    // Optional path to n8nac-custom-nodes.json for user-defined node schemas
    folderSync?: boolean;        // Mirror n8n folder hierarchy as local subdirectories (default: false)
}

export type IInstanceVerificationStatus = 'unverified' | 'verified' | 'failed';

export interface IInstanceVerification {
    status: IInstanceVerificationStatus;
    normalizedHost?: string;
    userId?: string;
    userName?: string;
    userEmail?: string;
    lastCheckedAt?: string;
    lastError?: string;
}

export interface IInstanceProfile extends ILocalConfig {
    id: string;
    name: string;
    verification?: IInstanceVerification;
}

export interface IWorkspaceConfig extends ILocalConfig {
    version: 2;
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
    private globalStore: Conf;
    private localConfigPath: string;

    constructor(workspaceRoot = process.cwd()) {
        this.globalStore = new Conf({
            projectName: 'n8nac',
            configName: 'credentials'
        });
        this.localConfigPath = path.join(workspaceRoot, 'n8nac-config.json');
    }

    /**
     * Get the active local configuration from n8nac-config.json.
     * Legacy single-instance files are migrated to the instance library format.
     */
    getLocalConfig(): Partial<ILocalConfig> {
        const workspaceConfig = this.getWorkspaceConfig();
        const active = this.getActiveInstanceFromConfig(workspaceConfig);

        return active ? this.toLocalConfig(active) : {};
    }

    /**
     * Get the full workspace config, including the instance library.
     */
    getWorkspaceConfig(): IWorkspaceConfig {
        const { config, shouldPersist } = this.loadWorkspaceConfig();
        if (shouldPersist) {
            this.writeWorkspaceConfig(config);
        }
        return config;
    }

    listInstanceConfigs(): IInstanceProfile[] {
        return this.getWorkspaceConfig().instances;
    }

    listInstances(): IInstanceProfile[] {
        return this.listInstanceConfigs();
    }

    getInstanceConfig(instanceId: string): IInstanceProfile | undefined {
        return this.listInstanceConfigs().find((instance) => instance.id === instanceId);
    }

    getInstance(instanceId: string): IInstanceProfile | undefined {
        return this.getInstanceConfig(instanceId);
    }

    getCurrentInstanceConfig(): IInstanceProfile | undefined {
        return this.getActiveInstanceFromConfig(this.getWorkspaceConfig());
    }

    getActiveInstance(): IInstanceProfile | undefined {
        return this.getCurrentInstanceConfig();
    }

    getCurrentInstanceConfigId(): string | undefined {
        return this.getWorkspaceConfig().activeInstanceId;
    }

    getActiveInstanceId(): string | undefined {
        return this.getCurrentInstanceConfigId();
    }

    getCurrentInstance(): IInstanceProfile | undefined {
        return this.getCurrentInstanceConfig();
    }

    getCurrentInstanceId(): string | undefined {
        return this.getCurrentInstanceConfigId();
    }

    getCurrentInstanceProfile(): IInstanceProfile | undefined {
        return this.getCurrentInstanceConfig();
    }

    setActiveInstance(instanceId: string): IInstanceProfile {
        const workspaceConfig = this.getWorkspaceConfig();
        const instance = workspaceConfig.instances.find((candidate) => candidate.id === instanceId);

        if (!instance) {
            throw new Error(`Unknown instance config: ${instanceId}`);
        }

        const next = this.buildWorkspaceConfig(workspaceConfig.instances, instance.id);
        this.writeWorkspaceConfig(next);
        return instance;
    }

    selectInstance(instanceId: string): IInstanceProfile {
        return this.setActiveInstance(instanceId);
    }

    selectInstanceConfig(instanceId: string): IInstanceProfile {
        return this.setActiveInstance(instanceId);
    }

    selectInstanceProfile(instanceId: string): IInstanceProfile {
        return this.selectInstanceConfig(instanceId);
    }

    async selectInstanceConfigWithVerification(
        instanceId: string,
        options: { client?: IInstanceVerificationClient } = {}
    ): Promise<ISelectInstanceResult> {
        const instance = this.getInstanceConfig(instanceId);
        if (!instance) {
            throw new Error(`Unknown instance config: ${instanceId}`);
        }

        const apiKey = instance.host ? this.getApiKey(instance.host, instance.id) : undefined;
        const shouldVerify = !!instance.host && !!apiKey && instance.verification?.status !== 'verified';

        if (shouldVerify) {
            const verification = await this.verifyInstanceConfig(instance.id, options);
            if (verification.status === 'duplicate' && verification.duplicateInstance) {
                const selected = this.setActiveInstance(verification.duplicateInstance.id);
                return {
                    status: 'duplicate',
                    profile: selected,
                    duplicateInstance: verification.duplicateInstance,
                };
            }
        }

        const selected = this.setActiveInstance(instance.id);
        return {
            status: 'selected',
            profile: selected,
            verificationStatus: selected.verification?.status || 'unverified',
        };
    }

    createInstance(
        config: Partial<ILocalConfig>,
        options: { instanceName?: string; setActive?: boolean } = {}
    ): IInstanceProfile {
        return this.createInstanceConfig(config, options);
    }

    createInstanceConfig(
        config: Partial<ILocalConfig>,
        options: { instanceName?: string; setActive?: boolean } = {}
    ): IInstanceProfile {
        return this.saveLocalConfig(config, {
            instanceName: options.instanceName,
            setActive: options.setActive,
            createNew: true,
        });
    }

    updateInstance(
        config: Partial<ILocalConfig>,
        options: { instanceId?: string; instanceName?: string; setActive?: boolean } = {}
    ): IInstanceProfile {
        return this.updateInstanceConfig(config, options);
    }

    updateInstanceConfig(
        config: Partial<ILocalConfig>,
        options: { instanceId?: string; instanceName?: string; setActive?: boolean } = {}
    ): IInstanceProfile {
        return this.saveLocalConfig(config, {
            instanceId: options.instanceId,
            instanceName: options.instanceName,
            setActive: options.setActive,
            createNew: false,
        });
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
        const workspaceConfig = this.getWorkspaceConfig();
        const existingActive = this.getActiveInstanceFromConfig(workspaceConfig);
        const targetId = options.createNew ? undefined : (options.instanceId || existingActive?.id);
        const current = targetId
            ? workspaceConfig.instances.find((instance) => instance.id === targetId)
            : undefined;

        const host = input.host || current?.host;
        const apiKey = input.apiKey !== undefined
            ? input.apiKey
            : (options.preferStoredApiKey === false ? undefined : (host && current?.id ? this.getApiKey(host, current.id) : undefined));
        const verification = host && apiKey
            ? await this.resolveInstanceVerification(host, apiKey, options.client, current?.id)
            : undefined;

        if (verification?.status === 'duplicate' && verification.duplicateInstance) {
            return {
                status: 'duplicate',
                duplicateInstance: verification.duplicateInstance,
                normalizedHost: verification.normalizedHost || '',
                userId: verification.userId || '',
                userName: verification.userName,
                userEmail: verification.userEmail,
            };
        }

        let persistedVerification = current?.verification;
        if (verification?.status === 'verified' || verification?.status === 'failed') {
            const verifiedOrFailed = verification as {
                status: 'verified' | 'failed';
                normalizedHost?: string;
                userId?: string;
                userName?: string;
                userEmail?: string;
                error?: string;
            };
            persistedVerification = this.buildPersistedVerification(verifiedOrFailed, current?.verification);
        }

        const profile = this.sanitizeInstanceProfile({
            ...current,
            ...input,
            id: current?.id || options.instanceId || this.createInstanceId(),
            name: this.resolveInstanceName({
                current,
                host,
                requestedName: options.instanceName,
                verification,
            }),
            instanceIdentifier: verification
                ? (verification.status === 'verified' ? verification.instanceIdentifier : undefined)
                : (input.instanceIdentifier || current?.instanceIdentifier),
            verification: persistedVerification,
        });

        const saved = this.saveInstanceProfile(profile, {
            setActive: options.setActive,
            createNew: options.createNew,
        });

        if (host && apiKey && options.persistCredentials !== false) {
            this.saveApiKey(host, apiKey, saved.id);
        }

        return {
            status: 'saved',
            profile: saved,
            verificationStatus: saved.verification?.status || 'unverified',
        };
    }

    deleteInstance(instanceId: string): { deletedInstance: IInstanceProfile; activeInstance?: IInstanceProfile } {
        return this.deleteInstanceConfig(instanceId);
    }

    deleteInstanceConfig(instanceId: string): { deletedInstance: IInstanceProfile; activeInstance?: IInstanceProfile } {
        const workspaceConfig = this.getWorkspaceConfig();
        const deletedInstance = workspaceConfig.instances.find((candidate) => candidate.id === instanceId);

        if (!deletedInstance) {
            throw new Error(`Unknown instance config: ${instanceId}`);
        }

        const remainingInstances = workspaceConfig.instances.filter((candidate) => candidate.id !== instanceId);
        const nextActiveInstanceId = workspaceConfig.activeInstanceId === instanceId
            ? remainingInstances[0]?.id
            : workspaceConfig.activeInstanceId;
        const next = this.buildWorkspaceConfig(remainingInstances, nextActiveInstanceId);

        this.writeWorkspaceConfig(next);
        this.deleteScopedApiKey(instanceId);

        return {
            deletedInstance,
            activeInstance: this.getActiveInstanceFromConfig(next),
        };
    }

    /**
     * Save the active local configuration to n8nac-config.json.
     * This updates or creates the targeted saved instance config, then makes it active by default.
     */
    saveLocalConfig(
        config: Partial<ILocalConfig>,
        options: { instanceId?: string; instanceName?: string; setActive?: boolean; createNew?: boolean } = {}
    ): IInstanceProfile {
        const workspaceConfig = this.getWorkspaceConfig();
        const existingActive = this.getActiveInstanceFromConfig(workspaceConfig);
        const targetId = options.createNew ? undefined : (options.instanceId || existingActive?.id);
        const current = targetId
            ? workspaceConfig.instances.find((instance) => instance.id === targetId)
            : undefined;

        const profile = this.sanitizeInstanceProfile({
            ...current,
            ...config,
            id: current?.id || options.instanceId || this.createInstanceId(),
            name: options.instanceName?.trim() || current?.name || this.createDefaultInstanceName(config.host || current?.host),
        });

        const remaining = workspaceConfig.instances.filter((instance) => instance.id !== profile.id);
        const instances = [...remaining, profile].sort((left, right) => left.name.localeCompare(right.name));
        const activeInstanceId = options.setActive === false
            ? (workspaceConfig.activeInstanceId || profile.id)
            : profile.id;

        const next = this.buildWorkspaceConfig(instances, activeInstanceId);
        this.writeWorkspaceConfig(next);
        return profile;
    }

    saveInstanceProfile(
        profile: Partial<IInstanceProfile>,
        options: { setActive?: boolean; createNew?: boolean } = {}
    ): IInstanceProfile {
        const workspaceConfig = this.getWorkspaceConfig();
        const current = profile.id ? workspaceConfig.instances.find((instance) => instance.id === profile.id) : undefined;
        const savedProfile = this.sanitizeInstanceProfile({
            ...current,
            ...profile,
            id: current?.id || profile.id || this.createInstanceId(),
            name: profile.name ?? current?.name ?? this.createDefaultInstanceName(profile.host ?? current?.host),
        });

        const remaining = workspaceConfig.instances.filter((instance) => instance.id !== savedProfile.id);
        const instances = [...remaining, savedProfile].sort((left, right) => left.name.localeCompare(right.name));
        const activeInstanceId = options.setActive === false
            ? (workspaceConfig.activeInstanceId || savedProfile.id)
            : savedProfile.id;

        const next = this.buildWorkspaceConfig(instances, activeInstanceId);
        this.writeWorkspaceConfig(next);
        return savedProfile;
    }

    /**
     * Save partial bootstrap state before a project is selected.
     * This intentionally resets project-specific fields when auth changes.
     */
    saveBootstrapState(
        host: string,
        syncFolder = 'workflows',
        options: { instanceId?: string; instanceName?: string; createNew?: boolean } = {}
    ): IInstanceProfile {
        const current = options.instanceId ? this.getInstance(options.instanceId) : this.getActiveInstance();
        const bootstrapConfig = {
            host,
            syncFolder,
            customNodesPath: current?.customNodesPath,
            folderSync: current?.folderSync,
            projectId: undefined,
            projectName: undefined,
            instanceIdentifier: current?.instanceIdentifier,
        };

        return options.createNew
            ? this.createInstanceConfig(bootstrapConfig, {
                instanceName: options.instanceName,
                setActive: true,
            })
            : this.updateInstanceConfig(bootstrapConfig, {
                instanceId: options.instanceId,
                instanceName: options.instanceName,
                setActive: true,
            });
    }

    async verifyInstanceConfig(
        instanceId: string,
        options: { client?: IInstanceVerificationClient } = {}
    ): Promise<
        | ({ status: 'verified'; instance: IInstanceProfile; normalizedHost: string; userId: string; userName?: string; userEmail?: string; instanceIdentifier: string })
        | ({ status: 'failed'; instance: IInstanceProfile; error: string })
        | ({ status: 'duplicate'; instance: IInstanceProfile; duplicateInstance: IInstanceProfile; normalizedHost: string; userId: string; userName?: string; userEmail?: string })
        | ({ status: 'skipped'; instance: IInstanceProfile; reason: string })
    > {
        const instance = this.getInstanceConfig(instanceId);
        if (!instance) {
            throw new Error(`Unknown instance config: ${instanceId}`);
        }

        const host = instance.host;
        if (!host) {
            return { status: 'skipped', instance, reason: 'Missing host' };
        }

        const apiKey = this.getApiKey(host, instance.id);
        if (!apiKey) {
            return { status: 'skipped', instance, reason: 'Missing API key' };
        }

        const verification = await this.resolveInstanceVerification(host, apiKey, options.client, instance.id);
        if (verification.status === 'duplicate' && verification.duplicateInstance) {
            return {
                status: 'duplicate',
                instance,
                duplicateInstance: verification.duplicateInstance,
                normalizedHost: verification.normalizedHost || '',
                userId: verification.userId || '',
                userName: verification.userName,
                userEmail: verification.userEmail,
            };
        }

        const persistedVerification = verification.status === 'verified' || verification.status === 'failed'
            ? this.buildPersistedVerification(verification as {
                status: 'verified' | 'failed';
                normalizedHost?: string;
                userId?: string;
                userName?: string;
                userEmail?: string;
                error?: string;
            }, undefined)
            : undefined;

        const updated = this.saveInstanceProfile({
            ...instance,
            name: this.resolveInstanceName({
                current: instance,
                host,
                verification,
            }),
            instanceIdentifier: verification.status === 'verified'
                ? verification.instanceIdentifier
                : undefined,
            verification: persistedVerification,
        }, {
            setActive: instance.id === this.getActiveInstanceId(),
        });

        if (verification.status === 'verified') {
            return {
                status: 'verified',
                instance: updated,
                normalizedHost: verification.normalizedHost || '',
                userId: verification.userId || '',
                userName: verification.userName,
                userEmail: verification.userEmail,
                instanceIdentifier: verification.instanceIdentifier || '',
            };
        }

        return {
            status: 'failed',
            instance: updated,
            error: verification.error || 'Verification failed',
        };
    }

    /**
     * Get API key for a specific host from the global store.
     * When an instance id is provided, instance-config-scoped secrets take precedence.
     */
    getApiKey(host: string, instanceId?: string): string | undefined {
        const instanceCredentials = this.globalStore.get('instanceProfiles') as Record<string, string> || {};
        if (instanceId && instanceCredentials[instanceId]) {
            return instanceCredentials[instanceId];
        }

        const credentials = this.globalStore.get('hosts') as Record<string, string> || {};
        return credentials[this.normalizeHost(host)];
    }

    /**
     * Save API key for a specific host in the global store.
     * Instance-config-scoped storage allows distinct secrets per configured instance.
     */
    saveApiKey(host: string, apiKey: string, instanceId?: string): void {
        const credentials = this.globalStore.get('hosts') as Record<string, string> || {};
        credentials[this.normalizeHost(host)] = apiKey;
        this.globalStore.set('hosts', credentials);

        if (instanceId) {
            const instanceCredentials = this.globalStore.get('instanceProfiles') as Record<string, string> || {};
            instanceCredentials[instanceId] = apiKey;
            this.globalStore.set('instanceProfiles', instanceCredentials);
        }
    }

    getApiKeyForActiveInstance(): string | undefined {
        const active = this.getActiveInstance();
        if (!active?.host) {
            return undefined;
        }

        return this.getApiKey(active.host, active.id);
    }

    /**
     * Normalize host URL to use as a key
     */
    private normalizeHost(host: string): string {
        try {
            const url = new URL(host);
            return url.origin;
        } catch {
            return host.replace(/\/$/, '');
        }
    }

    private deleteScopedApiKey(instanceId: string): void {
        const instanceCredentials = this.globalStore.get('instanceProfiles') as Record<string, string> || {};
        if (!(instanceId in instanceCredentials)) {
            return;
        }

        delete instanceCredentials[instanceId];
        this.globalStore.set('instanceProfiles', instanceCredentials);
    }

    /**
     * Check if a configuration exists
     */
    hasConfig(): boolean {
        const active = this.getActiveInstance();
        return !!(active?.host && this.getApiKey(active.host, active.id));
    }

    /**
     * Generate or retrieve the instance identifier using Sync's directory-utils
     * Format: {hostSlug}_{userSlug} (e.g., "local_5678_etienne_l")
     */
    async getOrCreateInstanceIdentifier(host: string, instanceId?: string): Promise<string> {
        const active = instanceId ? this.getInstance(instanceId) : this.getActiveInstance();
        const apiKey = this.getApiKey(host, instanceId || active?.id);

        if (!apiKey) {
            throw new Error('API key not found');
        }

        try {
            const { resolveInstanceIdentifier } = await import('../core/index.js');
            const { identifier } = await resolveInstanceIdentifier({ host, apiKey });

            this.updateInstanceConfig({
                host,
                instanceIdentifier: identifier
            }, {
                instanceId: instanceId || active?.id,
                instanceName: active?.name,
                setActive: true,
            });

            return identifier;
        } catch {
            console.warn('Could not fetch user info, using fallback identifier');
            const { createFallbackInstanceIdentifier } = await import('../core/index.js');
            const fallbackIdentifier = createFallbackInstanceIdentifier(host, apiKey);

            this.updateInstanceConfig({
                host,
                instanceIdentifier: fallbackIdentifier
            }, {
                instanceId: instanceId || active?.id,
                instanceName: active?.name,
                setActive: true,
            });

            return fallbackIdentifier;
        }
    }

    /**
     * Get the path for n8nac-config.json (unified)
     */
    getInstanceConfigPath(): string {
        return this.localConfigPath;
    }

    private loadWorkspaceConfig(): { config: IWorkspaceConfig; shouldPersist: boolean } {
        const parsed = this.readCurrentConfigFile();
        if (parsed) {
            return {
                config: this.normalizeWorkspaceConfig(parsed),
                shouldPersist: !this.isStoredWorkspaceConfig(parsed),
            };
        }

        const legacy = this.readLegacyConfig();
        if (legacy.host || legacy.syncFolder || legacy.projectId || legacy.projectName || legacy.instanceIdentifier) {
            const profile = this.sanitizeInstanceProfile({
                id: this.createLegacyInstanceId(legacy),
                name: this.createDefaultInstanceName(legacy.host),
                ...legacy,
            });

            return {
                config: this.buildWorkspaceConfig([profile], profile.id),
                shouldPersist: true,
            };
        }

        return {
            config: this.buildWorkspaceConfig([], undefined),
            shouldPersist: false,
        };
    }

    private readCurrentConfigFile(): unknown {
        if (!fs.existsSync(this.localConfigPath)) {
            return undefined;
        }

        try {
            const content = fs.readFileSync(this.localConfigPath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            console.error('Error reading local config:', error);
            return undefined;
        }
    }

    private readLegacyConfig(): Partial<ILocalConfig> {
        const baseDir = path.dirname(this.localConfigPath);
        const legacyConfigPath = path.join(baseDir, 'n8nac.json');
        const legacyInstancePath = path.join(baseDir, 'n8nac-instance.json');

        let legacy: Partial<ILocalConfig> = {};

        if (fs.existsSync(legacyConfigPath)) {
            try {
                legacy = JSON.parse(fs.readFileSync(legacyConfigPath, 'utf-8'));
            } catch (error) {
                console.error('Error reading legacy local config:', error);
            }
        }

        if (fs.existsSync(legacyInstancePath)) {
            try {
                const instance = JSON.parse(fs.readFileSync(legacyInstancePath, 'utf-8'));
                legacy.instanceIdentifier = legacy.instanceIdentifier || instance.instanceIdentifier;
                legacy.syncFolder = legacy.syncFolder || instance.syncFolder || legacy.syncFolder;
            } catch (error) {
                console.error('Error reading legacy instance config:', error);
            }
        }

        return this.sanitizeLocalConfig(legacy);
    }

    private normalizeWorkspaceConfig(raw: unknown): IWorkspaceConfig {
        const source = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
        const instances = Array.isArray(source.instances)
            ? source.instances
                .filter((value): value is Record<string, unknown> => !!value && typeof value === 'object')
                .map((value) => this.sanitizeInstanceProfile(value))
            : [];

        if (!Array.isArray(source.instances)) {
            const legacyConfig = this.sanitizeLocalConfig(source as Partial<ILocalConfig>);
            if (Object.keys(legacyConfig).length > 0) {
                const profile = this.sanitizeInstanceProfile({
                    id: this.createLegacyInstanceId(legacyConfig),
                    name: this.createDefaultInstanceName(legacyConfig.host),
                    ...legacyConfig,
                });

                return this.buildWorkspaceConfig([profile], profile.id);
            }
        }

        const activeInstanceId = typeof source.activeInstanceId === 'string' && instances.some((instance) => instance.id === source.activeInstanceId)
            ? source.activeInstanceId
            : instances[0]?.id;

        return this.buildWorkspaceConfig(instances, activeInstanceId);
    }

    private buildWorkspaceConfig(instances: IInstanceProfile[], activeInstanceId?: string): IWorkspaceConfig {
        const active = activeInstanceId
            ? instances.find((instance) => instance.id === activeInstanceId)
            : undefined;

        return {
            version: 2,
            activeInstanceId,
            instances,
            ...this.toLocalConfig(active),
        };
    }

    private writeWorkspaceConfig(config: IWorkspaceConfig): void {
        fs.writeFileSync(this.localConfigPath, JSON.stringify(config, null, 2));
    }

    private getActiveInstanceFromConfig(config: IWorkspaceConfig): IInstanceProfile | undefined {
        if (!config.activeInstanceId) {
            return undefined;
        }

        return config.instances.find((instance) => instance.id === config.activeInstanceId);
    }

    private toLocalConfig(profile?: Partial<ILocalConfig>): Partial<ILocalConfig> {
        if (!profile) {
            return {};
        }

        const localConfig: Partial<ILocalConfig> = {};
        const keys: Array<keyof ILocalConfig> = [
            'host',
            'syncFolder',
            'projectId',
            'projectName',
            'instanceIdentifier',
            'workflowDir',
            'customNodesPath',
            'folderSync',
        ];

        for (const key of keys) {
            const value = profile[key];
            if (typeof value === 'string') {
                if (value.trim() !== '') {
                    localConfig[key] = value.trim() as never;
                }
            } else if (typeof value === 'boolean') {
                localConfig[key] = value as never;
            }
        }

        return localConfig;
    }

    private sanitizeLocalConfig(config: Partial<ILocalConfig>): Partial<ILocalConfig> {
        const next: Partial<ILocalConfig> = {};
        const stringKeys: Array<keyof ILocalConfig> = [
            'host',
            'syncFolder',
            'projectId',
            'projectName',
            'instanceIdentifier',
            'workflowDir',
            'customNodesPath',
        ];

        for (const key of stringKeys) {
            const value = config[key];
            if (typeof value === 'string' && value.trim() !== '') {
                next[key] = value.trim() as never;
            }
        }

        if (typeof config.folderSync === 'boolean') {
            next.folderSync = config.folderSync;
        }

        return next;
    }

    private sanitizeInstanceProfile(profile: Record<string, unknown> | Partial<IInstanceProfile>): IInstanceProfile {
        const localConfig = this.sanitizeLocalConfig(profile as Partial<ILocalConfig>);
        const id = typeof profile.id === 'string' && profile.id.trim() !== ''
            ? profile.id.trim()
            : this.createInstanceId();
        const name = typeof profile.name === 'string' && profile.name.trim() !== ''
            ? profile.name.trim()
            : this.createDefaultInstanceName(localConfig.host);

        // Recompute workflowDir whenever all three deps are present, so the stored value stays in sync
        if (localConfig.syncFolder && localConfig.instanceIdentifier && localConfig.projectName) {
            localConfig.workflowDir = this.normalizeConfigPath(
                localConfig.syncFolder,
                localConfig.instanceIdentifier,
                createProjectSlug(localConfig.projectName),
            );
        }

        return {
            id,
            name,
            ...localConfig,
            verification: this.sanitizeVerification((profile as Partial<IInstanceProfile>).verification),
        };
    }

    private sanitizeVerification(verification: IInstanceVerification | undefined): IInstanceVerification | undefined {
        if (!verification || typeof verification !== 'object') {
            return undefined;
        }

        const status = verification.status === 'verified' || verification.status === 'failed'
            ? verification.status
            : 'unverified';

        return {
            status,
            normalizedHost: typeof verification.normalizedHost === 'string' ? verification.normalizedHost.trim() || undefined : undefined,
            userId: typeof verification.userId === 'string' ? verification.userId.trim() || undefined : undefined,
            userName: typeof verification.userName === 'string' ? verification.userName.trim() || undefined : undefined,
            userEmail: typeof verification.userEmail === 'string' ? verification.userEmail.trim() || undefined : undefined,
            lastCheckedAt: typeof verification.lastCheckedAt === 'string' ? verification.lastCheckedAt.trim() || undefined : undefined,
            lastError: typeof verification.lastError === 'string' ? verification.lastError.trim() || undefined : undefined,
        };
    }

    private normalizeConfigPath(...segments: string[]): string {
        const hasUncPrefix = /^[\\/]{2}[^\\/]/.test(segments[0] || '');
        const normalizedSegments = segments.map((segment, index) => {
            if (index === 0 && hasUncPrefix) {
                return `${path.sep}${path.sep}${segment.slice(2).replace(/[\\/]/g, path.sep)}`;
            }

            return segment.replace(/[\\/]/g, path.sep);
        });

        const joinedPath = path.join(...normalizedSegments).replace(/\\/g, '/');
        return hasUncPrefix
            ? `//${joinedPath.replace(/^\/+/g, '')}`
            : joinedPath;
    }

    private async resolveInstanceVerification(
        host: string,
        apiKey: string,
        client?: IInstanceVerificationClient,
        exceptInstanceId?: string
    ): Promise<{
        status: 'verified' | 'failed' | 'duplicate';
        normalizedHost?: string;
        userId?: string;
        userName?: string;
        userEmail?: string;
        instanceIdentifier?: string;
        duplicateInstance?: IInstanceProfile;
        error?: string;
    }> {
        const normalizedHost = normalizeHostForIdentity(host);

        try {
            const verificationClient = client ?? new N8nApiClient({ host, apiKey });
            const user = await verificationClient.getCurrentUser();
            const userId = user?.id?.trim() || user?.email?.trim().toLowerCase();

            if (!userId) {
                return {
                    status: 'failed',
                    error: 'Unable to resolve the authenticated n8n user.',
                };
            }

            const resolvedUser = user ?? {};

            const duplicateInstance = this.findVerifiedDuplicate(normalizedHost, userId, exceptInstanceId);
            if (duplicateInstance) {
                return {
                    status: 'duplicate',
                    normalizedHost,
                    userId,
                    userName: this.createUserDisplayName(resolvedUser),
                    userEmail: resolvedUser.email,
                    duplicateInstance,
                };
            }

            return {
                status: 'verified',
                normalizedHost,
                userId,
                userName: this.createUserDisplayName(resolvedUser),
                userEmail: resolvedUser.email,
                instanceIdentifier: createInstanceIdentifier(host, resolvedUser),
            };
        } catch (error: any) {
            return {
                status: 'failed',
                error: error?.message || 'Unable to reach the configured n8n instance.',
            };
        }
    }

    private findVerifiedDuplicate(
        normalizedHost: string,
        userId: string,
        exceptInstanceId?: string
    ): IInstanceProfile | undefined {
        return this.listInstances().find((instance) =>
            instance.id !== exceptInstanceId &&
            instance.verification?.status === 'verified' &&
            instance.verification.normalizedHost === normalizedHost &&
            instance.verification.userId === userId
        );
    }

    private buildPersistedVerification(
        verification:
            | {
                status: 'verified' | 'failed';
                normalizedHost?: string;
                userId?: string;
                userName?: string;
                userEmail?: string;
                error?: string;
            }
            | undefined,
        previous?: IInstanceVerification
    ): IInstanceVerification | undefined {
        const lastCheckedAt = new Date().toISOString();

        if (!verification) {
            return previous ? {
                ...previous,
                status: 'unverified',
                lastCheckedAt,
                lastError: undefined,
                normalizedHost: undefined,
                userId: undefined,
                userName: undefined,
                userEmail: undefined,
            } : { status: 'unverified', lastCheckedAt };
        }

        if (verification.status === 'verified') {
            return {
                status: 'verified',
                normalizedHost: verification.normalizedHost,
                userId: verification.userId,
                userName: verification.userName,
                userEmail: verification.userEmail,
                lastCheckedAt,
            };
        }

        return {
            status: 'failed',
            lastCheckedAt,
            lastError: verification.error || 'Verification failed',
        };
    }

    private resolveInstanceName(input: {
        current?: IInstanceProfile;
        host?: string;
        requestedName?: string;
        verification?: {
            status: 'verified' | 'failed' | 'duplicate';
            normalizedHost?: string;
            userName?: string;
            userEmail?: string;
        };
    }): string {
        const requestedName = input.requestedName?.trim();
        if (requestedName) {
            return requestedName;
        }

        if (input.current?.name && input.current.name !== this.createDefaultInstanceName(input.current.host)) {
            return input.current.name;
        }

        if (input.verification?.status === 'verified' && input.host) {
            return this.createVerifiedInstanceName(input.host, input.verification.userName, input.verification.userEmail);
        }

        return this.createDefaultInstanceName(input.host || input.current?.host);
    }

    private createVerifiedInstanceName(host: string, userName?: string, userEmail?: string): string {
        const hostName = this.createDefaultInstanceName(host);
        const identityLabel = userName || userEmail;
        return identityLabel ? `${hostName} · ${identityLabel}` : hostName;
    }

    private createUserDisplayName(user: { firstName?: string; lastName?: string; email?: string }): string | undefined {
        const parts = [user.firstName?.trim(), user.lastName?.trim()].filter(Boolean);
        if (parts.length) {
            return parts.join(' ');
        }

        return user.email?.trim() || undefined;
    }

    private createDefaultInstanceName(host?: string): string {
        if (!host) {
            return 'Default instance';
        }

        try {
            const parsed = new URL(host);
            return parsed.hostname;
        } catch {
            return host;
        }
    }

    private createInstanceId(): string {
        return `instance-${randomUUID().slice(0, 8)}`;
    }

    private createLegacyInstanceId(config: Partial<ILocalConfig>): string {
        const hostPart = config.host
            ? this.normalizeHost(config.host).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')
            : 'default';
        const projectPart = config.projectId
            ? config.projectId.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')
            : 'project';

        return `legacy-${hostPart || 'default'}-${projectPart || 'project'}`;
    }

    private isStoredWorkspaceConfig(raw: unknown): boolean {
        if (!raw || typeof raw !== 'object') {
            return false;
        }

        return Array.isArray((raw as Record<string, unknown>).instances);
    }
}
