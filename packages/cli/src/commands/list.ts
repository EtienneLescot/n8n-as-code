import { BaseCommand } from './base.js';
import { SyncManager, WorkflowSyncStatus, IWorkflowStatus, formatWorkflowNameWithBadges } from '../core/index.js';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
 
export class ListCommand extends BaseCommand {
    async run(options?: { local?: boolean; remote?: boolean; raw?: boolean }): Promise<void> {
        const spinner = ora('Listing workflows...').start();

        try {
            const syncConfig = await this.getSyncConfig();
            const syncManager = new SyncManager(this.client, syncConfig);

            // Get lightweight workflow list: no hash computation, no TypeScript compilation.
            // Fetches fresh remote metadata on each call for an up-to-date view.
            let workflows = await syncManager.listWorkflows({ fetchRemote: true });
            
            // Apply filters based on options
            if (options?.local) {
                workflows = workflows.filter(w =>
                    w.status === WorkflowSyncStatus.EXIST_ONLY_LOCALLY ||
                    w.status === WorkflowSyncStatus.MODIFIED_LOCALLY ||
                    w.status === WorkflowSyncStatus.TRACKED ||
                    w.status === WorkflowSyncStatus.CONFLICT
                );
            } else if (options?.remote) {
                workflows = workflows.filter(w =>
                    w.status === WorkflowSyncStatus.EXIST_ONLY_REMOTELY ||
                    w.status === WorkflowSyncStatus.TRACKED ||
                    w.status === WorkflowSyncStatus.CONFLICT
                );
            }

            spinner.stop();

            const localConfig = this.configService.getLocalConfig();
            if (localConfig.projectName) {
                console.log(chalk.cyan(`\n📁 Project: ${chalk.bold(localConfig.projectName)}`));
            }

            // Raw output (full JSON) if requested
            if (options?.raw) {
                spinner.stop();
                console.log(JSON.stringify(workflows, null, 2));
                return;
            }

            // Create table
            const table = new Table({
                head: [
                    chalk.bold('Status'),
                    chalk.bold('ID'),
                    chalk.bold('Name'),
                    chalk.bold('Local Path')
                ],
                // No fixed colWidths - let it auto-size based on content to avoid truncation
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

            const sorted = workflows.sort((a: IWorkflowStatus, b: IWorkflowStatus) => {
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
            const summary = this.getSummary(workflows);
            console.log(chalk.bold('Summary:'));
            console.log(chalk.green(`  ✔ Tracked: ${summary.tracked}`));
            console.log(chalk.blue(`  ✏️  Modified Locally: ${summary.modifiedLocally}`));
            console.log(chalk.red(`  💥 Conflicts: ${summary.conflicts}`));
            console.log(chalk.yellow(`  + Local Only: ${summary.onlyLocal}`));
            console.log(chalk.yellow(`  - Remote Only: ${summary.onlyRemote}`));
            console.log(chalk.bold(`  Total: ${workflows.length}\n`));

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

    private getSummary(workflows: IWorkflowStatus[]) {
        return {
            tracked: workflows.filter(w => w.status === WorkflowSyncStatus.TRACKED).length,
            modifiedLocally: workflows.filter(w => w.status === WorkflowSyncStatus.MODIFIED_LOCALLY).length,
            conflicts: workflows.filter(w => w.status === WorkflowSyncStatus.CONFLICT).length,
            onlyLocal: workflows.filter(w => w.status === WorkflowSyncStatus.EXIST_ONLY_LOCALLY).length,
            onlyRemote: workflows.filter(w => w.status === WorkflowSyncStatus.EXIST_ONLY_REMOTELY).length
        };
    }
}
