import chalk from 'chalk';
import ora from 'ora';
import { BaseCommand } from './base.js';
import { ITestPlan } from '../core/index.js';

export class TestPlanCommand extends BaseCommand {
    /**
     * Returns the exit code instead of calling process.exit() directly,
     * making the logic unit-testable. The commander action in index.ts calls
     * process.exit() with the returned value.
     *
     * Exit codes:
     *   0 — workflow is testable via HTTP
     *   1 — workflow is not testable (schedule, unknown trigger, or fetch error)
     */
    async run(workflowId: string, options: { json?: boolean }): Promise<number> {
        const spinner = ora(`Inspecting test plan for workflow ${workflowId}...`).start();

        let plan: ITestPlan;
        try {
            plan = await this.client.getTestPlan(workflowId);
        } catch (err: any) {
            spinner.fail(`Unexpected error: ${String(err?.message ?? err)}`);
            return 1;
        }

        spinner.stop();

        if (options.json) {
            console.log(JSON.stringify(plan, null, 2));
            return plan.testable ? 0 : 1;
        }

        if (plan.workflowName) {
            console.log(chalk.dim('Workflow: ') + chalk.bold(plan.workflowName) + chalk.dim(` (${workflowId})`));
        }

        if (!plan.testable) {
            console.log(chalk.yellow('\nNot testable via HTTP'));
            console.log(chalk.yellow(`Reason: ${plan.reason}`));
            if (plan.triggerInfo) {
                console.log(
                    chalk.dim('Trigger: ') +
                    chalk.bold(plan.triggerInfo.nodeName) +
                    chalk.dim(` [${plan.triggerInfo.type}]`)
                );
            }
            return 1;
        }

        const trigger = plan.triggerInfo!;
        console.log(chalk.green('\nTestable via HTTP'));
        console.log(
            chalk.dim('Trigger: ') +
            chalk.bold(trigger.nodeName) +
            chalk.dim(` [${trigger.type}]`) +
            (trigger.httpMethod ? chalk.dim(` ${trigger.httpMethod}`) : '')
        );
        if (plan.endpoints.testUrl) {
            console.log(chalk.dim('Test URL: ') + chalk.cyan(plan.endpoints.testUrl));
        }
        if (plan.endpoints.productionUrl) {
            console.log(chalk.dim('Prod URL: ') + chalk.cyan(plan.endpoints.productionUrl));
        }

        if (trigger.type === 'webhook' || trigger.type === 'form') {
            console.log(chalk.dim('\nActivation notes:'));
            console.log(chalk.dim(`- Test URLs are temporary and usually require a manual arm step in the n8n editor.`));
            console.log(chalk.dim(`- Click "Execute workflow" or "Listen for test event" before calling the test URL.`));
            console.log(chalk.dim(`- Production URLs should work only after the workflow is active/published.`));
        }

        if (plan.payload) {
            console.log(chalk.dim('\nSuggested payload:'));
            console.log(chalk.white(JSON.stringify(plan.payload.inferred, null, 2)));
            console.log(chalk.dim(`Confidence: ${plan.payload.confidence}`));

            const httpMethod = (trigger.httpMethod ?? 'POST').toUpperCase();
            if (httpMethod === 'GET' || httpMethod === 'HEAD') {
                console.log(chalk.dim('\nRequest hint:'));
                console.log(chalk.dim(`- This trigger uses ${httpMethod}.`));
                console.log(chalk.dim(`- Run \`n8nac test ${workflowId} --query '<json>'\` for explicit query params.`));
                console.log(chalk.dim(`- \`--data\` also maps to query params for ${httpMethod} requests.`));
            }

            if (plan.payload.fields.length > 0) {
                console.log(chalk.dim('\nObserved fields:'));
                for (const field of plan.payload.fields) {
                    console.log(chalk.dim(`- ${field.source}.${field.path}`));
                }
            }

            if (plan.payload.notes.length > 0) {
                console.log(chalk.dim('\nNotes:'));
                for (const note of plan.payload.notes) {
                    console.log(chalk.dim(`- ${note}`));
                }
            }
        }

        return 0;
    }
}
