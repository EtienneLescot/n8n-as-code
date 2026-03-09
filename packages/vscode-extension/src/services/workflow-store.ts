import { configureStore, createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { IWorkflowStatus, SyncManager } from 'n8nac';

// ============================================================================
// State Types
// ============================================================================

interface WorkflowsState {
    byId: Record<string, IWorkflowStatus>;
    allIds: string[];
    lastSync: number;
}

interface SyncState {
    mode: 'auto' | 'manual';
    isWatching: boolean;
    isSyncing: boolean;
    lastError: string | null;
}

interface ConflictsState {
    byWorkflowId: Record<string, {
        id: string;
        filename: string;
        remoteContent: any;
    }>;
}

export interface RootState {
    workflows: WorkflowsState;
    sync: SyncState;
    conflicts: ConflictsState;
}

// ============================================================================
// Workflows Slice
// ============================================================================

const workflowsSlice = createSlice({
    name: 'workflows',
    initialState: {
        byId: {},
        allIds: [],
        lastSync: 0,
    } as WorkflowsState,
    reducers: {
        // Replace all workflows (from full sync)
        setWorkflows: (state, action: PayloadAction<IWorkflowStatus[]>) => {
            state.byId = {};
            state.allIds = [];
            action.payload.forEach(wf => {
                // Use filename as key for workflows without ID (newly created locally)
                const key = wf.id || `file:${wf.filename}`;
                state.byId[key] = wf;
                state.allIds.push(key);
            });
            state.lastSync = Date.now();
        },

        // Update single workflow
        updateWorkflow: (state, action: PayloadAction<{ id: string; updates: Partial<IWorkflowStatus> }>) => {
            const { id, updates } = action.payload;
            // Try both ID and filename-based keys
            const key = id || (updates.filename ? `file:${updates.filename}` : id);
            if (state.byId[key]) {
                state.byId[key] = { ...state.byId[key], ...updates };
            }
        },

        // Add or replace workflow
        upsertWorkflow: (state, action: PayloadAction<IWorkflowStatus>) => {
            const wf = action.payload;
            const key = wf.id || `file:${wf.filename}`;
            if (!state.byId[key]) {
                state.allIds.push(key);
            }
            state.byId[key] = wf;
        },

        // Remove workflow
        removeWorkflow: (state, action: PayloadAction<string>) => {
            const id = action.payload;
            // Try to find by ID or filename-based key
            delete state.byId[id];
            // Also try filename-based key pattern
            const fileKey = Object.keys(state.byId).find(k => k.startsWith('file:') && state.byId[k].id === id);
            if (fileKey) delete state.byId[fileKey];
            state.allIds = state.allIds.filter(wfId => wfId !== id && wfId !== fileKey);
        },
    },
});

// ============================================================================
// Sync Slice
// ============================================================================

const syncSlice = createSlice({
    name: 'sync',
    initialState: {
        mode: 'auto',
        isWatching: false,
        isSyncing: false,
        lastError: null,
    } as SyncState,
    reducers: {
        setMode: (state, action: PayloadAction<'auto' | 'manual'>) => {
            state.mode = action.payload;
        },
        setWatching: (state, action: PayloadAction<boolean>) => {
            state.isWatching = action.payload;
        },
        setSyncing: (state, action: PayloadAction<boolean>) => {
            state.isSyncing = action.payload;
        },
        setError: (state, action: PayloadAction<string | null>) => {
            state.lastError = action.payload;
        },
    },
});

// ============================================================================
// Conflicts Slice
// ============================================================================

const conflictsSlice = createSlice({
    name: 'conflicts',
    initialState: {
        byWorkflowId: {},
    } as ConflictsState,
    reducers: {
        addConflict: (state, action: PayloadAction<{ id: string; filename: string; remoteContent: any }>) => {
            const { id, filename, remoteContent } = action.payload;
            state.byWorkflowId[id] = { id, filename, remoteContent };
        },
        removeConflict: (state, action: PayloadAction<string>) => {
            delete state.byWorkflowId[action.payload];
        },
        clearConflicts: (state) => {
            state.byWorkflowId = {};
        },
    },
});

// ============================================================================
// Async Thunks (for SyncManager integration)
// ============================================================================

// Store reference to SyncManager (set from extension.ts)
let syncManagerRef: SyncManager | null = null;

export function setSyncManager(manager: SyncManager) {
    syncManagerRef = manager;
}

export function clearSyncManager() {
    syncManagerRef = null;
}

// Load workflows from SyncManager
export const loadWorkflows = createAsyncThunk(
    'workflows/load',
    async () => {
        if (!syncManagerRef) throw new Error('SyncManager not initialized');
        return await syncManagerRef.listWorkflows();
    }
);

// ============================================================================
// Store Configuration
// ============================================================================

export const store = configureStore({
    reducer: {
        workflows: workflowsSlice.reducer,
        sync: syncSlice.reducer,
        conflicts: conflictsSlice.reducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            // Disable serialization check for large workflow objects
            serializableCheck: false,
        }),
});

// ============================================================================
// Exports
// ============================================================================

export type AppDispatch = typeof store.dispatch;

// Export individual actions
export const {
    setWorkflows,
    updateWorkflow,
    upsertWorkflow,
    removeWorkflow,
} = workflowsSlice.actions;

export const {
    setMode,
    setWatching,
    setSyncing,
    setError,
} = syncSlice.actions;

export const {
    addConflict,
    removeConflict,
    clearConflicts,
} = conflictsSlice.actions;

// Selectors
export const selectAllWorkflows = (state: RootState): IWorkflowStatus[] =>
    state.workflows.allIds.map(key => state.workflows.byId[key]).filter(Boolean);

export const selectWorkflowById = (state: RootState, id: string): IWorkflowStatus | undefined => {
    // Try direct ID first, then try filename-based key
    return state.workflows.byId[id] || 
           Object.values(state.workflows.byId).find(wf => wf.id === id);
};

export const selectConflicts = (state: RootState) =>
    state.conflicts.byWorkflowId;

export const selectSyncState = (state: RootState) =>
    state.sync;
