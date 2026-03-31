import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { N8nApiClient } from '../core/index.js';
import { IProject } from '../core/types.js';
import { getDisplayProjectName } from '../core/helpers/project-helpers.js';
import { ConfigService, ILocalConfig } from '../services/config-service.js';
import { UpdateAiCommand } from './init-ai.js';
import { Command } from 'commander';

export interface InitCommandOptions {
    host?: string;
    apiKey?: string;
    syncFolder?: string;
    instanceName?: string;
    projectId?: string;
    projectName?: string;
    projectIndex?: number;
    yes?: boolean;
}

export class InitCommand {
    private configService: ConfigService;

    constructor() {
        this.configService = new ConfigService();
    }

    async run(options: InitCommandOptions = {}): Promise<void> {
        console.log(chalk.cyan('\n🚀 Welcome to n8n-as-code initialization!'));
        console.log(chalk.gray('This tool will help you configure your local environment.\n'));

        const currentLocal = this.configService.getLocalConfig();
        const currentInstance = this.configService.getActiveInstance();
        const currentApiKey = currentLocal.host
            ? this.configService.getApiKey(currentLocal.host, currentInstance?.id)
            : '';
        const resolvedOptions = this.resolveOptions(options, currentLocal, currentApiKey);

        if (this.shouldRunNonInteractive(options)) {
            await this.runNonInteractive(resolvedOptions);
            return;
        }

        await this.runInteractive(currentLocal, currentApiKey);
    }

    async runAuthSetup(options: InitCommandOptions = {}): Promise<void> {
        console.log(chalk.cyan('\n🔐 n8n-as-code authentication setup'));
        console.log(chalk.gray('This step stores your n8n host and API key, then lists available projects.\n'));

        const currentLocal = this.configService.getLocalConfig();
        const currentInstance = this.configService.getActiveInstance();
        const currentApiKey = currentLocal.host
            ? this.configService.getApiKey(currentLocal.host, currentInstance?.id)
            : '';
        const resolvedOptions = this.resolveOptions(options, currentLocal, currentApiKey);

        if (!resolvedOptions.host) {
            console.error(chalk.red('❌ Missing n8n host. Pass --host <url> or set N8N_HOST.'));
            process.exitCode = 1;
            return;
        }

        const hostValidation = this.validateHost(resolvedOptions.host);
        if (hostValidation !== true) {
            console.error(chalk.red(`❌ ${hostValidation}`));
            process.exitCode = 1;
            return;
        }

        if (!resolvedOptions.apiKey) {
            console.error(chalk.red('❌ Missing n8n API key. Pass --api-key <key> or set N8N_API_KEY.'));
            process.exitCode = 1;
            return;
        }

        const spinner = ora('Testing connection to n8n...').start();

        try {
            const client = new N8nApiClient({
                host: resolvedOptions.host,
                apiKey: resolvedOptions.apiKey,
            });

            const isConnected = await client.testConnection();
            if (!isConnected) {
                spinner.fail(chalk.red('Failed to connect to n8n. Please check your URL and API Key.'));
                process.exitCode = 1;
                return;
            }

            spinner.succeed(chalk.green('Successfully connected to n8n!'));

            spinner.start('Fetching available projects...');
            const projects = await client.getProjects();
            spinner.succeed(chalk.green(`Found ${projects.length} project(s)`));

            if (projects.length === 0) {
                console.log(chalk.yellow('No projects found yet. Create a project in n8n, then run n8nac init-project.'));
            }

            const profile = this.configService.saveBootstrapState(
                resolvedOptions.host,
                resolvedOptions.syncFolder || 'workflows',
                { instanceName: resolvedOptions.instanceName }
            );
            this.configService.saveApiKey(resolvedOptions.host, resolvedOptions.apiKey, profile.id);

            console.log(chalk.green('\n✔ Credentials saved successfully!'));
            console.log(chalk.blue('📁 Workspace bootstrap:') + ' n8nac-config.json');
            console.log(chalk.blue('🔑 API Key:') + ' Stored securely in global config\n');
            console.log(chalk.blue('🧩 Active instance:') + ` ${profile.name}\n`);

            if (projects.length > 0) {
                this.printAvailableProjects(projects);
            }

            console.log(chalk.yellow('Next step:'));
            console.log(`Run ${chalk.bold('n8nac init-project')} to select the project and sync folder.`);
            console.log(chalk.gray('You can pass --project-id, --project-name, or --project-index for non-interactive project selection.\n'));
        } catch (error: any) {
            spinner.fail(chalk.red(`An error occurred: ${error.message}`));
            process.exitCode = 1;
        }
    }

    async runProjectSetup(options: InitCommandOptions = {}): Promise<void> {
        console.log(chalk.cyan('\n📁 n8n-as-code project setup'));
        console.log(chalk.gray('This step selects the active n8n project and the local sync folder.\n'));

        const currentLocal = this.configService.getLocalConfig();
        const currentInstance = this.configService.getActiveInstance();
        const currentApiKey = currentLocal.host
            ? this.configService.getApiKey(currentLocal.host, currentInstance?.id)
            : '';
        const resolvedOptions = this.resolveOptions(options, currentLocal, currentApiKey);

        if (!resolvedOptions.host) {
            console.error(chalk.red('❌ Missing saved n8n host. Run n8nac init-auth first, or pass --host <url>.'));
            process.exitCode = 1;
            return;
        }

        const hostValidation = this.validateHost(resolvedOptions.host);
        if (hostValidation !== true) {
            console.error(chalk.red(`❌ ${hostValidation}`));
            process.exitCode = 1;
            return;
        }

        if (!resolvedOptions.apiKey) {
            console.error(chalk.red('❌ Missing saved n8n API key. Run n8nac init-auth first, or pass --api-key <key>.'));
            process.exitCode = 1;
            return;
        }

        const spinner = ora('Testing connection to n8n...').start();

        try {
            const client = new N8nApiClient({
                host: resolvedOptions.host,
                apiKey: resolvedOptions.apiKey,
            });

            const isConnected = await client.testConnection();
            if (!isConnected) {
                spinner.fail(chalk.red('Failed to connect to n8n. Please check your URL and API Key.'));
                process.exitCode = 1;
                return;
            }

            spinner.succeed(chalk.green('Successfully connected to n8n!'));

            spinner.start('Fetching available projects...');
            const projects = await client.getProjects();
            spinner.succeed(chalk.green(`Found ${projects.length} project(s)`));

            if (projects.length === 0) {
                spinner.fail(chalk.red('No projects found. Please create a project in n8n first.'));
                process.exitCode = 1;
                return;
            }

            const nonInteractive = !!(
                options.yes ||
                options.projectId ||
                options.projectName ||
                options.projectIndex !== undefined ||
                options.syncFolder
            );

            const selectedProject = nonInteractive
                ? this.resolveProjectSelection(projects, resolvedOptions)
                : await this.promptForProject(projects);

            if (!selectedProject) {
                spinner.fail(chalk.red('Project selection failed.'));
                process.exitCode = 1;
                return;
            }

            const syncFolder = nonInteractive
                ? (resolvedOptions.syncFolder || 'workflows')
                : await this.promptForSyncFolder(currentLocal.syncFolder || resolvedOptions.syncFolder || 'workflows');

            await this.finalizeProjectSetup({
                host: resolvedOptions.host,
                apiKey: resolvedOptions.apiKey,
                syncFolder,
                selectedProject,
            });
        } catch (error: any) {
            spinner.fail(chalk.red(`An error occurred: ${error.message}`));
            process.exitCode = 1;
        }
    }

    private resolveOptions(
        options: InitCommandOptions,
        currentLocal: Partial<ILocalConfig>,
        currentApiKey?: string
    ): Required<Pick<InitCommandOptions, 'yes'>> & InitCommandOptions {
        return {
            yes: !!options.yes,
            host: options.host || this.getEnvValue('N8N_HOST') || currentLocal.host,
            apiKey: options.apiKey || this.getEnvValue('N8N_API_KEY') || currentApiKey,
            syncFolder: options.syncFolder || currentLocal.syncFolder || 'workflows',
            instanceName: options.instanceName || this.configService.getActiveInstance()?.name,
            projectId: options.projectId,
            projectName: options.projectName,
            projectIndex: options.projectIndex,
        };
    }

    private getEnvValue(name: string): string | undefined {
        const value = process.env[name];
        if (!value) {
            return undefined;
        }
        return value.trim().replace(/^['"]|['"]$/g, '');
    }

    private shouldRunNonInteractive(options: InitCommandOptions): boolean {
        return !!(
            options.yes ||
            options.host ||
            options.apiKey ||
            options.syncFolder ||
            options.instanceName ||
            options.projectId ||
            options.projectName ||
            options.projectIndex !== undefined
        );
    }

    private validateHost(host: string): true | string {
        try {
            new URL(host);
            return true;
        } catch {
            return 'Please enter a valid URL (e.g., http://localhost:5678)';
        }
    }

    private async runInteractive(currentLocal: Partial<ILocalConfig>, currentApiKey?: string): Promise<void> {
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'host',
                message: 'Enter your n8n instance URL:',
                default: currentLocal.host || 'http://localhost:5678',
                validate: (input: string) => this.validateHost(input)
            },
            {
                type: 'password',
                name: 'apiKey',
                message: 'Enter your n8n API Key:',
                default: currentApiKey,
                mask: '*'
            },
            {
                type: 'input',
                name: 'instanceName',
                message: 'Instance profile name:',
                default: this.configService.getActiveInstance()?.name || 'Default instance'
            },
            {
                type: 'input',
                name: 'syncFolder',
                message: 'Local folder for workflows:',
                default: currentLocal.syncFolder || 'workflows'
            }
        ]);

        await this.completeInitialization({
            host: answers.host,
            apiKey: answers.apiKey,
            instanceName: answers.instanceName,
            syncFolder: answers.syncFolder,
        }, false);
    }

    private async runNonInteractive(options: InitCommandOptions): Promise<void> {
        if (!options.host) {
            console.error(chalk.red('❌ Missing n8n host. Pass --host <url> or set N8N_HOST.'));
            process.exitCode = 1;
            return;
        }

        const hostValidation = this.validateHost(options.host);
        if (hostValidation !== true) {
            console.error(chalk.red(`❌ ${hostValidation}`));
            process.exitCode = 1;
            return;
        }

        if (!options.apiKey) {
            console.error(chalk.red('❌ Missing n8n API key. Pass --api-key <key> or set N8N_API_KEY.'));
            process.exitCode = 1;
            return;
        }

        await this.completeInitialization({
            host: options.host,
            apiKey: options.apiKey,
            syncFolder: options.syncFolder || 'workflows',
            instanceName: options.instanceName,
            projectId: options.projectId,
            projectName: options.projectName,
            projectIndex: options.projectIndex,
        }, true);
    }

    private async completeInitialization(
        input: {
            host: string;
            apiKey: string;
            syncFolder: string;
            instanceName?: string;
            projectId?: string;
            projectName?: string;
            projectIndex?: number;
        },
        nonInteractive: boolean
    ): Promise<void> {
        const spinner = ora('Testing connection to n8n...').start();

        try {
            const client = new N8nApiClient({
                host: input.host,
                apiKey: input.apiKey
            });

            const isConnected = await client.testConnection();

            if (!isConnected) {
                spinner.fail(chalk.red('Failed to connect to n8n. Please check your URL and API Key.'));
                if (nonInteractive) {
                    process.exitCode = 1;
                    return;
                }

                const { retry } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'retry',
                        message: 'Would you like to try again?',
                        default: true
                    }
                ]);

                if (retry) {
                    return this.run();
                }
                return;
            }

            spinner.succeed(chalk.green('Successfully connected to n8n!'));

            spinner.start('Fetching available projects...');
            const projects = await client.getProjects();
            spinner.succeed(chalk.green(`Found ${projects.length} project(s)`));

            if (projects.length === 0) {
                spinner.fail(chalk.red('No projects found. Please create a project in n8n first.'));
                process.exitCode = 1;
                return;
            }

            const selectedProject = nonInteractive
                ? this.resolveProjectSelection(projects, input)
                : await this.promptForProject(projects);

            if (!selectedProject) {
                spinner.fail(chalk.red('Project selection failed.'));
                process.exitCode = 1;
                return;
            }

            const selectedProjectDisplayName = getDisplayProjectName(selectedProject);
            await this.finalizeProjectSetup({
                host: input.host,
                apiKey: input.apiKey,
                instanceName: input.instanceName,
                syncFolder: input.syncFolder,
                selectedProject,
            });
        } catch (error: any) {
            spinner.fail(chalk.red(`An error occurred: ${error.message}`));
            process.exitCode = 1;
        }
    }

    private async finalizeProjectSetup(input: {
        host: string;
        apiKey: string;
        instanceName?: string;
        syncFolder: string;
        selectedProject: IProject;
    }): Promise<void> {
        const selectedProjectDisplayName = getDisplayProjectName(input.selectedProject);
        console.log(chalk.green(`\n✓ Selected project: ${selectedProjectDisplayName}\n`));

        const localConfig: ILocalConfig = {
            host: input.host,
            syncFolder: input.syncFolder,
            projectId: input.selectedProject.id,
            projectName: selectedProjectDisplayName
        };

        const profile = this.configService.saveLocalConfig(localConfig, {
            instanceName: input.instanceName,
            setActive: true,
        });
        this.configService.saveApiKey(input.host, input.apiKey, profile.id);

        console.log('\n' + chalk.green('✔ Configuration saved successfully!'));
        console.log(chalk.blue('📁 Project config:') + ' n8nac-config.json');
        console.log(chalk.blue('🔑 API Key:') + ' Stored securely in global config\n');
        console.log(chalk.blue('🧩 Active instance:') + ` ${profile.name}\n`);

        const spinner = ora('Generating instance identifier...').start();
        const instanceIdentifier = await this.configService.getOrCreateInstanceIdentifier(input.host, profile.id);
        spinner.succeed(chalk.green(`Instance identifier: ${instanceIdentifier}`));
        console.log(chalk.gray('(n8nac-config.json will be kept up to date automatically)\n'));

        console.log(chalk.cyan('🤖 Bootstrapping AI Context...'));
        const updateAi = new UpdateAiCommand(new Command());
        await updateAi.run({}, { host: input.host, apiKey: input.apiKey });

        console.log(chalk.yellow('\nNext steps:'));
        console.log(`1. Run ${chalk.bold('n8nac pull')} to download your workflows`);
        console.log(`2. Run ${chalk.bold('n8nac start')} to start real-time monitoring and synchronization`);
        console.log(chalk.gray(`(Legacy command 'n8n-as-code' is also available but deprecated)\n`));
    }

    private async promptForProject(projects: IProject[]): Promise<IProject | undefined> {
        const { selectedProjectId } = await inquirer.prompt([
            {
                type: 'rawlist',
                name: 'selectedProjectId',
                message: 'Select a project to sync:',
                choices: projects.map((project, index) => ({
                    name: `[${index + 1}] ${getDisplayProjectName(project)}`,
                    value: project.id
                }))
            }
        ]);

        return projects.find((project) => project.id === selectedProjectId);
    }

    private async promptForSyncFolder(defaultSyncFolder: string): Promise<string> {
        const { syncFolder } = await inquirer.prompt([
            {
                type: 'input',
                name: 'syncFolder',
                message: 'Local folder for workflows:',
                default: defaultSyncFolder,
            }
        ]);

        return syncFolder;
    }

    private resolveProjectSelection(
        projects: IProject[],
        options: Pick<InitCommandOptions, 'projectId' | 'projectName' | 'projectIndex'>
    ): IProject | undefined {
        if (options.projectId) {
            const byId = projects.find((project) => project.id === options.projectId);
            if (!byId) {
                console.error(chalk.red(`❌ Project ID not found: ${options.projectId}`));
                process.exitCode = 1;
                this.printAvailableProjects(projects);
            }
            return byId;
        }

        if (options.projectName) {
            const requestedName = options.projectName.toLowerCase();
            const byName = projects.find((project) => {
                return project.name.toLowerCase() === requestedName || getDisplayProjectName(project).toLowerCase() === requestedName;
            });
            if (!byName) {
                console.error(chalk.red(`❌ Project name not found: ${options.projectName}`));
                process.exitCode = 1;
                this.printAvailableProjects(projects);
            }
            return byName;
        }

        if (options.projectIndex !== undefined) {
            if (!Number.isFinite(options.projectIndex) || !Number.isInteger(options.projectIndex) || options.projectIndex < 1) {
                console.error(chalk.red(`❌ Invalid project index: ${options.projectIndex}`));
                process.exitCode = 1;
                this.printAvailableProjects(projects);
                return undefined;
            }

            const index = options.projectIndex - 1;
            if (index < 0 || index >= projects.length) {
                console.error(chalk.red(`❌ Project index out of range: ${options.projectIndex}`));
                process.exitCode = 1;
                this.printAvailableProjects(projects);
                return undefined;
            }
            return projects[index];
        }

        if (projects.length === 1) {
            return projects[0];
        }

        const personalProjects = projects.filter((project) => project.type === 'personal');
        if (personalProjects.length === 1) {
            console.log(chalk.gray(`Auto-selected personal project: ${getDisplayProjectName(personalProjects[0])}`));
            return personalProjects[0];
        }

        console.error(chalk.red('❌ Multiple projects are available. Re-run init with --project-id, --project-name, or --project-index.'));
        process.exitCode = 1;
        this.printAvailableProjects(projects);
        return undefined;
    }

    private printAvailableProjects(projects: IProject[]): void {
        console.log(chalk.yellow('\nAvailable projects:'));
        projects.forEach((project, index) => {
            console.log(`  [${index + 1}] ${getDisplayProjectName(project)}  (id: ${project.id})`);
        });
        console.log('');
    }
}
