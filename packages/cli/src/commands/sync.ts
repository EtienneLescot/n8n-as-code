import { BaseCommand } from './base.js';
import { SyncManager, WorkflowSyncStatus } from '../core/index.js';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

export class SyncCommand extends BaseCommand {

    async pullOne(workflowId: string): Promise<void> {
        const syncConfig = await this.getSyncConfig();
        const syncManager = new SyncManager(this.client, syncConfig);

        // Populate local hash cache FIRST — required for accurate status in CLI mode
        await syncManager.refreshLocalState();

        // Fetch ensures initialization, remote knowledge, and filename mapping
        const remoteExists = await syncManager.fetch(workflowId);
        if (!remoteExists) {
            console.error(chalk.red(`❌ Workflow ${workflowId} not found on remote.`));
            process.exit(1);
        }

        const filename = syncManager.getFilenameForId(workflowId);
        if (filename) {
            const status = await syncManager.getSingleWorkflowDetailedStatus(workflowId, filename);
            
            const hasConflict = status.status === WorkflowSyncStatus.CONFLICT;
            const hasLocalChanges = !!(status.localHash && status.lastSyncedHash && status.localHash !== status.lastSyncedHash);
            if (hasConflict || hasLocalChanges) {
                console.log(chalk.red(`💥 Conflict detected for workflow ${workflowId}.`));
                console.log(chalk.yellow(`To resolve the conflict you can either:`));
                console.log(`  n8nac resolve ${workflowId} --mode keep-current`);
                console.log(`  n8nac resolve ${workflowId} --mode keep-incoming`);
                return;
            }
        }

        const spinner = ora(`Pulling workflow ${workflowId}...`).start();
        try {
            await syncManager.pull(workflowId);
            spinner.succeed(chalk.green(`✔ Pulled workflow ${workflowId}.`));
        } catch (e: any) {
            spinner.fail(`Pull failed: ${e.message}`);
            process.exit(1);
        }
    }

    async pushOne(workflowId?: string, filename?: string): Promise<void> {
        const syncConfig = await this.getSyncConfig();
        const syncManager = new SyncManager(this.client, syncConfig);

        // Populate local hash cache FIRST — required for accurate status in CLI mode
        await syncManager.refreshLocalState();

        if (!workflowId) {
            // Brand-new file: no ID yet, push directly by filename
            const label = filename ?? '(unknown)';
            const spinner = ora(`Pushing new workflow "${label}"...`).start();
            try {
                await syncManager.push(undefined, filename);
                spinner.succeed(chalk.green(`✔ Pushed "${label}" to n8n.`));
            } catch (e: any) {
                spinner.fail(`Push failed: ${e.message}`);
                process.exit(1);
            }
            return;
        }

        // Warm up the remote cache for this specific workflow
        await syncManager.fetch(workflowId);

        // Conflict check before pushing
        const resolvedFilename = syncManager.getFilenameForId(workflowId);
        if (resolvedFilename) {
            const status = await syncManager.getSingleWorkflowDetailedStatus(workflowId, resolvedFilename);
            if (status.status === WorkflowSyncStatus.CONFLICT) {
                console.log(chalk.red(`💥 Conflict detected for workflow ${workflowId}.`));
                console.log(chalk.yellow(`To resolve the conflict you can either:`));
                console.log(`  n8nac resolve ${workflowId} --mode keep-current`);
                console.log(`  n8nac resolve ${workflowId} --mode keep-incoming`);
                return;
            }
        }

        const spinner = ora(`Pushing workflow ${workflowId}...`).start();
        try {
            await syncManager.push(workflowId);
            spinner.succeed(chalk.green(`✔ Pushed workflow ${workflowId}.`));
        } catch (e: any) {
            if (e.message.includes('modified in the n8n UI')) {
                spinner.stop();
                console.log(chalk.red(`\n💥 Conflict detected: ${e.message}`));
                console.log(chalk.yellow(`To resolve the conflict you can either:`));
                console.log(`  n8nac resolve ${workflowId} --mode keep-current`);
                console.log(`  n8nac resolve ${workflowId} --mode keep-incoming`);
                return;
            }
            spinner.fail(`Push failed: ${e.message}`);
            process.exit(1);
        }
    }

    async fetchOne(workflowId: string): Promise<void> {
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

    async resolveOne(workflowId: string, resolution: 'keep-current' | 'keep-incoming'): Promise<void> {
        const resLabel = resolution === 'keep-current' ? 'current (local)' : 'incoming (remote)';
        const spinner = ora(`Resolving conflict for ${workflowId} (keeping ${resLabel})...`).start();
        try {
            const syncConfig = await this.getSyncConfig();
            const syncManager = new SyncManager(this.client, syncConfig);

            // Populate local hash cache and remote state
            await syncManager.refreshLocalState();
            await syncManager.fetch(workflowId);

            // Need to find the filename
            const filename = syncManager.getFilenameForId(workflowId);

            if (!filename) {
                spinner.fail(`Workflow ${workflowId} not found in local state.`);
                process.exit(1);
            }

            // Map terminology: keep-current -> local, keep-incoming -> remote
            const mode = resolution === 'keep-current' ? 'local' : 'remote';
            await syncManager.resolveConflict(workflowId, filename, mode);
            spinner.succeed(chalk.green(`✔ Conflict resolved for ${workflowId} (kept ${resLabel}).`));
        } catch (e: any) {
            spinner.fail(`Resolution failed: ${e.message}`);
            process.exit(1);
        }
    }

}
