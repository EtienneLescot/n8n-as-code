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
import { parsePositiveIntegerOption } from './utils/option-parsers.js';

async function readSecretFromStdin(): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString('utf8').trim().replace(/^['"]|['"]$/g, '');
}

async function hydrateApiKeyFromStdin(options: { apiKey?: string; apiKeyStdin?: boolean }): Promise<void> {
    if (options.apiKey || !options.apiKeyStdin) {
        return;
    }
    options.apiKey = await readSecretFromStdin();
}

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

// init - Interactive wizard to bootstrap the project, with optional non-interactive flags
program.command('init')
    .description('Bootstrap the project (interactive by default, non-interactive with flags)')
    .option('--host <url>', 'n8n instance URL')
    .option('--api-key <key>', 'n8n API key (or set N8N_API_KEY)')
    .option('--api-key-stdin', 'Read the n8n API key from stdin')
    .option('--sync-folder <path>', 'Local folder for workflows')
    .option('--project-id <id>', 'Project ID to select non-interactively')
    .option('--project-name <name>', 'Project name to select non-interactively')
    .option('--project-index <number>', '1-based project index to select non-interactively', (value) => parseInt(value, 10))
    .option('--yes', 'Run non-interactively when enough information is available')
    .action(async (options) => {
        await hydrateApiKeyFromStdin(options);
        await new InitCommand().run(options);
    });

program.command('init-auth')
    .description('Save n8n host/API credentials and list available projects')
    .option('--host <url>', 'n8n instance URL')
    .option('--api-key <key>', 'n8n API key (or set N8N_API_KEY)')
    .option('--api-key-stdin', 'Read the n8n API key from stdin')
    .option('--sync-folder <path>', 'Default local folder for workflows')
    .action(async (options) => {
        await hydrateApiKeyFromStdin(options);
        await new InitCommand().runAuthSetup(options);
    });

program.command('init-project')
    .description('Select the active n8n project and local sync folder')
    .option('--host <url>', 'n8n instance URL (optional if already saved)')
    .option('--api-key <key>', 'n8n API key (optional if already saved)')
    .option('--api-key-stdin', 'Read the n8n API key from stdin')
    .option('--sync-folder <path>', 'Local folder for workflows')
    .option('--project-id <id>', 'Project ID to select non-interactively')
    .option('--project-name <name>', 'Project name to select non-interactively')
    .option('--project-index <number>', '1-based project index to select non-interactively', (value) => parseInt(value, 10))
    .option('--yes', 'Run non-interactively when enough information is available')
    .action(async (options) => {
        await hydrateApiKeyFromStdin(options);
        await new InitCommand().runProjectSetup(options);
    });

// switch - Switch between projects
new SwitchCommand(program);

// list - Snapshot view of all workflows and their status
program.command('list')
    .description('Display a table of all workflows and their current status (local, remote, or both)')
    .option('--local', 'Show only local workflows')
    .option('--remote', 'Show only remote workflows')
    .option('--distant', 'Alias for --remote')
    .option('--search <query>', 'Filter by workflow name, ID, or local filename (case-insensitive partial match)')
    .option('--sort <mode>', 'Sort by "status" (default) or "name"', 'status')
    .option('--limit <number>', 'Limit the number of returned workflows', (value) => parsePositiveIntegerOption(value, '--limit'))
    .option('--raw', 'Output full JSON instead of a table')
    .action(async (options) => {
        // Combine remote and distant flags
        const remote = options.remote || options.distant;
        if (options.sort !== 'status' && options.sort !== 'name') {
            console.error(chalk.red('❌ Invalid sort mode. Use "status" or "name".'));
            process.exit(1);
        }
        await new ListCommand().run({
            local: options.local,
            remote,
            raw: options.raw,
            search: options.search,
            sort: options.sort,
            limit: options.limit
        });
    });

program.command('find')
    .description('Find workflows quickly by partial name, workflow ID, or local filename')
    .argument('<query>', 'Search query')
    .option('--local', 'Show only local workflows')
    .option('--remote', 'Show only remote workflows')
    .option('--distant', 'Alias for --remote')
    .option('--sort <mode>', 'Sort by "status" or "name"', 'name')
    .option('--limit <number>', 'Limit the number of returned workflows', (value) => parsePositiveIntegerOption(value, '--limit'))
    .option('--raw', 'Output full JSON instead of a table')
    .action(async (query, options) => {
        const remote = options.remote || options.distant;
        if (options.sort !== 'status' && options.sort !== 'name') {
            console.error(chalk.red('❌ Invalid sort mode. Use "status" or "name".'));
            process.exit(1);
        }
        await new ListCommand().run({
            local: options.local,
            remote,
            raw: options.raw,
            search: query,
            sort: options.sort,
            limit: options.limit
        });
    });

// pull - Download a single workflow by ID
program.command('pull')
    .description('Download a single workflow from n8n to local directory')
    .argument('<workflowId>', 'Workflow ID to pull')
    .action(async (workflowId) => {
        await new SyncCommand().pullOne(workflowId);
    });

// push - Upload a single local workflow file to n8n
program.command('push')
    .description('Upload a single local workflow to n8n')
    .argument('<filename>', 'Workflow filename inside the active sync scope')
    .option('--verify', 'After pushing, fetch the workflow from n8n and validate it against the local schema')
    .action(async (filename, options) => {
        const cmd = new SyncCommand();
        const workflowId = await cmd.pushOne(filename);
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
