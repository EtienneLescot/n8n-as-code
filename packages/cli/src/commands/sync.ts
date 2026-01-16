import { BaseCommand } from './base.js';
import { SyncManager } from '@n8n-as-code/core';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { showDiff, flushLogBuffer } from '../utils/cli-helpers.js';

export class SyncCommand extends BaseCommand {
    private isPromptActive = false;
    private logBuffer: string[] = [];
    private pendingConflictIds = new Set<string>();
    private forceMode = false;

    private async handleConflict(conflict: any, syncManager: SyncManager, spinner: any, mode: 'pull' | 'push') {
        // Skip if already handling
        if (this.pendingConflictIds.has(conflict.id)) {
            return;
        }
        this.pendingConflictIds.add(conflict.id);

        spinner.stop();
        console.log(chalk.yellow(`⚠️  CONFLICT detected for "${conflict.filename}"`));
        console.log(chalk.gray('Both local and remote versions have changed since last sync.\n'));
        
        // Activate prompt protection
        this.isPromptActive = true;
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
        this.isPromptActive = false;
        
        // Flush buffered logs
        flushLogBuffer(this.logBuffer);
        this.logBuffer = [];

        if (action === 'diff') {
            await showDiff(conflict, this.client, syncManager.getInstanceDirectory());
            // Re-prompt after showing diff
            this.pendingConflictIds.delete(conflict.id);
            await this.handleConflict(conflict, syncManager, spinner, mode);
            return;
        } else if (action === 'push') {
            await syncManager.resolveConflict(conflict.id, conflict.filename, 'local');
            console.log(chalk.green(`✅ Remote overwritten by local.`));
        } else if (action === 'pull') {
            await syncManager.resolveConflict(conflict.id, conflict.filename, 'remote');
            console.log(chalk.green(`✅ Local file updated from n8n.`));
        } else {
            console.log(chalk.gray('Skipped. Conflict remains.'));
        }

        this.pendingConflictIds.delete(conflict.id);
        const action_name = mode === 'pull' ? 'Pulling' : 'Pushing';
        spinner.start(`${action_name} workflows...`);
    }


    async pull(force: boolean = false) {
        this.forceMode = force;
        const spinner = ora('Pulling workflows from n8n...').start();
        try {
            const syncConfig = await this.getSyncConfig();
            syncConfig.pollIntervalMs = 0; // Not used for one-off
            const syncManager = new SyncManager(this.client, syncConfig);

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
                if (force) {
                    // Auto-resolve: force pull (keep remote)
                    await syncManager.resolveConflict(conflict.id, conflict.filename, 'remote');
                    spinner.info(chalk.yellow(`⚠️  CONFLICT resolved (--force): "${conflict.filename}" - kept remote version`));
                } else {
                    const promise = this.handleConflict(conflict, syncManager, spinner, 'pull');
                    conflictPromises.push(promise);
                    await promise;
                }
            };
            syncManager.on('conflict', conflictHandler);

            // Refresh state before pulling (Core bug workaround: syncDown doesn't refresh state)
            spinner.text = 'Refreshing workflow state...';
            await syncManager.refreshState();
            spinner.text = 'Pulling workflows from n8n...';
            
            await syncManager.syncDown();
            
            // Wait for all conflict resolutions to complete
            if (conflictPromises.length > 0) {
                spinner.stop();
                console.log(chalk.blue(`⏳ Resolving ${conflictPromises.length} conflict(s)...`));
                await Promise.all(conflictPromises);
            }

            spinner.stop();
            console.log(chalk.green('✔ Pull complete.'));
        } catch (e: any) {
            spinner.fail(`Pull failed: ${e.message}`);
            process.exit(1);
        }
    }

    async push(force: boolean = false) {
        this.forceMode = force;
        const spinner = ora('Pushing new local workflows to n8n...').start();
        try {
            const syncConfig = await this.getSyncConfig();
            syncConfig.pollIntervalMs = 0; // Not used for one-off
            const syncManager = new SyncManager(this.client, syncConfig);

            syncManager.on('log', (msg) => {
                if (this.isPromptActive) {
                    this.logBuffer.push(msg);
                    return;
                }
                if (msg.includes('Created') || msg.includes('Update')) spinner.info(msg);
            });

            // Refresh state before pushing (Core bug workaround: syncUp doesn't refresh state)
            spinner.text = 'Refreshing workflow state...';
            await syncManager.refreshState();
            spinner.text = 'Pushing new local workflows to n8n...';

            // Collect conflict resolution promises
            const conflictPromises: Promise<void>[] = [];
            const conflictHandler = async (conflict: any) => {
                if (force) {
                    // Auto-resolve: force push (keep local)
                    await syncManager.resolveConflict(conflict.id, conflict.filename, 'local');
                    spinner.info(chalk.yellow(`⚠️  CONFLICT resolved (--force): "${conflict.filename}" - kept local version`));
                } else {
                    const promise = this.handleConflict(conflict, syncManager, spinner, 'push');
                    conflictPromises.push(promise);
                    await promise;
                }
            };
            syncManager.on('conflict', conflictHandler);

            await syncManager.syncUp();
            
            // Wait for all conflict resolutions to complete
            if (conflictPromises.length > 0) {
                spinner.stop();
                console.log(chalk.blue(`⏳ Resolving ${conflictPromises.length} conflict(s)...`));
                await Promise.all(conflictPromises);
            }

            spinner.stop();
            console.log(chalk.green('✔ Push complete.'));
        } catch (e: any) {
            spinner.fail(`Push failed: ${e.message}`);
            process.exit(1);
        }
    }
}
