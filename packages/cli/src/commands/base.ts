import { N8nApiClient, IN8nCredentials } from '../core/index.js';
import chalk from 'chalk';
import { ConfigService } from '../services/config-service.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

export class BaseCommand {
    protected client: N8nApiClient;
    protected config: any;
    protected configService: ConfigService;
    protected activeInstanceId?: string;
    protected instanceIdentifier: string | null = null;

    constructor() {
        this.configService = new ConfigService();

        let host: string;
        let apiKey: string;
        let directory: string;
        let folderSync: boolean;

        // If --instance <name> was passed as a global option, resolve that instance;
        // otherwise fall back to the locally active instance / env vars.
        const requestedInstanceName = process.env.N8NAC_INSTANCE_NAME?.trim() || undefined;
        if (requestedInstanceName) {
            const matches = this.configService.listInstances().filter(
                (i) => i.name.toLowerCase() === requestedInstanceName.toLowerCase()
            );
            if (matches.length === 0) {
                console.error(chalk.red(`❌ Unknown instance: "${requestedInstanceName}". Run \`n8nac instance list\` to see available instances.`));
                process.exit(1);
            }
            if (matches.length > 1) {
                const duplicateInstances = matches
                    .map((i) => `- ${i.name} (${i.id})`)
                    .join('\n');
                console.error(chalk.red(`❌ Ambiguous instance name: "${requestedInstanceName}". Multiple saved instances match this name:`));
                console.error(chalk.yellow(duplicateInstances));
                console.error(chalk.yellow('Please rename the instance(s) to use unique names, or use an `--instance-id` option if available.'));
                process.exit(1);
            }
            const match = matches[0];
            host = match.host || '';
            apiKey = host ? (this.configService.getApiKey(host, match.id) || '') : '';
            if (!host || !apiKey) {
                console.error(chalk.red(`❌ Instance "${requestedInstanceName}" has no host or API key configured.`));
                process.exit(1);
            }
            this.activeInstanceId = match.id;
            directory = match.syncFolder || './workflows';
            folderSync = match.folderSync ?? false;
        } else {
            const localConfig = this.configService.getLocalConfig();
            this.activeInstanceId = this.configService.getActiveInstanceId();

            // Resolve host: local config → env var
            const rawEnvHost = process.env.N8N_HOST;
            const envHost = rawEnvHost
                ? rawEnvHost.trim().replace(/^['"]|['"]$/g, '')
                : '';
            host = localConfig.host || envHost || '';

            // Resolve API key: global Conf store → env var
            const rawEnvApiKey = process.env.N8N_API_KEY;
            const envApiKey = rawEnvApiKey
                ? rawEnvApiKey.trim().replace(/^['"]|['"]$/g, '')
                : '';
            apiKey = (host ? this.configService.getApiKey(host, this.activeInstanceId) : undefined)
                || envApiKey
                || '';

            if (!host || !apiKey) {
                console.error(chalk.red('❌ CLI not configured.'));
                console.error(chalk.yellow('Please run `n8nac init` to set up your environment, or set N8N_HOST and N8N_API_KEY environment variables.'));
                process.exit(1);
            }

            directory = localConfig.syncFolder || './workflows';
            folderSync = localConfig.folderSync ?? false;
        }

        this.client = new N8nApiClient({ host, apiKey } as IN8nCredentials);
        this.config = {
            directory,
            syncInactive: true,
            ignoredTags: [],
            host,
            folderSync,
        };

        // Silently refresh AGENTS.md in the background if the installed n8nac version changed.
        // Spawned as a fully-detached child process so it never blocks the command, never
        // interleaves with stdout, and can't be killed by an early process.exit().
        try {
            const __dir = dirname(fileURLToPath(import.meta.url));
            const cliPath = join(__dir, '..', '..', 'index.js');
            const child = spawn(process.execPath, [cliPath, 'update-ai', '--silent'], {
                cwd: process.cwd(),
                detached: true,
                stdio: 'ignore',
            });
            child.unref();
        } catch { /* never block the command */ }
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
        // When --instance overrides the active instance, use that instance's stored config
        // instead of the file's active instance config so projectId/syncFolder are consistent.
        const localConfig = this.activeInstanceId
            ? (this.configService.getInstanceConfig(this.activeInstanceId) ?? this.configService.getLocalConfig())
            : this.configService.getLocalConfig();

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
