#!/usr/bin/env node
import { Command } from 'commander';
import { ListCommand } from './commands/list.js';
import { SyncCommand } from './commands/sync.js';
import { InitAiCommand } from './commands/init-ai.js';
import { InitCommand } from './commands/init.js';
import { SwitchCommand } from './commands/switch.js';
import { ConvertCommand } from './commands/convert.js';
import { registerSkillsCommands } from '@n8n-as-code/skills';
import chalk from 'chalk';

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

/**
 * Get version from package.json
 */
const getVersion = () => {
    try {
        const __dirname = dirname(fileURLToPath(import.meta.url));
        // In dist, index.js is at packages/cli/dist/index.js
        // package.json is at packages/cli/package.json
        const pkgPath = join(__dirname, '..', 'package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        return pkg.version || '0.1.0-unknown';
    } catch {
        return '0.1.0-error';
    }
};

/**
 * Resolve the skills assets directory bundled with @n8n-as-code/skills
 */
const getSkillsAssetsDir = (): string => {
    // Allow override via environment
    if (process.env.N8N_AS_CODE_ASSETS_DIR) {
        return process.env.N8N_AS_CODE_ASSETS_DIR;
    }
    try {
        const require = createRequire(import.meta.url);
        const skillsPkg = require.resolve('@n8n-as-code/skills/package.json');
        return join(dirname(skillsPkg), 'dist', 'assets');
    } catch {
        // Fallback: skills lives next to cli in a monorepo
        const __dirname = dirname(fileURLToPath(import.meta.url));
        return join(__dirname, '..', '..', 'skills', 'dist', 'assets');
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

// list - Snapshot view of all workflows and their status
program.command('list')
    .description('Display a table of all workflows and their current status (local, remote, or both)')
    .option('--local', 'Show only local workflows')
    .option('--remote', 'Show only remote workflows')
    .option('--distant', 'Alias for --remote')
    .option('--raw', 'Output full JSON instead of a table')
    .action(async (options) => {
        // Combine remote and distant flags
        const remote = options.remote || options.distant;
        await new ListCommand().run({ local: options.local, remote, raw: options.raw });
    });

// pull - Download a single workflow by ID
program.command('pull')
    .description('Download a single workflow from n8n to local directory')
    .argument('<workflowId>', 'Workflow ID to pull')
    .action(async (workflowId) => {
        await new SyncCommand().pullOne(workflowId);
    });

// push - Upload a single workflow by ID, or a brand-new local file by filename
program.command('push')
    .description('Upload a single local workflow to n8n')
    .argument('[workflowId]', 'Workflow ID to push (omit for brand-new files)')
    .option('--filename <filename>', 'Filename to push (use only if no workflowId)')
    .option('--verify', 'After pushing, fetch the workflow from n8n and validate it against the local schema')
    .action(async (workflowId, options) => {
        if (!workflowId && !options.filename) {
            console.error(chalk.red('❌ Provide a workflow ID or --filename <name> for new files.'));
            process.exit(1);
        }
        const cmd = new SyncCommand();
        await cmd.pushOne(workflowId, options.filename);
        if (options.verify && workflowId) {
            console.log(chalk.dim('\n── Post-push verification ──────────────────────────────'));
            const ok = await cmd.verifyRemote(workflowId);
            if (!ok) process.exit(1);
        }
    });

// verify - Fetch a workflow from n8n and validate it against the local node schema
program.command('verify')
    .description('Fetch a workflow from n8n and validate its nodes against the local schema (detects invalid typeVersion, bad operation values, missing required params)')
    .argument('<workflowId>', 'Workflow ID to verify')
    .action(async (workflowId) => {
        const ok = await new SyncCommand().verifyRemote(workflowId);
        if (!ok) process.exit(1);
    });

// fetch - Update remote state cache for a specific workflow
program.command('fetch')
    .description('Fetch remote state for a specific workflow (update internal cache for comparison)')
    .argument('<workflowId>', 'Workflow ID to fetch')
    .action(async (workflowId) => {
        const syncCommand = new SyncCommand();
        await syncCommand.fetchOne(workflowId);
    });

// resolve - Resolve a conflict for a specific workflow
program.command('resolve')
    .description('Resolve a conflict for a specific workflow')
    .argument('<workflowId>', 'Workflow ID to resolve')
    .requiredOption('--mode <mode>', 'Resolution mode: "keep-current" (local) or "keep-incoming" (remote)')
    .action(async (workflowId, options) => {
        if (options.mode !== 'keep-current' && options.mode !== 'keep-incoming') {
            console.error(chalk.red('❌ Invalid mode. Use "keep-current" or "keep-incoming"'));
            process.exit(1);
        }
        await new SyncCommand().resolveOne(workflowId, options.mode);
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

// skills - AI knowledge tools subcommand group
const skillsCmd = program
    .command('skills')
    .description('AI tools: search nodes, docs, guides, validate workflows, and more');
registerSkillsCommands(skillsCmd, getSkillsAssetsDir());

// Backward compatibility alias
new InitAiCommand(program);
const updateAiCommand = program.commands.find((cmd) => cmd.name() === 'update-ai');
if (updateAiCommand && !updateAiCommand.aliases().includes('init-ai')) {
    updateAiCommand.alias('init-ai');
}

program.parse();
