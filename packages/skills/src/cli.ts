#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { NodeSchemaProvider } from './services/node-schema-provider.js';
import { WorkflowValidator } from './services/workflow-validator.js';
import { DocsProvider } from './services/docs-provider.js';
import { KnowledgeSearch } from './services/knowledge-search.js';
import { AiContextGenerator } from './services/ai-context-generator.js';
import { SnippetGenerator } from './services/snippet-generator.js';
import { registerWorkflowsCommand } from './commands/workflows.js';
import fs, { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname for ESM and CJS (bundled)
const _filename = typeof import.meta !== 'undefined' && import.meta.url
    ? fileURLToPath(import.meta.url)
    : (typeof __filename !== 'undefined' ? __filename : '');

const _dirname = typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(_filename as string);

const getVersion = () => {
    try {
        const pkgPath = join(_dirname, '../package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        return pkg.version;
    } catch {
        return '0.1.0';
    }
};

const getAssetsDir = () => {
    if (process.env.N8N_AS_CODE_ASSETS_DIR) {
        return process.env.N8N_AS_CODE_ASSETS_DIR;
    }

    // Fallback 1: subfolder assets (Standard NPM install: dist/cli.js + dist/assets/ OR dev: src/cli.ts + src/assets/)
    const localAssets = join(_dirname, 'assets');
    if (fs.existsSync(join(localAssets, 'n8n-docs-complete.json'))) {
        return localAssets;
    }

    // Fallback 2: parent's sibling assets (VS Code Extension: out/agent-cli/cli.js -> assets/)
    return join(_dirname, '../../assets');
};

const assetsDir = getAssetsDir();
const program = new Command();
const provider = new NodeSchemaProvider(join(assetsDir, 'n8n-nodes-technical.json'));
const docsProvider = new DocsProvider(join(assetsDir, 'n8n-docs-complete.json'));
const knowledgeSearch = new KnowledgeSearch(join(assetsDir, 'n8n-knowledge-index.json'));

program
    .name('n8n-agent')
    .description('AI Agent Tools for accessing n8n documentation')
    .version(getVersion());

// 1. Search - Unified search with hints
program
    .command('search')
    .description('Search for n8n nodes and documentation')
    .argument('<query>', 'Search query (e.g. "google sheets", "ai agents")')
    .option('--category <category>', 'Filter by category')
    .option('--type <type>', 'Filter by type (node or documentation)')
    .option('--limit <limit>', 'Limit results', '10')
    .action((query, options) => {
        try {
            const results = knowledgeSearch.searchAll(query, {
                category: options.category,
                type: options.type,
                limit: parseInt(options.limit)
            });

            console.log(JSON.stringify(results, null, 2));

            // Print hints to stderr so they don't interfere with JSON parsing
            if (results.hints && results.hints.length > 0) {
                console.error(chalk.cyan('\n💡 Hints:'));
                results.hints.forEach(hint => console.error(chalk.gray(`   ${hint}`)));
            }
        } catch (error: any) {
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

// 2. Get Full Details - With hints
program
    .command('get')
    .description('Get complete node information (schema + documentation + guides)')
    .argument('<name>', 'Node name (exact, e.g. "googleSheets")')
    .action((name) => {
        try {
            const schema = provider.getNodeSchema(name);
            if (schema) {
                console.log(JSON.stringify(schema, null, 2));

                // Add helpful hints to stderr
                console.error(chalk.cyan('\n💡 Next steps:'));
                console.error(chalk.gray(`   - 'schema ${name}' for quick parameter reference`));
                console.error(chalk.gray(`   - 'guides ${name}' to find usage guides`));
                console.error(chalk.gray(`   - 'related ${name}' to discover similar nodes`));
                console.error(chalk.gray(`   - 'docs <title>' to read full documentation`));
            } else {
                console.error(chalk.red(`Node '${name}' not found.`));
                process.exit(1);
            }
        } catch (error: any) {
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

// 3. List All
program
    .command('list')
    .description('List available nodes and documentation categories')
    .option('--nodes', 'List all node names')
    .option('--docs', 'List all documentation categories')
    .action((options) => {
        try {
            const nodes = provider.listAllNodes();
            const stats = docsProvider.getStatistics();

            if (options.nodes) {
                console.log(JSON.stringify(nodes, null, 2));
                return;
            }
            if (options.docs) {
                const categories = docsProvider.getCategories();
                console.log(JSON.stringify(categories, null, 2));
                return;
            }

            console.log(JSON.stringify({
                summary: {
                    totalNodes: nodes.length,
                    totalDocPages: stats?.totalPages || 0,
                    docCategories: stats?.byCategory || {}
                },
                hint: "Use --nodes or --docs for full lists"
            }, null, 2));
        } catch (error: any) {
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

// 4. Validate Workflow
program
    .command('validate')
    .description('Validate a workflow JSON file')
    .argument('<file>', 'Path to workflow JSON file')
    .option('--strict', 'Treat warnings as errors')
    .action((file, options) => {
        try {
            const workflowContent = readFileSync(file, 'utf8');
            const workflow = JSON.parse(workflowContent);

            const validator = new WorkflowValidator();
            const result = validator.validateWorkflow(workflow);

            // Print errors
            if (result.errors.length > 0) {
                console.log(chalk.red.bold(`\n❌ Errors (${result.errors.length}):\n`));
                for (const error of result.errors) {
                    const location = error.nodeName
                        ? ` [${error.nodeName}]`
                        : error.nodeId
                            ? ` [${error.nodeId}]`
                            : '';
                    console.log(chalk.red(`  • ${error.message}${location}`));
                    if (error.path) {
                        console.log(chalk.gray(`    Path: ${error.path}`));
                    }
                }
            }

            // Print warnings
            if (result.warnings.length > 0) {
                console.log(chalk.yellow.bold(`\n⚠️  Warnings (${result.warnings.length}):\n`));
                for (const warning of result.warnings) {
                    const location = warning.nodeName
                        ? ` [${warning.nodeName}]`
                        : warning.nodeId
                            ? ` [${warning.nodeId}]`
                            : '';
                    console.log(chalk.yellow(`  • ${warning.message}${location}`));
                    if (warning.path) {
                        console.log(chalk.gray(`    Path: ${warning.path}`));
                    }
                }
            }

            // Summary
            console.log('');
            if (result.valid && result.warnings.length === 0) {
                console.log(chalk.green.bold('✅ Workflow is valid!'));
                process.exit(0);
            } else if (result.valid && result.warnings.length > 0) {
                if (options.strict) {
                    console.log(chalk.red.bold('❌ Validation failed (strict mode - warnings treated as errors)'));
                    process.exit(1);
                } else {
                    console.log(chalk.yellow.bold('⚠️  Workflow is valid but has warnings'));
                    process.exit(0);
                }
            } else {
                console.log(chalk.red.bold('❌ Workflow validation failed'));
                process.exit(1);
            }
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                console.error(chalk.red(`File not found: ${file}`));
            } else if (error instanceof SyntaxError) {
                console.error(chalk.red(`Invalid JSON: ${error.message}`));
            } else {
                console.error(chalk.red(error.message));
            }
            process.exit(1);
        }
    });

// 5. Docs - Access documentation
program
    .command('docs')
    .description('Access n8n documentation (DEPRECATED: Use search instead)')
    .argument('[title]', 'Documentation page title')
    .option('--search <query>', 'Search documentation (Deprecated: Use search command)')
    .option('--list', 'List all categories')
    .option('--category <category>', 'Filter by category')
    .action((title, options) => {
        try {
            if (options.list) {
                const categories = docsProvider.getCategories();
                console.log(JSON.stringify(categories, null, 2));
            } else if (options.search) {
                console.error(chalk.yellow('⚠️  docs --search is deprecated. Using search command instead.\n'));
                const results = knowledgeSearch.searchAll(options.search, {
                    category: options.category,
                    type: 'documentation'
                });
                console.log(JSON.stringify(results.results, null, 2));
                console.error(chalk.cyan('\n💡 Hint: Use \'docs "<title>"\' to read a full page'));
            } else if (title) {
                const page = docsProvider.getDocPageByTitle(title);
                if (page) {
                    console.log(JSON.stringify(page, null, 2));
                } else {
                    console.error(chalk.red(`Documentation page '${title}' not found.`));
                    process.exit(1);
                }
            } else {
                const stats = docsProvider.getStatistics();
                console.log(JSON.stringify(stats, null, 2));
            }
        } catch (error: any) {
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

// 6. Schema - Get technical schema only (fast)
program
    .command('schema')
    .description('Get technical schema for a node (parameters only)')
    .argument('<name>', 'Node name')
    .action((name) => {
        try {
            let schema = provider.getNodeSchema(name);

            // Search fallback if exact match fails
            if (!schema) {
                const searchResults = provider.searchNodes(name, 1);
                if (searchResults.length > 0 && ((searchResults[0].relevanceScore || 0) > 80 || searchResults[0].name.toLowerCase() === name.toLowerCase())) {
                    schema = provider.getNodeSchema(searchResults[0].name);
                }
            }

            if (schema) {
                const props = Array.isArray(schema.schema?.properties) ? schema.schema.properties : [];
                const technicalSchema = {
                    name: schema.name,
                    type: schema.type,
                    displayName: schema.displayName,
                    description: schema.description,
                    version: schema.version,
                    properties: props,
                    requiredFields: [...new Set(props.filter((p: any) => p.required).map((p: any) => p.name))]
                };
                console.log(JSON.stringify(technicalSchema, null, 2));
                console.error(chalk.cyan('\n💡 Hint: Use \'get ' + schema.name + '\' for complete documentation and guides'));
            } else {
                console.error(chalk.red(`Node '${name}' not found.`));
                console.error(chalk.yellow(`Try running: './n8n-agent search "${name}"' to find the correct node name.`));
                process.exit(1);
            }
        } catch (error: any) {
            console.error(chalk.red('Error getting schema: ' + error.message));
            process.exit(1);
        }
    });

// 7. Guides - Find guides and tutorials
program
    .command('guides')
    .description('Find helpful guides, tutorials, and walkthroughs')
    .argument('[query]', 'Search query')
    .option('--list', 'List all guides')
    .option('--limit <limit>', 'Limit results', '10')
    .action((query, options) => {
        try {
            const guides = docsProvider.getGuides(query, parseInt(options.limit));
            console.log(JSON.stringify(guides, null, 2));

            if (guides.length > 0) {
                console.error(chalk.cyan('\n💡 Hint: Use \'docs "<title>"\' to read the full guide'));
            }
        } catch (error: any) {
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

// 8. Related - Find related resources
program
    .command('related')
    .description('Find related nodes and documentation')
    .argument('<query>', 'Node name or concept')
    .action((query) => {
        try {
            // Try as node first
            const nodeSchema = provider.getNodeSchema(query);
            if (nodeSchema) {
                const nodeDocs = docsProvider.getNodeDocumentation(query);
                const related = docsProvider.findRelated(nodeDocs[0]?.id || '', 10);

                console.log(JSON.stringify({
                    source: { type: 'node', name: query, displayName: nodeSchema.displayName },
                    documentation: nodeDocs.map((d: any) => ({ id: d.id, title: d.title, url: d.url })),
                    relatedPages: related.map((r: any) => ({ id: r.id, title: r.title, category: r.category }))
                }, null, 2));
            } else {
                // Search in docs
                const docs = docsProvider.searchDocs(query, { limit: 5 });
                console.log(JSON.stringify({
                    source: { type: 'concept', query },
                    relatedPages: docs.map((d: any) => ({ id: d.id, title: d.title, category: d.category, url: d.url }))
                }, null, 2));
            }

            console.error(chalk.cyan('\n💡 Hints:'));
            console.error(chalk.gray('   - Use \'get <nodeName>\' for complete node information'));
            console.error(chalk.gray('   - Use \'docs <title>\' to read documentation pages'));
        } catch (error: any) {
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

// 9. Update AI Context
program
    .command('update-ai')
    .description('Update AI Context (AGENTS.md, rule files, snippets)')
    .option('--n8n-version <version>', 'n8n version', 'Unknown')
    .action(async (options) => {
        try {
            console.error(chalk.blue('🤖 Updating AI Context...'));
            const projectRoot = process.cwd();

            const aiContextGenerator = new AiContextGenerator();
            await aiContextGenerator.generate(projectRoot, options.n8nVersion);

            const snippetGen = new SnippetGenerator();
            await snippetGen.generate(projectRoot);

            console.error(chalk.green('✅ AI Context updated successfully!'));
        } catch (error: any) {
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

// Register workflows command
registerWorkflowsCommand(program);

program.parse(process.argv);
