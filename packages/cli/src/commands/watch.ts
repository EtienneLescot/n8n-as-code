import { BaseCommand } from './base.js';
import { SyncManager } from '@n8n-as-code/core';
import chokidar from 'chokidar';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import path from 'path';

export class WatchCommand extends BaseCommand {
    private isPromptActive = false;
    private logBuffer: string[] = [];
    private pendingConflictIds = new Set<string>();

    private flushLogBuffer(spinner: any) {
        if (this.logBuffer.length === 0) return;
        
        // Display buffered logs with a notice
        console.log(chalk.gray('\n--- Buffered logs during prompt ---'));
        for (const msg of this.logBuffer) {
            // Just print the log without affecting spinner state
            console.log(chalk.gray(msg));
        }
        console.log(chalk.gray('--- End buffered logs ---\n'));
        this.logBuffer = [];
    }

    async run() {
        // Increase max listeners to avoid warning from inquirer
        process.stdin.setMaxListeners(20);
        
        console.log(chalk.blue('🚀 Starting n8n-as-code Watcher...'));

        const syncManager = new SyncManager(this.client, {
            directory: this.config.directory,
            pollIntervalMs: this.config.pollInterval,
            syncInactive: this.config.syncInactive,
            ignoredTags: this.config.ignoredTags
        });

        const spinner = ora('Initializing...').start();

        // Connect logs
        syncManager.on('log', (msg: string) => {
            if (this.isPromptActive) {
                // Buffer logs during prompts to prevent interference
                this.logBuffer.push(msg);
                return;
            }

            if (msg.includes('Error')) {
                // Don't break spinner if possible, or just log
                spinner.text = msg; // Update text instead of fail/succeed to keep spinning
            } else if (msg.includes('✅') || msg.includes('✨') || msg.includes('Updated') || msg.includes('Applied')) {
                spinner.succeed(msg);
                spinner.start('Watching...');
            } else {
                if (msg.includes('Starting') || msg.includes('Checking')) {
                    spinner.text = msg;
                }
            }
        });

        syncManager.on('error', (err: string) => {
            spinner.fail(chalk.red(err));
            spinner.start('Watching...');
        });

        syncManager.on('local-deletion', async (data: { id: string, filename: string }) => {
            console.log(`[DEBUG] WatchCommand received local-deletion event for ${data.filename}`);
            spinner.stop();
            console.log(chalk.yellow(`🗑️  LOCAL DELETION detected for "${data.filename}"`));
            
            // Activate prompt protection
            this.isPromptActive = true;
            const { confirm } = await inquirer.prompt([{
                type: 'confirm',
                name: 'confirm',
                message: `Are you sure? This workflow will also be deleted on your n8n instance.`,
                default: false
            }]);
            this.isPromptActive = false;
            
            // Flush buffered logs
            this.flushLogBuffer(spinner);

            if (confirm) {
                const success = await syncManager.deleteRemoteWorkflow(data.id, data.filename);
                if (success) {
                    console.log(chalk.green(`✅ Remote workflow deleted and backed up to .archive`));
                }
            } else {
                console.log(chalk.blue(`🔄 Restoring local file from n8n...`));
                await syncManager.restoreLocalFile(data.id, data.filename);
            }

            spinner.start('Watching...');
        });

        syncManager.on('change', (data: any) => {
            if (data.type === 'remote-deletion') {
                spinner.info(chalk.blue(`🗑️  Remote workflow "${data.filename}" was deleted. Local file moved to .archive.`));
                spinner.start('Watching...');
            }
        });

        syncManager.on('conflict', async (conflict: any) => {
            // Skip if this conflict is already being handled
            if (this.pendingConflictIds.has(conflict.id)) {
                console.log(chalk.gray(`[Debug] Conflict for ${conflict.filename} already being handled, skipping duplicate.`));
                return;
            }
            this.pendingConflictIds.add(conflict.id);
            
            spinner.stop();
            console.log(chalk.yellow(`⚠️  CONFLICT detected for "${conflict.filename}"`));
            
            // Activate prompt protection
            this.isPromptActive = true;
            const { action } = await inquirer.prompt([{
                type: 'list',
                name: 'action',
                message: 'How do you want to resolve this conflict?',
                choices: [
                    { name: 'Skip (Keep both as is for now)', value: 'skip' },
                    { name: 'Overwrite Remote (Force Push my local changes)', value: 'push' },
                    { name: 'Overwrite Local (Force Pull remote changes)', value: 'pull' }
                ]
            }]);
            this.isPromptActive = false;
            
            // Flush buffered logs
            this.flushLogBuffer(spinner);

            if (action === 'push') {
                // Update state to match remote so we can push (pretend we saw it)
                // Accessing private stateManager via bracket notation to bypass TS check
                (syncManager as any)['stateManager']?.updateWorkflowState(conflict.id, conflict.remoteContent);
                // Trigger push
                const absPath = path.join(syncManager.getInstanceDirectory(), conflict.filename);
                await syncManager.handleLocalFileChange(absPath);
            } else if (action === 'pull') {
                // Force pull
                await syncManager.pullWorkflow(conflict.filename, conflict.id, true);
                console.log(chalk.green(`✅ Local file updated from n8n.`));
            } else {
                console.log(chalk.gray('Skipped. Conflict remains.'));
            }

            // Remove from pending set after resolution
            this.pendingConflictIds.delete(conflict.id);
            spinner.start('Watching...');
        });

        await syncManager.startWatch();
    }
}
