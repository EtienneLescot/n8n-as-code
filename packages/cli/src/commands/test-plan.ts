import chalk from 'chalk';
import ora from 'ora';
import { BaseCommand } from './base.js';
import { ITestPlan } from '../core/index.js';

export class TestPlanCommand extends BaseCommand {
    async run(workflowId: string, options: { json?: boolean }): Promise<void> {
        const spinner = ora(`Inspecting test plan for workflow ${workflowId}...`).start();

        let plan: ITestPlan;
        try {
            plan = await this.client.getTestPlan(workflowId);
        } catch (err: any) {
            spinner.fail(`Unexpected error: ${err.message}`);
            process.exit(1);
        }

        spinner.stop();

        if (options.json) {
            console.log(JSON.stringify(plan, null, 2));
            process.exit(plan.testable ? 0 : 1);
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
            process.exit(1);
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

        if (plan.payload) {
            console.log(chalk.dim('\nSuggested payload:'));
            console.log(chalk.white(JSON.stringify(plan.payload.inferred ?? {}, null, 2)));
            console.log(chalk.dim(`Confidence: ${plan.payload.confidence}`));

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

        process.exit(0);
    }
}
