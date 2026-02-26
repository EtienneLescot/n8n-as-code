#!/usr/bin/env node
import { Command } from 'commander';
import { ListCommand } from './commands/list.js';
import { SyncCommand } from './commands/sync.js';
import { UpdateAiCommand, InitAiCommand } from './commands/init-ai.js';
import { InitCommand } from './commands/init.js';
import { SwitchCommand } from './commands/switch.js';
import { ConvertCommand } from './commands/convert.js';
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

// switch - Switch between projects
new SwitchCommand(program);

// list - Snapshot view of all workflows and their sync status
program.command('list')
    .description('Display a static table of all workflows and their current sync status')
    .option('--local', 'Show only local workflows')
    .option('--remote', 'Show only remote workflows')
    .option('--distant', 'Alias for --remote')
    .action(async (options) => {
        // Combine remote and distant flags
        const remote = options.remote || options.distant;
        await new ListCommand().run({ local: options.local, remote });
    });

// pull - Download a single workflow by ID
program.command('pull')
    .description('Download a single workflow from n8n to local directory')
    .requiredOption('--id <workflowId>', 'Workflow ID to pull')
    .action(async (options) => {
        await new SyncCommand().pullOne(options.id);
    });

// push - Upload a single workflow by ID
program.command('push')
    .description('Upload a single local workflow to n8n')
    .requiredOption('--id <workflowId>', 'Workflow ID to push')
    .action(async (options) => {
        await new SyncCommand().pushOne(options.id);
    });

// fetch - Update remote state cache for a specific workflow
program.command('fetch <workflowId>')
    .description('Fetch remote state for a specific workflow (update internal cache for comparison)')
    .action(async (workflowId) => {
        const syncCommand = new SyncCommand();
        await syncCommand.fetchOne(workflowId);
    });

// convert - Convert workflows between JSON and TypeScript formats
program.command('convert')
    .description('Convert workflows between JSON and TypeScript formats')
    .argument('<file>', 'Path to workflow file (.json or .workflow.ts)')
    .option('-o, --output <path>', 'Output file path')
    .option('-f, --force', 'Overwrite existing output file')
    .option('--format <format>', 'Target format: "json" or "typescript" (auto-detected if not specified)')
    .action(async (file, options) => {
        await new ConvertCommand().run(file, options);
    });

// convert-batch - Batch convert all workflows in a directory
program.command('convert-batch')
    .description('Batch convert all workflows in a directory')
    .argument('<directory>', 'Directory containing workflow files')
    .requiredOption('--format <format>', 'Target format: "json" or "typescript"')
    .option('-f, --force', 'Overwrite existing files')
    .action(async (directory, options) => {
        if (options.format !== 'json' && options.format !== 'typescript') {
            console.error(chalk.red('❌ Invalid format. Use "json" or "typescript"'));
            process.exit(1);
        }
        await new ConvertCommand().batch(directory, options);
    });

// update-ai - Maintenance command to refresh AI Context files
new UpdateAiCommand(program);

// Backward compatibility: keep init-ai as alias
new InitAiCommand(program);

program.parse();
