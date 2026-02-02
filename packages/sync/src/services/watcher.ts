import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import * as watcher from '@parcel/watcher';
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
    private watcherSubscription: watcher.AsyncSubscription | null = null;
    private pollInterval: NodeJS.Timeout | null = null;
    private client: N8nApiClient;
    private directory: string;
    private pollIntervalMs: number;
    private syncInactive: boolean;
    private ignoredTags: string[];
    private projectId: string;
    private stateFilePath: string;
    private isConnected: boolean = true;
    private isInitializing: boolean = false;

    // Internal state tracking
    private localHashes: Map<string, string> = new Map(); // filename -> hash
    private remoteHashes: Map<string, string> = new Map(); // workflowId -> hash
    private fileToIdMap: Map<string, string> = new Map(); // filename -> workflowId
    private idToFileMap: Map<string, string> = new Map(); // workflowId -> filename
    private lastKnownStatuses: Map<string, WorkflowSyncStatus> = new Map(); // workflowId or filename -> status

    // Concurrency control
    private isPaused = new Set<string>(); // IDs for which observation is paused
    private syncInProgress = new Set<string>(); // IDs currently being synced
    private pausedFilenames = new Set<string>(); // Filenames for which observation is paused (for workflows without ID yet)

    // Pending operations for rename detection
    private pendingOperations: Map<string, { type: 'unlink'; filename: string; workflowId: string | undefined; timeout: NodeJS.Timeout }> = new Map();
    
    // Potential renames: when we see an add event for a workflow ID that already exists,
    // we track it here to match with subsequent unlink events
    private potentialRenames: Map<string, { newFilename: string; timestamp: number }> = new Map();

    // Lightweight polling cache
    private remoteTimestamps: Map<string, string> = new Map(); // workflowId -> updatedAt

    constructor(
        client: N8nApiClient,
        options: {
            directory: string;
            pollIntervalMs: number;
            syncInactive: boolean;
            ignoredTags: string[];
            projectId: string;      // Project scope filter
        }
    ) {
        super();
        this.client = client;
        this.directory = options.directory;
        this.pollIntervalMs = options.pollIntervalMs;
        this.syncInactive = options.syncInactive;
        this.ignoredTags = options.ignoredTags;
        this.projectId = options.projectId;
        this.stateFilePath = path.join(this.directory, '.n8n-state.json');
    }

    public async start() {
        if (this.watcherSubscription || this.pollInterval) return;

        this.isInitializing = true;

        // Initial scan - throw error if connection fails on startup
        try {
            await this.refreshRemoteState();
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
                this.isInitializing = false;
                // On startup, throw the error to prevent initialization
                throw new Error('Cannot connect to n8n instance. Please check if n8n is running and the host URL is correct.');
            }
            // For other errors, re-throw
            this.isInitializing = false;
            throw error;
        }
        
        await this.refreshLocalState();
        
        // Restore persisted ID → filename mappings from state
        // This ensures stable filename assignment even when remote workflows have duplicate names
        this.restoreMappingsFromState();
        
        this.isInitializing = false;

        // Local Watch with @parcel/watcher
        this.watcherSubscription = await watcher.subscribe(this.directory, (err, events) => {
            if (err) {
                this.emit('error', err);
                return;
            }

            for (const event of events) {
                const filename = path.basename(event.path);
                
                // Ignore hidden files, trash, and state file
                if (filename.startsWith('.') || event.path.includes('.trash')) {
                    continue;
                }

                switch (event.type) {
                    case 'create':
                    case 'update':
                        this.onLocalChange(event.path);
                        break;
                    case 'delete':
                        this.onLocalDelete(event.path);
                        break;
                }
            }
        }, {
            ignore: [
                '**/.trash/**',
                '**/.n8n-state.json',
                '**/.git/**'
            ]
        });

        // Remote Poll
        if (this.pollIntervalMs > 0) {
            this.pollInterval = setInterval(() => this.refreshRemoteState(), this.pollIntervalMs);
        }

        this.emit('ready');
    }

    public stop() {
        if (this.watcherSubscription) {
            this.watcherSubscription.unsubscribe();
            this.watcherSubscription = null;
        }
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        
        // Clean up pending operations
        for (const op of this.pendingOperations.values()) {
            clearTimeout(op.timeout);
        }
        this.pendingOperations.clear();
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
        // Don't force refresh here - let the normal polling cycle handle it
        // Forcing a refresh after every sync can cause loops in auto-sync mode
        // because the remote state might not be immediately consistent with local state
    }

    /**
     * Pause observation for a filename (for workflows without ID yet)
     */
    public pauseObservationByFilename(filename: string) {
        this.pausedFilenames.add(filename);
    }

    /**
     * Resume observation for a filename
     */
    public resumeObservationByFilename(filename: string) {
        this.pausedFilenames.delete(filename);
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
        if (!content) {
            return;
        }

        // Check if this is a rename operation (following architectural plan)
        const detectedWorkflowId = content.id || this.fileToIdMap.get(filename);
        const pendingOpKey = `unlink:${detectedWorkflowId || filename}`;
        const pendingOp = this.pendingOperations.get(pendingOpKey);
        
        if (pendingOp) {
            // Check if this is a rename based on workflow ID or filename
            const isRenameByWorkflowId = detectedWorkflowId && pendingOp.workflowId === detectedWorkflowId;
            const isRenameByFilename = !detectedWorkflowId && pendingOp.filename === filename;
            
            if (isRenameByWorkflowId || isRenameByFilename) {
                // This is a rename! Handle it
                clearTimeout(pendingOp.timeout); // Cancel the deletion timeout
                this.handleRename(pendingOp.workflowId || detectedWorkflowId || '', pendingOp.filename, filename);
                this.pendingOperations.delete(pendingOpKey);
                return;
            }
        }

        // Check if filename is paused (for workflows without ID)
        if (this.pausedFilenames.has(filename)) {
            return;
        }

        let workflowId = content.id || this.fileToIdMap.get(filename);
        if (workflowId && (this.isPaused.has(workflowId) || this.syncInProgress.has(workflowId))) {
            return;
        }

        // Check for duplicate ID (following architectural plan)
        if (content.id) {
            const existingFilename = this.idToFileMap.get(content.id);
            if (existingFilename && existingFilename !== filename) {
                // Check if the existing file still exists on disk
                const existingFilePath = path.join(this.directory, existingFilename);
                const fileExists = fs.existsSync(existingFilePath);
                
                if (!fileExists) {
                    // The existing file doesn't exist - this is likely a rename
                    // Update mappings to point to the new filename
                    this.fileToIdMap.delete(existingFilename);
                    this.fileToIdMap.set(filename, content.id);
                    this.idToFileMap.set(content.id, filename);
                    
                    // Emit rename event
                    this.emit('fileRenamed', {
                        workflowId: content.id,
                        oldFilename: existingFilename,
                        newFilename: filename
                    });
                    
                    // Also check if there's a pending deletion for this workflow ID
                    const pendingOpKey = `unlink:${content.id}`;
                    const pendingOp = this.pendingOperations.get(pendingOpKey);
                    if (pendingOp) {
                        clearTimeout(pendingOp.timeout);
                        this.pendingOperations.delete(pendingOpKey);
                    }
                } else {
                    // File exists - this could be a rename where add happened before unlink
                    // Track as potential rename and wait for unlink event
                    this.potentialRenames.set(content.id, {
                        newFilename: filename,
                        timestamp: Date.now()
                    });
                    
                    // File exists - this is a DUPLICATE ID (copy-paste)
                    // Principle: Keep ID only in the oldest file, remove from the new one
                    // DUPLICAT DÉTECTÉ pendant le watch → supprimer l'ID du nouveau fichier
                    
                    // Remove ID from the new file
                    const currentContent = this.readJsonFile(filePath);
                    if (currentContent && currentContent.id === content.id) {
                        delete currentContent.id;
                        this.writeWorkflowFile(filename, currentContent);
                        
                        // Re-read the content without ID
                        const newContent = this.readJsonFile(filePath);
                        if (newContent) {
                            const workflowId = this.fileToIdMap.get(filename);
                                const clean = WorkflowSanitizer.cleanForHash(newContent);
                            const hash = this.computeHash(clean);
                            this.localHashes.set(filename, hash);
                            this.broadcastStatus(filename, workflowId);
                        }
                    }
                    return; // Stop processing this file as it's being modified
                    
                    // Don't return - continue processing as normal
                    // The unlink event should come soon and trigger rename detection
                }
            }
        }

        // IMPORTANT: Hash is calculated on the SANITIZED version
        // This means versionId, versionCounter, pinData, etc. are ignored
        // The file on disk can contain these fields, but they won't affect the hash
            const clean = WorkflowSanitizer.cleanForHash(content);
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
        let workflowId = this.fileToIdMap.get(filename);

        // If workflowId not found via filename mapping, try to find it via state
        if (!workflowId) {
            const state = this.loadState();
            for (const [id, stateData] of Object.entries(state.workflows)) {
                const mappedFilename = this.idToFileMap.get(id);
                if (mappedFilename === filename) {
                    workflowId = id;
                    break;
                }
            }
        }

        // Check if this is a potential rename (add happened before unlink)
        if (workflowId) {
            const potentialRename = this.potentialRenames.get(workflowId);
            if (potentialRename) {
                this.potentialRenames.delete(workflowId);
                
                // Handle as rename
                this.handleRename(workflowId, filename, potentialRename.newFilename);
                return;
            }
        }

        if (workflowId && (this.isPaused.has(workflowId) || this.syncInProgress.has(workflowId))) {
            return;
        }

        // Schedule deletion check to detect renames (following architectural plan)
        this.scheduleDeletionCheck(filename, workflowId);
    }

    private scheduleDeletionCheck(filename: string, workflowId: string | undefined) {
        const key = `unlink:${workflowId || filename}`;
        const timeout = setTimeout(() => {
            // After 1000ms, confirm that it's really a deletion (increased for better rename detection)
            this.confirmDeletion(filename, workflowId);
            this.pendingOperations.delete(key);
        }, 1000);
        
        this.pendingOperations.set(key, {
            type: 'unlink',
            filename,
            workflowId,
            timeout
        });
    }

    private async onLocalRename(oldPath: string, newPath: string) {
        const oldFilename = path.basename(oldPath);
        const newFilename = path.basename(newPath);
        
        if (!oldFilename.endsWith('.json') || !newFilename.endsWith('.json')) {
            return;
        }
        
        // Try to get workflow ID from old filename mapping
        let workflowId = this.fileToIdMap.get(oldFilename);
        
        // If not found, try to read the new file to get the workflow ID
        if (!workflowId) {
            const content = this.readJsonFile(newPath);
            if (content?.id) {
                workflowId = content.id;
            }
        }
        
        if (!workflowId) {
            // No workflow ID found - this is a rename of a file without ID
            // Just update filename mappings if they exist
            const oldHash = this.localHashes.get(oldFilename);
            if (oldHash) {
                this.localHashes.delete(oldFilename);
                this.localHashes.set(newFilename, oldHash);
            }
            
            // Update fileToIdMap if old filename had a mapping
            const mappedWorkflowId = this.fileToIdMap.get(oldFilename);
            if (mappedWorkflowId) {
                this.fileToIdMap.delete(oldFilename);
                this.fileToIdMap.set(newFilename, mappedWorkflowId);
                this.idToFileMap.set(mappedWorkflowId, newFilename);
            }
            
            // Emit rename event even without workflow ID
            this.emit('fileRenamed', {
                workflowId: '',
                oldFilename,
                newFilename
            });
            
            this.broadcastStatus(newFilename, workflowId);
            return;
        }
        
        // We have a workflow ID - handle as a proper rename
        this.handleRename(workflowId, oldFilename, newFilename);
    }

    private async confirmDeletion(filename: string, workflowId: string | undefined) {
        // Final check: is this actually a rename?
        if (workflowId) {
            // Check if the workflow ID appears in another file
            const otherFilename = this.findFilenameByWorkflowId(workflowId);
            if (otherFilename && otherFilename !== filename) {
                // This is a rename, not a deletion!
                this.handleRename(workflowId, filename, otherFilename);
                return;
            }
        }

        // CRITICAL: Per spec 5.3 DELETED_LOCALLY - Archive Remote to .trash/ IMMEDIATELY
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
                        const trashDir = path.join(this.directory, '.trash');
                        if (!fs.existsSync(trashDir)) {
                            fs.mkdirSync(trashDir, { recursive: true });
                        }
                        
                        // Save to archive with timestamp
                            const clean = WorkflowSanitizer.cleanForHash(remoteWorkflow);
                        const archivePath = path.join(trashDir, `${Date.now()}_${filename}`);
                        fs.writeFileSync(archivePath, JSON.stringify(clean, null, 2));
                    }
                } catch (error) {
                    console.warn(`[Watcher] Failed to archive remote workflow ${workflowId}:`, error);
                    // Continue anyway - deletion detection should still work
                }
            }
        }

        // IMPORTANT: Broadcast status BEFORE cleaning up mappings
        // This ensures the UI receives the DELETED_LOCALLY status with the correct workflowId
        this.broadcastStatus(filename, workflowId);

        // Clean up local hash for deleted file
        this.localHashes.delete(filename);
        
        // CRITICAL: DO NOT delete ID→filename mappings for DELETED_LOCALLY workflows
        // Mappings must persist to:
        // 1. Allow file restoration with the same filename
        // 2. Prevent other remote workflows with the same name from taking this filename
        // Mappings are only deleted when the workflow is completely removed via removeWorkflowState()
    }

    private handleRename(workflowId: string, oldFilename: string, newFilename: string) {
        // Update mappings
        this.fileToIdMap.delete(oldFilename);
        this.fileToIdMap.set(newFilename, workflowId);
        this.idToFileMap.set(workflowId, newFilename);
        
        // Update local hash mapping
        const oldHash = this.localHashes.get(oldFilename);
        if (oldHash) {
            this.localHashes.delete(oldFilename);
            this.localHashes.set(newFilename, oldHash);
        }
        
        // Emit rename event
        this.emit('fileRenamed', {
            workflowId,
            oldFilename,
            newFilename
        });
        
        // Broadcast status with new filename
        this.broadcastStatus(newFilename, workflowId);
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
        
        // First pass: collect all files and their content
        const fileContents: Array<{ filename: string; content: any; mtime: number }> = [];
        for (const filename of files) {
            const filePath = path.join(this.directory, filename);
            const content = this.readJsonFile(filePath);
            if (content) {
                const stat = fs.statSync(filePath);
                fileContents.push({ filename, content, mtime: stat.mtimeMs });
                
                const clean = WorkflowSanitizer.cleanForHash(content);
                const hash = this.computeHash(clean);
                this.localHashes.set(filename, hash);
            }
        }
        
        // Detect and resolve duplicate IDs (following architectural plan)
        this.resolveDuplicateIds(fileContents);
        
        // Second pass: update mappings after duplicate resolution
        // CRITICAL: Only update mappings if not already set from persisted state
        // This prevents ID alternation when remote workflows have duplicate names
        for (const { filename, content } of fileContents) {
            if (content?.id) {
                // Only update if we don't have a persisted mapping for this ID
                if (!this.idToFileMap.has(content.id)) {
                    this.fileToIdMap.set(filename, content.id);
                    this.idToFileMap.set(content.id, filename);
                } else {
                    // We have a persisted mapping - verify it matches the file
                    const persistedFilename = this.idToFileMap.get(content.id);
                    if (persistedFilename !== filename) {
                        // The ID is in a different file than expected
                        // This can happen if a file was renamed or copied
                        // We need to decide: keep persisted mapping or update to new file?
                        // For now, update the reverse mapping but keep ID mapping stable
                        this.fileToIdMap.set(filename, content.id);
                    }
                }
            }
        }
    }
    
    /**
     * Resolve duplicate IDs in local files (following architectural plan)
     * Principle: Keep ID only in the oldest file, remove from others
     */
    private resolveDuplicateIds(fileContents: Array<{ filename: string; content: any; mtime: number }>) {
        // Group files by workflow ID
        const filesById = new Map<string, Array<{ filename: string; mtime: number }>>();
        
        for (const { filename, content, mtime } of fileContents) {
            if (content?.id) {
                const workflowId = content.id;
                if (!filesById.has(workflowId)) {
                    filesById.set(workflowId, []);
                }
                filesById.get(workflowId)!.push({ filename, mtime });
            }
        }
        
        // For each duplicate ID, keep only in oldest file
        for (const [workflowId, fileList] of filesById.entries()) {
            if (fileList.length > 1) {
                // Sort by modification time (oldest first)
                fileList.sort((a, b) => a.mtime - b.mtime);
                
                const oldestFile = fileList[0].filename;
                const duplicates = fileList.slice(1);
                
                // Remove ID from duplicate files
                for (const { filename: dupFilename } of duplicates) {
                    const filePath = path.join(this.directory, dupFilename);
                    const content = this.readJsonFile(filePath);
                    if (content) {
                        delete content.id;
                        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
                        
                        // Update local hash for the modified file
                        const clean = WorkflowSanitizer.cleanForHash(content);
                        const hash = this.computeHash(clean);
                        this.localHashes.set(dupFilename, hash);
                    }
                }
                
                // Emit event for UI (if needed)
                this.emit('duplicateIdResolved', {
                    workflowId,
                    keptInFilename: oldestFile,
                    removedFromFilenames: duplicates.map(d => d.filename)
                });
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
            const remoteWorkflows = await this.client.getAllWorkflows(this.projectId);
            this.isConnected = true;
            const currentRemoteIds = new Set<string>();
            
            // Build set of already-assigned filenames to prevent collisions
            // A filename is "assigned" if:
            // 1. It exists physically on disk, OR
            // 2. It's mapped to a workflow that still exists remotely (even if DELETED_LOCALLY)
            const assignedFilenames = new Set<string>();
            
            for (const wf of remoteWorkflows) {
                if (this.shouldIgnore(wf)) continue;
                if (this.isPaused.has(wf.id) || this.syncInProgress.has(wf.id)) continue;
                
                currentRemoteIds.add(wf.id);

                // CRITICAL: Use ID-based mapping with PERSISTED state as source of truth
                // Priority order for finding filename:
                // 1. Persisted mapping from state (most reliable for stability)
                // 2. Memory mapping (may differ if file was renamed locally)
                // 3. Scan local files by ID
                // 4. Generate from name (new workflow)
                
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
                    const baseName = `${this.safeName(wf.name)}.json`;
                    
                    // Check if this base name is already assigned to another workflow
                    if (assignedFilenames.has(baseName)) {
                        // Name collision - generate unique filename with ID suffix
                        const idSuffix = wf.id.substring(0, 8);
                        filename = `${this.safeName(wf.name)}_${idSuffix}.json`;
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
                } else if (previousFilename !== filename) {
                    // Filename changed - this should only happen during explicit rename
                    // For duplicate name scenarios, we should have generated a unique name above
                    // Update mappings
                    this.fileToIdMap.delete(previousFilename);
                    this.idToFileMap.set(wf.id, filename);
                    this.fileToIdMap.set(filename, wf.id);
                }
                // If previousFilename === filename, mappings are already correct - don't touch them

                // Check if we need to fetch full content
                const cachedTimestamp = this.remoteTimestamps.get(wf.id);
                const needsFullFetch = !cachedTimestamp ||
                    (wf.updatedAt && wf.updatedAt !== cachedTimestamp);

                if (needsFullFetch) {
                    try {
                        const fullWf = await this.client.getWorkflow(wf.id);
                        if (fullWf) {
                            const clean = WorkflowSanitizer.cleanForHash(fullWf);
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
                // Stop polling to avoid spamming errors
                if (this.pollInterval) {
                    clearInterval(this.pollInterval);
                    this.pollInterval = null;
                }
                // Emit a specific connection error
                this.emit('connection-lost', new Error('Lost connection to n8n instance. Please check if n8n is running.'));
            } else {
                // For other errors, just emit the error
                this.emit('error', error);
            }
            // Re-throw so that start() can catch it on initial call
            throw error;
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

        const clean = WorkflowSanitizer.cleanForHash(content);
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
        const filename = this.idToFileMap.get(id) || '';
        state.workflows[id] = {
            lastSyncedHash: hash,
            lastSyncedAt: new Date().toISOString(),
            filename: filename
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
    
    /**
     * Restore ID→filename mappings from persisted state
     * Should only be called once at startup and after state changes
     */
    private restoreMappingsFromState() {
        const state = this.loadState();
        for (const [id, workflowState] of Object.entries(state.workflows)) {
            const ws = workflowState as IWorkflowState;
            if (ws.filename) {
                // Only set if not already mapped (current session takes precedence)
                if (!this.idToFileMap.has(id)) {
                    this.idToFileMap.set(id, ws.filename);
                    this.fileToIdMap.set(ws.filename, id);
                }
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
        if (this.isInitializing) return;
        
        const status = this.calculateStatus(filename, workflowId);
        const key = workflowId || filename;
        const lastStatus = this.lastKnownStatuses.get(key);

        if (status !== lastStatus) {
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
        
        // If we are disconnected and don't have a remote hash, don't claim it's deleted
        if (!this.isConnected && !remoteHash && workflowId) {
            return WorkflowSyncStatus.IN_SYNC; // Treat as in-sync or unknown to avoid "deleted" panic
        }

        // Get base state
        const state = this.loadState();
        const baseState = workflowId ? state.workflows[workflowId] : undefined;
        const lastSyncedHash = baseState?.lastSyncedHash;

        // Implementation of 4.2 Status Logic Matrix
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

    /**
     * Find local file that contains a specific workflow ID
     * Used when we have an ID but no filename mapping yet (e.g., after file rename)
     */
    private findFilenameByWorkflowId(workflowId: string): string | undefined {
        if (!fs.existsSync(this.directory)) {
            return undefined;
        }
        
        const files = fs.readdirSync(this.directory)
            .filter(f => f.endsWith('.json') && !f.startsWith('.'));
        
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
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {
            return null;
        }
    }

    private writeWorkflowFile(filename: string, content: any): void {
        const filePath = path.join(this.directory, filename);
        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
    }

    public getFileToIdMap() {
        return this.fileToIdMap;
    }

    public getStatusMatrix(): IWorkflowStatus[] {
        const results: Map<string, IWorkflowStatus> = new Map();
        const state = this.loadState();

        // Get workflows with metadata for project info
        const workflowsMap = new Map<string, IWorkflow>();
        try {
            // Read local workflows
            for (const [filename] of this.localHashes.entries()) {
                const filePath = path.join(this.directory, filename);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const workflow = JSON.parse(content);
                    if (workflow.id) {
                        workflowsMap.set(workflow.id, workflow);
                    }
                }
            }
        } catch (error) {
            console.debug('[Watcher] Failed to load workflow metadata for status matrix:', error);
        }

        // 1. Process all local files
        for (const [filename, hash] of this.localHashes.entries()) {
            const workflowId = this.fileToIdMap.get(filename);
            const status = this.calculateStatus(filename, workflowId);
            const workflow = workflowId ? workflowsMap.get(workflowId) : undefined;

            results.set(filename, {
                id: workflowId || '',
                name: filename.replace('.json', ''),
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
            // Use persisted filename from state for stability
            const persistedFilename = (state.workflows[workflowId] as IWorkflowState)?.filename;
            const filename = persistedFilename || this.idToFileMap.get(workflowId) || `${workflowId}.json`;
            
            if (!results.has(filename)) {
                const status = this.calculateStatus(filename, workflowId);
                const workflow = workflowsMap.get(workflowId);
                
                results.set(filename, {
                    id: workflowId,
                    name: filename.replace('.json', ''),
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
            // Use persisted filename from state for stability
            const persistedFilename = (state.workflows[id] as IWorkflowState).filename;
            const filename = persistedFilename || this.idToFileMap.get(id) || `${id}.json`;
            
            if (!results.has(filename)) {
                const status = this.calculateStatus(filename, id);
                const workflow = workflowsMap.get(id);
                
                results.set(filename, {
                    id,
                    name: filename.replace('.json', ''),
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
                const content = fs.readFileSync(filepath, 'utf-8');
                const workflow: IWorkflow = JSON.parse(content);
                workflows.push(workflow);
            } catch (error) {
                console.warn(`[Watcher] Failed to read local workflow ${filename}:`, error);
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
                    console.warn(`[Watcher] Failed to fetch remote workflow ${workflowId}:`, error);
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
    }
}