import fs from 'fs';
import path from 'path';
import { IWorkflow } from '../types.js';

export interface IWorkflowState {
    lastSyncedHash: string;
    lastSyncedAt: string;
}

export interface IInstanceState {
    workflows: Record<string, IWorkflowState>;
}

/**
 * Read-only State Manager
 * 
 * Responsibilities:
 * 1. Read state from .n8n-state.json
 * 2. Provide read-only access to workflow states
 * 
 * Note: Write operations are handled exclusively by Watcher component
 * to maintain single source of truth for state mutations.
 */
export class StateManager {
    private stateFilePath: string;

    constructor(directory: string) {
        this.stateFilePath = path.join(directory, '.n8n-state.json');
    }

    /**
     * Load state from disk (private method)
     */
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

    /**
     * Gets the last known state (Base) for a workflow.
     */
    getWorkflowState(id: string): IWorkflowState | undefined {
        const state = this.load();
        return state.workflows[id];
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

    /**
     * Get the entire state object (for Watcher's internal use)
     * @internal
     */
    getFullState(): IInstanceState {
        return this.load();
    }
}
