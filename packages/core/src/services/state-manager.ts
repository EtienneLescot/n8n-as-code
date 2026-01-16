import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import stringify from 'json-stable-stringify';
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
                const data = JSON.parse(fs.readFileSync(this.stateFilePath, 'utf-8'));
                // Ensure workflows object exists
                if (!data.workflows) {
                    data.workflows = {};
                }
                return data;
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
     * Computes a stable, canonical hash for any object (usually a workflow).
     * Non-functional metadata should be removed before calling this.
     */
    static computeHash(content: any): string {
        const canonicalString = stringify(content) || '';
        return crypto.createHash('sha256').update(canonicalString).digest('hex');
    }

    /**
     * Gets the last known state (Base) for a workflow.
     */
    getWorkflowState(id: string): IWorkflowState | undefined {
        const state = this.load();
        return state.workflows[id];
    }

    /**
     * Updates the last known state (Base) for a workflow.
     * This is the "Commit" operation.
     */
    updateWorkflowState(id: string, hash: string) {
        const state = this.load();
        state.workflows[id] = {
            lastSyncedHash: hash,
            lastSyncedAt: new Date().toISOString()
        };
        this.save(state);
    }

    /**
     * Removes a workflow from state.
     */
    removeWorkflowState(id: string) {
        const state = this.load();
        delete state.workflows[id];
        this.save(state);
    }

    /**
     * Gets all tracked workflow IDs.
     */
    getTrackedWorkflowIds(): string[] {
        const state = this.load();
        return Object.keys(state.workflows);
    }

    /**
     * Checks if a hash matches the last synced state.
     */
    isSynced(id: string, currentHash: string): boolean {
        const state = this.getWorkflowState(id);
        if (!state) return false;
        return state.lastSyncedHash === currentHash;
    }
}
