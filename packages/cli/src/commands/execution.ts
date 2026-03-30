import chalk from 'chalk';
import Table from 'cli-table3';

import { BaseCommand } from './base.js';
import { ExecutionStatus } from '../core/index.js';

export class ExecutionCommand extends BaseCommand {
    async list(options: {
        workflowId?: string;
        status?: ExecutionStatus;
        projectId?: string;
        limit?: number;
        cursor?: string;
        includeData?: boolean;
        json?: boolean;
    } = {}): Promise<void> {
        try {
            const result = await this.client.listExecutions(options);

            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
                return;
            }

            if (result.data.length === 0) {
                console.log(chalk.yellow('No executions found.'));
                return;
            }

            const table = new Table({
                head: [
                    chalk.bold('ID'),
                    chalk.bold('Status'),
                    chalk.bold('Mode'),
                    chalk.bold('Workflow'),
                    chalk.bold('Started'),
                    chalk.bold('Stopped'),
                ],
                wordWrap: true,
            });

            for (const execution of result.data) {
                table.push([
                    execution.id,
                    execution.status,
                    execution.mode,
                    execution.workflowId,
                    execution.startedAt || '-',
                    execution.stoppedAt || '-',
                ]);
            }

            console.log(`\n${table.toString()}\n`);
            console.log(chalk.dim(`Total returned: ${result.data.length}`));
            if (result.nextCursor) {
                console.log(chalk.dim(`Next cursor: ${result.nextCursor}`));
            }
        } catch (error) {
            this.exitWithError('Failed to list executions', error);
        }
    }

    async get(id: string, options: { includeData?: boolean; json?: boolean } = {}): Promise<void> {
        try {
            const execution = await this.client.getExecution(id, { includeData: options.includeData });
            console.log(JSON.stringify(execution, null, 2));
        } catch (error) {
            this.exitWithError(`Failed to fetch execution ${id}`, error);
        }
    }
}
