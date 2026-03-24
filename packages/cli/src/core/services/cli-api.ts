/**
 * CliApi — Internal CLI command facade
 *
 * Provides a named API surface that mirrors exactly the CLI commands:
 *   n8nac list               → CliApi.list()
 *   n8nac fetch <id>       → CliApi.fetch()
 *   n8nac pull <id>        → CliApi.pull()
 *   n8nac push <path>      → CliApi.push()
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
import { IWorkflowStatus, WorkflowSyncStatus, ITestPlan, ITestResult } from '../types.js';

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
     * EXIST_ONLY_LOCALLY | EXIST_ONLY_REMOTELY | TRACKED | CONFLICT
     * (CONFLICT is only returned by getSingleWorkflowDetailedStatus, not by list)
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
     * Mirrors `n8nac fetch <id>`
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
     * Mirrors `n8nac pull <id>`
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
    * Mirrors `n8nac push <path>`
     *
     * Uploads the local `.workflow.ts` file to n8n.
     * Automatically handles three cases:
     *  • New local file (no ID)              → creates the workflow on remote
     *  • Local-only with ID (remote deleted) → re-creates on remote
     *  • Both sides exist                    → updates remote (with OCC check)
     *
    * @param filename - Workflow path or basename inside the active sync scope
     */
    async push(filename: string): Promise<string> {
        return this.syncManager.push(filename);
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
        resolution: 'keep-current' | 'keep-incoming'
    ): Promise<void> {
        const mode = resolution === 'keep-current' ? 'local' : 'remote';
        return this.syncManager.resolveConflict(workflowId, filename, mode);
    }

    /**
     * Get detailed three-way status for a single workflow.
     * Used before pull to check for local modifications.
     */
    async getSingleWorkflowDetailedStatus(workflowId: string, filename: string) {
        return this.syncManager.getSingleWorkflowDetailedStatus(workflowId, filename);
    }

    // ── test ──────────────────────────────────────────────────────────────────

    /**
     * Mirrors `n8nac test <workflowId>`
     *
     * Detects the workflow's trigger type, builds the appropriate test-mode
     * URL, and fires an HTTP request against it.
     *
     * Returns an ITestResult classifying the outcome:
     *   • success                 → workflow ran and returned a 2xx response
     *   • errorClass: config-gap  → missing credentials/model/env-vars (Class A)
     *                               Inform the user — do NOT iterate.
     *   • errorClass: wiring-error → bad expression, wrong field (Class B)
     *                               Agent should fix and re-test.
     *   • errorClass: null        → not an HTTP-triggerable workflow (schedule etc.)
     */
    async testWorkflow(
        workflowId: string,
        options?: { data?: unknown; prod?: boolean }
    ): Promise<ITestResult> {
        return this.syncManager.getApiClient().testWorkflow(workflowId, options);
    }

    async getTestPlan(workflowId: string): Promise<ITestPlan> {
        return this.syncManager.getApiClient().getTestPlan(workflowId);
    }
}
