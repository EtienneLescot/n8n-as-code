import Conf from 'conf';
import fs from 'fs';
import path from 'path';

// Unified local config written to n8nac-config.json (legacy n8nac.json/n8nac-instance.json deprecated)
export interface ILocalConfig {
    host: string;
    syncFolder: string;
    projectId: string;          // REQUIRED: Active project scope
    projectName: string;        // REQUIRED: Project display name
    instanceIdentifier?: string; // Auto-generated once; stored for consistent paths
    customNodesPath?: string;   // Optional path to n8nac-custom-nodes.json for user-defined node schemas
}

export class ConfigService {
    private globalStore: Conf;
    private localConfigPath: string;

    constructor() {
        this.globalStore = new Conf({
            projectName: 'n8nac',
            configName: 'credentials'
        });
        // Unified config file
        this.localConfigPath = path.join(process.cwd(), 'n8nac-config.json');
    }

    /**
     * Get the local configuration from n8nac-config.json (migrates legacy once)
     */
    getLocalConfig(): Partial<ILocalConfig> {
        if (fs.existsSync(this.localConfigPath)) {
            try {
                const content = fs.readFileSync(this.localConfigPath, 'utf-8');
                return JSON.parse(content);
            } catch (error) {
                console.error('Error reading local config:', error);
            }
        }

        // Legacy migration: if old files exist, merge once into unified file
        const legacyConfigPath = path.join(process.cwd(), 'n8nac.json');
        const legacyInstancePath = path.join(process.cwd(), 'n8nac-instance.json');

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
                const inst = JSON.parse(fs.readFileSync(legacyInstancePath, 'utf-8'));
                legacy.instanceIdentifier = legacy.instanceIdentifier || inst.instanceIdentifier;
                // Prefer syncFolder from legacy config; fall back to instance file if present
                legacy.syncFolder = legacy.syncFolder || inst.syncFolder || legacy.syncFolder;
            } catch (error) {
                console.error('Error reading legacy instance config:', error);
            }
        }

        // If we got enough data, persist into unified file and return
        if (legacy.host && legacy.syncFolder && legacy.projectId && legacy.projectName) {
            const unified: ILocalConfig = {
                host: legacy.host,
                syncFolder: legacy.syncFolder,
                projectId: legacy.projectId,
                projectName: legacy.projectName,
                instanceIdentifier: legacy.instanceIdentifier
            };
            this.saveLocalConfig(unified);
            return unified;
        }

        return {};
    }

    /**
     * Save the local configuration to n8nac-config.json
     */
    saveLocalConfig(config: ILocalConfig): void {
        fs.writeFileSync(this.localConfigPath, JSON.stringify(config, null, 2));
    }

    /**
     * Save partial bootstrap state before a project is selected.
     * This intentionally resets project-specific fields when auth changes.
     */
    saveBootstrapState(host: string, syncFolder = 'workflows'): void {
        const current = this.getLocalConfig();
        const bootstrapState: Partial<ILocalConfig> = {
            host,
            syncFolder,
        };

        if (current.customNodesPath) {
            bootstrapState.customNodesPath = current.customNodesPath;
        }

        fs.writeFileSync(this.localConfigPath, JSON.stringify(bootstrapState, null, 2));
    }

    /**
     * Get API key for a specific host from the global store
     */
    getApiKey(host: string): string | undefined {
        const credentials = this.globalStore.get('hosts') as Record<string, string> || {};
        return credentials[this.normalizeHost(host)];
    }

    /**
     * Save API key for a specific host in the global store
     */
    saveApiKey(host: string, apiKey: string): void {
        const credentials = this.globalStore.get('hosts') as Record<string, string> || {};
        credentials[this.normalizeHost(host)] = apiKey;
        this.globalStore.set('hosts', credentials);
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
        const local = this.getLocalConfig();
        return !!(local.host && this.getApiKey(local.host));
    }

    /**
     * Generate or retrieve the instance identifier using Sync's directory-utils
     * Format: {hostSlug}_{userSlug} (e.g., "local_5678_etienne_l")
     */
    async getOrCreateInstanceIdentifier(host: string): Promise<string> {
        const local = this.getLocalConfig();
        const apiKey = this.getApiKey(host);

        if (!apiKey) {
            throw new Error('API key not found');
        }

        try {
            const { resolveInstanceIdentifier } = await import('../core/index.js');
            const { identifier } = await resolveInstanceIdentifier({ host, apiKey });

            this.saveLocalConfig({
                ...local as ILocalConfig,
                host,
                instanceIdentifier: identifier
            });

            return identifier;
        } catch (error) {
            console.warn('Could not fetch user info, using fallback identifier');
            const { createFallbackInstanceIdentifier } = await import('../core/index.js');
            const fallbackIdentifier = createFallbackInstanceIdentifier(host, apiKey);

            this.saveLocalConfig({
                ...local as ILocalConfig,
                host,
                instanceIdentifier: fallbackIdentifier
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
}
