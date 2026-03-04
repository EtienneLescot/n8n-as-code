import { N8nApiClient, IN8nCredentials } from '../core/index.js';
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

        // Resolve host: local config → env var
        const host = localConfig.host || process.env.N8N_HOST?.replace(/^'|'$/g, '') || '';

        // Resolve API key: global Conf store → env var
        const apiKey = (host ? this.configService.getApiKey(host) : undefined)
            || process.env.N8N_API_KEY
            || '';

        if (!host || !apiKey) {
            console.error(chalk.red('❌ CLI not configured.'));
            console.error(chalk.yellow('Please run `n8nac init` to set up your environment, or set N8N_HOST and N8N_API_KEY environment variables.'));
            process.exit(1);
        }

        const credentials: IN8nCredentials = {
            host,
            apiKey
        };

        this.client = new N8nApiClient(credentials);

        // Basic config defaults from local config (syncInactive/ignoredTags now hardcoded defaults)
        this.config = {
            directory: localConfig.syncFolder || './workflows',
            syncInactive: true,
            ignoredTags: [],
            host
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
        const localConfig = this.configService.getLocalConfig();
        
        return {
            directory: this.config.directory,
            syncInactive: true,
            ignoredTags: [],
            instanceIdentifier: instanceIdentifier,
            instanceConfigPath: this.configService.getInstanceConfigPath(),
            projectId: localConfig.projectId,
            projectName: localConfig.projectName
        };
    }
}
