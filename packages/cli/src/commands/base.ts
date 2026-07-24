import { N8nApiClient, IN8nCredentials, isCertificateTrustError, CERTIFICATE_TRUST_HINT_CLI } from '../core/index.js';
import chalk from 'chalk';
import { ConfigService, type IResolvedWorkspaceEnvironment } from '../services/config-service.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * The most useful text an error carries: the remote message and status when the request
 * reached n8n, otherwise the transport error.
 *
 * Exported as a free function so commands that report through `ora` rather than
 * {@link BaseCommand.exitWithError} share one implementation, and so it is directly testable.
 */
export function formatErrorDetails(error: unknown): string {
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

/**
 * `"<what failed>: <details>"`, with certificate-trust guidance appended when the failure is a
 * TLS trust problem.
 *
 * Every command that talks to the n8n API should report through this. Node's bare
 * "unable to verify the first certificate" tells a user nothing about which knob to reach for,
 * and tightened verification for public hosts means more of them now meet it legitimately.
 *
 * The hint goes on its own line so the first line stays greppable and unchanged.
 */
export function formatConnectionError(message: string, error?: unknown): string {
    const details = error === undefined ? '' : formatErrorDetails(error);
    // `SyncManager` emits errors that already embed the caller's own label
    // ("Failed to fetch workflow X: ..."), so prefixing again would say it twice.
    const base = !details ? message
        : details.startsWith(message) ? details
        : `${message}: ${details}`;
    return isCertificateTrustError(error) ? `${base}\n${CERTIFICATE_TRUST_HINT_CLI}` : base;
}

/** The part of `EventEmitter` this helper needs, so tests can pass a stub. */
export interface IErrorEmitter {
    on(event: 'error', listener: (error: Error) => void): unknown;
}

/**
 * Record errors a `SyncManager` emits, and return an accessor for the most recent one.
 *
 * `SyncManager` reports a failed remote call by emitting `error` and returning a falsy result
 * rather than rethrowing. Two consequences, both of which this fixes:
 *
 * 1. With no `error` listener, Node escalates the event into an uncaught exception, so the
 *    command dies with a raw stack trace before its own `catch` can format anything.
 * 2. The falsy return is indistinguishable from a legitimate "not found", so a transport or
 *    TLS failure would otherwise be reported as a missing workflow.
 *
 * Callers pass the captured error to {@link formatConnectionError} in preference to whatever
 * the promise rejected with, because the emitted one carries the real cause.
 */
export function captureEmittedErrors(emitter: IErrorEmitter): () => Error | undefined {
    let last: Error | undefined;
    emitter.on('error', (error: Error) => { last = error; });
    return () => last;
}

export class BaseCommand {
    protected client: N8nApiClient;
    protected config: any;
    protected configService: ConfigService;
    protected activeInstanceId?: string;
    protected activeEnvironmentNameOrId?: string;
    protected activeEnvironment?: IResolvedWorkspaceEnvironment;
    protected instanceIdentifier: string | null = null;
    protected instanceUserIdentifier: string | null = null;
    private runtimePrepared = false;

    constructor() {
        this.configService = new ConfigService();

        let host: string;
        let apiKey: string;
        let directory: string;
        let folderSync: boolean;
        // If --env <name> was passed as a global option, resolve that workspace
        // environment; otherwise use the V4 active environment.
        const requestedEnvironment = process.env.N8NAC_ENVIRONMENT?.trim() || undefined;
        const resolvedEnvironment = this.tryResolveEnvironment(requestedEnvironment);

        if (!resolvedEnvironment) {
            console.error(chalk.red('❌ CLI not configured.'));
            console.error(chalk.yellow('Create a V4 workspace environment with `n8nac env add <name> --base-url <url> --workflows-path workflows/<name>` and store auth with `n8nac env auth set <name> --api-key-stdin`.'));
            process.exit(1);
        }

        this.activeEnvironmentNameOrId = requestedEnvironment || resolvedEnvironment.environmentId;
        this.activeEnvironment = resolvedEnvironment;
        this.activeInstanceId = resolvedEnvironment.activeInstanceId;
        host = resolvedEnvironment.host || '';
        apiKey = resolvedEnvironment.apiKey || '';
        const canPrepareRuntime = resolvedEnvironment.sourceKind === 'managed-instance';
        if (!host || !apiKey) {
            if (!canPrepareRuntime) {
                console.error(chalk.red(`❌ Environment "${resolvedEnvironment.environmentName}" needs a host and API key before this command can run.`));
                console.error(chalk.yellow(`Configure a local API key with \`n8nac env auth set ${resolvedEnvironment.environmentName} --api-key-stdin\` or update the environment URL.`));
                process.exit(1);
            }
            apiKey = '';
        }
        directory = resolvedEnvironment.workflowsPath;
        folderSync = resolvedEnvironment.folderSync ?? false;
        this.instanceIdentifier = resolvedEnvironment.instanceIdentifier || null;
        this.instanceUserIdentifier = resolvedEnvironment.instanceUserIdentifier || null;

        this.client = new N8nApiClient({ host, apiKey } as IN8nCredentials);
        this.config = {
            directory,
            syncInactive: true,
            ignoredTags: [],
            host,
            apiKeyConfigured: Boolean(apiKey),
            folderSync,
        };
        this.runtimePrepared = false;

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

    private tryResolveEnvironment(environmentNameOrId?: string): IResolvedWorkspaceEnvironment | undefined {
        if (!this.configService.isWorkspaceConfigV4()) {
            return undefined;
        }
        try {
            return this.configService.resolveEnvironment(environmentNameOrId);
        } catch (error: any) {
            console.error(chalk.red(`❌ Workspace environment resolution failed: ${error?.message || error}`));
            console.error(chalk.yellow('Fix the pinned workspace environment with `n8nac env pin <name>` or update the v4 environment config.'));
            process.exit(1);
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

        if (this.activeEnvironment?.sourceKind === 'external-instance' && this.activeEnvironment.instanceIdentifier) {
            this.instanceIdentifier = this.activeEnvironment.instanceIdentifier;
            return this.instanceIdentifier;
        }
        if (this.activeEnvironment?.sourceKind === 'external-instance') {
            this.exitWithError(`Environment "${this.activeEnvironment.environmentName}" needs a resolvable instance identifier before sync can run`);
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
        const localConfig = this.activeEnvironment || this.configService.getLocalConfig(this.activeEnvironmentNameOrId);

        const missing: string[] = [];
        if (!localConfig.projectId) missing.push('projectId');
        if (!localConfig.projectName) missing.push('projectName');
        if (!localConfig.workflowsPath) missing.push('workflowsPath');

        if (missing.length > 0) {
            console.error(chalk.red(`❌ Missing required project configuration: ${missing.join(', ')}.`));
            console.error(chalk.yellow('Update the workspace environment with `n8nac env update <name> --project-id personal --project-name Personal --workflows-path workflows/<name>`.'));
            process.exit(1);
        }

        return {
            directory: this.config.directory,
            workflowsPath: localConfig.workflowsPath
                ? this.configService.resolveWorkspacePath(localConfig.workflowsPath)
                : undefined,
            workflowDir: localConfig.workflowsPath
                ? this.configService.resolveWorkspacePath(localConfig.workflowsPath)
                : undefined,
            syncInactive: true,
            ignoredTags: [],
            instanceIdentifier: instanceIdentifier,
            instanceUserIdentifier: this.activeEnvironment?.instanceUserIdentifier || localConfig.instanceUserIdentifier,
            instanceConfigPath: this.configService.getInstanceConfigPath(),
            projectId: localConfig.projectId,
            projectName: localConfig.projectName,
            folderSync: localConfig.folderSync ?? false,
            environmentId: this.activeEnvironment?.environmentId,
            environmentName: this.activeEnvironment?.environmentName,
            environmentTargetId: this.activeEnvironment?.environmentTargetId,
            environmentTargetName: this.activeEnvironment?.environmentTargetName,
            sourceKind: this.activeEnvironment?.sourceKind,
        };
    }

    protected async prepareRuntimeContext(): Promise<void> {
        if (this.runtimePrepared) {
            return;
        }
        if (process.env.N8NAC_TEST_SKIP_RUNTIME_PREPARE === '1') {
            this.runtimePrepared = true;
            return;
        }

        try {
            const environment = this.activeEnvironmentNameOrId;
            const preparedEnvironment = await this.configService.prepareEnvironment(environment);
            const context = await this.configService.prepareWorkspaceContext({ environment });
            if (!context.host || !context.apiKey) {
                this.exitWithError(`Instance "${context.activeInstanceName}" needs a host and API key before this command can run`);
            }

            this.activeEnvironment = preparedEnvironment || this.activeEnvironment;
            this.instanceIdentifier = preparedEnvironment?.instanceIdentifier || this.instanceIdentifier;
            this.instanceUserIdentifier = preparedEnvironment?.instanceUserIdentifier || this.instanceUserIdentifier;
            this.activeInstanceId = context.activeInstanceId;
            this.client = new N8nApiClient({ host: context.host, apiKey: context.apiKey } as IN8nCredentials);
            this.config = {
                ...this.config,
                directory: this.configService.resolveWorkspacePath((context as any).workflowsPath),
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

    /** Kept as a method for subclasses that already call it; the logic lives in the free function. */
    protected formatErrorDetails(error: unknown): string {
        return formatErrorDetails(error);
    }

    protected exitWithError(message: string, error?: unknown): never {
        console.error(chalk.red(`❌ ${formatConnectionError(message, error)}`));
        process.exit(1);
    }
}
