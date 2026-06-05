import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';

interface FixtureState {
    workspaceDir: string;
    previousApiKey: string | undefined;
    previousWorkspaceRoot: string | undefined;
    previousSkipRuntimePrepare: string | undefined;
}

export function installV4WorkspaceFixture(): void {
    let state: FixtureState | undefined;

    beforeEach(() => {
        const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-v4-test-workspace-'));
        fs.writeFileSync(path.join(workspaceDir, 'n8nac-config.json'), JSON.stringify({
            version: 4,
            activeEnvironmentId: 'dev',
            environmentTargets: [{
                id: 'dev-target',
                name: 'Dev Target',
                kind: 'external-instance',
                url: 'https://n8n.test',
                instanceIdentifier: 'inst_c6c289e49e',
            }],
            environments: [{
                id: 'dev',
                name: 'Dev',
                environmentTargetId: 'dev-target',
                projectId: 'personal',
                projectName: 'Personal',
                workflowsPath: 'workflows/dev',
            }],
        }, null, 2));

        state = {
            workspaceDir,
            previousApiKey: process.env.N8NAC_ENV_DEV_API_KEY,
            previousWorkspaceRoot: process.env.N8NAC_TEST_WORKSPACE_ROOT,
            previousSkipRuntimePrepare: process.env.N8NAC_TEST_SKIP_RUNTIME_PREPARE,
        };
        process.env.N8NAC_TEST_WORKSPACE_ROOT = workspaceDir;
        process.env.N8NAC_ENV_DEV_API_KEY = 'test-key';
        process.env.N8NAC_TEST_SKIP_RUNTIME_PREPARE = '1';
    });

    afterEach(() => {
        if (!state) return;
        if (state.previousApiKey === undefined) {
            delete process.env.N8NAC_ENV_DEV_API_KEY;
        } else {
            process.env.N8NAC_ENV_DEV_API_KEY = state.previousApiKey;
        }
        if (state.previousWorkspaceRoot === undefined) {
            delete process.env.N8NAC_TEST_WORKSPACE_ROOT;
        } else {
            process.env.N8NAC_TEST_WORKSPACE_ROOT = state.previousWorkspaceRoot;
        }
        if (state.previousSkipRuntimePrepare === undefined) {
            delete process.env.N8NAC_TEST_SKIP_RUNTIME_PREPARE;
        } else {
            process.env.N8NAC_TEST_SKIP_RUNTIME_PREPARE = state.previousSkipRuntimePrepare;
        }
        fs.rmSync(state.workspaceDir, { recursive: true, force: true });
        state = undefined;
    });
}
