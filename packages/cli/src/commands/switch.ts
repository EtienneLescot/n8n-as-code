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
            .description('Select the current n8n instance')
            .action(() => this.runInstanceSwitch());

        program
            .command('delete-instance')
            .description('Delete a saved n8n instance config')
            .action(() => this.runInstanceDeletion());
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

        console.log(chalk.cyan(`\n🧩 Selected instance: ${chalk.bold(activeInstance.name)}`));
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
        const activeInstanceId = this.configService.getCurrentInstanceConfigId();

        if (instances.length === 0) {
            console.error(chalk.red('❌ No saved instances found.'));
            console.error(chalk.yellow('Please run `n8nac instance add` first to save one.'));
            process.exit(1);
        }

        if (instances.length === 1) {
            console.log(chalk.yellow(`Only one saved instance is available: ${instances[0].name}`));
            return;
        }

        const { selectedInstanceId } = await inquirer.prompt([
            {
                type: 'rawlist',
                name: 'selectedInstanceId',
                message: 'Select the instance to use:',
                choices: instances.map((instance, index) => ({
                    name: `[${index + 1}] ${instance.name}${instance.id === activeInstanceId ? ' (active)' : ''} - ${instance.host || 'host not set'}`,
                    value: instance.id
                }))
            }
        ]);

        const selectedInstance = this.configService.selectInstanceConfig(selectedInstanceId);

        console.log(chalk.green(`\n✔ Selected instance: ${chalk.bold(selectedInstance.name)}`));
        if (selectedInstance.projectName) {
            console.log(chalk.cyan(`📊 Project: ${chalk.bold(selectedInstance.projectName)}`));
        }
        console.log(chalk.gray(`\nRun ${chalk.bold('n8nac list')} or ${chalk.bold('n8nac pull')} to work against this instance.\n`));
    }

    async runInstanceDeletion(): Promise<void> {
        const instances = this.configService.listInstances();
        const activeInstanceId = this.configService.getCurrentInstanceConfigId();

        if (instances.length === 0) {
            console.error(chalk.red('❌ No saved instances found.'));
            console.error(chalk.yellow('Please run `n8nac instance add` first to save one.'));
            process.exit(1);
        }

        const { selectedInstanceId } = await inquirer.prompt([
            {
                type: 'rawlist',
                name: 'selectedInstanceId',
                message: 'Select the saved config to delete:',
                choices: instances.map((instance, index) => ({
                    name: `[${index + 1}] ${instance.name}${instance.id === activeInstanceId ? ' (current)' : ''} - ${instance.host || 'host not set'}`,
                    value: instance.id
                }))
            }
        ]);

        const selectedInstance = instances.find((instance) => instance.id === selectedInstanceId);
        if (!selectedInstance) {
            console.error(chalk.red('❌ Instance selection failed.'));
            process.exit(1);
        }

        const { confirmed } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmed',
                default: false,
                message: `Delete the saved config "${selectedInstance.name}"? This will not delete the n8n instance itself.`
            }
        ]);

        if (!confirmed) {
            console.log(chalk.yellow('\nDeletion cancelled.\n'));
            return;
        }

        const result = this.configService.deleteInstanceConfig(selectedInstance.id);
        console.log(chalk.green(`\n✔ Deleted saved config: ${chalk.bold(result.deletedInstance.name)}`));

        if (result.activeInstance) {
            console.log(chalk.cyan(`Selected instance: ${chalk.bold(result.activeInstance.name)}`));
            if (result.activeInstance.projectName) {
                console.log(chalk.cyan(`📊 Project: ${chalk.bold(result.activeInstance.projectName)}`));
            }
        } else {
            console.log(chalk.yellow('No instance is currently selected.'));
            console.log(chalk.gray(`Run ${chalk.bold('n8nac instance add')} to save a new one.\n`));
            return;
        }

        console.log(chalk.gray(`\nRun ${chalk.bold('n8nac list')} or ${chalk.bold('n8nac pull')} to work against the selected instance.\n`));
    }

    async runInstanceList(): Promise<void> {
        const instances = this.configService.listInstances();
        const activeInstanceId = this.configService.getCurrentInstanceConfigId();

        if (!instances.length) {
            console.log(chalk.yellow('No saved instances found.'));
            console.log(chalk.gray(`Run ${chalk.bold('n8nac instance add')} to add one.\n`));
            return;
        }

        console.log(chalk.cyan('\nSaved instance configs:\n'));
        for (const instance of instances) {
            const marker = instance.id === activeInstanceId ? chalk.green('●') : chalk.gray('○');
            const host = instance.host || 'host not set';
            const project = instance.projectName ? `  project: ${instance.projectName}` : '';
            console.log(`${marker} ${chalk.bold(instance.name)}  ${chalk.gray(host)}${project}`);
        }
        console.log('');
    }
}
