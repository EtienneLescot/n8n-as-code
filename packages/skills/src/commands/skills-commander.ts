/**
 * skills-commander.ts
 *
 * Registers all `n8nac skills` subcommands on a given Commander program.
 * Called directly by the standalone `n8nac-skills` binary (cli.ts) **and** by
 * the unified `n8nac` CLI via `packages/cli/src/index.ts`.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { NodeSchemaProvider } from '../services/node-schema-provider.js';
import { WorkflowValidator } from '../services/workflow-validator.js';
import { DocsProvider } from '../services/docs-provider.js';
import { KnowledgeSearch } from '../services/knowledge-search.js';
import { AiContextGenerator } from '../services/ai-context-generator.js';
import { TypeScriptFormatter } from '../services/typescript-formatter.js';
import { WorkflowRegistry } from '../services/workflow-registry.js';
import { startSkillsMcpServer } from '../services/mcp-server.js';
import { resolveCustomNodesConfig, type CustomNodesResolution } from '../services/custom-nodes-config.js';
import { JsonToAstParser, AstToTypeScriptGenerator } from '@n8n-as-code/transformer';
import fs, { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { join } from 'path';

export { resolveCustomNodesConfig, type CustomNodesResolution } from '../services/custom-nodes-config.js';

function printCustomNodesWarnings(customNodesConfig: CustomNodesResolution): void {
    if (customNodesConfig.warnings.length === 0) {
        return;
    }

    console.error(chalk.yellow('\nCustom nodes configuration warnings:'));
    customNodesConfig.warnings.forEach((warning) => {
        console.error(chalk.yellow(`- ${warning}`));
    });
}

function printCustomNodesDebugInfo(customNodesConfig: CustomNodesResolution, provider: NodeSchemaProvider): void {
    console.error(JSON.stringify({
        customNodes: {
            resolution: customNodesConfig,
            provider: provider.getDiagnostics()
        }
    }, null, 2));
}

function printSearchCustomNodesNote(customNodesConfig: CustomNodesResolution, query: string, resultCount: number): void {
    if (!customNodesConfig.resolvedPath || resultCount > 0) {
        return;
    }

    console.error(chalk.cyan('\nCustom nodes note:'));
    console.error(chalk.gray(`- Loaded custom nodes from ${customNodesConfig.resolvedPath}`));
    console.error(chalk.gray(`- 'skills search' only uses the prebuilt knowledge index, so sidecar-only nodes such as "${query}" will not appear here.`));
    console.error(chalk.gray(`- Use 'skills list --nodes --debug' or 'skills node-info ${query} --debug' to confirm the node was merged.`));
}

export function registerSkillsCommands(program: Command, assetsDir: string): void {
    const customNodesConfig = resolveCustomNodesConfig();
    const customNodesPath = customNodesConfig.resolvedPath;
    const provider = new NodeSchemaProvider(join(assetsDir, 'n8n-nodes-technical.json'), customNodesPath);
    const docsProvider = new DocsProvider(join(assetsDir, 'n8n-docs-complete.json'));
    const knowledgeSearch = new KnowledgeSearch(join(assetsDir, 'n8n-knowledge-index.json'));
    let registry: WorkflowRegistry | undefined;
    const getRegistry = (): WorkflowRegistry => {
        if (!registry) {
            registry = new WorkflowRegistry();
        }
        return registry;
    };

    // ── search ────────────────────────────────────────────────────────────────
    program
        .command('search')
        .description('Search for n8n nodes and documentation')
        .argument('<query>', 'Search query (e.g. "google sheets", "ai agents")')
        .option('--category <category>', 'Filter by category')
        .option('--type <type>', 'Filter by type (node or documentation)')
        .option('--limit <limit>', 'Limit results', '10')
        .option('--debug', 'Show custom nodes resolution details on stderr')
        .option('--json', 'Output as JSON instead of TypeScript')
        .action((query, options) => {
            try {
                printCustomNodesWarnings(customNodesConfig);
                if (options.debug) {
                    try {
                        printCustomNodesDebugInfo(customNodesConfig, provider);
                    } catch (diagnosticsError: any) {
                        console.error(
                            chalk.yellow(
                                'Warning: failed to load custom nodes diagnostics for --debug output.',
                            ),
                        );
                        if (diagnosticsError && diagnosticsError.message) {
                            console.error(chalk.gray(diagnosticsError.message));
                        }
                    }
                }

                const results = knowledgeSearch.searchAll(query, {
                    category: options.category,
                    type: options.type,
                    limit: parseInt(options.limit)
                });

                if (options.json) {
                    console.log(JSON.stringify(results, null, 2));
                } else {
                    const nodeResults = results.results.filter((r: any) => r.type === 'node');
                    const docResults = results.results.filter((r: any) => r.type !== 'node');

                    if (nodeResults.length > 0) {
                        console.log('// === NODE RESULTS ===\n');
                        console.log(TypeScriptFormatter.formatSearchResults(nodeResults.map((r: any) => ({
                            name: r.name || r.id,
                            type: r.id,
                            displayName: r.displayName || r.title || r.name || '',
                            description: r.description || r.excerpt || '',
                            version: 1
                        }))));
                    }

                    if (docResults.length > 0) {
                        console.log('\n// === DOCUMENTATION & EXAMPLES ===\n');
                        docResults.forEach((result: any, index: number) => {
                            console.log(`// ${index + 1}. ${result.title || result.displayName}`);
                            console.log(`//    ${result.description || result.excerpt || ''}`);
                            if (result.url) console.log(`//    URL: ${result.url}`);
                            console.log('');
                        });
                    }
                }

                printSearchCustomNodesNote(customNodesConfig, query, results.results.length);

                if (results.hints && results.hints.length > 0) {
                    console.error(chalk.cyan('\n💡 Hints:'));
                    results.hints.forEach((hint: string) => console.error(chalk.gray(`   ${hint}`)));
                }
            } catch (error: any) {
                console.error(chalk.red(error.message));
                process.exit(1);
            }
        });

    // ── list ──────────────────────────────────────────────────────────────────
    program
        .command('list')
        .description('List available nodes, documentation categories, or guides')
        .option('--nodes', 'List all node names')
        .option('--docs', 'List all documentation categories')
        .option('--guides', 'List all available guides')
        .option('--debug', 'Show custom nodes resolution details on stderr')
        .action((options) => {
            try {
                printCustomNodesWarnings(customNodesConfig);
                if (options.debug) {
                    printCustomNodesDebugInfo(customNodesConfig, provider);
                }

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
                if (options.guides) {
                    const guides = docsProvider.getGuides(undefined, 100);
                    console.log(JSON.stringify(guides, null, 2));
                    return;
                }

                console.log(JSON.stringify({
                    summary: {
                        totalNodes: nodes.length,
                        totalDocPages: stats?.totalPages || 0,
                        docCategories: stats?.byCategory || {}
                    },
                    hint: 'Use --nodes, --docs, or --guides for full lists'
                }, null, 2));
            } catch (error: any) {
                console.error(chalk.red(error.message));
                process.exit(1);
            }
        });

    // ── node-info ─────────────────────────────────────────────────────────────
    program
        .command('node-info')
        .description('Get complete node information as TypeScript code')
        .argument('<name>', 'Node name (exact, e.g. "googleSheets")')
        .option('--debug', 'Show custom nodes resolution details on stderr')
        .option('--json', 'Output as JSON instead of TypeScript')
        .action((name, options) => {
            try {
                printCustomNodesWarnings(customNodesConfig);
                if (options.debug) {
                    printCustomNodesDebugInfo(customNodesConfig, provider);
                }

                const schema = provider.getNodeSchema(name);
                if (schema) {
                    if (options.json) {
                        console.log(JSON.stringify(schema, null, 2));
                    } else {
                        const tsDoc = TypeScriptFormatter.generateCompleteNodeDoc({
                            name: schema.name,
                            type: schema.type,
                            displayName: schema.displayName,
                            description: schema.description,
                            version: schema.version,
                            properties: schema.schema?.properties || [],
                            metadata: schema.metadata
                        });
                        console.log(tsDoc);
                    }
                    console.error(chalk.cyan('\n💡 Next steps:'));
                    console.error(chalk.gray(`   - 'node-schema ${name}' for quick TypeScript snippet`));
                    console.error(chalk.gray(`   - 'guides ${name}' to find usage guides`));
                    console.error(chalk.gray(`   - 'related ${name}' to discover similar nodes`));
                } else {
                    console.error(chalk.red(`Node '${name}' not found.`));
                    process.exit(1);
                }
            } catch (error: any) {
                console.error(chalk.red(error.message));
                process.exit(1);
            }
        });

    // ── node-schema ───────────────────────────────────────────────────────────
    program
        .command('node-schema')
        .description('Get TypeScript code snippet for a node (quick reference)')
        .argument('<name>', 'Node name')
        .option('--debug', 'Show custom nodes resolution details on stderr')
        .option('--json', 'Output as JSON instead of TypeScript')
        .action((name, options) => {
            try {
                printCustomNodesWarnings(customNodesConfig);
                if (options.debug) {
                    printCustomNodesDebugInfo(customNodesConfig, provider);
                }

                let schema = provider.getNodeSchema(name);

                if (!schema) {
                    const searchResults = provider.searchNodes(name, 1);
                    if (searchResults.length > 0 && ((searchResults[0].relevanceScore || 0) > 80 || searchResults[0].name.toLowerCase() === name.toLowerCase())) {
                        schema = provider.getNodeSchema(searchResults[0].name);
                    }
                }

                if (schema) {
                    if (options.json) {
                        const props = Array.isArray(schema.schema?.properties) ? schema.schema.properties : [];
                        console.log(JSON.stringify({
                            name: schema.name,
                            type: schema.type,
                            displayName: schema.displayName,
                            description: schema.description,
                            version: schema.version,
                            properties: props,
                            requiredFields: [...new Set(props.filter((p: any) => p.required).map((p: any) => p.name))]
                        }, null, 2));
                    } else {
                        const tsSnippet = TypeScriptFormatter.generateNodeSnippet({
                            name: schema.name,
                            type: schema.type,
                            displayName: schema.displayName,
                            description: schema.description,
                            version: schema.version,
                            properties: schema.schema?.properties || []
                        });
                        console.log(tsSnippet);
                    }
                    console.error(chalk.cyan(`\n💡 Hint: Use 'node-info ${schema.name}' for complete documentation and examples`));
                } else {
                    console.error(chalk.red(`Node '${name}' not found.`));
                    process.exit(1);
                }
            } catch (error: any) {
                console.error(chalk.red('Error getting schema: ' + error.message));
                process.exit(1);
            }
        });

    // ── docs ──────────────────────────────────────────────────────────────────
    program
        .command('docs')
        .description('Access n8n documentation pages')
        .argument('[title]', 'Documentation page title')
        .option('--list', 'List all categories')
        .option('--category <category>', 'Filter by category')
        .action((title, options) => {
            try {
                if (options.list) {
                    console.log(JSON.stringify(docsProvider.getCategories(), null, 2));
                } else if (title) {
                    const page = docsProvider.getDocPageByTitle(title);
                    if (page) {
                        console.log(JSON.stringify(page, null, 2));
                    } else {
                        console.error(chalk.red(`Documentation page '${title}' not found.`));
                        process.exit(1);
                    }
                } else {
                    console.log(JSON.stringify(docsProvider.getStatistics(), null, 2));
                }
            } catch (error: any) {
                console.error(chalk.red(error.message));
                process.exit(1);
            }
        });

    // ── guides ────────────────────────────────────────────────────────────────
    program
        .command('guides')
        .description('Find workflow guides, tutorials, and walkthroughs')
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

    // ── related ───────────────────────────────────────────────────────────────
    program
        .command('related')
        .description('Find related nodes and documentation')
        .argument('<query>', 'Node name or concept')
        .action((query) => {
            try {
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
                    const docs = docsProvider.searchDocs(query, { limit: 5 });
                    console.log(JSON.stringify({
                        source: { type: 'concept', query },
                        relatedPages: docs.map((d: any) => ({ id: d.id, title: d.title, category: d.category, url: d.url }))
                    }, null, 2));
                }
                console.error(chalk.cyan('\n💡 Hints:'));
                console.error(chalk.gray('   - Use \'node-info <nodeName>\' for complete node information'));
                console.error(chalk.gray('   - Use \'docs <title>\' to read documentation pages'));
            } catch (error: any) {
                console.error(chalk.red(error.message));
                process.exit(1);
            }
        });

    // ── validate ──────────────────────────────────────────────────────────────
    program
        .command('validate')
        .description('Validate a workflow file (JSON or TypeScript)')
        .argument('<file>', 'Path to workflow file (.json or .workflow.ts)')
        .option('--strict', 'Treat warnings as errors')
        .option('--debug', 'Show custom nodes resolution details on stderr')
        .action(async (file, options) => {
            try {
                printCustomNodesWarnings(customNodesConfig);
                if (options.debug) {
                    printCustomNodesDebugInfo(customNodesConfig, provider);
                }

                const workflowContent = readFileSync(file, 'utf8');
                const isTypeScript = file.endsWith('.workflow.ts') || file.endsWith('.ts');
                const validator = new WorkflowValidator(
                    join(assetsDir, 'n8n-nodes-technical.json'),
                    customNodesPath
                );
                const result = await validator.validateWorkflow(
                    isTypeScript ? workflowContent : JSON.parse(workflowContent),
                    isTypeScript
                );

                if (result.errors.length > 0) {
                    console.log(chalk.red.bold(`\n❌ Errors (${result.errors.length}):\n`));
                    for (const error of result.errors) {
                        const location = error.nodeName ? ` [${error.nodeName}]` : error.nodeId ? ` [${error.nodeId}]` : '';
                        console.log(chalk.red(`  • ${error.message}${location}`));
                        if (error.path) console.log(chalk.gray(`    Path: ${error.path}`));
                    }
                }

                if (result.warnings.length > 0) {
                    console.log(chalk.yellow.bold(`\n⚠️  Warnings (${result.warnings.length}):\n`));
                    for (const warning of result.warnings) {
                        const location = warning.nodeName ? ` [${warning.nodeName}]` : warning.nodeId ? ` [${warning.nodeId}]` : '';
                        console.log(chalk.yellow(`  • ${warning.message}${location}`));
                        if (warning.path) console.log(chalk.gray(`    Path: ${warning.path}`));
                    }
                }

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

    // ── update-ai ─────────────────────────────────────────────────────────────
    program
        .command('update-ai')
        .description('Update AI Context files (AGENTS.md)')
        .option('--n8n-version <version>', 'n8n instance version', 'Unknown')
        .option('--cli-version <version>', 'n8nac CLI version or dist-tag to use in generated AI context', 'latest')
        .action(async (options: { n8nVersion: string; cliVersion?: string }) => {
            try {
                console.error(chalk.blue('🤖 Updating AI Context...'));
                const projectRoot = process.cwd();
                const distTag = options.cliVersion === 'latest' ? undefined : options.cliVersion;

                const aiContextGenerator = new AiContextGenerator();
                await aiContextGenerator.generate(projectRoot, options.n8nVersion, distTag);

                console.error(chalk.green('✅ AI Context updated successfully!'));
            } catch (error: any) {
                console.error(chalk.red(error.message));
                process.exit(1);
            }
        });

    program
        .command('mcp')
        .description('Start the n8n-as-code MCP server for Claude Desktop or other MCP clients')
        .option('--cwd <path>', 'Project directory used to resolve n8nac-config.json and n8nac-custom-nodes.json', process.env.N8N_AS_CODE_PROJECT_DIR)
        .action(async (options: { cwd?: string }) => {
            try {
                await startSkillsMcpServer({
                    assetsDir,
                    cwd: options.cwd,
                });
            } catch (error: any) {
                console.error(chalk.red(error.message));
                process.exit(1);
            }
        });

    // ── examples ──────────────────────────────────────────────────────────────
    const examples = program
        .command('examples')
        .description('Search and download community workflows (7000+ from n8nworkflows.xyz)');

    examples
        .command('search <query>')
        .description('Search community workflows')
        .option('-l, --limit <number>', 'Limit number of results', '10')
        .option('--json', 'Output results as JSON')
        .action((query: string, options: { limit: string; json?: boolean }) => {
            const limit = parseInt(options.limit, 10);
            const results = getRegistry().search(query, limit);

            if (options.json) {
                console.log(JSON.stringify(results, null, 2));
                return;
            }

            if (results.length === 0) {
                console.log(chalk.yellow(`No workflows found matching "${query}"`));
                return;
            }

            console.log(chalk.green(`\nFound ${results.length} workflow(s) matching "${query}":\n`));
            results.forEach((workflow: any, index: number) => {
                console.log(chalk.bold(`${index + 1}. ${workflow.name}`) + chalk.gray(` (ID: ${workflow.id})`));
                if (workflow.tags.length > 0) console.log(chalk.cyan(`   Tags: ${workflow.tags.join(', ')}`));
                console.log(chalk.gray(`   Author: ${workflow.author}`));
                if (workflow.description) console.log(chalk.dim(`   ${workflow.description}`));
                console.log('');
            });
            console.log(chalk.dim(`Run 'examples info <id>' for more details.`));
        });

    examples
        .command('list')
        .description('List community workflows (newest first)')
        .option('-l, --limit <number>', 'Limit number of results', '20')
        .action((options: { limit: string }) => {
            const limit = parseInt(options.limit, 10);
            const results = getRegistry().search('', limit);
            console.log(JSON.stringify(results, null, 2));
        });

    examples
        .command('info <id>')
        .description('Display detailed information about a community workflow')
        .action((id: string) => {
            const workflow = getRegistry().getById(id);
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
            if (workflow.description) {
                console.log(chalk.cyan('\nDescription:'));
                console.log(chalk.dim(workflow.description));
            }
            console.log(chalk.cyan('\nRaw URL:'));
            console.log(chalk.blue(getRegistry().getRawUrl(workflow)));
            console.log('');
        });

    examples
        .command('download <id>')
        .description('Download a community workflow as TypeScript')
        .option('-o, --output <path>', 'Output file path')
        .option('-f, --force', 'Overwrite existing file')
        .action(async (id: string, options: { output?: string; force?: boolean }) => {
            const workflow = getRegistry().getById(id);
            if (!workflow) {
                console.error(chalk.red(`❌ Workflow with ID "${id}" not found.`));
                process.exit(1);
            }
            if (!workflow.hasWorkflow) {
                console.error(chalk.red(`❌ Workflow "${workflow.name}" does not have a workflow file.`));
                process.exit(1);
            }
            const outputPath = options.output
                ? resolve(process.cwd(), options.output)
                : resolve(process.cwd(), `${workflow.slug}.workflow.ts`);

            if (existsSync(outputPath) && !options.force) {
                console.error(chalk.red(`❌ File already exists: ${outputPath}`));
                console.error(chalk.dim('Use --force to overwrite.'));
                process.exit(1);
            }

            const url = getRegistry().getRawUrl(workflow);
            console.log(chalk.blue(`📥 Downloading from: ${url}`));

            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

                const data = await response.text();
                const workflowJson = JSON.parse(data);
                const parser = new JsonToAstParser();
                const ast = parser.parse(workflowJson);
                const generator = new AstToTypeScriptGenerator();
                const outputContent = await generator.generate(ast, { format: true, commentStyle: 'verbose' });
                console.log(chalk.cyan(`🔄 Converted to TypeScript format`));
                writeFileSync(outputPath, outputContent, 'utf-8');
                console.log(chalk.green(`✅ Workflow saved to: ${outputPath}`));
            } catch (error) {
                console.error(chalk.red(`❌ Download failed: ${error instanceof Error ? error.message : String(error)}`));
                process.exit(1);
            }
        });
}
