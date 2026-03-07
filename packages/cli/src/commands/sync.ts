import { BaseCommand } from './base.js';
import { SyncManager, WorkflowSyncStatus } from '../core/index.js';
import { WorkflowValidator } from '@n8n-as-code/skills';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

export class SyncCommand extends BaseCommand {

    async pullOne(workflowId: string): Promise<void> {
        const syncConfig = await this.getSyncConfig();
        const syncManager = new SyncManager(this.client, syncConfig);

        // Populate local hash cache FIRST — required for accurate status in CLI mode
        await syncManager.refreshLocalState();

        // Fetch ensures initialization, remote knowledge, and filename mapping
        const remoteExists = await syncManager.fetch(workflowId);
        if (!remoteExists) {
            console.error(chalk.red(`❌ Workflow ${workflowId} not found on remote.`));
            process.exit(1);
        }

        const filename = syncManager.getFilenameForId(workflowId);
        if (filename) {
            const status = await syncManager.getSingleWorkflowDetailedStatus(workflowId, filename);
            
            const hasConflict = status.status === WorkflowSyncStatus.CONFLICT;
            const hasLocalChanges = !!(status.localHash && status.lastSyncedHash && status.localHash !== status.lastSyncedHash);
            if (hasConflict || hasLocalChanges) {
                console.log(chalk.red(`💥 Conflict detected for workflow ${workflowId}.`));
                console.log(chalk.yellow(`To resolve the conflict you can either:`));
                console.log(`  n8nac resolve ${workflowId} --mode keep-current`);
                console.log(`  n8nac resolve ${workflowId} --mode keep-incoming`);
                return;
            }
        }

        const spinner = ora(`Pulling workflow ${workflowId}...`).start();
        try {
            await syncManager.pull(workflowId);
            spinner.succeed(chalk.green(`✔ Pulled workflow ${workflowId}.`));
        } catch (e: any) {
            spinner.fail(`Pull failed: ${e.message}`);
            process.exit(1);
        }
    }

    async pushOne(filename: string): Promise<string | undefined> {
        const syncConfig = await this.getSyncConfig();
        const syncManager = new SyncManager(this.client, syncConfig);

        // Populate local hash cache FIRST — required for accurate status in CLI mode
        await syncManager.refreshLocalState();

        // ⚠️ In pushOne(inputPath), we MUST NOT use syncManager.getWorkflowIdForFilename(inputPath)
        // because inputPath might be a relative path from CWD (e.g. workflows/...) 
        // while the internal tracker only knows about the flat basename.
        // We let syncManager.push() handle the expansion and resolution correctly.
        // For conflict detection BEFORE the actual push, we need the basename.
        
        let workflowId: string | undefined;
        let basename: string | undefined;
        
        try {
            const pushTarget = syncManager.resolvePushTarget(filename);
            basename = pushTarget.filename;
            workflowId = syncManager.getWorkflowIdForFilename(pushTarget.filename);
        } catch (e) {
            // If normalization fails, let the actual push() call throw the clean error
        }

        if (workflowId && basename) {
            await syncManager.fetch(workflowId);

            const status = await syncManager.getSingleWorkflowDetailedStatus(workflowId, basename);
            if (status.status === WorkflowSyncStatus.CONFLICT) {
                console.log(chalk.red(`💥 Conflict detected for workflow ${workflowId}.`));
                console.log(chalk.yellow(`To resolve the conflict you can either:`));
                console.log(`  n8nac resolve ${workflowId} --mode keep-current`);
                console.log(`  n8nac resolve ${workflowId} --mode keep-incoming`);
                return undefined;
            }
        }

        const spinner = ora(`Pushing workflow ${filename}...`).start();
        try {
            const finalWorkflowId = await syncManager.push(filename);
            spinner.succeed(chalk.green(`✔ Pushed workflow ${filename}.`));
            return finalWorkflowId;
        } catch (e: any) {
            if (e.message.includes('modified in the n8n UI')) {
                spinner.stop();
                console.log(chalk.red(`\n💥 Conflict detected: ${e.message}`));
                console.log(chalk.yellow(`To resolve the conflict you can either:`));
                if (workflowId) {
                    console.log(`  n8nac resolve ${workflowId} --mode keep-current`);
                    console.log(`  n8nac resolve ${workflowId} --mode keep-incoming`);
                    return undefined;
                }
            }
            spinner.fail(`Push failed: ${e.message}`);
            process.exit(1);
        }
    }

    async fetchOne(workflowId: string): Promise<void> {
        const spinner = ora(`Fetching remote state for workflow ${workflowId}...`).start();
        try {
            const syncConfig = await this.getSyncConfig();
            const syncManager = new SyncManager(this.client, syncConfig);
            
            // Fetch remote state for this specific workflow (updates internal cache)
            const success = await syncManager.fetch(workflowId);
            if (!success) {
                spinner.fail(`Workflow ${workflowId} not found on remote.`);
                process.exit(1);
            }
            
            spinner.succeed(chalk.green(`✔ Fetched remote state for workflow ${workflowId}.`));
        } catch (e: any) {
            spinner.fail(`Fetch failed: ${e.message}`);
            process.exit(1);
        }
    }

    async resolveOne(workflowId: string, resolution: 'keep-current' | 'keep-incoming'): Promise<void> {
        const resLabel = resolution === 'keep-current' ? 'current (local)' : 'incoming (remote)';
        const spinner = ora(`Resolving conflict for ${workflowId} (keeping ${resLabel})...`).start();
        try {
            const syncConfig = await this.getSyncConfig();
            const syncManager = new SyncManager(this.client, syncConfig);

            // Populate local hash cache and remote state
            await syncManager.refreshLocalState();
            await syncManager.fetch(workflowId);

            // Need to find the filename
            const filename = syncManager.getFilenameForId(workflowId);

            if (!filename) {
                spinner.fail(`Workflow ${workflowId} not found in local state.`);
                process.exit(1);
            }

            // Map terminology: keep-current -> local, keep-incoming -> remote
            const mode = resolution === 'keep-current' ? 'local' : 'remote';
            await syncManager.resolveConflict(workflowId, filename, mode);
            spinner.succeed(chalk.green(`✔ Conflict resolved for ${workflowId} (kept ${resLabel}).`));
        } catch (e: any) {
            spinner.fail(`Resolution failed: ${e.message}`);
            process.exit(1);
        }
    }

    /**
     * Fetch workflow from n8n and validate it against the local node schema.
     * Detects runtime issues such as invalid typeVersion, invalid operation/resource values,
     * or missing required parameters — the same errors n8n would show in the UI.
     */
    async verifyRemote(workflowId: string): Promise<boolean> {
        const spinner = ora(`Fetching workflow ${workflowId} from n8n for verification...`).start();
        let workflow: any;

        try {
            workflow = await this.client.getWorkflow(workflowId);
        } catch (e: any) {
            spinner.fail(`Could not fetch workflow: ${e.message}`);
            process.exit(1);
        }

        if (!workflow) {
            spinner.fail(chalk.red(`Workflow ${workflowId} not found on remote.`));
            process.exit(1);
        }

        spinner.succeed(chalk.green(`✔ Fetched "${workflow.name}" (${workflow.nodes?.length ?? 0} nodes)`));

        const validator = new WorkflowValidator();
        const result = await validator.validateWorkflow(workflow, false);

        // ── Errors ──────────────────────────────────────────────────────────
        if (result.errors.length > 0) {
            console.log(chalk.red(`\n❌ ${result.errors.length} error(s) detected:\n`));
            for (const err of result.errors) {
                const nodeLabel = err.nodeName ? chalk.bold(`[${err.nodeName}] `) : '';
                console.log(chalk.red(`  • ${nodeLabel}${err.message}`));
                if (err.path) console.log(chalk.dim(`    at ${err.path}`));
            }
        }

        // ── Warnings ─────────────────────────────────────────────────────────
        if (result.warnings.length > 0) {
            console.log(chalk.yellow(`\n⚠  ${result.warnings.length} warning(s):\n`));
            for (const warn of result.warnings) {
                const nodeLabel = warn.nodeName ? chalk.bold(`[${warn.nodeName}] `) : '';
                console.log(chalk.yellow(`  • ${nodeLabel}${warn.message}`));
            }
        }

        // ── Summary ──────────────────────────────────────────────────────────
        console.log('');
        if (result.valid && result.warnings.length === 0) {
            console.log(chalk.green('✅ Workflow looks clean — no issues found.'));
        } else if (result.valid) {
            console.log(chalk.yellow('⚠  Workflow passed with warnings. Fix them before activating.'));
        } else {
            console.log(chalk.red('❌ Workflow has errors that will cause problems in n8n.'));
            console.log(chalk.dim('   Fix the issues locally, then push again.'));
        }

        return result.valid;
    }

}
