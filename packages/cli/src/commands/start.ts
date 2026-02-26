import { BaseCommand } from './base.js';
import { SyncManager, WorkflowSyncStatus, IWorkflowStatus, formatWorkflowNameWithBadges } from '../core/index.js';
import chalk from 'chalk';
import logUpdate from 'log-update';
import Table from 'cli-table3';
import inquirer from 'inquirer';
import { showDiff, flushLogBuffer } from '../utils/cli-helpers.js';

/**
 * StartCommand - Main monitoring command
 * Monitors file changes and polls API
 * Displays a live updating table + interactive prompts for conflict/deletion resolution
 * Equivalent to VS Code Extension's TreeView with action buttons
 */
export class StartCommand extends BaseCommand {
    private table: Table.Table | null = null;
    private lastUpdate: Date = new Date();
    private isPromptActive = false;
    private logBuffer: string[] = [];
    private pendingConflictIds = new Set<string>();
    private projectLabel: string | null = null;

    async run(): Promise<void> {
        const localConfig = this.configService.getLocalConfig();
        this.projectLabel = localConfig.projectName || null;

        console.log(chalk.blue(`🚀 Starting n8n-as-code...`));
        console.log(chalk.gray('Monitoring changes. Conflicts and deletions require your input.\n'));

        if (this.projectLabel) {
            console.log(chalk.cyan(`📁 Project: ${chalk.bold(this.projectLabel)}\n`));
        }

        const syncConfig = await this.getSyncConfig();
        
        // Suppress Sync debug logs to keep output clean
        const originalConsoleLog = console.log;
        console.log = (...args: any[]) => {
            const msg = args.join(' ');
            if (msg.includes('[SyncManager]') || 
                msg.includes('Auto-sync skipped') ||
                msg.includes('[N8nApiClient]')) {
                return; // Suppress internal Sync logs
            }
            originalConsoleLog.apply(console, args);
        };
        
        const syncManager = new SyncManager(this.client, syncConfig);

        // Listen to state changes and re-render
        syncManager.on('log', async (msg: string) => {
            if (this.isPromptActive) {
                this.logBuffer.push(msg);
                return;
            }
            await this.renderTable(syncManager);
        });

        syncManager.on('change', async () => {
            if (!this.isPromptActive) {
                await this.renderTable(syncManager);
            }
        });

        syncManager.on('error', async (err: string) => {
            if (!this.isPromptActive) {
                // Render table first, then show error
                await this.renderTable(syncManager);
                console.error(chalk.red(`\n❌ Error: ${err}`));
            }
        });

        // Flag to ignore events during initial stabilization
        let watchStarted = false;

        // Interactive prompts for conflicts (only during watch, not at startup)
        syncManager.on('conflict', async (conflict: any) => {
            if (!watchStarted) return; // Ignore during initialization
            await this.handleConflictPrompt(conflict, syncManager);
            await this.renderTable(syncManager);
        });

        // Initial render and capture issues BEFORE starting watch
        await syncManager.forceRefresh();
        await this.renderTable(syncManager);

        // Capture issues that exist at startup (before watch changes them)
        const initialStatuses = await syncManager.getWorkflowsStatus();
        const initialConflicts = initialStatuses.filter(w => w.status === WorkflowSyncStatus.CONFLICT);

        // Start watching FIRST (needed for proper state management)
        await syncManager.startWatch();
        
        // Small delay to let the watcher stabilize
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Handle initial conflicts that we captured BEFORE watch
        if (initialConflicts.length > 0) {
            for (const conflict of initialConflicts) {
                await this.handleConflictPrompt(conflict, syncManager);
            }
            
            // Refresh display after handling
            await this.renderTable(syncManager);
        }
        
        // Now enable event handlers for new changes
        watchStarted = true;
    }


    /**
     * Handle conflict with prompt
     */
    private async handleConflictPrompt(conflict: any, syncManager: SyncManager) {
        if (this.pendingConflictIds.has(conflict.id)) {
            return;
        }
        this.pendingConflictIds.add(conflict.id);
        
        this.isPromptActive = true;
        
        console.log(chalk.yellow(`\n⚠️  CONFLICT detected for "${conflict.filename}"`));
        console.log(chalk.gray('Both local and remote versions have changed since last sync.\n'));
        
        const { action } = await inquirer.prompt([{
            type: 'rawlist',
            name: 'action',
            message: 'How do you want to resolve this?',
            choices: [
                { name: '[1] Show Diff', value: 'diff' },
                { name: '[2] Force Push (keep local)', value: 'push' },
                { name: '[3] Pull (keep remote)', value: 'pull' },
                { name: '[4] Skip', value: 'skip' }
            ]
        }]);

        if (action === 'diff') {
            await showDiff(conflict, this.client, syncManager.getInstanceDirectory());
            this.pendingConflictIds.delete(conflict.id);
            this.isPromptActive = false;
            await this.handleConflictPrompt(conflict, syncManager); // Re-prompt
            return;
        } else if (action === 'push') {
            await syncManager.resolveConflict(conflict.id, conflict.filename, 'local');
            console.log(chalk.green(`✅ Pushed — remote overwritten with local version.\n`));
        } else if (action === 'pull') {
            await syncManager.resolveConflict(conflict.id, conflict.filename, 'remote');
            console.log(chalk.green(`✅ Pulled — local file updated from n8n.\n`));
        } else {
            console.log(chalk.gray(`⏭️  Conflict skipped.\n`));
        }

        this.pendingConflictIds.delete(conflict.id);
        this.isPromptActive = false;
    }

    private formatWorkflowName(workflow: IWorkflowStatus, maxLength?: number): string {
        return formatWorkflowNameWithBadges(workflow, {
            maxLength,
            showProjectBadge: false,
            archivedBadgeStyle: (text) => chalk.gray(text)
        });
    }

    private async renderTable(syncManager: SyncManager) {
        this.lastUpdate = new Date();
        const matrix = await syncManager.getWorkflowsStatus();

        const projectHeader = this.projectLabel
            ? chalk.cyan(`📁 Project: ${chalk.bold(this.projectLabel)}`) + '\n'
            : '';

        // Get terminal width for dynamic column sizing
        const terminalWidth = process.stdout.columns || 80;
        
        // For narrow terminals, use compact layout
        if (terminalWidth < 100) {
            // Compact layout for terminals < 100 columns
            const colWidths = [12, 12, 25, 25];
            
            // Create compact table
            const table = new Table({
                head: [
                    chalk.bold('Status'),
                    chalk.bold('ID'),
                    chalk.bold('Name'),
                    chalk.bold('Path')
                ],
                colWidths: colWidths,
                wordWrap: false,
                wrapOnWordBoundary: false
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
                const statusText = `${icon} ${workflow.status.replace(/_/g, ' ').substring(0, 10)}`;
                
                // Format name with badges and truncate
                const formattedName = this.formatWorkflowName(workflow, 20);
                const truncatedPath = workflow.filename && workflow.filename.length > 20 ?
                    '...' + workflow.filename.substring(workflow.filename.length - 17) :
                    workflow.filename || '-';
                
                table.push([
                    color(statusText),
                    workflow.id ? workflow.id.substring(0, 9) + '…' : '-',
                    formattedName,
                    truncatedPath
                ]);
            }

            // Summary
            const summary = this.getSummary(matrix);
            const summaryText = [
                chalk.bold('\nSummary:'),
                chalk.green(`  ✔ Tracked: ${summary.tracked}`),
                chalk.blue(`  ✏️  Local: ${summary.modifiedLocally}`),
                chalk.red(`  💥 Conflicts: ${summary.conflicts}`),
                chalk.bold(`  Total: ${matrix.length}`),
                '',
                chalk.gray(`⏱️  ${this.lastUpdate.toLocaleTimeString()}`),
                chalk.cyan('🔄 Watching...')
            ].join('\n');

            // Use log-update to re-render without flickering
            logUpdate(projectHeader + table.toString() + '\n' + summaryText);
            return;
        }
        
        // Standard layout for wider terminals
        const colWidths = [15, 15, 30, 40];

        // Create table
        const table = new Table({
            head: [
                chalk.bold('Status'),
                chalk.bold('ID'),
                chalk.bold('Name'),
                chalk.bold('Local Path')
            ],
            colWidths: colWidths,
            wordWrap: false,
            wrapOnWordBoundary: false
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
            const formattedName = this.formatWorkflowName(workflow, 28);
            
            table.push([
                color(statusText),
                workflow.id || '-',
                formattedName,
                workflow.filename || '-'
            ]);
        }

        // Summary
        const summary = this.getSummary(matrix);
        const summaryText = [
            chalk.bold('\nStatus Summary:'),
            chalk.green(`  ✔ Tracked: ${summary.tracked}`),
            chalk.blue(`  ✏️  Modified Locally: ${summary.modifiedLocally}`),
            chalk.red(`  💥 Conflicts: ${summary.conflicts}`),
            chalk.yellow(`  + Only Local: ${summary.onlyLocal}`),
            chalk.yellow(`  - Only Remote: ${summary.onlyRemote}`),
            chalk.bold(`  Total: ${matrix.length}`),
            '',
            chalk.gray(`⏱️  Last update: ${this.lastUpdate.toLocaleTimeString()}`),
            chalk.cyan('🔄 Watching for changes...')
        ].join('\n');

        // Use log-update to re-render without flickering
        logUpdate(projectHeader + table.toString() + '\n' + summaryText);
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
