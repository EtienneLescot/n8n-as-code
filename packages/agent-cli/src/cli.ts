#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { NodeSchemaProvider } from './services/node-schema-provider.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const getVersion = () => {
    try {
        const pkgPath = join(__dirname, '../package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        return pkg.version;
    } catch {
        return '0.1.0';
    }
};

const program = new Command();
const provider = new NodeSchemaProvider();

program
    .name('n8n-agent')
    .description('AI Agent Tools for accessing n8n documentation')
    .version(getVersion());

// 1. Search
program
    .command('search')
    .description('Fuzzy search for nodes')
    .argument('<query>', 'Search term (e.g. "google sheets")')
    .action((query) => {
        try {
            const results = provider.searchNodes(query);
            console.log(JSON.stringify(results, null, 2));
        } catch (error: any) {
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

// 2. Get Schema
program
    .command('get')
    .description('Get full JSON schema for a specific node')
    .argument('<name>', 'Node name (camelCase, e.g. httpRequest)')
    .action((name) => {
        try {
            const schema = provider.getNodeSchema(name);
            if (schema) {
                console.log(JSON.stringify(schema, null, 2));
            } else {
                console.error(chalk.red(`Node '${name}' not found.`));
                process.exit(1);
            }
        } catch (error: any) {
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

// 3. List All
program
    .command('list')
    .description('List all available nodes (compact)')
    .action(() => {
        try {
            const list = provider.listAllNodes();
            console.log(JSON.stringify(list, null, 2));
        } catch (error: any) {
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

program.parse(process.argv);
