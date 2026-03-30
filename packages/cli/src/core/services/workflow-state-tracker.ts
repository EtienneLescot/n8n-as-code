import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import { N8nApiClient } from './n8n-api-client.js';
import { WorkflowTransformerAdapter } from './workflow-transformer-adapter.js';
import { HashUtils } from './hash-utils.js';
import { WorkflowSyncStatus, IWorkflowStatus, IWorkflow } from '../types.js';
import { IWorkflowState, IInstanceState } from './state-manager.js';

const WINDOWS_RESERVED_FILENAMES = new Set([
    'CON',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'COM2',
    'COM3',
    'COM4',
    'COM5',
    'COM6',
    'COM7',
    'COM8',
    'COM9',
    'LPT1',
    'LPT2',
    'LPT3',
    'LPT4',
    'LPT5',
    'LPT6',
    'LPT7',
    'LPT8',
    'LPT9'
]);

/**
 * Watcher - State Observation Component
 * 
 * Responsibilities:
 * 1. File System Watch with debounce
 * 2. Remote Fetching with lightweight caching strategy
 * 3. Canonical Hashing (SHA-256 of sorted JSON)
 * 4. Status Matrix Calculation (3-way comparison)
 * 5. State Persistence (only component that writes to .n8n-state.json)
 * 
 * Never performs synchronization actions - only observes reality.
 */
export class WorkflowStateTracker extends EventEmitter {
    private client: N8nApiClient;
    private directory: string;
    private syncInactive: boolean;
    private ignoredTags: string[];
    private projectId: string;
    private stateFilePath: string;
    private isConnected: boolean = true;
    /** True during the first refreshRemoteState() call — suppresses status broadcasts */
    private isInitialRemoteLoad: boolean = false;

    // Internal state tracking
    private localHashes: Map<string, string> = new Map(); // filename -> hash
    private remoteHashes: Map<string, string> = new Map(); // workflowId -> hash
    private fileToIdMap: Map<string, string> = new Map(); // filename -> workflowId
    private idToFileMap: Map<string, string> = new Map(); // workflowId -> filename
    private lastKnownStatuses: Map<string, WorkflowSyncStatus> = new Map(); // workflowId or filename -> status
    private remoteIds: Set<string> = new Set(); // workflowId

    // Lightweight remote state cache
    private remoteTimestamps: Map<string, string> = new Map(); // workflowId -> updatedAt
    /** Canonical display name for each remote workflow (id is the unique key, NOT the name). */
    private remoteNames: Map<string, string> = new Map(); // workflowId -> name

    constructor(
        client: N8nApiClient,
        options: {
            directory: string;
            syncInactive: boolean;
            ignoredTags: string[];
            projectId: string;      // Project scope filter
        }
    ) {
        super();
        this.client = client;
        this.directory = options.directory;
        this.syncInactive = options.syncInactive;
        this.ignoredTags = options.ignoredTags;
        this.projectId = options.projectId;
        this.stateFilePath = path.join(this.directory, '.n8n-state.json');

        // Restore persisted mappings immediately so 'pull' and other commands can find workflows
        this.restoreMappingsFromState();
    }

    public getDirectory(): string {
        return this.directory;
    }

    public getFilenameForId(id: string): string | undefined {
        return this.idToFileMap.get(id);
    }

    public getWorkflowIdForFilename(filename: string): string | undefined {
        return this.fileToIdMap.get(filename);
    }

    public async refreshLocalState() {
        if (!fs.existsSync(this.directory)) {
            console.log(`[DEBUG] refreshLocalState: Directory missing: ${this.directory}`);
            // Clear all local hashes since directory doesn't exist
            this.localHashes.clear();
            return;
        }

        const files = fs.readdirSync(this.directory).filter(f => f.endsWith('.workflow.ts') && !f.startsWith('.'));
        const currentFiles = new Set(files);

        // Remove entries for files that no longer exist
        for (const filename of this.localHashes.keys()) {
            if (!currentFiles.has(filename)) {
                this.localHashes.delete(filename);
                const workflowId = this.fileToIdMap.get(filename);
                if (workflowId) {
                    // Broadcast status change for deleted file
                    this.broadcastStatus(filename, workflowId);
                }
            }
        }

        // First pass: collect all files and their content
        const fileContents: Array<{ filename: string; content: any }> = [];
        const newlyTracked: string[] = [];
        for (const filename of files) {
            const filePath = path.join(this.directory, filename);
            const content = this.readJsonFile(filePath); // Quick ID extraction
            if (content) {
                fileContents.push({ filename, content });

                // Compute hash from TypeScript file directly
                const tsContent = fs.readFileSync(filePath, 'utf-8');
                try {
                    const isNew = !this.localHashes.has(filename);
                    const hash = await WorkflowTransformerAdapter.hashWorkflow(tsContent);
                    this.localHashes.set(filename, hash);
                    if (isNew) newlyTracked.push(filename);
                } catch (parseErr: any) {
                    console.error(
                        `[WorkflowStateTracker] ❌ Cannot parse "${filename}" during local scan – skipping.\n` +
                        `  Cause: ${parseErr.message}\n` +
                        `  Tip: Make sure the class name contains only valid ASCII/identifier characters ` +
                        `(→ U+2192 and similar symbols are not allowed in TypeScript identifiers).`
                    );
                    // Do NOT add to localHashes so this file stays invisible to sync operations
                }
            }
        }

        // Second pass: build file→ID mappings from actual file content (scan-wins).
        //
        // For IDs that exist on disk, the scan result is authoritative — this correctly
        // handles renames (new filename contains the same @workflow({ id: "..." }) decorator).
        // Mappings for remote-only workflows (set by fetch/updateSingleRemoteState and not
        // present in local files) are left untouched.
        //
        // Duplicate ID handling (copy-paste, option A — no file modification):
        //   Sort claimants alphabetically → first file wins, others get no mapping
        //   → treated as EXIST_ONLY_LOCALLY, resolved by pushing (gets a new id)

        const idClaims = new Map<string, string[]>();
        for (const { filename, content } of fileContents) {
            if (content?.id) {
                if (!idClaims.has(content.id)) idClaims.set(content.id, []);
                idClaims.get(content.id)!.push(filename);
            }
        }

        for (const [id, claimants] of idClaims) {
            // Remove the stale filename entry for this ID before setting the scan result
            const staleFilename = this.idToFileMap.get(id);
            if (staleFilename) {
                this.fileToIdMap.delete(staleFilename);
            }

            const sorted = [...claimants].sort();
            const winner = sorted[0];
            if (sorted.length > 1) {
                console.warn(
                    `[WorkflowStateTracker] ⚠️  Duplicate ID "${id}" in [${sorted.join(', ')}]` +
                    ` → "${winner}" wins (alphabetical). Others treated as new workflows.`
                );
            }
            this.fileToIdMap.set(winner, id);
            this.idToFileMap.set(id, winner);
        }

        // Recovery path: if a tracked file lost its decorator ID after a manual rewrite,
        // reconnect it using the last known filename hint from state.
        const claimedIds = new Set(idClaims.keys());
        const state = this.loadState();
        for (const { filename, content } of fileContents) {
            if (content?.id) continue;
            if (this.fileToIdMap.has(filename)) continue;

            const matchingIds = Object.entries(state.workflows)
                .filter(([workflowId, workflowState]) =>
                    workflowState?.filename === filename &&
                    !claimedIds.has(workflowId))
                .map(([workflowId]) => workflowId);

            if (matchingIds.length !== 1) continue;

            const recoveredId = matchingIds[0];
            const existingFilename = this.idToFileMap.get(recoveredId);
            if (existingFilename && existingFilename !== filename && currentFiles.has(existingFilename)) {
                continue;
            }

            this.idToFileMap.set(recoveredId, filename);
            this.fileToIdMap.set(filename, recoveredId);
        }

        // Clean up fileToIdMap entries for files that no longer exist on disk.
        // (idToFileMap for deleted-locally workflows is intentionally kept for EXIST_ONLY_REMOTELY.)
        for (const existingFilename of Array.from(this.fileToIdMap.keys())) {
            if (!currentFiles.has(existingFilename)) {
                this.fileToIdMap.delete(existingFilename);
            }
        }

        // Broadcast status for newly-tracked files (includes ID-less local-only files)
        // so that EXIST_ONLY_LOCALLY events are emitted for files that were already on
        // disk when the watcher started.
        for (const filename of newlyTracked) {
            const workflowId = this.fileToIdMap.get(filename);
            this.broadcastStatus(filename, workflowId);
        }
    }



    /**
     * Lightweight fetch strategy:
     * 1. Fetch only IDs and updatedAt timestamps
     * 2. Compare with cached timestamps
     * 3. Fetch full content only if timestamp changed
     *
     * Status events are suppressed during the first call (initial remote load) to avoid
     * spurious "Change detected" messages in the VSCode extension and CLI output.
     */
    public async refreshRemoteState() {
        // Suppress broadcasts during the very first remote load (populating cache from scratch).
        // Subsequent calls (user-triggered fetch/refresh) will still broadcast normally.
        const isFirstLoad = this.remoteIds.size === 0;
        if (isFirstLoad) this.isInitialRemoteLoad = true;

        try {
            const remoteWorkflows = await this.client.getAllWorkflows(this.projectId);
            this.isConnected = true;

            // Update remoteIds and names (ID is the unique key; name is for display only)
            this.remoteIds.clear();
            this.remoteNames.clear();

            // Build set of already-assigned filenames to prevent collisions
            const assignedFilenames = new Set<string>();

            for (const wf of remoteWorkflows) {
                if (this.shouldIgnore(wf)) continue;

                this.remoteIds.add(wf.id);
                // Store canonical name keyed by ID (names are NOT unique in n8n)
                if (wf.name) this.remoteNames.set(wf.id, wf.name);

                // CRITICAL: Use ID-based mapping with PERSISTED state as source of truth
                let filename: string | undefined = this.idToFileMap.get(wf.id);

                // If no valid mapping, scan local files to discover/rediscover the workflow
                if (!filename) {
                    filename = this.findFilenameByWorkflowId(wf.id);
                }

                // Reserve this filename BEFORE checking for newworkflows
                if (filename) {
                    assignedFilenames.add(filename);
                }

                // If still not found, this is a NEW remote workflow - generate filename
                if (!filename) {
                    const baseName = `${this.safeName(wf.name)}.workflow.ts`;

                    // Check if this base name is already assigned to another workflow
                    if (assignedFilenames.has(baseName)) {
                        // Name collision - generate unique filename with ID suffix
                        const idSuffix = wf.id.substring(0, 8);
                        filename = `${this.safeName(wf.name)}_${idSuffix}.workflow.ts`;
                    } else {
                        // Name is free - use it
                        filename = baseName;
                    }

                    // Mark this filename as assigned
                    assignedFilenames.add(filename);
                }

                // Update mappings ONLY if this is a new workflow or filename hasn't changed
                const previousFilename = this.idToFileMap.get(wf.id);

                if (!previousFilename) {
                    // New workflow - establish mapping
                    this.idToFileMap.set(wf.id, filename);
                    this.fileToIdMap.set(filename, wf.id);

                    // No longer persist filename to state (mappings are rebuilt from file scan).
                } else if (previousFilename !== filename) {
                    // Filename changed
                    this.fileToIdMap.delete(previousFilename);
                    this.idToFileMap.set(wf.id, filename);
                    this.fileToIdMap.set(filename, wf.id);
                }

                // In lightweight mode, we don't fetch full content or compute hashes here.
                // We just broadcast that the workflow exists remotely.
                this.broadcastStatus(filename, wf.id);
            }

            // Prune remoteHashes and timestamps for deleted workflows
            for (const id of Array.from(this.remoteHashes.keys())) {
                if (!this.remoteIds.has(id)) {
                    this.remoteHashes.delete(id);
                    this.remoteTimestamps.delete(id);

                    // Clear lastSyncedHash from state
                    const state = this.loadState();
                    if (state.workflows[id]) {
                        (state.workflows[id] as IWorkflowState).lastSyncedHash = undefined as any;
                        this.saveState(state);
                    }

                    const filename = this.idToFileMap.get(id);
                    if (filename) this.broadcastStatus(filename, id);
                }
            }
        } catch (error: any) {
            // Check if it's a connection error
            const isConnectionError = error.code === 'ECONNREFUSED' ||
                error.code === 'ENOTFOUND' ||
                error.code === 'ETIMEDOUT' ||
                error.message?.includes('fetch failed') ||
                error.message?.includes('ECONNREFUSED') ||
                error.message?.includes('ENOTFOUND') ||
                error.cause?.code === 'ECONNREFUSED';

            if (isConnectionError) {
                this.isConnected = false;
                // Emit a specific connection error
                this.emit('connection-lost', new Error('Lost connection to n8n instance. Please check if n8n is running.'));
            } else {
                // For other errors, just emit the error
                this.emit('error', error);
            }
            // Re-throw so that start() can catch it on initial call
            throw error;
        } finally {
            // Always clear the initial load flag
            this.isInitialRemoteLoad = false;
        }
    }

    /**
     * Finalize sync - update base state after successful sync operation
     * Called by SyncEngine after PULL/PUSH completes
     */
    public async finalizeSync(workflowId: string, remoteUpdatedAt?: string): Promise<void> {
        let filename = this.idToFileMap.get(workflowId);

        // If workflow not tracked yet (first sync of local-only workflow),
        // scan directory to find the file with this ID
        if (!filename) {
            const files = fs.readdirSync(this.directory).filter(f => f.endsWith('.workflow.ts') && !f.startsWith('.'));
            for (const file of files) {
                const filePath = path.join(this.directory, file);
                const content = this.readJsonFile(filePath);
                if (content?.id === workflowId) {
                    filename = file;
                    // Initialize tracking for this workflow
                    this.fileToIdMap.set(filename, workflowId);
                    this.idToFileMap.set(workflowId, filename);
                    break;
                }
            }

            if (!filename) {
                throw new Error(`Cannot finalize sync: workflow ${workflowId} not found in directory`);
            }
        }

        // Get current reality
        const filePath = path.join(this.directory, filename);
        const content = this.readJsonFile(filePath);

        if (!content) {
            throw new Error(`Cannot finalize sync: local file not found for ${workflowId}`);
        }

        const tsContent = fs.readFileSync(filePath, 'utf-8');
        const computedHash = await WorkflowTransformerAdapter.hashWorkflow(tsContent);

        // After a successful sync, local and remote should be identical
        // Use the computed hash for both
        const localHash = computedHash;
        const remoteHash = computedHash;

        // Update caches
        this.localHashes.set(filename, localHash);
        this.remoteHashes.set(workflowId, remoteHash);

        // Update base state
        await this.updateWorkflowState(workflowId, localHash, remoteUpdatedAt, filename);

        // Broadcast new TRACKED status
        this.broadcastStatus(filename, workflowId);
    }

    /**
     * Update workflow state in .n8n-state.json
     * Only this component writes to the state file
     */
    private async updateWorkflowState(id: string, hash: string, remoteUpdatedAt?: string, filename?: string) {
        const state = this.loadState();
        state.workflows[id] = {
            lastSyncedHash: hash,
            lastSyncedAt: remoteUpdatedAt || new Date().toISOString(),
            filename: filename || state.workflows[id]?.filename,
        };
        this.saveState(state);
    }

    /**
     * Remove workflow from state file
     * Called after deletion confirmation
     */
    public async removeWorkflowState(id: string) {
        const state = this.loadState();
        delete state.workflows[id];
        this.saveState(state);

        // Clean up internal tracking
        const filename = this.idToFileMap.get(id);
        if (filename) {
            this.fileToIdMap.delete(filename);
        }
        this.idToFileMap.delete(id);
        this.remoteHashes.delete(id);
        this.remoteTimestamps.delete(id);
        this.remoteNames.delete(id);
        this.remoteIds.delete(id);
    }

    /**
     * Load state from .n8n-state.json
     * Does NOT restore mappings - use restoreMappingsFromState() for that
     */
    private loadState(): IInstanceState {
        if (fs.existsSync(this.stateFilePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.stateFilePath, 'utf-8'));
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

    private restoreMappingsFromState() {
        const state = this.loadState();

        for (const [workflowId, workflowState] of Object.entries(state.workflows)) {
            const filename = workflowState?.filename;
            if (!filename) continue;

            const filePath = path.join(this.directory, filename);
            if (!fs.existsSync(filePath)) continue;

            if (!this.idToFileMap.has(workflowId)) {
                this.idToFileMap.set(workflowId, filename);
            }

            if (!this.fileToIdMap.has(filename)) {
                this.fileToIdMap.set(filename, workflowId);
            }
        }
    }

    /**
     * Save state to .n8n-state.json
     */
    private saveState(state: IInstanceState) {
        fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2));
    }

    /**
     * Compute canonical hash for content
     */
    private computeHash(content: any): string {
        return HashUtils.computeHash(content);
    }

    private broadcastStatus(filename: string, workflowId?: string) {
        // Suppress during initial remote load — avoids spurious “Change detected” on startup
        if (this.isInitialRemoteLoad) return;

        const status = this.calculateStatus(filename, workflowId);
        const key = workflowId || filename;
        const lastStatus = this.lastKnownStatuses.get(key);

        if (process.env.DEBUG) {
            console.debug(`[WorkflowStateTracker] Status for ${filename}: ${status} (last: ${lastStatus || 'none'})`);
        }

        if (status !== lastStatus) {
            if (process.env.DEBUG) {
                console.debug(`[WorkflowStateTracker] 🔔 Status changed! Emitting statusChange event`);
            }
            this.lastKnownStatuses.set(key, status);
            this.emit('statusChange', {
                filename,
                workflowId,
                status
            });
        }
    }

    public calculateStatus(filename: string, workflowId?: string): WorkflowSyncStatus {
        if (!workflowId) workflowId = this.fileToIdMap.get(filename);
        const localHash = this.localHashes.get(filename);
        const remoteHash = workflowId ? this.remoteHashes.get(workflowId) : undefined;
        const remoteExists = workflowId ? this.remoteIds.has(workflowId) : false;

        // If we are disconnected and don't have a remote hash, don't claim it's deleted
        if (!this.isConnected && !remoteExists && workflowId) {
            return WorkflowSyncStatus.TRACKED; // Treat as tracked/unknown to avoid "deleted" panic
        }

        // Get base state
        const state = this.loadState();
        const baseState = workflowId ? state.workflows[workflowId] : undefined;
        const lastSyncedHash = baseState?.lastSyncedHash;

        // Debug logging for new files
        if (!workflowId && localHash) {
            console.log(`[WorkflowStateTracker] 🆕 calculateStatus for NEW file: ${filename}`);
            console.log(`  localHash: ${localHash ? localHash.substring(0, 8) : 'none'}`);
            console.log(`  lastSyncedHash: ${lastSyncedHash ? lastSyncedHash.substring(0, 8) : 'none'}`);
            console.log(`  remoteHash: ${remoteHash ? remoteHash.substring(0, 8) : 'none'}`);
        }

        // Implementation of 4.2 Status Logic Matrix
        if (localHash && !lastSyncedHash && !remoteHash) return WorkflowSyncStatus.EXIST_ONLY_LOCALLY;
        if (remoteExists && !lastSyncedHash && !localHash) return WorkflowSyncStatus.EXIST_ONLY_REMOTELY;

        if (localHash && remoteHash && localHash === remoteHash) return WorkflowSyncStatus.TRACKED;

        if (lastSyncedHash) {
            // Check modifications
            const localModified = localHash !== lastSyncedHash;
            const remoteModified = remoteHash && remoteHash !== lastSyncedHash;

            if (localModified && remoteModified) return WorkflowSyncStatus.CONFLICT;
            // All other combinations (single-side or no modification) → TRACKED.
            // Pull guards detect local modifications via direct hash comparison.
            return WorkflowSyncStatus.TRACKED;
        }

        // Fallback for edge cases
        console.warn(`[WorkflowStateTracker] ⚠️  CONFLICT fallback for ${filename}:`, { localHash: !!localHash, remoteHash: !!remoteHash, lastSyncedHash: !!lastSyncedHash, workflowId });
        return WorkflowSyncStatus.CONFLICT;
    }

    private shouldIgnore(wf: IWorkflow): boolean {
        if (!this.syncInactive && !wf.active) return true;
        if (wf.tags) {
            const hasIgnoredTag = wf.tags.some(t => this.ignoredTags.includes(t.name.toLowerCase()));
            if (hasIgnoredTag) return true;
        }
        return false;
    }

    private safeName(name: string): string {
        const originalName = name || '';
        let safeName = originalName;

        const invalidCharMatches = safeName.match(/[\u0000-\u001f\u007f<>:"/\\|?*]/g) || [];
        if (invalidCharMatches.length > 0) {
            if (process.env.DEBUG) console.debug(
                `[WorkflowStateTracker] Sanitizing filename "${originalName}": replacing invalid characters ` +
                `[${invalidCharMatches.map(char => JSON.stringify(char)).join(', ')}] with "_"`
            );
            safeName = safeName.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_');
        }

        const collapsedWhitespace = safeName.replace(/\s+/g, ' ').trim();
        if (collapsedWhitespace !== safeName) {
            if (process.env.DEBUG) console.debug(
                `[WorkflowStateTracker] Sanitizing filename "${originalName}": normalizing whitespace -> "${collapsedWhitespace}"`
            );
            safeName = collapsedWhitespace;
        } else {
            safeName = collapsedWhitespace;
        }

        const withoutTrailingDotsOrSpaces = safeName.replace(/[. ]+$/g, '');
        if (withoutTrailingDotsOrSpaces !== safeName) {
            if (process.env.DEBUG) console.debug(
                `[WorkflowStateTracker] Sanitizing filename "${originalName}": removing trailing dots/spaces -> "${withoutTrailingDotsOrSpaces}"`
            );
            safeName = withoutTrailingDotsOrSpaces;
        } else {
            safeName = withoutTrailingDotsOrSpaces;
        }

        if (!safeName) {
            if (process.env.DEBUG) console.debug(
                `[WorkflowStateTracker] Sanitizing filename "${originalName}": result was empty, using fallback "workflow"`
            );
            safeName = 'workflow';
        }

        const firstDotIndex = safeName.indexOf('.');
        const baseName = firstDotIndex === -1 ? safeName : safeName.slice(0, firstDotIndex);
        const rest = firstDotIndex === -1 ? '' : safeName.slice(firstDotIndex);

        if (WINDOWS_RESERVED_FILENAMES.has(baseName.toUpperCase())) {
            if (process.env.DEBUG) console.debug(
                `[WorkflowStateTracker] Sanitizing filename "${originalName}": "${baseName}" is a reserved Windows device name, appending "_"`
            );
            safeName = `${baseName}_` + rest;
        }

        const finalName = safeName.replace(/[. ]+$/g, '') || 'workflow';
        if (finalName !== originalName) {
            if (process.env.DEBUG) console.debug(
                `[WorkflowStateTracker] Final sanitized filename segment: "${originalName}" -> "${finalName}"`
            );
        }

        return finalName;
    }

    /**
     * Find local file that contains a specific workflow ID
     * Used when we have an ID but no filename mapping yet (e.g., after file rename)
     */
    private findFilenameByWorkflowId(workflowId: string): string | undefined {
        if (!fs.existsSync(this.directory)) {
            return undefined;
        }

        const files = fs.readdirSync(this.directory)
            .filter(f => f.endsWith('.workflow.ts') && !f.startsWith('.'));

        for (const file of files) {
            const content = this.readJsonFile(path.join(this.directory, file));
            if (content?.id === workflowId) {
                return file;
            }
        }
        return undefined;
    }

    private readJsonFile(filePath: string): any {
        try {
            // For TypeScript workflow files, we need async parsing
            // This method should only be called for extracting workflow ID
            // For full workflow data, use readWorkflowFile (async)
            const content = fs.readFileSync(filePath, 'utf8');
            if (filePath.endsWith('.workflow.ts')) {
                // Quick extraction of workflow ID and name from TypeScript decorator
                // Look for: @workflow({ id: "...", name: "..." })
                const decoratorMatch = content.match(/@workflow\s*\(\s*\{([^}]+)\}/);
                if (decoratorMatch) {
                    const decoratorContent = decoratorMatch[1];
                    const result: any = {};

                    // Extract id if present
                    const idMatch = decoratorContent.match(/id:\s*["']([^"']+)["']/);
                    if (idMatch) {
                        result.id = idMatch[1];
                    }

                    // Extract name if present
                    const nameMatch = decoratorContent.match(/name:\s*["']([^"']+)["']/);
                    if (nameMatch) {
                        result.name = nameMatch[1];
                    }

                    // Return at least the extracted data (even if no id)
                    // This allows EXIST_ONLY_LOCALLY workflows to be detected
                    return Object.keys(result).length > 0 ? result : {};
                }

                // Fallback: If file contains JSON (for tests/transition), parse it
                try {
                    const jsonData = JSON.parse(content);
                    // Return workflow data even if it doesn't have an ID
                    // (workflows without ID should be detected as EXIST_ONLY_LOCALLY)
                    return jsonData;
                } catch {
                    // Not JSON, and no decorator match - but still valid .workflow.ts file
                    // Return empty object to allow detection
                }
                return {};
            } else {
                // Legacy JSON files
                return JSON.parse(content);
            }
        } catch {
            return null;
        }
    }

    private async readWorkflowFile(filePath: string): Promise<any> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            if (filePath.endsWith('.workflow.ts')) {
                return await WorkflowTransformerAdapter.compileToJson(content);
            } else {
                // Legacy JSON files
                return JSON.parse(content);
            }
        } catch {
            return null;
        }
    }

    public getFileToIdMap() {
        return this.fileToIdMap;
    }

    /**
     * Returns true if this workflow ID is known to exist on the remote instance
     * (i.e., it appeared in the last refreshRemoteState() call).
     */
    public isRemoteKnown(workflowId: string): boolean {
        return this.remoteIds.has(workflowId);
    }

    /**
     * Lightweight list of workflows with basic status (local only, remote only, both)
     * Does NOT compute hashes, compile TypeScript, or determine detailed status (CONFLICT)
     */
    public async getLightweightList(): Promise<IWorkflowStatus[]> {
        const results: Map<string, IWorkflowStatus> = new Map();
        const state = this.loadState();

        // 1. Process all local files (just check existence, no hash computation)
        for (const filename of this.getLocalWorkflowFilenames()) {
            const workflowId = this.fileToIdMap.get(filename);

            // A workflow is considered "known on remote" if:
            //   a) remoteIds has it (populated by refreshRemoteState)
            //   b) remoteHashes has it (populated by finalizeSync after push/pull)
            //   c) lastSyncedHash exists in state (written by any CLI/VSCode process,
            //      survives cross-process CLI operations like resolve)
            const remoteKnown = workflowId
                ? (this.remoteIds.has(workflowId)
                    || this.remoteHashes.has(workflowId)
                    || !!state.workflows[workflowId]?.lastSyncedHash)
                : false;

            // Determine basic status
            let status: WorkflowSyncStatus;
            if (workflowId && remoteKnown) {
                status = WorkflowSyncStatus.TRACKED; // Both exist
            } else {
                status = WorkflowSyncStatus.EXIST_ONLY_LOCALLY; // New or not yet pushed
            }

            // Prefer the remote canonical name (keyed by ID, not by name since names are non-unique).
            // For local-only files, extract the name from the @workflow decorator for an accurate display.
            // Fall back to filename-derived name as last resort.
            const workflowName = (workflowId && this.remoteNames.get(workflowId))
                || this.readJsonFile(path.join(this.directory, filename))?.name
                || filename.replace('.workflow.ts', '');

            results.set(filename, {
                id: workflowId || '',
                name: workflowName,
                filename: filename,
                status: status,
                active: true, // Default
                projectId: undefined, // Not available in lightweight mode
                projectName: undefined, // Not available in lightweight mode
                homeProject: undefined, // Not available in lightweight mode
                isArchived: false // Default
            });
        }

        // 2. Process all remote workflows not yet in results
        for (const workflowId of this.remoteIds) {
            // Scan-wins: idToFileMap (rebuilt from @workflow decorator) is authoritative.
            // Fall back to deprecated persisted filename for old state files during transition.
            const filename = this.idToFileMap.get(workflowId)
                || (state.workflows[workflowId] as IWorkflowState)?.filename
                || `${workflowId}.workflow.ts`;

            if (!results.has(filename)) {
                // Prefer the actual remote name (stored by ID to avoid name-collision issues)
                // Fallback to filename-derived name only if remote name is not available
                const workflowName = this.remoteNames.get(workflowId) || filename.replace('.workflow.ts', '');

                results.set(filename, {
                    id: workflowId,
                    name: workflowName,
                    filename: filename,
                    status: WorkflowSyncStatus.EXIST_ONLY_REMOTELY, // Remote only
                    active: true, // Default
                    projectId: undefined, // Not available in lightweight mode
                    projectName: undefined, // Not available in lightweight mode
                    homeProject: undefined, // Not available in lightweight mode
                    isArchived: false // Default
                });
            }
        }

        return Array.from(results.values());
    }

    /**
     * Get list of local workflow filenames (just checks file system, no parsing)
     */
    private getLocalWorkflowFilenames(): string[] {
        const filenames: string[] = [];
        try {
            const files = fs.readdirSync(this.directory);
            for (const file of files) {
                if (file.endsWith('.workflow.ts')) {
                    filenames.push(file);
                }
            }
        } catch (error) {
            console.debug('[WorkflowStateTracker] Failed to read local directory:', error);
        }
        return filenames;
    }

    public async getStatusMatrix(): Promise<IWorkflowStatus[]> {
        const results: Map<string, IWorkflowStatus> = new Map();
        const state = this.loadState();

        // Get workflows with metadata for project info
        const workflowsMap = new Map<string, IWorkflow>();
        try {
            // Read local workflows
            for (const [filename] of this.localHashes.entries()) {
                const filePath = path.join(this.directory, filename);
                if (fs.existsSync(filePath)) {
                    try {
                        const workflow = await this.readWorkflowFile(filePath);
                        if (workflow) {
                            const workflowId = workflow.id || this.fileToIdMap.get(filename);
                            if (workflowId) {
                                workflowsMap.set(workflowId, workflow);
                            }
                        }
                    } catch (e) {
                        console.warn(`[WorkflowStateTracker] Failed to parse local workflow ${filename}:`, e);
                    }
                }
            }
        } catch (error) {
            console.debug('[WorkflowStateTracker] Failed to load workflow metadata for status matrix:', error);
        }

        // 1. Process all local files
        for (const [filename, hash] of this.localHashes.entries()) {
            const workflowId = this.fileToIdMap.get(filename);
            const status = this.calculateStatus(filename, workflowId);
            const workflow = workflowId ? workflowsMap.get(workflowId) : undefined;

            results.set(filename, {
                id: workflowId || '',
                name: workflow?.name || filename.replace('.workflow.ts', ''),
                filename: filename,
                status: status,
                active: workflow?.active ?? true,
                projectId: workflow?.projectId,
                projectName: workflow?.projectName,
                homeProject: workflow?.homeProject,
                isArchived: workflow?.isArchived ?? false
            });
        }

        // 2. Process all remote workflows not yet in results
        for (const [workflowId, remoteHash] of this.remoteHashes.entries()) {
            // Scan-wins: idToFileMap (rebuilt from @workflow decorator) is authoritative.
            // Fall back to deprecated persisted filename for old state files during transition.
            const filename = this.idToFileMap.get(workflowId)
                || (state.workflows[workflowId] as IWorkflowState)?.filename
                || `${workflowId}.workflow.ts`;

            if (!results.has(filename)) {
                const status = this.calculateStatus(filename, workflowId);
                const workflow = workflowsMap.get(workflowId);

                results.set(filename, {
                    id: workflowId,
                    name: workflow?.name || filename.replace('.workflow.ts', ''),
                    filename: filename,
                    status: status,
                    active: workflow?.active ?? true,
                    projectId: workflow?.projectId,
                    projectName: workflow?.projectName,
                    homeProject: workflow?.homeProject,
                    isArchived: workflow?.isArchived ?? false
                });
            }
        }

        // 3. Process tracked but deleted workflows
        for (const id of Object.keys(state.workflows)) {
            // Scan-wins: idToFileMap (rebuilt from @workflow decorator) is authoritative.
            // Fall back to deprecated persisted filename for old state files during transition.
            const filename = this.idToFileMap.get(id)
                || (state.workflows[id] as IWorkflowState)?.filename
                || `${id}.workflow.ts`;

            if (!results.has(filename)) {
                const status = this.calculateStatus(filename, id);
                const workflow = workflowsMap.get(id);

                results.set(filename, {
                    id,
                    name: workflow?.name || filename.replace('.workflow.ts', ''),
                    filename,
                    status,
                    active: workflow?.active ?? true,
                    projectId: workflow?.projectId,
                    projectName: workflow?.projectName,
                    homeProject: workflow?.homeProject,
                    isArchived: workflow?.isArchived ?? false
                });
            }
        }

        return Array.from(results.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Get last synced timestamp for a workflow
     */
    public getLastSyncedAt(workflowId: string): string | undefined {
        const state = this.loadState();
        return state.workflows[workflowId]?.lastSyncedAt;
    }

    /**
     * Get last synced hash for a workflow
     */
    public getLastSyncedHash(workflowId: string): string | undefined {
        const state = this.loadState();
        return state.workflows[workflowId]?.lastSyncedHash;
    }

    /**
     * Update remote hash cache (for SyncEngine use)
     * @internal
     */
    public setRemoteHash(workflowId: string, hash: string): void {
        this.remoteHashes.set(workflowId, hash);
    }

    /**
     * Get all tracked workflow IDs
     */
    public getTrackedWorkflowIds(): string[] {
        const state = this.loadState();
        return Object.keys(state.workflows);
    }

    /**
     * Get all workflows with their full content including organization metadata.
     * This reads from local files first, falls back to remote for remote-only workflows.
     * Useful for display purposes where we need project info, archived status, etc.
     */
    public async getAllWorkflows(): Promise<IWorkflow[]> {
        const workflows: IWorkflow[] = [];

        // 1. Get all local workflows
        for (const [filename, _] of this.localHashes.entries()) {
            const filepath = path.join(this.directory, filename);
            try {
                const workflow = await this.readWorkflowFile(filepath);
                if (workflow) {
                    workflows.push(workflow);
                }
            } catch (error) {
                console.warn(`[WorkflowStateTracker] Failed to read local workflow ${filename}:`, error);
            }
        }

        // 2. For remote-only workflows, fetch from API
        const localIds = new Set(workflows.map(w => w.id));
        for (const [workflowId, _] of this.remoteHashes.entries()) {
            if (!localIds.has(workflowId)) {
                try {
                    const workflow = await this.client.getWorkflow(workflowId);
                    if (workflow) {
                        workflows.push(workflow);
                    }
                } catch (error) {
                    console.warn(`[WorkflowStateTracker] Failed to fetch remote workflow ${workflowId}:`, error);
                }
            }
        }

        return workflows;
    }

    /**
     * Update workflow ID in state (when a workflow is re-created with a new ID)
     */
    public async updateWorkflowId(oldId: string, newId: string): Promise<void> {
        const state = this.loadState();

        // Migrate state from old ID to new ID
        if (state.workflows[oldId]) {
            state.workflows[newId] = state.workflows[oldId];
            delete state.workflows[oldId];
            this.saveState(state);
        }

        // Update internal mappings
        const filename = this.idToFileMap.get(oldId);
        if (filename) {
            this.idToFileMap.delete(oldId);
            this.idToFileMap.set(newId, filename);
            this.fileToIdMap.set(filename, newId);
        }

        // Update hash maps
        const remoteHash = this.remoteHashes.get(oldId);
        if (remoteHash) {
            this.remoteHashes.delete(oldId);
            this.remoteHashes.set(newId, remoteHash);
        }

        const timestamp = this.remoteTimestamps.get(oldId);
        if (timestamp) {
            this.remoteTimestamps.delete(oldId);
            this.remoteTimestamps.set(newId, timestamp);
        }

        // Migrate name entry
        const name = this.remoteNames.get(oldId);
        if (name) {
            this.remoteNames.delete(oldId);
            this.remoteNames.set(newId, name);
        }

        // Migrate remote ID set
        if (this.remoteIds.has(oldId)) {
            this.remoteIds.delete(oldId);
            this.remoteIds.add(newId);
        }
    }

    /**
     * Update the remote state cache for a single workflow
     * Used by the fetch command to update remote state without full refresh
     */
    public async updateSingleRemoteState(remoteWf: IWorkflow) {
        if (!remoteWf.id) return;

        try {
            const tsCode = await WorkflowTransformerAdapter.convertToTypeScript(remoteWf, {
                format: true,
                commentStyle: 'verbose'
            });
            const hash = await WorkflowTransformerAdapter.hashWorkflow(tsCode);

            this.remoteHashes.set(remoteWf.id, hash);
            if (remoteWf.updatedAt) {
                this.remoteTimestamps.set(remoteWf.id, remoteWf.updatedAt);
            }
            // Keep remoteNames up-to-date (name is display-only; ID is the canonical key)
            if (remoteWf.name) {
                this.remoteNames.set(remoteWf.id, remoteWf.name);
            }
            // Mark as known on remote
            this.remoteIds.add(remoteWf.id);

            // Establish mapping if it doesn't exist yet (allows 'pull' after single 'fetch')
            if (!this.idToFileMap.has(remoteWf.id)) {
                let filename = this.findFilenameByWorkflowId(remoteWf.id);
                
                if (!filename) {
                    const baseName = `${this.safeName(remoteWf.name || remoteWf.id)}.workflow.ts`;
                    filename = baseName;
                    
                    // Simple collision check against existing mappings
                    if (this.fileToIdMap.has(filename)) {
                        filename = `${this.safeName(remoteWf.name || remoteWf.id)}_${remoteWf.id.substring(0, 8)}.workflow.ts`;
                    }
                }
                
                this.idToFileMap.set(remoteWf.id, filename);
                this.fileToIdMap.set(filename, remoteWf.id);

                // No longer persist filename to state (mappings are rebuilt from file scan).
            }

            // Broadcast status update
            const filename = this.idToFileMap.get(remoteWf.id);
            if (filename) {
                this.broadcastStatus(filename, remoteWf.id);
            }
        } catch (error) {
            console.error(`[WorkflowStateTracker] Failed to update single remote state for ${remoteWf.id}:`, error);
        }
    }
}
