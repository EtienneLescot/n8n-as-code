import { readFileSync } from 'fs';
import chalk from 'chalk';
import Table from 'cli-table3';

import { BaseCommand } from './base.js';

export class CredentialCommand extends BaseCommand {
    private isObject(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    private parseCredentialInput(raw: string, source: '--data' | '--file', filePath?: string): Record<string, unknown> {
        let parsed: unknown;

        try {
            parsed = JSON.parse(raw);
        } catch {
            if (source === '--file') {
                console.error(chalk.red(`❌ Could not read or parse file: ${filePath}`));
            } else {
                console.error(chalk.red('❌ --data is not valid JSON'));
            }
            process.exit(1);
        }

        if (!this.isObject(parsed)) {
            const label = source === '--file' ? `JSON in ${filePath}` : '--data';
            console.error(chalk.red(`❌ ${label} must be a JSON object.`));
            process.exit(1);
        }

        return parsed;
    }

    private inferConditionalBooleanDefaults(
        schema: Record<string, unknown>,
        input: Record<string, unknown>,
    ): {
        data: Record<string, unknown>;
        applied: Array<{ field: string; value: boolean }>;
    } {
        const next = { ...input };
        const applied: Array<{ field: string; value: boolean }> = [];
        const properties = this.isObject(schema.properties) ? schema.properties : {};
        const allOf = Array.isArray(schema.allOf) ? schema.allOf : [];

        for (const condition of allOf) {
            if (!this.isObject(condition)) continue;
            const ifBlock = this.isObject(condition.if) ? condition.if : null;
            const ifProperties = ifBlock && this.isObject(ifBlock.properties) ? ifBlock.properties : {};

            for (const [field, fieldRule] of Object.entries(ifProperties)) {
                if (field in next) continue;
                if (!this.isObject(fieldRule)) continue;

                const propertySchema = properties[field];
                if (!this.isObject(propertySchema) || propertySchema.type !== 'boolean') continue;

                const enumValues = Array.isArray(fieldRule.enum) ? fieldRule.enum : [];
                if (enumValues.length === 1 && enumValues[0] === true) {
                    next[field] = false;
                    applied.push({ field, value: false });
                }
            }
        }

        return { data: next, applied };
    }

    private shouldRetryWithSchemaDefaults(error: unknown): boolean {
        if (!error || typeof error !== 'object') return false;

        const status = (error as any).response?.status;
        const message = this.formatErrorDetails(error);

        return status === 400 && /does not match allOf schema|requires property/i.test(message);
    }

    private async createWithSchemaFallback(
        payload: {
            type: string;
            name: string;
            data: Record<string, unknown>;
            projectId?: string;
        },
        error: unknown,
    ): Promise<{
        result: Record<string, unknown>;
        applied: Array<{ field: string; value: boolean }>;
    } | null> {
        if (!this.shouldRetryWithSchemaDefaults(error)) {
            return null;
        }

        const schema = await this.client.getCredentialSchema(payload.type);
        const normalized = this.inferConditionalBooleanDefaults(schema, payload.data);

        if (normalized.applied.length === 0) {
            return null;
        }

        const result = await this.client.createCredential({
            ...payload,
            data: normalized.data,
        });

        return { result, applied: normalized.applied };
    }

    /**
     * n8nac credential schema <type>
     * Print the JSON Schema for a credential type so the caller knows what fields are required.
     */
    async schema(typeName: string, options: { json?: boolean } = {}): Promise<void> {
        try {
            const schema = await this.client.getCredentialSchema(typeName);
            console.log(JSON.stringify(schema, null, 2));
        } catch (error) {
            this.exitWithError(`Failed to fetch credential schema for type "${typeName}"`, error);
        }
    }

    /**
     * n8nac credential list
     * List all credentials (metadata only — secrets are never returned by the API).
     */
    async list(options: { json?: boolean } = {}): Promise<void> {
        try {
            const credentials = await this.client.listCredentials();
            if (options.json) {
                console.log(JSON.stringify(credentials, null, 2));
                return;
            }
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
        } catch (error) {
            this.exitWithError('Failed to list credentials', error);
        }
    }

    /**
     * n8nac credential get <id>
     * Print full credential metadata (no secrets) as JSON.
     */
    async get(id: string, options: { json?: boolean } = {}): Promise<void> {
        try {
            const credential = await this.client.getCredential(id);
            console.log(JSON.stringify(credential, null, 2));
        } catch (error) {
            this.exitWithError(`Failed to fetch credential ${id}`, error);
        }
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
        json?: boolean;
    }): Promise<void> {
        let credData: Record<string, unknown>;

        if (options.file) {
            let rawFile: string;
            try {
                rawFile = readFileSync(options.file, 'utf-8');
            } catch {
                console.error(chalk.red(`❌ Could not read or parse file: ${options.file}`));
                process.exit(1);
            }
            credData = this.parseCredentialInput(rawFile, '--file', options.file);
        } else if (options.data) {
            credData = this.parseCredentialInput(options.data, '--data');
        } else {
            console.error(chalk.red('❌ Provide --data <json> or --file <path> with the credential data.'));
            console.error(chalk.yellow(`Tip: run \`n8nac credential schema ${options.type}\` to see required fields.`));
            process.exit(1);
        }

        const payload = {
            type: options.type,
            name: options.name,
            data: credData,
            ...(options.projectId ? { projectId: options.projectId } : {}),
        };

        try {
            const result = await this.client.createCredential(payload);

            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
                return;
            }

            console.log(chalk.green(`✅ Credential "${options.name}" created (ID: ${result['id']})`));
        } catch (error) {
            try {
                const fallback = await this.createWithSchemaFallback(payload, error);
                if (fallback) {
                    if (options.json) {
                        console.log(JSON.stringify(fallback.result, null, 2));
                        return;
                    }

                    const defaultsText = fallback.applied
                        .map(({ field, value }) => `${field}=${String(value)}`)
                        .join(', ');
                    console.log(chalk.dim(`ℹ Applied schema defaults before retrying credential creation: ${defaultsText}`));
                    console.log(chalk.green(`✅ Credential "${options.name}" created (ID: ${fallback.result['id']})`));
                    return;
                }
            } catch {
                // Preserve the original validation error when schema discovery or retry fails.
            }

            this.exitWithError(`Failed to create credential "${options.name}"`, error);
        }
    }

    /**
     * n8nac credential delete <id>
     * Permanently delete a credential.
     */
    async delete(id: string): Promise<void> {
        try {
            const ok = await this.client.deleteCredential(id);
            if (ok) {
                console.log(chalk.green(`✅ Credential ${id} deleted.`));
            } else {
                this.exitWithError(`Failed to delete credential ${id}`);
            }
        } catch (error) {
            this.exitWithError(`Failed to delete credential ${id}`, error);
        }
    }
}
