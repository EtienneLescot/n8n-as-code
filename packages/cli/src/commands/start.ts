import { BaseCommand } from './base.js';
import { SyncManager, WorkflowSyncStatus, IWorkflowStatus } from '@n8n-as-code/core';
import chalk from 'chalk';
import logUpdate from 'log-update';
import Table from 'cli-table3';
import inquirer from 'inquirer';
import { showDiff, flushLogBuffer } from '../utils/cli-helpers.js';

/**
 * StartCommand - Main monitoring command
 * Monitors file changes and polls API
 * Displays a live updating table + interactive prompts for conflict/deletion resolution
 * 
 * Modes:
 * - Auto (default): Automatic bidirectional sync with prompts for conflicts
 * - Manual (--manual): Interactive prompts for all actions
 * 
 * Equivalent to VS Code Extension's TreeView with action buttons
 */
export class StartCommand extends BaseCommand {
    private table: Table.Table | null = null;
    private lastUpdate: Date = new Date();
    private isPromptActive = false;
    private logBuffer: string[] = [];
    private pendingConflictIds = new Set<string>();
    private manualMode = false;

    async run(options: { manual?: boolean } = {}): Promise<void> {
        this.manualMode = options.manual || false;
        const mode = this.manualMode ? 'Manual' : 'Auto';
        console.log(chalk.blue(`🚀 Starting n8n-as-code (${mode} Mode)...`));
        console.log(chalk.gray(
            this.manualMode 
                ? 'Monitoring changes with interactive prompts for all actions.\n'
                : 'Monitoring changes with automatic sync.\n'
        ));

        const syncConfig = await this.getSyncConfig();
        if (!this.manualMode) {
            syncConfig.syncMode = 'auto'; // Enable auto-sync in auto mode
        }
        
        // Suppress Core debug logs to keep output clean
        const originalConsoleLog = console.log;
        console.log = (...args: any[]) => {
            const msg = args.join(' ');
            if (msg.includes('[SyncManager]') || 
                msg.includes('Auto-sync skipped') ||
                msg.includes('[N8nApiClient]')) {
                return; // Suppress internal Core logs
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
            
            if (!this.manualMode) {
                // Auto mode: show log stream style messages for sync actions
                if (msg.includes('PUSHED') || msg.includes('Created')) {
                    logUpdate.clear();
                    console.log(chalk.green(`[${new Date().toLocaleTimeString()}] 🟢 ${msg}`));
                } else if (msg.includes('PULLED') || msg.includes('Updated')) {
                    logUpdate.clear();
                    console.log(chalk.blue(`[${new Date().toLocaleTimeString()}] 🔵 ${msg}`));
                }
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
                logUpdate.clear();
                console.error(chalk.red(`\n❌ Error: ${err}`));
                await this.renderTable(syncManager);
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

        // Interactive prompts for local deletions (only during watch, not at startup)
        syncManager.on('local-deletion', async (data: { id: string, filename: string }) => {
            if (!watchStarted) return; // Ignore during initialization
            await this.handleLocalDeletionPrompt(data, syncManager);
            await this.renderTable(syncManager);
        });

        // Notification for remote deletions
        syncManager.on('change', (data: any) => {
            if (data.type === 'remote-deletion' && !this.isPromptActive) {
                logUpdate.clear();
                console.log(chalk.yellow(`\n🗑️  Remote workflow "${data.filename}" was deleted. Local file moved to _archive.\n`));
            }
        });

        // Initial render and capture issues BEFORE starting watch
        await syncManager.refreshState();
        await this.renderTable(syncManager);

        // Capture issues that exist at startup (before watch changes them)
        const initialStatuses = await syncManager.getWorkflowsStatus();
        const initialConflicts = initialStatuses.filter(w => w.status === WorkflowSyncStatus.CONFLICT);
        const initialDeletions = initialStatuses.filter(w => w.status === WorkflowSyncStatus.DELETED_LOCALLY);

        // Start watching FIRST (needed for proper state management)
        await syncManager.startWatch();
        
        // Small delay to let the watcher stabilize
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Handle initial issues that we captured BEFORE watch
        // In both manual and auto mode, conflicts and deletions require user decision
        if (initialConflicts.length > 0 || initialDeletions.length > 0) {
            // Handle conflicts first
            for (const conflict of initialConflicts) {
                await this.handleConflictPrompt(conflict, syncManager);
            }
            
            // Handle local deletions
            for (const deletion of initialDeletions) {
                await this.handleLocalDeletionPrompt(deletion, syncManager);
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
        
        logUpdate.clear();
        this.isPromptActive = true;
        
        console.log(chalk.yellow(`\n⚠️  CONFLICT detected for "${conflict.filename}"`));
        console.log(chalk.gray('Both local and remote versions have changed since last sync.\n'));
        
        const { action } = await inquirer.prompt([{
            type: 'rawlist',
            name: 'action',
            message: 'How do you want to resolve this?',
            choices: [
                { name: '[1] Keep Local Version (Force Push)', value: 'push' },
                { name: '[2] Keep Remote Version (Force Pull)', value: 'pull' },
                { name: '[3] Show Diff (Display colored diff)', value: 'diff' },
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
            console.log(chalk.green(`✅ Remote overwritten by local.\n`));
        } else if (action === 'pull') {
            await syncManager.resolveConflict(conflict.id, conflict.filename, 'remote');
            console.log(chalk.green(`✅ Local file updated from n8n.\n`));
        } else {
            console.log(chalk.gray(`⏭️  Conflict skipped.\n`));
        }

        this.pendingConflictIds.delete(conflict.id);
        this.isPromptActive = false;
    }

    /**
     * Handle local deletion with prompt
     */
    private async handleLocalDeletionPrompt(data: { id: string, filename: string }, syncManager: SyncManager) {
        logUpdate.clear();
        this.isPromptActive = true;
        
        console.log(chalk.yellow(`\n🗑️  LOCAL DELETION detected for "${data.filename}"`));
        
        const { action } = await inquirer.prompt([{
            type: 'rawlist',
            name: 'action',
            message: `Local file missing for "${data.filename}". Action:`,
            choices: [
                { name: 'Confirm Deletion (Delete on n8n)', value: 'delete' },
                { name: 'Restore File (Download from n8n)', value: 'restore' },
                { name: 'Skip', value: 'skip' }
            ]
        }]);

        if (action === 'delete') {
            // Before deleting, ensure we have a backup
            // If file was deleted manually (outside watch), download it first for backup
            try {
                const fs = await import('fs');
                const path = await import('path');
                const localPath = path.join(syncManager.getInstanceDirectory(), data.filename);
                
                // Check if file exists locally
                if (!fs.existsSync(localPath)) {
                    // File doesn't exist, download from n8n for backup before deleting
                    console.log(chalk.gray(`  Downloading workflow for backup...\n`));
                    await syncManager.resolveConflict(data.id, data.filename, 'remote');
                }
            } catch (error: any) {
                console.log(chalk.yellow(`  Warning: Could not create backup: ${error.message}\n`));
            }
            
            // Now delete on remote
            const success = await syncManager.deleteRemoteWorkflow(data.id, data.filename);
            if (success) {
                console.log(chalk.green(`✅ Remote workflow deleted and backed up to _archive.\n`));
            } else {
                console.log(chalk.red(`❌ Failed to delete remote workflow.\n`));
            }
        } else if (action === 'restore') {
            // Use resolveConflict with 'remote' to force pull from n8n
            // This works even if file is not in _archive (manual deletion case)
            try {
                await syncManager.resolveConflict(data.id, data.filename, 'remote');
                console.log(chalk.blue(`🔄 Local file restored from n8n.\n`));
            } catch (error: any) {
                console.log(chalk.red(`❌ Failed to restore local file: ${error.message}\n`));
            }
        } else {
            console.log(chalk.gray(`⏭️  Skipped deletion.\n`));
        }

        this.isPromptActive = false;
    }

    private async renderTable(syncManager: SyncManager) {
        this.lastUpdate = new Date();
        const matrix = await syncManager.getWorkflowsStatus();

        // Create table
        const table = new Table({
            head: [
                chalk.bold('Status'),
                chalk.bold('ID'),
                chalk.bold('Name'),
                chalk.bold('Local Path')
            ],
            colWidths: [20, 15, 40, 50],
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
            
            table.push([
                color(statusText),
                workflow.id || '-',
                workflow.name,
                workflow.filename || '-'
            ]);
        }

        // Summary
        const summary = this.getSummary(matrix);
        const summaryText = [
            chalk.bold('\nStatus Summary:'),
            chalk.green(`  ✔ In Sync: ${summary.inSync}`),
            chalk.blue(`  ✏️  Modified Locally: ${summary.modifiedLocally}`),
            chalk.cyan(`  ☁️  Modified Remotely: ${summary.modifiedRemotely}`),
            chalk.red(`  💥 Conflicts: ${summary.conflicts}`),
            chalk.yellow(`  + Only Local: ${summary.onlyLocal}`),
            chalk.yellow(`  - Only Remote: ${summary.onlyRemote}`),
            chalk.gray(`  🗑️  Deleted: ${summary.deleted}`),
            chalk.bold(`  Total: ${matrix.length}`),
            '',
            chalk.gray(`⏱️  Last update: ${this.lastUpdate.toLocaleTimeString()}`),
            chalk.cyan('🔄 Watching for changes...')
        ].join('\n');

        // Use log-update to re-render without flickering
        logUpdate(table.toString() + '\n' + summaryText);
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
