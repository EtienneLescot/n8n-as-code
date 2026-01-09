import Conf from 'conf';
import fs from 'fs';
import path from 'path';

export interface ILocalConfig {
    host: string;
    syncFolder: string;
    instanceIdentifier?: string;
    pollInterval: number;
    syncInactive: boolean;
    ignoredTags: string[];
}

export class ConfigService {
    private globalStore: Conf;
    private localConfigPath: string;

    constructor() {
        this.globalStore = new Conf({
            projectName: 'n8n-as-code',
            configName: 'credentials'
        });
        this.localConfigPath = path.join(process.cwd(), 'n8n-as-code.json');
    }

    /**
     * Get the local configuration from n8n-as-code.json
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
     * Save the local configuration to n8n-as-code.json
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
}
