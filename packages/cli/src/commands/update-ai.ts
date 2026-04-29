import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
    N8nApiClient,
    IN8nCredentials,
    WorkspaceSetupService,
    createProjectSlug,
} from '../core/index.js';
import {
    AiContextGenerator
} from '@n8n-as-code/skills';
import {
    getN8nManagerAgentInstructions
} from '@n8n-as-code/n8n-manager-core';
import { ConfigService } from '../services/config-service.js';
import dotenv from 'dotenv';
import { getN8nacDevConfigFilenames } from '@n8n-as-code/skills';

/** Returns 'next' for pre-release builds, undefined for stable builds.
 * The generated command is resolved centrally by @n8n-as-code/skills:
 * --cli-cmd > N8NAC_COMMAND > .n8nac-dev.json > published npx command. */
function getDistTag(): string | undefined {
    try {
        const __dir = dirname(fileURLToPath(import.meta.url));
        const pkg = JSON.parse(readFileSync(join(__dir, '..', '..', 'package.json'), 'utf8'));
        return pkg.version?.includes('-') ? 'next' : undefined;
    } catch {
        return undefined;
    }
}

/** Returns the installed n8nac CLI semver (e.g. "1.4.0"), or undefined if unreadable. */
export function getCliVersion(): string | undefined {
    try {
        const __dir = dirname(fileURLToPath(import.meta.url));
        const pkg = JSON.parse(readFileSync(join(__dir, '..', '..', 'package.json'), 'utf8'));
        return typeof pkg.version === 'string' ? pkg.version : undefined;
    } catch {
        return undefined;
    }
}

/** Reads the n8nac version stamp embedded in an existing AGENTS.md, or undefined if absent. */
function readAgentsMdVersion(projectRoot: string): string | undefined {
    const agentsMdPath = join(projectRoot, 'AGENTS.md');
    if (!existsSync(agentsMdPath)) return undefined;
    const content = readFileSync(agentsMdPath, 'utf8');
    const match = content.match(/<!--\s*n8nac-version:\s*([^\s>]+)\s*-->/);
    return match?.[1];
}

function quoteShellArg(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

function hasWorkspaceDevCommand(projectRoot: string): boolean {
    return getN8nacDevConfigFilenames().some((filename) => existsSync(join(projectRoot, filename)));
}

function inferLocalDevCliCommand(projectRoot: string): string | undefined {
    if (process.env.N8NAC_COMMAND || hasWorkspaceDevCommand(projectRoot)) {
        return undefined;
    }

    const entrypoint = process.argv[1] ? resolve(process.argv[1]) : '';
    if (!entrypoint || entrypoint.includes(`${join('node_modules', '')}`)) {
        return undefined;
    }
    if (!entrypoint.endsWith(join('packages', 'cli', 'dist', 'index.js'))) {
        return undefined;
    }
    if (!existsSync(entrypoint)) {
        return undefined;
    }
    return `node ${quoteShellArg(entrypoint)}`;
}

function inferLocalDevManagerCommand(): string | undefined {
    if (process.env.N8N_MANAGER_COMMAND) {
        return process.env.N8N_MANAGER_COMMAND;
    }

    const currentFile = fileURLToPath(import.meta.url);
    const n8nAsCodeRoot = resolve(dirname(currentFile), '..', '..', '..', '..');
    const siblingManagerCli = resolve(n8nAsCodeRoot, '..', 'n8n-manager', 'packages', 'cli', 'dist', 'index.js');
    if (existsSync(siblingManagerCli)) {
        return `node ${quoteShellArg(siblingManagerCli)}`;
    }

    return undefined;
}

function injectOrUpdateMarkdownBlock(filePath: string, blockName: string, content: string): void {
    const startMarker = `<!-- ${blockName}-start -->`;
    const endMarker = `<!-- ${blockName}-end -->`;
    const block = `\n${startMarker}\n${content.trim()}\n${endMarker}\n`;

    if (!existsSync(filePath)) {
        fs.writeFileSync(filePath, `# 🤖 AI Agents Guidelines\n${block.trim()}\n`);
        return;
    }

    const existing = readFileSync(filePath, 'utf8');
    const startIdx = existing.indexOf(startMarker);
    const endIdx = existing.indexOf(endMarker);
    if (startIdx !== -1 && endIdx !== -1) {
        fs.writeFileSync(filePath, existing.substring(0, startIdx) + block.trim() + existing.substring(endIdx + endMarker.length));
        return;
    }

    fs.writeFileSync(filePath, `${existing.trim()}\n${block}`);
}

export class UpdateAiCommand {
    constructor(private program: Command) {
        this.program
            .command('update-ai')
            .description('Update AI Context (AGENTS.md and snippets)')
            .option('--n8n-version <version>', 'n8n instance version to write when API discovery is unavailable')
            .option('--cli-version <version>', 'n8nac CLI dist tag to use in generated AI context')
            .option('--cli-cmd <command>', 'Override the generated n8nac command in AGENTS.md (for local dev builds)')
            .option('--manager-cmd <command>', 'Override the generated n8n-manager command in AGENTS.md (for local dev builds)')
            .option('--silent', 'Suppress all output (used for background refresh)')
            .action(async (options) => {
                await this.run(options);
            });
    }

    /**
     * Fire-and-forget check: if AGENTS.md is missing a version stamp or the stamped version
     * differs from the installed n8nac CLI version, silently regenerates AI context files.
     * Safe to call at the top of any command — never throws.
     */
    static async checkAndRefreshIfStale(projectRoot: string): Promise<void> {
        try {
            const agentsMdPath = join(projectRoot, 'AGENTS.md');
            if (!existsSync(agentsMdPath)) return;

            const stampedVersion = readAgentsMdVersion(projectRoot);
            const currentVersion = getCliVersion();

            if (currentVersion && stampedVersion === currentVersion) return; // already up-to-date

            await new UpdateAiCommand(new Command()).run({ silent: true, projectRoot });
        } catch {
            // Never surface background refresh errors to the user
        }
    }

    public async run(options: any = {}, providedCredentials?: IN8nCredentials) {
        const silent = !!options.silent;

        if (!silent) {
            console.log(chalk.blue('🤖 Updating AI Context...'));
            console.log(chalk.gray('   Regenerating AGENTS.md and snippets\n'));
        }

        const projectRoot: string = options.projectRoot ?? process.cwd();

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
            let version = typeof options.n8nVersion === 'string' && options.n8nVersion.trim()
                ? options.n8nVersion.trim()
                : "Unknown";
            if (client && version === "Unknown") {
                try {
                    const health = await client.getHealth();
                    version = health.version;
                } catch { } // Ignore version fetch error
            }

            // 2. Generate Context (AGENTS.md)
            if (!silent) console.log(chalk.gray('\n   - Generating AI context files (AGENTS.md)...'));
            const aiContextGenerator = new AiContextGenerator();
            const distTag = typeof options.cliVersion === 'string' && options.cliVersion.trim()
                ? options.cliVersion.trim()
                : getDistTag();
            await aiContextGenerator.generate(projectRoot, version, distTag, {
                cliCommandOverride: options.cliCmd || inferLocalDevCliCommand(projectRoot),
                managerCommandOverride: options.managerCmd || inferLocalDevManagerCommand(),
                cliVersion: getCliVersion(),
            });
            injectOrUpdateMarkdownBlock(
                join(projectRoot, 'AGENTS.md'),
                'n8n-manager-agent-tools',
                getN8nManagerAgentInstructions({
                    command: options.managerCmd || inferLocalDevManagerCommand() || 'n8n-manager',
                    workspaceRoot: projectRoot,
                }),
            );
            if (!silent) console.log(chalk.green('   ✅ AI context files created.'));

            // 3. Update n8n-workflows.d.ts for all configured instances
            if (!silent) console.log(chalk.gray('\n   - Updating TypeScript stubs (n8n-workflows.d.ts)...'));
            const configService = new ConfigService(projectRoot);
            const instances = configService.listInstances();
            let updatedCount = 0;
            for (const instance of instances) {
                const { syncFolder, instanceIdentifier, projectName } = instance;
                if (!syncFolder || !instanceIdentifier || !projectName) continue;

                const instanceDir = join(
                    resolve(projectRoot, syncFolder),
                    instanceIdentifier,
                    createProjectSlug(projectName)
                );
                if (!fs.existsSync(instanceDir)) continue;

                try {
                    WorkspaceSetupService.ensureWorkspaceFiles(instanceDir);
                    updatedCount++;
                } catch (err: any) {
                    if (!silent) console.warn(chalk.yellow(`   ⚠ Could not update TypeScript stubs for ${instanceIdentifier}: ${err.message}`));
                }
            }
            if (!silent) {
                if (updatedCount > 0) {
                    console.log(chalk.green(`   ✅ TypeScript stubs updated for ${updatedCount} instance(s).`));
                } else {
                    console.log(chalk.gray('   ℹ No existing instance directories found to update.'));
                }

                console.log(chalk.green('\n✨ AI Context Updated Successfully!'));
                console.log(chalk.gray('   ✔ AGENTS.md: Complete AI agent guidelines'));
                console.log(chalk.gray('   ✔ n8n-workflows.d.ts: TypeScript stubs (per instance)'));
                console.log(chalk.gray('   ✔ Source of truth: n8n-nodes-technical.json (via @n8n-as-code/skills)\n'));
            } else if (updatedCount > 0 || existsSync(join(projectRoot, 'AGENTS.md'))) {
                // Single dim notice so the user knows a refresh happened — written to stderr
                // to avoid corrupting machine-readable stdout output (e.g. `n8nac list --raw`)
                console.error(chalk.dim(`ℹ  n8nac: AGENTS.md refreshed (${getCliVersion() ?? 'updated'})`));
            }

        } catch (error: any) {
            if (!silent) {
                console.error(chalk.red(`❌ Error during update-ai: ${error.message}`));
                if (error.stack) {
                    console.error(chalk.gray(error.stack));
                }
                process.exit(1);
            }
            // In silent mode, swallow errors — the refresh is best-effort
        }
    }
}
