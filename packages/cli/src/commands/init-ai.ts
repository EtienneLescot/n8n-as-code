import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import {
    N8nApiClient,
    SchemaGenerator,
    IN8nCredentials
} from '@n8n-as-code/core';
import {
    AiContextGenerator,
    SnippetGenerator
} from '@n8n-as-code/agent-cli';
import dotenv from 'dotenv';

export class UpdateAiCommand {
    constructor(private program: Command) {
        this.program
            .command('update-ai')
            .description('Update AI Context (AGENTS.md, n8n-schema.json, rule files)')
            .option('--doc-only', 'Generate only documentation, skip schema')
            .action(async (options) => {
                await this.run(options);
            });
    }

    public async run(options: any = {}, providedCredentials?: IN8nCredentials) {
        console.log(chalk.blue('🤖 Updating AI Context...'));
        console.log(chalk.gray('   Regenerating AGENTS.md, n8n-schema.json, and rule files\n'));

        const projectRoot = process.cwd();

        try {
            // Initialize N8nApiClient if credentials are available
            dotenv.config();
            const credentials: IN8nCredentials = providedCredentials || {
                host: process.env.N8N_HOST || '',
                apiKey: process.env.N8N_API_KEY || ''
            };
            let client: N8nApiClient | undefined;
            if (credentials.host && credentials.apiKey) {
                client = new N8nApiClient(credentials);
            }

            // 1. Fetch version once if possible
            let version = "Unknown";
            if (client) {
                try {
                    const health = await client.getHealth();
                    version = health.version;
                } catch { } // Ignore version fetch error
            }

            // 2. Generate Context (AGENTS.md, rules)
            console.log(chalk.gray('\n   - Generating AI context files (AGENTS.md, rules)...'));
            const aiContextGenerator = new AiContextGenerator();
            await aiContextGenerator.generate(projectRoot, version);

            if (!options.docOnly) {
                console.log(chalk.gray('   - Generating n8n-schema.json...'));
                const schemaGen = new SchemaGenerator();
                await schemaGen.generateSchema(path.join(projectRoot, 'n8n-schema.json'));
                console.log(chalk.green('   ✅ n8n-schema.json created.'));

                console.log(chalk.gray('   - Generating VS Code Snippets...'));
                try {
                    const snippetGen = new SnippetGenerator();
                    await snippetGen.generate(projectRoot);
                    console.log(chalk.green('   ✅ .vscode/n8n.code-snippets created.'));
                } catch (snippetError: any) {
                    console.log(chalk.yellow(`   ⚠️  Snippet generation skipped: ${snippetError.message}`));
                }
            } else {
                console.log(chalk.gray('   - Skipping schema and snippets (doc-only mode)'));
            }

            console.log(chalk.green('\n✨ AI Context Updated Successfully!'));
            console.log(chalk.gray('   ✔ AGENTS.md: Complete AI agent guidelines'));
            console.log(chalk.gray('   ✔ n8n-schema.json: JSON schema with node definitions'));
            console.log(chalk.gray('   ✔ .cursorrules/.clinerules: AI agent rules\n'));

        } catch (error: any) {
            console.error(chalk.red(`❌ Error during update-ai: ${error.message}`));
            if (error.stack) {
                console.error(chalk.gray(error.stack));
            }
            process.exit(1);
        }
    }
}

// Keep backward compatibility with old command name
export class InitAiCommand extends UpdateAiCommand {}
