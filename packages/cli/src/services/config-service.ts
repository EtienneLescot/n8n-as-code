import Conf from 'conf';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

// Unified local config written to n8nac-config.json (legacy n8nac.json/n8nac-instance.json deprecated)
export interface ILocalConfig {
    host?: string;
    syncFolder?: string;
    projectId?: string;          // REQUIRED: Active project scope
    projectName?: string;        // REQUIRED: Project display name
    instanceIdentifier?: string; // Auto-generated once; stored for consistent paths
    customNodesPath?: string;    // Optional path to n8nac-custom-nodes.json for user-defined node schemas
    folderSync?: boolean;        // Mirror n8n folder hierarchy as local subdirectories (default: false)
}

export interface IInstanceProfile extends ILocalConfig {
    id: string;
    name: string;
}

export interface IWorkspaceConfig extends ILocalConfig {
    version: 2;
    activeInstanceId?: string;
    instances: IInstanceProfile[];
}

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

    listInstances(): IInstanceProfile[] {
        return this.getWorkspaceConfig().instances;
    }

    getInstance(instanceId: string): IInstanceProfile | undefined {
        return this.listInstances().find((instance) => instance.id === instanceId);
    }

    getActiveInstance(): IInstanceProfile | undefined {
        return this.getActiveInstanceFromConfig(this.getWorkspaceConfig());
    }

    getActiveInstanceId(): string | undefined {
        return this.getWorkspaceConfig().activeInstanceId;
    }

    setActiveInstance(instanceId: string): IInstanceProfile {
        const workspaceConfig = this.getWorkspaceConfig();
        const instance = workspaceConfig.instances.find((candidate) => candidate.id === instanceId);

        if (!instance) {
            throw new Error(`Unknown instance profile: ${instanceId}`);
        }

        const next = this.buildWorkspaceConfig(workspaceConfig.instances, instance.id);
        this.writeWorkspaceConfig(next);
        return instance;
    }

    /**
     * Save the active local configuration to n8nac-config.json.
     * This updates or creates the targeted instance profile, then makes it active by default.
     */
    saveLocalConfig(
        config: Partial<ILocalConfig>,
        options: { instanceId?: string; instanceName?: string; setActive?: boolean } = {}
    ): IInstanceProfile {
        const workspaceConfig = this.getWorkspaceConfig();
        const existingActive = this.getActiveInstanceFromConfig(workspaceConfig);
        const targetId = options.instanceId || existingActive?.id;
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
        options: { setActive?: boolean } = {}
    ): IInstanceProfile {
        const current = profile.id ? this.getInstance(profile.id) : undefined;

        return this.saveLocalConfig({
            host: profile.host ?? current?.host,
            syncFolder: profile.syncFolder ?? current?.syncFolder,
            projectId: profile.projectId ?? current?.projectId,
            projectName: profile.projectName ?? current?.projectName,
            instanceIdentifier: profile.instanceIdentifier ?? current?.instanceIdentifier,
            customNodesPath: profile.customNodesPath ?? current?.customNodesPath,
            folderSync: profile.folderSync ?? current?.folderSync,
        }, {
            instanceId: profile.id,
            instanceName: profile.name,
            setActive: options.setActive,
        });
    }

    /**
     * Save partial bootstrap state before a project is selected.
     * This intentionally resets project-specific fields when auth changes.
     */
    saveBootstrapState(
        host: string,
        syncFolder = 'workflows',
        options: { instanceId?: string; instanceName?: string } = {}
    ): IInstanceProfile {
        const current = options.instanceId ? this.getInstance(options.instanceId) : this.getActiveInstance();

        return this.saveLocalConfig({
            host,
            syncFolder,
            customNodesPath: current?.customNodesPath,
            folderSync: current?.folderSync,
            projectId: undefined,
            projectName: undefined,
            instanceIdentifier: current?.instanceIdentifier,
        }, {
            instanceId: options.instanceId,
            instanceName: options.instanceName,
            setActive: true,
        });
    }

    /**
     * Get API key for a specific host from the global store.
     * When an instance id is provided, profile-scoped secrets take precedence.
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
     * Profile-scoped storage allows distinct secrets per configured instance.
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

            this.saveLocalConfig({
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

            this.saveLocalConfig({
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

        return {
            id,
            name,
            ...localConfig,
        };
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
