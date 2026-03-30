import { BaseCommand } from './base.js';
import { ITestResult } from '../core/index.js';
import chalk from 'chalk';
import ora from 'ora';

export class TestCommand extends BaseCommand {
    private isObject(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    private parseJsonOption(label: '--data' | '--query', raw?: string): Record<string, unknown> | symbol | undefined {
        if (!raw) return undefined;

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            console.error(chalk.red(`❌ ${label} must be valid JSON. Got: ${raw}`));
            return Symbol.for('n8nac.invalid-json');
        }

        if (!this.isObject(parsed)) {
            console.error(chalk.red(`❌ ${label} must be a JSON object.`));
            return Symbol.for('n8nac.invalid-json');
        }

        return parsed;
    }

    /**
     * `n8nac test <workflowId>`
     *
     * Detects the workflow's trigger type, builds the appropriate test-mode
     * URL, and fires an HTTP request against it.
     *
     * Returns the exit code instead of calling process.exit() directly,
     * making the logic unit-testable. The commander action in index.ts calls
     * process.exit() with the returned value.
     *
     * Exit codes:
     *   0 — success OR Class A error (config gap — inform user, do not block)
     *   1 — Class B error (wiring error — agent should fix and re-test)
     *   1 — fatal infrastructure error (workflow not found, no trigger, etc.)
     */
    async run(workflowId: string, options: { data?: string; query?: string; prod?: boolean }): Promise<number> {
        const parsedData = this.parseJsonOption('--data', options.data);
        if (parsedData === Symbol.for('n8nac.invalid-json')) return 1;

        const parsedQuery = this.parseJsonOption('--query', options.query);
        if (parsedQuery === Symbol.for('n8nac.invalid-json')) return 1;

        const mode = options.prod ? 'production' : 'test';
        const spinner = ora(`Testing workflow ${workflowId} (${mode} mode)...`).start();

        let result: ITestResult;
        try {
            result = await this.client.testWorkflow(workflowId, {
                data: parsedData ?? {},
                query: parsedQuery,
                prod: options.prod ?? false,
            });
        } catch (err: any) {
            spinner.fail(`Unexpected error: ${String(err?.message ?? err)}`);
            return 1;
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
            console.log('');
            console.log(chalk.dim(`To inspect the resulting server-side execution:`));
            console.log(chalk.dim(`  • n8nac execution list --workflow-id ${workflowId} --limit 5 --json`));
            console.log(chalk.dim(`  • n8nac execution get <executionId> --include-data --json`));
            if (options.prod) {
                console.log(chalk.dim(`  • A 2xx production webhook response only confirms that n8n accepted the trigger.`));
                console.log(chalk.dim(`    The execution itself may still fail later on the server.`));
            }
            return 0;
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
            return 0;
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
            return 0;
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
        return 1;
    }
}
