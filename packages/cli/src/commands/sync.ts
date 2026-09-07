import { BaseCommand, captureEmittedErrors, formatConnectionError } from './base.js';
import { SyncManager, WorkflowSyncStatus, type IPushPublishReport } from '../core/index.js';
import { PreflightNodeValidator, type PreflightNodeValidatorOptions } from '../core/index.js';
import { SchemaOverlayManager } from '../core/index.js';
import { WorkflowValidator } from '@n8n-as-code/skills';
import { effectiveNativeMcpLevel } from '../services/config-service.js';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

export class SyncCommand extends BaseCommand {

    async pullOne(workflowId: string): Promise<void> {
        const syncConfig = await this.getSyncConfig();
        const syncManager = new SyncManager(this.client, syncConfig);
        const lastEmittedError = captureEmittedErrors(syncManager);

        // Populate local hash cache FIRST — required for accurate status in CLI mode
        await syncManager.refreshLocalState();

        // Fetch ensures initialization, remote knowledge, and filename mapping
        const remoteExists = await syncManager.fetch(workflowId);
        if (!remoteExists) {
            // A falsy result means "absent" OR "the request failed"; only the emitted error
            // tells them apart, and reporting a TLS failure as a missing workflow sends the
            // user hunting for the wrong problem.
            const emitted = lastEmittedError();
            console.error(chalk.red(emitted
                ? `❌ ${formatConnectionError(`Cannot reach workflow ${workflowId}`, emitted)}`
                : `❌ Workflow ${workflowId} not found on remote.`));
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
                process.exit(1);
            }
        }

        const spinner = ora(`Pulling workflow ${workflowId}...`).start();
        try {
            await syncManager.pull(workflowId);
            spinner.succeed(chalk.green(`✔ Pulled workflow ${workflowId}.`));
        } catch (e: any) {
            spinner.fail(formatConnectionError('Pull failed', lastEmittedError() ?? e));
            process.exit(1);
        }
    }

    async pushOne(filename: string, options?: { draft?: boolean }): Promise<string | undefined> {
        const syncConfig = await this.getSyncConfig();
        const syncManager = new SyncManager(this.client, syncConfig);
        const lastEmittedError = captureEmittedErrors(syncManager);

        // Populate local hash cache FIRST — required for accurate status in CLI mode
        await syncManager.refreshLocalState();

        // ⚠️ In pushOne(inputPath), we MUST NOT use syncManager.getWorkflowIdForFilename(inputPath)
        // because inputPath might be a relative path from CWD (e.g. workflows/...) 
        // while the internal tracker only knows about the flat basename.
        // We let syncManager.push() handle the expansion and resolution correctly.
        // For conflict detection BEFORE the actual push, we need the basename.
        
        let workflowId: string | undefined;
        let basename: string | undefined;
        let absolutePath: string | undefined;
        
        try {
            const pushTarget = syncManager.resolvePushTarget(filename);
            basename = pushTarget.filename;
            absolutePath = pushTarget.absolutePath;
            workflowId = syncManager.getWorkflowIdForFilename(pushTarget.filename);
        } catch (e) {
            // If normalization fails, let the actual push() call throw the clean error
        }

        if (workflowId && basename) {
            await syncManager.fetch(workflowId);

            const status = await syncManager.getSingleWorkflowDetailedStatus(workflowId, basename);
            if (status.status === WorkflowSyncStatus.CONFLICT) {
                await syncManager.recordWorkflowPushRejected(basename, workflowId, 'Conflict detected before push');
                console.log(chalk.red(`💥 Conflict detected for workflow ${workflowId}.`));
                console.log(chalk.yellow(`To resolve the conflict you can either:`));
                console.log(`  n8nac resolve ${workflowId} --mode keep-current`);
                console.log(`  n8nac resolve ${workflowId} --mode keep-incoming`);
                process.exit(1);
            }
        }

        // Pre-push node validation. The bundled schema (local, always available)
        // rejects node configurations n8n itself refuses — and when the instance
        // exposes its MCP server, the instance's own schema is consulted first and
        // is authoritative. A workflow whose nodes the instance rejects must never
        // be deployed — n8n would store it, but it would be broken in the UI and
        // fail at run time. Escalate to "push anyway" with N8NAC_PUSH_SKIP_VALIDATION=1.
        if (absolutePath) {
            const outcome = await this.runPrePushValidation(absolutePath);
            if (outcome) {
                if (!outcome.valid) {
                    if (basename && workflowId) {
                        await syncManager.recordWorkflowPushRejected(basename, workflowId, 'Pre-push node validation failed');
                    }
                    console.log(chalk.red(`\n❌ ${outcome.issues.length} node(s) would be rejected by n8n. Push aborted before any remote change.\n`));
                    for (const issue of outcome.issues) {
                        const nodeLabel = issue.name ? chalk.bold(`[${issue.name}]`) : '';
                        console.log(chalk.red(`  • ${nodeLabel} ${chalk.dim(issue.type)}`));
                        for (const err of issue.errors) {
                            console.log(chalk.red(`      - ${err.message}`));
                        }
                    }
                    if (outcome.serverUnavailableReason) {
                        console.log(chalk.dim(`\n  (${outcome.serverUnavailableReason})`));
                    }
                    console.log(chalk.yellow('\n  Fix the reported node parameters, then push again.'));
                    process.exit(1);
                }
                if (outcome.serverUnavailableReason) {
                    // The workflow is valid against the bundled schema, but the
                    // instance-side check that was attempted could not run. When the
                    // user explicitly configured instance validation this is a real
                    // signal; on the automatic probe it stays a quiet hint.
                    const notice = `Instance node validation unavailable (${outcome.serverUnavailableReason}); validated against the bundled schema.`;
                    console.warn(chalk.yellow(`⚠  ${notice}`));
                }
            }
        }

        const spinner = ora(`Pushing workflow ${filename}...`).start();

        // The engine emits this before the update lands, so the "this goes live"
        // notice is printed while it is still news rather than after the fact.
        let publishReport: IPushPublishReport | undefined;
        syncManager.on('publishState', (report: IPushPublishReport) => {
            publishReport = report;
            if (report.outcome !== 'goes-live') return;
            spinner.info(chalk.yellow(`⚠  "${filename}" is published — this push releases it to production.`));
            spinner.start(`Pushing workflow ${filename}...`);
        });

        try {
            const finalWorkflowId = await syncManager.push(filename, { draft: options?.draft === true });
            spinner.succeed(chalk.green(`✔ Pushed workflow ${filename}.`));
            this.reportPublishState(publishReport, finalWorkflowId);
            return finalWorkflowId;
        } catch (e: any) {
            if (e.message.includes('modified in the n8n UI')) {
                spinner.stop();
                console.log(chalk.red(`\n💥 Conflict detected: ${e.message}`));
                console.log(chalk.yellow(`To resolve the conflict you can either:`));
                if (workflowId) {
                    console.log(`  n8nac resolve ${workflowId} --mode keep-current`);
                    console.log(`  n8nac resolve ${workflowId} --mode keep-incoming`);
                }
                process.exit(1);
            }
            if (e.message.includes('archived on n8n') || e.message.includes('isArchived')) {
                spinner.stop();
                console.log(chalk.red(`\n💾 Workflow is archived: ${filename}`));
                console.log(chalk.yellow(`Archived workflows cannot receive updates via the API.`));
                process.exit(1);
            }
            spinner.fail(formatConnectionError('Push failed', lastEmittedError() ?? e));
            process.exit(1);
        }
    }

    /**
     * States what the push did to production, once it is done.
     *
     * `goes-live` is absent on purpose: it was already announced before the
     * update, which is the only moment where saying it is useful.
     */
    private reportPublishState(report: IPushPublishReport | undefined, workflowId: string | undefined): void {
        switch (report?.outcome) {
            case 'restores':
                console.log(chalk.dim(`📝 Draft updated — production still runs version ${report.versionId}.`));
                console.log(chalk.dim(`   Release it by pushing again without --draft.`));
                break;
            case 'not-published':
                console.log(chalk.dim(`📝 This workflow is not published, so nothing changed in production.`));
                break;
            case 'unknown':
                console.log(chalk.yellow(`⚠  Could not read the published version before pushing.`));
                console.log(chalk.yellow(`   If this workflow was published, production now runs the pushed content.`));
                if (workflowId) console.log(chalk.dim(`   Check its version history in the n8n UI (workflow ${workflowId}).`));
                break;
        }
    }

    async fetchOne(workflowId: string): Promise<void> {
        const spinner = ora(`Fetching remote state for workflow ${workflowId}...`).start();
        // Declared out here so the catch below can still reach it.
        let lastEmittedError: () => Error | undefined = () => undefined;
        try {
            const syncConfig = await this.getSyncConfig();
            const syncManager = new SyncManager(this.client, syncConfig);
            lastEmittedError = captureEmittedErrors(syncManager);

            // Fetch remote state for this specific workflow (updates internal cache)
            const success = await syncManager.fetch(workflowId);
            if (!success) {
                // `fetch` returns false both for a genuinely absent workflow and for a failed
                // request, so report the emitted cause when there was one — otherwise a TLS or
                // transport failure is announced as a missing workflow.
                const emitted = lastEmittedError();
                if (emitted) {
                    spinner.fail(formatConnectionError(`Failed to fetch workflow ${workflowId}`, emitted));
                    process.exit(1);
                }
                spinner.fail(`Workflow ${workflowId} not found on remote.`);
                process.exit(1);
            }
            
            spinner.succeed(chalk.green(`✔ Fetched remote state for workflow ${workflowId}.`));
        } catch (e: any) {
            spinner.fail(formatConnectionError('Fetch failed', lastEmittedError() ?? e));
            process.exit(1);
        }
    }

    async resolveOne(workflowId: string, resolution: 'keep-current' | 'keep-incoming'): Promise<void> {
        const resLabel = resolution === 'keep-current' ? 'current (local)' : 'incoming (remote)';
        const spinner = ora(`Resolving conflict for ${workflowId} (keeping ${resLabel})...`).start();
        // Declared out here so the catch below can still reach it.
        let lastEmittedError: () => Error | undefined = () => undefined;
        try {
            const syncConfig = await this.getSyncConfig();
            const syncManager = new SyncManager(this.client, syncConfig);
            lastEmittedError = captureEmittedErrors(syncManager);

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
            spinner.fail(formatConnectionError('Resolution failed', lastEmittedError() ?? e));
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
            await this.prepareRuntimeContext();
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

    /**
     * Validate a local workflow file before anything is written to the instance.
     *
     * Validation is driven by the environment's native MCP usage level
     * (cumulative ladder, see `IWorkspaceNativeMcpLevel`):
     *   level 0 — bundled ontology only, no MCP call at all;
     *   level 1 — refresh the per-instance schema overlay from `get_node_types`
     *             (lazy per node type, TTL-cached), then validate locally against
     *             the merged bundled+overlay schema — economical across pushes;
     *   level ≥ 2 — validate live against the instance's `validate_node_config`
     *             (authoritative, immune to bundled-schema drift).
     *
     * Returns null when validation is skipped (opt-out env var, or the workflow
     * file cannot be compiled locally — the push itself then reports the real
     * compile error).
     */
    private async runPrePushValidation(absolutePath: string): Promise<Awaited<ReturnType<PreflightNodeValidator['validateFile']>> | null> {
        if (/^(1|true|yes|on)$/i.test(process.env.N8NAC_PUSH_SKIP_VALIDATION || '')) {
            return null;
        }

        const environment = this.activeEnvironment;
        const host = environment?.host || this.config?.host;
        const nativeMcp = environment?.nativeMcp;
        const level = effectiveNativeMcpLevel(nativeMcp, process.env.N8NAC_NATIVE_MCP_LEVEL);

        const validatorOptions: PreflightNodeValidatorOptions = {};

        if (level >= 1 && host) {
            const endpoint = nativeMcp?.url || `${host.replace(/\/+$/, '')}/mcp-server/http`;
            let token: string | undefined;
            try {
                token = this.configService.getNativeMcpToken(environment?.environmentId) || environment?.apiKey;
            } catch {
                token = environment?.apiKey;
            }
            const timeoutMs = nativeMcp?.timeoutMs ?? 10000;

            if (level >= 2) {
                validatorOptions.endpoint = endpoint;
                validatorOptions.token = token;
                validatorOptions.timeoutMs = timeoutMs;
            } else {
                // Level 1: schema overlay, validated locally. The overlay path is
                // deterministic; the beforeValidate hook fetches whatever is
                // missing or expired for this workflow's node types.
                const cacheDir = environment?.workflowsPath || this.config?.directory;
                const overlay = new SchemaOverlayManager({ endpoint, token, timeoutMs, cacheDir });
                let overlayUsable = true;
                validatorOptions.customNodesPath = () => (overlayUsable ? overlay.providerFilePath : undefined);
                validatorOptions.beforeValidate = async (workflow) => {
                    try {
                        const { failed } = await overlay.ensureForTypes(SchemaOverlayManager.collectNodeTypes(workflow));
                        if (failed.length > 0) {
                            console.warn(chalk.yellow(`⚠  Schema overlay incomplete (${failed.join(', ')} not described by the instance); those nodes fall back to the bundled schema.`));
                        }
                    } catch (error: any) {
                        // Overlay refresh failed (unreachable/unauthorised):
                        // fall back to the bundled schema for this push, and surface it.
                        overlayUsable = false;
                        console.warn(chalk.yellow(`⚠  Schema overlay refresh unavailable (${error?.message || error}); validating against the bundled schema.`));
                    }
                };
            }
        }

        const validator = new PreflightNodeValidator(validatorOptions);
        try {
            return await validator.validateFile(absolutePath);
        } catch (error: any) {
            // Compilation failure: the push below fails identically and reports
            // the error through its own path, so do not mask it here.
            console.warn(chalk.yellow(`⚠  Pre-push validation could not compile the workflow: ${error?.message || error}`));
            return null;
        }
    }

}
