import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SetupJobState } from '../settings-view-model.js';

export type ModalState =
  | { kind: 'environment'; environmentId?: string; managedInstanceId?: string }
  | { kind: 'managed-form'; returnToEnvironmentForm?: boolean; returnToEnvironmentDraftId?: string }
  | { kind: 'managed-detail'; instanceId: string }
  | undefined;

export interface EnvironmentDraft {
  id: string;
  environmentId?: string;
  name: string;
  instanceChoice: string;
  instanceId?: string;
  environmentTargetId?: string;
  url: string;
  apiKey: string;
  apiKeyAvailable?: boolean;
  projectId: string;
  projectName: string;
  syncFolder: string;
  folderSync: boolean;
  customNodesPath: string;
  description: string;
  dirty: boolean;
  projectsLoading?: boolean;
  projects?: Array<{ id: string; name: string }>;
  projectError?: string;
}

export interface ManagedDraft {
  name: string;
  tunnel: boolean;
  setActive: boolean;
}

interface UiState {
  activeTab: 'environments' | 'managed-instances' | 'agent-providers' | 'about';
  modal?: ModalState;
  notice?: { tone: 'info' | 'error'; message: string };
  credentials?: { username: string; password: string };
}

interface DraftState {
  environment: Record<string, EnvironmentDraft>;
  managed: ManagedDraft;
}

const serverSlice = createSlice({
  name: 'server',
  initialState: null as any,
  reducers: {
    snapshotReceived: (_state, action: PayloadAction<any>) => action.payload || null,
  },
});

const jobsSlice = createSlice({
  name: 'jobs',
  initialState: {} as Record<string, SetupJobState>,
  reducers: {
    jobsReceived: (_state, action: PayloadAction<Record<string, SetupJobState> | undefined>) => action.payload || {},
    jobReceived: (state, action: PayloadAction<SetupJobState>) => {
      state[action.payload.instanceId] = action.payload;
    },
  },
});

const uiSlice = createSlice({
  name: 'ui',
  initialState: { activeTab: 'environments' } as UiState,
  reducers: {
    tabSelected: (state, action: PayloadAction<UiState['activeTab']>) => { state.activeTab = action.payload; },
    modalOpened: (state, action: PayloadAction<ModalState>) => {
      state.modal = action.payload;
      state.notice = undefined;
      state.credentials = undefined;
    },
    modalClosed: (state) => { state.modal = undefined; state.credentials = undefined; },
    noticeShown: (state, action: PayloadAction<UiState['notice']>) => { state.notice = action.payload; },
    credentialsReceived: (state, action: PayloadAction<{ username: string; password: string }>) => { state.credentials = action.payload; },
  },
});

function blankEnvironmentDraft(id: string, environment?: any): EnvironmentDraft {
  return {
    id,
    environmentId: environment?.id,
    name: environment?.name || '',
    instanceChoice: environment?.managedInstanceId ? `managed:${environment.managedInstanceId}` : environment?.environmentTargetId ? `target:${environment.environmentTargetId}` : 'new-connected',
    instanceId: environment?.managedInstanceId,
    environmentTargetId: environment?.environmentTargetId,
    url: environment?.url || '',
    apiKey: '',
    apiKeyAvailable: environment?.apiKeyAvailable,
    projectId: environment?.projectId || '',
    projectName: environment?.projectName || '',
    syncFolder: environment?.syncFolder || 'workflows',
    folderSync: environment?.folderSync !== false,
    customNodesPath: environment?.customNodesPath || '',
    description: environment?.description || '',
    dirty: false,
  };
}

const draftsSlice = createSlice({
  name: 'drafts',
  initialState: { environment: {}, managed: { name: 'managed', tunnel: true, setActive: false } } as DraftState,
  reducers: {
    environmentDraftOpened: (state, action: PayloadAction<{ id: string; environment?: any }>) => {
      const existing = state.environment[action.payload.id];
      if (!existing || !existing.dirty) state.environment[action.payload.id] = blankEnvironmentDraft(action.payload.id, action.payload.environment);
    },
    environmentDraftPatched: (state, action: PayloadAction<{ id: string; patch: Partial<EnvironmentDraft> }>) => {
      const existing = state.environment[action.payload.id] || blankEnvironmentDraft(action.payload.id);
      state.environment[action.payload.id] = { ...existing, ...action.payload.patch, dirty: true };
    },
    environmentDraftProjectsReceived: (state, action: PayloadAction<{ id: string; projects?: Array<{ id: string; name: string }>; error?: string }>) => {
      const existing = state.environment[action.payload.id];
      if (!existing) return;
      existing.projectsLoading = false;
      existing.projects = action.payload.projects || [];
      existing.projectError = action.payload.error;
    },
    environmentDraftProjectsLoading: (state, action: PayloadAction<{ id: string }>) => {
      const existing = state.environment[action.payload.id];
      if (!existing) return;
      existing.projectsLoading = true;
      existing.projectError = undefined;
    },
    environmentDraftClosed: (state, action: PayloadAction<{ id: string }>) => { delete state.environment[action.payload.id]; },
    managedDraftPatched: (state, action: PayloadAction<Partial<ManagedDraft>>) => { state.managed = { ...state.managed, ...action.payload }; },
    managedDraftReset: (state) => { state.managed = { name: 'managed', tunnel: true, setActive: false }; },
    managedInstanceSelectedForEnvironment: (state, action: PayloadAction<{ draftId: string; instanceId: string }>) => {
      const draft = state.environment[action.payload.draftId];
      if (!draft) return;
      draft.instanceChoice = `managed:${action.payload.instanceId}`;
      draft.instanceId = action.payload.instanceId;
      draft.environmentTargetId = undefined;
      draft.url = '';
      draft.projectId = 'personal';
      draft.projectName = 'Personal';
      draft.dirty = true;
    },
  },
});

export const actions = {
  ...serverSlice.actions,
  ...jobsSlice.actions,
  ...uiSlice.actions,
  ...draftsSlice.actions,
};

const reducer = {
  server: serverSlice.reducer,
  jobs: jobsSlice.reducer,
  ui: uiSlice.reducer,
  drafts: draftsSlice.reducer,
};

export function createSettingsWebviewStore() {
  return configureStore({ reducer });
}

export const store = createSettingsWebviewStore();

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
