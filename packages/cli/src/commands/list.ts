import { BaseCommand } from './base.js';
import { SyncManager, WorkflowSyncStatus, IWorkflowStatus, formatWorkflowNameWithBadges } from '@n8n-as-code/sync';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';

export class ListCommand extends BaseCommand {
    async run(): Promise<void> {
        const spinner = ora('Refreshing workflow status...').start();

        try {
            const syncConfig = await this.getSyncConfig();
            syncConfig.pollIntervalMs = 0; // Not used for one-off
            const syncManager = new SyncManager(this.client, syncConfig);

            // Force refresh (poll + scan)
            await syncManager.refreshState();

            // Get workflow status matrix
            const matrix = await syncManager.getWorkflowsStatus();

            spinner.stop();

            const localConfig = this.configService.getLocalConfig();
            if (localConfig.projectName) {
                console.log(chalk.cyan(`\n📁 Project: ${chalk.bold(localConfig.projectName)}`));
            }

            // Create table
            const table = new Table({
                head: [
                    chalk.bold('Status'),
                    chalk.bold('ID'),
                    chalk.bold('Name'),
                    chalk.bold('Local Path')
                ],
                colWidths: [20, 15, 50, 50],
                wordWrap: true
            });

            // Sort workflows by status priority, then by name
            const statusPriority: Record<WorkflowSyncStatus, number> = {
                [WorkflowSyncStatus.CONFLICT]: 1,
                [WorkflowSyncStatus.MODIFIED_LOCALLY]: 2,
                [WorkflowSyncStatus.MODIFIED_REMOTELY]: 3,
                [WorkflowSyncStatus.EXIST_ONLY_LOCALLY]: 4,
                [WorkflowSyncStatus.EXIST_ONLY_REMOTELY]: 5,
                [WorkflowSyncStatus.DELETED_LOCALLY]: 6,
                [WorkflowSyncStatus.DELETED_REMOTELY]: 7,
                [WorkflowSyncStatus.IN_SYNC]: 8
            };

            const sorted = matrix.sort((a: IWorkflowStatus, b: IWorkflowStatus) => {
                const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
                if (priorityDiff !== 0) return priorityDiff;
                return a.name.localeCompare(b.name);
            });

            // Add rows with color coding
            for (const workflow of sorted) {
                const { icon, color } = this.getStatusDisplay(workflow.status);
                const statusText = `${icon} ${workflow.status}`;
                
                // Format name with badges
                const workflowName = formatWorkflowNameWithBadges(workflow, {
                    showProjectBadge: false,
                    showArchivedBadge: true,
                    archivedBadgeStyle: (text) => chalk.gray(text)
                });
                
                table.push([
                    color(statusText),
                    workflow.id || '-',
                    workflowName,
                    workflow.filename || '-'
                ]);
            }

            // Display table
            console.log('\n' + table.toString() + '\n');

            // Display summary
            const summary = this.getSummary(matrix);
            console.log(chalk.bold('Summary:'));
            console.log(chalk.green(`  ✔ In Sync: ${summary.inSync}`));
            console.log(chalk.blue(`  ✏️  Modified Locally: ${summary.modifiedLocally}`));
            console.log(chalk.cyan(`  ☁️  Modified Remotely: ${summary.modifiedRemotely}`));
            console.log(chalk.red(`  💥 Conflicts: ${summary.conflicts}`));
            console.log(chalk.yellow(`  + Only Local: ${summary.onlyLocal}`));
            console.log(chalk.yellow(`  - Only Remote: ${summary.onlyRemote}`));
            console.log(chalk.gray(`  🗑️  Deleted: ${summary.deleted}`));
            console.log(chalk.bold(`  Total: ${matrix.length}\n`));

        } catch (error: any) {
            spinner.fail(chalk.red(`Failed to list workflows: ${error.message}`));
            process.exit(1);
        }
    }

    private getStatusDisplay(status: WorkflowSyncStatus): { icon: string; color: typeof chalk } {
        switch (status) {
            case WorkflowSyncStatus.IN_SYNC:
                return { icon: '✔', color: chalk.green };
            case WorkflowSyncStatus.MODIFIED_LOCALLY:
                return { icon: '✏️', color: chalk.blue };
            case WorkflowSyncStatus.MODIFIED_REMOTELY:
                return { icon: '☁️', color: chalk.cyan };
            case WorkflowSyncStatus.CONFLICT:
                return { icon: '💥', color: chalk.red };
            case WorkflowSyncStatus.EXIST_ONLY_LOCALLY:
                return { icon: '+', color: chalk.yellow };
            case WorkflowSyncStatus.EXIST_ONLY_REMOTELY:
                return { icon: '-', color: chalk.yellow };
            case WorkflowSyncStatus.DELETED_LOCALLY:
            case WorkflowSyncStatus.DELETED_REMOTELY:
                return { icon: '🗑️', color: chalk.gray };
            default:
                return { icon: '?', color: chalk.white };
        }
    }

    private getSummary(matrix: IWorkflowStatus[]) {
        return {
            inSync: matrix.filter(w => w.status === WorkflowSyncStatus.IN_SYNC).length,
            modifiedLocally: matrix.filter(w => w.status === WorkflowSyncStatus.MODIFIED_LOCALLY).length,
            modifiedRemotely: matrix.filter(w => w.status === WorkflowSyncStatus.MODIFIED_REMOTELY).length,
            conflicts: matrix.filter(w => w.status === WorkflowSyncStatus.CONFLICT).length,
            onlyLocal: matrix.filter(w => w.status === WorkflowSyncStatus.EXIST_ONLY_LOCALLY).length,
            onlyRemote: matrix.filter(w => w.status === WorkflowSyncStatus.EXIST_ONLY_REMOTELY).length,
            deleted: matrix.filter(w => 
                w.status === WorkflowSyncStatus.DELETED_LOCALLY || 
                w.status === WorkflowSyncStatus.DELETED_REMOTELY
            ).length
        };
    }
}
