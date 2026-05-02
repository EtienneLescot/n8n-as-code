import fs from 'fs';
import os from 'os';
import path from 'path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceSetupService } from '../../src/core/services/workspace-setup-service.js';

const tempDirs: string[] = [];

afterEach(() => {
    for (const dir of tempDirs) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
});

describe('WorkspaceSetupService', () => {
    it('writes a minimal tsconfig without baseUrl and paths mapping', () => {
        const workflowDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-workspace-'));
        tempDirs.push(workflowDir);

        WorkspaceSetupService.ensureWorkspaceFiles(workflowDir);

        const tsconfigPath = path.join(workflowDir, 'tsconfig.json');
        expect(fs.existsSync(tsconfigPath)).toBe(true);

        const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
        expect(tsconfig.compilerOptions.baseUrl).toBeUndefined();
        expect(tsconfig.compilerOptions.paths).toBeUndefined();
        expect(tsconfig.compilerOptions.module).toBe('NodeNext');
        expect(tsconfig.compilerOptions.moduleResolution).toBe('NodeNext');
    });

    it('writes declaration file with ambient module for @n8n-as-code/transformer', () => {
        const workflowDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-workspace-'));
        tempDirs.push(workflowDir);

        WorkspaceSetupService.ensureWorkspaceFiles(workflowDir);

        const declarationPath = path.join(workflowDir, 'n8n-workflows.d.ts');
        expect(fs.existsSync(declarationPath)).toBe(true);

        const declaration = fs.readFileSync(declarationPath, 'utf-8');
        expect(declaration).not.toContain('export {};');
        expect(declaration).toContain("declare module '@n8n-as-code/transformer' {");
        expect(declaration).toContain('/** Unique identifier of the node (matches workflow JSON) */');
        expect(declaration).toMatch(/export interface NodeDecoratorOptions\s*\{[\s\S]*?\bid\?:\s*string;/);
    });

    it('type-checks generated workflow imports without installing transformer locally', () => {
        const workflowDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-workspace-'));
        tempDirs.push(workflowDir);

        WorkspaceSetupService.ensureWorkspaceFiles(workflowDir);
        fs.writeFileSync(
            path.join(workflowDir, 'sample.workflow.ts'),
            [
                "import { workflow, node, links } from '@n8n-as-code/transformer';",
                '',
                "@workflow({ id: 'wf_1', name: 'Sample', active: false })",
                'export class SampleWorkflow {',
                "    @node({ id: 'node_1', name: 'Manual Trigger', type: 'n8n-nodes-base.manualTrigger', version: 1 })",
                '    Trigger = {};',
                '',
                '    @links()',
                '    defineRouting() {}',
                '}',
                '',
            ].join('\n'),
            'utf-8'
        );

        const configPath = path.join(workflowDir, 'tsconfig.json');
        const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
        expect(configFile.error).toBeUndefined();

        const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, workflowDir);
        const program = ts.createProgram(parsed.fileNames, parsed.options);
        const diagnostics = ts.getPreEmitDiagnostics(program).filter(
            (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
        );

        expect(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))).toEqual([]);
    });
});
