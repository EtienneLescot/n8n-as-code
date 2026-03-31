import { Command } from 'commander';
import { ConfigService, ILocalConfig } from '../services/config-service.js';
import { N8nApiClient } from '../core/index.js';
import { getDisplayProjectName } from '../core/helpers/project-helpers.js';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

export class SwitchCommand {
    private configService: ConfigService;

    constructor(program: Command) {
        this.configService = new ConfigService();

        program
            .command('switch')
            .description('Switch to a different project in the active instance')
            .action(() => this.run());

        program
            .command('switch-instance')
            .description('Switch the active configured n8n instance')
            .action(() => this.runInstanceSwitch());
    }

    async run(): Promise<void> {
        const activeInstance = this.configService.getActiveInstance();
        const localConfig = this.configService.getLocalConfig();

        if (!activeInstance?.id || !localConfig.host || !localConfig.projectId || !localConfig.projectName) {
            console.error(chalk.red('❌ CLI not configured.'));
            console.error(chalk.yellow('Please run `n8nac init` first to set up your environment.'));
            process.exit(1);
        }

        const apiKey = this.configService.getApiKey(localConfig.host, activeInstance.id);
        if (!apiKey) {
            console.error(chalk.red('❌ API key not found.'));
            console.error(chalk.yellow('Please run `n8nac init` to configure your environment.'));
            process.exit(1);
        }

        console.log(chalk.cyan(`\n🧩 Active instance: ${chalk.bold(activeInstance.name)}`));
        console.log(chalk.cyan(`📊 Current project: ${chalk.bold(localConfig.projectName)}\n`));

        const spinner = ora('Fetching available projects...').start();

        try {
            const client = new N8nApiClient({
                host: localConfig.host,
                apiKey
            });

            const projects = await client.getProjects();
            spinner.succeed(chalk.green(`Found ${projects.length} project(s)`));

            if (projects.length === 0) {
                spinner.fail(chalk.red('No projects found.'));
                return;
            }

            const otherProjects = projects.filter((project) => project.id !== localConfig.projectId);
            if (otherProjects.length === 0) {
                console.log(chalk.yellow('\n⚠️  No other projects available to switch to.'));
                return;
            }

            const { selectedProjectId } = await inquirer.prompt([
                {
                    type: 'rawlist',
                    name: 'selectedProjectId',
                    message: 'Select a project to switch to:',
                    choices: otherProjects.map((project, index) => ({
                        name: `[${index + 1}] ${getDisplayProjectName(project)}`,
                        value: project.id
                    }))
                }
            ]);

            const selectedProject = projects.find((project) => project.id === selectedProjectId);
            if (!selectedProject) {
                console.error(chalk.red('❌ Project selection failed.'));
                return;
            }

            const updatedConfig: ILocalConfig = {
                host: localConfig.host,
                syncFolder: localConfig.syncFolder || 'workflows',
                instanceIdentifier: localConfig.instanceIdentifier,
                customNodesPath: localConfig.customNodesPath,
                folderSync: localConfig.folderSync,
                projectId: selectedProject.id,
                projectName: getDisplayProjectName(selectedProject),
            };

            this.configService.saveLocalConfig(updatedConfig, {
                instanceId: activeInstance.id,
                instanceName: activeInstance.name,
                setActive: true,
            });

            console.log(chalk.green(`\n✔ Switched to project: ${chalk.bold(getDisplayProjectName(selectedProject))}`));
            console.log(chalk.gray(`\nRun ${chalk.bold('n8nac pull')} to download workflows from the new project.\n`));
        } catch (error: any) {
            spinner.fail(chalk.red(`Failed to switch project: ${error.message}`));
            process.exit(1);
        }
    }

    async runInstanceSwitch(): Promise<void> {
        const instances = this.configService.listInstances();
        const activeInstanceId = this.configService.getActiveInstanceId();

        if (instances.length === 0) {
            console.error(chalk.red('❌ No configured instances found.'));
            console.error(chalk.yellow('Please run `n8nac init` first to create an instance profile.'));
            process.exit(1);
        }

        if (instances.length === 1) {
            console.log(chalk.yellow(`Only one instance is configured: ${instances[0].name}`));
            return;
        }

        const { selectedInstanceId } = await inquirer.prompt([
            {
                type: 'rawlist',
                name: 'selectedInstanceId',
                message: 'Select the active instance:',
                choices: instances.map((instance, index) => ({
                    name: `[${index + 1}] ${instance.name}${instance.id === activeInstanceId ? ' (active)' : ''} - ${instance.host || 'host not set'}`,
                    value: instance.id
                }))
            }
        ]);

        const selectedInstance = this.configService.setActiveInstance(selectedInstanceId);

        console.log(chalk.green(`\n✔ Active instance: ${chalk.bold(selectedInstance.name)}`));
        if (selectedInstance.projectName) {
            console.log(chalk.cyan(`📊 Project: ${chalk.bold(selectedInstance.projectName)}`));
        }
        console.log(chalk.gray(`\nRun ${chalk.bold('n8nac list')} or ${chalk.bold('n8nac pull')} to work against this instance.\n`));
    }
}
