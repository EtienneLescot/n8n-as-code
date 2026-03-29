import { BaseCommand } from './base.js';
import { SyncManager, WorkflowSyncStatus, IWorkflowStatus, formatWorkflowNameWithBadges } from '../core/index.js';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';

export type WorkflowListSortMode = 'status' | 'name';

export interface ListCommandOptions {
    local?: boolean;
    remote?: boolean;
    raw?: boolean;
    search?: string;
    sort?: WorkflowListSortMode;
    limit?: number;
}

export function matchesWorkflowSearch(workflow: IWorkflowStatus, query?: string): boolean {
    const normalizedQuery = query?.trim().toLowerCase();
    if (!normalizedQuery) {
        return true;
    }

    return [workflow.name, workflow.id, workflow.filename]
        .filter((value): value is string => Boolean(value))
        .some(value => value.toLowerCase().includes(normalizedQuery));
}

export function sortWorkflows(workflows: IWorkflowStatus[], sortMode: WorkflowListSortMode = 'status'): IWorkflowStatus[] {
    const statusPriority: Record<WorkflowSyncStatus, number> = {
        [WorkflowSyncStatus.CONFLICT]: 1,
        [WorkflowSyncStatus.EXIST_ONLY_LOCALLY]: 2,
        [WorkflowSyncStatus.EXIST_ONLY_REMOTELY]: 3,
        [WorkflowSyncStatus.TRACKED]: 4,
    };

    return [...workflows].sort((a, b) => {
        if (sortMode === 'name') {
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        }

        const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
        if (priorityDiff !== 0) return priorityDiff;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
}

function filterWorkflowsByScopeAndSearch(workflows: IWorkflowStatus[], options?: ListCommandOptions): IWorkflowStatus[] {
    let filtered = workflows;

    if (options?.local) {
        filtered = filtered.filter(w =>
            w.status === WorkflowSyncStatus.EXIST_ONLY_LOCALLY ||
            w.status === WorkflowSyncStatus.TRACKED ||
            w.status === WorkflowSyncStatus.CONFLICT
        );
    } else if (options?.remote) {
        filtered = filtered.filter(w =>
            w.status === WorkflowSyncStatus.EXIST_ONLY_REMOTELY ||
            w.status === WorkflowSyncStatus.TRACKED ||
            w.status === WorkflowSyncStatus.CONFLICT
        );
    }

    return filtered.filter(workflow => matchesWorkflowSearch(workflow, options?.search));
}

export function applyListCommandOptions(workflows: IWorkflowStatus[], options?: ListCommandOptions): IWorkflowStatus[] {
    let filtered = sortWorkflows(filterWorkflowsByScopeAndSearch(workflows, options), options?.sort ?? 'status');

    if (options?.limit) {
        filtered = filtered.slice(0, options.limit);
    }

    return filtered;
}

export function countMatchingWorkflows(workflows: IWorkflowStatus[], options?: ListCommandOptions): number {
    return filterWorkflowsByScopeAndSearch(workflows, options).length;
}

export class ListCommand extends BaseCommand {
    async run(options?: ListCommandOptions): Promise<void> {
        const spinner = ora('Listing workflows...').start();

        try {
            const syncConfig = await this.getSyncConfig();
            const syncManager = new SyncManager(this.client, syncConfig);

            // Get lightweight workflow list: no hash computation, no TypeScript compilation.
            // Fetches fresh remote metadata on each call for an up-to-date view.
            const allWorkflows = await syncManager.listWorkflows({ fetchRemote: true });
            const workflows = applyListCommandOptions(allWorkflows, options);
            // When no limit is applied, `workflows` already reflects the full filtered/sorted result set,
            // so its length is the number of matches without doing an extra pass.
            const matchingCount = options?.limit
                ? countMatchingWorkflows(allWorkflows, options)
                : workflows.length;

            spinner.stop();

            // Raw output (full JSON) if requested
            if (options?.raw) {
                spinner.stop();
                console.log(JSON.stringify(workflows, null, 2));
                return;
            }

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
                // No fixed colWidths - let it auto-size based on content to avoid truncation
                wordWrap: true
            });

            // Add rows with color coding
            for (const workflow of workflows) {
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
            console.log(chalk.red(`  💥 Conflicts: ${summary.conflicts}`));
            console.log(chalk.yellow(`  + Local Only: ${summary.onlyLocal}`));
            console.log(chalk.yellow(`  - Remote Only: ${summary.onlyRemote}`));
            console.log(chalk.bold(`  Total: ${workflows.length}\n`));
            if (options?.limit && matchingCount > workflows.length) {
                console.log(chalk.gray(`Showing first ${workflows.length} of ${matchingCount} matching workflows.\n`));
            }

        } catch (error: any) {
            spinner.fail(chalk.red(`Failed to list workflows: ${error.message}`));
            process.exit(1);
        }
    }

    private getStatusDisplay(status: WorkflowSyncStatus): { icon: string; color: typeof chalk } {
        switch (status) {
            case WorkflowSyncStatus.TRACKED:
                return { icon: '✔', color: chalk.green };
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
            conflicts: workflows.filter(w => w.status === WorkflowSyncStatus.CONFLICT).length,
            onlyLocal: workflows.filter(w => w.status === WorkflowSyncStatus.EXIST_ONLY_LOCALLY).length,
            onlyRemote: workflows.filter(w => w.status === WorkflowSyncStatus.EXIST_ONLY_REMOTELY).length
        };
    }
}
