import { N8nApiClient, IN8nCredentials } from '../core/index.js';
import chalk from 'chalk';
import { ConfigService } from '../services/config-service.js';

export class BaseCommand {
    protected client: N8nApiClient;
    protected config: any;
    protected configService: ConfigService;
    protected activeInstanceId?: string;
    protected instanceIdentifier: string | null = null;

    constructor() {
        this.configService = new ConfigService();
        const localConfig = this.configService.getLocalConfig();
        this.activeInstanceId = this.configService.getActiveInstanceId();

        // Resolve host: local config → env var
        const rawEnvHost = process.env.N8N_HOST;
        const envHost = rawEnvHost
            ? rawEnvHost.trim().replace(/^['"]|['"]$/g, '')
            : '';
        const host = localConfig.host || envHost || '';

        // Resolve API key: global Conf store → env var
        const rawEnvApiKey = process.env.N8N_API_KEY;
        const envApiKey = rawEnvApiKey
            ? rawEnvApiKey.trim().replace(/^['"]|['"]$/g, '')
            : '';
        const apiKey = (host ? this.configService.getApiKey(host, this.activeInstanceId) : undefined)
            || envApiKey
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
            host,
            folderSync: localConfig.folderSync ?? false,
        };
    }

    /**
     * Get or create instance identifier and ensure it's in the config
     */
    protected async ensureInstanceIdentifier(): Promise<string> {
        if (this.instanceIdentifier) {
            return this.instanceIdentifier;
        }

        this.instanceIdentifier = await this.configService.getOrCreateInstanceIdentifier(this.config.host, this.activeInstanceId);
        return this.instanceIdentifier;
    }

    /**
     * Get sync config with instance identifier.
     * Validates that required project fields are present; exits with a clear error if not.
     */
    protected async getSyncConfig(): Promise<any> {
        const localConfig = this.configService.getLocalConfig();

        const missing: string[] = [];
        if (!localConfig.projectId) missing.push('projectId');
        if (!localConfig.projectName) missing.push('projectName');
        if (!localConfig.syncFolder) missing.push('syncFolder');

        if (missing.length > 0) {
            console.error(chalk.red(`❌ Missing required project configuration: ${missing.join(', ')}.`));
            console.error(chalk.yellow('Please run `n8nac init` to configure your project, or create an `n8nac-config.json` file with the required fields.'));
            process.exit(1);
        }

        const instanceIdentifier = await this.ensureInstanceIdentifier();

        return {
            directory: this.config.directory,
            syncInactive: true,
            ignoredTags: [],
            instanceIdentifier: instanceIdentifier,
            instanceConfigPath: this.configService.getInstanceConfigPath(),
            projectId: localConfig.projectId,
            projectName: localConfig.projectName,
            folderSync: localConfig.folderSync ?? false,
        };
    }

    protected formatErrorDetails(error: unknown): string {
        if (error && typeof error === 'object') {
            const response = (error as any).response;
            const status = response?.status;
            const responseData = response?.data;

            let remoteMessage = '';
            if (typeof responseData?.message === 'string' && responseData.message.trim().length > 0) {
                remoteMessage = responseData.message.trim();
            } else if (typeof responseData === 'string' && responseData.trim().length > 0) {
                remoteMessage = responseData.trim();
            } else if (responseData && typeof responseData === 'object') {
                remoteMessage = JSON.stringify(responseData);
            }

            if (status && remoteMessage) {
                return `HTTP ${status}: ${remoteMessage}`;
            }
            if (remoteMessage) {
                return remoteMessage;
            }
            if (status) {
                return `HTTP ${status}`;
            }
        }

        if (error instanceof Error) {
            return error.message;
        }

        return String(error);
    }

    protected exitWithError(message: string, error?: unknown): never {
        if (error !== undefined) {
            const details = this.formatErrorDetails(error);
            console.error(chalk.red(`❌ ${message}: ${details}`));
        } else {
            console.error(chalk.red(`❌ ${message}`));
        }
        process.exit(1);
    }
}
