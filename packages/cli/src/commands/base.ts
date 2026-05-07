import { N8nApiClient, IN8nCredentials } from '../core/index.js';
import chalk from 'chalk';
import { ConfigService, type IResolvedWorkspaceEnvironment } from '../services/config-service.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

export class BaseCommand {
    protected client: N8nApiClient;
    protected config: any;
    protected configService: ConfigService;
    protected activeInstanceId?: string;
    protected activeEnvironmentNameOrId?: string;
    protected activeEnvironment?: IResolvedWorkspaceEnvironment;
    protected instanceIdentifier: string | null = null;
    private runtimePrepared = false;

    constructor() {
        this.configService = new ConfigService();

        let host: string;
        let apiKey: string;
        let directory: string;
        let folderSync: boolean;
        let envCredentialsProvided = false;

        // If --env <name> was passed as a global option, resolve the workspace
        // environment; otherwise fall back to the locally active environment or legacy instance config.
        const requestedEnvironment = process.env.N8NAC_ENVIRONMENT?.trim() || undefined;
        const requestedInstanceName = process.env.N8NAC_INSTANCE_NAME?.trim() || undefined;
        if (requestedInstanceName) {
            console.error(chalk.red('❌ Direct instance targeting is no longer supported by n8nac.'));
            console.error(chalk.yellow('Create a workspace environment with `n8nac instance-target add ...` and `n8nac env add ...`, then use `--env <name>`.'));
            process.exit(1);
        }

        const resolvedEnvironment = requestedEnvironment
            ? this.configService.resolveEnvironment(requestedEnvironment)
            : this.tryResolveEnvironment();

        if (resolvedEnvironment) {
            this.activeEnvironmentNameOrId = requestedEnvironment || resolvedEnvironment.environmentId;
            this.activeEnvironment = resolvedEnvironment;
            this.activeInstanceId = resolvedEnvironment.activeInstanceId;
            host = resolvedEnvironment.host || '';
            apiKey = resolvedEnvironment.apiKey || '';
            const rawEnvHost = process.env.N8N_HOST;
            const envHost = rawEnvHost ? rawEnvHost.trim().replace(/^['"]|['"]$/g, '') : '';
            const rawEnvApiKey = process.env.N8N_API_KEY;
            const envApiKey = rawEnvApiKey ? rawEnvApiKey.trim().replace(/^['"]|['"]$/g, '') : '';
            if (envHost) host = envHost;
            if (envApiKey) apiKey = envApiKey;
            envCredentialsProvided = Boolean(envHost && envApiKey);
            const effectiveContext = this.activeInstanceId ? this.configService.getEffectiveContext(this.activeInstanceId) : undefined;
            const canPrepareManagedRuntime = resolvedEnvironment.targetKind === 'global-ref'
                && effectiveContext?.instance.mode === 'managed-local-docker';
            if (!host || !apiKey) {
                if (!canPrepareManagedRuntime) {
                    console.error(chalk.red(`❌ Environment "${resolvedEnvironment.environmentName}" needs a host and API key before this command can run.`));
                    console.error(chalk.yellow('Configure a local API key for this environment or update the workspace environment target.'));
                    process.exit(1);
                }
                apiKey = '';
            }
            directory = resolvedEnvironment.syncFolder || this.configService.resolveWorkspacePath('./workflows');
            folderSync = resolvedEnvironment.folderSync ?? false;
            this.instanceIdentifier = resolvedEnvironment.instanceIdentifier || null;
        } else {
            const localConfig = this.configService.getLocalConfig();
            this.activeInstanceId = this.configService.getActiveInstanceId();
            const effectiveContext = this.configService.getEffectiveContext(this.activeInstanceId);

            // Resolve host: explicit env override → backend-resolved config.
            const rawEnvHost = process.env.N8N_HOST;
            const envHost = rawEnvHost
                ? rawEnvHost.trim().replace(/^['"]|['"]$/g, '')
                : '';
            host = envHost || localConfig.host || '';

            // Resolve API key: explicit env override → backend-resolved secret.
            const rawEnvApiKey = process.env.N8N_API_KEY;
            const envApiKey = rawEnvApiKey
                ? rawEnvApiKey.trim().replace(/^['"]|['"]$/g, '')
                : '';
            envCredentialsProvided = Boolean(envHost && envApiKey);
            apiKey = envApiKey
                || (host ? this.configService.getApiKey(host, this.activeInstanceId) : undefined)
                || '';

            const canPrepareManagedRuntime = effectiveContext?.instance.mode === 'managed-local-docker' && Boolean(host);
            if (!host || !apiKey) {
                if (!canPrepareManagedRuntime) {
                    console.error(chalk.red('❌ CLI not configured.'));
                    console.error(chalk.yellow('Configure n8n with `n8n-manager auth set` and set workspace context with `n8nac workspace ...`.'));
                    process.exit(1);
                }
                apiKey = '';
            }

            directory = this.configService.resolveWorkspacePath(localConfig.syncFolder || './workflows');
            folderSync = localConfig.folderSync ?? false;
        }

        this.client = new N8nApiClient({ host, apiKey } as IN8nCredentials);
        this.config = {
            directory,
            syncInactive: true,
            ignoredTags: [],
            host,
            apiKeyConfigured: Boolean(apiKey),
            folderSync,
        };
        this.runtimePrepared = envCredentialsProvided && !this.activeEnvironmentNameOrId;

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

    private tryResolveEnvironment(): IResolvedWorkspaceEnvironment | undefined {
        try {
            return this.configService.resolveEnvironment();
        } catch {
            return undefined;
        }
    }

    /**
     * Get or create instance identifier and ensure it's in the config
     */
    protected async ensureInstanceIdentifier(): Promise<string> {
        await this.prepareRuntimeContext();
        if (this.instanceIdentifier) {
            return this.instanceIdentifier;
        }

        if (this.activeEnvironment?.targetKind === 'embedded' && this.activeEnvironment.instanceIdentifier) {
            this.instanceIdentifier = this.activeEnvironment.instanceIdentifier;
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
        await this.prepareRuntimeContext();
        const instanceIdentifier = await this.ensureInstanceIdentifier();
        const localConfig = this.activeEnvironmentNameOrId
            ? this.configService.getLocalConfig(this.activeEnvironmentNameOrId)
            : this.activeInstanceId
            ? (this.configService.getEffectiveInstanceConfig(this.activeInstanceId) ?? this.configService.getLocalConfig())
            : this.configService.getLocalConfig();

        const missing: string[] = [];
        if (!localConfig.projectId) missing.push('projectId');
        if (!localConfig.projectName) missing.push('projectName');
        if (!localConfig.syncFolder) missing.push('syncFolder');

        if (missing.length > 0) {
            console.error(chalk.red(`❌ Missing required project configuration: ${missing.join(', ')}.`));
            console.error(chalk.yellow('Set workspace context with `n8nac workspace set-sync-folder workflows`. For self-hosted n8n where the projects API is unavailable, use `n8nac workspace set-project --project-id personal --project-name Personal`; otherwise select a project with `n8n-manager projects select`.'));
            process.exit(1);
        }

        return {
            directory: this.config.directory,
            workflowDir: localConfig.workflowDir
                ? this.configService.resolveWorkspacePath(localConfig.workflowDir)
                : undefined,
            syncInactive: true,
            ignoredTags: [],
            instanceIdentifier: instanceIdentifier,
            instanceConfigPath: this.configService.getInstanceConfigPath(),
            projectId: localConfig.projectId,
            projectName: localConfig.projectName,
            folderSync: localConfig.folderSync ?? false,
            environmentId: this.activeEnvironment?.environmentId,
            environmentName: this.activeEnvironment?.environmentName,
            instanceTargetId: this.activeEnvironment?.instanceTargetId,
            instanceTargetName: this.activeEnvironment?.instanceTargetName,
            targetKind: this.activeEnvironment?.targetKind,
        };
    }

    protected async prepareRuntimeContext(): Promise<void> {
        if (this.runtimePrepared) {
            return;
        }

        try {
            const environment = this.activeEnvironmentNameOrId;
            const preparedEnvironment = environment
                ? await this.configService.prepareEnvironment(environment)
                : undefined;
            const context = preparedEnvironment
                ? await this.configService.prepareWorkspaceContext({ environment })
                : await this.configService.prepareWorkspaceContext(this.activeInstanceId);
            if (!context.host || !context.apiKey) {
                this.exitWithError(`Instance "${context.activeInstanceName}" needs a host and API key before this command can run`);
            }

            this.activeEnvironment = preparedEnvironment || this.activeEnvironment;
            this.instanceIdentifier = preparedEnvironment?.instanceIdentifier || this.instanceIdentifier;
            this.activeInstanceId = context.activeInstanceId;
            this.client = new N8nApiClient({ host: context.host, apiKey: context.apiKey } as IN8nCredentials);
            this.config = {
                ...this.config,
                directory: this.configService.resolveWorkspacePath(context.syncFolder || './workflows'),
                host: context.host,
                apiKeyConfigured: true,
                folderSync: context.folderSync ?? false,
            };
            this.runtimePrepared = true;
        } catch (error) {
            if (this.config?.host && this.config?.apiKeyConfigured) {
                this.runtimePrepared = true;
                return;
            }
            this.exitWithError('Unable to prepare n8n runtime', error);
        }
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
