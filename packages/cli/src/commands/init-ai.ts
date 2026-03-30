import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
    N8nApiClient,
    IN8nCredentials
} from '../core/index.js';
import {
    AiContextGenerator
} from '@n8n-as-code/skills';
import dotenv from 'dotenv';

/** Returns 'next' for pre-release builds, undefined for stable builds.
 * AGENTS.md will use `npx --yes n8nac@next` vs `npx --yes n8nac` accordingly. */
function getDistTag(): string | undefined {
    try {
        const __dir = dirname(fileURLToPath(import.meta.url));
        const pkg = JSON.parse(readFileSync(join(__dir, '..', '..', 'package.json'), 'utf8'));
        return pkg.version?.includes('-') ? 'next' : undefined;
    } catch {
        return undefined;
    }
}

export class UpdateAiCommand {
    constructor(private program: Command) {
        this.program
            .command('update-ai')
            .description('Update AI Context (AGENTS.md and snippets)')
            .option('--cli-cmd <command>', 'Override the generated n8nac command in AGENTS.md (for local dev builds)')
            .action(async (options) => {
                await this.run(options);
            });
    }

    public async run(options: any = {}, providedCredentials?: IN8nCredentials) {
        console.log(chalk.blue('🤖 Updating AI Context...'));
        console.log(chalk.gray('   Regenerating AGENTS.md and snippets\n'));

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

            // 2. Generate Context (AGENTS.md)
            console.log(chalk.gray('\n   - Generating AI context files (AGENTS.md)...'));
            const aiContextGenerator = new AiContextGenerator();
            await aiContextGenerator.generate(projectRoot, version, getDistTag(), {
                cliCommandOverride: options.cliCmd,
            });
            console.log(chalk.green('   ✅ AI context files created.'));

            console.log(chalk.green('\n✨ AI Context Updated Successfully!'));
            console.log(chalk.gray('   ✔ AGENTS.md: Complete AI agent guidelines'));
            console.log(chalk.gray('   ✔ Source of truth: n8n-nodes-technical.json (via @n8n-as-code/skills)\n'));

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
export class InitAiCommand extends UpdateAiCommand { }
