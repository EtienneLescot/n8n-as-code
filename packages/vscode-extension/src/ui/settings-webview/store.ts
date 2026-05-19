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
  workflowsPath: string;
  folderSync: boolean;
  customNodesPath: string;
  description: string;
  dirty: boolean;
  projectsLoading?: boolean;
  projects?: Array<{ id: string; name: string; type?: string; detail?: string; displayName?: string }>;
  projectError?: string;
  projectRequestKey?: string;
}

export interface ManagedDraft {
  name: string;
  tunnel: boolean;
}

interface UiState {
  activeTab: 'environments' | 'managed-instances' | 'agent-providers' | 'about';
  modal?: ModalState;
  notice?: { tone: 'info' | 'error'; message: string };
  credentials?: { username: string; password: string };
  pendingActiveEnvironmentId?: string;
  pendingEnvironmentSaves: Record<string, boolean>;
  pendingManagedCreate: boolean;
  pendingInstanceActions: Record<string, string>;
  pendingProviderActions: Record<string, string>;
  lastStateVersion: number;
}

function stateVersion(payload: any): number {
  const version = Number(payload?.stateVersion || 0);
  return Number.isFinite(version) ? version : 0;
}

interface DraftState {
  environment: Record<string, EnvironmentDraft>;
  managed: ManagedDraft;
}

const serverSlice = createSlice({
  name: 'server',
  initialState: null as any,
  reducers: {
    snapshotReceived: (state, action: PayloadAction<any>) => {
      const incomingVersion = stateVersion(action.payload);
      const currentVersion = stateVersion(state);
      if (incomingVersion && currentVersion && incomingVersion <= currentVersion) return state;
      return action.payload || null;
    },
    managedInstancePlaceholderReceived: (state, action: PayloadAction<{ instanceId: string; instanceName?: string }>) => {
      const nextState = state || { global: { instances: [] } };
      const global = nextState.global || (nextState.global = { instances: [] });
      const instances = Array.isArray(global.instances) ? global.instances : (global.instances = []);
      if (instances.some((instance: any) => instance.id === action.payload.instanceId)) return nextState;
      instances.push({
        id: action.payload.instanceId,
        name: action.payload.instanceName || action.payload.instanceId,
        mode: 'managed-local-docker',
        publicUrlEnabled: true,
        runtimeStatus: 'installing',
      });
      return nextState;
    },
    environmentPinned: (state, action: PayloadAction<string>) => {
      if (!state?.workspace) return state;
      state.workspace.activeEnvironmentId = action.payload;
      return state;
    },
    environmentDeleted: (state, action: PayloadAction<string>) => {
      if (!state?.workspace) return state;
      const environments = Array.isArray(state.workspace.environments) ? state.workspace.environments : [];
      state.workspace.environments = environments.filter((environment: any) => environment.id !== action.payload);
      if (state.workspace.activeEnvironmentId === action.payload) state.workspace.activeEnvironmentId = '';
      return state;
    },
    environmentSaved: (state, action: PayloadAction<any>) => {
      if (!state?.workspace || !action.payload?.id) return state;
      const environments = Array.isArray(state.workspace.environments) ? state.workspace.environments : (state.workspace.environments = []);
      const index = environments.findIndex((environment: any) => environment.id === action.payload.id);
      if (index >= 0) environments[index] = { ...environments[index], ...action.payload };
      else environments.push(action.payload);
      state.workspace.activeEnvironmentId = state.workspace.activeEnvironmentId || action.payload.id;
      return state;
    },
    instanceDeleted: (state, action: PayloadAction<string>) => {
      if (!state?.global) return state;
      const instances = Array.isArray(state.global.instances) ? state.global.instances : [];
      state.global.instances = instances.filter((instance: any) => instance.id !== action.payload);
      return state;
    },
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
  initialState: { activeTab: 'environments', lastStateVersion: 0, pendingEnvironmentSaves: {}, pendingManagedCreate: false, pendingInstanceActions: {}, pendingProviderActions: {} } as UiState,
  reducers: {
    tabSelected: (state, action: PayloadAction<UiState['activeTab']>) => { state.activeTab = action.payload; },
    modalOpened: (state, action: PayloadAction<ModalState>) => {
      state.modal = action.payload;
      state.notice = undefined;
      state.credentials = undefined;
    },
    modalClosed: (state) => { state.modal = undefined; state.credentials = undefined; },
    noticeShown: (state, action: PayloadAction<UiState['notice']>) => {
      state.notice = action.payload;
      if (action.payload?.tone === 'error') {
        state.pendingActiveEnvironmentId = undefined;
        state.pendingEnvironmentSaves = {};
        state.pendingManagedCreate = false;
        state.pendingInstanceActions = {};
        state.pendingProviderActions = {};
      }
    },
    environmentActivationRequested: (state, action: PayloadAction<string>) => { state.pendingActiveEnvironmentId = action.payload; },
    environmentSaveRequested: (state, action: PayloadAction<string>) => { state.pendingEnvironmentSaves[action.payload] = true; },
    managedCreateRequested: (state) => { state.pendingManagedCreate = true; },
    instanceActionRequested: (state, action: PayloadAction<{ instanceId: string; action: string }>) => { state.pendingInstanceActions[action.payload.instanceId] = action.payload.action; },
    instanceActionCompleted: (state, action: PayloadAction<string>) => { delete state.pendingInstanceActions[action.payload]; },
    providerActionRequested: (state, action: PayloadAction<{ provider: string; action: string }>) => { state.pendingProviderActions[action.payload.provider] = action.payload.action; },
    providerActionCompleted: (state, action: PayloadAction<string>) => { delete state.pendingProviderActions[action.payload]; },
    credentialsReceived: (state, action: PayloadAction<{ username: string; password: string }>) => { state.credentials = action.payload; },
  },
  extraReducers: (builder) => {
    builder.addCase(serverSlice.actions.snapshotReceived, (state, action) => {
      const incomingVersion = stateVersion(action.payload);
      if (incomingVersion && incomingVersion <= state.lastStateVersion) return;
      if (incomingVersion) state.lastStateVersion = incomingVersion;
      const activeEnvironmentId = String(action.payload?.workspace?.activeEnvironmentId || '');
      if (activeEnvironmentId && activeEnvironmentId === state.pendingActiveEnvironmentId) {
        state.pendingActiveEnvironmentId = undefined;
      }
      const environments = Array.isArray(action.payload?.workspace?.environments) ? action.payload.workspace.environments : [];
      if (state.pendingActiveEnvironmentId && environments.length && !environments.some((environment: any) => environment?.id === state.pendingActiveEnvironmentId)) {
        state.pendingActiveEnvironmentId = undefined;
      }
    });
    builder.addCase(serverSlice.actions.environmentPinned, (state, action) => {
      if (state.pendingActiveEnvironmentId === action.payload) state.pendingActiveEnvironmentId = undefined;
    });
    builder.addCase(serverSlice.actions.environmentDeleted, (state, action) => {
      if (state.pendingActiveEnvironmentId === action.payload) state.pendingActiveEnvironmentId = undefined;
    });
    builder.addCase(serverSlice.actions.environmentSaved, (state, action) => {
      delete state.pendingEnvironmentSaves[action.payload?.id || ''];
      delete state.pendingEnvironmentSaves.new;
    });
    builder.addCase(serverSlice.actions.instanceDeleted, (state, action) => {
      delete state.pendingInstanceActions[action.payload];
      if (state.modal?.kind === 'managed-detail' && state.modal.instanceId === action.payload) state.modal = undefined;
    });
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
    workflowsPath: environment?.workflowsPath || environment?.workflowDir || environment?.syncFolder || defaultWorkflowsPath(environment?.name || ''),
    folderSync: environment?.folderSync !== false,
    customNodesPath: environment?.customNodesPath || '',
    description: environment?.description || '',
    dirty: false,
  };
}

const draftsSlice = createSlice({
  name: 'drafts',
  initialState: { environment: {}, managed: { name: 'managed', tunnel: true } } as DraftState,
  reducers: {
    environmentDraftOpened: (state, action: PayloadAction<{ id: string; environment?: any }>) => {
      const existing = state.environment[action.payload.id];
      if (!existing || !existing.dirty) state.environment[action.payload.id] = blankEnvironmentDraft(action.payload.id, action.payload.environment);
    },
    environmentDraftPatched: (state, action: PayloadAction<{ id: string; patch: Partial<EnvironmentDraft> }>) => {
      const existing = state.environment[action.payload.id] || blankEnvironmentDraft(action.payload.id);
      const patch = { ...action.payload.patch };
      if (patch.name !== undefined && patch.workflowsPath === undefined && !existing.environmentId && existing.workflowsPath === defaultWorkflowsPath(existing.name)) {
        patch.workflowsPath = defaultWorkflowsPath(patch.name);
      }
      state.environment[action.payload.id] = { ...existing, ...patch, dirty: true };
    },
    environmentDraftProjectsReceived: (state, action: PayloadAction<{ id: string; requestKey?: string; projects?: Array<{ id: string; name: string; type?: string; detail?: string; displayName?: string }>; selectedProjectId?: string; selectedProjectName?: string; error?: string }>) => {
      const existing = state.environment[action.payload.id];
      if (!existing) return;
      if (action.payload.requestKey && existing.projectRequestKey && action.payload.requestKey !== existing.projectRequestKey) return;
      existing.projectsLoading = false;
      existing.projects = action.payload.projects || [];
      existing.projectError = action.payload.error;
      if (action.payload.error) {
        existing.projectId = 'personal';
        existing.projectName = 'Personal';
        return;
      }
      const selectedProjectId = action.payload.selectedProjectId || existing.projectId;
      const selectedProject = existing.projects.find((project) => project.id === selectedProjectId) || existing.projects[0];
      existing.projectId = selectedProject?.id || 'personal';
      existing.projectName = action.payload.selectedProjectName || selectedProject?.name || 'Personal';
    },
    environmentDraftProjectsLoading: (state, action: PayloadAction<{ id: string; requestKey?: string }>) => {
      const existing = state.environment[action.payload.id];
      if (!existing) return;
      existing.projectsLoading = true;
      existing.projectError = undefined;
      existing.projectRequestKey = action.payload.requestKey;
    },
    environmentDraftClosed: (state, action: PayloadAction<{ id: string }>) => { delete state.environment[action.payload.id]; },
    managedDraftPatched: (state, action: PayloadAction<Partial<ManagedDraft>>) => { state.managed = { ...state.managed, ...action.payload }; },
    managedDraftReset: (state) => { state.managed = { name: 'managed', tunnel: true }; },
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

function defaultWorkflowsPath(name: string): string {
  const slug = String(name || 'environment')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'environment';
  return `workflows/${slug}`;
}

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
