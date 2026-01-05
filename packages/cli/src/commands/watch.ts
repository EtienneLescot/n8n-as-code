import { BaseCommand } from './base.js';
import { SyncManager } from '@n8n-as-code/core';
import chokidar from 'chokidar';
import chalk from 'chalk';
import ora from 'ora';

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
                spinner.fail(msg);
            } else if (msg.includes('✅') || msg.includes('✨') || msg.includes('Updated')) {
                spinner.succeed(msg);
                spinner.start('Watching...');
            } else {
                // spinner.info(msg); // Too verbose?
                // Just keep spinner spinning or log info if important
                if (msg.includes('Starting') || msg.includes('Checking')) {
                    spinner.text = msg;
                }
            }
        });

        syncManager.on('error', (err: string) => {
            spinner.fail(chalk.red(err));
            spinner.start('Watching...');
        });

        await syncManager.startWatch();
    }
}
