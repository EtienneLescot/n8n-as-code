import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { actions, store, type EnvironmentDraft, type RootState } from './store.js';
import { buildEnvironmentInstanceChoices, environmentAccessBadge, environmentManagedInstanceStatus, instanceDisplayType, instanceUrl, managedInstanceUiStatus } from '../settings-view-model.js';

declare const acquireVsCodeApi: undefined | (() => { postMessage(message: unknown): void });

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : { postMessage: (message: unknown) => console.log(message) };
const post = (message: Record<string, unknown>) => vscode.postMessage(message);

function useAppDispatch() { return useDispatch<typeof store.dispatch>(); }
function server(state: RootState): any { return state.server || {}; }
function instances(state: RootState): any[] { return server(state).global?.instances || []; }
function workspace(state: RootState): any { return server(state).workspace || {}; }
function environments(state: RootState): any[] { return workspace(state).environments || []; }
function targets(state: RootState): any[] { return workspace(state).environmentTargets || []; }
function setupActive(state: RootState): boolean { return Object.values(state.jobs).some((job) => job.status === 'installing' || job.status === 'cancelling'); }

function App() {
  const dispatch = useAppDispatch();
  const activeTab = useSelector((state: RootState) => state.ui.activeTab);
  const notice = useSelector((state: RootState) => state.ui.notice);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const message: any = event.data || {};
      if (message.type === 'init') {
        dispatch(actions.snapshotReceived(message));
        dispatch(actions.jobsReceived(message.setupJobs));
      }
      if (message.type === 'activeTab') dispatch(actions.tabSelected(normalizeTab(message.tab)));
      if (message.type === 'setupJob') dispatch(actions.jobReceived(message.job));
      if (message.type === 'managedInstanceCreated') {
        dispatch(actions.jobReceived({ instanceId: message.instanceId, instanceName: message.instanceName, status: 'installing', returnToEnvironmentForm: Boolean(message.returnToEnvironmentForm) }));
        if (message.returnToEnvironmentForm) {
          const returnDraftId = String(message.returnToEnvironmentDraftId || 'new');
          dispatch(actions.managedInstanceSelectedForEnvironment({ draftId: returnDraftId, instanceId: message.instanceId }));
          dispatch(actions.modalOpened({ kind: 'environment', environmentId: returnDraftId === 'new' ? undefined : returnDraftId }));
        } else {
          dispatch(actions.tabSelected('managed-instances'));
        }
      }
      if (message.type === 'projectsLoaded') dispatch(actions.environmentDraftProjectsReceived({ id: String(message.draftId || 'new'), projects: message.projects || [] }));
      if (message.type === 'projectsError') dispatch(actions.environmentDraftProjectsReceived({ id: String(message.draftId || 'new'), error: message.message || 'Unable to load projects.' }));
      if (message.type === 'managedCredentials') dispatch(actions.credentialsReceived(message.credentials));
      if (message.type === 'error') dispatch(actions.noticeShown({ tone: 'error', message: message.message || 'Unexpected error' }));
      if (message.type === 'saved') dispatch(actions.noticeShown({ tone: 'info', message: 'Settings saved.' }));
    };
    window.addEventListener('message', listener);
    post({ type: 'refreshState' });
    return () => window.removeEventListener('message', listener);
  }, [dispatch]);

  return <div className="settings-shell">
    <aside className="sidebar">
      <div className="sidebar-title">n8n settings</div>
      <Tab id="environments" label="n8n environments" active={activeTab} />
      <Tab id="managed-instances" label="managed instances" active={activeTab} />
      <Tab id="agent-providers" label="Agent providers" active={activeTab} />
      <Tab id="about" label="About" active={activeTab} />
    </aside>
    <main className="page">
      {notice ? <div className={`inline-message notice ${notice.tone === 'error' ? 'error' : ''}`}>{notice.message}</div> : null}
      {activeTab === 'environments' ? <EnvironmentsTab /> : null}
      {activeTab === 'managed-instances' ? <ManagedInstancesTab /> : null}
      {activeTab === 'agent-providers' ? <AgentProvidersTab /> : null}
      {activeTab === 'about' ? <AboutTab /> : null}
      <ActiveModal />
    </main>
  </div>;
}

function normalizeTab(tab: string): any {
  if (tab === 'agent-providers') return 'agent-providers';
  if (tab === 'managed-instances') return 'managed-instances';
  if (tab === 'about') return 'about';
  return 'environments';
}

function Tab(props: { id: any; label: string; active: string }) {
  const dispatch = useAppDispatch();
  return <button className={`tab-button ${props.active === props.id ? 'active' : ''}`} onClick={() => dispatch(actions.tabSelected(props.id))}>{props.label}</button>;
}

function EnvironmentsTab() {
  const dispatch = useAppDispatch();
  const envs = useSelector(environments);
  return <section className="stack">
    <header>
      <div><h1>n8n environments</h1><p className="muted">Workspace sync profiles linked to connected or managed n8n instances.</p></div>
      <button onClick={() => { dispatch(actions.environmentDraftOpened({ id: 'new' })); dispatch(actions.modalOpened({ kind: 'environment' })); }}>Add environment</button>
    </header>
    <div className="grid">{envs.length ? envs.map((env) => <EnvironmentCard key={env.id} env={env} />) : <div className="panel muted">No environments configured.</div>}</div>
  </section>;
}

function EnvironmentCard({ env }: { env: any }) {
  const dispatch = useAppDispatch();
  const activeEnvironmentId = useSelector((state: RootState) => workspace(state).activeEnvironmentId || '');
  const allTargets = useSelector(targets);
  const allInstances = useSelector(instances);
  const jobs = useSelector((state: RootState) => state.jobs);
  const target = allTargets.find((item) => item.id === env.environmentTargetId);
  const access = environmentAccessBadge(env.accessStatus || target?.accessStatus);
  const managed = environmentManagedInstanceStatus(env, target, allInstances, jobs);
  const isActive = env.id === activeEnvironmentId;
  const setActive = () => { if (!isActive) post({ type: 'pinEnvironment', environmentId: env.id }); };
  return <article className={`card clickable ${isActive ? 'active' : ''}`} role="button" tabIndex={0} aria-label={`${isActive ? 'Active environment' : 'Set active environment'}: ${env.name}`} onClick={setActive} onKeyDown={(event) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space') {
      event.preventDefault();
      setActive();
    }
  }}>
    {isActive ? <span className="active-corner" title="Active environment" aria-label="Active environment">✓</span> : null}
    <div className="card-top">
      <div><h2>{env.name}</h2><p className="subtle">{env.syncFolder || 'workflows'}{env.projectName ? ` · ${env.projectName}` : ''}</p></div>
      <div className="row">{isActive ? <span className="badge active">Active</span> : null}{access ? <span className={`badge ${access.tone}`}>{access.label}</span> : null}</div>
    </div>
    <p className="subtle">{target?.name || env.environmentTargetName || env.url || 'No instance target'}</p>
    <div className="row" onClick={(event) => event.stopPropagation()}>
      {managed ? <button className={`badge button ${managed.tone}`} aria-label={`Open managed instance details: ${managed.label}`} onClick={() => dispatch(actions.modalOpened({ kind: 'managed-detail', instanceId: env.managedInstanceId || target?.managedInstanceId }))}>Managed instance: {managed.label}</button> : <span className="badge">Connected instance</span>}
      <button className="secondary" onClick={() => { dispatch(actions.environmentDraftOpened({ id: env.id, environment: env })); dispatch(actions.modalOpened({ kind: 'environment', environmentId: env.id })); }}>Edit</button>
      {!isActive ? <button className="secondary" onClick={() => post({ type: 'pinEnvironment', environmentId: env.id })}>Set active</button> : null}
      <button className="secondary danger" onClick={() => post({ type: 'deleteEnvironment', environmentId: env.id })}>Delete</button>
    </div>
  </article>;
}

function ManagedInstancesTab() {
  const dispatch = useAppDispatch();
  const managed = useSelector(instances).filter((instance) => instance.mode === 'managed-local-docker');
  const activeSetup = useSelector(setupActive);
  return <section className="stack">
    <header>
      <div><h1>managed instances</h1><p className="muted">Local n8n-manager controlled runtimes used by environments.</p></div>
      <button disabled={activeSetup} onClick={() => dispatch(actions.modalOpened({ kind: 'managed-form' }))}>Create managed instance</button>
    </header>
    {activeSetup ? <div className="inline-message warning">Another managed instance is installing. Wait for it to finish or cancel it.</div> : null}
    <div className="grid">{managed.length ? managed.map((instance) => <ManagedInstanceCard key={instance.id} instance={instance} />) : <div className="panel muted">No managed instances yet.</div>}</div>
  </section>;
}

function ManagedInstanceCard({ instance }: { instance: any }) {
  const dispatch = useAppDispatch();
  const jobs = useSelector((state: RootState) => state.jobs);
  const envs = useSelector(environments);
  const allTargets = useSelector(targets);
  const status = managedInstanceUiStatus(instance, jobs[instance.id]);
  const usedBy = envs.filter((env) => {
    const target = allTargets.find((item) => item.id === env.environmentTargetId);
    return env.managedInstanceId === instance.id || target?.managedInstanceId === instance.id;
  });
  const url = instanceUrl(instance);
  const openDetail = () => dispatch(actions.modalOpened({ kind: 'managed-detail', instanceId: instance.id }));
  return <article className="card clickable" role="button" tabIndex={0} onClick={openDetail} onKeyDown={(event) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space') {
      event.preventDefault();
      openDetail();
    }
  }}>
    <div className="card-top"><div><h2>{instance.name || instance.id}</h2><p className="subtle">{url || 'URL pending'}</p></div><span className={`badge ${status.tone}`}>{status.label}</span></div>
    <p className="subtle">{usedBy.length ? `Used by: ${usedBy.map((env) => env.name).join(', ')}` : 'Not used by any environment'}</p>
    <div className="row" onClick={(event) => event.stopPropagation()}>
      {status.canOpen && url ? <button onClick={() => post({ type: 'openExternal', url })}>Open</button> : null}
      {!usedBy.length ? <button className="secondary" onClick={() => { dispatch(actions.environmentDraftOpened({ id: 'new' })); dispatch(actions.managedInstanceSelectedForEnvironment({ draftId: 'new', instanceId: instance.id })); dispatch(actions.modalOpened({ kind: 'environment', managedInstanceId: instance.id })); }}>Create environment</button> : null}
      {status.canCancel ? <button className="secondary" onClick={() => post({ type: 'cancelManagedInstanceSetup', instanceId: instance.id })}>Cancel</button> : null}
      <button className="secondary" onClick={() => dispatch(actions.modalOpened({ kind: 'managed-detail', instanceId: instance.id }))}>Manage</button>
    </div>
  </article>;
}

function AgentProvidersTab() {
  const providers = useSelector((state: RootState) => server(state).providers || []);
  return <section className="stack"><header><div><h1>Agent providers</h1><p className="muted">AI provider connections used by agent workflows.</p></div></header><div className="stack">{providers.map((provider: any) => {
    const providerId = provider.provider || provider.id;
    return <article className="card" key={providerId}><div className="card-top"><div><h2>{provider.label || providerId}</h2><p className="subtle">{provider.model || provider.reason || ''}</p></div><span className={`badge ${provider.connected ? 'ready' : ''}`}>{provider.connected ? 'Connected' : 'Not connected'}</span></div><div className="row"><button onClick={() => post({ type: 'connectProvider', provider: providerId })}>Connect</button>{provider.connected ? <button className="secondary" onClick={() => post({ type: 'disconnectProvider', provider: providerId })}>Disconnect</button> : null}<button className="secondary" onClick={() => post({ type: 'selectProviderModel', provider: providerId })}>Select model</button></div></article>;
  })}</div></section>;
}

function AboutTab() {
  const about = useSelector((state: RootState) => server(state).about || {});
  return <section className="stack"><header><div><h1>About</h1><p className="muted">n8n as code extension details.</p></div></header><div className="panel"><p>Extension version: {about.extensionVersion || 'unknown'}</p><p>n8nac version: {about.cliVersion || 'unknown'}</p></div></section>;
}

function ActiveModal() {
  const modal = useSelector((state: RootState) => state.ui.modal);
  if (!modal) return null;
  if (modal.kind === 'environment') return <EnvironmentFormModal environmentId={modal.environmentId} />;
  if (modal.kind === 'managed-form') return <ManagedInstanceFormModal returnToEnvironmentForm={modal.returnToEnvironmentForm} returnToEnvironmentDraftId={modal.returnToEnvironmentDraftId} />;
  if (modal.kind === 'managed-detail') return <ManagedInstanceDetailModal instanceId={modal.instanceId} />;
  return null;
}

function EnvironmentFormModal({ environmentId }: { environmentId?: string }) {
  const dispatch = useAppDispatch();
  const draftId = environmentId || 'new';
  const draft = useSelector((state: RootState) => state.drafts.environment[draftId]);
  const allTargets = useSelector(targets);
  const allInstances = useSelector(instances);
  const jobs = useSelector((state: RootState) => state.jobs);
  const activeSetup = useSelector(setupActive);
  const choices = buildEnvironmentInstanceChoices(allTargets, allInstances);
  const selected = choices.find((choice) => choice.value === draft?.instanceChoice);
  const editingEnvironment = Boolean(environmentId);
  const isManaged = selected?.mode === 'managed';
  const status = isManaged ? managedInstanceUiStatus(allInstances.find((instance) => instance.id === selected.instanceId), selected.instanceId ? jobs[selected.instanceId] : undefined) : undefined;
  const patch = (patch: Partial<EnvironmentDraft>) => dispatch(actions.environmentDraftPatched({ id: draftId, patch }));
  if (!draft) return null;
  const save = () => post({
    type: 'saveEnvironment', environmentId, name: draft.name, environmentTargetId: selected?.targetId || draft.environmentTargetId || '', instanceId: selected?.instanceId || draft.instanceId || '', url: isManaged ? '' : draft.url || selected?.url || '', apiKey: isManaged ? '' : draft.apiKey, projectId: isManaged ? 'personal' : draft.projectId, projectName: isManaged ? 'Personal' : draft.projectName, syncFolder: draft.syncFolder, folderSync: draft.folderSync, customNodesPath: draft.customNodesPath, description: draft.description,
  });
  return <Modal title={environmentId ? 'Edit environment' : 'Add environment'} onClose={() => { dispatch(actions.environmentDraftClosed({ id: draftId })); dispatch(actions.modalClosed()); }}>
    <div className="form-grid"><label>Name<input value={draft.name} onChange={(event) => patch({ name: event.target.value })} /></label><label>Instance<select value={draft.instanceChoice} disabled={editingEnvironment} onChange={(event) => { const value = event.target.value; const choice = choices.find((item) => item.value === value); if (choice?.mode === 'new-managed') { dispatch(actions.modalOpened({ kind: 'managed-form', returnToEnvironmentForm: true, returnToEnvironmentDraftId: draftId })); return; } patch({ instanceChoice: value, instanceId: choice?.instanceId, environmentTargetId: choice?.targetId, url: choice?.url || '', projectId: choice?.mode === 'managed' ? 'personal' : draft.projectId, projectName: choice?.mode === 'managed' ? 'Personal' : draft.projectName }); }}><optgroup label="Create">{choices.filter((choice) => choice.group === 'Create').map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</optgroup><optgroup label="Saved instances">{choices.filter((choice) => choice.group === 'Saved instances').map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</optgroup></select>{editingEnvironment ? <span className="subtle">Create a new environment to link a different instance.</span> : null}</label></div>
    {selected?.mode === 'new-connected' ? <div className="form-grid"><label>n8n URL<input value={draft.url} onChange={(event) => patch({ url: event.target.value })} /></label><label>API key<input type="password" value={draft.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} placeholder={draft.apiKeyAvailable ? 'Stored API key will be reused' : ''} /></label></div> : null}
    {selected?.mode === 'new-managed' ? <div className="inline-message">Select New managed instance to create a linkable local runtime first.</div> : null}
    {isManaged ? <div className="inline-message warning">Managed instance is {status?.label.toLowerCase()}. You can finish this environment now; runtime status will update in the background.</div> : <ProjectFields draft={draft} patch={patch} draftId={draftId} selected={selected} />}
    <div className="form-grid"><label>Sync root folder<input value={draft.syncFolder} onChange={(event) => patch({ syncFolder: event.target.value })} /></label><label>Custom nodes path<input value={draft.customNodesPath} onChange={(event) => patch({ customNodesPath: event.target.value })} /></label></div>
    <label>Description<textarea value={draft.description} onChange={(event) => patch({ description: event.target.value })} /></label>
    <div className="toolbar"><button onClick={save} disabled={!draft.name || (!isManaged && selected?.mode === 'new-connected' && (!draft.url || (!draft.apiKey && !draft.apiKeyAvailable)))}>Save environment</button><button className="secondary" disabled={activeSetup || editingEnvironment} onClick={() => dispatch(actions.modalOpened({ kind: 'managed-form', returnToEnvironmentForm: true, returnToEnvironmentDraftId: draftId }))}>Create local instance</button></div>
  </Modal>;
}

function ProjectFields({ draft, patch, draftId, selected }: { draft: EnvironmentDraft; patch: (patch: Partial<EnvironmentDraft>) => void; draftId: string; selected: any }) {
  const dispatch = useAppDispatch();
  const load = () => { dispatch(actions.environmentDraftProjectsLoading({ id: draftId })); post({ type: 'loadProjects', scope: 'environment', draftId, instanceId: selected?.instanceId || '', environmentTargetId: selected?.targetId || '', host: selected?.targetId ? '' : draft.url || selected?.url || '', apiKey: selected?.targetId ? '' : draft.apiKey, projectId: draft.projectId, projectName: draft.projectName }); };
  return <div className="stack"><div className="toolbar"><button className="secondary" onClick={load}>{draft.projectsLoading ? 'Loading projects...' : 'Load projects'}</button>{draft.projectError ? <span className="subtle">{draft.projectError}</span> : null}</div><div className="form-grid"><label>Project<select value={draft.projectId} onChange={(event) => { const project = (draft.projects || []).find((item) => item.id === event.target.value); patch({ projectId: event.target.value, projectName: project?.name || '' }); }}><option value="">Select a project</option>{(draft.projects || []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>Project name<input value={draft.projectName} onChange={(event) => patch({ projectName: event.target.value })} /></label></div></div>;
}

function ManagedInstanceFormModal({ returnToEnvironmentForm, returnToEnvironmentDraftId }: { returnToEnvironmentForm?: boolean; returnToEnvironmentDraftId?: string }) {
  const dispatch = useAppDispatch();
  const draft = useSelector((state: RootState) => state.drafts.managed);
  const activeSetup = useSelector(setupActive);
  return <Modal title="Create managed instance" onClose={() => dispatch(actions.modalClosed())}>
    {activeSetup ? <div className="inline-message warning">Another managed instance is installing. Wait for it to finish or cancel it.</div> : null}
    <div className="form-grid"><label>Name<input value={draft.name} onChange={(event) => dispatch(actions.managedDraftPatched({ name: event.target.value }))} /></label><label>Public URL<select value={draft.tunnel ? 'public' : 'local'} onChange={(event) => dispatch(actions.managedDraftPatched({ tunnel: event.target.value === 'public' }))}><option value="public">Enable public URL</option><option value="local">Local only</option></select></label></div>
    <label className="row"><input type="checkbox" checked={draft.setActive} onChange={(event) => dispatch(actions.managedDraftPatched({ setActive: event.target.checked }))} /> Set as active global instance</label>
    <div className="toolbar"><button disabled={activeSetup || !draft.name.trim()} onClick={() => { post({ type: 'createManagedInstance', instanceName: draft.name, tunnel: draft.tunnel, setActive: draft.setActive, returnToEnvironmentForm, returnToEnvironmentDraftId }); dispatch(actions.managedDraftReset()); if (!returnToEnvironmentForm) dispatch(actions.modalClosed()); }}>Create managed instance</button></div>
  </Modal>;
}

function ManagedInstanceDetailModal({ instanceId }: { instanceId: string }) {
  const dispatch = useAppDispatch();
  const instance = useSelector(instances).find((item) => item.id === instanceId);
  const jobs = useSelector((state: RootState) => state.jobs);
  const status = managedInstanceUiStatus(instance, jobs[instanceId]);
  const credentials = useSelector((state: RootState) => state.ui.credentials);
  const url = instance ? instanceUrl(instance) : '';
  return <Modal title={instance?.name || instanceId} onClose={() => dispatch(actions.modalClosed())}>
    <div className="row"><span className={`badge ${status.tone}`}>{status.label}</span><span className="subtle">{status.message}</span></div>
    <p className="subtle">{url || 'URL pending'}</p>
    <div className="toolbar">{status.canOpen && url ? <button onClick={() => post({ type: 'openExternal', url })}>Open</button> : null}<button className="secondary" onClick={() => post({ type: 'manageInstanceRuntime', instanceId, action: 'start' })}>Start</button><button className="secondary" onClick={() => post({ type: 'manageInstanceRuntime', instanceId, action: 'stop' })}>Stop</button><button className="secondary" onClick={() => post({ type: 'manageInstanceRuntime', instanceId, action: 'restart' })}>Restart</button><button className="secondary" onClick={() => post({ type: 'refreshPublicUrl', instanceId })}>Refresh public URL</button>{status.canCancel ? <button className="secondary" onClick={() => post({ type: 'cancelManagedInstanceSetup', instanceId })}>Cancel setup</button> : null}</div>
    <div className="toolbar"><button className="secondary" onClick={() => post({ type: 'showManagedCredentials', instanceId })}>Show credentials</button><button className="secondary" onClick={() => { dispatch(actions.environmentDraftOpened({ id: 'new' })); dispatch(actions.managedInstanceSelectedForEnvironment({ draftId: 'new', instanceId })); dispatch(actions.modalOpened({ kind: 'environment', managedInstanceId: instanceId })); }}>Create environment</button><button className="danger" onClick={() => post({ type: 'deleteInstance', instanceId, instanceName: instance?.name })}>Delete</button></div>
    {credentials ? <div className="panel"><p>Username: {credentials.username}</p><p>Password: {credentials.password}</p></div> : null}
  </Modal>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><h2>{title}</h2><button className="secondary" onClick={onClose}>Close</button></div>{children}</section></div>;
}

createRoot(document.getElementById('root')!).render(<Provider store={store}><App /></Provider>);
