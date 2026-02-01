import { Command } from 'commander';
import { ConfigService, ILocalConfig } from '../services/config-service.js';
import { N8nApiClient } from '@n8n-as-code/sync';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

export class SwitchCommand {
    private configService: ConfigService;

    constructor(program: Command) {
        this.configService = new ConfigService();
        
        program
            .command('switch')
            .description('Switch to a different project')
            .action(() => this.run());
    }

    async run(): Promise<void> {
        const localConfig = this.configService.getLocalConfig();

        // Validate that CLI is configured
        if (!localConfig.host || !localConfig.projectId || !localConfig.projectName) {
            console.error(chalk.red('❌ CLI not configured.'));
            console.error(chalk.yellow('Please run `n8nac init` first to set up your environment.'));
            process.exit(1);
        }

        const apiKey = this.configService.getApiKey(localConfig.host);
        if (!apiKey) {
            console.error(chalk.red('❌ API key not found.'));
            console.error(chalk.yellow('Please run `n8nac init` to configure your environment.'));
            process.exit(1);
        }

        console.log(chalk.cyan(`\n📊 Current project: ${chalk.bold(localConfig.projectName)}\n`));

        const spinner = ora('Fetching available projects...').start();

        try {
            const client = new N8nApiClient({
                host: localConfig.host,
                apiKey: apiKey
            });

            const projects = await client.getProjects();
            spinner.succeed(chalk.green(`Found ${projects.length} project(s)`));

            if (projects.length === 0) {
                spinner.fail(chalk.red('No projects found.'));
                return;
            }

            // Filter out current project
            const otherProjects = projects.filter(p => p.id !== localConfig.projectId);

            if (otherProjects.length === 0) {
                console.log(chalk.yellow('\n⚠️  No other projects available to switch to.'));
                return;
            }

            // Let user select a new project
            // Use 'rawlist' for robustness across terminals (numeric selection).
            const { selectedProjectId } = await inquirer.prompt([
                {
                    type: 'rawlist',
                    name: 'selectedProjectId',
                    message: 'Select a project to switch to:',
                    choices: otherProjects.map((p, i) => {
                        const displayName = p.type === 'personal' ? `${p.name} (Personal)` : p.name;
                        return {
                            name: `[${i + 1}] ${displayName}`,
                            value: p.id
                        };
                    })
                }
            ]);

            const selectedProject = projects.find(p => p.id === selectedProjectId);
            if (!selectedProject) {
                console.error(chalk.red('❌ Project selection failed.'));
                return;
            }

            const selectedProjectDisplayName = selectedProject.type === 'personal' ? 'Personal' : selectedProject.name;

            // Update config with new project (keep all existing fields)
            const updatedConfig: ILocalConfig = {
                host: localConfig.host,
                syncFolder: localConfig.syncFolder || 'workflows',
                pollInterval: localConfig.pollInterval || 3000,
                syncInactive: localConfig.syncInactive ?? true,
                ignoredTags: localConfig.ignoredTags || [],
                instanceIdentifier: localConfig.instanceIdentifier,
                projectId: selectedProject.id,
                projectName: selectedProjectDisplayName
            };

            this.configService.saveLocalConfig(updatedConfig);

            console.log(chalk.green(`\n✔ Switched to project: ${chalk.bold(selectedProjectDisplayName)}`));
            console.log(chalk.gray(`\nRun ${chalk.bold('n8nac pull')} to download workflows from the new project.\n`));

        } catch (error: any) {
            spinner.fail(chalk.red(`Failed to switch project: ${error.message}`));
            process.exit(1);
        }
    }
}
