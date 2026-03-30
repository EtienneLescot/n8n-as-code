import { readFileSync } from 'fs';
import chalk from 'chalk';
import Table from 'cli-table3';

import { BaseCommand } from './base.js';

export class CredentialCommand extends BaseCommand {
    /**
     * n8nac credential schema <type>
     * Print the JSON Schema for a credential type so the caller knows what fields are required.
     */
    async schema(typeName: string): Promise<void> {
        const schema = await this.client.getCredentialSchema(typeName);
        console.log(JSON.stringify(schema, null, 2));
    }

    /**
     * n8nac credential list
     * List all credentials (metadata only — secrets are never returned by the API).
     */
    async list(): Promise<void> {
        const credentials = await this.client.listCredentials();
        if (credentials.length === 0) {
            console.log(chalk.yellow('No credentials found.'));
            return;
        }
        const table = new Table({
            head: [chalk.white('ID'), chalk.white('Name'), chalk.white('Type')],
            style: { head: [], border: [] },
        });
        for (const cred of credentials) {
            table.push([
                String(cred['id'] ?? ''),
                String(cred['name'] ?? ''),
                String(cred['type'] ?? ''),
            ]);
        }
        console.log(table.toString());
        console.log(chalk.dim(`\nTotal: ${credentials.length} credential(s)`));
    }

    /**
     * n8nac credential get <id>
     * Print full credential metadata (no secrets) as JSON.
     */
    async get(id: string): Promise<void> {
        const credential = await this.client.getCredential(id);
        console.log(JSON.stringify(credential, null, 2));
    }

    /**
     * n8nac credential create --type <type> --name <name> [--data <json>|--file <path>]
     * Create a new credential from inline JSON or a file.
     * Prefer --file over --data to avoid secrets appearing in shell history.
     */
    async create(options: {
        type: string;
        name: string;
        data?: string;
        file?: string;
        projectId?: string;
    }): Promise<void> {
        let credData: Record<string, unknown>;

        if (options.file) {
            try {
                credData = JSON.parse(readFileSync(options.file, 'utf-8'));
            } catch {
                console.error(chalk.red(`❌ Could not read or parse file: ${options.file}`));
                process.exit(1);
            }
        } else if (options.data) {
            try {
                credData = JSON.parse(options.data);
            } catch {
                console.error(chalk.red('❌ --data is not valid JSON'));
                process.exit(1);
            }
        } else {
            console.error(chalk.red('❌ Provide --data <json> or --file <path> with the credential data.'));
            console.error(chalk.yellow(`Tip: run \`n8nac credential schema ${options.type}\` to see required fields.`));
            process.exit(1);
        }

        const result = await this.client.createCredential({
            type: options.type,
            name: options.name,
            data: credData,
            ...(options.projectId ? { projectId: options.projectId } : {}),
        });
        console.log(chalk.green(`✅ Credential "${options.name}" created (ID: ${result['id']})`));
    }

    /**
     * n8nac credential delete <id>
     * Permanently delete a credential.
     */
    async delete(id: string): Promise<void> {
        const ok = await this.client.deleteCredential(id);
        if (ok) {
            console.log(chalk.green(`✅ Credential ${id} deleted.`));
        } else {
            console.error(chalk.red(`❌ Failed to delete credential ${id}`));
            process.exit(1);
        }
    }
}
