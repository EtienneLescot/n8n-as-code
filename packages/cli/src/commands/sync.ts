import { BaseCommand } from './base.js';
import { SyncManager } from '../core/index.js';
import chalk from 'chalk';
import ora from 'ora';

export class SyncCommand extends BaseCommand {

    async pullOne(workflowId: string) {
        const spinner = ora(`Pulling workflow ${workflowId}...`).start();
        try {
            const syncConfig = await this.getSyncConfig();
            const syncManager = new SyncManager(this.client, syncConfig);
            await syncManager.pull(workflowId);
            spinner.succeed(chalk.green(`✔ Pulled workflow ${workflowId}.`));
        } catch (e: any) {
            spinner.fail(`Pull failed: ${e.message}`);
            process.exit(1);
        }
    }

    async pushOne(workflowId: string) {
        const spinner = ora(`Pushing workflow ${workflowId}...`).start();
        try {
            const syncConfig = await this.getSyncConfig();
            const syncManager = new SyncManager(this.client, syncConfig);

            // Ensure we have the latest mappings
            await syncManager.listWorkflows({ fetchRemote: false });

            await syncManager.push(workflowId);
            spinner.succeed(chalk.green(`✔ Pushed workflow ${workflowId}.`));
        } catch (e: any) {
            spinner.fail(`Push failed: ${e.message}`);
            process.exit(1);
        }
    }

    async fetchOne(workflowId: string) {
        const spinner = ora(`Fetching remote state for workflow ${workflowId}...`).start();
        try {
            const syncConfig = await this.getSyncConfig();
            const syncManager = new SyncManager(this.client, syncConfig);
            
            // Fetch remote state for this specific workflow (updates internal cache)
            const success = await syncManager.fetch(workflowId);
            if (!success) {
                spinner.fail(`Workflow ${workflowId} not found on remote.`);
                process.exit(1);
            }
            
            spinner.succeed(chalk.green(`✔ Fetched remote state for workflow ${workflowId}.`));
        } catch (e: any) {
            spinner.fail(`Fetch failed: ${e.message}`);
            process.exit(1);
        }
    }

}
