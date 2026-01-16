import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import * as chokidar from 'chokidar';
import { N8nApiClient } from './n8n-api-client.js';
import { WorkflowSanitizer } from './workflow-sanitizer.js';
import { HashUtils } from './hash-utils.js';
import { WorkflowSyncStatus, IWorkflowStatus, IWorkflow } from '../types.js';
import { IWorkflowState, IInstanceState } from './state-manager.js';

/**
 * Watcher - State Observation Component
 * 
 * Responsibilities:
 * 1. File System Watch with debounce
 * 2. Remote Polling with lightweight strategy
 * 3. Canonical Hashing (SHA-256 of sorted JSON)
 * 4. Status Matrix Calculation (3-way comparison)
 * 5. State Persistence (only component that writes to .n8n-state.json)
 * 
 * Never performs synchronization actions - only observes reality.
 */
export class Watcher extends EventEmitter {
    private watcher: chokidar.FSWatcher | null = null;
    private pollInterval: NodeJS.Timeout | null = null;
    private client: N8nApiClient;
    private directory: string;
    private pollIntervalMs: number;
    private syncInactive: boolean;
    private ignoredTags: string[];
    private stateFilePath: string;

    // Internal state tracking
    private localHashes: Map<string, string> = new Map(); // filename -> hash
    private remoteHashes: Map<string, string> = new Map(); // workflowId -> hash
    private fileToIdMap: Map<string, string> = new Map(); // filename -> workflowId
    private idToFileMap: Map<string, string> = new Map(); // workflowId -> filename

    // Concurrency control
    private isPaused = new Set<string>(); // IDs for which observation is paused
    private syncInProgress = new Set<string>(); // IDs currently being synced

    // Lightweight polling cache
    private remoteTimestamps: Map<string, string> = new Map(); // workflowId -> updatedAt

    constructor(
        client: N8nApiClient,
        options: {
            directory: string;
            pollIntervalMs: number;
            syncInactive: boolean;
            ignoredTags: string[];
        }
    ) {
        super();
        this.client = client;
        this.directory = options.directory;
        this.pollIntervalMs = options.pollIntervalMs;
        this.syncInactive = options.syncInactive;
        this.ignoredTags = options.ignoredTags;
        this.stateFilePath = path.join(this.directory, '.n8n-state.json');
    }

    public async start() {
        if (this.watcher || this.pollInterval) return;

        // Initial scan
        await this.refreshRemoteState();
        await this.refreshLocalState();

        // Local Watch with debounce
        this.watcher = chokidar.watch(this.directory, {
            ignored: [
                /(^|[\/\\])\../, // Hidden files
                '**/_archive/**', // Archive folder (strictly ignored)
                '**/.n8n-state.json' // State file
            ],
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 } // 500ms debounce
        });

        this.watcher
            .on('add', (p) => this.onLocalChange(p))
            .on('change', (p) => this.onLocalChange(p))
            .on('unlink', (p) => this.onLocalDelete(p));

        // Remote Poll
        if (this.pollIntervalMs > 0) {
            this.pollInterval = setInterval(() => this.refreshRemoteState(), this.pollIntervalMs);
        }

        this.emit('ready');
    }

    public stop() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    /**
     * Pause observation for a workflow during sync operations
     */
    public pauseObservation(workflowId: string) {
        this.isPaused.add(workflowId);
    }

    /**
     * Resume observation after sync operations
     */
    public resumeObservation(workflowId: string) {
        this.isPaused.delete(workflowId);
        // Force refresh to get latest state
        this.refreshRemoteState();
    }

    /**
     * Mark a workflow as being synced (prevents race conditions)
     */
    public markSyncInProgress(workflowId: string) {
        this.syncInProgress.add(workflowId);
    }

    /**
     * Mark a workflow as no longer being synced
     */
    public markSyncComplete(workflowId: string) {
        this.syncInProgress.delete(workflowId);
    }

    private async onLocalChange(filePath: string) {
        const filename = path.basename(filePath);
        if (!filename.endsWith('.json')) return;

        const content = this.readJsonFile(filePath);
        if (!content) return;

        const workflowId = content.id || this.fileToIdMap.get(filename);
        if (workflowId && (this.isPaused.has(workflowId) || this.syncInProgress.has(workflowId))) {
            return;
        }

        // IMPORTANT: Hash is calculated on the SANITIZED version
        // This means versionId, versionCounter, pinData, etc. are ignored
        // The file on disk can contain these fields, but they won't affect the hash
        const clean = WorkflowSanitizer.cleanForStorage(content);
        const hash = this.computeHash(clean);

        this.localHashes.set(filename, hash);
        if (workflowId) {
            this.fileToIdMap.set(filename, workflowId);
            this.idToFileMap.set(workflowId, filename);
        }

        this.broadcastStatus(filename, workflowId);
    }

    private async onLocalDelete(filePath: string) {
        const filename = path.basename(filePath);
        const workflowId = this.fileToIdMap.get(filename);

        if (workflowId && (this.isPaused.has(workflowId) || this.syncInProgress.has(workflowId))) {
            return;
        }

        // CRITICAL: Per spec 5.3 DELETED_LOCALLY - Archive Remote to _archive/ IMMEDIATELY
        // This happens BEFORE user confirmation, to ensure we have a backup
        if (workflowId) {
            const remoteHash = this.remoteHashes.get(workflowId);
            const lastSyncedHash = this.getLastSyncedHash(workflowId);
            
            // Only archive if remote exists and matches last synced (true local deletion)
            if (remoteHash && remoteHash === lastSyncedHash) {
                try {
                    // Fetch remote workflow content
                    const remoteWorkflow = await this.client.getWorkflow(workflowId);
                    
                    if (remoteWorkflow) {
                        // Create archive directory if it doesn't exist
                        const archiveDir = path.join(this.directory, '.archive');
                        if (!fs.existsSync(archiveDir)) {
                            fs.mkdirSync(archiveDir, { recursive: true });
                        }
                        
                        // Save to archive with timestamp
                        const clean = WorkflowSanitizer.cleanForStorage(remoteWorkflow);
                        const archivePath = path.join(archiveDir, `${Date.now()}_${filename}`);
                        fs.writeFileSync(archivePath, JSON.stringify(clean, null, 2));
                        
                        console.log(`[Watcher] Archived remote workflow to: ${archivePath}`);
                    }
                } catch (error) {
                    console.warn(`[Watcher] Failed to archive remote workflow ${workflowId}:`, error);
                    // Continue anyway - deletion detection should still work
                }
            }
        }

        this.localHashes.delete(filename);
        this.broadcastStatus(filename, workflowId);
    }

    public async refreshLocalState() {
        if (!fs.existsSync(this.directory)) {
            console.log(`[DEBUG] refreshLocalState: Directory missing: ${this.directory}`);
            // Clear all local hashes since directory doesn't exist
            this.localHashes.clear();
            return;
        }

        const files = fs.readdirSync(this.directory).filter(f => f.endsWith('.json') && !f.startsWith('.'));
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
        
        // Add/update entries for existing files
        for (const filename of files) {
            const filePath = path.join(this.directory, filename);
            const content = this.readJsonFile(filePath);
            if (content) {
                const clean = WorkflowSanitizer.cleanForStorage(content);
                const hash = this.computeHash(clean);
                this.localHashes.set(filename, hash);
                if (content.id) {
                    this.fileToIdMap.set(filename, content.id);
                    this.idToFileMap.set(content.id, filename);
                }
            }
        }
    }

    /**
     * Lightweight polling strategy:
     * 1. Fetch only IDs and updatedAt timestamps
     * 2. Compare with cached timestamps
     * 3. Fetch full content only if timestamp changed
     */
    public async refreshRemoteState() {
        try {
            const remoteWorkflows = await this.client.getAllWorkflows();
            const currentRemoteIds = new Set<string>();
            
            for (const wf of remoteWorkflows) {
                if (this.shouldIgnore(wf)) continue;
                if (this.isPaused.has(wf.id) || this.syncInProgress.has(wf.id)) continue;
                
                currentRemoteIds.add(wf.id);

                const filename = `${this.safeName(wf.name)}.json`;
                this.idToFileMap.set(wf.id, filename);
                this.fileToIdMap.set(filename, wf.id);

                // Check if we need to fetch full content
                const cachedTimestamp = this.remoteTimestamps.get(wf.id);
                const needsFullFetch = !cachedTimestamp || 
                    (wf.updatedAt && wf.updatedAt !== cachedTimestamp);

                if (needsFullFetch) {
                    try {
                        const fullWf = await this.client.getWorkflow(wf.id);
                        if (fullWf) {
                            const clean = WorkflowSanitizer.cleanForStorage(fullWf);
                            const hash = this.computeHash(clean);

                            this.remoteHashes.set(wf.id, hash);
                            if (wf.updatedAt) {
                                this.remoteTimestamps.set(wf.id, wf.updatedAt);
                            }
                            this.broadcastStatus(filename, wf.id);
                        }
                    } catch (e) {
                        console.warn(`[Watcher] Could not fetch workflow ${wf.id}:`, e);
                    }
                } else {
                    // Timestamp unchanged, use cached hash
                    const cachedHash = this.remoteHashes.get(wf.id);
                    if (cachedHash) {
                        this.broadcastStatus(filename, wf.id);
                    }
                }
            }

            // Prune remoteHashes for deleted workflows
            for (const id of this.remoteHashes.keys()) {
                if (!currentRemoteIds.has(id)) {
                    this.remoteHashes.delete(id);
                    this.remoteTimestamps.delete(id);
                    const filename = this.idToFileMap.get(id);
                    if (filename) this.broadcastStatus(filename, id);
                }
            }
        } catch (error) {
            this.emit('error', error);
        }
    }

    /**
     * Finalize sync - update base state after successful sync operation
     * Called by SyncEngine after PULL/PUSH completes
     */
    public async finalizeSync(workflowId: string): Promise<void> {
        let filename = this.idToFileMap.get(workflowId);
        
        // If workflow not tracked yet (first sync of local-only workflow),
        // scan directory to find the file with this ID
        if (!filename) {
            const files = fs.readdirSync(this.directory).filter(f => f.endsWith('.json') && !f.startsWith('.'));
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

        const clean = WorkflowSanitizer.cleanForStorage(content);
        const computedHash = this.computeHash(clean);
        
        // After a successful sync, local and remote should be identical
        // Use the computed hash for both
        const localHash = computedHash;
        const remoteHash = computedHash;
        
        // Update caches
        this.localHashes.set(filename, localHash);
        this.remoteHashes.set(workflowId, remoteHash);

        // Update base state
        await this.updateWorkflowState(workflowId, localHash);
        
        // Broadcast new IN_SYNC status
        this.broadcastStatus(filename, workflowId);
    }

    /**
     * Update workflow state in .n8n-state.json
     * Only this component writes to the state file
     */
    private async updateWorkflowState(id: string, hash: string) {
        const state = this.loadState();
        state.workflows[id] = {
            lastSyncedHash: hash,
            lastSyncedAt: new Date().toISOString()
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
    }

    /**
     * Load state from .n8n-state.json
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
        const status = this.calculateStatus(filename, workflowId);
        this.emit('statusChange', {
            filename,
            workflowId,
            status
        });
    }

    public calculateStatus(filename: string, workflowId?: string): WorkflowSyncStatus {
        if (!workflowId) workflowId = this.fileToIdMap.get(filename);
        const localHash = this.localHashes.get(filename);
        const remoteHash = workflowId ? this.remoteHashes.get(workflowId) : undefined;
        
        // Get base state
        const state = this.loadState();
        const baseState = workflowId ? state.workflows[workflowId] : undefined;
        const lastSyncedHash = baseState?.lastSyncedHash;

        // Implementation of 4.2 Status Logic Matrix from SPECS/REFACTO_CORE.md
        if (localHash && !lastSyncedHash && !remoteHash) return WorkflowSyncStatus.EXIST_ONLY_LOCALLY;
        if (remoteHash && !lastSyncedHash && !localHash) return WorkflowSyncStatus.EXIST_ONLY_REMOTELY;

        if (localHash && remoteHash && localHash === remoteHash) return WorkflowSyncStatus.IN_SYNC;

        if (lastSyncedHash) {
            // Check deletions first (they take precedence over modifications)
            if (!localHash && remoteHash === lastSyncedHash) return WorkflowSyncStatus.DELETED_LOCALLY;
            if (!remoteHash && localHash === lastSyncedHash) return WorkflowSyncStatus.DELETED_REMOTELY;
            
            // Then check modifications
            const localModified = localHash !== lastSyncedHash;
            const remoteModified = remoteHash && remoteHash !== lastSyncedHash;

            if (localModified && remoteModified) return WorkflowSyncStatus.CONFLICT;
            if (localModified && remoteHash === lastSyncedHash) return WorkflowSyncStatus.MODIFIED_LOCALLY;
            if (remoteModified && localHash === lastSyncedHash) return WorkflowSyncStatus.MODIFIED_REMOTELY;
        }

        // Fallback for edge cases
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
        return name.replace(/[\/\\:]/g, '_').replace(/\s+/g, ' ').trim();
    }

    private readJsonFile(filePath: string): any {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {
            return null;
        }
    }

    public getFileToIdMap() {
        return this.fileToIdMap;
    }

    public getStatusMatrix(): IWorkflowStatus[] {
        const results: Map<string, IWorkflowStatus> = new Map();
        const state = this.loadState();

        // 1. Process all local files
        for (const [filename, hash] of this.localHashes.entries()) {
            const workflowId = this.fileToIdMap.get(filename);
            const status = this.calculateStatus(filename, workflowId);

            results.set(filename, {
                id: workflowId || '',
                name: filename.replace('.json', ''),
                filename: filename,
                status: status,
                active: true
            });
        }

        // 2. Process all remote workflows not yet in results
        for (const [workflowId, remoteHash] of this.remoteHashes.entries()) {
            const filename = this.idToFileMap.get(workflowId) || `${workflowId}.json`;
            if (!results.has(filename)) {
                const status = this.calculateStatus(filename, workflowId);
                results.set(filename, {
                    id: workflowId,
                    name: filename.replace('.json', ''),
                    filename: filename,
                    status: status,
                    active: true
                });
            }
        }

        // 3. Process tracked but deleted workflows
        for (const id of Object.keys(state.workflows)) {
            const filename = this.idToFileMap.get(id) || `${id}.json`;
            if (!results.has(filename)) {
                const status = this.calculateStatus(filename, id);
                results.set(filename, {
                    id,
                    name: filename.replace('.json', ''),
                    filename,
                    status,
                    active: true
                });
            }
        }

        return Array.from(results.values()).sort((a, b) => a.name.localeCompare(b.name));
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
    }
}