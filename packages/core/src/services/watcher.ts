import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import * as chokidar from 'chokidar';
import { N8nApiClient } from './n8n-api-client.js';
import { StateManager } from './state-manager.js';
import { WorkflowSanitizer } from './workflow-sanitizer.js';
import { WorkflowSyncStatus, IWorkflowStatus, IWorkflow } from '../types.js';

export class Watcher extends EventEmitter {
    private watcher: chokidar.FSWatcher | null = null;
    private pollInterval: NodeJS.Timeout | null = null;
    private stateManager: StateManager;
    private client: N8nApiClient;
    private directory: string;
    private pollIntervalMs: number;
    private syncInactive: boolean;
    private ignoredTags: string[];

    // Internal state tracking
    private localHashes: Map<string, string> = new Map(); // filename -> hash
    private remoteHashes: Map<string, string> = new Map(); // workflowId -> hash
    private fileToIdMap: Map<string, string> = new Map(); // filename -> workflowId
    private idToFileMap: Map<string, string> = new Map(); // workflowId -> filename

    private isPaused = new Set<string>(); // IDs for which observation is paused

    constructor(
        client: N8nApiClient,
        stateManager: StateManager,
        options: {
            directory: string;
            pollIntervalMs: number;
            syncInactive: boolean;
            ignoredTags: string[];
        }
    ) {
        super();
        this.client = client;
        this.stateManager = stateManager;
        this.directory = options.directory;
        this.pollIntervalMs = options.pollIntervalMs;
        this.syncInactive = options.syncInactive;
        this.ignoredTags = options.ignoredTags;
    }

    public async start() {
        if (this.watcher || this.pollInterval) return;

        // Initial scan
        await this.refreshRemoteState();
        await this.refreshLocalState();

        // Local Watch
        this.watcher = chokidar.watch(this.directory, {
            ignored: [
                /(^|[\/\\])\../, // Hidden files
                '**/_archive/**', // Archive folder
                '**/.n8n-state.json' // State file
            ],
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
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

    public pause(workflowId: string) {
        this.isPaused.add(workflowId);
    }

    public resume(workflowId: string) {
        this.isPaused.delete(workflowId);
        // Force refresh after resume
        this.refreshRemoteState();
    }

    private async onLocalChange(filePath: string) {
        const filename = path.basename(filePath);
        if (!filename.endsWith('.json')) return;

        const content = this.readJsonFile(filePath);
        if (!content) return;

        const workflowId = content.id || this.fileToIdMap.get(filename);
        if (workflowId && this.isPaused.has(workflowId)) return;

        const clean = WorkflowSanitizer.cleanForStorage(content);
        const hash = StateManager.computeHash(clean);

        // ALWAYS update hashes to reflect current reality even if same, 
        // to ensure manual calls to calculateStatus get fresh data
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

        if (workflowId && this.isPaused.has(workflowId)) return;

        this.localHashes.delete(filename);
        this.broadcastStatus(filename, workflowId);
    }

    public async refreshLocalState() {
        if (!fs.existsSync(this.directory)) {
            console.log(`[DEBUG] refreshLocalState: Directory missing: ${this.directory}`);
            return;
        }

        const files = fs.readdirSync(this.directory).filter(f => f.endsWith('.json') && !f.startsWith('.'));
        console.log(`[DEBUG] refreshLocalState found ${files.length} files in ${this.directory}:`, files);
        for (const filename of files) {
            const filePath = path.join(this.directory, filename);
            const content = this.readJsonFile(filePath);
            if (content) {
                const clean = WorkflowSanitizer.cleanForStorage(content);
                const hash = StateManager.computeHash(clean);
                this.localHashes.set(filename, hash);
                if (content.id) {
                    this.fileToIdMap.set(filename, content.id);
                    this.idToFileMap.set(content.id, filename);
                }
            }
        }
    }

    public async refreshRemoteState() {
        try {
            const remoteWorkflows = await this.client.getAllWorkflows();
            const currentRemoteIds = new Set<string>();
            for (const wf of remoteWorkflows) {
                if (this.shouldIgnore(wf)) continue;
                if (this.isPaused.has(wf.id)) continue;
                currentRemoteIds.add(wf.id);

                const filename = `${this.safeName(wf.name)}.json`;
                this.idToFileMap.set(wf.id, filename);
                this.fileToIdMap.set(filename, wf.id);

                // Lightweight calculation: compare updatedAt if available
                // For now, we fetch full content to be safe and deterministic as per spec
                // Optimized fetching can be added later
                try {
                    const fullWf = await this.client.getWorkflow(wf.id);
                    if (fullWf) {
                        const clean = WorkflowSanitizer.cleanForStorage(fullWf);
                        const hash = StateManager.computeHash(clean);

                        this.remoteHashes.set(wf.id, hash);
                        this.broadcastStatus(filename, wf.id);
                    }
                } catch (e) {
                    // Ignore transiently missing workflows during poll
                    console.warn(`[Watcher] Could not fetch workflow ${wf.id} during poll:`, e);
                }
            }

            // Prune remoteHashes for deleted workflows
            for (const id of this.remoteHashes.keys()) {
                if (!currentRemoteIds.has(id)) {
                    this.remoteHashes.delete(id);
                    const filename = this.idToFileMap.get(id);
                    if (filename) this.broadcastStatus(filename, id);
                }
            }
        } catch (error) {
            this.emit('error', error);
        }
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
        const baseState = workflowId ? this.stateManager.getWorkflowState(workflowId) : undefined;
        const lastSyncedHash = baseState?.lastSyncedHash;

        console.log(`[DEBUG] calculateStatus: ${filename} (ID: ${workflowId})`);
        console.log(`  local: ${localHash ? localHash.substring(0, 8) : 'MISSING'}`);
        console.log(`  remote: ${remoteHash ? remoteHash.substring(0, 8) : 'MISSING'}`);
        console.log(`  lastSynced: ${lastSyncedHash ? lastSyncedHash.substring(0, 8) : 'MISSING'}`);

        // Implementation of 4.2 Status Logic Matrix
        if (localHash && !lastSyncedHash && !remoteHash) return WorkflowSyncStatus.EXIST_ONLY_LOCALLY;
        if (remoteHash && !lastSyncedHash && !localHash) return WorkflowSyncStatus.EXIST_ONLY_REMOTELY;

        if (localHash && remoteHash && localHash === remoteHash) return WorkflowSyncStatus.IN_SYNC;

        if (lastSyncedHash) {
            const localModified = localHash !== lastSyncedHash;
            const remoteModified = remoteHash !== lastSyncedHash;

            if (localModified && remoteModified) return WorkflowSyncStatus.CONFLICT;
            if (localModified && remoteHash === lastSyncedHash) return WorkflowSyncStatus.MODIFIED_LOCALLY;
            if (remoteModified && localHash === lastSyncedHash) return WorkflowSyncStatus.MODIFIED_REMOTELY;

            if (!localHash && remoteHash === lastSyncedHash) return WorkflowSyncStatus.DELETED_LOCALLY;
            if (!remoteHash && localHash === lastSyncedHash) return WorkflowSyncStatus.DELETED_REMOTELY;
        }

        // Fallback or corner cases
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

        // 1. Process all local files
        for (const [filename, hash] of this.localHashes.entries()) {
            const workflowId = this.fileToIdMap.get(filename);
            const status = this.calculateStatus(filename, workflowId);

            // Try to find a name from remote if possible, or use filename
            let name = filename.replace('.json', '');
            if (workflowId) {
                // If we have a workflowId, we might have a name from remote poll
                // but for now we just use the filename
            }

            results.set(filename, {
                id: workflowId || '',
                name: name,
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
                    name: filename.replace('.json', ''), // Fallback name
                    filename: filename,
                    status: status,
                    active: true
                });
            }
        }

        // 3. Process tracked but deleted workflows
        for (const id of this.stateManager.getTrackedWorkflowIds()) {
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
}
