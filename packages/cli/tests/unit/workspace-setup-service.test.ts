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
    it('writes a minimal tsconfig without baseUrl and with wildcard paths mapping', () => {
        const workflowDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-workspace-'));
        tempDirs.push(workflowDir);

        WorkspaceSetupService.ensureWorkspaceFiles(workflowDir);

        const tsconfigPath = path.join(workflowDir, 'tsconfig.json');
        expect(fs.existsSync(tsconfigPath)).toBe(true);

        const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
        expect(tsconfig.compilerOptions.baseUrl).toBeUndefined();
        expect(tsconfig.compilerOptions.paths['*']).toEqual(['./*']);
        expect(tsconfig.compilerOptions.paths['@n8n-as-code/transformer']).toEqual(['./n8n-workflows.d.ts']);
    });
});
