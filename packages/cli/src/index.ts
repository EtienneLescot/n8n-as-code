#!/usr/bin/env node
import { Command, Option } from 'commander';
import { ListCommand } from './commands/list.js';
import { SyncCommand } from './commands/sync.js';
import { UpdateAiCommand } from './commands/update-ai.js';
import { ConvertCommand } from './commands/convert.js';
import { TestCommand } from './commands/test.js';
import { TestPlanCommand } from './commands/test-plan.js';
import { CredentialCommand } from './commands/credential.js';
import { WorkflowCommand } from './commands/workflow.js';
import { ExecutionCommand } from './commands/execution.js';
import chalk from 'chalk';

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
import { parsePositiveIntegerOption } from './utils/option-parsers.js';
import { spawn } from 'child_process';
import { createN8nManagerFacade } from '@n8n-as-code/manager-adapter';
import { ConfigService } from './services/config-service.js';
import {
    N8N_FACADE_SETUP_MODES,
    isN8nFacadeSetupMode,
    type N8nFacadeSetupMode,
} from '@n8n-as-code/workflow-core';

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

function createManagerFacadeFromOptions(options: { host?: string; apiKey?: string; projectId?: string }) {
    return createN8nManagerFacade({
        n8nHost: options.host || process.env.N8N_HOST,
        n8nApiKey: options.apiKey || process.env.N8N_API_KEY,
        projectId: options.projectId || process.env.N8N_PROJECT_ID,
    });
}

function parseCredentialValues(values: string[] | undefined): Record<string, string> {
    const parsed: Record<string, string> = {};
    for (const value of values ?? []) {
        const separator = value.indexOf('=');
        if (separator <= 0) {
            throw new Error(`Invalid --value "${value}". Expected key=value.`);
        }
        parsed[value.slice(0, separator)] = value.slice(separator + 1);
    }
    return parsed;
}

function printJsonOrText(options: { json?: boolean }, payload: unknown, text: string): void {
    if (options.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
    }
    console.log(text);
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

const getSkillsCliEntry = (): string => {
    try {
        const require = createRequire(import.meta.url);
        const skillsPkg = require.resolve('@n8n-as-code/skills/package.json');
        return join(dirname(skillsPkg), 'dist', 'cli-entry.js');
    } catch {
        const __dirname = dirname(fileURLToPath(import.meta.url));
        return join(__dirname, '..', '..', 'skills', 'dist', 'cli-entry.js');
    }
};

const getFirstPositionalToken = (args: string[], startIndex = 0): string | undefined => {
    for (let index = startIndex; index < args.length; index += 1) {
        const token = args[index];

        if (!token) {
            continue;
        }

        if (token === '--') {
            return args[index + 1];
        }

        if (token === '--instance') {
            index += 1;
            continue;
        }

        if (token.startsWith('--instance=')) {
            continue;
        }

        if (token.startsWith('-')) {
            continue;
        }

        return token;
    }

    return undefined;
};

const getTopLevelCommand = (argv: string[]): string | undefined => getFirstPositionalToken(argv.slice(2));

const shouldLoadSkillsCommands = (argv: string[]): boolean => {
    const topLevelCommand = getTopLevelCommand(argv);

    if (topLevelCommand === 'skills') {
        return true;
    }

    if (topLevelCommand !== 'help') {
        return false;
    }

    const args = argv.slice(2);
    const helpIndex = args.indexOf('help');
    return helpIndex >= 0 && getFirstPositionalToken(args, helpIndex + 1) === 'skills';
};

const registerSkillsPlaceholder = (program: Command): Command => program
    .command('skills')
    .description('AI tools: search nodes, docs, guides, validate workflows, and more');

const loadSkillsRegistrar = async (): Promise<{
    registerSkillsCommands: (program: Command, assetsDir: string) => void;
}> => {
    const modulePath = getSkillsCliEntry();
    return import(pathToFileURL(modulePath).href);
};

const getMcpEntry = (): string => {
    try {
        const require = createRequire(import.meta.url);
        const mcpPkg = require.resolve('@n8n-as-code/mcp/package.json');
        return join(dirname(mcpPkg), 'dist', 'cli.js');
    } catch {
        const __dirname = dirname(fileURLToPath(import.meta.url));
        return join(__dirname, '..', '..', 'mcp', 'dist', 'cli.js');
    }
};

const program = new Command();
program.showSuggestionAfterError(true);
program.showHelpAfterError('(run with --help for usage details)');

program
    .name('n8nac')
    .description('N8N Sync Command Line Interface - Manage n8n workflows as code')
    .version(getVersion())
    .option('--instance <name>', 'Target a specific global n8n-manager instance by name instead of the effective one');

// Inject --instance into the environment only for the lifetime of the command action
// so BaseCommand can pick it up without leaking process-wide state afterwards.
let previousInstanceEnv: string | undefined;

const applyGlobalInstanceOption = () => {
    previousInstanceEnv = process.env.N8NAC_INSTANCE_NAME;
    const globalInstance = program.opts().instance as string | undefined;

    if (globalInstance) {
        process.env.N8NAC_INSTANCE_NAME = globalInstance;
        return;
    }

    if (previousInstanceEnv === undefined) {
        delete process.env.N8NAC_INSTANCE_NAME;
    }
};

const restoreGlobalInstanceOption = () => {
    if (previousInstanceEnv === undefined) {
        delete process.env.N8NAC_INSTANCE_NAME;
    } else {
        process.env.N8NAC_INSTANCE_NAME = previousInstanceEnv;
    }

    previousInstanceEnv = undefined;
};

program.hook('preAction', applyGlobalInstanceOption);
program.hook('postAction', restoreGlobalInstanceOption);

const workspaceProgram = program.command('workspace')
    .description('Manage n8n workspace overrides');

workspaceProgram.command('status')
    .alias('get')
    .description('Show the effective n8n workspace context resolved by the backend')
    .option('--json', 'Output effective workspace context as JSON')
    .action((options) => {
        const configService = new ConfigService();
        const workspaceConfig = configService.getWorkspaceConfig();
        printJsonOrText(
            options,
            workspaceConfig,
            [
                chalk.cyan('\nEffective n8n workspace context:\n'),
                `Instance: ${chalk.bold(workspaceConfig.activeInstanceId || '(none)')}`,
                `Project : ${chalk.bold(workspaceConfig.projectName || workspaceConfig.projectId || '(none)')}`,
                `Sync    : ${chalk.bold(workspaceConfig.workflowDir || workspaceConfig.syncFolder || '(none)')}`,
                '',
            ].join('\n'),
        );
    });

workspaceProgram.command('pin-instance')
    .description('Pin the effective n8n instance for this workspace')
    .requiredOption('--instance-id <id>', 'Global n8n instance ID to pin')
    .option('--json', 'Output workspace config as JSON')
    .action((options) => {
        const configService = new ConfigService();
        const instance = configService.pinWorkspaceInstance(options.instanceId);
        const workspaceConfig = configService.getWorkspaceConfig();
        printJsonOrText(
            options,
            workspaceConfig,
            chalk.green(`✔ Workspace pinned to n8n instance: ${instance.name}`),
        );
    });

workspaceProgram.command('clear-instance')
    .description('Clear the workspace n8n instance pin and fall back to the global active instance')
    .option('--json', 'Output workspace config as JSON')
    .action((options) => {
        const configService = new ConfigService();
        configService.clearWorkspaceInstanceOverride();
        const workspaceConfig = configService.getWorkspaceConfig();
        printJsonOrText(options, workspaceConfig, chalk.green('✔ Workspace instance override cleared.'));
    });

workspaceProgram.command('set-sync-folder')
    .description('Set the n8n sync folder override for this workspace')
    .argument('<path>', 'Workspace sync folder path')
    .option('--json', 'Output workspace config as JSON')
    .action((syncFolder, options) => {
        const configService = new ConfigService();
        configService.setWorkspaceSyncFolder(syncFolder);
        const workspaceConfig = configService.getWorkspaceConfig();
        printJsonOrText(options, workspaceConfig, chalk.green(`✔ Workspace sync folder set to: ${syncFolder}`));
    });

workspaceProgram.command('clear-sync-folder')
    .description('Clear the workspace n8n sync folder override and fall back to the global default')
    .option('--json', 'Output workspace config as JSON')
    .action((options) => {
        const configService = new ConfigService();
        configService.clearWorkspaceSyncFolderOverride();
        const workspaceConfig = configService.getWorkspaceConfig();
        printJsonOrText(options, workspaceConfig, chalk.green('✔ Workspace sync folder override cleared.'));
    });

workspaceProgram.command('set-project')
    .description('Set the n8n project override for this workspace from known project values')
    .requiredOption('--project-id <id>', 'n8n project ID to store in this workspace')
    .requiredOption('--project-name <name>', 'n8n project display name to store in this workspace')
    .option('--json', 'Output workspace config as JSON')
    .action((options) => {
        const configService = new ConfigService();
        configService.setWorkspaceProject({
            projectId: options.projectId,
            projectName: options.projectName,
        });
        const workspaceConfig = configService.getWorkspaceConfig();
        printJsonOrText(options, workspaceConfig, chalk.green(`✔ Workspace project set to: ${options.projectName}`));
    });

workspaceProgram.command('clear-project')
    .description('Clear the workspace n8n project override and fall back to the instance default project')
    .option('--json', 'Output workspace config as JSON')
    .action((options) => {
        const configService = new ConfigService();
        configService.clearWorkspaceProjectOverride();
        const workspaceConfig = configService.getWorkspaceConfig();
        printJsonOrText(options, workspaceConfig, chalk.green('✔ Workspace project override cleared.'));
    });

program.command('setup')
    .description('Choose how this facade should use n8n runtime capabilities')
    .option('--mode <mode>', 'managed-local, connect-existing, or generation-only', 'connect-existing')
    .option('--host <url>', 'Existing n8n URL for connect-existing mode')
    .option('--api-key <key>', 'Existing n8n API key for active credential operations')
    .option('--api-key-stdin', 'Read the n8n API key from stdin')
    .option('--project-id <id>', 'n8n project ID for credential operations')
    .option('--json', 'Output setup result as JSON')
    .action(async (options) => {
        await hydrateApiKeyFromStdin(options);
        const mode = String(options.mode);
        if (!isN8nFacadeSetupMode(mode)) {
            console.error(chalk.red(`❌ Invalid setup mode. Use one of: ${N8N_FACADE_SETUP_MODES.map((item) => item.id).join(', ')}`));
            process.exit(1);
        }

        const facade = createManagerFacadeFromOptions(options);
        const instance = await facade.setup({
            mode: mode as N8nFacadeSetupMode,
            n8nHost: options.host,
            n8nApiKeyRef: options.apiKey ? 'n8nac:provided-api-key' : undefined,
        });

        printJsonOrText(
            options,
            { instance, modes: facade.listSetupModes() },
            [
                chalk.green('✅ n8n facade setup mode saved.'),
                `Mode: ${instance.mode}`,
                instance.baseUrl ? `n8n host: ${instance.baseUrl}` : undefined,
            ].filter(Boolean).join('\n'),
        );
    });

program.command('setup-modes')
    .description('List supported facade setup modes')
    .option('--json', 'Output modes as JSON')
    .action((options) => {
        printJsonOrText(
            options,
            N8N_FACADE_SETUP_MODES,
            N8N_FACADE_SETUP_MODES
                .map((mode) => `${mode.id}\t${mode.label}\n  ${mode.description}`)
                .join('\n'),
        );
    });

const credentialsProgram = program.command('credentials')
    .description('Manage runtime credential readiness through n8n-manager');

credentialsProgram.command('recipes')
    .description('List credential recipes available to all facades')
    .option('--json', 'Output recipes as JSON')
    .action(async (options) => {
        const facade = createManagerFacadeFromOptions({});
        const recipes = await facade.listCredentialRecipes();
        printJsonOrText(
            options,
            recipes,
            recipes.map((recipe) => `${recipe.id}\t${recipe.label}\t${recipe.authMethod}`).join('\n'),
        );
    });

credentialsProgram.command('starter-kits')
    .description('List starter credential kits')
    .option('--json', 'Output starter kits as JSON')
    .action(async (options) => {
        const facade = createManagerFacadeFromOptions({});
        const starterKits = await facade.listStarterKits();
        printJsonOrText(
            options,
            starterKits,
            starterKits.map((kit) => `${kit.id}\t${kit.label}\t${kit.recipeIds.join(', ')}`).join('\n'),
        );
    });

credentialsProgram.command('inventory')
    .description('Show local credential readiness inventory')
    .option('--json', 'Output inventory as JSON')
    .action(async (options) => {
        const facade = createManagerFacadeFromOptions({});
        const inventory = await facade.getCredentialInventory();
        printJsonOrText(
            options,
            inventory,
            inventory.availableCredentials
                .map((item) => `${item.recipeId}\t${item.status}${item.reason ? `\t${item.reason}` : ''}`)
                .join('\n'),
        );
    });

credentialsProgram.command('ensure')
    .description('Create or mark a credential from a shared recipe')
    .argument('<recipeId>', 'Credential recipe ID')
    .option('--host <url>', 'n8n URL for real credential creation')
    .option('--api-key <key>', 'n8n API key for real credential creation')
    .option('--api-key-stdin', 'Read the n8n API key from stdin')
    .option('--project-id <id>', 'n8n project ID')
    .option('--name <name>', 'Credential name')
    .option('--value <key=value...>', 'Credential input value')
    .option('--json', 'Output credential ref as JSON')
    .action(async (recipeId, options) => {
        await hydrateApiKeyFromStdin(options);
        const facade = createManagerFacadeFromOptions(options);
        const credential = await facade.ensureCredential(recipeId, {
            credentialName: options.name,
            values: parseCredentialValues(options.value),
        });
        printJsonOrText(options, credential, `${credential.id}\t${credential.name}\t${credential.type}`);
    });

credentialsProgram.command('starter-kit')
    .description('Bootstrap a shared starter credential kit')
    .argument('<starterKitId>', 'Starter kit ID')
    .option('--host <url>', 'n8n URL for real credential creation')
    .option('--api-key <key>', 'n8n API key for real credential creation')
    .option('--api-key-stdin', 'Read the n8n API key from stdin')
    .option('--project-id <id>', 'n8n project ID')
    .option('--json', 'Output starter kit result as JSON')
    .action(async (starterKitId, options) => {
        await hydrateApiKeyFromStdin(options);
        const facade = createManagerFacadeFromOptions(options);
        const result = await facade.bootstrapStarterKit(starterKitId);
        printJsonOrText(
            options,
            result,
            result.items.map((item) => `${item.recipeId}\t${item.status}${item.reason ? `\t${item.reason}` : ''}`).join('\n'),
        );
    });

credentialsProgram.command('test')
    .description('Test a credential by n8n credential ID or recipe ID')
    .argument('<credentialIdOrRecipeId>', 'Credential ID or recipe ID')
    .option('--host <url>', 'n8n URL for real credential test')
    .option('--api-key <key>', 'n8n API key for real credential test')
    .option('--api-key-stdin', 'Read the n8n API key from stdin')
    .option('--project-id <id>', 'n8n project ID')
    .option('--json', 'Output test result as JSON')
    .action(async (credentialIdOrRecipeId, options) => {
        await hydrateApiKeyFromStdin(options);
        const facade = createManagerFacadeFromOptions(options);
        const result = await facade.testCredential(credentialIdOrRecipeId);
        printJsonOrText(options, result, `${result.credentialId}\t${result.status}${result.message ? `\t${result.message}` : ''}`);
    });

credentialsProgram.command('delete')
    .description('Delete a credential by n8n credential ID or shared recipe ID')
    .argument('<credentialIdOrRecipeId>', 'Credential ID or recipe ID')
    .option('--host <url>', 'n8n URL for real credential deletion')
    .option('--api-key <key>', 'n8n API key for real credential deletion')
    .option('--api-key-stdin', 'Read the n8n API key from stdin')
    .option('--project-id <id>', 'n8n project ID')
    .option('--json', 'Output delete result as JSON')
    .action(async (credentialIdOrRecipeId, options) => {
        await hydrateApiKeyFromStdin(options);
        const facade = createManagerFacadeFromOptions(options);
        const result = await facade.deleteCredential(credentialIdOrRecipeId);
        printJsonOrText(
            options,
            result,
            `${result.credentialId ?? credentialIdOrRecipeId}\tdeletedRemote=${result.deletedRemote}\tdeletedInventory=${result.deletedInventory}`,
        );
    });

// list - Snapshot view of all workflows and their status
program.command('list')
    .description('Display a table of all workflows and their current status (local, remote, or both). By default, only non-archived workflows are shown.')
    .option('--local', 'Show only local workflows')
    .option('--remote', 'Show only remote workflows')
    .option('--distant', 'Alias for --remote')
    .option('--search <query>', 'Filter by workflow name, ID, or local filename (case-insensitive partial match)')
    .option('--sort <mode>', 'Sort by "status" (default) or "name"', 'status')
    .option('--limit <number>', 'Limit the number of returned workflows', (value) => parsePositiveIntegerOption(value, '--limit'))
    .option('--include-archived', 'Include archived workflows in the output')
    .option('--only-archived', 'Show only archived workflows')
    .option('--json', 'Output full JSON instead of a table')
    .addOption(new Option('--raw').hideHelp())
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
            raw: options.json || options.raw,
            search: options.search,
            sort: options.sort,
            limit: options.limit,
            includeArchived: options.includeArchived,
            onlyArchived: options.onlyArchived
        });
    });

program.command('find')
    .description('Find workflows quickly by partial name, workflow ID, or local filename. By default, only non-archived workflows are searched.')
    .argument('<query>', 'Search query')
    .option('--local', 'Show only local workflows')
    .option('--remote', 'Show only remote workflows')
    .option('--distant', 'Alias for --remote')
    .option('--sort <mode>', 'Sort by "status" or "name"', 'name')
    .option('--limit <number>', 'Limit the number of returned workflows', (value) => parsePositiveIntegerOption(value, '--limit'))
    .option('--include-archived', 'Include archived workflows in the search')
    .option('--only-archived', 'Search only archived workflows')
    .option('--json', 'Output full JSON instead of a table')
    .addOption(new Option('--raw').hideHelp())
    .action(async (query, options) => {
        const remote = options.remote || options.distant;
        if (options.sort !== 'status' && options.sort !== 'name') {
            console.error(chalk.red('❌ Invalid sort mode. Use "status" or "name".'));
            process.exit(1);
        }
        await new ListCommand().run({
            local: options.local,
            remote,
            raw: options.json || options.raw,
            search: query,
            sort: options.sort,
            limit: options.limit,
            includeArchived: options.includeArchived,
            onlyArchived: options.onlyArchived
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
    .argument('<path>', 'Path to a local workflow file inside the active sync scope (absolute or relative)')
    .option('--verify', 'After pushing, fetch the workflow from n8n and validate it against the local schema')
    .action(async (pathArg, options) => {
        const cmd = new SyncCommand();
        const workflowId = await cmd.pushOne(pathArg);
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

// test - Trigger a workflow in test mode and report the result
program.command('test')
    .description(
        'Trigger a workflow via its webhook/chat/form URL and report the outcome.\n' +
        'Distinguishes config gaps (Class A: missing credentials/model), runtime state issues\n' +
        '(test webhook not armed / production webhook not registered), and wiring errors\n' +
        '(Class B: bad expressions, wrong field names).\n' +
        'Class A → exit 0 (inform user, do not block).\n' +
        'Runtime state issue → exit 0 (do not edit code blindly).\n' +
        'Class B → exit 1 (fixable, agent should iterate).'
    )
    .argument('<workflowId>', 'Workflow ID to test')
    .option('--prod', 'Call the production webhook URL instead of the test URL')
    .option('--data <json>', 'JSON body to send with the request (for GET/HEAD webhooks this becomes query params unless --query is provided)')
    .option('--query <json>', 'JSON query parameters to send with the request (useful for GET/HEAD webhooks)')
    .addHelpText('after', `
Examples:
  $ n8nac test <workflowId>
  $ n8nac test <workflowId> --data '{"chatInput":"hello"}'
  $ n8nac test <workflowId> --prod --query '{"chatInput":"hello"}'

Notes:
  - For GET/HEAD webhooks, \`--data\` is sent as query parameters for backward compatibility.
  - Prefer \`--query\` when the workflow reads from \`$json.query\` to make the intent explicit.
  - For classic Webhook/Form test URLs, you may need to manually arm the workflow in the n8n editor before the test URL will accept a request.
`)
    .action(async (workflowId, options) => {
        process.exit(await new TestCommand().run(workflowId, options));
    });

program.command('test-plan')
    .description('Inspect how a workflow can be tested via HTTP and infer a suggested payload')
    .argument('<workflowId>', 'Workflow ID to inspect')
    .option('--json', 'Output the test plan as JSON for agents and scripts')
    .action(async (workflowId, options) => {
        process.exit(await new TestPlanCommand().run(workflowId, options));
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

program.command('mcp')
    .description('Start the dedicated n8n-as-code MCP server')
    .option('--cwd <path>', 'Project directory used to resolve n8nac-config.json and n8nac-custom-nodes.json', process.env.N8N_AS_CODE_PROJECT_DIR)
    .action(async (options: { cwd?: string }) => {
        const mcpEntry = getMcpEntry();
        const args = [mcpEntry];
        if (options.cwd) {
            args.push('--cwd', options.cwd);
        }

        const child = spawn(process.execPath, args, {
            cwd: process.cwd(),
            env: process.env,
            stdio: 'inherit',
        });

        child.on('exit', (code, signal) => {
            if (signal) {
                process.kill(process.pid, signal);
                return;
            }
            process.exit(code ?? 1);
        });

        child.on('error', (error) => {
            console.error(chalk.red(`❌ Failed to start MCP server: ${error.message}`));
            process.exit(1);
        });
    });

// workflow - Lifecycle management (activate / deactivate / credential-required)
const workflowCmd = program
    .command('workflow')
    .description('Workflow lifecycle management (activate, deactivate, inspect credentials)');

workflowCmd
    .command('activate')
    .argument('<workflowId>', 'Workflow ID to activate')
    .description('Activate (publish) a workflow so it can be triggered')
    .action(async (workflowId) => {
        await new WorkflowCommand().activate(workflowId);
    });

workflowCmd
    .command('deactivate')
    .argument('<workflowId>', 'Workflow ID to deactivate')
    .description('Deactivate a workflow (stops triggers from firing)')
    .action(async (workflowId) => {
        await new WorkflowCommand().deactivate(workflowId);
    });

workflowCmd
    .command('credential-required')
    .argument('<workflowId>', 'Workflow ID to inspect')
    .description(
        'List credentials required by a workflow and whether they already exist.\n' +
        'Exits 0 if all present, exits 1 if any are missing (agent-friendly).'
    )
    .option('--json', 'Output as JSON array for agent/script consumption')
    .action(async (workflowId, options) => {
        await new WorkflowCommand().credentialRequired(workflowId, { json: options.json });
    });

// execution - Inspect workflow executions
const executionCmd = program
    .command('execution')
    .description('Inspect workflow executions for debugging and post-run diagnosis');

executionCmd
    .command('list')
    .description('List executions, optionally filtered by workflow or status')
    .option('--workflow-id <id>', 'Workflow ID to filter executions by')
    .option('--status <status>', 'Status filter: canceled|crashed|error|new|running|success|unknown|waiting')
    .option('--project-id <id>', 'Project ID to filter executions by')
    .option('--limit <number>', 'Limit the number of returned executions', (value) => parsePositiveIntegerOption(value, '--limit'))
    .option('--cursor <cursor>', 'Pagination cursor from a previous execution list call')
    .option('--include-data', 'Include execution data in list results (large output, usually use execution get instead)')
    .option('--json', 'Output JSON for agents and scripts')
    .addHelpText('after', `
Examples:
  $ n8nac execution list --workflow-id <workflowId> --limit 5
  $ n8nac execution list --workflow-id <workflowId> --status error --json
`)
    .action(async (options) => {
        await new ExecutionCommand().list({
            workflowId: options.workflowId,
            status: options.status,
            projectId: options.projectId,
            limit: options.limit,
            cursor: options.cursor,
            includeData: options.includeData,
            json: options.json,
        });
    });

executionCmd
    .command('get')
    .argument('<id>', 'Execution ID')
    .description('Get a single execution by ID')
    .option('--include-data', 'Include execution run data and workflow details')
    .option('--json', 'Output JSON (default behavior; accepted for script compatibility)')
    .addHelpText('after', `
Examples:
  $ n8nac execution get <executionId>
  $ n8nac execution get <executionId> --include-data --json
`)
    .action(async (id, options) => {
        await new ExecutionCommand().get(id, {
            includeData: options.includeData,
            json: options.json,
        });
    });

// credential - Manage n8n credentials
const credentialCmd = program
    .command('credential')
    .description('Manage n8n credentials (schema introspection, create, list, delete)');

credentialCmd
    .command('schema')
    .argument('<type>', 'Credential type name (e.g. notionApi, slackOAuth2Api, googleApi)')
    .description('Show the JSON schema for a credential type — lists required fields and their types')
    .option('--json', 'Output JSON (default behavior; accepted for script compatibility)')
    .addHelpText('after', `
Examples:
  $ n8nac credential schema openAiApi
  $ n8nac credential schema slackApi --json
`)
    .action(async (typeName, options) => {
        await new CredentialCommand().schema(typeName, { json: options.json });
    });

credentialCmd
    .command('list')
    .description('List all credentials (metadata only, no secrets)')
    .option('--json', 'Output the credential list as JSON for agents and scripts')
    .addHelpText('after', `
Examples:
  $ n8nac credential list
  $ n8nac credential list --json
`)
    .action(async (options) => {
        await new CredentialCommand().list({ json: options.json });
    });

credentialCmd
    .command('get')
    .argument('<id>', 'Credential ID')
    .description('Get credential metadata by ID (no secrets returned)')
    .option('--json', 'Output JSON (default behavior; accepted for script compatibility)')
    .action(async (id, options) => {
        await new CredentialCommand().get(id, { json: options.json });
    });

credentialCmd
    .command('create')
    .description('Create a new credential')
    .requiredOption('--type <type>', 'Credential type name (e.g. notionApi)')
    .requiredOption('--name <name>', 'Display name for the credential')
    .option('--data <json>', 'Credential data as inline JSON string (avoid for secrets — use --file instead)')
    .option('--file <path>', 'Path to JSON file with credential data (preferred over --data)')
    .option('--project-id <id>', 'Project to assign the credential to')
    .option('--json', 'Output created credential metadata as JSON')
    .addHelpText('after', `
Examples:
  $ n8nac credential schema openAiApi
  $ n8nac credential create --type openAiApi --name "My OpenAI" --file cred.json
  $ n8nac credential create --type openAiApi --name "My OpenAI" --file cred.json --json

Notes:
  - Prefer --file over --data to keep secrets out of shell history.
  - Run 'n8nac credential schema <type>' before creating a new credential type.
  - If creation fails, read the returned validation message and change the payload before retrying.
`)
    .action(async (options) => {
        await new CredentialCommand().create({
            type: options.type,
            name: options.name,
            data: options.data,
            file: options.file,
            projectId: options.projectId,
            json: options.json,
        });
    });

credentialCmd
    .command('delete')
    .argument('<id>', 'Credential ID')
    .description('Permanently delete a credential')
    .action(async (id) => {
        await new CredentialCommand().delete(id);
    });

// skills - AI knowledge tools subcommand group
const skillsCmd = registerSkillsPlaceholder(program);

new UpdateAiCommand(program);

if (shouldLoadSkillsCommands(process.argv)) {
    const { registerSkillsCommands } = await loadSkillsRegistrar();
    registerSkillsCommands(skillsCmd, getSkillsAssetsDir());
}

program.parse();
