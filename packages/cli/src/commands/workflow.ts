import chalk from 'chalk';

import { BaseCommand } from './base.js';

export class WorkflowCommand extends BaseCommand {
    /**
     * n8nac workflow activate <id>
     * Activate (publish) a workflow so it can be triggered and executed.
     */
    async activate(workflowId: string): Promise<void> {
        const ok = await this.client.activateWorkflow(workflowId, true);
        if (ok) {
            console.log(chalk.green(`✅ Workflow ${workflowId} activated.`));
        } else {
            console.error(chalk.red(`❌ Failed to activate workflow ${workflowId}.`));
            process.exit(1);
        }
    }

    /**
     * n8nac workflow deactivate <id>
     * Deactivate a workflow (stops triggers from firing).
     */
    async deactivate(workflowId: string): Promise<void> {
        const ok = await this.client.activateWorkflow(workflowId, false);
        if (ok) {
            console.log(chalk.green(`✅ Workflow ${workflowId} deactivated.`));
        } else {
            console.error(chalk.red(`❌ Failed to deactivate workflow ${workflowId}.`));
            process.exit(1);
        }
    }

    /**
     * n8nac workflow credential-required <workflowId>
     *
     * Fetches the workflow from the remote instance and extracts all credential
     * references declared in its nodes. For each referenced credential type it
     * checks whether a credential with that name already exists on the instance.
     *
     * Exit codes:
     *   0 — all credentials present (or no credentials needed)
     *   1 — at least one credential is missing (suitable for agent loop: exit 1 = act)
     *
     * Output (stdout):
     *   Table (human TTY) or JSON array (piped / --json flag) of:
     *   { nodeName, credentialType, credentialName, exists }
     */
    async credentialRequired(workflowId: string, options: { json?: boolean } = {}): Promise<void> {
        const workflow = await this.client.getWorkflow(workflowId);
        if (!workflow) {
            console.error(chalk.red(`❌ Workflow ${workflowId} not found.`));
            process.exit(1);
        }

        const nodes: Array<Record<string, unknown>> = (workflow as any).nodes ?? [];

        // Collect all credential references from nodes
        const refs: Array<{ nodeName: string; credentialType: string; credentialName: string }> = [];
        for (const node of nodes) {
            const nodeName = String(node['name'] ?? '');
            const credMap = node['credentials'] as Record<string, { id?: string; name?: string }> | undefined;
            if (!credMap) continue;
            for (const [credType, credRef] of Object.entries(credMap)) {
                refs.push({
                    nodeName,
                    credentialType: credType,
                    credentialName: String(credRef?.name ?? ''),
                });
            }
        }

        if (refs.length === 0) {
            if (options.json) {
                console.log('[]');
            } else {
                console.log(chalk.green('✅ No credentials required by this workflow.'));
            }
            process.exit(0);
        }

        // Fetch existing credentials to check which are already provisioned
        const existing = await this.client.listCredentials();
        const existingNames = new Set(existing.map((c) => String(c['name'] ?? '')));

        const results = refs.map((ref) => ({
            nodeName: ref.nodeName,
            credentialType: ref.credentialType,
            credentialName: ref.credentialName,
            exists: existingNames.has(ref.credentialName),
        }));

        if (options.json) {
            console.log(JSON.stringify(results, null, 2));
        } else {
            const missing = results.filter((r) => !r.exists);
            const present = results.filter((r) => r.exists);

            if (present.length > 0) {
                console.log(chalk.dim('\nCredentials already present:'));
                for (const r of present) {
                    console.log(chalk.green(`  ✅ ${r.credentialName} (${r.credentialType}) — used by "${r.nodeName}"`));
                }
            }
            if (missing.length > 0) {
                console.log(chalk.dim('\nMissing credentials:'));
                for (const r of missing) {
                    console.log(chalk.yellow(`  ⚠️  ${r.credentialName} (type: ${r.credentialType}) — required by "${r.nodeName}"`));
                    console.log(chalk.dim(`     → n8nac credential schema ${r.credentialType}`));
                    console.log(chalk.dim(`     → n8nac credential create --type ${r.credentialType} --name "${r.credentialName}" --file cred.json`));
                }
            } else {
                console.log(chalk.green('\n✅ All credentials are already provisioned.'));
            }
        }

        const hasMissing = results.some((r) => !r.exists);
        process.exit(hasMissing ? 1 : 0);
    }
}
