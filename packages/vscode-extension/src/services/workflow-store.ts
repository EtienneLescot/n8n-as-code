import { configureStore, createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { IWorkflowStatus, WorkflowSyncStatus, SyncManager } from '@n8n-as-code/core';

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

interface PendingDeletionsState {
    workflowIds: string[];
}

export interface RootState {
    workflows: WorkflowsState;
    sync: SyncState;
    conflicts: ConflictsState;
    pendingDeletions: PendingDeletionsState;
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
                state.byId[wf.id] = wf;
                state.allIds.push(wf.id);
            });
            state.lastSync = Date.now();
        },

        // Update single workflow
        updateWorkflow: (state, action: PayloadAction<{ id: string; updates: Partial<IWorkflowStatus> }>) => {
            const { id, updates } = action.payload;
            if (state.byId[id]) {
                state.byId[id] = { ...state.byId[id], ...updates };
            }
        },

        // Add or replace workflow
        upsertWorkflow: (state, action: PayloadAction<IWorkflowStatus>) => {
            const wf = action.payload;
            if (!state.byId[wf.id]) {
                state.allIds.push(wf.id);
            }
            state.byId[wf.id] = wf;
        },

        // Remove workflow
        removeWorkflow: (state, action: PayloadAction<string>) => {
            const id = action.payload;
            delete state.byId[id];
            state.allIds = state.allIds.filter(wfId => wfId !== id);
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
// Pending Deletions Slice
// ============================================================================

const pendingDeletionsSlice = createSlice({
    name: 'pendingDeletions',
    initialState: {
        workflowIds: [],
    } as PendingDeletionsState,
    reducers: {
        addPendingDeletion: (state, action: PayloadAction<string>) => {
            if (!state.workflowIds.includes(action.payload)) {
                state.workflowIds.push(action.payload);
            }
        },
        removePendingDeletion: (state, action: PayloadAction<string>) => {
            state.workflowIds = state.workflowIds.filter(id => id !== action.payload);
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

// Load workflows from SyncManager
export const loadWorkflows = createAsyncThunk(
    'workflows/load',
    async () => {
        if (!syncManagerRef) throw new Error('SyncManager not initialized');
        return await syncManagerRef.getWorkflowsStatus();
    }
);

// Sync down (pull)
export const syncDown = createAsyncThunk(
    'sync/down',
    async (_, { dispatch }) => {
        if (!syncManagerRef) throw new Error('SyncManager not initialized');

        dispatch(syncSlice.actions.setSyncing(true));
        try {
            await syncManagerRef.syncDown();
            const workflows = await syncManagerRef.getWorkflowsStatus();
            dispatch(workflowsSlice.actions.setWorkflows(workflows));
        } finally {
            dispatch(syncSlice.actions.setSyncing(false));
        }
    }
);

// Sync up (push)
export const syncUp = createAsyncThunk(
    'sync/up',
    async (_, { dispatch }) => {
        if (!syncManagerRef) throw new Error('SyncManager not initialized');

        dispatch(syncSlice.actions.setSyncing(true));
        try {
            await syncManagerRef.syncUp();
            const workflows = await syncManagerRef.getWorkflowsStatus();
            dispatch(workflowsSlice.actions.setWorkflows(workflows));
        } finally {
            dispatch(syncSlice.actions.setSyncing(false));
        }
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
        pendingDeletions: pendingDeletionsSlice.reducer,
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

export const {
    addPendingDeletion,
    removePendingDeletion,
} = pendingDeletionsSlice.actions;

// Selectors
export const selectAllWorkflows = (state: RootState): IWorkflowStatus[] =>
    state.workflows.allIds.map(id => state.workflows.byId[id]);

export const selectWorkflowById = (state: RootState, id: string): IWorkflowStatus | undefined =>
    state.workflows.byId[id];

export const selectConflicts = (state: RootState) =>
    state.conflicts.byWorkflowId;

export const selectPendingDeletions = (state: RootState): string[] =>
    state.pendingDeletions.workflowIds;

export const selectSyncState = (state: RootState) =>
    state.sync;
