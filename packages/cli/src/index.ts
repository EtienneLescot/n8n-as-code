#!/usr/bin/env node
import { Command } from 'commander';
import { ListCommand } from './commands/list.js';
import { SyncCommand } from './commands/sync.js';
import { InitAiCommand } from './commands/init-ai.js';
import { InitCommand } from './commands/init.js';
import { SwitchCommand } from './commands/switch.js';
import { ConvertCommand } from './commands/convert.js';
import { TestCommand } from './commands/test.js';
import { TestPlanCommand } from './commands/test-plan.js';
import { CredentialCommand } from './commands/credential.js';
import { WorkflowCommand } from './commands/workflow.js';
import { ExecutionCommand } from './commands/execution.js';
import { registerSkillsCommands } from '@n8n-as-code/skills';
import chalk from 'chalk';

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
import { parsePositiveIntegerOption } from './utils/option-parsers.js';
import { spawn } from 'child_process';

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
    .version(getVersion());

const initCommand = new InitCommand();
const switchCommand = new SwitchCommand(program);

const registerInstanceOptions = (command: Command, options: { includeNewInstance?: boolean } = {}) => {
    command
        .option('--host <url>', 'n8n instance URL')
        .option('--api-key <key>', 'n8n API key (or set N8N_API_KEY)')
        .option('--api-key-stdin', 'Read the n8n API key from stdin')
        .option('--sync-folder <path>', 'Local folder for workflows')
        .option('--instance-name <name>', 'Friendly name for the saved instance');

    if (options.includeNewInstance) {
        command.option('--new-instance', 'Add a new saved config instead of updating the selected one');
    }

    return command
        .option('--project-id <id>', 'Project ID to select non-interactively')
        .option('--project-name <name>', 'Project name to select non-interactively')
        .option('--project-index <number>', '1-based project index to select non-interactively', (value) => parseInt(value, 10))
        .option('--yes', 'Run non-interactively when enough information is available');
};

const instanceProgram = program.command('instance')
    .description('Manage saved n8n instance configs');

registerInstanceOptions(
    instanceProgram.command('add')
        .description('Add and select an existing n8n instance')
).action(async (options) => {
    await hydrateApiKeyFromStdin(options);
    await initCommand.runInstanceCreate(options);
});

registerInstanceOptions(
    instanceProgram.command('create')
        .description('Alias for `n8nac instance add`')
).action(async (options) => {
    await hydrateApiKeyFromStdin(options);
    await initCommand.runInstanceCreate(options);
});

registerInstanceOptions(
    instanceProgram.command('update')
        .description('Update the selected n8n instance config')
).action(async (options) => {
    await hydrateApiKeyFromStdin(options);
    await initCommand.runInstanceUpdate(options);
});

instanceProgram.command('select')
    .description('Select the current n8n instance')
    .option('--instance-id <id>', 'Saved instance config ID to select')
    .option('--instance-name <name>', 'Saved instance config name to select')
    .option('--instance-index <number>', '1-based saved instance index to select', (value) => parsePositiveIntegerOption(value, '--instance-index'))
    .action(async (options) => {
        await switchCommand.runInstanceSwitch(options);
    });

instanceProgram.command('delete')
    .description('Delete a saved n8n instance config')
    .option('--instance-id <id>', 'Saved instance config ID to delete')
    .option('--instance-name <name>', 'Saved instance config name to delete')
    .option('--instance-index <number>', '1-based saved instance index to delete', (value) => parsePositiveIntegerOption(value, '--instance-index'))
    .option('--yes', 'Delete without asking for confirmation')
    .action(async (options) => {
        await switchCommand.runInstanceDeletion(options);
    });

instanceProgram.command('list')
    .description('List saved n8n instance configs')
    .option('--json', 'Output saved instance configs as JSON')
    .action(async (options) => {
        await switchCommand.runInstanceList(options);
    });

// init - Interactive wizard to bootstrap the project, with optional non-interactive flags
registerInstanceOptions(
    program.command('init')
        .description('Alias for `n8nac instance add`')
)
    .action(async (options) => {
        await hydrateApiKeyFromStdin(options);
        await initCommand.runInstanceCreate(options);
    });

program.command('init-auth')
    .description('Save n8n host/API credentials and list available projects')
    .option('--host <url>', 'n8n instance URL')
    .option('--api-key <key>', 'n8n API key (or set N8N_API_KEY)')
    .option('--api-key-stdin', 'Read the n8n API key from stdin')
    .option('--sync-folder <path>', 'Default local folder for workflows')
    .option('--instance-name <name>', 'Friendly name for the saved instance')
    .option('--new-instance', 'Add a new saved config instead of updating the selected one')
    .action(async (options) => {
        await hydrateApiKeyFromStdin(options);
        await initCommand.runAuthSetup(options);
    });

program.command('init-project')
    .description('Select the active n8n project and local sync folder')
    .option('--host <url>', 'n8n instance URL (optional if already saved)')
    .option('--api-key <key>', 'n8n API key (optional if already saved)')
    .option('--api-key-stdin', 'Read the n8n API key from stdin')
    .option('--sync-folder <path>', 'Local folder for workflows')
    .option('--instance-name <name>', 'Friendly name for the saved instance')
    .option('--new-instance', 'Add a new saved config instead of updating the selected one')
    .option('--project-id <id>', 'Project ID to select non-interactively')
    .option('--project-name <name>', 'Project name to select non-interactively')
    .option('--project-index <number>', '1-based project index to select non-interactively', (value) => parseInt(value, 10))
    .option('--yes', 'Run non-interactively when enough information is available')
    .action(async (options) => {
        await hydrateApiKeyFromStdin(options);
        await initCommand.runProjectSetup(options);
    });

// switch - Switch between projects

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
