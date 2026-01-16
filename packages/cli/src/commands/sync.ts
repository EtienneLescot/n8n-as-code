import { BaseCommand } from './base.js';
import { SyncManager } from '@n8n-as-code/core';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import path from 'path';

export class SyncCommand extends BaseCommand {
    private isPromptActive = false;
    private logBuffer: string[] = [];
    private pendingConflictIds = new Set<string>();

    private async handleConflict(conflict: any, syncManager: SyncManager, spinner: any) {
        // Skip if already handling
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
            type: 'rawlist',
            name: 'action',
            message: 'How do you want to resolve this conflict?',
            choices: [
                { name: 'Skip (Keep both as is for now)', value: 'skip' },
                { name: 'Overwrite Remote (Force Push my local changes)', value: 'push' },
                { name: 'Overwrite Local (Force Pull remote changes)', value: 'pull' }
            ],
            pageSize: 3
        }]);
        this.isPromptActive = false;
        
        // Flush buffered logs
        this.flushLogBuffer(spinner);

        if (action === 'push') {
            // Use resolveConflict to force push local to remote
            await syncManager.resolveConflict(conflict.id, conflict.filename, 'local');
            console.log(chalk.green(`✅ Remote overwritten by local.`));
        } else if (action === 'pull') {
            // Use resolveConflict to force pull remote to local
            await syncManager.resolveConflict(conflict.id, conflict.filename, 'remote');
            console.log(chalk.green(`✅ Local file updated from n8n.`));
        } else {
            console.log(chalk.gray('Skipped. Conflict remains.'));
        }

        this.pendingConflictIds.delete(conflict.id);
        spinner.start('Pulling workflows from n8n...');
    }

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

    async pull() {
        const spinner = ora('Pulling workflows from n8n...').start();
        try {
            const syncManager = new SyncManager(this.client, {
                directory: this.config.directory,
                pollIntervalMs: 0, // Not used for one-off
                syncInactive: this.config.syncInactive,
                ignoredTags: this.config.ignoredTags
            });

            syncManager.on('log', (msg) => {
                if (this.isPromptActive) {
                    this.logBuffer.push(msg);
                    return;
                }
                if (msg.includes('Updated') || msg.includes('New')) spinner.info(msg);
            });

            // Collect conflict resolution promises
            const conflictPromises: Promise<void>[] = [];
            const conflictHandler = async (conflict: any) => {
                // Create a promise that resolves when this conflict is handled
                const promise = this.handleConflict(conflict, syncManager, spinner);
                conflictPromises.push(promise);
                await promise;
            };
            syncManager.on('conflict', conflictHandler);

            await syncManager.syncDown();
            
            // Wait for all conflict resolutions to complete
            if (conflictPromises.length > 0) {
                spinner.stop();
                console.log(chalk.blue(`⏳ Resolving ${conflictPromises.length} conflict(s)...`));
                await Promise.all(conflictPromises);
                spinner.start('Pulling workflows from n8n...');
            }

            spinner.succeed('Pull complete.');
        } catch (e: any) {
            spinner.fail(`Pull failed: ${e.message}`);
            process.exit(1);
        }
    }

    async push() {
        const spinner = ora('Pushing new local workflows to n8n...').start();
        try {
            const syncManager = new SyncManager(this.client, {
                directory: this.config.directory,
                pollIntervalMs: 0,
                syncInactive: this.config.syncInactive,
                ignoredTags: this.config.ignoredTags
            });

            syncManager.on('log', (msg) => {
                if (this.isPromptActive) {
                    this.logBuffer.push(msg);
                    return;
                }
                if (msg.includes('Created') || msg.includes('Update')) spinner.info(msg);
            });

            // Collect conflict resolution promises
            const conflictPromises: Promise<void>[] = [];
            const conflictHandler = async (conflict: any) => {
                const promise = this.handleConflict(conflict, syncManager, spinner);
                conflictPromises.push(promise);
                await promise;
            };
            syncManager.on('conflict', conflictHandler);

            await syncManager.syncUp();
            
            // Wait for all conflict resolutions to complete
            if (conflictPromises.length > 0) {
                spinner.stop();
                console.log(chalk.blue(`⏳ Resolving ${conflictPromises.length} conflict(s)...`));
                await Promise.all(conflictPromises);
                spinner.start('Pushing new local workflows to n8n...');
            }

            spinner.succeed('Push complete.');
        } catch (e: any) {
            spinner.fail(`Push failed: ${e.message}`);
            process.exit(1);
        }
    }
}
