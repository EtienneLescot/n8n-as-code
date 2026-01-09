import { BaseCommand } from './base.js';
import { SyncManager } from '@n8n-as-code/core';
import chokidar from 'chokidar';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import path from 'path';

export class WatchCommand extends BaseCommand {
    async run() {
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

        syncManager.on('conflict', async (conflict: any) => {
            spinner.stop();
            console.log(chalk.yellow(`⚠️  CONFLICT detected for "${conflict.filename}"`));
            
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

            spinner.start('Watching...');
        });

        await syncManager.startWatch();
    }
}
