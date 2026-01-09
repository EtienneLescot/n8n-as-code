#!/usr/bin/env node
import { Command } from 'commander';
import { WatchCommand } from './commands/watch.js';
import { SyncCommand } from './commands/sync.js';
import { InitAiCommand } from './commands/init-ai.js';
import { InitCommand } from './commands/init.js';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Get version from package.json
 * We use a simple approach that works with our build system
 */
const getVersion = () => {
    try {
        // Try to find package.json relative to this file's location in dist
        // In dist, index.js is at packages/cli/dist/index.js
        // package.json is at packages/cli/package.json
        const pkgPath = join(process.cwd(), 'package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        if (pkg.name === '@n8n-as-code/cli') return pkg.version;
        
        // Fallback for different execution contexts
        return '0.1.0';
    } catch {
        return '0.1.0';
    }
};

const program = new Command();

program
    .name('n8n-as-code')
    .description('CLI to synchronize n8n workflows with local files')
    .version(getVersion());

program.command('init')
    .description('Configure your n8n instance and local project')
    .action(async () => {
        await new InitCommand().run();
    });

program.command('watch')
    .description('Start bi-directional synchronization in real-time')
    .action(async () => {
        await new WatchCommand().run();
    });

program.command('pull')
    .description('Download all workflows from n8n to local directory')
    .action(async () => {
        await new SyncCommand().pull();
    });

program.command('push')
    .description('Upload missing local workflows to n8n')
    .action(async () => {
        await new SyncCommand().push();
    });

new InitAiCommand(program);

program.parse();
