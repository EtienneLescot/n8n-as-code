import fs from 'fs';
import os from 'os';
import path from 'path';
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
        expect(declaration).toContain("declare module '@n8n-as-code/transformer' {");
    });
});
