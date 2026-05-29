import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { ConfigService } from '../../src/services/config-service.js';
import { PromoteCommand, adaptWorkflowForPromotion, readWorkflowDecoratorProperty } from '../../src/commands/promote.js';

describe('PromoteCommand', () => {
    it('strips source workflow identity and project metadata before promotion', () => {
        const source = `import { workflow } from '@n8n-as-code/transformer';

@workflow({
  id: 'source-workflow-id',
  name: 'Promoted Workflow',
  projectId: 'source-project',
  projectName: 'Source Project',
  isArchived: false,
  active: false
})
export class PromotedWorkflow {}
`;

        const promoted = adaptWorkflowForPromotion(source, {
            targetWorkflowId: 'target-workflow-id',
            targetProjectId: 'target-project',
            targetProjectName: 'Target Project',
        });

        expect(promoted).not.toContain("id: 'source-workflow-id'");
        expect(promoted).not.toContain("projectId: 'source-project'");
        expect(promoted).not.toContain("projectName: 'Source Project'");
        expect(promoted).not.toContain('isArchived: false');
        expect(promoted).toContain("id: 'target-workflow-id'");
        expect(promoted).toContain("projectId: 'target-project'");
        expect(promoted).toContain("projectName: 'Target Project'");
        expect(promoted).toContain("name: 'Promoted Workflow'");
        expect(promoted).toContain('active: false');
    });

    it('reads workflow decorator string properties', () => {
        expect(readWorkflowDecoratorProperty("@workflow({ id: 'wf-1', name: 'One' })", 'id')).toBe('wf-1');
        expect(readWorkflowDecoratorProperty('@workflow({ name: "Two" })', 'name')).toBe('Two');
    });

    it('allows dry-run promotion when target exists', async () => {
        const previousManagerHome = process.env.N8N_MANAGER_HOME;
        const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-workspace-'));
        process.env.N8N_MANAGER_HOME = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-manager-'));
        try {
            const globalWorkspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-global-'));
            const globalConfigService = new ConfigService(globalWorkspaceRoot);
            globalConfigService.saveLocalConfig({
                host: 'https://dev.example.test',
                instanceIdentifier: 'n8n_1111111111',
            }, { instanceId: 'dev-instance', instanceName: 'Dev', apiKey: 'dev-key' });
            globalConfigService.saveLocalConfig({
                host: 'https://prod.example.test',
                instanceIdentifier: 'n8n_2222222222',
            }, { instanceId: 'prod-instance', instanceName: 'Prod', apiKey: 'prod-key', setActive: false });

            const configService = new ConfigService(workspaceRoot);
            const devTarget = configService.addInstanceTarget({ name: 'Dev Target', managedInstanceId: 'dev-instance' });
            const prodTarget = configService.addInstanceTarget({ name: 'Prod Target', managedInstanceId: 'prod-instance' });
            configService.addEnvironment({ name: 'Dev', environmentTarget: devTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/dev' });
            configService.addEnvironment({ name: 'Prod', environmentTarget: prodTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/prod' });

            const sourceDir = configService.resolveEnvironment('Dev').workflowsPath!;
            const targetDir = configService.resolveEnvironment('Prod').workflowsPath!;
            mkdirSync(sourceDir, { recursive: true });
            mkdirSync(targetDir, { recursive: true });
            const workflow = "@workflow({ name: 'One' })\nexport class One {}\n";
            const sourcePath = path.join(sourceDir, 'one.workflow.ts');
            writeFileSync(sourcePath, workflow, 'utf8');
            writeFileSync(path.join(targetDir, 'one.workflow.ts'), workflow, 'utf8');

            const promotionConfigPath = path.join(workspaceRoot, 'n8nac-promotion.json');
            await expect(new PromoteCommand(configService, {
                createClient: () => ({
                    getAllWorkflows: async () => [],
                    listCredentials: async () => [],
                }),
            }).run(sourcePath, { from: 'Dev', to: 'Prod', dryRun: true, promotionConfig: promotionConfigPath })).resolves.toMatchObject({
                targetEnvironmentName: 'Prod',
                targetPath: path.join(targetDir, 'one.workflow.ts'),
                dryRun: true,
                pushed: false,
            });
            expect(existsSync(promotionConfigPath)).toBe(false);
        } finally {
            if (previousManagerHome === undefined) {
                delete process.env.N8N_MANAGER_HOME;
            } else {
                process.env.N8N_MANAGER_HOME = previousManagerHome;
            }
        }
    });

    it('resolves a workflow path argument relative to the source workflowsPath', async () => {
        const previousManagerHome = process.env.N8N_MANAGER_HOME;
        const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-workspace-'));
        process.env.N8N_MANAGER_HOME = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-manager-'));
        try {
            const globalWorkspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-global-'));
            const globalConfigService = new ConfigService(globalWorkspaceRoot);
            globalConfigService.saveLocalConfig({
                host: 'https://dev.example.test',
                instanceIdentifier: 'n8n_1111111111',
            }, { instanceId: 'dev-instance', instanceName: 'Dev', apiKey: 'dev-key' });
            globalConfigService.saveLocalConfig({
                host: 'https://prod.example.test',
                instanceIdentifier: 'n8n_2222222222',
            }, { instanceId: 'prod-instance', instanceName: 'Prod', apiKey: 'prod-key', setActive: false });

            const configService = new ConfigService(workspaceRoot);
            const devTarget = configService.addInstanceTarget({ name: 'Dev Target', managedInstanceId: 'dev-instance' });
            const prodTarget = configService.addInstanceTarget({ name: 'Prod Target', managedInstanceId: 'prod-instance' });
            configService.addEnvironment({ name: 'Dev', environmentTarget: devTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/dev' });
            configService.addEnvironment({ name: 'Prod', environmentTarget: prodTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/prod' });

            const sourceDir = configService.resolveEnvironment('Dev').workflowsPath!;
            const targetDir = configService.resolveEnvironment('Prod').workflowsPath!;
            mkdirSync(sourceDir, { recursive: true });
            const sourcePath = path.join(sourceDir, 'filename-only.workflow.ts');
            writeFileSync(sourcePath, "@workflow({ name: 'Filename Only', active: false })\nexport class FilenameOnly {}\n", 'utf8');

            const result = await new PromoteCommand(configService, {
                createClient: () => ({
                    getAllWorkflows: async () => [],
                    listCredentials: async () => [],
                }),
            }).run('filename-only.workflow.ts', {
                from: 'Dev',
                to: 'Prod',
                dryRun: true,
                promotionConfig: path.join(workspaceRoot, 'n8nac-promotion.json'),
            });

            expect(result.sourcePath).toBe(sourcePath);
            expect(result.targetPath).toBe(path.join(targetDir, 'filename-only.workflow.ts'));
        } finally {
            if (previousManagerHome === undefined) {
                delete process.env.N8N_MANAGER_HOME;
            } else {
                process.env.N8N_MANAGER_HOME = previousManagerHome;
            }
        }
    });

    it('reuses an existing target workflow id without requiring overwrite', async () => {
        const previousManagerHome = process.env.N8N_MANAGER_HOME;
        const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-workspace-'));
        process.env.N8N_MANAGER_HOME = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-manager-'));
        try {
            const globalWorkspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-global-'));
            const globalConfigService = new ConfigService(globalWorkspaceRoot);
            globalConfigService.saveLocalConfig({
                host: 'https://dev.example.test',
                instanceIdentifier: 'n8n_1111111111',
            }, { instanceId: 'dev-instance', instanceName: 'Dev', apiKey: 'dev-key' });
            globalConfigService.saveLocalConfig({
                host: 'https://prod.example.test',
                instanceIdentifier: 'n8n_2222222222',
            }, { instanceId: 'prod-instance', instanceName: 'Prod', apiKey: 'prod-key', setActive: false });

            const configService = new ConfigService(workspaceRoot);
            const devTarget = configService.addInstanceTarget({ name: 'Dev Target', managedInstanceId: 'dev-instance' });
            const prodTarget = configService.addInstanceTarget({ name: 'Prod Target', managedInstanceId: 'prod-instance' });
            configService.addEnvironment({ name: 'Dev', environmentTarget: devTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/dev' });
            configService.addEnvironment({ name: 'Prod', environmentTarget: prodTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/prod' });

            const sourceDir = configService.resolveEnvironment('Dev').workflowsPath!;
            const targetDir = configService.resolveEnvironment('Prod').workflowsPath!;
            mkdirSync(sourceDir, { recursive: true });
            mkdirSync(targetDir, { recursive: true });
            const sourcePath = path.join(sourceDir, 'one.workflow.ts');
            const targetPath = path.join(targetDir, 'one.workflow.ts');
            writeFileSync(sourcePath, "@workflow({ name: 'Source' })\nexport class Source {}\n", 'utf8');
            writeFileSync(targetPath, "@workflow({ id: 'target-id', name: 'Target' })\nexport class Target {}\n", 'utf8');

            await expect(new PromoteCommand(configService, {
                createClient: () => ({
                    getAllWorkflows: async () => [],
                    listCredentials: async () => [],
                }),
            }).run(sourcePath, { from: 'Dev', to: 'Prod', push: false, promotionConfig: path.join(workspaceRoot, 'n8nac-promotion.json') })).resolves.toMatchObject({
                targetEnvironmentName: 'Prod',
                targetPath,
                pushed: false,
                workflowId: 'target-id',
            });
            expect(readFileSync(targetPath, 'utf8')).toContain("id: 'target-id'");
            expect(readFileSync(targetPath, 'utf8')).toContain("name: 'Source'");
        } finally {
            if (previousManagerHome === undefined) {
                delete process.env.N8N_MANAGER_HOME;
            } else {
                process.env.N8N_MANAGER_HOME = previousManagerHome;
            }
        }
    });

    it('promotes all source workflows when no path is provided', async () => {
        const previousManagerHome = process.env.N8N_MANAGER_HOME;
        const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-workspace-'));
        process.env.N8N_MANAGER_HOME = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-manager-'));
        try {
            const globalWorkspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-global-'));
            const globalConfigService = new ConfigService(globalWorkspaceRoot);
            globalConfigService.saveLocalConfig({
                host: 'https://dev.example.test',
                instanceIdentifier: 'n8n_1111111111',
            }, { instanceId: 'dev-instance', instanceName: 'Dev', apiKey: 'dev-key' });
            globalConfigService.saveLocalConfig({
                host: 'https://prod.example.test',
                instanceIdentifier: 'n8n_2222222222',
            }, { instanceId: 'prod-instance', instanceName: 'Prod', apiKey: 'prod-key', setActive: false });

            const configService = new ConfigService(workspaceRoot);
            const devTarget = configService.addInstanceTarget({ name: 'Dev Target', managedInstanceId: 'dev-instance' });
            const prodTarget = configService.addInstanceTarget({ name: 'Prod Target', managedInstanceId: 'prod-instance' });
            configService.addEnvironment({ name: 'Dev', environmentTarget: devTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/dev' });
            configService.addEnvironment({ name: 'Prod', environmentTarget: prodTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/prod' });

            const sourceDir = configService.resolveEnvironment('Dev').workflowsPath!;
            const targetDir = configService.resolveEnvironment('Prod').workflowsPath!;
            mkdirSync(sourceDir, { recursive: true });
            mkdirSync(path.join(sourceDir, 'nested'), { recursive: true });
            mkdirSync(path.join(sourceDir, '.ignored'), { recursive: true });
            writeFileSync(path.join(sourceDir, 'one.workflow.ts'), "@workflow({ name: 'One', active: false })\nexport class One {}\n", 'utf8');
            writeFileSync(path.join(sourceDir, 'two.workflow.ts'), "@workflow({ name: 'Two', active: false })\nexport class Two {}\n", 'utf8');
            writeFileSync(path.join(sourceDir, 'nested', 'three.workflow.ts'), "@workflow({ name: 'Three', active: false })\nexport class Three {}\n", 'utf8');
            writeFileSync(path.join(sourceDir, '.ignored', 'hidden.workflow.ts'), "@workflow({ name: 'Hidden', active: false })\nexport class Hidden {}\n", 'utf8');

            const result = await new PromoteCommand(configService, {
                createClient: () => ({
                    getAllWorkflows: async () => [],
                    listCredentials: async () => [],
                }),
            }).run(undefined, {
                from: 'Dev',
                to: 'Prod',
                push: false,
                promotionConfig: path.join(workspaceRoot, 'n8nac-promotion.json'),
            });

            expect(result.summary.planned).toBe(3);
            expect(existsSync(path.join(targetDir, 'one.workflow.ts'))).toBe(true);
            expect(existsSync(path.join(targetDir, 'two.workflow.ts'))).toBe(true);
            expect(existsSync(path.join(targetDir, 'nested', 'three.workflow.ts'))).toBe(true);
            expect(existsSync(path.join(targetDir, '.ignored', 'hidden.workflow.ts'))).toBe(false);
        } finally {
            if (previousManagerHome === undefined) {
                delete process.env.N8N_MANAGER_HOME;
            } else {
                process.env.N8N_MANAGER_HOME = previousManagerHome;
            }
        }
    });

    it('remaps credentials by type and name using the target inventory', async () => {
        const previousManagerHome = process.env.N8N_MANAGER_HOME;
        const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-workspace-'));
        process.env.N8N_MANAGER_HOME = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-manager-'));
        try {
            const globalWorkspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-global-'));
            const globalConfigService = new ConfigService(globalWorkspaceRoot);
            globalConfigService.saveLocalConfig({
                host: 'https://dev.example.test',
                instanceIdentifier: 'n8n_1111111111',
            }, { instanceId: 'dev-instance', instanceName: 'Dev', apiKey: 'dev-key' });
            globalConfigService.saveLocalConfig({
                host: 'https://prod.example.test',
                instanceIdentifier: 'n8n_2222222222',
            }, { instanceId: 'prod-instance', instanceName: 'Prod', apiKey: 'prod-key', setActive: false });

            const configService = new ConfigService(workspaceRoot);
            const devTarget = configService.addInstanceTarget({ name: 'Dev Target', managedInstanceId: 'dev-instance' });
            const prodTarget = configService.addInstanceTarget({ name: 'Prod Target', managedInstanceId: 'prod-instance' });
            configService.addEnvironment({ name: 'Dev', environmentTarget: devTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/dev' });
            configService.addEnvironment({ name: 'Prod', environmentTarget: prodTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/prod' });

            const sourceDir = configService.resolveEnvironment('Dev').workflowsPath!;
            const targetDir = configService.resolveEnvironment('Prod').workflowsPath!;
            mkdirSync(sourceDir, { recursive: true });
            const sourcePath = path.join(sourceDir, 'credential.workflow.ts');
            writeFileSync(sourcePath, `import { workflow, node } from '@n8n-as-code/transformer';

@workflow({ id: 'source-wf', name: 'Credential Workflow', active: false })
export class CredentialWorkflow {
  @node({
    name: 'HTTP Request',
    type: 'n8n-nodes-base.httpRequest',
    version: 4,
    position: [100, 100],
    credentials: { httpBasicAuth: { id: 'source-cred', name: 'Shared Credential' } }
  })
  HttpRequest = { url: 'https://example.com', method: 'GET' };
}
`, 'utf8');

            await new PromoteCommand(configService, {
                createClient: () => ({
                    getAllWorkflows: async () => [],
                    listCredentials: async () => [
                        { id: 'target-cred', name: 'Shared Credential', type: 'httpBasicAuth' },
                    ],
                }),
            }).run(sourcePath, {
                from: 'Dev',
                to: 'Prod',
                push: false,
                promotionConfig: path.join(workspaceRoot, 'n8nac-promotion.json'),
            });

            const promoted = readFileSync(path.join(targetDir, 'credential.workflow.ts'), 'utf8');
            expect(promoted).toContain("id: 'target-cred'");
            expect(promoted).toContain("name: 'Shared Credential'");
            const promotionConfig = JSON.parse(readFileSync(path.join(workspaceRoot, 'n8nac-promotion.json'), 'utf8'));
            expect(promotionConfig.routes['Dev->Prod'].bindings.credentials['Shared Credential:httpBasicAuth']).toBe('Shared Credential:httpBasicAuth');
        } finally {
            if (previousManagerHome === undefined) {
                delete process.env.N8N_MANAGER_HOME;
            } else {
                process.env.N8N_MANAGER_HOME = previousManagerHome;
            }
        }
    });

    it('prompts for unresolved credential mappings and persists deterministic target id bindings', async () => {
        const previousManagerHome = process.env.N8N_MANAGER_HOME;
        const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-workspace-'));
        process.env.N8N_MANAGER_HOME = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-manager-'));
        try {
            const globalWorkspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-global-'));
            const globalConfigService = new ConfigService(globalWorkspaceRoot);
            globalConfigService.saveLocalConfig({
                host: 'https://dev.example.test',
                instanceIdentifier: 'n8n_1111111111',
            }, { instanceId: 'dev-instance', instanceName: 'Dev', apiKey: 'dev-key' });
            globalConfigService.saveLocalConfig({
                host: 'https://prod.example.test',
                instanceIdentifier: 'n8n_2222222222',
            }, { instanceId: 'prod-instance', instanceName: 'Prod', apiKey: 'prod-key', setActive: false });

            const configService = new ConfigService(workspaceRoot);
            const devTarget = configService.addInstanceTarget({ name: 'Dev Target', managedInstanceId: 'dev-instance' });
            const prodTarget = configService.addInstanceTarget({ name: 'Prod Target', managedInstanceId: 'prod-instance' });
            configService.addEnvironment({ name: 'Dev', environmentTarget: devTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/dev' });
            configService.addEnvironment({ name: 'Prod', environmentTarget: prodTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/prod' });

            const sourceDir = configService.resolveEnvironment('Dev').workflowsPath!;
            const targetDir = configService.resolveEnvironment('Prod').workflowsPath!;
            mkdirSync(sourceDir, { recursive: true });
            const sourcePath = path.join(sourceDir, 'mapped-credential.workflow.ts');
            writeFileSync(sourcePath, `import { workflow, node } from '@n8n-as-code/transformer';

@workflow({ id: 'source-wf', name: 'Mapped Credential Workflow', active: false })
export class MappedCredentialWorkflow {
  @node({
    name: 'Postgres',
    type: 'n8n-nodes-base.postgres',
    version: 2,
    position: [100, 100],
    credentials: { postgres: { id: 'source-postgres', name: 'Dev Database' } }
  })
  Postgres = { operation: 'executeQuery' };
}
`, 'utf8');

            const promptCandidates: string[] = [];
            await new PromoteCommand(configService, {
                createClient: () => ({
                    getAllWorkflows: async () => [],
                    listCredentials: async () => [
                        { id: 'target-postgres', name: 'Prod Database', type: 'postgres' },
                        { id: 'target-http', name: 'Prod HTTP', type: 'httpBasicAuth' },
                    ],
                }),
                promptCredentialMapping: async (candidate, targetCredentials) => {
                    promptCandidates.push(`${candidate.sourceName}:${candidate.credentialType}`);
                    expect(targetCredentials).toEqual([{ id: 'target-postgres', name: 'Prod Database', type: 'postgres' }]);
                    return { action: 'map', credential: targetCredentials[0]! };
                },
            }).run(sourcePath, {
                from: 'Dev',
                to: 'Prod',
                push: false,
                promotionConfig: path.join(workspaceRoot, 'n8nac-promotion.json'),
            });

            expect(promptCandidates).toEqual(['Dev Database:postgres']);
            const promoted = readFileSync(path.join(targetDir, 'mapped-credential.workflow.ts'), 'utf8');
            expect(promoted).toContain("id: 'target-postgres'");
            expect(promoted).toContain("name: 'Prod Database'");
            const promotionConfig = JSON.parse(readFileSync(path.join(workspaceRoot, 'n8nac-promotion.json'), 'utf8'));
            expect(promotionConfig.version).toBe(2);
            expect(promotionConfig.routes['Dev->Prod'].bindings.credentials['Dev Database:postgres']).toBe('target-postgres');
        } finally {
            if (previousManagerHome === undefined) {
                delete process.env.N8N_MANAGER_HOME;
            } else {
                process.env.N8N_MANAGER_HOME = previousManagerHome;
            }
        }
    });

    it('prompts with target credentials that use n8n credentialType and credentialId fields', async () => {
        const previousManagerHome = process.env.N8N_MANAGER_HOME;
        const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-workspace-'));
        process.env.N8N_MANAGER_HOME = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-manager-'));
        try {
            const globalWorkspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-global-'));
            const globalConfigService = new ConfigService(globalWorkspaceRoot);
            globalConfigService.saveLocalConfig({
                host: 'https://test.example.test',
                instanceIdentifier: 'n8n_1111111111',
            }, { instanceId: 'test-instance', instanceName: 'Test', apiKey: 'test-key' });
            globalConfigService.saveLocalConfig({
                host: 'https://prod.example.test',
                instanceIdentifier: 'n8n_2222222222',
            }, { instanceId: 'prod-instance', instanceName: 'Prod', apiKey: 'prod-key', setActive: false });

            const configService = new ConfigService(workspaceRoot);
            const testTarget = configService.addInstanceTarget({ name: 'Test Target', managedInstanceId: 'test-instance' });
            const prodTarget = configService.addInstanceTarget({ name: 'Prod Target', managedInstanceId: 'prod-instance' });
            configService.addEnvironment({ name: 'Test', environmentTarget: testTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/test' });
            configService.addEnvironment({ name: 'Prod', environmentTarget: prodTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/prod' });

            const sourceDir = configService.resolveEnvironment('Test').workflowsPath!;
            const targetDir = configService.resolveEnvironment('Prod').workflowsPath!;
            mkdirSync(sourceDir, { recursive: true });
            const sourcePath = path.join(sourceDir, 'postgres.workflow.ts');
            writeFileSync(sourcePath, `import { workflow, node } from '@n8n-as-code/transformer';

@workflow({ id: 'source-wf', name: 'Postgres Workflow', active: false })
export class PostgresWorkflow {
  @node({
    name: 'Postgres',
    type: 'n8n-nodes-base.postgres',
    version: 2,
    position: [100, 100],
    credentials: { postgres: { id: 'source-postgres', name: 'DB_TEST' } }
  })
  Postgres = { operation: 'executeQuery' };
}
`, 'utf8');

            const promptCandidates: string[] = [];
            await new PromoteCommand(configService, {
                createClient: () => ({
                    getAllWorkflows: async () => [],
                    listCredentials: async () => [
                        { credentialId: 'target-postgres', name: 'DB_PROD', credentialType: 'postgres' },
                        { credentialId: 'target-http', name: 'HTTP_PROD', credentialType: 'httpBasicAuth' },
                    ],
                }),
                promptCredentialMapping: async (candidate, targetCredentials) => {
                    promptCandidates.push(`${candidate.sourceName}:${candidate.credentialType}`);
                    expect(targetCredentials).toEqual([{ credentialId: 'target-postgres', name: 'DB_PROD', credentialType: 'postgres' }]);
                    return { action: 'map', credential: targetCredentials[0]! };
                },
            }).run(sourcePath, {
                from: 'Test',
                to: 'Prod',
                push: false,
                promotionConfig: path.join(workspaceRoot, 'n8nac-promotion.json'),
            });

            expect(promptCandidates).toEqual(['DB_TEST:postgres']);
            const promoted = readFileSync(path.join(targetDir, 'postgres.workflow.ts'), 'utf8');
            expect(promoted).toContain("id: 'target-postgres'");
            expect(promoted).toContain("name: 'DB_PROD'");
            const promotionConfig = JSON.parse(readFileSync(path.join(workspaceRoot, 'n8nac-promotion.json'), 'utf8'));
            expect(promotionConfig.routes['Test->Prod'].bindings.credentials['DB_TEST:postgres']).toBe('target-postgres');
        } finally {
            if (previousManagerHome === undefined) {
                delete process.env.N8N_MANAGER_HOME;
            } else {
                process.env.N8N_MANAGER_HOME = previousManagerHome;
            }
        }
    });

    it('resolves manual credential references with colons as exact names or ids before binding syntax', () => {
        const cmd = new PromoteCommand();
        const credentials = [
            { credentialId: 'target:postgres', name: 'DB_PROD', credentialType: 'postgres' },
            { credentialId: 'target-postgres-eu', name: 'Prod:EU', credentialType: 'postgres' },
            { credentialId: 'target-postgres-fallback', name: 'Prod', credentialType: 'postgres' },
            { credentialId: 'target-http-eu', name: 'Prod:EU', credentialType: 'httpBasicAuth' },
        ];
        const resolveInput = (cmd as unknown as {
            resolveCredentialFromInput: (
                reference: string,
                credentialType: string,
                targetCredentials: Array<Record<string, unknown>>,
            ) => Record<string, unknown> | undefined;
        }).resolveCredentialFromInput.bind(cmd);
        const resolveBinding = (cmd as unknown as {
            resolveCredentialBindingReference: (
                boundRef: string | undefined,
                credentialType: string,
                indexes: {
                    targetCredentialsById: Map<string, Record<string, unknown>>;
                    targetCredentialsByKey: Map<string, Array<Record<string, unknown>>>;
                },
            ) => Record<string, unknown> | undefined;
        }).resolveCredentialBindingReference.bind(cmd);

        expect(resolveInput('target:postgres', 'postgres', credentials)).toBe(credentials[0]);
        expect(resolveInput('Prod:EU', 'postgres', credentials)).toBe(credentials[1]);
        expect(resolveInput('Prod:postgres', 'postgres', credentials)).toBe(credentials[2]);
        expect(resolveInput('Prod:httpBasicAuth', 'postgres', credentials)).toBeUndefined();

        const indexes = {
            targetCredentialsById: new Map(credentials.map((credential) => [String(credential.credentialId), credential])),
            targetCredentialsByKey: new Map([
                ['postgres::Prod:EU', [credentials[1]!]],
                ['postgres::Prod', [credentials[2]!]],
            ]),
        };
        expect(resolveBinding('Prod:EU', 'postgres', indexes)).toBe(credentials[1]);
        expect(resolveBinding('Prod:postgres', 'postgres', indexes)).toBe(credentials[2]);
    });

    it('uses the selected credential id when interactive mapping target names are duplicated', async () => {
        const previousManagerHome = process.env.N8N_MANAGER_HOME;
        const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-workspace-'));
        process.env.N8N_MANAGER_HOME = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-manager-'));
        try {
            const globalWorkspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-global-'));
            const globalConfigService = new ConfigService(globalWorkspaceRoot);
            globalConfigService.saveLocalConfig({
                host: 'https://dev.example.test',
                instanceIdentifier: 'n8n_1111111111',
            }, { instanceId: 'dev-instance', instanceName: 'Dev', apiKey: 'dev-key' });
            globalConfigService.saveLocalConfig({
                host: 'https://prod.example.test',
                instanceIdentifier: 'n8n_2222222222',
            }, { instanceId: 'prod-instance', instanceName: 'Prod', apiKey: 'prod-key', setActive: false });

            const configService = new ConfigService(workspaceRoot);
            const devTarget = configService.addInstanceTarget({ name: 'Dev Target', managedInstanceId: 'dev-instance' });
            const prodTarget = configService.addInstanceTarget({ name: 'Prod Target', managedInstanceId: 'prod-instance' });
            configService.addEnvironment({ name: 'Dev', environmentTarget: devTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/dev' });
            configService.addEnvironment({ name: 'Prod', environmentTarget: prodTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/prod' });

            const sourceDir = configService.resolveEnvironment('Dev').workflowsPath!;
            const targetDir = configService.resolveEnvironment('Prod').workflowsPath!;
            mkdirSync(sourceDir, { recursive: true });
            const sourcePath = path.join(sourceDir, 'duplicate-credential.workflow.ts');
            writeFileSync(sourcePath, `import { workflow, node } from '@n8n-as-code/transformer';

@workflow({ id: 'source-wf', name: 'Duplicate Credential Workflow', active: false })
export class DuplicateCredentialWorkflow {
  @node({
    name: 'Postgres',
    type: 'n8n-nodes-base.postgres',
    version: 2,
    position: [100, 100],
    credentials: { postgres: { id: 'source-postgres', name: 'Dev Database' } }
  })
  Postgres = { operation: 'executeQuery' };
}
`, 'utf8');

            await new PromoteCommand(configService, {
                createClient: () => ({
                    getAllWorkflows: async () => [],
                    listCredentials: async () => [
                        { id: 'target-postgres-a', name: 'Prod Database', type: 'postgres' },
                        { id: 'target-postgres-b', name: 'Prod Database', type: 'postgres' },
                    ],
                }),
                promptCredentialMapping: async (_candidate, targetCredentials) => ({ action: 'map', credential: targetCredentials[1]! }),
            }).run(sourcePath, {
                from: 'Dev',
                to: 'Prod',
                push: false,
                promotionConfig: path.join(workspaceRoot, 'n8nac-promotion.json'),
            });

            const promoted = readFileSync(path.join(targetDir, 'duplicate-credential.workflow.ts'), 'utf8');
            expect(promoted).toContain("id: 'target-postgres-b'");
            expect(promoted).toContain("name: 'Prod Database'");
            const promotionConfig = JSON.parse(readFileSync(path.join(workspaceRoot, 'n8nac-promotion.json'), 'utf8'));
            expect(promotionConfig.routes['Dev->Prod'].bindings.credentials['Dev Database:postgres']).toBe('target-postgres-b');
        } finally {
            if (previousManagerHome === undefined) {
                delete process.env.N8N_MANAGER_HOME;
            } else {
                process.env.N8N_MANAGER_HOME = previousManagerHome;
            }
        }
    });

    it('keeps blocking unresolved credentials when interactive prompts are disabled', async () => {
        const previousManagerHome = process.env.N8N_MANAGER_HOME;
        const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-workspace-'));
        process.env.N8N_MANAGER_HOME = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-manager-'));
        try {
            const globalWorkspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-global-'));
            const globalConfigService = new ConfigService(globalWorkspaceRoot);
            globalConfigService.saveLocalConfig({
                host: 'https://dev.example.test',
                instanceIdentifier: 'n8n_1111111111',
            }, { instanceId: 'dev-instance', instanceName: 'Dev', apiKey: 'dev-key' });
            globalConfigService.saveLocalConfig({
                host: 'https://prod.example.test',
                instanceIdentifier: 'n8n_2222222222',
            }, { instanceId: 'prod-instance', instanceName: 'Prod', apiKey: 'prod-key', setActive: false });

            const configService = new ConfigService(workspaceRoot);
            const devTarget = configService.addInstanceTarget({ name: 'Dev Target', managedInstanceId: 'dev-instance' });
            const prodTarget = configService.addInstanceTarget({ name: 'Prod Target', managedInstanceId: 'prod-instance' });
            configService.addEnvironment({ name: 'Dev', environmentTarget: devTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/dev' });
            configService.addEnvironment({ name: 'Prod', environmentTarget: prodTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/prod' });

            const sourceDir = configService.resolveEnvironment('Dev').workflowsPath!;
            mkdirSync(sourceDir, { recursive: true });
            const sourcePath = path.join(sourceDir, 'blocked-credential.workflow.ts');
            writeFileSync(sourcePath, `import { workflow, node } from '@n8n-as-code/transformer';

@workflow({ id: 'source-wf', name: 'Blocked Credential Workflow', active: false })
export class BlockedCredentialWorkflow {
  @node({
    name: 'Postgres',
    type: 'n8n-nodes-base.postgres',
    version: 2,
    position: [100, 100],
    credentials: { postgres: { id: 'source-postgres', name: 'Dev Database' } }
  })
  Postgres = { operation: 'executeQuery' };
}
`, 'utf8');

            const promotionConfigPath = path.join(workspaceRoot, 'n8nac-promotion.json');
            await expect(new PromoteCommand(configService, {
                createClient: () => ({
                    getAllWorkflows: async () => [],
                    listCredentials: async () => [
                        { id: 'target-postgres', name: 'Prod Database', type: 'postgres' },
                    ],
                }),
                promptCredentialMapping: async () => {
                    throw new Error('promptCredentialMapping must not be called when interactive is false');
                },
            }).run(sourcePath, {
                from: 'Dev',
                to: 'Prod',
                push: false,
                interactive: false,
                promotionConfig: promotionConfigPath,
            })).rejects.toThrow('Promotion blocked by 1 problem.');
            expect(existsSync(promotionConfigPath)).toBe(false);
        } finally {
            if (previousManagerHome === undefined) {
                delete process.env.N8N_MANAGER_HOME;
            } else {
                process.env.N8N_MANAGER_HOME = previousManagerHome;
            }
        }
    });

    it('discovers existing remote target workflow ids for no-push promotions', async () => {
        const previousManagerHome = process.env.N8N_MANAGER_HOME;
        const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-workspace-'));
        process.env.N8N_MANAGER_HOME = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-manager-'));
        try {
            const globalWorkspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-global-'));
            const globalConfigService = new ConfigService(globalWorkspaceRoot);
            globalConfigService.saveLocalConfig({
                host: 'https://dev.example.test',
                instanceIdentifier: 'n8n_1111111111',
            }, { instanceId: 'dev-instance', instanceName: 'Dev', apiKey: 'dev-key' });
            globalConfigService.saveLocalConfig({
                host: 'https://prod.example.test',
                instanceIdentifier: 'n8n_2222222222',
            }, { instanceId: 'prod-instance', instanceName: 'Prod', apiKey: 'prod-key', setActive: false });

            const configService = new ConfigService(workspaceRoot);
            const devTarget = configService.addInstanceTarget({ name: 'Dev Target', managedInstanceId: 'dev-instance' });
            const prodTarget = configService.addInstanceTarget({ name: 'Prod Target', managedInstanceId: 'prod-instance' });
            configService.addEnvironment({ name: 'Dev', environmentTarget: devTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/dev' });
            configService.addEnvironment({ name: 'Prod', environmentTarget: prodTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/prod' });

            const sourceDir = configService.resolveEnvironment('Dev').workflowsPath!;
            const targetDir = configService.resolveEnvironment('Prod').workflowsPath!;
            mkdirSync(sourceDir, { recursive: true });
            const sourcePath = path.join(sourceDir, 'remote-existing.workflow.ts');
            writeFileSync(sourcePath, "@workflow({ id: 'source-wf', name: 'Remote Existing', active: false })\nexport class RemoteExisting {}\n", 'utf8');

            const result = await new PromoteCommand(configService, {
                createClient: () => ({
                    getAllWorkflows: async () => [
                        { id: 'target-wf', name: 'Remote Existing', active: false, nodes: [], connections: {} },
                    ],
                    listCredentials: async () => [],
                }),
            }).run(sourcePath, {
                from: 'Dev',
                to: 'Prod',
                push: false,
                promotionConfig: path.join(workspaceRoot, 'n8nac-promotion.json'),
            });

            expect(result.workflowId).toBe('target-wf');
            expect(readFileSync(path.join(targetDir, 'remote-existing.workflow.ts'), 'utf8')).toContain("id: 'target-wf'");
            const promotionConfig = JSON.parse(readFileSync(path.join(workspaceRoot, 'n8nac-promotion.json'), 'utf8'));
            expect(promotionConfig.routes['Dev->Prod'].bindings.workflows['source-wf']).toBe('target-wf');
        } finally {
            if (previousManagerHome === undefined) {
                delete process.env.N8N_MANAGER_HOME;
            } else {
                process.env.N8N_MANAGER_HOME = previousManagerHome;
            }
        }
    });

    it('discovers existing remote target workflow ids during dry-run without persisting bindings', async () => {
        const previousManagerHome = process.env.N8N_MANAGER_HOME;
        const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-workspace-'));
        process.env.N8N_MANAGER_HOME = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-manager-'));
        try {
            const globalWorkspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-global-'));
            const globalConfigService = new ConfigService(globalWorkspaceRoot);
            globalConfigService.saveLocalConfig({
                host: 'https://dev.example.test',
                instanceIdentifier: 'n8n_1111111111',
            }, { instanceId: 'dev-instance', instanceName: 'Dev', apiKey: 'dev-key' });
            globalConfigService.saveLocalConfig({
                host: 'https://prod.example.test',
                instanceIdentifier: 'n8n_2222222222',
            }, { instanceId: 'prod-instance', instanceName: 'Prod', apiKey: 'prod-key', setActive: false });

            const configService = new ConfigService(workspaceRoot);
            const devTarget = configService.addInstanceTarget({ name: 'Dev Target', managedInstanceId: 'dev-instance' });
            const prodTarget = configService.addInstanceTarget({ name: 'Prod Target', managedInstanceId: 'prod-instance' });
            configService.addEnvironment({ name: 'Dev', environmentTarget: devTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/dev' });
            configService.addEnvironment({ name: 'Prod', environmentTarget: prodTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/prod' });

            const sourceDir = configService.resolveEnvironment('Dev').workflowsPath!;
            mkdirSync(sourceDir, { recursive: true });
            const sourcePath = path.join(sourceDir, 'dry-run-existing.workflow.ts');
            writeFileSync(sourcePath, "@workflow({ id: 'source-dry-run', name: 'Dry Run Existing', active: false })\nexport class DryRunExisting {}\n", 'utf8');

            const promotionConfigPath = path.join(workspaceRoot, 'n8nac-promotion.json');
            const result = await new PromoteCommand(configService, {
                createClient: () => ({
                    getAllWorkflows: async () => [
                        { id: 'target-dry-run', name: 'Dry Run Existing', active: false, nodes: [], connections: {} },
                    ],
                    listCredentials: async () => [],
                }),
            }).run(sourcePath, {
                from: 'Dev',
                to: 'Prod',
                dryRun: true,
                promotionConfig: promotionConfigPath,
            });

            expect(result.workflowId).toBe('target-dry-run');
            expect(result.workflows[0].action).toBe('update');
            expect(existsSync(promotionConfigPath)).toBe(false);
        } finally {
            if (previousManagerHome === undefined) {
                delete process.env.N8N_MANAGER_HOME;
            } else {
                process.env.N8N_MANAGER_HOME = previousManagerHome;
            }
        }
    });

    it('refreshes target inventories between runs on the same command instance', async () => {
        const previousManagerHome = process.env.N8N_MANAGER_HOME;
        const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-workspace-'));
        process.env.N8N_MANAGER_HOME = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-manager-'));
        try {
            const globalWorkspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-global-'));
            const globalConfigService = new ConfigService(globalWorkspaceRoot);
            globalConfigService.saveLocalConfig({
                host: 'https://dev.example.test',
                instanceIdentifier: 'n8n_1111111111',
            }, { instanceId: 'dev-instance', instanceName: 'Dev', apiKey: 'dev-key' });
            globalConfigService.saveLocalConfig({
                host: 'https://prod.example.test',
                instanceIdentifier: 'n8n_2222222222',
            }, { instanceId: 'prod-instance', instanceName: 'Prod', apiKey: 'prod-key', setActive: false });
            globalConfigService.saveLocalConfig({
                host: 'https://staging.example.test',
                instanceIdentifier: 'n8n_3333333333',
            }, { instanceId: 'staging-instance', instanceName: 'Staging', apiKey: 'staging-key', setActive: false });

            const configService = new ConfigService(workspaceRoot);
            const devTarget = configService.addInstanceTarget({ name: 'Dev Target', managedInstanceId: 'dev-instance' });
            const prodTarget = configService.addInstanceTarget({ name: 'Prod Target', managedInstanceId: 'prod-instance' });
            const stagingTarget = configService.addInstanceTarget({ name: 'Staging Target', managedInstanceId: 'staging-instance' });
            configService.addEnvironment({ name: 'Dev', environmentTarget: devTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/dev' });
            configService.addEnvironment({ name: 'Prod', environmentTarget: prodTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/prod' });
            configService.addEnvironment({ name: 'Staging', environmentTarget: stagingTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/staging' });

            const sourceDir = configService.resolveEnvironment('Dev').workflowsPath!;
            mkdirSync(sourceDir, { recursive: true });
            const sourcePath = path.join(sourceDir, 'reusable.workflow.ts');
            writeFileSync(sourcePath, "@workflow({ id: 'source-reusable', name: 'Reusable', active: false })\nexport class Reusable {}\n", 'utf8');

            const command = new PromoteCommand(configService, {
                createClient: (environment) => ({
                    getAllWorkflows: async () => environment.environmentName === 'Prod'
                        ? [{ id: 'prod-wf', name: 'Reusable', active: false, nodes: [], connections: {} }]
                        : [{ id: 'staging-wf', name: 'Reusable', active: false, nodes: [], connections: {} }],
                    listCredentials: async () => [],
                }),
            });

            const prodResult = await command.run(sourcePath, {
                from: 'Dev',
                to: 'Prod',
                dryRun: true,
                promotionConfig: path.join(workspaceRoot, 'n8nac-promotion-prod.json'),
            });
            const stagingResult = await command.run(sourcePath, {
                from: 'Dev',
                to: 'Staging',
                dryRun: true,
                promotionConfig: path.join(workspaceRoot, 'n8nac-promotion-staging.json'),
            });

            expect(prodResult.workflowId).toBe('prod-wf');
            expect(stagingResult.workflowId).toBe('staging-wf');
        } finally {
            if (previousManagerHome === undefined) {
                delete process.env.N8N_MANAGER_HOME;
            } else {
                process.env.N8N_MANAGER_HOME = previousManagerHome;
            }
        }
    });

    it('creates referenced workflows first and remaps execute-workflow ids', async () => {
        const previousManagerHome = process.env.N8N_MANAGER_HOME;
        const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-workspace-'));
        process.env.N8N_MANAGER_HOME = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-manager-'));
        try {
            const globalWorkspaceRoot = mkdtempSync(path.join(tmpdir(), 'n8nac-promote-global-'));
            const globalConfigService = new ConfigService(globalWorkspaceRoot);
            globalConfigService.saveLocalConfig({
                host: 'https://dev.example.test',
                instanceIdentifier: 'n8n_1111111111',
            }, { instanceId: 'dev-instance', instanceName: 'Dev', apiKey: 'dev-key' });
            globalConfigService.saveLocalConfig({
                host: 'https://prod.example.test',
                instanceIdentifier: 'n8n_2222222222',
            }, { instanceId: 'prod-instance', instanceName: 'Prod', apiKey: 'prod-key', setActive: false });

            const configService = new ConfigService(workspaceRoot);
            const devTarget = configService.addInstanceTarget({ name: 'Dev Target', managedInstanceId: 'dev-instance' });
            const prodTarget = configService.addInstanceTarget({ name: 'Prod Target', managedInstanceId: 'prod-instance' });
            configService.addEnvironment({ name: 'Dev', environmentTarget: devTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/dev' });
            configService.addEnvironment({ name: 'Prod', environmentTarget: prodTarget.id, projectId: 'personal', projectName: 'Personal', workflowsPath: 'workflows/prod' });

            const sourceDir = configService.resolveEnvironment('Dev').workflowsPath!;
            const targetDir = configService.resolveEnvironment('Prod').workflowsPath!;
            mkdirSync(sourceDir, { recursive: true });
            writeFileSync(path.join(sourceDir, 'caller.workflow.ts'), `import { workflow, node } from '@n8n-as-code/transformer';

@workflow({ id: 'source-caller', name: 'Caller', active: false })
export class CallerWorkflow {
  @node({
    name: 'Execute Workflow',
    type: 'n8n-nodes-base.executeWorkflow',
    version: 1,
    position: [100, 100]
  })
  ExecuteWorkflow = { workflowId: 'source-child' };
}
`, 'utf8');
            writeFileSync(path.join(sourceDir, 'child.workflow.ts'), "@workflow({ id: 'source-child', name: 'Child', active: false })\nexport class ChildWorkflow {}\n", 'utf8');

            const pushed: string[] = [];
            await new PromoteCommand(configService, {
                createClient: () => ({
                    getAllWorkflows: async () => [],
                    listCredentials: async () => [],
                }),
                pushWorkflow: async (_target, targetPath) => {
                    pushed.push(path.basename(targetPath));
                    return targetPath.includes('child.workflow.ts') ? 'target-child' : 'target-caller';
                },
            }).run(undefined, {
                from: 'Dev',
                to: 'Prod',
                promotionConfig: path.join(workspaceRoot, 'n8nac-promotion.json'),
            });

            expect(pushed).toEqual(['child.workflow.ts', 'caller.workflow.ts']);
            const promotedCaller = readFileSync(path.join(targetDir, 'caller.workflow.ts'), 'utf8');
            expect(promotedCaller).toContain("workflowId: 'target-child'");
            const promotionConfig = JSON.parse(readFileSync(path.join(workspaceRoot, 'n8nac-promotion.json'), 'utf8'));
            expect(promotionConfig.routes['Dev->Prod'].bindings.workflows['source-child']).toBe('target-child');
            expect(promotionConfig.routes['Dev->Prod'].bindings.workflows['source-caller']).toBe('target-caller');
        } finally {
            if (previousManagerHome === undefined) {
                delete process.env.N8N_MANAGER_HOME;
            } else {
                process.env.N8N_MANAGER_HOME = previousManagerHome;
            }
        }
    });
});
