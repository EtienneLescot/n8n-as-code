import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { IWorkflow } from '../types.js';
import { WorkflowSanitizer } from './workflow-sanitizer.js';

export interface IWorkflowState {
    lastSyncedHash: string;
    lastSyncedAt: string;
}

export interface IInstanceState {
    workflows: Record<string, IWorkflowState>;
}

export class StateManager {
    private stateFilePath: string;

    constructor(directory: string) {
        this.stateFilePath = path.join(directory, '.n8n-state.json');
    }

    private load(): IInstanceState {
        if (fs.existsSync(this.stateFilePath)) {
            try {
                return JSON.parse(fs.readFileSync(this.stateFilePath, 'utf-8'));
            } catch (e) {
                console.warn('Could not read state file, using empty state');
            }
        }
        return { workflows: {} };
    }

    private save(state: IInstanceState) {
        fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2));
    }

    /**
     * Computes a stable hash for a workflow object.
     */
    static computeHash(workflow: any): string {
        // We use the cleaned version to ensure stable hashing (no dynamic IDs or timestamps)
        const content = typeof workflow === 'string' ? workflow : JSON.stringify(workflow);
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Gets the last known state for a workflow.
     */
    getWorkflowState(id: string): IWorkflowState | undefined {
        const state = this.load();
        return state.workflows[id];
    }

    /**
     * Updates the last known state for a workflow.
     */
    updateWorkflowState(id: string, workflow: any) {
        const state = this.load();
        const hash = StateManager.computeHash(workflow);
        state.workflows[id] = {
            lastSyncedHash: hash,
            lastSyncedAt: new Date().toISOString()
        };
        this.save(state);
    }

    /**
     * Checks if a local content matches the last synced state.
     */
    isLocalSynced(id: string, localContent: any): boolean {
        const state = this.getWorkflowState(id);
        if (!state) return true; // If no state, we assume it's new
        const currentHash = StateManager.computeHash(localContent);
        return state.lastSyncedHash === currentHash;
    }

    /**
     * Checks if a remote workflow matches the last synced state.
     */
    isRemoteSynced(id: string, remoteWorkflow: any): boolean {
        const state = this.getWorkflowState(id);
        if (!state) return true;
        const remoteHash = StateManager.computeHash(remoteWorkflow);
        return state.lastSyncedHash === remoteHash;
    }
}
