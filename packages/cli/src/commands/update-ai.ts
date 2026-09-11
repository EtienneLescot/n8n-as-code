import chalk from 'chalk';
import { quoteShellArg } from '../utils/shell.js';
import { findNewerPublishedVersion } from '../utils/version-check.js';
import fs from 'fs';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve, delimiter, basename } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import {
    N8nApiClient,
    IN8nCredentials,
    WorkspaceSetupService,
} from '../core/index.js';
import type { AiContextGenerator as AiContextGeneratorInstance } from '@n8n-as-code/skills';
import { ConfigService, effectiveNativeMcpLevel } from '../services/config-service.js';
import dotenv from 'dotenv';

const N8NAC_DEV_CONFIG_FILENAMES = [
    '.n8nac-dev.json',
    '.n8n-as-code-dev.json',
] as const;

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

/** Reads the native MCP level stamp embedded in an existing AGENTS.md, or undefined if absent. */
function readAgentsMdLevel(projectRoot: string): number | undefined {
    const agentsMdPath = join(projectRoot, 'AGENTS.md');
    if (!existsSync(agentsMdPath)) return undefined;
    const content = readFileSync(agentsMdPath, 'utf8');
    const match = content.match(/<!--\s*n8nac-mcp-level:\s*(\d+)\s*-->/);
    if (!match) return undefined;
    const parsed = Number.parseInt(match[1], 10);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
}


function hasWorkspaceDevCommand(projectRoot: string): boolean {
    return N8NAC_DEV_CONFIG_FILENAMES.some((filename) => existsSync(join(projectRoot, filename)));
}

/**
 * True when a plain shell resolves `n8nac` on its own.
 * PATH entries ending in node_modules/.bin are ignored: those are injected by our own
 * npx / npm-script invocation and will not exist in the agent's shell afterwards.
 */
function isN8nacOnShellPath(): boolean {
    const extensions = process.platform === 'win32'
        ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';')
        : [''];
    return (process.env.PATH || process.env.Path || '').split(delimiter).some((dir) =>
        dir
        && basename(dir) !== '.bin'
        && extensions.some((ext) => existsSync(join(dir, `n8nac${ext}`))));
}

/**
 * The monorepo entry point, when the CLI is running from a dev checkout rather than an
 * install. Used both to emit a fast command and to stay quiet about version drift: a
 * maintainer on a locally bumped version should not be told to update.
 */
function devCheckoutEntrypoint(): string | undefined {
    const entrypoint = process.argv[1] ? resolve(process.argv[1]) : '';
    return entrypoint
        && !entrypoint.includes(`${join('node_modules', '')}`)
        && entrypoint.endsWith(join('packages', 'cli', 'dist', 'index.js'))
        && existsSync(entrypoint)
        ? entrypoint
        : undefined;
}

function inferFastCliCommand(projectRoot: string): string | undefined {
    if (process.env.N8NAC_COMMAND || hasWorkspaceDevCommand(projectRoot)) {
        return undefined;
    }

    const devEntrypoint = devCheckoutEntrypoint();
    if (devEntrypoint) {
        return `node ${quoteShellArg(devEntrypoint)}`;
    }

    // Prefer the installed binary: npx pays npm's own startup on every invocation.
    return isN8nacOnShellPath() ? 'n8nac' : undefined;
}

/**
 * Resolve the effective native MCP usage level of the active workspace
 * environment for generated AI context. Never throws — update-ai must not
 * fail when no environment is pinned yet.
 */
function resolveActiveNativeMcpLevel(projectRoot: string): { level: number; environmentName?: string } | undefined {
    try {
        const configService = new ConfigService(projectRoot);
        const requested = process.env.N8NAC_ENVIRONMENT?.trim() || undefined;
        const resolved = configService.resolveEnvironment(requested);
        return {
            level: effectiveNativeMcpLevel(resolved.environment.nativeMcp, process.env.N8NAC_NATIVE_MCP_LEVEL),
            environmentName: resolved.environmentName,
        };
    } catch {
        return undefined;
    }
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

async function createAiContextGenerator(): Promise<AiContextGeneratorInstance> {
    const __dir = dirname(fileURLToPath(import.meta.url));
    const workspaceSkillsEntry = resolve(__dir, '..', '..', '..', 'skills', 'dist', 'index.js');
    if (existsSync(workspaceSkillsEntry)) {
        try {
            const mod = await import(pathToFileURL(workspaceSkillsEntry).href) as typeof import('@n8n-as-code/skills');
            return new mod.AiContextGenerator();
        } catch {
            // Fall through to the packaged dependency when a local dev build is stale.
        }
    }

    const mod = await import('@n8n-as-code/skills');
    return new mod.AiContextGenerator();
}

/**
 * One dim line when a newer version is published. Runs only after update-ai has already
 * succeeded, and swallows everything: a version check has no business failing a command.
 * Written to stderr, like the refresh notice, so machine-readable stdout stays clean.
 *
 * Built by concatenation rather than a template literal so the backticks in the message
 * are plainly literal.
 */
async function noticeIfOutdated(): Promise<void> {
    try {
        if (devCheckoutEntrypoint()) return;

        const current = getCliVersion();
        const distTag = getDistTag();
        const published = await findNewerPublishedVersion(current, distTag);
        if (!published) return;

        console.error(chalk.dim(
            'ℹ  n8nac: ' + published + ' is published, this is ' + current + '. '
            + 'Update with `npm i n8nac@' + (distTag ?? 'latest') + '`, adding `-g` if you installed '
            + 'globally, then rerun `update-ai`.',
        ));
    } catch {
        // Never surface a version check to the user as a failure.
    }
}

export class UpdateAiCommand {

    /**
     * Fire-and-forget check: if AGENTS.md is missing a version stamp or the stamped version
     * differs from the installed n8nac CLI version, silently regenerates AI context files.
     * The native MCP level stamp is part of the fingerprint: a level change regenerates
     * even when the CLI version is unchanged. Safe to call at the top of any
     * command — never throws.
     */
    static async checkAndRefreshIfStale(projectRoot: string): Promise<void> {
        try {
            const agentsMdPath = join(projectRoot, 'AGENTS.md');
            if (!existsSync(agentsMdPath)) return;

            const stampedVersion = readAgentsMdVersion(projectRoot);
            const currentVersion = getCliVersion();

            if (currentVersion && stampedVersion === currentVersion) {
                const stampedLevel = readAgentsMdLevel(projectRoot);
                const currentLevel = resolveActiveNativeMcpLevel(projectRoot)?.level;
                // No level comparison possible (no pinned environment, or a
                // pre-fingerprint file with nothing configured): keep the file.
                if (currentLevel === undefined || stampedLevel === currentLevel) return;
            }

            await new UpdateAiCommand().run({ silent: true, projectRoot });
        } catch {
            // Never surface background refresh errors to the user
        }
    }

    public async run(options: any = {}, providedCredentials?: IN8nCredentials) {
        const silent = !!options.silent;

        if (!silent) {
            console.log(chalk.blue('🤖 Updating AI Context...'));
            console.log(chalk.gray('   Regenerating AGENTS.md, VS Code agents, and portable skills\n'));
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
            if (!silent) console.log(chalk.gray('\n   - Generating AI context files (AGENTS.md + .github/agents + .agents/skills)...'));
            const aiContextGenerator = await createAiContextGenerator();
            const distTag = typeof options.cliVersion === 'string' && options.cliVersion.trim()
                ? options.cliVersion.trim()
                : getDistTag();
            const nativeMcp = resolveActiveNativeMcpLevel(projectRoot);
            await aiContextGenerator.generate(projectRoot, version, distTag, {
                cliCommandOverride: options.cliCmd || inferFastCliCommand(projectRoot),
                managerCommandOverride: options.managerCmd || inferLocalDevManagerCommand(),
                cliVersion: getCliVersion(),
                nativeMcp,
            } as Parameters<AiContextGeneratorInstance['generate']>[3] & { managerCommandOverride?: string });
            if (!silent) console.log(chalk.green('   ✅ AI context files created.'));

            // 3. Update n8n-workflows.d.ts for all configured workspace environments
            if (!silent) console.log(chalk.gray('\n   - Updating TypeScript stubs (n8n-workflows.d.ts)...'));
            const configService = new ConfigService(projectRoot);
            const environments = configService.listEnvironments();
            let updatedCount = 0;
            for (const environment of environments) {
                const resolved = configService.resolveEnvironment(environment.id);
                const { workflowsPath } = resolved;
                if (!workflowsPath) continue;

                const instanceDir = workflowsPath;
                if (!fs.existsSync(instanceDir)) continue;

                try {
                    WorkspaceSetupService.ensureWorkspaceFiles(instanceDir);
                    updatedCount++;
                } catch (err: any) {
                    if (!silent) console.warn(chalk.yellow(`   ⚠ Could not update TypeScript stubs for ${environment.name}: ${err.message}`));
                }
            }
            if (!silent) {
                if (updatedCount > 0) {
                    console.log(chalk.green(`   ✅ TypeScript stubs updated for ${updatedCount} instance(s).`));
                } else {
                    console.log(chalk.gray('   ℹ No existing instance directories found to update.'));
                }

                console.log(chalk.green('\n✨ AI Context Updated Successfully!'));
                console.log(chalk.gray('   ✔ AGENTS.md: Lightweight context-root bootstrap'));
                console.log(chalk.gray('   ✔ .github/agents: VS Code/Copilot workspace agents'));
                console.log(chalk.gray('   ✔ .agents/skills: Portable n8n-architect skill fallback'));
                console.log(chalk.gray('   ✔ n8n-workflows.d.ts: TypeScript stubs (per environment)'));
                console.log(chalk.gray('   ✔ Source of truth: n8n-nodes-technical.json (via @n8n-as-code/skills)\n'));

                await noticeIfOutdated();
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
