import fs from 'fs';
import path from 'path';
import { N8nApiClient } from './n8n-api-client.js';
import { StateManager } from './state-manager.js';
import { WorkflowSanitizer } from './workflow-sanitizer.js';
import { Watcher } from './watcher.js';
import { WorkflowSyncStatus, IWorkflow } from '../types.js';

export class SyncEngine {
    private client: N8nApiClient;
    private stateManager: StateManager;
    private watcher: Watcher;
    private directory: string;
    private archiveDirectory: string;

    constructor(
        client: N8nApiClient,
        stateManager: StateManager,
        watcher: Watcher,
        directory: string
    ) {
        this.client = client;
        this.stateManager = stateManager;
        this.watcher = watcher;
        this.directory = directory;
        this.archiveDirectory = path.join(directory, '_archive');

        if (!fs.existsSync(this.archiveDirectory)) {
            fs.mkdirSync(this.archiveDirectory, { recursive: true });
        }
    }

    /**
     * PULL Strategy: Remote -> Local
     */
    public async pull(workflowId: string, filename: string, status: WorkflowSyncStatus): Promise<void> {
        this.watcher.pause(workflowId);
        try {
            switch (status) {
                case WorkflowSyncStatus.EXIST_ONLY_REMOTELY:
                case WorkflowSyncStatus.MODIFIED_REMOTELY:
                case WorkflowSyncStatus.IN_SYNC: // Force pull
                case WorkflowSyncStatus.CONFLICT: // Force pull
                    await this.executePull(workflowId, filename);
                    break;
                default:
                    // No action needed for other statuses in standard PULL
                    break;
            }
        } finally {
            this.watcher.resume(workflowId);
        }
    }

    /**
     * PUSH Strategy: Local -> Remote
     */
    public async push(filename: string, workflowId?: string, status?: WorkflowSyncStatus): Promise<string> {
        if (workflowId) this.watcher.pause(workflowId);
        try {
            if (!workflowId || status === WorkflowSyncStatus.EXIST_ONLY_LOCALLY) {
                // Creation flow
                return await this.executeCreate(filename);
            }

            switch (status) {
                case WorkflowSyncStatus.MODIFIED_LOCALLY:
                case WorkflowSyncStatus.IN_SYNC: // Force push
                case WorkflowSyncStatus.CONFLICT: // Force push
                    await this.executeUpdate(workflowId, filename);
                    return workflowId;
                default:
                    return workflowId;
            }
        } finally {
            if (workflowId) this.watcher.resume(workflowId);
        }
    }

    /**
     * Commit workflow (finalizeSync)
     * Updates the base state (lastSyncedHash) to match current reality.
     */
    public async commit(workflowId: string, filename: string) {
        const filePath = path.join(this.directory, filename);
        const remotewf = await this.client.getWorkflow(workflowId);
        const localwf = this.readJsonFile(filePath);

        if (!remotewf || !localwf) {
            throw new Error(`Cannot commit state: ${!remotewf ? 'Remote' : 'Local'} workflow missing.`);
        }

        const cleanRemote = WorkflowSanitizer.cleanForStorage(remotewf);
        const cleanLocal = WorkflowSanitizer.cleanForStorage(localwf);

        // Standardize IDs for comparison (Remote ID is the source of truth)
        // @ts-ignore
        cleanRemote.id = workflowId;
        // @ts-ignore
        cleanLocal.id = workflowId;

        const remoteHash = StateManager.computeHash(cleanRemote);
        const localHash = StateManager.computeHash(cleanLocal);

        if (remoteHash !== localHash) {
            throw new Error('Cannot commit state: Local and Remote content differ.');
        }

        this.stateManager.updateWorkflowState(workflowId, remoteHash);
    }

    private async executePull(workflowId: string, filename: string) {
        const fullWf = await this.client.getWorkflow(workflowId);
        if (!fullWf) throw new Error('Remote workflow not found during pull');

        const clean = WorkflowSanitizer.cleanForStorage(fullWf);
        const filePath = path.join(this.directory, filename);

        fs.writeFileSync(filePath, JSON.stringify(clean, null, 2));
        await this.commit(workflowId, filename);
    }

    private async executeUpdate(workflowId: string, filename: string) {
        const filePath = path.join(this.directory, filename);
        const localWf = this.readJsonFile(filePath);
        if (!localWf) throw new Error('Local file not found during push');

        const payload = WorkflowSanitizer.cleanForPush(localWf);
        const updatedWf = await this.client.updateWorkflow(workflowId, payload);

        if (!updatedWf) throw new Error('Failed to update remote workflow');

        await this.commit(workflowId, filename);
    }

    private async executeCreate(filename: string): Promise<string> {
        const filePath = path.join(this.directory, filename);
        const localWf = this.readJsonFile(filePath);
        if (!localWf) throw new Error('Local file not found during creation');

        const payload = WorkflowSanitizer.cleanForPush(localWf);
        if (!payload.name) payload.name = path.parse(filename).name;

        const newWf = await this.client.createWorkflow(payload);
        if (!newWf || !newWf.id) throw new Error('Failed to create remote workflow');

        // Update local file with new ID
        localWf.id = newWf.id;
        fs.writeFileSync(filePath, JSON.stringify(localWf, null, 2));

        await this.commit(newWf.id, filename);
        return newWf.id;
    }

    public async archive(filename: string) {
        const filePath = path.join(this.directory, filename);
        if (fs.existsSync(filePath)) {
            const archivePath = path.join(this.archiveDirectory, `${Date.now()}_${filename}`);
            fs.renameSync(filePath, archivePath);
        }
    }

    private readJsonFile(filePath: string): any {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {
            return null;
        }
    }
}
