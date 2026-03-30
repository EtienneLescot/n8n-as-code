import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { SyncManager, WorkflowSyncStatus } from '../../dist/core/index.js';
import { createProjectSlug } from '../../dist/core/services/directory-utils.js';
import { N8nApiClient } from '../../dist/core/services/n8n-api-client.js';
import { WorkflowTransformerAdapter } from '../../dist/core/services/workflow-transformer-adapter.js';

function loadEnvFile() {
    const candidates = [
        path.resolve(process.cwd(), '.env.test'),
        path.resolve(process.cwd(), '../../.env.test'),
        path.resolve(process.cwd(), 'packages/cli/.env.test'),
        path.resolve(import.meta.dirname, '../../../../.env.test'),
        path.resolve(import.meta.dirname, '../../.env.test')
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            dotenv.config({ path: candidate });
            return candidate;
        }
    }

    return null;
}

function requireValue(value, message) {
    if (value === null || value === undefined || value === '') {
        throw new Error(message);
    }

    return value;
}

function normalizeEnvValue(value) {
    if (!value) {
        return undefined;
    }

    return value.trim().replace(/^['"]|['"]$/g, '');
}

function buildWorkflowSource(workflowName) {
    return `import { workflow, node } from '@n8n-as-code/transformer';

@workflow({
    name: '${workflowName}',
    active: false
})
export class ${workflowName.replace(/[^a-zA-Z0-9]/g, '')} {
    @node({
        name: 'Start',
        type: 'n8n-nodes-base.noOp',
        version: 1,
        position: [250, 300]
    })
    Start = {};
}
`;
}

async function buildRemoteWorkflowPayload(workflowName) {
    const compiledWorkflow = await WorkflowTransformerAdapter.compileToJson(
        buildWorkflowSource(workflowName)
    );

    return {
        name: compiledWorkflow.name || workflowName,
        nodes: compiledWorkflow.nodes,
        connections: compiledWorkflow.connections,
        settings: compiledWorkflow.settings || {}
    };
}

function buildRemoteUpdatePayload(workflow, nextName) {
    return {
        name: nextName,
        nodes: workflow.nodes,
        connections: workflow.connections,
        settings: workflow.settings || {}
    };
}

function renameWorkflowInLocalFile(filePath, previousName, nextName) {
    const currentContent = fs.readFileSync(filePath, 'utf-8');
    const updatedContent = currentContent.replace(
        `name: '${previousName}'`,
        `name: '${nextName}'`
    );

    if (updatedContent === currentContent) {
        throw new Error(`Failed to update workflow name in ${filePath}`);
    }

    fs.writeFileSync(filePath, updatedContent, 'utf-8');
}

function renameLocalWorkflowFile(filePath, nextFilename) {
    const nextPath = path.join(path.dirname(filePath), nextFilename);
    fs.renameSync(filePath, nextPath);
    return nextPath;
}

function copyLocalWorkflowFile(sourcePath, targetFilename) {
    const targetPath = path.join(path.dirname(sourcePath), targetFilename);
    fs.copyFileSync(sourcePath, targetPath);
    return targetPath;
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractWorkflowIdFromLocalFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const idMatch = content.match(/id:\s*['"]([^'"]+)['"]/);
    return idMatch?.[1];
}

async function resolveWritableProject(apiClient) {
    const projects = await apiClient.getProjects();
    const project = projects.find((entry) => entry.type === 'personal')
        || projects[0];

    if (!project) {
        throw new Error(
            'Projects API returned no writable project for live integration tests. '
            + 'Check credentials and project permissions.'
        );
    }

    return {
        id: project.id,
        name: project.name
    };
}

async function main() {
    const envFile = loadEnvFile();
    const host = normalizeEnvValue(process.env.N8N_HOST);
    const apiKey = normalizeEnvValue(process.env.N8N_API_KEY);

    if (!host || !apiKey) {
        console.log('[OFFLINE] Live CLI integration tests skipped: missing N8N_HOST or N8N_API_KEY.');
        if (!envFile) {
            console.log('No .env.test file found.');
        }
        process.exit(0);
    }

    const apiClient = new N8nApiClient({
        host: requireValue(host, 'Missing N8N_HOST'),
        apiKey: requireValue(apiKey, 'Missing N8N_API_KEY')
    });

    let project;
    try {
        project = await resolveWritableProject(apiClient);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Failed to resolve writable project for live integration tests:', message);

        const offlineLike =
            /\b401\b|\b403\b/.test(message) ||
            /\bECONNREFUSED\b/.test(message) ||
            /\bENOTFOUND\b/.test(message) ||
            /\bETIMEDOUT\b/.test(message);

        if (offlineLike) {
            console.log('[OFFLINE] Live CLI integration tests skipped: unable to resolve a project (credentials may be invalid or expired).');
            process.exit(0);
        }

        throw new Error(
            `Unable to resolve a writable project for live integration tests. `
            + `N8N_HOST/N8N_API_KEY may be invalid or expired. Root cause: ${message}`
        );
    }
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-live-sync-'));
    const syncManager = new SyncManager(apiClient, {
        directory: tempRoot,
        syncInactive: true,
        ignoredTags: [],
        projectId: project.id,
        projectName: project.name,
        instanceIdentifier: 'live_integration'
    });

    const createdWorkflowIds = new Set();
    const createdTagIds = new Set();
    const syncErrors = [];
    const testRunPrefix = `n8nac-live-${Date.now()}`;
    const scenarioFailures = [];

    syncManager.on('error', (error) => {
        const message = error instanceof Error ? error.message : String(error);
        syncErrors.push(message);
        console.error(`[live-sync-test] sync-manager-error: ${message}`);
    });

    syncManager.on('connection-lost', (error) => {
        const message = error instanceof Error ? error.message : String(error);
        syncErrors.push(`connection-lost: ${message}`);
        console.error(`[live-sync-test] sync-manager-connection-lost: ${message}`);
    });

    await syncManager.refreshLocalState();

    const instanceDirectory = path.join(tempRoot, 'live_integration', createProjectSlug(project.name));

    function localFilePath(filename) {
        return path.join(instanceDirectory, filename);
    }

    function inputPathForPush(filePath) {
        return path.relative(process.cwd(), filePath);
    }

    function writeLocalWorkflow(filename, workflowName) {
        const filePath = localFilePath(filename);
        fs.writeFileSync(filePath, buildWorkflowSource(workflowName), 'utf-8');
        return filePath;
    }

    async function fetchRemoteWorkflow(workflowId) {
        const workflow = await apiClient.getWorkflow(workflowId);
        assert.ok(workflow, `Expected remote workflow ${workflowId} to exist.`);
        return workflow;
    }

    async function runScenario(name, fn) {
        syncErrors.length = 0;
        process.stdout.write(`- ${name} ... `);

        try {
            await fn();
            assert.deepEqual(syncErrors, [], `Unexpected sync manager errors during ${name}`);
            console.log('PASS');
            console.log(`SCENARIO_PASS:${name}`);
        } catch (error) {
            console.log('FAIL');
            const message = error instanceof Error ? error.stack || error.message : String(error);
            scenarioFailures.push({ name, message });
            console.log(`SCENARIO_FAIL:${name}`);
        }
    }

    try {
        console.log(`Running live CLI integration tests against project "${project.name}".`);

        await runScenario('pushes a brand-new local workflow from a path inside the sync scope', async () => {
            const workflowName = `${testRunPrefix} create`;
            const filename = `${workflowName}.workflow.ts`;
            const filePath = writeLocalWorkflow(filename, workflowName);

            const workflowId = await syncManager.push(inputPathForPush(filePath));
            createdWorkflowIds.add(workflowId);

            const remoteWorkflow = await fetchRemoteWorkflow(workflowId);
            assert.equal(remoteWorkflow.name, workflowName);
            assert.match(fs.readFileSync(filePath, 'utf-8'), new RegExp(workflowId));
        });

        await runScenario('pushes a local modification back to the remote workflow', async () => {
            const originalName = `${testRunPrefix} update source`;
            const updatedName = `${testRunPrefix} update applied`;
            const filename = `${originalName}.workflow.ts`;
            const filePath = writeLocalWorkflow(filename, originalName);

            const workflowId = await syncManager.push(inputPathForPush(filePath));
            createdWorkflowIds.add(workflowId);

            renameWorkflowInLocalFile(filePath, originalName, updatedName);

            const pushedWorkflowId = await syncManager.push(inputPathForPush(filePath));
            assert.equal(pushedWorkflowId, workflowId);

            const remoteWorkflow = await fetchRemoteWorkflow(workflowId);
            assert.equal(remoteWorkflow.name, updatedName);
        });

        await runScenario('pushes a renamed local file back to the same remote workflow', async () => {
            const workflowName = `${testRunPrefix} rename file`;
            const originalFilename = `a-${workflowName}.workflow.ts`;
            const renamedFilename = `z-${workflowName}.workflow.ts`;
            const originalFilePath = writeLocalWorkflow(originalFilename, workflowName);

            const workflowId = await syncManager.push(inputPathForPush(originalFilePath));
            createdWorkflowIds.add(workflowId);

            const renamedFilePath = renameLocalWorkflowFile(originalFilePath, renamedFilename);

            await syncManager.refreshLocalState();
            assert.equal(syncManager.getWorkflowIdForFilename(originalFilename), undefined);
            assert.equal(syncManager.getWorkflowIdForFilename(renamedFilename), workflowId);

            const pushedWorkflowId = await syncManager.push(inputPathForPush(renamedFilePath));
            assert.equal(pushedWorkflowId, workflowId);

            const remoteWorkflow = await fetchRemoteWorkflow(workflowId);
            assert.equal(remoteWorkflow.name, workflowName);

            const localWorkflowId = extractWorkflowIdFromLocalFile(renamedFilePath);
            assert.equal(localWorkflowId, workflowId);
        });

        await runScenario('pushes a copied local workflow as a brand-new remote workflow with a rewritten id', async () => {
            const sourceWorkflowName = `${testRunPrefix} copy source`;
            const copiedWorkflowName = `${testRunPrefix} copy clone`;
            const sourceFilename = `a-${sourceWorkflowName}.workflow.ts`;
            const copiedFilename = `z-${copiedWorkflowName}.workflow.ts`;
            const sourceFilePath = writeLocalWorkflow(sourceFilename, sourceWorkflowName);

            const sourceWorkflowId = await syncManager.push(inputPathForPush(sourceFilePath));
            createdWorkflowIds.add(sourceWorkflowId);

            const copiedFilePath = copyLocalWorkflowFile(sourceFilePath, copiedFilename);
            renameWorkflowInLocalFile(copiedFilePath, sourceWorkflowName, copiedWorkflowName);

            await syncManager.refreshLocalState();
            assert.equal(syncManager.getWorkflowIdForFilename(sourceFilename), sourceWorkflowId);
            assert.equal(syncManager.getWorkflowIdForFilename(copiedFilename), undefined);

            const copiedWorkflowId = await syncManager.push(inputPathForPush(copiedFilePath));
            createdWorkflowIds.add(copiedWorkflowId);

            assert.notEqual(copiedWorkflowId, sourceWorkflowId);

            const copiedRemoteWorkflow = await fetchRemoteWorkflow(copiedWorkflowId);
            assert.equal(copiedRemoteWorkflow.name, copiedWorkflowName);

            const sourceRemoteWorkflow = await fetchRemoteWorkflow(sourceWorkflowId);
            assert.equal(sourceRemoteWorkflow.name, sourceWorkflowName);

            const rewrittenLocalId = extractWorkflowIdFromLocalFile(copiedFilePath);
            assert.equal(rewrittenLocalId, copiedWorkflowId);

            await syncManager.refreshLocalState();
            assert.equal(syncManager.getWorkflowIdForFilename(sourceFilename), sourceWorkflowId);
            assert.equal(syncManager.getWorkflowIdForFilename(copiedFilename), copiedWorkflowId);
        });

        await runScenario('fetches and pulls a remote-only workflow into the local sync directory', async () => {
            const workflowName = `${testRunPrefix} remote only`;
            const remoteWorkflow = await apiClient.createWorkflow(await buildRemoteWorkflowPayload(workflowName));
            createdWorkflowIds.add(remoteWorkflow.id);

            const remoteKnown = await syncManager.fetch(remoteWorkflow.id);
            assert.equal(remoteKnown, true);

            const filename = syncManager.getFilenameForId(remoteWorkflow.id);
            assert.ok(filename, 'Expected a filename after fetch.');

            await syncManager.pull(remoteWorkflow.id);

            const localPath = localFilePath(filename);
            assert.equal(fs.existsSync(localPath), true);
            assert.match(fs.readFileSync(localPath, 'utf-8'), new RegExp(workflowName));
        });

        await runScenario('pull preserves remote workflow tags in the local TypeScript file', async () => {
            const workflowName = `${testRunPrefix} tagged remote`;
            const tagName = `${testRunPrefix}-tag`;
            const remoteWorkflow = await apiClient.createWorkflow(await buildRemoteWorkflowPayload(workflowName));
            createdWorkflowIds.add(remoteWorkflow.id);

            let tag;
            try {
                tag = await apiClient.createTag(tagName);
            } catch (error) {
                if (error?.response?.status === 409) {
                    console.log(`[SKIP] tags API could not provision a unique tag on this instance (${error.response.data?.message || '409 Conflict'}).`);
                    return;
                }
                throw error;
            }

            createdTagIds.add(tag.id);

            const updatedTags = await apiClient.updateWorkflowTags(remoteWorkflow.id, [{ id: tag.id }]);
            assert.deepEqual(updatedTags.map((entry) => entry.name), [tagName]);

            const remoteWithTags = await fetchRemoteWorkflow(remoteWorkflow.id);
            assert.deepEqual((remoteWithTags.tags || []).map((entry) => entry.name), [tagName]);

            const remoteKnown = await syncManager.fetch(remoteWorkflow.id);
            assert.equal(remoteKnown, true);

            const filename = syncManager.getFilenameForId(remoteWorkflow.id);
            assert.ok(filename, 'Expected a filename after fetch.');

            await syncManager.pull(remoteWorkflow.id);

            const localPath = localFilePath(filename);
            const localContent = fs.readFileSync(localPath, 'utf-8');
            assert.match(
                localContent,
                new RegExp(`tags:\\s*\\[[^\\]]*"${escapeRegExp(tagName)}"[^\\]]*\\]`)
            );
        });

        await runScenario('detects a conflict and resolves it by keeping local', async () => {
            const initialName = `${testRunPrefix} keep local base`;
            const remoteName = `${testRunPrefix} keep local remote`;
            const localName = `${testRunPrefix} keep local final`;
            const filename = `${initialName}.workflow.ts`;
            const filePath = writeLocalWorkflow(filename, initialName);

            const workflowId = await syncManager.push(inputPathForPush(filePath));
            createdWorkflowIds.add(workflowId);

            const remoteWorkflow = await fetchRemoteWorkflow(workflowId);
            await apiClient.updateWorkflow(workflowId, buildRemoteUpdatePayload(remoteWorkflow, remoteName));

            renameWorkflowInLocalFile(filePath, initialName, localName);

            await syncManager.refreshLocalState();
            await syncManager.fetch(workflowId);
            const status = await syncManager.getSingleWorkflowDetailedStatus(workflowId, filename);
            assert.equal(status.status, WorkflowSyncStatus.CONFLICT);

            await syncManager.resolveConflict(workflowId, filename, 'local');

            const resolvedRemote = await fetchRemoteWorkflow(workflowId);
            assert.equal(resolvedRemote.name, localName);

            await syncManager.refreshLocalState();
            await syncManager.fetch(workflowId);
            const resolvedStatus = await syncManager.getSingleWorkflowDetailedStatus(workflowId, filename);
            assert.equal(resolvedStatus.status, WorkflowSyncStatus.TRACKED);
        });

        await runScenario('detects a conflict and resolves it by keeping remote', async () => {
            const initialName = `${testRunPrefix} keep remote base`;
            const remoteName = `${testRunPrefix} keep remote final`;
            const localName = `${testRunPrefix} keep remote local`;
            const filename = `${initialName}.workflow.ts`;
            const filePath = writeLocalWorkflow(filename, initialName);

            const workflowId = await syncManager.push(inputPathForPush(filePath));
            createdWorkflowIds.add(workflowId);

            const remoteWorkflow = await fetchRemoteWorkflow(workflowId);
            await apiClient.updateWorkflow(workflowId, buildRemoteUpdatePayload(remoteWorkflow, remoteName));

            renameWorkflowInLocalFile(filePath, initialName, localName);

            await syncManager.refreshLocalState();
            await syncManager.fetch(workflowId);
            const status = await syncManager.getSingleWorkflowDetailedStatus(workflowId, filename);
            assert.equal(status.status, WorkflowSyncStatus.CONFLICT);

            await syncManager.resolveConflict(workflowId, filename, 'remote');

            const localContent = fs.readFileSync(filePath, 'utf-8');
            assert.match(localContent, new RegExp(remoteName));

            await syncManager.refreshLocalState();
            await syncManager.fetch(workflowId);
            const resolvedStatus = await syncManager.getSingleWorkflowDetailedStatus(workflowId, filename);
            assert.equal(resolvedStatus.status, WorkflowSyncStatus.TRACKED);
        });

        await runScenario('recreates a deleted remote workflow from the local file on the next push', async () => {
            const workflowName = `${testRunPrefix} recreate`;
            const filename = `${workflowName}.workflow.ts`;
            const filePath = writeLocalWorkflow(filename, workflowName);

            const initialWorkflowId = await syncManager.push(inputPathForPush(filePath));
            createdWorkflowIds.add(initialWorkflowId);

            await apiClient.deleteWorkflow(initialWorkflowId);
            createdWorkflowIds.delete(initialWorkflowId);

            const recreatedWorkflowId = await syncManager.push(inputPathForPush(filePath));
            createdWorkflowIds.add(recreatedWorkflowId);

            const remoteWorkflow = await fetchRemoteWorkflow(recreatedWorkflowId);
            assert.equal(remoteWorkflow.name, workflowName);

            await syncManager.refreshLocalState();
            assert.equal(syncManager.getWorkflowIdForFilename(filename), recreatedWorkflowId);
        });

        await runScenario('deletes a remote workflow explicitly through the sync manager', async () => {
            const workflowName = `${testRunPrefix} delete remote`;
            const filename = `${workflowName}.workflow.ts`;
            const filePath = writeLocalWorkflow(filename, workflowName);

            const workflowId = await syncManager.push(inputPathForPush(filePath));
            createdWorkflowIds.add(workflowId);

            const deleted = await syncManager.deleteRemoteWorkflow(workflowId, filename);
            assert.equal(deleted, true);
            createdWorkflowIds.delete(workflowId);

            const remoteWorkflow = await apiClient.getWorkflow(workflowId);
            assert.equal(remoteWorkflow, null);
        });
    } finally {
        for (const workflowId of createdWorkflowIds) {
            try {
                await apiClient.deleteWorkflow(workflowId);
            } catch {
                // Ignore cleanup failures for already-deleted workflows.
            }
        }

        for (const tagId of createdTagIds) {
            try {
                await apiClient.deleteTag(tagId);
            } catch {
                // Ignore cleanup failures for already-deleted tags.
            }
        }

        fs.rmSync(tempRoot, { recursive: true, force: true });
    }

    if (scenarioFailures.length > 0) {
        console.error('\nLive integration failures:');
        for (const failure of scenarioFailures) {
            console.error(`\n[${failure.name}]`);
            console.error(failure.message);
        }
        process.exit(1);
    }

    console.log('\nAll live CLI integration scenarios passed.');
}

main().catch((error) => {
    console.error('Live integration runner failed.');
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
});
