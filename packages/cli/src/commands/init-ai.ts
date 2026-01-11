import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import {
    N8nApiClient,
    SchemaGenerator,
    AiContextGenerator, // Replaced EnhancedAiContextGenerator
    SnippetGenerator,
    IN8nCredentials,
    // EnhancedSchemaGenerator, // Removed
    // NodeSchemaLoader        // Removed
} from '@n8n-as-code/core';
import dotenv from 'dotenv';

export class InitAiCommand {
    constructor(private program: Command) {
        this.program
            .command('init-ai')
            .description('Initialize AI Context (AGENTS.md, n8n-schema.json, rule files)')
            .option('--doc-only', 'Generate only documentation, skip schema')
            .action(async (options) => {
                await this.run(options);
            });
    }

    private async run(options: any) {
        console.log(chalk.blue('🤖 Initializing Enhanced AI Context Injection...'));
        console.log(chalk.gray('   Using local schema-based approach (no API calls required)'));

        const projectRoot = process.cwd();

        try {
            // Initialize N8nApiClient if credentials are available
            dotenv.config();
            const credentials: IN8nCredentials = {
                host: process.env.N8N_HOST || '',
                apiKey: process.env.N8N_API_KEY || ''
            };
            let client: N8nApiClient | undefined;
            if (credentials.host && credentials.apiKey) {
                client = new N8nApiClient(credentials);
            }

            // 1. Generate Context (AGENTS.md, rules)
            console.log(chalk.gray('\n   - Generating AI context files (AGENTS.md, rules)...'));
            const aiContextGenerator = new AiContextGenerator(client);
            await aiContextGenerator.generate(projectRoot);

            if (!options.docOnly) {
                console.log(chalk.gray('   - Generating n8n-schema.json...'));
                const schemaGen = new SchemaGenerator();
                await schemaGen.generateSchema(path.join(projectRoot, 'n8n-schema.json'));
                console.log(chalk.green('   ✅ n8n-schema.json created.'));
            }

            // 3. Generate Snippets (if not doc-only and we have API access)
            if (!options.docOnly && client) {
                console.log(chalk.gray('   - Generating VS Code Snippets...'));
                try {
                    const snippetGen = new SnippetGenerator(client);
                    await snippetGen.generate(projectRoot);
                    console.log(chalk.green('   ✅ .vscode/n8n.code-snippets created.'));
                } catch (snippetError: any) {
                    console.log(chalk.yellow(`   ⚠️  Snippet generation skipped: ${snippetError.message}`));
                }
            } else if (!options.docOnly) {
                console.log(chalk.gray('   - Skipping snippets (no N8N_HOST/N8N_API_KEY in .env)'));
            }

            console.log(chalk.blueBright('\n✨ AI Context Ready!'));
            console.log(chalk.gray('   - AGENTS.md: Complete AI agent guidelines'));
            console.log(chalk.gray('   - n8n-schema.json: JSON schema with node definitions'));
            console.log(chalk.gray('   - .cursorrules/.clinerules: AI agent rules'));

        } catch (error: any) {
            console.error(chalk.red(`❌ Error during init-ai: ${error.message}`));
            if (error.stack) {
                console.error(chalk.gray(error.stack));
            }
            process.exit(1);
        }
    }
}
