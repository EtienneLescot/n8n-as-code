import { BaseCommand } from './base.js';
import { ITestResult } from '../core/index.js';
import chalk from 'chalk';
import ora from 'ora';

export class TestCommand extends BaseCommand {

    /**
     * `n8nac test <workflowId>`
     *
     * Detects the workflow's trigger type, builds the appropriate test-mode
     * URL, and fires an HTTP request against it.
     *
     * Exit codes:
     *   0 — success OR Class A error (config gap — inform user, do not block)
     *   1 — Class B error (wiring error — agent should fix and re-test)
     *   1 — fatal infrastructure error (workflow not found, no trigger, etc.)
     */
    async run(workflowId: string, options: { data?: string; prod?: boolean }): Promise<void> {
        // Parse --data JSON if provided
        let parsedData: unknown = {};
        if (options.data) {
            try {
                parsedData = JSON.parse(options.data);
            } catch {
                console.error(chalk.red(`❌ --data must be valid JSON. Got: ${options.data}`));
                process.exit(1);
            }
        }

        const mode = options.prod ? 'production' : 'test';
        const spinner = ora(`Testing workflow ${workflowId} (${mode} mode)...`).start();

        let result: ITestResult;
        try {
            result = await this.client.testWorkflow(workflowId, {
                data: parsedData,
                prod: options.prod ?? false,
            });
        } catch (err: any) {
            spinner.fail(`Unexpected error: ${err.message}`);
            process.exit(1);
        }

        spinner.stop();

        // ── Print trigger info ────────────────────────────────────────────────
        if (result.triggerInfo) {
            const t = result.triggerInfo;
            console.log(
                chalk.dim(`Trigger: `) +
                chalk.bold(t.nodeName) +
                chalk.dim(` [${t.type}]`) +
                (t.httpMethod ? chalk.dim(` ${t.httpMethod}`) : '')
            );
        }

        if (result.webhookUrl) {
            console.log(chalk.dim(`URL: `) + chalk.cyan(result.webhookUrl));
        }

        // ── Success ───────────────────────────────────────────────────────────
        if (result.success) {
            console.log(chalk.green(`\n✔ Workflow executed successfully`));
            if (result.statusCode !== undefined) {
                console.log(chalk.dim(`Status: `) + chalk.bold(String(result.statusCode)));
            }
            if (result.responseData !== undefined && result.responseData !== null && result.responseData !== '') {
                console.log(chalk.dim(`\nResponse:`));
                const formatted =
                    typeof result.responseData === 'object'
                        ? JSON.stringify(result.responseData, null, 2)
                        : String(result.responseData);
                console.log(chalk.white(formatted));
            }
            process.exit(0);
        }

        // ── Not HTTP-triggerable (schedule, unknown, no trigger) ──────────────
        if (result.errorClass === null) {
            console.log(chalk.yellow(`\n⚠  ${result.errorMessage}`));
            if (result.notes) {
                for (const note of result.notes) {
                    console.log(chalk.dim(`   ${note}`));
                }
            }
            // Not a failure — just untestable via HTTP. Exit 0.
            process.exit(0);
        }

        // ── Class A: config gap ───────────────────────────────────────────────
        if (result.errorClass === 'config-gap') {
            console.log(chalk.yellow(`\n⚠  Configuration gap detected (Class A)`));
            console.log(chalk.yellow(`   ${result.errorMessage}`));
            console.log('');
            console.log(chalk.dim(`This is a legitimate setup task, not a code bug:`));
            console.log(chalk.dim(`  • Set the required credentials in the n8n UI`));
            console.log(chalk.dim(`  • Configure any missing LLM models or environment variables`));
            console.log(chalk.dim(`  • Then re-run: n8nac test ${workflowId}`));
            if (result.statusCode !== undefined) {
                console.log(chalk.dim(`\nHTTP status: ${result.statusCode}`));
            }
            // Exit 0 — this is informational, not something the agent can fix by editing code
            process.exit(0);
        }

        // ── Class B: wiring error ─────────────────────────────────────────────
        console.log(chalk.red(`\n❌ Workflow execution failed (Class B — wiring error)`));
        console.log(chalk.red(`   ${result.errorMessage}`));
        if (result.statusCode !== undefined) {
            console.log(chalk.dim(`HTTP status: ${result.statusCode}`));
        }
        if (result.responseData !== undefined && result.responseData !== null && result.responseData !== '') {
            console.log(chalk.dim(`\nError detail:`));
            const formatted =
                typeof result.responseData === 'object'
                    ? JSON.stringify(result.responseData, null, 2)
                    : String(result.responseData);
            console.log(chalk.red(formatted));
        }
        console.log('');
        console.log(chalk.dim(`This is a fixable structural error:`));
        console.log(chalk.dim(`  • Check node expressions and field names`));
        console.log(chalk.dim(`  • Fix the workflow, push it, and re-run: n8nac test ${workflowId}`));
        // Exit 1 — agent should iterate and fix this
        process.exit(1);
    }
}
