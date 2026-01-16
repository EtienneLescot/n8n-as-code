import { N8nApiClient, IN8nCredentials } from '@n8n-as-code/core';
import chalk from 'chalk';
import { ConfigService } from '../services/config-service.js';

export class BaseCommand {
    protected client: N8nApiClient;
    protected config: any;
    protected configService: ConfigService;
    protected instanceIdentifier: string | null = null;

    constructor() {
        this.configService = new ConfigService();
        const localConfig = this.configService.getLocalConfig();
        const apiKey = localConfig.host ? this.configService.getApiKey(localConfig.host) : undefined;

        if (!localConfig.host || !apiKey) {
            console.error(chalk.red('❌ CLI not configured.'));
            console.error(chalk.yellow('Please run `n8n-as-code init` to set up your environment.'));
            process.exit(1);
        }

        const credentials: IN8nCredentials = {
            host: localConfig.host,
            apiKey: apiKey
        };

        this.client = new N8nApiClient(credentials);

        // Basic config defaults from local config
        this.config = {
            directory: localConfig.syncFolder || './workflows',
            pollInterval: localConfig.pollInterval || 3000,
            syncInactive: localConfig.syncInactive ?? true,
            ignoredTags: localConfig.ignoredTags || ['archive'],
            host: localConfig.host
        };
    }

    /**
     * Get or create instance identifier and ensure it's in the config
     */
    protected async ensureInstanceIdentifier(): Promise<string> {
        if (this.instanceIdentifier) {
            return this.instanceIdentifier;
        }

        this.instanceIdentifier = await this.configService.getOrCreateInstanceIdentifier(this.config.host);
        return this.instanceIdentifier;
    }

    /**
     * Get sync config with instance identifier
     */
    protected async getSyncConfig(): Promise<any> {
        const instanceIdentifier = await this.ensureInstanceIdentifier();
        
        return {
            directory: this.config.directory,
            pollIntervalMs: this.config.pollInterval,
            syncInactive: this.config.syncInactive,
            ignoredTags: this.config.ignoredTags,
            instanceIdentifier: instanceIdentifier,
            instanceConfigPath: this.configService.getInstanceConfigPath()
        };
    }
}
