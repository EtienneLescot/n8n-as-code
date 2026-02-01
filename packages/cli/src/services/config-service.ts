import Conf from 'conf';
import fs from 'fs';
import path from 'path';

export interface ILocalConfig {
    host: string;
    syncFolder: string;
    instanceIdentifier?: string;
    projectId: string;          // REQUIRED: Active project scope
    projectName: string;        // REQUIRED: Project display name
    pollInterval: number;
    syncInactive: boolean;
    ignoredTags: string[];
}

export class ConfigService {
    private globalStore: Conf;
    private localConfigPath: string;

    constructor() {
        this.globalStore = new Conf({
            projectName: 'n8nac',
            configName: 'credentials'
        });
        this.localConfigPath = path.join(process.cwd(), 'n8nac.json');
    }

    /**
     * Get the local configuration from n8nac.json
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
        return {};
    }

    /**
     * Save the local configuration to n8nac.json
     */
    saveLocalConfig(config: ILocalConfig): void {
        fs.writeFileSync(this.localConfigPath, JSON.stringify(config, null, 2));
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

        // If already exists in local config, return it
        if (local.instanceIdentifier) {
            return local.instanceIdentifier;
        }

        // Generate new instance identifier using Sync's functions
        try {
            const apiKey = this.getApiKey(host);
            if (!apiKey) {
                throw new Error('API key not found');
            }

            // Import Sync utilities
            const { N8nApiClient, createInstanceIdentifier, createFallbackInstanceIdentifier } = await import('@n8n-as-code/sync');

            // Try to get current user from n8n API
            const client = new N8nApiClient({ host, apiKey });
            const user = await client.getCurrentUser();

            let identifier: string;

            if (user) {
                // Use user info to create identifier
                identifier = createInstanceIdentifier(host, user);
            } else {
                // Fallback to API key hash
                identifier = createFallbackInstanceIdentifier(host, apiKey);
            }

            // Save to local config
            this.saveLocalConfig({
                ...local as ILocalConfig,
                instanceIdentifier: identifier
            });

            return identifier;
        } catch (error) {
            console.warn('Could not fetch user info, using fallback identifier');
            const apiKey = this.getApiKey(host)!;
            const { createFallbackInstanceIdentifier } = await import('@n8n-as-code/sync');
            return createFallbackInstanceIdentifier(host, apiKey);
        }
    }

    /**
     * Get the path for n8nac-instance.json
     */
    getInstanceConfigPath(): string {
        return path.join(process.cwd(), 'n8nac-instance.json');
    }
}
