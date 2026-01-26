#!/usr/bin/env node
import { Command } from 'commander';
import { StartCommand } from './commands/start.js';
import { ListCommand } from './commands/list.js';
import { SyncCommand } from './commands/sync.js';
import { UpdateAiCommand, InitAiCommand } from './commands/init-ai.js';
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
    .name('n8nac')
    .description('N8N Sync Command Line Interface - Manage n8n workflows as code')
    .version(getVersion());

// init - Interactive wizard to bootstrap the project
program.command('init')
    .description('Interactive wizard to bootstrap the project')
    .action(async () => {
        await new InitCommand().run();
    });

// list - Snapshot view of all workflows and their sync status
program.command('list')
    .description('Display a static table of all workflows and their current sync status')
    .action(async () => {
        await new ListCommand().run();
    });

// start - Main monitoring command with auto or manual mode
program.command('start')
    .description('Start monitoring with live UI (auto-sync by default, use --manual for interactive prompts)')
    .option('--manual', 'Enable manual mode with interactive prompts for all actions')
    .action(async (options) => {
        await new StartCommand().run(options);
    });

// pull - One-off command to download workflows from Remote to Local
program.command('pull')
    .description('Download workflows from n8n to local directory')
    .option('--force', 'Skip conflict checks, overwrite local files')
    .action(async (options) => {
        await new SyncCommand().pull(options.force || false);
    });

// push - One-off command to upload workflows from Local to Remote
program.command('push')
    .description('Upload local workflows to n8n')
    .option('--force', 'Skip conflict checks, overwrite remote workflows')
    .action(async (options) => {
        await new SyncCommand().push(options.force || false);
    });

// update-ai - Maintenance command to refresh AI Context files
new UpdateAiCommand(program);

// Backward compatibility: keep init-ai as alias
new InitAiCommand(program);

program.parse();
