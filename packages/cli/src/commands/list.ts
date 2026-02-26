import { BaseCommand } from './base.js';
import { SyncManager, WorkflowSyncStatus, IWorkflowStatus, formatWorkflowNameWithBadges } from '../core/index.js';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';

export class ListCommand extends BaseCommand {
    async run(options?: { local?: boolean; remote?: boolean }): Promise<void> {
        const spinner = ora('Refreshing workflow status...').start();

        try {
            const syncConfig = await this.getSyncConfig();
            const syncManager = new SyncManager(this.client, syncConfig);

            // Force refresh to get current state
            await syncManager.forceRefresh();

            // Get workflow status matrix
            let matrix = await syncManager.getWorkflowsStatus();
            
            // Apply filters based on options
            if (options?.local) {
                matrix = matrix.filter(w => w.status === WorkflowSyncStatus.EXIST_ONLY_LOCALLY ||
                                           w.status === WorkflowSyncStatus.MODIFIED_LOCALLY ||
                                           w.status === WorkflowSyncStatus.TRACKED ||
                                           w.status === WorkflowSyncStatus.CONFLICT);
            } else if (options?.remote) {
                matrix = matrix.filter(w => w.status === WorkflowSyncStatus.EXIST_ONLY_REMOTELY ||
                                           w.status === WorkflowSyncStatus.TRACKED ||
                                           w.status === WorkflowSyncStatus.CONFLICT);
            }

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
                [WorkflowSyncStatus.EXIST_ONLY_LOCALLY]: 3,
                [WorkflowSyncStatus.EXIST_ONLY_REMOTELY]: 4,
                [WorkflowSyncStatus.TRACKED]: 5
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
            console.log(chalk.green(`  ✔ Tracked: ${summary.tracked}`));
            console.log(chalk.blue(`  ✏️  Modified Locally: ${summary.modifiedLocally}`));
            console.log(chalk.red(`  💥 Conflicts: ${summary.conflicts}`));
            console.log(chalk.yellow(`  + Only Local: ${summary.onlyLocal}`));
            console.log(chalk.yellow(`  - Only Remote: ${summary.onlyRemote}`));
            console.log(chalk.bold(`  Total: ${matrix.length}\n`));

        } catch (error: any) {
            spinner.fail(chalk.red(`Failed to list workflows: ${error.message}`));
            process.exit(1);
        }
    }

    private getStatusDisplay(status: WorkflowSyncStatus): { icon: string; color: typeof chalk } {
        switch (status) {
            case WorkflowSyncStatus.TRACKED:
                return { icon: '✔', color: chalk.green };
            case WorkflowSyncStatus.MODIFIED_LOCALLY:
                return { icon: '✏️', color: chalk.blue };
            case WorkflowSyncStatus.CONFLICT:
                return { icon: '💥', color: chalk.red };
            case WorkflowSyncStatus.EXIST_ONLY_LOCALLY:
                return { icon: '+', color: chalk.yellow };
            case WorkflowSyncStatus.EXIST_ONLY_REMOTELY:
                return { icon: '-', color: chalk.yellow };
            default:
                return { icon: '?', color: chalk.white };
        }
    }

    private getSummary(matrix: IWorkflowStatus[]) {
        return {
            tracked: matrix.filter(w => w.status === WorkflowSyncStatus.TRACKED).length,
            modifiedLocally: matrix.filter(w => w.status === WorkflowSyncStatus.MODIFIED_LOCALLY).length,
            conflicts: matrix.filter(w => w.status === WorkflowSyncStatus.CONFLICT).length,
            onlyLocal: matrix.filter(w => w.status === WorkflowSyncStatus.EXIST_ONLY_LOCALLY).length,
            onlyRemote: matrix.filter(w => w.status === WorkflowSyncStatus.EXIST_ONLY_REMOTELY).length
        };
    }
}
