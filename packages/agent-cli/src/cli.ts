#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { NodeSchemaProvider } from './services/node-schema-provider.js';
import { WorkflowValidator } from './services/workflow-validator.js';
import { DocsProvider } from './services/docs-provider.js';
import { KnowledgeSearch } from './services/knowledge-search.js';
import { AiContextGenerator } from './services/ai-context-generator.js';
import { SnippetGenerator } from './services/snippet-generator.js';
import { readFileSync } from 'fs';
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

const program = new Command();
const provider = new NodeSchemaProvider();
const docsProvider = new DocsProvider();
const knowledgeSearch = new KnowledgeSearch();

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
    .description('Get complete node information (schema + documentation + examples)')
    .argument('<name>', 'Node name (exact, e.g. "googleSheets")')
    .action((name) => {
        try {
            const schema = provider.getNodeSchema(name);
            if (schema) {
                console.log(JSON.stringify(schema, null, 2));
                
                // Add helpful hints to stderr
                console.error(chalk.cyan('\n💡 Next steps:'));
                console.error(chalk.gray(`   - 'schema ${name}' for quick parameter reference`));
                console.error(chalk.gray(`   - 'examples ${name}' to find usage examples`));
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
    .description('List all available nodes (compact)')
    .action(() => {
        try {
            const list = provider.listAllNodes();
            console.log(JSON.stringify(list, null, 2));
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
    .description('Access n8n documentation')
    .argument('[title]', 'Documentation page title')
    .option('--search <query>', 'Search documentation')
    .option('--list', 'List all categories')
    .option('--category <category>', 'Filter by category')
    .action((title, options) => {
        try {
            if (options.list) {
                const categories = docsProvider.getCategories();
                console.log(JSON.stringify(categories, null, 2));
            } else if (options.search) {
                const results = docsProvider.searchDocs(options.search, { category: options.category });
                console.log(JSON.stringify(results, null, 2));
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
            const schema = provider.getNodeSchema(name);
            if (schema) {
                // Return only technical properties
                const technicalSchema = {
                    name: schema.name,
                    displayName: schema.displayName,
                    version: schema.version,
                    properties: schema.properties,
                    requiredFields: schema.properties?.filter((p: any) => p.required).map((p: any) => p.name) || []
                };
                console.log(JSON.stringify(technicalSchema, null, 2));
                console.error(chalk.cyan('\n💡 Hint: Use \'get ' + name + '\' for complete documentation'));
            } else {
                console.error(chalk.red(`Node '${name}' not found.`));
                process.exit(1);
            }
        } catch (error: any) {
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

// 7. Examples - Find examples and tutorials
program
    .command('examples')
    .description('Find workflow examples and tutorials')
    .argument('[query]', 'Search query')
    .option('--list', 'List all examples')
    .option('--limit <limit>', 'Limit results', '10')
    .action((query, options) => {
        try {
            const examples = docsProvider.getExamples(query, parseInt(options.limit));
            console.log(JSON.stringify(examples, null, 2));
            
            if (examples.length > 0) {
                console.error(chalk.cyan('\n💡 Hint: Use \'docs "<title>"\' to read the full example'));
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
    .option('--version <version>', 'n8n version', 'Unknown')
    .action(async (options) => {
        try {
            console.error(chalk.blue('🤖 Updating AI Context...'));
            const projectRoot = process.cwd();
            
            const aiContextGenerator = new AiContextGenerator();
            await aiContextGenerator.generate(projectRoot, options.version);
            
            const snippetGen = new SnippetGenerator();
            await snippetGen.generate(projectRoot);
            
            console.error(chalk.green('✅ AI Context updated successfully!'));
        } catch (error: any) {
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

program.parse(process.argv);
