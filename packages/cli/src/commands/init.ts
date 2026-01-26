import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { N8nApiClient, createInstanceIdentifier, createFallbackInstanceIdentifier } from '@n8n-as-code/sync';
import { ConfigService, ILocalConfig } from '../services/config-service.js';
import { UpdateAiCommand } from './init-ai.js';
import { Command } from 'commander';

export class InitCommand {
    private configService: ConfigService;

    constructor() {
        this.configService = new ConfigService();
    }

    async run(): Promise<void> {
        console.log(chalk.cyan('\n🚀 Welcome to n8n-as-code initialization!'));
        console.log(chalk.gray('This tool will help you configure your local environment.\n'));

        const currentLocal = this.configService.getLocalConfig();
        const currentApiKey = currentLocal.host ? this.configService.getApiKey(currentLocal.host) : '';

        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'host',
                message: 'Enter your n8n instance URL:',
                default: currentLocal.host || 'http://localhost:5678',
                validate: (input: string) => {
                    try {
                        new URL(input);
                        return true;
                    } catch {
                        return 'Please enter a valid URL (e.g., http://localhost:5678)';
                    }
                }
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

        const spinner = ora('Testing connection to n8n...').start();

        try {
            const client = new N8nApiClient({
                host: answers.host,
                apiKey: answers.apiKey
            });

            const isConnected = await client.testConnection();

            if (!isConnected) {
                spinner.fail(chalk.red('Failed to connect to n8n. Please check your URL and API Key.'));
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

            // Save configurations (instance identifier will be handled by SyncManager automatically)
            const localConfig: ILocalConfig = {
                host: answers.host,
                syncFolder: answers.syncFolder,
                // instanceIdentifier is now handled by SyncManager core, not CLI
                pollInterval: currentLocal.pollInterval || 3000,
                syncInactive: currentLocal.syncInactive ?? true,
                ignoredTags: currentLocal.ignoredTags || ['archive']
            };

            this.configService.saveLocalConfig(localConfig);
            this.configService.saveApiKey(answers.host, answers.apiKey);

            console.log('\n' + chalk.green('✔ Configuration saved successfully!'));
            console.log(chalk.blue('📁 Project config:') + ' n8n-as-code.json');
            console.log(chalk.blue('🔑 API Key:') + ' Stored securely in global config\n');

            // Generate instance identifier (saved to n8n-as-code.json)
            spinner.start('Generating instance identifier...');
            const instanceIdentifier = await this.configService.getOrCreateInstanceIdentifier(answers.host);
            spinner.succeed(chalk.green(`Instance identifier: ${instanceIdentifier}`));
            console.log(chalk.gray('(n8n-as-code-instance.json will be created automatically on first sync)\n'));

            // Automatically initialize AI context (AI Bootstrap)
            console.log(chalk.cyan('🤖 Bootstrapping AI Context...'));
            const updateAi = new UpdateAiCommand(new Command());
            await updateAi.run({}, { host: answers.host, apiKey: answers.apiKey });

            console.log(chalk.yellow('\nNext steps:'));
            console.log(`1. Run ${chalk.bold('n8n-as-code pull')} to download your workflows`);
            console.log(`2. Run ${chalk.bold('n8n-as-code watch')} to start passive monitoring`);
            console.log(`3. Run ${chalk.bold('n8n-as-code auto-sync')} to enable automatic bidirectional sync`);
            console.log(chalk.gray(`(Instance identifier will be generated automatically on first use)\n`));

        } catch (error: any) {
            spinner.fail(chalk.red(`An error occurred: ${error.message}`));
        }
    }
}
