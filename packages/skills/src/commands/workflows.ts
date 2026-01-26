import { Command } from 'commander';
import chalk from 'chalk';
import { WorkflowRegistry, WorkflowMetadata } from '../services/workflow-registry.js';
import { writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const registry = new WorkflowRegistry();

export function registerWorkflowsCommand(program: Command) {
    const workflows = program
        .command('workflows')
        .description('Search and download n8n workflows from n8nworkflows.xyz');

    // Search command
    workflows
        .command('search <query>')
        .description('Search for workflows')
        .option('-l, --limit <number>', 'Limit number of results', '10')
        .option('--json', 'Output results as JSON')
        .action((query: string, options: { limit: string; json?: boolean }) => {
            const limit = parseInt(options.limit, 10);
            const results = registry.search(query, limit);

            if (options.json) {
                console.log(JSON.stringify(results, null, 2));
                return;
            }

            if (results.length === 0) {
                console.log(chalk.yellow(`No workflows found matching "${query}"`));
                return;
            }

            console.log(chalk.green(`\nFound ${results.length} workflow(s) matching "${query}":\n`));

            results.forEach((workflow, index) => {
                console.log(chalk.bold(`${index + 1}. ${workflow.name}`) + chalk.gray(` (ID: ${workflow.id})`));
                if (workflow.tags.length > 0) {
                    console.log(chalk.cyan(`   Tags: ${workflow.tags.join(', ')}`));
                }
                console.log(chalk.gray(`   Author: ${workflow.author}`));
                if (workflow.description) {
                    console.log(chalk.dim(`   ${workflow.description}`));
                }
                console.log('');
            });

            console.log(chalk.dim(`Run 'n8n-agent workflows info <id>' for more details.`));
        });

    // Info command
    workflows
        .command('info <id>')
        .description('Display detailed information about a workflow')
        .action((id: string) => {
            const workflow = registry.getById(id);

            if (!workflow) {
                console.error(chalk.red(`❌ Workflow with ID "${id}" not found.`));
                process.exit(1);
            }

            console.log(chalk.bold.green(`\n${workflow.name}\n`));
            console.log(chalk.gray('─'.repeat(50)));
            console.log(chalk.cyan('ID:          ') + workflow.id);
            console.log(chalk.cyan('Slug:        ') + workflow.slug);
            console.log(chalk.cyan('Author:      ') + workflow.author);
            console.log(chalk.cyan('Created:     ') + (workflow.createdAt || 'Unknown'));
            console.log(chalk.cyan('Tags:        ') + (workflow.tags.length > 0 ? workflow.tags.join(', ') : 'None'));
            console.log(chalk.cyan('Has Workflow:') + (workflow.hasWorkflow ? chalk.green(' Yes') : chalk.red(' No')));

            if (workflow.description) {
                console.log(chalk.cyan('\nDescription:'));
                console.log(chalk.dim(workflow.description));
            }

            console.log(chalk.cyan('\nRaw URL:'));
            console.log(chalk.blue(registry.getRawUrl(workflow)));
            console.log('');
        });

    // Install command
    workflows
        .command('install <id>')
        .description('Download a workflow JSON file')
        .option('-o, --output <path>', 'Output file path')
        .option('-f, --force', 'Overwrite existing file')
        .action(async (id: string, options: { output?: string; force?: boolean }) => {
            const workflow = registry.getById(id);

            if (!workflow) {
                console.error(chalk.red(`❌ Workflow with ID "${id}" not found.`));
                process.exit(1);
            }

            if (!workflow.hasWorkflow) {
                console.error(chalk.red(`❌ Workflow "${workflow.name}" does not have a workflow.json file.`));
                process.exit(1);
            }

            const outputPath = options.output
                ? resolve(process.cwd(), options.output)
                : resolve(process.cwd(), `${workflow.slug}.json`);

            if (existsSync(outputPath) && !options.force) {
                console.error(chalk.red(`❌ File already exists: ${outputPath}`));
                console.error(chalk.dim('Use --force to overwrite.'));
                process.exit(1);
            }

            const url = registry.getRawUrl(workflow);
            console.log(chalk.blue(`📥 Downloading from: ${url}`));

            try {
                const response = await fetch(url);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.text();
                writeFileSync(outputPath, data, 'utf-8');

                console.log(chalk.green(`✅ Workflow saved to: ${outputPath}`));
            } catch (error) {
                console.error(chalk.red(`❌ Download failed: ${error instanceof Error ? error.message : String(error)}`));
                process.exit(1);
            }
        });

    // List command (bonus)
    workflows
        .command('list')
        .description('List all available workflows')
        .option('-l, --limit <number>', 'Limit number of results', '20')
        .option('--json', 'Output results as JSON')
        .action((options: { limit: string; json?: boolean }) => {
            const limit = parseInt(options.limit, 10);
            const all = registry.getAll();
            const results = all.slice(0, limit);

            if (options.json) {
                console.log(JSON.stringify(results, null, 2));
                return;
            }

            const meta = registry.getMetadata();
            console.log(chalk.green(`\nTotal workflows: ${meta.totalWorkflows}`));
            console.log(chalk.gray(`Index generated: ${new Date(meta.generatedAt).toLocaleString()}\n`));
            console.log(chalk.dim(`Showing first ${results.length} workflows:\n`));

            results.forEach((workflow, index) => {
                console.log(chalk.bold(`${index + 1}. ${workflow.name}`) + chalk.gray(` (ID: ${workflow.id})`));
            });

            if (all.length > limit) {
                console.log(chalk.dim(`\n... and ${all.length - limit} more. Use --limit to see more.`));
            }
        });
}
