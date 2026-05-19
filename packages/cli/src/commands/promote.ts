import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { TypeScriptParser, WorkflowBuilder } from '@n8n-as-code/transformer';
import { ConfigService, type IResolvedWorkspaceEnvironment } from '../services/config-service.js';
import { N8nApiClient, type IWorkflow } from '../core/index.js';
import { WorkflowTransformerAdapter } from '../core/services/workflow-transformer-adapter.js';
import { SyncCommand } from './sync.js';

export interface PromoteOptions {
    from: string;
    to: string;
    dryRun?: boolean;
    push?: boolean;
    overwrite?: boolean;
    json?: boolean;
    promotionConfig?: string;
}

export interface PromotionSubstitution {
    kind: 'credential' | 'workflow' | 'metadata';
    nodeName?: string;
    field?: string;
    fromId?: string;
    fromName?: string;
    toId?: string;
    toName?: string;
    status: 'mapped' | 'pending-create' | 'unchanged';
}

export interface PromotionProblem {
    kind: 'credential' | 'workflow' | 'target-file';
    message: string;
    nodeName?: string;
    ref?: string;
}

export interface PromotionWorkflowResult {
    sourcePath: string;
    targetPath: string;
    sourceWorkflowId?: string;
    sourceWorkflowName: string;
    targetWorkflowId?: string;
    action: 'create' | 'update';
    status: 'planned' | 'written' | 'pushed' | 'blocked';
    substitutions: PromotionSubstitution[];
    problems: PromotionProblem[];
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
    routeKey: string;
    configPath: string;
    summary: {
        planned: number;
        created: number;
        updated: number;
        blocked: number;
        credentialMappings: number;
        workflowMappings: number;
    };
    workflows: PromotionWorkflowResult[];
}

export interface PromotionCommandDependencies {
    createClient?: (environment: IResolvedWorkspaceEnvironment) => PromotionRuntimeClient;
    pushWorkflow?: (targetEnvironment: IResolvedWorkspaceEnvironment, targetPath: string) => Promise<string | undefined>;
}

export interface PromotionRuntimeClient {
    getAllWorkflows(projectId?: string): Promise<IWorkflow[]>;
    listCredentials(): Promise<Array<Record<string, unknown>>>;
}

interface PromotionConfig {
    version: 1;
    routes: Record<string, PromotionRouteConfig>;
}

interface PromotionRouteConfig {
    bindings?: {
        workflows?: Record<string, string>;
        credentials?: Record<string, string>;
    };
    workflowOverrides?: Record<string, PromotionOverride>;
    credentialOverrides?: Record<string, PromotionOverride>;
    nameRules?: PromotionNameRule[];
}

interface PromotionOverride {
    targetId?: string;
    targetName?: string;
}

interface PromotionNameRule {
    kind?: 'credential' | 'workflow';
    from: string;
    to: string;
}

interface PromotionSourceWorkflow {
    sourcePath: string;
    targetPath: string;
    workflow: IWorkflow;
    sourceKey: string;
    targetExists: boolean;
    targetWorkflowId?: string;
    action: 'create' | 'update';
}

interface PromotionIndexes {
    sourceById: Map<string, PromotionSourceWorkflow>;
    sourceByName: Map<string, PromotionSourceWorkflow[]>;
    targetWorkflowsById?: Map<string, IWorkflow>;
    targetWorkflowsByName?: Map<string, IWorkflow[]>;
    targetCredentialsById?: Map<string, Record<string, unknown>>;
    targetCredentialsByKey?: Map<string, Array<Record<string, unknown>>>;
}

interface WorkflowTransformResult {
    workflow: IWorkflow;
    substitutions: PromotionSubstitution[];
    problems: PromotionProblem[];
    pendingWorkflowSourceKeys: string[];
}

const EXECUTE_WORKFLOW_TYPE_SUFFIX = 'executeworkflow';

export class PromoteCommand {
    private targetWorkflowInventory?: Promise<IWorkflow[]>;
    private targetCredentialInventory?: Promise<Array<Record<string, unknown>>>;

    constructor(
        private readonly configService = new ConfigService(),
        private readonly dependencies: PromotionCommandDependencies = {},
    ) {}

    async run(sourceWorkflowPath: string | undefined, options: PromoteOptions): Promise<PromoteResult> {
        const source = await this.configService.prepareEnvironment(options.from);
        const target = await this.configService.prepareEnvironment(options.to);
        if (source.environmentId === target.environmentId) {
            throw new Error('Source and target environments must be different.');
        }

        const sourceRoot = this.getEnvironmentWorkflowRoot(source);
        const targetRoot = this.getEnvironmentWorkflowRoot(target);
        const configPath = this.resolvePromotionConfigPath(options.promotionConfig);
        const config = this.loadPromotionConfig(configPath);
        const routeKey = `${source.environmentName}->${target.environmentName}`;
        const route = this.ensureRoute(config, routeKey);

        const sources = await this.loadSourceWorkflows(sourceWorkflowPath, sourceRoot, targetRoot);
        this.initializeTargetActions(sources, route);

        const indexes: PromotionIndexes = {
            sourceById: new Map(),
            sourceByName: new Map(),
        };
        for (const item of sources) {
            if (item.workflow.id) indexes.sourceById.set(item.workflow.id, item);
            const byName = indexes.sourceByName.get(item.workflow.name) ?? [];
            byName.push(item);
            indexes.sourceByName.set(item.workflow.name, byName);
        }

        await this.discoverTargetWorkflowIds(sources, target, route, indexes, options);

        const planned = await this.planWorkflows(sources, target, route, indexes);
        const blockingProblems = planned.flatMap((workflow) => workflow.problems);
        if (blockingProblems.length > 0) {
            const result = this.buildResult(source, target, routeKey, configPath, planned, options);
            this.printResult(result, options);
            throw new Error(`Promotion blocked by ${blockingProblems.length} problem${blockingProblems.length === 1 ? '' : 's'}.`);
        }

        if (options.dryRun) {
            const result = this.buildResult(source, target, routeKey, configPath, planned, options);
            this.printResult(result, options);
            return result;
        }

        const applied = await this.applyPromotion(sources, target, route, indexes, options);
        const applyProblems = applied.flatMap((workflow) => workflow.problems);
        if (applyProblems.length > 0) {
            const result = this.buildResult(source, target, routeKey, configPath, applied, options);
            this.printResult(result, options);
            throw new Error(`Promotion blocked by ${applyProblems.length} problem${applyProblems.length === 1 ? '' : 's'}.`);
        }
        if (!options.dryRun) {
            this.savePromotionConfig(configPath, config);
        }
        const result = this.buildResult(source, target, routeKey, configPath, applied, options);
        this.printResult(result, options);
        return result;
    }

    private async loadSourceWorkflows(sourceWorkflowPath: string | undefined, sourceRoot: string, targetRoot: string): Promise<PromotionSourceWorkflow[]> {
        const sourcePaths = sourceWorkflowPath
            ? [this.resolveSourceWorkflowPath(sourceWorkflowPath, sourceRoot)]
            : this.listSourceWorkflowPaths(sourceRoot);
        if (sourcePaths.length === 0) {
            throw new Error(`No TypeScript workflow files found in source environment sync scope: ${sourceRoot}`);
        }

        const sourceRootRealPath = this.realpathExisting(sourceRoot);
        const targetRootRealPath = fs.existsSync(targetRoot) ? this.realpathExisting(targetRoot) : path.resolve(targetRoot);
        const sources: PromotionSourceWorkflow[] = [];

        for (const sourcePath of sourcePaths) {
            const sourceRealPath = this.realpathExisting(sourcePath);
            if (!this.isPathInside(sourceRealPath, sourceRootRealPath)) {
                throw new Error(`Source workflow must be inside the source environment sync scope: ${sourceRoot}`);
            }
            const relativePath = path.relative(sourceRoot, sourcePath);
            const targetPath = path.resolve(targetRoot, relativePath);
            this.assertTargetPath(targetPath, targetRoot, targetRootRealPath);

            const targetExists = fs.existsSync(targetPath);
            if (targetExists && !this.isPathInside(this.realpathExisting(targetPath), targetRootRealPath)) {
                throw new Error('Resolved target path escapes the target environment sync scope.');
            }
            const workflow = await compileWorkflowForPromotion(fs.readFileSync(sourcePath, 'utf8'));
            const sourceKey = workflow.id || workflow.name;
            sources.push({
                sourcePath,
                targetPath,
                workflow,
                sourceKey,
                targetExists,
                targetWorkflowId: targetExists ? readWorkflowDecoratorProperty(fs.readFileSync(targetPath, 'utf8'), 'id') : undefined,
                action: 'create',
            });
        }

        return sources;
    }

    private resolveSourceWorkflowPath(sourceWorkflowPath: string, sourceRoot: string): string {
        const sourcePath = path.resolve(sourceWorkflowPath);
        if (!fs.existsSync(sourcePath)) {
            throw new Error(`Source workflow not found: ${sourcePath}`);
        }
        if (!sourcePath.endsWith('.workflow.ts')) {
            throw new Error('Promotion currently supports TypeScript workflow files (*.workflow.ts).');
        }
        return sourcePath;
    }

    private listSourceWorkflowPaths(sourceRoot: string): string[] {
        if (!fs.existsSync(sourceRoot)) {
            throw new Error(`Source environment sync scope does not exist: ${sourceRoot}`);
        }
        return fs.readdirSync(sourceRoot)
            .filter((filename) => filename.endsWith('.workflow.ts') && !filename.startsWith('.'))
            .sort()
            .map((filename) => path.join(sourceRoot, filename));
    }

    private initializeTargetActions(sources: PromotionSourceWorkflow[], route: PromotionRouteConfig): void {
        for (const item of sources) {
            const binding = route.bindings?.workflows?.[item.sourceKey];
            if (binding) {
                item.targetWorkflowId = binding;
            }
            item.action = item.targetWorkflowId ? 'update' : 'create';
        }
    }

    private async discoverTargetWorkflowIds(
        sources: PromotionSourceWorkflow[],
        target: IResolvedWorkspaceEnvironment,
        route: PromotionRouteConfig,
        indexes: PromotionIndexes,
        options: PromoteOptions,
    ): Promise<void> {
        const shouldDiscover = !options.dryRun;
        if (!shouldDiscover) return;

        const workflows = await this.getTargetWorkflows(target);
        indexes.targetWorkflowsById = new Map(workflows.map((workflow) => [workflow.id, workflow]));
        indexes.targetWorkflowsByName = groupWorkflowsByName(workflows);

        for (const item of sources) {
            if (item.targetWorkflowId) continue;
            const override = this.findOverride(route.workflowOverrides, item.sourceKey, item.workflow.name);
            const targetWorkflow = this.resolveWorkflowOverride(override, indexes);
            if (targetWorkflow) {
                item.targetWorkflowId = targetWorkflow.id;
                item.action = 'update';
                route.bindings!.workflows![item.sourceKey] = targetWorkflow.id;
                continue;
            }

            const targetName = this.applyNameRules(item.workflow.name, 'workflow', route);
            const matches = indexes.targetWorkflowsByName.get(targetName) ?? [];
            if (matches.length === 1) {
                item.targetWorkflowId = matches[0].id;
                item.action = 'update';
                route.bindings!.workflows![item.sourceKey] = matches[0].id;
            }
        }
    }

    private async planWorkflows(
        sources: PromotionSourceWorkflow[],
        target: IResolvedWorkspaceEnvironment,
        route: PromotionRouteConfig,
        indexes: PromotionIndexes,
    ): Promise<PromotionWorkflowResult[]> {
        const planned: PromotionWorkflowResult[] = [];
        for (const item of sources) {
            const transformed = await this.transformWorkflow(item, target, route, indexes);
            planned.push({
                sourcePath: item.sourcePath,
                targetPath: item.targetPath,
                sourceWorkflowId: item.workflow.id || undefined,
                sourceWorkflowName: item.workflow.name,
                targetWorkflowId: item.targetWorkflowId,
                action: item.action,
                status: transformed.problems.length > 0 ? 'blocked' : 'planned',
                substitutions: transformed.substitutions,
                problems: transformed.problems,
            });
        }
        return planned;
    }

    private async applyPromotion(
        sources: PromotionSourceWorkflow[],
        target: IResolvedWorkspaceEnvironment,
        route: PromotionRouteConfig,
        indexes: PromotionIndexes,
        options: PromoteOptions,
    ): Promise<PromotionWorkflowResult[]> {
        const remaining = new Map(sources.map((item) => [item.sourceKey, item]));
        const applied: PromotionWorkflowResult[] = [];

        while (remaining.size > 0) {
            let progressed = false;

            for (const item of Array.from(remaining.values())) {
                const transformed = await this.transformWorkflow(item, target, route, indexes);
                const pending = transformed.pendingWorkflowSourceKeys.filter((sourceKey) => remaining.has(sourceKey));
                if (pending.length > 0) {
                    continue;
                }
                if (transformed.problems.length > 0) {
                    applied.push(this.workflowResult(item, transformed, 'blocked'));
                    remaining.delete(item.sourceKey);
                    progressed = true;
                    continue;
                }
                if (item.targetExists && !item.targetWorkflowId && !options.overwrite) {
                    applied.push(this.workflowResult(item, transformed, 'blocked', [{
                        kind: 'target-file',
                        message: `Target workflow already exists: ${item.targetPath}. Re-run with --overwrite to replace it.`,
                    }]));
                    remaining.delete(item.sourceKey);
                    progressed = true;
                    continue;
                }

                const targetTs = await WorkflowTransformerAdapter.convertToTypeScript(transformed.workflow, {
                    format: true,
                    commentStyle: 'verbose',
                });
                fs.mkdirSync(path.dirname(item.targetPath), { recursive: true });
                fs.writeFileSync(item.targetPath, targetTs, 'utf8');

                let pushedWorkflowId: string | undefined;
                if (options.push !== false) {
                    pushedWorkflowId = await this.pushWorkflow(target, item.targetPath);
                    if (pushedWorkflowId) {
                        item.targetWorkflowId = pushedWorkflowId;
                        route.bindings!.workflows![item.sourceKey] = pushedWorkflowId;
                    }
                } else if (item.targetWorkflowId) {
                    route.bindings!.workflows![item.sourceKey] = item.targetWorkflowId;
                }

                applied.push({
                    ...this.workflowResult(item, transformed, pushedWorkflowId ? 'pushed' : 'written'),
                    targetWorkflowId: pushedWorkflowId || item.targetWorkflowId,
                });
                remaining.delete(item.sourceKey);
                progressed = true;
            }

            if (!progressed) {
                for (const item of remaining.values()) {
                    const transformed = await this.transformWorkflow(item, target, route, indexes);
                    applied.push(this.workflowResult(item, transformed, 'blocked', [{
                        kind: 'workflow',
                        message: 'Cannot resolve workflow reference order. Check for first-deploy circular Execute Workflow references.',
                    }]));
                }
                break;
            }
        }

        return sources.map((sourceItem) => applied.find((item) => item.sourcePath === sourceItem.sourcePath)!).filter(Boolean);
    }

    private workflowResult(
        item: PromotionSourceWorkflow,
        transformed: WorkflowTransformResult,
        status: PromotionWorkflowResult['status'],
        extraProblems: PromotionProblem[] = [],
    ): PromotionWorkflowResult {
        return {
            sourcePath: item.sourcePath,
            targetPath: item.targetPath,
            sourceWorkflowId: item.workflow.id || undefined,
            sourceWorkflowName: item.workflow.name,
            targetWorkflowId: item.targetWorkflowId,
            action: item.action,
            status: extraProblems.length > 0 ? 'blocked' : status,
            substitutions: transformed.substitutions,
            problems: [...transformed.problems, ...extraProblems],
        };
    }

    private async transformWorkflow(
        item: PromotionSourceWorkflow,
        target: IResolvedWorkspaceEnvironment,
        route: PromotionRouteConfig,
        indexes: PromotionIndexes,
    ): Promise<WorkflowTransformResult> {
        const workflow = cloneWorkflow(item.workflow);
        const substitutions: PromotionSubstitution[] = [];
        const problems: PromotionProblem[] = [];
        const pendingWorkflowSourceKeys: string[] = [];

        if (item.targetWorkflowId) {
            workflow.id = item.targetWorkflowId;
        } else {
            delete (workflow as any).id;
        }
        workflow.projectId = target.projectId;
        workflow.projectName = target.projectName;
        delete (workflow as any).homeProject;
        delete (workflow as any).isArchived;

        substitutions.push({
            kind: 'metadata',
            field: 'workflow.id',
            fromId: item.workflow.id || undefined,
            toId: item.targetWorkflowId,
            status: item.targetWorkflowId ? 'mapped' : 'unchanged',
        });

        for (const node of workflow.nodes ?? []) {
            await this.remapNodeCredentials(node, target, route, indexes, substitutions, problems);
            await this.remapWorkflowReferences(node, target, route, indexes, substitutions, problems, pendingWorkflowSourceKeys);
        }

        return { workflow, substitutions, problems, pendingWorkflowSourceKeys };
    }

    private async remapNodeCredentials(
        node: any,
        target: IResolvedWorkspaceEnvironment,
        route: PromotionRouteConfig,
        indexes: PromotionIndexes,
        substitutions: PromotionSubstitution[],
        problems: PromotionProblem[],
    ): Promise<void> {
        if (!node.credentials || typeof node.credentials !== 'object') return;
        for (const [credentialType, credentialRef] of Object.entries(node.credentials as Record<string, any>)) {
            const sourceId = String(credentialRef?.id ?? '').trim();
            const sourceName = String(credentialRef?.name ?? '').trim();
            const targetCredential = await this.resolveTargetCredential(target, route, indexes, credentialType, sourceId, sourceName);
            if (!targetCredential) {
                problems.push({
                    kind: 'credential',
                    nodeName: node.name,
                    ref: sourceId || sourceName,
                    message: `Cannot resolve credential "${sourceName || sourceId}" of type "${credentialType}" in target environment.`,
                });
                continue;
            }
            const targetId = String(targetCredential.id ?? '').trim();
            const targetName = String(targetCredential.name ?? '').trim();
            node.credentials[credentialType] = { id: targetId, name: targetName };
            if (sourceId) route.bindings!.credentials![sourceId] = targetId;
            substitutions.push({
                kind: 'credential',
                nodeName: node.name,
                field: credentialType,
                fromId: sourceId || undefined,
                fromName: sourceName || undefined,
                toId: targetId,
                toName: targetName,
                status: 'mapped',
            });
        }
    }

    private async resolveTargetCredential(
        target: IResolvedWorkspaceEnvironment,
        route: PromotionRouteConfig,
        indexes: PromotionIndexes,
        credentialType: string,
        sourceId: string,
        sourceName: string,
    ): Promise<Record<string, unknown> | undefined> {
        await this.ensureTargetCredentialIndexes(target, indexes);
        if (sourceId) {
            const boundId = route.bindings?.credentials?.[sourceId];
            if (boundId) {
                return indexes.targetCredentialsById!.get(boundId);
            }
        }

        const override = this.findOverride(route.credentialOverrides, `${credentialType}::${sourceId}`, `${credentialType}::${sourceName}`, sourceId, sourceName);
        if (override?.targetId) {
            return indexes.targetCredentialsById!.get(override.targetId);
        }
        if (override?.targetName) {
            const matches = indexes.targetCredentialsByKey!.get(`${credentialType}::${override.targetName}`) ?? [];
            if (matches.length === 1) return matches[0];
            return undefined;
        }

        const targetName = this.applyNameRules(sourceName, 'credential', route);
        const matches = indexes.targetCredentialsByKey!.get(`${credentialType}::${targetName}`) ?? [];
        if (matches.length === 1) return matches[0];
        return undefined;
    }

    private async remapWorkflowReferences(
        node: any,
        target: IResolvedWorkspaceEnvironment,
        route: PromotionRouteConfig,
        indexes: PromotionIndexes,
        substitutions: PromotionSubstitution[],
        problems: PromotionProblem[],
        pendingWorkflowSourceKeys: string[],
    ): Promise<void> {
        const nodeType = String(node.type ?? '').toLowerCase().split('.').pop();
        if (nodeType !== EXECUTE_WORKFLOW_TYPE_SUFFIX) return;

        const refs = findWorkflowReferenceFields(node.parameters);
        for (const ref of refs) {
            const resolved = await this.resolveWorkflowReference(ref.value, target, route, indexes);
            if (resolved.status === 'mapped') {
                ref.set(resolved.targetId);
                substitutions.push({
                    kind: 'workflow',
                    nodeName: node.name,
                    field: ref.path,
                    fromId: ref.value,
                    fromName: resolved.sourceName,
                    toId: resolved.targetId,
                    toName: resolved.targetName,
                    status: 'mapped',
                });
                continue;
            }
            if (resolved.status === 'pending-create') {
                pendingWorkflowSourceKeys.push(resolved.sourceKey);
                substitutions.push({
                    kind: 'workflow',
                    nodeName: node.name,
                    field: ref.path,
                    fromId: ref.value,
                    fromName: resolved.sourceName,
                    status: 'pending-create',
                });
                continue;
            }
            problems.push({
                kind: 'workflow',
                nodeName: node.name,
                ref: ref.value,
                message: `Cannot resolve workflow reference "${ref.value}" in target environment.`,
            });
        }
    }

    private async resolveWorkflowReference(
        sourceRef: string,
        target: IResolvedWorkspaceEnvironment,
        route: PromotionRouteConfig,
        indexes: PromotionIndexes,
    ): Promise<
        | { status: 'mapped'; targetId: string; targetName?: string; sourceName?: string }
        | { status: 'pending-create'; sourceKey: string; sourceName?: string }
        | { status: 'missing' }
    > {
        const boundId = route.bindings?.workflows?.[sourceRef];
        if (boundId) return { status: 'mapped', targetId: boundId };

        const sourceItem = indexes.sourceById.get(sourceRef) ?? unique(indexes.sourceByName.get(sourceRef));
        if (sourceItem) {
            const targetId = sourceItem.targetWorkflowId || route.bindings?.workflows?.[sourceItem.sourceKey];
            if (targetId) {
                return { status: 'mapped', targetId, sourceName: sourceItem.workflow.name };
            }
            return { status: 'pending-create', sourceKey: sourceItem.sourceKey, sourceName: sourceItem.workflow.name };
        }

        const override = this.findOverride(route.workflowOverrides, sourceRef);
        if (override) {
            await this.ensureTargetWorkflowIndexes(target, indexes);
            const workflow = this.resolveWorkflowOverride(override, indexes);
            if (workflow) return { status: 'mapped', targetId: workflow.id, targetName: workflow.name };
        }

        await this.ensureTargetWorkflowIndexes(target, indexes);
        const targetName = this.applyNameRules(sourceRef, 'workflow', route);
        const matches = indexes.targetWorkflowsByName!.get(targetName) ?? [];
        if (matches.length === 1) {
            return { status: 'mapped', targetId: matches[0].id, targetName: matches[0].name };
        }
        return { status: 'missing' };
    }

    private async ensureTargetWorkflowIndexes(target: IResolvedWorkspaceEnvironment, indexes: PromotionIndexes): Promise<void> {
        if (indexes.targetWorkflowsById && indexes.targetWorkflowsByName) return;
        const workflows = await this.getTargetWorkflows(target);
        indexes.targetWorkflowsById = new Map(workflows.map((workflow) => [workflow.id, workflow]));
        indexes.targetWorkflowsByName = groupWorkflowsByName(workflows);
    }

    private async ensureTargetCredentialIndexes(target: IResolvedWorkspaceEnvironment, indexes: PromotionIndexes): Promise<void> {
        if (indexes.targetCredentialsById && indexes.targetCredentialsByKey) return;
        const credentials = await this.getTargetCredentials(target);
        indexes.targetCredentialsById = new Map(credentials.map((credential) => [String(credential.id ?? ''), credential]));
        indexes.targetCredentialsByKey = new Map();
        for (const credential of credentials) {
            const type = String(credential.type ?? '').trim();
            const name = String(credential.name ?? '').trim();
            const key = `${type}::${name}`;
            const existing = indexes.targetCredentialsByKey.get(key) ?? [];
            existing.push(credential);
            indexes.targetCredentialsByKey.set(key, existing);
        }
    }

    private async getTargetWorkflows(target: IResolvedWorkspaceEnvironment): Promise<IWorkflow[]> {
        this.targetWorkflowInventory ??= this.getClient(target).getAllWorkflows(target.projectId);
        return this.targetWorkflowInventory;
    }

    private async getTargetCredentials(target: IResolvedWorkspaceEnvironment): Promise<Array<Record<string, unknown>>> {
        this.targetCredentialInventory ??= this.getClient(target).listCredentials();
        return this.targetCredentialInventory;
    }

    private getClient(environment: IResolvedWorkspaceEnvironment): PromotionRuntimeClient {
        if (this.dependencies.createClient) return this.dependencies.createClient(environment);
        if (!environment.host || !environment.apiKey) {
            throw new Error(`Environment "${environment.environmentName}" needs a host and API key before promotion can inspect target references.`);
        }
        return new N8nApiClient({ host: environment.host, apiKey: environment.apiKey });
    }

    private async pushWorkflow(target: IResolvedWorkspaceEnvironment, targetPath: string): Promise<string | undefined> {
        if (this.dependencies.pushWorkflow) {
            return this.dependencies.pushWorkflow(target, targetPath);
        }
        const previousEnvironment = process.env.N8NAC_ENVIRONMENT;
        try {
            process.env.N8NAC_ENVIRONMENT = target.environmentId;
            return await new SyncCommand().pushOne(targetPath);
        } finally {
            if (previousEnvironment === undefined) {
                delete process.env.N8NAC_ENVIRONMENT;
            } else {
                process.env.N8NAC_ENVIRONMENT = previousEnvironment;
            }
        }
    }

    private getEnvironmentWorkflowRoot(environment: IResolvedWorkspaceEnvironment): string {
        if (!environment.workflowDir) {
            throw new Error(`Environment "${environment.environmentName}" is missing a resolved workflow directory. Check its API key, project, and instance identifier.`);
        }
        return path.resolve(environment.workflowDir);
    }

    private assertTargetPath(targetPath: string, targetRoot: string, targetRootRealPath: string): void {
        if (!this.isPathInside(targetPath, targetRoot)) {
            throw new Error('Resolved target path escapes the target environment sync scope.');
        }
        const targetParentRealPath = this.realpathExistingParent(path.dirname(targetPath));
        if (fs.existsSync(targetRoot) && targetParentRealPath && !this.isPathInside(targetParentRealPath, targetRootRealPath)) {
            throw new Error('Resolved target path escapes the target environment sync scope.');
        }
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

    private resolvePromotionConfigPath(configPath?: string): string {
        return path.resolve(configPath || path.join(process.cwd(), 'n8nac-promotion.json'));
    }

    private loadPromotionConfig(configPath: string): PromotionConfig {
        if (!fs.existsSync(configPath)) {
            return { version: 1, routes: {} };
        }
        const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as PromotionConfig;
        if (parsed.version !== 1 || !parsed.routes || typeof parsed.routes !== 'object') {
            throw new Error(`Invalid promotion config: ${configPath}`);
        }
        return parsed;
    }

    private savePromotionConfig(configPath: string, config: PromotionConfig): void {
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    }

    private ensureRoute(config: PromotionConfig, routeKey: string): PromotionRouteConfig {
        const route = config.routes[routeKey] ?? {};
        route.bindings ??= {};
        route.bindings.workflows ??= {};
        route.bindings.credentials ??= {};
        route.workflowOverrides ??= {};
        route.credentialOverrides ??= {};
        route.nameRules ??= [];
        config.routes[routeKey] = route;
        return route;
    }

    private findOverride(overrides: Record<string, PromotionOverride> | undefined, ...keys: string[]): PromotionOverride | undefined {
        if (!overrides) return undefined;
        for (const key of keys) {
            if (key && overrides[key]) return overrides[key];
        }
        return undefined;
    }

    private resolveWorkflowOverride(override: PromotionOverride | undefined, indexes: PromotionIndexes): IWorkflow | undefined {
        if (!override) return undefined;
        if (override.targetId) return indexes.targetWorkflowsById?.get(override.targetId);
        if (override.targetName) return unique(indexes.targetWorkflowsByName?.get(override.targetName));
        return undefined;
    }

    private applyNameRules(value: string, kind: 'credential' | 'workflow', route: PromotionRouteConfig): string {
        let next = value;
        for (const rule of route.nameRules ?? []) {
            if (rule.kind && rule.kind !== kind) continue;
            next = next.replace(new RegExp(rule.from), rule.to);
        }
        return next;
    }

    private buildResult(
        source: IResolvedWorkspaceEnvironment,
        target: IResolvedWorkspaceEnvironment,
        routeKey: string,
        configPath: string,
        workflows: PromotionWorkflowResult[],
        options: PromoteOptions,
    ): PromoteResult {
        const first = workflows[0];
        return {
            sourceEnvironmentId: source.environmentId,
            sourceEnvironmentName: source.environmentName,
            targetEnvironmentId: target.environmentId,
            targetEnvironmentName: target.environmentName,
            sourcePath: first?.sourcePath || '',
            targetPath: first?.targetPath || '',
            pushed: workflows.some((workflow) => workflow.status === 'pushed'),
            workflowId: workflows.length === 1 ? workflows[0].targetWorkflowId : undefined,
            credentialCheckCommand: workflows.length === 1 && workflows[0].targetWorkflowId
                ? `n8nac --env ${quoteShellArg(target.environmentName)} workflow credential-required ${quoteShellArg(workflows[0].targetWorkflowId!)}`
                : undefined,
            dryRun: Boolean(options.dryRun),
            routeKey,
            configPath,
            summary: {
                planned: workflows.length,
                created: workflows.filter((workflow) => workflow.action === 'create').length,
                updated: workflows.filter((workflow) => workflow.action === 'update').length,
                blocked: workflows.filter((workflow) => workflow.status === 'blocked' || workflow.problems.length > 0).length,
                credentialMappings: workflows.reduce((count, workflow) => count + workflow.substitutions.filter((item) => item.kind === 'credential' && item.status === 'mapped').length, 0),
                workflowMappings: workflows.reduce((count, workflow) => count + workflow.substitutions.filter((item) => item.kind === 'workflow' && item.status === 'mapped').length, 0),
            },
            workflows,
        };
    }

    private printResult(result: PromoteResult, options: PromoteOptions): void {
        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }
        const action = result.dryRun ? 'Would promote' : result.pushed ? 'Promoted and pushed' : 'Promoted';
        const countLabel = result.workflows.length === 1 ? 'workflow' : 'workflows';
        console.log(chalk.green(`✔ ${action} ${result.workflows.length} ${countLabel} from ${result.sourceEnvironmentName} to ${result.targetEnvironmentName}.`));
        console.log(chalk.dim(`  route: ${result.routeKey}`));
        for (const workflow of result.workflows) {
            const statusIcon = workflow.problems.length > 0 ? 'blocked' : workflow.action;
            console.log(chalk.dim(`  ${statusIcon}: ${workflow.sourcePath}`));
            console.log(chalk.dim(`    -> ${workflow.targetPath}`));
            if (workflow.targetWorkflowId) {
                console.log(chalk.dim(`    remote workflow: ${workflow.targetWorkflowId}`));
            }
            for (const substitution of workflow.substitutions.filter((item) => item.kind !== 'metadata')) {
                const from = substitution.fromName || substitution.fromId || 'unknown';
                const to = substitution.toName || substitution.toId || 'pending';
                console.log(chalk.dim(`    ${substitution.kind}: ${from} -> ${to}`));
            }
            for (const problem of workflow.problems) {
                console.log(chalk.yellow(`    ${problem.kind}: ${problem.message}`));
            }
        }
        if (result.credentialCheckCommand) {
            console.log(chalk.yellow(`  Check target credentials: ${result.credentialCheckCommand}`));
        }
    }
}

export async function compileWorkflowForPromotion(content: string): Promise<IWorkflow> {
    const parser = new TypeScriptParser();
    const ast = await parser.parseCode(content);
    const workflow = new WorkflowBuilder().build(ast) as any;
    if (Array.isArray(workflow.tags)) {
        workflow.tags = workflow.tags.map((tag: string | { id?: string; name?: string }) =>
            typeof tag === 'string' ? { id: tag, name: tag } : tag
        );
    }
    return workflow as IWorkflow;
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

function findWorkflowReferenceFields(parameters: any): Array<{ path: string; value: string; set: (value: string) => void }> {
    const refs: Array<{ path: string; value: string; set: (value: string) => void }> = [];
    const visit = (value: any, currentPath: string): void => {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
            const nextPath = currentPath ? `${currentPath}.${key}` : key;
            const normalizedKey = key.toLowerCase();
            if ((normalizedKey === 'workflowid' || normalizedKey === 'workflow') && typeof child === 'string' && child.trim()) {
                refs.push({
                    path: nextPath,
                    value: child,
                    set: (nextValue: string) => {
                        value[key] = nextValue;
                    },
                });
                continue;
            }
            if ((normalizedKey === 'workflowid' || normalizedKey === 'workflow') && child && typeof child === 'object') {
                const objectValue = (child as any).value;
                if (typeof objectValue === 'string' && objectValue.trim()) {
                    refs.push({
                        path: `${nextPath}.value`,
                        value: objectValue,
                        set: (nextValue: string) => {
                            (child as any).value = nextValue;
                        },
                    });
                }
            }
            visit(child, nextPath);
        }
    };
    visit(parameters, '');
    return refs;
}

function cloneWorkflow(workflow: IWorkflow): IWorkflow {
    return JSON.parse(JSON.stringify(workflow));
}

function groupWorkflowsByName(workflows: IWorkflow[]): Map<string, IWorkflow[]> {
    const byName = new Map<string, IWorkflow[]>();
    for (const workflow of workflows) {
        const existing = byName.get(workflow.name) ?? [];
        existing.push(workflow);
        byName.set(workflow.name, existing);
    }
    return byName;
}

function unique<T>(items: T[] | undefined): T | undefined {
    return items && items.length === 1 ? items[0] : undefined;
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
