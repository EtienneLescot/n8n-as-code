export function getConfigurationHtml(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>n8n Configuration</title>
  <style>
    :root {
      --border: var(--vscode-panel-border, var(--vscode-input-border));
      --muted: var(--vscode-descriptionForeground);
      --surface: var(--vscode-editor-background);
      --soft: color-mix(in srgb, var(--vscode-input-background) 72%, transparent);
      --accent: var(--vscode-button-background);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--surface);
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
    }
    .page {
      max-width: 1040px;
      margin: 0 auto;
      padding: 18px;
      display: grid;
      gap: 14px;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-end;
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 24px; line-height: 1.2; }
    h2 { font-size: 16px; }
    h3 { font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
    .muted { color: var(--muted); line-height: 1.45; }
    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(320px, .8fr);
      gap: 14px;
      align-items: start;
    }
    .panel {
      border: 1px solid var(--border);
      background: var(--soft);
      border-radius: 8px;
      padding: 14px;
      display: grid;
      gap: 12px;
    }
    .panel-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
    }
    .toolbar { display: flex; flex-wrap: wrap; gap: 8px; }
    .instances { display: grid; gap: 8px; }
    .instance-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      border: 1px solid var(--border);
      background: var(--vscode-editor-background);
      border-radius: 8px;
      padding: 10px;
    }
    .instance-main { min-width: 0; display: grid; gap: 4px; }
    .instance-title { font-weight: 650; overflow-wrap: anywhere; }
    .instance-meta { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    .instance-url { color: var(--vscode-textLink-foreground); text-decoration: none; overflow-wrap: anywhere; }
    .instance-url:hover { text-decoration: underline; }
    .inline-action {
      min-height: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--vscode-textLink-foreground);
      font: inherit;
      font-weight: 600;
    }
    .inline-action:hover { text-decoration: underline; }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .badge {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 11px;
      color: var(--muted);
    }
    .badge.active { color: var(--vscode-button-foreground); background: var(--accent); border-color: var(--accent); }
    .badge.workspace { color: var(--vscode-editorWarning-foreground, var(--vscode-foreground)); }
    .badge.ready { color: var(--vscode-testing-iconPassed, var(--vscode-foreground)); border-color: color-mix(in srgb, var(--vscode-testing-iconPassed, var(--vscode-foreground)) 55%, var(--border)); }
    .badge.stopped { color: var(--vscode-testing-iconSkipped, var(--muted)); }
    .badge.warning { color: var(--vscode-editorWarning-foreground, var(--vscode-foreground)); border-color: color-mix(in srgb, var(--vscode-editorWarning-foreground, var(--vscode-foreground)) 55%, var(--border)); }
    .badge.error { color: var(--vscode-errorForeground); border-color: color-mix(in srgb, var(--vscode-errorForeground) 55%, var(--border)); }
    .summary {
      display: grid;
      gap: 8px;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      background: var(--vscode-editor-background);
    }
    .kv { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 8px; font-size: 12px; }
    .kv span:first-child { color: var(--muted); }
    label { display: grid; gap: 6px; font-size: 12px; color: var(--muted); font-weight: 600; }
    input, select {
      width: 100%;
      min-height: 36px;
      padding: 8px 10px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, var(--border));
      border-radius: 6px;
    }
    input:focus, select:focus { outline: 1px solid var(--vscode-focusBorder); }
    button {
      min-height: 34px;
      border: 1px solid transparent;
      border-radius: 6px;
      padding: 0 12px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      font-weight: 600;
      cursor: pointer;
    }
    button.secondary {
      color: var(--vscode-foreground);
      background: transparent;
      border-color: var(--border);
    }
    button.danger {
      color: var(--vscode-errorForeground);
      background: transparent;
      border-color: color-mix(in srgb, var(--vscode-errorForeground) 45%, var(--border));
    }
    button.compact { min-height: 28px; padding: 0 9px; font-size: 12px; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .full { grid-column: 1 / -1; }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 16px;
      background: color-mix(in srgb, var(--vscode-editor-background) 72%, transparent);
    }
    .hidden { display: none !important; }
    .modal {
      width: min(680px, 100%);
      max-height: 88vh;
      overflow: auto;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--vscode-editor-background);
      display: grid;
      gap: 0;
    }
    .modal-head, .modal-foot {
      padding: 14px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: flex-start;
    }
    .modal-body { padding: 14px; display: grid; gap: 12px; }
    .modal-foot { border-top: 1px solid var(--border); border-bottom: 0; justify-content: flex-end; }
    .message {
      display: none;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      white-space: pre-wrap;
    }
    .message.error { color: var(--vscode-errorForeground); }
    .message.ok { color: var(--vscode-testing-iconPassed, var(--vscode-foreground)); }
    @media (max-width: 860px) {
      header, .grid, .form-grid, .instance-row { grid-template-columns: 1fr; }
      .kv { grid-template-columns: 1fr; gap: 2px; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header>
      <div>
        <h1>n8n configuration</h1>
        <p class="muted">Global instances are owned by n8n-manager. Workspace settings only choose the effective instance and sync folder.</p>
      </div>
      <button id="refresh" class="secondary">Refresh</button>
    </header>

    <div class="grid">
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Global instances</h2>
            <p class="muted">Create, edit, delete, and choose the global active n8n instance.</p>
          </div>
          <button id="addInstance">Add instance</button>
        </div>
        <div class="summary">
          <div class="kv"><span>Global active</span><strong id="globalActive">None</strong></div>
          <div class="kv"><span>Global sync</span><span id="globalSync">-</span></div>
        </div>
        <div id="instanceList" class="instances"></div>
      </section>

      <section class="panel">
        <div>
          <h2>Workspace context</h2>
          <p class="muted">This workspace can pin a different instance and sync folder. Empty fields fall back to global config.</p>
        </div>
        <div class="summary">
          <div class="kv"><span>Effective instance</span><strong id="effectiveInstance">None</strong></div>
          <div class="kv"><span>Source</span><span id="effectiveSource">-</span></div>
          <div class="kv"><span>Effective sync</span><span id="effectiveSync">-</span></div>
        </div>
        <label>
          Workspace instance
          <select id="workspaceInstance"></select>
        </label>
        <label>
          Workspace sync folder
          <input id="workspaceSync" type="text" placeholder="Use workspace default: workflows" />
        </label>
        <div class="form-grid">
          <label>
            Project
            <select id="workspaceProject" disabled><option value="">Load projects from effective instance</option></select>
          </label>
          <div class="toolbar" style="align-self:end">
            <button id="loadProjects" class="secondary">Load projects</button>
          </div>
        </div>
        <div class="toolbar">
          <button id="saveWorkspace">Save workspace context</button>
          <button id="clearWorkspace" class="secondary">Clear overrides</button>
        </div>
      </section>
    </div>

    <div id="error" class="message error"></div>
    <div id="saved" class="message ok">Saved.</div>
  </div>

  <div id="instanceModal" class="modal-backdrop hidden">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-head">
        <div>
          <h2 id="modalTitle">Instance</h2>
          <p class="muted">Connection data is stored globally by n8n-manager.</p>
        </div>
        <button id="closeModal" class="secondary">Close</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <label class="full">
            Name
            <input id="modalName" type="text" placeholder="Production" />
          </label>
          <label>
            Type
            <select id="modalMode">
              <option value="managed-local-docker">Create an instance for me (Require Docker)</option>
              <option value="existing">Use an existing n8n instance</option>
            </select>
          </label>
          <label>
            Activate globally
            <select id="modalSetActive">
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label id="modalHostField" class="full">
            n8n host URL
            <input id="modalHost" type="text" placeholder="https://my-instance.app.n8n.cloud" />
          </label>
          <label id="modalApiKeyField" class="full">
            API key
            <input id="modalApiKey" type="password" placeholder="Leave empty to keep existing key" />
          </label>
          <label id="modalTunnelField" class="full">
            Access
            <select id="modalTunnel">
              <option value="yes">Create a public URL</option>
              <option value="no">Accessible only locally</option>
            </select>
          </label>
        </div>
      </div>
      <div class="modal-foot">
        <button id="cancelModal" class="secondary">Cancel</button>
        <button id="saveInstance">Save instance</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const els = {
      refresh: document.getElementById('refresh'),
      addInstance: document.getElementById('addInstance'),
      instanceList: document.getElementById('instanceList'),
      globalActive: document.getElementById('globalActive'),
      globalSync: document.getElementById('globalSync'),
      effectiveInstance: document.getElementById('effectiveInstance'),
      effectiveSource: document.getElementById('effectiveSource'),
      effectiveSync: document.getElementById('effectiveSync'),
      workspaceInstance: document.getElementById('workspaceInstance'),
      workspaceSync: document.getElementById('workspaceSync'),
      workspaceProject: document.getElementById('workspaceProject'),
      loadProjects: document.getElementById('loadProjects'),
      saveWorkspace: document.getElementById('saveWorkspace'),
      clearWorkspace: document.getElementById('clearWorkspace'),
      error: document.getElementById('error'),
      saved: document.getElementById('saved'),
      modal: document.getElementById('instanceModal'),
      modalTitle: document.getElementById('modalTitle'),
      modalName: document.getElementById('modalName'),
      modalMode: document.getElementById('modalMode'),
      modalSetActive: document.getElementById('modalSetActive'),
      modalHost: document.getElementById('modalHost'),
      modalApiKey: document.getElementById('modalApiKey'),
      modalTunnel: document.getElementById('modalTunnel'),
      modalHostField: document.getElementById('modalHostField'),
      modalApiKeyField: document.getElementById('modalApiKeyField'),
      modalTunnelField: document.getElementById('modalTunnelField'),
      closeModal: document.getElementById('closeModal'),
      cancelModal: document.getElementById('cancelModal'),
      saveInstance: document.getElementById('saveInstance'),
    };

    let state = { global: { instances: [] }, workspace: {}, effective: undefined };
    const PERSONAL_PROJECT = { id: 'personal', name: 'Personal', type: 'personal' };
    let projects = [PERSONAL_PROJECT];
    let editingInstanceId = '';

    function showError(message) {
      els.error.style.display = message ? 'block' : 'none';
      els.error.textContent = message || '';
    }
    function showSaved() {
      els.saved.style.display = 'block';
      setTimeout(() => { els.saved.style.display = 'none'; }, 1300);
    }
    function normalizeHost(host) {
      const trimmed = String(host || '').trim();
      return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
    }
    function instances() {
      return state.global?.instances || [];
    }
    function instanceById(id) {
      return instances().find((instance) => instance.id === id);
    }
    function modeLabel(mode) {
      if (mode === 'managed-local-docker') return 'Managed Docker instance';
      if (mode === 'existing') return 'Existing n8n instance';
      return mode || '';
    }
    function statusBadge(instance) {
      if (instance.runtimeBlockedCode === 'docker-unavailable') return badge('Docker not found', 'error');
      if (instance.runtimeBlockedCode) return badge(instance.runtimeBlockedMessage || 'Needs attention', 'warning');
      if (instance.runtimeWarnings?.length) return badge(instance.runtimeWarnings[0], 'warning');
      if (instance.runtimeStatus === 'ready') return badge('Started', 'ready');
      if (instance.runtimeStatus === 'stopped') return badge('Stopped', 'stopped');
      if (instance.runtimeStatus === 'starting') return badge('Starting', 'warning');
      if (instance.runtimeStatus === 'unhealthy') return badge('Unhealthy', 'error');
      if (instance.runtimeStatus === 'unknown') return badge('Status unknown', 'warning');
      return undefined;
    }
    function render() {
      const global = state.global || {};
      const workspace = state.workspace || {};
      const effective = state.effective;
      const globalActive = instanceById(global.activeInstanceId);
      els.globalActive.textContent = globalActive ? globalActive.name : 'None';
      els.globalSync.textContent = global.defaultSyncFolder || '-';
      els.effectiveInstance.textContent = effective?.activeInstanceName || 'None';
      els.effectiveSource.textContent = effective?.sources?.instance || '-';
      els.effectiveSync.textContent = effective?.syncFolder || '-';
      els.workspaceSync.value = workspace.syncFolder || '';
      renderInstanceList();
      renderWorkspaceInstanceSelect(workspace.activeInstanceId || '');
      renderProjects(workspace.projectId || effective?.projectId || 'personal');
    }
    function renderInstanceList() {
      els.instanceList.innerHTML = '';
      if (!instances().length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'No global instances yet.';
        els.instanceList.appendChild(empty);
        return;
      }
      for (const instance of instances()) {
        const row = document.createElement('div');
        row.className = 'instance-row';
        const main = document.createElement('div');
        main.className = 'instance-main';
        const title = document.createElement('div');
        title.className = 'instance-title';
        title.textContent = instance.name || instance.id;
        const meta = document.createElement('div');
        meta.className = 'muted instance-meta';
        const displayUrl = instance.authBridgePublicUrl || instance.displayUrl || (instance.publicUrlEnabled ? '' : instance.host || instance.baseUrl || '');
        const mode = document.createElement('span');
        mode.textContent = modeLabel(instance.mode) || instance.id;
        meta.appendChild(mode);
        if (displayUrl) {
          const separator = document.createElement('span');
          separator.textContent = '·';
          const url = document.createElement('a');
          url.className = 'instance-url';
          url.href = '#';
          url.textContent = displayUrl;
          url.addEventListener('click', (event) => {
            event.preventDefault();
            post('openExternal', { url: displayUrl });
          });
          meta.append(separator, url);
        } else if (instance.publicUrlEnabled) {
          const separator = document.createElement('span');
          separator.textContent = '·';
          const pending = document.createElement('span');
          pending.textContent = 'Public URL pending';
          const refresh = button('Refresh', 'inline-action', () => post('refreshPublicUrl', { instanceId: instance.id }));
          meta.append(separator, pending, refresh);
        }
        const badges = document.createElement('div');
        badges.className = 'badges';
        const runtimeBadge = statusBadge(instance);
        if (runtimeBadge) badges.appendChild(runtimeBadge);
        if (instance.id === state.global?.activeInstanceId) badges.appendChild(badge('global active', 'active'));
        if (instance.id === state.workspace?.activeInstanceId) badges.appendChild(badge('workspace pin', 'workspace'));
        if (instance.apiKeyAvailable) badges.appendChild(badge('api key', ''));
        if (instance.authBridgePublicUrl) badges.appendChild(badge('auto-login URL', ''));
        if (instance.publicUrlEnabled || instance.tunnelPublicUrl || instance.tunnelTargetUrl) badges.appendChild(badge('public URL', ''));
        main.append(title, meta, badges);
        const actions = document.createElement('div');
        actions.className = 'toolbar';
        const edit = button('Edit', 'secondary', () => openModal(instance));
        const del = button('Delete', 'danger', () => {
          post('deleteInstance', { instanceId: instance.id, instanceName: instance.name || instance.id });
        });
        if (instance.mode === 'managed-local-docker') {
          if (instance.runtimeStatus !== 'ready') {
            actions.append(button('Start', 'secondary compact', () => post('manageInstanceRuntime', { instanceId: instance.id, action: 'start' })));
          }
          if (instance.runtimeStatus !== 'stopped') {
            actions.append(button('Stop', 'secondary compact', () => post('manageInstanceRuntime', { instanceId: instance.id, action: 'stop' })));
          }
          actions.append(button('Restart', 'secondary compact', () => post('manageInstanceRuntime', { instanceId: instance.id, action: 'restart' })));
        }
        actions.append(edit);
        if (instance.id !== state.global?.activeInstanceId) {
          actions.append(button('Activate', 'secondary', () => post('setGlobalActiveInstance', { instanceId: instance.id })));
        }
        actions.append(del);
        row.append(main, actions);
        els.instanceList.appendChild(row);
      }
    }
    function badge(text, cls) {
      const el = document.createElement('span');
      el.className = 'badge ' + cls;
      el.textContent = text;
      return el;
    }
    function button(text, cls, onClick) {
      const el = document.createElement('button');
      el.className = cls || '';
      el.textContent = text;
      el.addEventListener('click', onClick);
      return el;
    }
    function renderWorkspaceInstanceSelect(selectedId) {
      els.workspaceInstance.innerHTML = '';
      const fallback = document.createElement('option');
      fallback.value = '';
      fallback.textContent = 'Use global active instance';
      els.workspaceInstance.appendChild(fallback);
      for (const instance of instances()) {
        const opt = document.createElement('option');
        opt.value = instance.id;
        opt.textContent = instance.name || instance.id;
        els.workspaceInstance.appendChild(opt);
      }
      els.workspaceInstance.value = selectedId || '';
    }
    function renderProjects(selectedId) {
      els.workspaceProject.innerHTML = '';
      const availableProjects = projects.length ? projects : [PERSONAL_PROJECT];
      els.workspaceProject.disabled = false;
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Use instance default project';
      els.workspaceProject.appendChild(empty);
      for (const project of availableProjects) {
        const opt = document.createElement('option');
        opt.value = project.id;
        opt.dataset.projectName = project.type === 'personal' ? 'Personal' : project.name;
        opt.textContent = opt.dataset.projectName;
        els.workspaceProject.appendChild(opt);
      }
      if (selectedId && !availableProjects.some((project) => project.id === selectedId)) {
        const opt = document.createElement('option');
        opt.value = selectedId;
        opt.dataset.projectName = state.workspace?.projectName || state.effective?.projectName || selectedId;
        opt.textContent = opt.dataset.projectName;
        els.workspaceProject.appendChild(opt);
      }
      els.workspaceProject.value = selectedId || '';
    }
    function openModal(instance) {
      editingInstanceId = instance?.id || '';
      els.modalTitle.textContent = editingInstanceId ? 'Edit instance' : 'Add instance';
      els.modalName.value = instance?.name || '';
      els.modalMode.value = instance?.mode || 'managed-local-docker';
      els.modalSetActive.value = editingInstanceId && editingInstanceId !== state.global?.activeInstanceId ? 'no' : 'yes';
      els.modalHost.value = instance?.host || instance?.baseUrl || '';
      els.modalApiKey.value = '';
      els.modalTunnel.value = instance ? (instance.publicUrlEnabled || instance.tunnelPublicUrl || instance.tunnelTargetUrl ? 'yes' : 'no') : 'yes';
      renderModalFields();
      els.modal.classList.remove('hidden');
    }
    function closeModal() {
      editingInstanceId = '';
      els.modal.classList.add('hidden');
    }
    function renderModalFields() {
      const mode = els.modalMode.value;
      const isExisting = mode === 'existing';
      const isManaged = mode === 'managed-local-docker';
      els.modalHostField.classList.toggle('hidden', !isExisting);
      els.modalApiKeyField.classList.toggle('hidden', !isExisting);
      els.modalTunnelField.classList.toggle('hidden', !isManaged);
    }
    function post(type, payload = {}) {
      showError('');
      vscode.postMessage({ type, ...payload });
    }
    els.refresh.addEventListener('click', () => post('refreshState'));
    els.addInstance.addEventListener('click', () => openModal(undefined));
    els.closeModal.addEventListener('click', closeModal);
    els.cancelModal.addEventListener('click', closeModal);
    els.modalMode.addEventListener('change', renderModalFields);
    els.saveInstance.addEventListener('click', () => {
      post('saveGlobalInstance', {
        instanceId: editingInstanceId,
        instanceName: els.modalName.value,
        mode: els.modalMode.value,
        host: normalizeHost(els.modalHost.value),
        apiKey: els.modalApiKey.value,
        tunnel: els.modalTunnel.value === 'yes',
        setActive: els.modalSetActive.value === 'yes',
      });
      closeModal();
    });
    els.loadProjects.addEventListener('click', () => {
      post('loadProjects', {
        instanceId: els.workspaceInstance.value || state.global?.activeInstanceId || '',
        projectId: state.workspace?.projectId || state.effective?.projectId || '',
        projectName: state.workspace?.projectName || state.effective?.projectName || '',
      });
    });
    els.saveWorkspace.addEventListener('click', () => {
      const selectedOption = els.workspaceProject.selectedOptions[0];
      post('saveWorkspaceContext', {
        activeInstanceId: els.workspaceInstance.value,
        syncFolder: els.workspaceSync.value,
        projectId: els.workspaceProject.value,
        projectName: selectedOption?.dataset?.projectName || '',
      });
    });
    els.clearWorkspace.addEventListener('click', () => {
      els.workspaceInstance.value = '';
      els.workspaceSync.value = '';
      renderProjects('personal');
      showError('');
    });
    window.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.type === 'init') {
        state = {
          global: message.global || { instances: [] },
          workspace: message.workspace || {},
          effective: message.effective,
        };
        projects = state.effective?.projectId
          ? [{ id: state.effective.projectId, name: state.effective.projectName || state.effective.projectId, type: state.effective.projectId === 'personal' ? 'personal' : 'unknown' }]
          : [PERSONAL_PROJECT];
        render();
      } else if (message.type === 'projectsLoaded') {
        projects = (message.projects && message.projects.length) ? message.projects : [PERSONAL_PROJECT];
        renderProjects(message.selectedProjectId || state.workspace?.projectId || state.effective?.projectId || 'personal');
      } else if (message.type === 'saved') {
        showSaved();
      } else if (message.type === 'error') {
        showError(message.message || 'Unexpected error');
      } else if (message.type === 'instanceDeleted') {
        showSaved();
      }
    });
  </script>
</body>
</html>`;
}
