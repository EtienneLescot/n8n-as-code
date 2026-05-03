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
    .settings-shell {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 180px minmax(0, 1fr);
    }
    .sidebar {
      border-right: 1px solid var(--border);
      background: color-mix(in srgb, var(--vscode-sideBar-background, var(--surface)) 88%, var(--surface));
      padding: 14px 8px;
      display: grid;
      align-content: start;
      gap: 6px;
    }
    .sidebar-title {
      padding: 0 8px 10px;
      font-weight: 700;
    }
    .tab-button {
      width: 100%;
      justify-content: flex-start;
      text-align: left;
      color: var(--vscode-foreground);
      background: transparent;
      border-color: transparent;
      display: flex;
      gap: 8px;
      align-items: center;
      font-weight: 600;
    }
    .tab-button.active {
      background: var(--vscode-list-activeSelectionBackground, var(--vscode-list-hoverBackground));
      color: var(--vscode-list-activeSelectionForeground, var(--vscode-foreground));
    }
    .page {
      max-width: 1240px;
      width: 100%;
      padding: 18px;
      display: grid;
      gap: 14px;
    }
    .tab-panel { display: none; }
    .tab-panel.active { display: grid; gap: 14px; }
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
      grid-template-columns: minmax(0, 1.35fr) minmax(300px, .65fr);
      gap: 14px;
      align-items: start;
    }
    .panel {
      border: 1px solid var(--border);
      background: var(--soft);
      border-radius: 10px;
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
    .instances { display: grid; gap: 10px; }
    .providers { display: grid; gap: 10px; }
    .provider-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      border-top: 1px solid var(--border);
      padding: 13px 0;
    }
    .provider-row:first-child { border-top: 0; }
    .provider-main { display: grid; gap: 4px; min-width: 0; }
    .provider-title { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-weight: 700; }
    .provider-detail { color: var(--muted); font-size: 12px; }
    .provider-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    .instance-row {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
      border: 1px solid var(--border);
      background: var(--vscode-editor-background);
      border-radius: 14px;
      padding: 13px;
      position: relative;
      overflow: hidden;
      transition: border-color .14s ease, box-shadow .14s ease, background .14s ease, transform .14s ease;
    }
    .instance-row.selectable { cursor: pointer; }
    .instance-row.selectable:hover {
      border-color: color-mix(in srgb, var(--vscode-focusBorder, var(--accent)) 70%, var(--border));
      transform: translateY(-1px);
      box-shadow: 0 8px 24px color-mix(in srgb, var(--vscode-editor-background) 65%, black);
    }
    .instance-row.selected {
      border-color: var(--vscode-focusBorder, var(--accent));
      box-shadow: 0 0 0 1px var(--vscode-focusBorder, var(--accent)), 0 10px 30px color-mix(in srgb, var(--vscode-button-background) 18%, transparent);
      background: color-mix(in srgb, var(--vscode-button-background) 9%, var(--vscode-editor-background));
    }
    .instance-row.selected::before {
      content: '';
      position: absolute;
      inset: 0 auto 0 0;
      width: 4px;
      background: var(--vscode-focusBorder, var(--accent));
    }
    .instance-main { min-width: 0; display: grid; gap: 9px; }
    .instance-top { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
    .instance-identity { min-width: 0; display: grid; gap: 3px; }
    .instance-title { font-size: 15px; font-weight: 700; overflow-wrap: anywhere; }
    .instance-mode { color: var(--muted); font-size: 12px; }
    .instance-status { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
    .instance-url-line { min-width: 0; }
    .instance-url { color: var(--vscode-textLink-foreground); text-decoration: none; overflow-wrap: anywhere; }
    .instance-url:hover { text-decoration: underline; }
    .instance-subtle { color: var(--muted); font-size: 12px; }
    .instance-foot { display: flex; justify-content: space-between; gap: 10px; align-items: center; border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent); padding-top: 10px; }
    .instance-hint { color: var(--muted); font-size: 12px; }
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
    .badge {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 11px;
      color: var(--muted);
      overflow-wrap: anywhere;
    }
    .badge.active { color: var(--vscode-button-foreground); background: var(--accent); border-color: var(--accent); }
    .badge.ready { color: var(--vscode-testing-iconPassed, var(--vscode-foreground)); border-color: color-mix(in srgb, var(--vscode-testing-iconPassed, var(--vscode-foreground)) 55%, var(--border)); }
    .badge.stopped { color: var(--vscode-testing-iconSkipped, var(--muted)); }
    .badge.warning { color: var(--vscode-editorWarning-foreground, var(--vscode-foreground)); border-color: color-mix(in srgb, var(--vscode-editorWarning-foreground, var(--vscode-foreground)) 55%, var(--border)); }
    .badge.error { color: var(--vscode-errorForeground); border-color: color-mix(in srgb, var(--vscode-errorForeground) 55%, var(--border)); }
    .field-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: end; }
    .credential-row { display: grid; grid-template-columns: 92px minmax(0, 1fr) auto; gap: 8px; align-items: center; }
    .credential-value {
      min-height: 34px;
      display: flex;
      align-items: center;
      padding: 6px 10px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--vscode-input-background);
      overflow-wrap: anywhere;
    }
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
    button.icon-button {
      width: 34px;
      min-height: 34px;
      padding: 0;
      display: inline-grid;
      place-items: center;
    }
    button.icon-button svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }
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
    .about-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .about-card { border: 1px solid var(--border); border-radius: 10px; padding: 14px; background: var(--soft); display: grid; gap: 8px; }
    @media (max-width: 860px) {
      .settings-shell, header, .grid, .form-grid, .field-row, .credential-row { grid-template-columns: 1fr; }
      .sidebar { border-right: 0; border-bottom: 1px solid var(--border); grid-template-columns: repeat(3, 1fr); }
      .sidebar-title { grid-column: 1 / -1; }
      .instance-top, .instance-foot { display: grid; grid-template-columns: 1fr; }
      .instance-status { justify-content: flex-start; }
      .provider-row { grid-template-columns: 1fr; }
      .provider-actions { justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <div class="settings-shell">
    <nav class="sidebar" aria-label="n8n settings sections">
      <div class="sidebar-title">Settings</div>
      <button class="tab-button active" data-tab="n8n-instances" type="button">n8n Instances</button>
      <button class="tab-button" data-tab="agent-providers" type="button">Agent Providers</button>
      <button class="tab-button" data-tab="about" type="button">About</button>
    </nav>

    <div class="page">
      <header>
        <div>
          <h1>n8n-as-code settings</h1>
          <p class="muted">Manage n8n instances, agent providers, and extension information from one place.</p>
        </div>
        <button id="refresh" class="secondary">Refresh</button>
      </header>

      <section id="tab-n8n-instances" class="tab-panel active">
        <div class="grid">
          <section class="panel">
            <div class="panel-head">
              <div>
                <h2>n8n instances</h2>
                <p class="muted">Click a card to connect this workspace to that instance. The active workspace instance is highlighted.</p>
              </div>
              <button id="addInstance">Add instance</button>
            </div>
            <div id="instanceList" class="instances"></div>
          </section>

          <section class="panel">
            <div>
              <h2>Workspace settings</h2>
              <p class="muted">Folder and project stay scoped to this workspace.</p>
            </div>
            <label>
              Sync folder
              <input id="workspaceSync" type="text" placeholder="Use workspace default: workflows" />
            </label>
            <div class="field-row">
              <label>
                Project
                <select id="workspaceProject" disabled><option value="">Load projects from effective instance</option></select>
              </label>
              <button id="loadProjects" class="secondary">Load projects</button>
            </div>
            <div class="toolbar">
              <button id="saveWorkspace">Save settings</button>
              <button id="clearWorkspaceSettings" class="secondary">Clear folder/project</button>
            </div>
          </section>
        </div>
      </section>

      <section id="tab-agent-providers" class="tab-panel">
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>Agent providers</h2>
              <p class="muted">Connect API and OAuth providers, then select provider/model for chat sessions.</p>
            </div>
            <button id="providerSelectModel" class="secondary">Select Provider / Model</button>
          </div>
          <div>
            <h3>Connected providers</h3>
            <div id="connectedProviders" class="providers"></div>
          </div>
          <div>
            <h3>Available providers</h3>
            <div id="availableProviders" class="providers"></div>
          </div>
        </section>
      </section>

      <section id="tab-about" class="tab-panel">
        <section class="panel">
          <div>
            <h2>About n8n-as-code</h2>
            <p class="muted">Edit and sync n8n workflows from VS Code with embedded agent assistance.</p>
          </div>
          <div id="aboutGrid" class="about-grid"></div>
        </section>
      </section>

      <div id="error" class="message error"></div>
      <div id="saved" class="message ok">Saved.</div>
    </div>
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

  <div id="connectModal" class="modal-backdrop hidden">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="connectTitle">
      <div class="modal-head">
        <div>
          <h2 id="connectTitle">Connect workspace</h2>
          <p class="muted" id="connectDescription">Connect this workspace to the selected n8n instance.</p>
        </div>
        <button id="closeConnectModal" class="secondary">Close</button>
      </div>
      <div class="modal-body">
        <p id="connectText">Connect this workspace to this n8n instance?</p>
      </div>
      <div class="modal-foot">
        <button id="cancelConnect" class="secondary">Cancel</button>
        <button id="confirmConnect">Connect workspace</button>
      </div>
    </div>
  </div>

  <div id="credentialsModal" class="modal-backdrop hidden">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="credentialsTitle">
      <div class="modal-head">
        <div>
          <h2 id="credentialsTitle">Managed instance credentials</h2>
          <p class="muted">Values are masked in the UI. Use copy when you need to log in manually.</p>
        </div>
        <button id="closeCredentialsModal" class="secondary icon-button" aria-label="Close credentials">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.72 3 3 3.72 7.28 8 3 12.28l.72.72L8 8.72 12.28 13l.72-.72L8.72 8 13 3.72 12.28 3 8 7.28 3.72 3z" /></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="credential-row">
          <strong>Username</strong>
          <div id="credentialUsername" class="credential-value">-</div>
          <button id="copyCredentialUsername" class="secondary icon-button" aria-label="Copy username">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm0 1v8h7V5H4zm2-3h7a1 1 0 0 1 1 1v8h-1V3H6V2z" /></svg>
          </button>
        </div>
        <div class="credential-row">
          <strong>Password</strong>
          <div id="credentialPassword" class="credential-value">••••••••••••</div>
          <button id="copyCredentialPassword" class="secondary icon-button" aria-label="Copy password">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm0 1v8h7V5H4zm2-3h7a1 1 0 0 1 1 1v8h-1V3H6V2z" /></svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const els = {
      refresh: document.getElementById('refresh'),
      addInstance: document.getElementById('addInstance'),
      instanceList: document.getElementById('instanceList'),
      workspaceSync: document.getElementById('workspaceSync'),
      workspaceProject: document.getElementById('workspaceProject'),
      loadProjects: document.getElementById('loadProjects'),
      saveWorkspace: document.getElementById('saveWorkspace'),
      clearWorkspaceSettings: document.getElementById('clearWorkspaceSettings'),
      error: document.getElementById('error'),
      saved: document.getElementById('saved'),
      modal: document.getElementById('instanceModal'),
      modalTitle: document.getElementById('modalTitle'),
      modalName: document.getElementById('modalName'),
      modalMode: document.getElementById('modalMode'),
      modalHost: document.getElementById('modalHost'),
      modalApiKey: document.getElementById('modalApiKey'),
      modalTunnel: document.getElementById('modalTunnel'),
      modalHostField: document.getElementById('modalHostField'),
      modalApiKeyField: document.getElementById('modalApiKeyField'),
      modalTunnelField: document.getElementById('modalTunnelField'),
      closeModal: document.getElementById('closeModal'),
      cancelModal: document.getElementById('cancelModal'),
      saveInstance: document.getElementById('saveInstance'),
      connectModal: document.getElementById('connectModal'),
      connectDescription: document.getElementById('connectDescription'),
      connectText: document.getElementById('connectText'),
      closeConnectModal: document.getElementById('closeConnectModal'),
      cancelConnect: document.getElementById('cancelConnect'),
      confirmConnect: document.getElementById('confirmConnect'),
      credentialsModal: document.getElementById('credentialsModal'),
      credentialUsername: document.getElementById('credentialUsername'),
      credentialPassword: document.getElementById('credentialPassword'),
      copyCredentialUsername: document.getElementById('copyCredentialUsername'),
      copyCredentialPassword: document.getElementById('copyCredentialPassword'),
      closeCredentialsModal: document.getElementById('closeCredentialsModal'),
      tabButtons: Array.from(document.querySelectorAll('.tab-button')),
      tabPanels: Array.from(document.querySelectorAll('.tab-panel')),
      connectedProviders: document.getElementById('connectedProviders'),
      availableProviders: document.getElementById('availableProviders'),
      providerSelectModel: document.getElementById('providerSelectModel'),
      aboutGrid: document.getElementById('aboutGrid'),
    };

    let state = { global: { instances: [] }, workspace: {}, effective: undefined, providers: [], about: {} };
    const PERSONAL_PROJECT = { id: 'personal', name: 'Personal', type: 'personal' };
    let projects = [PERSONAL_PROJECT];
    let editingInstanceId = '';
    let workspaceInstanceOverrideId = '';
    let connectingInstanceId = '';
    let credentialValues = { username: '', password: '' };

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
    function providers() {
      return state.providers || [];
    }
    function instanceById(id) {
      return instances().find((instance) => instance.id === id);
    }
    function modeLabel(mode) {
      if (mode === 'managed-local-docker') return 'Managed instance';
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
      const workspace = state.workspace || {};
      const effective = state.effective;
      workspaceInstanceOverrideId = workspace.activeInstanceId || '';
      els.workspaceSync.value = workspace.syncFolder || '';
      renderInstanceList();
      renderProjects(workspace.projectId || effective?.projectId || 'personal');
      renderProviders();
      renderAbout();
    }
    function setActiveTab(tab) {
      for (const button of els.tabButtons) {
        button.classList.toggle('active', button.dataset.tab === tab);
      }
      for (const panel of els.tabPanels) {
        panel.classList.toggle('active', panel.id === 'tab-' + tab);
      }
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
        const isEffective = instance.id === state.effective?.activeInstanceId;
        const canChangeWorkspaceSelection = !isEffective;
        const row = document.createElement('div');
        row.className = 'instance-row' + (canChangeWorkspaceSelection ? ' selectable' : '') + (isEffective ? ' selected' : '');
        row.title = canChangeWorkspaceSelection ? 'Click to update this workspace connection.' : 'This workspace uses this instance.';
        const main = document.createElement('div');
        main.className = 'instance-main';
        const top = document.createElement('div');
        top.className = 'instance-top';
        const identity = document.createElement('div');
        identity.className = 'instance-identity';
        const title = document.createElement('div');
        title.className = 'instance-title';
        title.textContent = instance.name || instance.id;
        const mode = document.createElement('span');
        mode.className = 'instance-mode';
        mode.textContent = modeLabel(instance.mode) || instance.id;
        identity.append(title, mode);
        const status = document.createElement('div');
        status.className = 'instance-status';
        const runtimeBadge = statusBadge(instance);
        if (runtimeBadge) status.appendChild(runtimeBadge);
        if (isEffective) status.appendChild(badge('Workspace instance', 'active'));
        top.append(identity, status);
        const displayUrl = instance.authBridgePublicUrl || instance.displayUrl || (instance.publicUrlEnabled ? '' : instance.host || instance.baseUrl || '');
        const urlLine = document.createElement('div');
        urlLine.className = 'instance-url-line';
        if (displayUrl) {
          const url = document.createElement('a');
          url.className = 'instance-url';
          url.href = '#';
          url.textContent = displayUrl;
          url.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            post('openExternal', { url: displayUrl });
          });
          urlLine.appendChild(url);
        } else if (instance.publicUrlEnabled) {
          const pending = document.createElement('span');
          pending.className = 'instance-subtle';
          pending.textContent = 'Public URL pending';
          const refresh = button('Refresh', 'inline-action', () => post('refreshPublicUrl', { instanceId: instance.id }));
          urlLine.append(pending, document.createTextNode(' '), refresh);
        } else {
          const localOnly = document.createElement('span');
          localOnly.className = 'instance-subtle';
          localOnly.textContent = 'Local access only';
          urlLine.appendChild(localOnly);
        }
        const foot = document.createElement('div');
        foot.className = 'instance-foot';
        const hint = document.createElement('div');
        hint.className = 'instance-hint';
        hint.textContent = isEffective
          ? 'Selected for this workspace'
          : 'Click to select this instance for this workspace';
        const actions = document.createElement('div');
        actions.className = 'toolbar';
        const edit = button('Edit', 'secondary compact', () => openModal(instance));
        const del = button('Delete', 'danger compact', () => {
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
          if (instance.ownerCredentialsAvailable) {
            actions.append(button('Credentials', 'secondary compact', () => post('showManagedCredentials', { instanceId: instance.id })));
          }
        }
        actions.append(edit);
        actions.append(del);
        foot.append(hint, actions);
        main.append(top, urlLine, foot);
        row.addEventListener('click', () => {
          if (canChangeWorkspaceSelection) openConnectModal(instance);
        });
        row.append(main);
        els.instanceList.appendChild(row);
      }
    }
    function badge(text, cls) {
      const el = document.createElement('span');
      el.className = 'badge ' + cls;
      el.textContent = text;
      return el;
    }
    function providerBadge(provider) {
      if (provider.selected) return badge('Selected', 'active');
      if (provider.credentialSource === 'environment') return badge('Environment', 'ready');
      if (provider.credentialSource === 'secret') return badge(provider.authKind === 'oauth-device' ? 'OAuth' : 'Stored', 'ready');
      return badge(provider.authKind, 'stopped');
    }
    function renderProviders() {
      const connected = providers().filter((provider) => provider.connected);
      const available = providers().filter((provider) => !provider.connected);
      renderProviderList(els.connectedProviders, connected, true);
      renderProviderList(els.availableProviders, available, false);
    }
    function renderProviderList(container, list, connected) {
      container.innerHTML = '';
      if (!list.length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = connected ? 'No connected providers yet.' : 'All available providers are connected.';
        container.appendChild(empty);
        return;
      }
      for (const provider of list) {
        const row = document.createElement('div');
        row.className = 'provider-row';
        const main = document.createElement('div');
        main.className = 'provider-main';
        const title = document.createElement('div');
        title.className = 'provider-title';
        const name = document.createElement('span');
        name.textContent = provider.label;
        title.append(name, providerBadge(provider));
        const detail = document.createElement('div');
        detail.className = 'provider-detail';
        const model = provider.selected && provider.model ? ' · Model: ' + provider.model : provider.defaultModel ? ' · Default: ' + provider.defaultModel : '';
        const baseUrl = provider.id === 'openai-compatible' && provider.baseUrl ? ' · ' + provider.baseUrl : '';
        detail.textContent = provider.description + model + baseUrl;
        main.append(title, detail);
        const actions = document.createElement('div');
        actions.className = 'provider-actions';
        if (connected) {
          actions.append(button('Use / Model', 'secondary compact', () => post('selectProviderModel', { provider: provider.id })));
          actions.append(button('Disconnect', 'danger compact', () => post('disconnectProvider', { provider: provider.id })));
        } else {
          actions.append(button('Connect', 'compact', () => post('connectProvider', { provider: provider.id })));
        }
        row.append(main, actions);
        container.appendChild(row);
      }
    }
    function renderAbout() {
      els.aboutGrid.innerHTML = '';
      const cards = [
        ['Extension', state.about?.extensionVersion || 'unknown'],
        ['n8nac dependency', state.about?.cliVersion || 'unknown'],
        ['Workspace', state.effective?.activeInstanceName || state.effective?.activeInstanceId || 'No active n8n instance'],
      ];
      for (const [title, value] of cards) {
        const card = document.createElement('div');
        card.className = 'about-card';
        const h = document.createElement('h2');
        h.textContent = title;
        const p = document.createElement('p');
        p.className = 'muted';
        p.textContent = value;
        card.append(h, p);
        els.aboutGrid.appendChild(card);
      }
    }
    function button(text, cls, onClick) {
      const el = document.createElement('button');
      el.className = cls || '';
      el.textContent = text;
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        onClick(event);
      });
      return el;
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
        opt.dataset.projectName = project.name;
        opt.textContent = project.displayName || project.name;
        opt.title = project.detail || opt.textContent;
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
    function currentWorkspaceInstanceId() {
      return workspaceInstanceOverrideId;
    }
    function openConnectModal(instance) {
      connectingInstanceId = instance?.id || '';
      const name = instance?.name || instance?.id || 'this instance';
      els.connectDescription.textContent = 'This only changes the current workspace connection.';
      els.connectText.textContent = 'Connect this workspace to "' + name + '"?';
      els.confirmConnect.textContent = 'Connect to ' + name;
      els.connectModal.classList.remove('hidden');
    }
    function closeConnectModal() {
      connectingInstanceId = '';
      els.connectModal.classList.add('hidden');
    }
    function applyWorkspaceSelectionOptimistically(instance) {
      if (!instance) return;
      workspaceInstanceOverrideId = instance.id;
      state = {
        ...state,
        workspace: {
          ...(state.workspace || {}),
          activeInstanceId: instance.id,
        },
        effective: {
          ...(state.effective || {}),
          activeInstanceId: instance.id,
          activeInstanceName: instance.name || instance.id,
          host: instance.host || instance.baseUrl || state.effective?.host || '',
          syncFolder: state.effective?.syncFolder || state.workspace?.syncFolder || 'workflows',
          sources: {
            ...(state.effective?.sources || {}),
            instance: 'workspace',
          },
        },
      };
      renderInstanceList();
    }
    function saveWorkspaceContext(activeInstanceId) {
      workspaceInstanceOverrideId = activeInstanceId || '';
      const selectedOption = els.workspaceProject.selectedOptions[0];
      post('saveWorkspaceContext', {
        activeInstanceId,
        syncFolder: els.workspaceSync.value,
        projectId: els.workspaceProject.value,
        projectName: selectedOption?.dataset?.projectName || '',
      });
    }
    function openCredentialsModal(credentials) {
      credentialValues = {
        username: credentials?.username || '',
        password: credentials?.password || '',
      };
      els.credentialUsername.textContent = credentialValues.username || '-';
      els.credentialPassword.textContent = credentialValues.password ? '••••••••••••' : '-';
      els.credentialsModal.classList.remove('hidden');
    }
    function closeCredentialsModal() {
      credentialValues = { username: '', password: '' };
      els.credentialsModal.classList.add('hidden');
    }
    function copyText(value) {
      if (!value) return;
      const copy = navigator.clipboard?.writeText?.(value);
      if (copy) {
        copy.then(showSaved, () => post('copyText', { value }));
      } else {
        post('copyText', { value });
      }
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
    els.tabButtons.forEach((tabButton) => tabButton.addEventListener('click', () => setActiveTab(tabButton.dataset.tab)));
    els.providerSelectModel.addEventListener('click', () => post('selectProviderModel', { provider: providers().find((provider) => provider.selected)?.id || 'openai' }));
    els.addInstance.addEventListener('click', () => openModal(undefined));
    els.closeModal.addEventListener('click', closeModal);
    els.cancelModal.addEventListener('click', closeModal);
    els.closeConnectModal.addEventListener('click', closeConnectModal);
    els.cancelConnect.addEventListener('click', closeConnectModal);
    els.confirmConnect.addEventListener('click', () => {
      if (!connectingInstanceId) return;
      applyWorkspaceSelectionOptimistically(instanceById(connectingInstanceId));
      saveWorkspaceContext(connectingInstanceId);
      closeConnectModal();
    });
    els.closeCredentialsModal.addEventListener('click', closeCredentialsModal);
    els.copyCredentialUsername.addEventListener('click', () => copyText(credentialValues.username));
    els.copyCredentialPassword.addEventListener('click', () => copyText(credentialValues.password));
    els.modalMode.addEventListener('change', renderModalFields);
    els.saveInstance.addEventListener('click', () => {
      post('saveGlobalInstance', {
        instanceId: editingInstanceId,
        instanceName: els.modalName.value,
        mode: els.modalMode.value,
        host: normalizeHost(els.modalHost.value),
        apiKey: els.modalApiKey.value,
        tunnel: els.modalTunnel.value === 'yes',
        setActive: false,
      });
      closeModal();
    });
    els.loadProjects.addEventListener('click', () => {
      post('loadProjects', {
        instanceId: currentWorkspaceInstanceId() || state.global?.activeInstanceId || '',
        projectId: state.workspace?.projectId || state.effective?.projectId || '',
        projectName: state.workspace?.projectName || state.effective?.projectName || '',
      });
    });
    els.saveWorkspace.addEventListener('click', () => saveWorkspaceContext(currentWorkspaceInstanceId()));
    els.clearWorkspaceSettings.addEventListener('click', () => {
      els.workspaceSync.value = '';
      renderProjects('');
      showError('');
      saveWorkspaceContext(currentWorkspaceInstanceId());
    });
    window.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.type === 'init') {
        state = {
          global: message.global || { instances: [] },
          workspace: message.workspace || {},
          effective: message.effective,
          providers: message.providers || [],
          about: message.about || {},
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
      } else if (message.type === 'copied') {
        showSaved();
      } else if (message.type === 'managedCredentials') {
        openCredentialsModal(message.credentials);
      } else if (message.type === 'error') {
        showError(message.message || 'Unexpected error');
      } else if (message.type === 'instanceDeleted') {
        showSaved();
      } else if (message.type === 'activeTab') {
        setActiveTab(message.tab || 'n8n-instances');
      }
    });
  </script>
</body>
</html>`;
}
