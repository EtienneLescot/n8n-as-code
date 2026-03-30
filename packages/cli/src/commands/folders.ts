import { BaseCommand } from './base.js';
import { SyncManager, IFolder } from '../core/index.js';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';

export interface FoldersCommandOptions {
    raw?: boolean;
}

/**
 * Builds a visual tree string for a list of folders.
 * Returns rows as: ["  ├─ name", id]
 */
export function buildFolderTree(folders: IFolder[]): Array<{ indent: string; name: string; id: string; parentFolderId?: string | null }> {
    const childMap = new Map<string | null, IFolder[]>();
    for (const folder of folders) {
        const parent = folder.parentFolderId ?? null;
        if (!childMap.has(parent)) {
            childMap.set(parent, []);
        }
        childMap.get(parent)!.push(folder);
    }

    // Sort each level alphabetically
    for (const [, children] of childMap) {
        children.sort((a, b) => a.name.localeCompare(b.name));
    }

    const result: Array<{ indent: string; name: string; id: string; parentFolderId?: string | null }> = [];

    function walk(parentId: string | null, depth: number) {
        const children = childMap.get(parentId) ?? [];
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const isLast = i === children.length - 1;
            const connector = isLast ? '└─' : '├─';
            const indent = depth === 0 ? '' : '  '.repeat(depth - 1) + connector + ' ';
            result.push({
                indent,
                name: child.name,
                id: child.id,
                parentFolderId: child.parentFolderId,
            });
            walk(child.id, depth + 1);
        }
    }

    walk(null, 0);
    return result;
}

export class FoldersCommand extends BaseCommand {
    async run(options?: FoldersCommandOptions): Promise<void> {
        const spinner = ora('Fetching folders...').start();

        try {
            const syncConfig = await this.getSyncConfig();
            const syncManager = new SyncManager(this.client, syncConfig);

            const folders = await syncManager.getFolders();

            spinner.stop();

            if (options?.raw) {
                console.log(JSON.stringify(folders, null, 2));
                return;
            }

            const localConfig = this.configService.getLocalConfig();
            if (localConfig.projectName) {
                console.log(chalk.cyan(`\n📁 Project: ${chalk.bold(localConfig.projectName)}`));
            }

            if (folders.length === 0) {
                console.log(chalk.yellow('\nNo folders found.'));
                console.log(chalk.gray('Folders require n8n ≥ 1.68. On self-hosted Community Edition, register'));
                console.log(chalk.gray('your instance for a free license key (Settings → Usage and Plan → Unlock).'));
                console.log(chalk.gray('You can enable folder mirroring in n8nac-config.json with: "folderSync": true'));
                return;
            }

            const tree = buildFolderTree(folders);

            const table = new Table({
                head: [
                    chalk.bold('Folder'),
                    chalk.bold('ID'),
                ],
                wordWrap: true,
            });

            for (const row of tree) {
                table.push([
                    `${row.indent}${chalk.cyan(row.name)}`,
                    chalk.gray(row.id),
                ]);
            }

            console.log('\n' + table.toString() + '\n');
            console.log(chalk.gray(`  ${folders.length} folder${folders.length === 1 ? '' : 's'} total`));

            if (!syncConfig.folderSync) {
                console.log(chalk.yellow('\n  💡 Tip: Enable "folderSync": true in n8nac-config.json to mirror this folder'));
                console.log(chalk.yellow('  hierarchy as local subdirectories when pulling workflows.'));
            }
            console.log();
        } catch (error: any) {
            spinner.stop();
            console.error(chalk.red(`❌ Failed to list folders: ${error.message}`));
            process.exit(1);
        }
    }
}
