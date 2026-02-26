/**
 * CliApi — Internal CLI command facade
 *
 * Provides a named API surface that mirrors exactly the CLI commands:
 *   n8nac list               → CliApi.list()
 *   n8nac fetch --workflowsid → CliApi.fetch()
 *   n8nac pull  --workflowsid → CliApi.pull()
 *   n8nac push  --workflowsid → CliApi.push()
 *
 * This is the single contract that must be used by all VSCode extension
 * command handlers. It ensures there is zero code duplication between the
 * CLI binary and the extension: both go through the same `SyncManager` layer.
 *
 * Note: we do NOT shell-out to the `n8nac` binary because the extension
 * needs a persistent process to maintain the Watcher, file-change events,
 * conflict detection, and connection-lost monitoring.
 */

import { SyncManager } from './sync-manager.js';
import { IWorkflowStatus, WorkflowSyncStatus } from '../types.js';

export class CliApi {
    private syncManager: SyncManager;

    constructor(syncManager: SyncManager) {
        this.syncManager = syncManager;
    }

    // ── list ─────────────────────────────────────────────────────────────────

    /**
     * Mirrors `n8nac list`
     *
     * Returns a lightweight list of all workflows with basic status:
     * EXIST_ONLY_LOCALLY | EXIST_ONLY_REMOTELY | TRACKED | MODIFIED_LOCALLY | CONFLICT
     *
     * Pass `{ fetchRemote: true }` to force a fresh remote metadata fetch
     * (equivalent to running `n8nac list` which always fetches remote).
     *
     * No TypeScript compilation or full diff is performed — this is O(N).
     */
    async list(options?: { fetchRemote?: boolean }): Promise<IWorkflowStatus[]> {
        return this.syncManager.listWorkflows(options);
    }

    // ── fetch ─────────────────────────────────────────────────────────────────

    /**
     * Mirrors `n8nac fetch --workflowsid <id>`
     *
     * Updates the internal remote-state cache for one specific workflow.
     * Returns true if the workflow exists on remote, false if not found.
     *
     * This is a lightweight operation: it fetches only the single workflow
     * and updates the cache entry — no full listing is performed.
     */
    async fetch(workflowId: string): Promise<boolean> {
        return this.syncManager.fetch(workflowId);
    }

    // ── pull ──────────────────────────────────────────────────────────────────

    /**
     * Mirrors `n8nac pull --workflowsid <id>`
     *
     * Downloads the latest remote version of one workflow and overwrites
     * the local `.workflow.ts` file regardless of local status.
     *
     * Throws if the workflow is not found in local state (run `fetch` first
     * if it only exists remotely).
     */
    async pull(workflowId: string): Promise<void> {
        return this.syncManager.pull(workflowId);
    }

    // ── push ──────────────────────────────────────────────────────────────────

    /**
     * Mirrors `n8nac push --workflowsid <id>`
     *
     * Uploads the local `.workflow.ts` file to n8n.
     * Performs an Optimistic Concurrency Check (OCC) — throws OccConflictError
     * if the remote was modified since the last sync.
     */
    async push(workflowId: string): Promise<void> {
        return this.syncManager.push(workflowId);
    }

    // ── conflict resolution (extension-only, no CLI equivalent) ──────────────

    /**
     * Resolve a detected conflict.
     * 'local'  → force-push local file, overwrite remote.
     * 'remote' → force-pull remote file, overwrite local.
     */
    async resolveConflict(
        workflowId: string,
        filename: string,
        resolution: 'local' | 'remote'
    ): Promise<void> {
        return this.syncManager.resolveConflict(workflowId, filename, resolution);
    }

    /**
     * Get detailed three-way status for a single workflow.
     * Used before pull to check for local modifications.
     */
    async getSingleWorkflowDetailedStatus(workflowId: string, filename: string) {
        return this.syncManager.getSingleWorkflowDetailedStatus(workflowId, filename);
    }
}
