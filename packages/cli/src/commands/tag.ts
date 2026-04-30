import chalk from 'chalk';
import Table from 'cli-table3';

import { BaseCommand } from './base.js';
import { ITag, IWorkflow } from '../core/index.js';

export class TagCommand extends BaseCommand {
    private normalizeTagName(tagName: string): string {
        const normalized = tagName.trim();
        if (!normalized) {
            this.exitWithError('Tag name cannot be empty');
        }
        return normalized;
    }

    private tagNames(tags: ITag[] | undefined): string[] {
        return (tags || []).map(tag => tag.name).filter(Boolean);
    }

    private workflowHasTag(workflow: IWorkflow, tagName: string): boolean {
        return this.tagNames(workflow.tags).some(tag => tag.toLowerCase() === tagName.toLowerCase());
    }

    private async getOrCreateTag(tagName: string): Promise<ITag> {
        const existing = (await this.client.getTags())
            .find(tag => tag.name.toLowerCase() === tagName.toLowerCase());

        return existing || this.client.createTag(tagName);
    }

    async list(options: { json?: boolean } = {}): Promise<void> {
        try {
            const tags = await this.client.getTags();

            if (options.json) {
                console.log(JSON.stringify(tags, null, 2));
                return;
            }

            if (tags.length === 0) {
                console.log(chalk.yellow('No tags found.'));
                return;
            }

            const table = new Table({
                head: [chalk.white('ID'), chalk.white('Name')],
                style: { head: [], border: [] },
            });

            for (const tag of tags) {
                table.push([tag.id, tag.name]);
            }

            console.log(table.toString());
            console.log(chalk.dim(`\nTotal: ${tags.length} tag(s)`));
        } catch (error) {
            this.exitWithError('Failed to list tags', error);
        }
    }

    async workflows(tagName: string, options: { json?: boolean } = {}): Promise<void> {
        const normalizedTagName = this.normalizeTagName(tagName);

        try {
            const syncConfig = await this.getSyncConfig();
            const workflows = await this.client.getAllWorkflows(syncConfig.projectId);
            const matches = workflows
                .filter(workflow => this.workflowHasTag(workflow, normalizedTagName))
                .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));

            if (options.json) {
                console.log(JSON.stringify(matches, null, 2));
                return;
            }

            if (matches.length === 0) {
                console.log(chalk.yellow(`No remote workflows found with tag "${normalizedTagName}".`));
                return;
            }

            const table = new Table({
                head: [chalk.white('ID'), chalk.white('Name'), chalk.white('Active')],
                style: { head: [], border: [] },
            });

            for (const workflow of matches) {
                table.push([workflow.id, workflow.name, workflow.active ? 'yes' : 'no']);
            }

            console.log(table.toString());
            console.log(chalk.dim(`\nTotal: ${matches.length} remote workflow(s)`));
        } catch (error) {
            this.exitWithError(`Failed to list remote workflows with tag "${normalizedTagName}"`, error);
        }
    }

    async attach(workflowId: string, tagName: string, options: { json?: boolean } = {}): Promise<void> {
        const normalizedTagName = this.normalizeTagName(tagName);

        try {
            const existingWorkflowTags = await this.client.getWorkflowTags(workflowId);
            const existing = existingWorkflowTags.find(tag => tag.name.toLowerCase() === normalizedTagName.toLowerCase());

            if (existing) {
                if (options.json) {
                    console.log(JSON.stringify({ workflowId, changed: false, tags: existingWorkflowTags }, null, 2));
                    return;
                }
                console.log(chalk.yellow(`Remote workflow ${workflowId} already has tag "${existing.name}".`));
                return;
            }

            const tag = await this.getOrCreateTag(normalizedTagName);
            const updatedTags = await this.client.updateWorkflowTags(workflowId, [...existingWorkflowTags, tag]);

            if (options.json) {
                console.log(JSON.stringify({ workflowId, changed: true, tags: updatedTags }, null, 2));
                return;
            }

            console.log(chalk.green(`✅ Attached tag "${tag.name}" to remote workflow ${workflowId}.`));
            console.log(chalk.dim(`Run \`n8nac pull ${workflowId}\` to refresh the local workflow file.`));
        } catch (error) {
            this.exitWithError(`Failed to attach tag "${normalizedTagName}" to remote workflow ${workflowId}`, error);
        }
    }

    async detach(workflowId: string, tagName: string, options: { json?: boolean } = {}): Promise<void> {
        const normalizedTagName = this.normalizeTagName(tagName);

        try {
            const existingWorkflowTags = await this.client.getWorkflowTags(workflowId);
            const nextTags = existingWorkflowTags
                .filter(tag => tag.name.toLowerCase() !== normalizedTagName.toLowerCase());

            if (nextTags.length === existingWorkflowTags.length) {
                if (options.json) {
                    console.log(JSON.stringify({ workflowId, changed: false, tags: existingWorkflowTags }, null, 2));
                    return;
                }
                console.log(chalk.yellow(`Remote workflow ${workflowId} does not have tag "${normalizedTagName}".`));
                return;
            }

            const updatedTags = await this.client.updateWorkflowTags(workflowId, nextTags);

            if (options.json) {
                console.log(JSON.stringify({ workflowId, changed: true, tags: updatedTags }, null, 2));
                return;
            }

            console.log(chalk.green(`✅ Detached tag "${normalizedTagName}" from remote workflow ${workflowId}.`));
            console.log(chalk.dim(`Run \`n8nac pull ${workflowId}\` to refresh the local workflow file.`));
        } catch (error) {
            this.exitWithError(`Failed to detach tag "${normalizedTagName}" from remote workflow ${workflowId}`, error);
        }
    }
}
