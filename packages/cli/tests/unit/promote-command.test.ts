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
            configService.addEnvironment({ name: 'Dev', environmentTarget: devTarget.id, projectId: 'personal', projectName: 'Personal', syncFolder: 'workflows/dev' });
            configService.addEnvironment({ name: 'Prod', environmentTarget: prodTarget.id, projectId: 'personal', projectName: 'Personal', syncFolder: 'workflows/prod' });

            const sourceDir = configService.resolveEnvironment('Dev').workflowDir!;
            const targetDir = configService.resolveEnvironment('Prod').workflowDir!;
            mkdirSync(sourceDir, { recursive: true });
            mkdirSync(targetDir, { recursive: true });
            const workflow = "@workflow({ name: 'One' })\nexport class One {}\n";
            const sourcePath = path.join(sourceDir, 'one.workflow.ts');
            writeFileSync(sourcePath, workflow, 'utf8');
            writeFileSync(path.join(targetDir, 'one.workflow.ts'), workflow, 'utf8');

            await expect(new PromoteCommand(configService).run(sourcePath, { from: 'Dev', to: 'Prod', dryRun: true, promotionConfig: path.join(workspaceRoot, 'n8nac-promotion.json') })).resolves.toMatchObject({
                targetEnvironmentName: 'Prod',
                targetPath: path.join(targetDir, 'one.workflow.ts'),
                dryRun: true,
                pushed: false,
            });
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
            configService.addEnvironment({ name: 'Dev', environmentTarget: devTarget.id, projectId: 'personal', projectName: 'Personal', syncFolder: 'workflows/dev' });
            configService.addEnvironment({ name: 'Prod', environmentTarget: prodTarget.id, projectId: 'personal', projectName: 'Personal', syncFolder: 'workflows/prod' });

            const sourceDir = configService.resolveEnvironment('Dev').workflowDir!;
            const targetDir = configService.resolveEnvironment('Prod').workflowDir!;
            mkdirSync(sourceDir, { recursive: true });
            mkdirSync(targetDir, { recursive: true });
            const sourcePath = path.join(sourceDir, 'one.workflow.ts');
            const targetPath = path.join(targetDir, 'one.workflow.ts');
            writeFileSync(sourcePath, "@workflow({ name: 'Source' })\nexport class Source {}\n", 'utf8');
            writeFileSync(targetPath, "@workflow({ id: 'target-id', name: 'Target' })\nexport class Target {}\n", 'utf8');

            await expect(new PromoteCommand(configService).run(sourcePath, { from: 'Dev', to: 'Prod', push: false, promotionConfig: path.join(workspaceRoot, 'n8nac-promotion.json') })).resolves.toMatchObject({
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
            configService.addEnvironment({ name: 'Dev', environmentTarget: devTarget.id, projectId: 'personal', projectName: 'Personal', syncFolder: 'workflows/dev' });
            configService.addEnvironment({ name: 'Prod', environmentTarget: prodTarget.id, projectId: 'personal', projectName: 'Personal', syncFolder: 'workflows/prod' });

            const sourceDir = configService.resolveEnvironment('Dev').workflowDir!;
            const targetDir = configService.resolveEnvironment('Prod').workflowDir!;
            mkdirSync(sourceDir, { recursive: true });
            writeFileSync(path.join(sourceDir, 'one.workflow.ts'), "@workflow({ name: 'One', active: false })\nexport class One {}\n", 'utf8');
            writeFileSync(path.join(sourceDir, 'two.workflow.ts'), "@workflow({ name: 'Two', active: false })\nexport class Two {}\n", 'utf8');

            const result = await new PromoteCommand(configService).run(undefined, {
                from: 'Dev',
                to: 'Prod',
                push: false,
                promotionConfig: path.join(workspaceRoot, 'n8nac-promotion.json'),
            });

            expect(result.summary.planned).toBe(2);
            expect(existsSync(path.join(targetDir, 'one.workflow.ts'))).toBe(true);
            expect(existsSync(path.join(targetDir, 'two.workflow.ts'))).toBe(true);
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
            configService.addEnvironment({ name: 'Dev', environmentTarget: devTarget.id, projectId: 'personal', projectName: 'Personal', syncFolder: 'workflows/dev' });
            configService.addEnvironment({ name: 'Prod', environmentTarget: prodTarget.id, projectId: 'personal', projectName: 'Personal', syncFolder: 'workflows/prod' });

            const sourceDir = configService.resolveEnvironment('Dev').workflowDir!;
            const targetDir = configService.resolveEnvironment('Prod').workflowDir!;
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
            expect(promotionConfig.routes['Dev->Prod'].bindings.credentials['source-cred']).toBe('target-cred');
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
            configService.addEnvironment({ name: 'Dev', environmentTarget: devTarget.id, projectId: 'personal', projectName: 'Personal', syncFolder: 'workflows/dev' });
            configService.addEnvironment({ name: 'Prod', environmentTarget: prodTarget.id, projectId: 'personal', projectName: 'Personal', syncFolder: 'workflows/prod' });

            const sourceDir = configService.resolveEnvironment('Dev').workflowDir!;
            const targetDir = configService.resolveEnvironment('Prod').workflowDir!;
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
