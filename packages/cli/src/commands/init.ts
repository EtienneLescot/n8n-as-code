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
        const currentApiKey = currentLocal.host ? this.configService.getApiKey(currentLocal.host) : '';
        const resolvedOptions = this.resolveOptions(options, currentLocal, currentApiKey);

        if (this.shouldRunNonInteractive(options)) {
            await this.runNonInteractive(resolvedOptions);
            return;
        }

        await this.runInteractive(currentLocal, currentApiKey);
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
                name: 'syncFolder',
                message: 'Local folder for workflows:',
                default: currentLocal.syncFolder || 'workflows'
            }
        ]);

        await this.completeInitialization({
            host: answers.host,
            apiKey: answers.apiKey,
            syncFolder: answers.syncFolder,
        }, false);
    }

    private async runNonInteractive(options: InitCommandOptions): Promise<void> {
        if (!options.host) {
            console.error(chalk.red('❌ Missing n8n host. Pass --host <url> or set N8N_HOST.'));
            return;
        }

        const hostValidation = this.validateHost(options.host);
        if (hostValidation !== true) {
            console.error(chalk.red(`❌ ${hostValidation}`));
            return;
        }

        if (!options.apiKey) {
            console.error(chalk.red('❌ Missing n8n API key. Pass --api-key <key> or set N8N_API_KEY.'));
            return;
        }

        await this.completeInitialization({
            host: options.host,
            apiKey: options.apiKey,
            syncFolder: options.syncFolder || 'workflows',
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
                return;
            }

            const selectedProject = nonInteractive
                ? this.resolveProjectSelection(projects, input)
                : await this.promptForProject(projects);

            if (!selectedProject) {
                spinner.fail(chalk.red('Project selection failed.'));
                return;
            }

            const selectedProjectDisplayName = getDisplayProjectName(selectedProject);
            console.log(chalk.green(`\n✓ Selected project: ${selectedProjectDisplayName}\n`));

            const localConfig: ILocalConfig = {
                host: input.host,
                syncFolder: input.syncFolder,
                projectId: selectedProject.id,
                projectName: selectedProjectDisplayName
            };

            this.configService.saveLocalConfig(localConfig);
            this.configService.saveApiKey(input.host, input.apiKey);

            console.log('\n' + chalk.green('✔ Configuration saved successfully!'));
            console.log(chalk.blue('📁 Project config:') + ' n8nac-config.json');
            console.log(chalk.blue('🔑 API Key:') + ' Stored securely in global config\n');

            spinner.start('Generating instance identifier...');
            const instanceIdentifier = await this.configService.getOrCreateInstanceIdentifier(input.host);
            spinner.succeed(chalk.green(`Instance identifier: ${instanceIdentifier}`));
            console.log(chalk.gray('(n8nac-config.json will be kept up to date automatically)\n'));

            console.log(chalk.cyan('🤖 Bootstrapping AI Context...'));
            const updateAi = new UpdateAiCommand(new Command());
            await updateAi.run({}, { host: input.host, apiKey: input.apiKey });

            console.log(chalk.yellow('\nNext steps:'));
            console.log(`1. Run ${chalk.bold('n8nac pull')} to download your workflows`);
            console.log(`2. Run ${chalk.bold('n8nac start')} to start real-time monitoring and synchronization`);
            console.log(chalk.gray(`(Legacy command 'n8n-as-code' is also available but deprecated)\n`));
        } catch (error: any) {
            spinner.fail(chalk.red(`An error occurred: ${error.message}`));
        }
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

    private resolveProjectSelection(
        projects: IProject[],
        options: Pick<InitCommandOptions, 'projectId' | 'projectName' | 'projectIndex'>
    ): IProject | undefined {
        if (options.projectId) {
            const byId = projects.find((project) => project.id === options.projectId);
            if (!byId) {
                console.error(chalk.red(`❌ Project ID not found: ${options.projectId}`));
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
                this.printAvailableProjects(projects);
            }
            return byName;
        }

        if (options.projectIndex !== undefined) {
            const index = options.projectIndex - 1;
            if (index < 0 || index >= projects.length) {
                console.error(chalk.red(`❌ Project index out of range: ${options.projectIndex}`));
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
