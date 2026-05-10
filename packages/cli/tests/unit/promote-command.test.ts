import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
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

            const sourceDir = path.join(workspaceRoot, 'workflows/dev/n8n_1111111111/personal');
            const targetDir = path.join(workspaceRoot, 'workflows/prod/n8n_2222222222/personal');
            mkdirSync(sourceDir, { recursive: true });
            mkdirSync(targetDir, { recursive: true });
            const workflow = "@workflow({ name: 'One' })\nexport class One {}\n";
            const sourcePath = path.join(sourceDir, 'one.workflow.ts');
            writeFileSync(sourcePath, workflow, 'utf8');
            writeFileSync(path.join(targetDir, 'one.workflow.ts'), workflow, 'utf8');

            await expect(new PromoteCommand(configService).run(sourcePath, { from: 'Dev', to: 'Prod', dryRun: true })).resolves.toMatchObject({
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

    it('requires overwrite before replacing an existing target workflow file', async () => {
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

            const sourceDir = path.join(workspaceRoot, 'workflows/dev/n8n_1111111111/personal');
            const targetDir = path.join(workspaceRoot, 'workflows/prod/n8n_2222222222/personal');
            mkdirSync(sourceDir, { recursive: true });
            mkdirSync(targetDir, { recursive: true });
            const sourcePath = path.join(sourceDir, 'one.workflow.ts');
            const targetPath = path.join(targetDir, 'one.workflow.ts');
            writeFileSync(sourcePath, "@workflow({ name: 'Source' })\nexport class Source {}\n", 'utf8');
            writeFileSync(targetPath, "@workflow({ id: 'target-id', name: 'Target' })\nexport class Target {}\n", 'utf8');

            await expect(new PromoteCommand(configService).run(sourcePath, { from: 'Dev', to: 'Prod', push: false })).rejects.toThrow(/--overwrite/);
            expect(readFileSync(targetPath, 'utf8')).toContain("name: 'Target'");

            await expect(new PromoteCommand(configService).run(sourcePath, { from: 'Dev', to: 'Prod', push: false, overwrite: true })).resolves.toMatchObject({
                targetEnvironmentName: 'Prod',
                targetPath,
                pushed: false,
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
});
