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
            await syncManager.forceRefresh();
            await syncManager.pullOne(workflowId);
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
            await syncManager.forceRefresh();
            const matrix = await syncManager.getWorkflowsStatus();
            const wf = matrix.find((w: any) => w.id === workflowId);
            if (!wf) {
                spinner.fail(`Workflow ${workflowId} not found in local state. Run 'n8nac list' first.`);
                process.exit(1);
            }
            await syncManager.pushOne(workflowId, wf.filename);
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
            
            // Fetch the specific workflow from remote
            const remoteWf = await this.client.getWorkflow(workflowId);
            if (!remoteWf) {
                spinner.fail(`Workflow ${workflowId} not found on remote.`);
                process.exit(1);
            }
            
            // Update watcher's remote state cache for this specific workflow only
            // This calls watcher.updateSingleRemoteState() instead of forceRefresh()
            await syncManager.fetchAndPullIfSafe(workflowId);
            spinner.succeed(chalk.green(`✔ Fetched remote state for workflow ${workflowId}.`));
        } catch (e: any) {
            spinner.fail(`Fetch failed: ${e.message}`);
            process.exit(1);
        }
    }

}
