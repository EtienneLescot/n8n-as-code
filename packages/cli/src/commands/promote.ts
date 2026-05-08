import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { ConfigService, type IResolvedWorkspaceEnvironment } from '../services/config-service.js';
import { SyncCommand } from './sync.js';

export interface PromoteOptions {
    from: string;
    to: string;
    dryRun?: boolean;
    push?: boolean;
    overwrite?: boolean;
    json?: boolean;
}

export interface PromoteResult {
    sourceEnvironmentId: string;
    sourceEnvironmentName: string;
    targetEnvironmentId: string;
    targetEnvironmentName: string;
    sourcePath: string;
    targetPath: string;
    pushed: boolean;
    workflowId?: string;
    credentialCheckCommand?: string;
    dryRun: boolean;
}

export class PromoteCommand {
    constructor(private readonly configService = new ConfigService()) {}

    async run(sourceWorkflowPath: string, options: PromoteOptions): Promise<PromoteResult> {
        const source = await this.configService.prepareEnvironment(options.from);
        const target = await this.configService.prepareEnvironment(options.to);
        if (source.environmentId === target.environmentId) {
            throw new Error('Source and target environments must be different.');
        }

        const sourceRoot = this.getEnvironmentWorkflowRoot(source);
        const targetRoot = this.getEnvironmentWorkflowRoot(target);
        const sourcePath = path.resolve(sourceWorkflowPath);
        if (!fs.existsSync(sourcePath)) {
            throw new Error(`Source workflow not found: ${sourcePath}`);
        }
        const sourceRootRealPath = this.realpathExisting(sourceRoot);
        const sourceRealPath = this.realpathExisting(sourcePath);
        if (!this.isPathInside(sourceRealPath, sourceRootRealPath)) {
            throw new Error(`Source workflow must be inside the source environment sync scope: ${sourceRoot}`);
        }
        if (!sourcePath.endsWith('.workflow.ts')) {
            throw new Error('Promotion currently supports TypeScript workflow files (*.workflow.ts).');
        }

        const relativePath = path.relative(sourceRoot, sourcePath);
        const targetPath = path.resolve(targetRoot, relativePath);
        if (!this.isPathInside(targetPath, targetRoot)) {
            throw new Error('Resolved target path escapes the target environment sync scope.');
        }
        const targetRootRealPath = fs.existsSync(targetRoot) ? this.realpathExisting(targetRoot) : path.resolve(targetRoot);
        const targetParentRealPath = this.realpathExistingParent(path.dirname(targetPath));
        if (fs.existsSync(targetRoot) && targetParentRealPath && !this.isPathInside(targetParentRealPath, targetRootRealPath)) {
            throw new Error('Resolved target path escapes the target environment sync scope.');
        }
        const targetExists = fs.existsSync(targetPath);
        if (targetExists && !this.isPathInside(this.realpathExisting(targetPath), targetRootRealPath)) {
            throw new Error('Resolved target path escapes the target environment sync scope.');
        }
        if (targetExists && !options.overwrite && !options.dryRun) {
            throw new Error(`Target workflow already exists: ${targetPath}. Re-run with --overwrite to replace it.`);
        }
        const targetWorkflowId = targetExists ? readWorkflowDecoratorProperty(fs.readFileSync(targetPath, 'utf8'), 'id') : undefined;
        const adapted = adaptWorkflowForPromotion(fs.readFileSync(sourcePath, 'utf8'), {
            targetWorkflowId,
            targetProjectId: target.projectId,
            targetProjectName: target.projectName,
        });
        const result: PromoteResult = {
            sourceEnvironmentId: source.environmentId,
            sourceEnvironmentName: source.environmentName,
            targetEnvironmentId: target.environmentId,
            targetEnvironmentName: target.environmentName,
            sourcePath,
            targetPath,
            pushed: false,
            dryRun: Boolean(options.dryRun),
        };

        if (options.dryRun) {
            this.printResult(result, options);
            return result;
        }

        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, adapted, 'utf8');

        if (options.push !== false) {
            const previousEnvironment = process.env.N8NAC_ENVIRONMENT;
            try {
                process.env.N8NAC_ENVIRONMENT = target.environmentId;
                const workflowId = await new SyncCommand().pushOne(targetPath);
                result.workflowId = workflowId;
                result.pushed = Boolean(workflowId);
                result.credentialCheckCommand = workflowId
                    ? `n8nac --env ${quoteShellArg(target.environmentName)} workflow credential-required ${quoteShellArg(workflowId)}`
                    : undefined;
            } finally {
                if (previousEnvironment === undefined) {
                    delete process.env.N8NAC_ENVIRONMENT;
                } else {
                    process.env.N8NAC_ENVIRONMENT = previousEnvironment;
                }
            }
        }

        this.printResult(result, options);
        return result;
    }

    private getEnvironmentWorkflowRoot(environment: IResolvedWorkspaceEnvironment): string {
        if (!environment.workflowDir) {
            throw new Error(`Environment "${environment.environmentName}" is missing a resolved workflow directory. Check its API key, project, and instance identifier.`);
        }
        return path.resolve(environment.workflowDir);
    }

    private isPathInside(candidate: string, root: string): boolean {
        const relative = path.relative(path.resolve(root), path.resolve(candidate));
        return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    }

    private realpathExisting(targetPath: string): string {
        return fs.realpathSync.native(targetPath);
    }

    private realpathExistingParent(directoryPath: string): string | undefined {
        let current = path.resolve(directoryPath);
        while (!fs.existsSync(current)) {
            const parent = path.dirname(current);
            if (parent === current) return undefined;
            current = parent;
        }
        return this.realpathExisting(current);
    }

    private printResult(result: PromoteResult, options: PromoteOptions): void {
        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }
        const action = result.dryRun ? 'Would promote' : result.pushed ? 'Promoted and pushed' : 'Promoted';
        console.log(chalk.green(`✔ ${action} workflow from ${result.sourceEnvironmentName} to ${result.targetEnvironmentName}.`));
        console.log(chalk.dim(`  ${result.sourcePath}`));
        console.log(chalk.dim(`  -> ${result.targetPath}`));
        if (result.workflowId) {
            console.log(chalk.dim(`  remote workflow: ${result.workflowId}`));
        }
        if (result.credentialCheckCommand) {
            console.log(chalk.yellow(`  Check target credentials: ${result.credentialCheckCommand}`));
        }
    }
}

export function adaptWorkflowForPromotion(content: string, options: { targetWorkflowId?: string; targetProjectId?: string; targetProjectName?: string } = {}): string {
    let next = stripWorkflowDecoratorProperty(content, 'id');
    next = stripWorkflowDecoratorProperty(next, 'projectId');
    next = stripWorkflowDecoratorProperty(next, 'projectName');
    next = stripWorkflowDecoratorProperty(next, 'homeProject');
    next = stripWorkflowDecoratorProperty(next, 'isArchived');
    if (options.targetWorkflowId) {
        next = upsertWorkflowDecoratorProperty(next, 'id', quoteString(options.targetWorkflowId));
    }
    if (options.targetProjectId) {
        next = upsertWorkflowDecoratorProperty(next, 'projectId', quoteString(options.targetProjectId));
    }
    if (options.targetProjectName) {
        next = upsertWorkflowDecoratorProperty(next, 'projectName', quoteString(options.targetProjectName));
    }
    return next;
}

export function readWorkflowDecoratorProperty(content: string, property: string): string | undefined {
    const decorator = content.match(/@workflow\s*\(\s*\{[\s\S]*?\}\s*\)/)?.[0];
    if (!decorator) return undefined;
    const match = decorator.match(new RegExp(`${property}\\s*:\\s*(['"])(.*?)\\1`, 'm'));
    return match?.[2];
}

function stripWorkflowDecoratorProperty(content: string, property: string): string {
    const decoratorMatch = content.match(/@workflow\s*\(\s*\{[\s\S]*?\}\s*\)/);
    if (!decoratorMatch || decoratorMatch.index === undefined) return content;
    const decorator = decoratorMatch[0];
    const propertyPattern = new RegExp(`\\n?\\s*${property}\\s*:\\s*(?:'[^']*'|"[^"]*"|\`[^\`]*\`|true|false|\\{[\\s\\S]*?\\})\\s*,?`, 'm');
    const updated = decorator.replace(propertyPattern, '');
    return `${content.slice(0, decoratorMatch.index)}${updated}${content.slice(decoratorMatch.index + decorator.length)}`;
}

function upsertWorkflowDecoratorProperty(content: string, property: string, valueExpression: string): string {
    const stripped = stripWorkflowDecoratorProperty(content, property);
    const decoratorMatch = stripped.match(/@workflow\s*\(\s*\{[\s\S]*?\}\s*\)/);
    if (!decoratorMatch || decoratorMatch.index === undefined) return stripped;
    const decorator = decoratorMatch[0];
    const updated = decorator.replace(/@workflow\s*\(\s*\{/, (prefix) => `${prefix}\n  ${property}: ${valueExpression},`);
    return `${stripped.slice(0, decoratorMatch.index)}${updated}${stripped.slice(decoratorMatch.index + decorator.length)}`;
}

function quoteString(value: string): string {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function quoteShellArg(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}
