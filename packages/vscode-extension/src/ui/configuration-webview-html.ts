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
    .toolbar.nowrap { flex-wrap: nowrap; align-items: center; }
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
    button.icon-button.danger {
      border-color: color-mix(in srgb, var(--vscode-errorForeground) 45%, var(--border));
      color: var(--vscode-errorForeground);
      background: transparent;
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
    .modal-backdrop.modal-over-environment { z-index: 20; }
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
    #saved {
      display: block;
      visibility: hidden;
      min-height: 18px;
      border: 0;
      border-radius: 0;
      padding: 0;
    }
    #saved.visible { visibility: visible; }
    .message.error { color: var(--vscode-errorForeground); }
    .message.ok { color: var(--vscode-testing-iconPassed, var(--vscode-foreground)); }
    .message.warning { display: block; color: var(--vscode-editorWarning-foreground, var(--vscode-foreground)); }
    .form-note {
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 9px 10px;
      background: var(--vscode-input-background);
      color: var(--muted);
      line-height: 1.4;
    }
    .form-note.warning { color: var(--vscode-editorWarning-foreground, var(--vscode-foreground)); }
    .form-note.error { color: var(--vscode-errorForeground); }
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
      <button class="tab-button active" data-tab="n8n-instances" type="button">n8n environments</button>
      <button class="tab-button" data-tab="agent-providers" type="button">Agent Providers</button>
      <button class="tab-button" data-tab="about" type="button">About</button>
    </nav>

    <div class="page">
      <header>
        <div>
          <h1>n8n-as-code settings</h1>
          <p class="muted">Manage workspace environments, local managed instances, and agent providers.</p>
        </div>
        <div class="toolbar">
          <button id="openManagedInstances">Mes instances managées</button>
          <button id="refresh" class="secondary">Refresh</button>
        </div>
      </header>

      <section id="tab-n8n-instances" class="tab-panel active">
        <div class="grid">
          <section class="panel">
            <div class="panel-head">
              <div>
                <h2>n8n environments</h2>
                <p class="muted">n8n environments are the shared source of truth for this project.</p>
              </div>
              <div class="toolbar">
                <button id="addEnvironment" class="icon-button" type="button" aria-label="Add environment">+</button>
              </div>
            </div>
            <div id="legacyMigrationNotice" class="message warning hidden">
              <strong>Legacy n8n-as-code config detected.</strong>
              <div id="legacyMigrationText" class="muted"></div>
              <div class="toolbar">
                <button id="migrateLegacyWorkspace" type="button">Migrate workspace</button>
              </div>
            </div>
            <div id="environmentList" class="instances"></div>

            <div class="hidden" aria-hidden="true">
            <div>
              <h2>Workspace settings</h2>
              <p class="muted">Folder and project stay scoped to this workspace.</p>
            </div>
            <label id="legacyWorkspaceSyncField">
              Sync folder
              <input id="workspaceSync" type="text" placeholder="Use workspace default: workflows" />
            </label>
            <div id="legacyWorkspaceProjectRow" class="field-row">
              <label>
                Project
                <select id="workspaceProject" disabled><option value="">Load projects from effective instance</option></select>
              </label>
              <button id="loadProjects" class="secondary">Load projects</button>
            </div>
            <div id="legacyWorkspaceActions" class="toolbar">
              <button id="saveWorkspace">Save settings</button>
              <button id="clearWorkspaceSettings" class="secondary">Clear folder/project</button>
            </div>
              <h3>Workspace instance targets</h3>
              <p class="muted">Targets are tracked workspace endpoints. Global refs point to machine-owned n8n-manager instances; embedded targets store only a public URL.</p>
              <div id="targetList" class="instances"></div>
              <input id="targetName" type="text" />
              <select id="targetKind">
                <option value="global-ref">Global n8n-manager instance</option>
                <option value="embedded">Embedded public URL</option>
              </select>
              <select id="targetGlobalInstance"></select>
              <input id="targetBaseUrl" type="text" />
              <button id="saveTarget">Save target</button>
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

  <div id="managedInstancesModal" class="modal-backdrop hidden">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="managedInstancesTitle">
      <div class="modal-head">
        <div>
          <h2 id="managedInstancesTitle">Mes instances managées</h2>
          <p class="muted">Instances locales gérées par n8n-manager. Elles peuvent être utilisées lors de la création d'un environment.</p>
        </div>
        <button id="closeManagedInstances" class="secondary icon-button" aria-label="Close managed instances">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.72 3 3 3.72 7.28 8 3 12.28l.72.72L8 8.72 12.28 13l.72-.72L8.72 8 13 3.72 12.28 3 8 7.28 3.72 3z" /></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="panel-head">
          <div>
            <h3>Managed local instances</h3>
            <p class="muted">Ces instances restent locales à cette machine.</p>
          </div>
          <button id="addInstance"><span aria-hidden="true">+</span> Create local instance</button>
        </div>
        <div id="instanceList" class="instances"></div>
      </div>
    </div>
  </div>

  <div id="instanceModal" class="modal-backdrop hidden">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-head">
        <div>
          <h2 id="modalTitle">Managed instance</h2>
          <p class="muted">Create a local n8n instance managed on this machine.</p>
        </div>
        <button id="closeModal" class="secondary icon-button" aria-label="Close instance form">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.72 3 3 3.72 7.28 8 3 12.28l.72.72L8 8.72 12.28 13l.72-.72L8.72 8 13 3.72 12.28 3 8 7.28 3.72 3z" /></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <label class="full">
            Name
            <input id="modalName" type="text" placeholder="Production" />
          </label>
          <label class="hidden" aria-hidden="true">
            Type
            <select id="modalMode">
              <option value="managed-local-docker">Create an instance for me (Require Docker)</option>
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

  <div id="environmentModal" class="modal-backdrop hidden">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="environmentModalTitle">
      <div class="modal-head">
        <div>
          <h2 id="environmentModalTitle">n8n environment</h2>
          <p class="muted">Create one workspace environment from an instance, project, and sync folder.</p>
        </div>
        <div class="toolbar nowrap">
          <button id="manageInstancesFromEnvironment" class="secondary"><span aria-hidden="true">+</span> Create local instance</button>
          <button id="closeEnvironmentModal" class="secondary icon-button" aria-label="Close environment form">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.72 3 3 3.72 7.28 8 3 12.28l.72.72L8 8.72 12.28 13l.72-.72L8.72 8 13 3.72 12.28 3 8 7.28 3.72 3z" /></svg>
          </button>
        </div>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <label class="full environment-step-connection">
            Environment name
            <input id="environmentName" type="text" placeholder="Dev" />
          </label>
          <label id="environmentInstanceField" class="full environment-step-connection">
            Instance
            <select id="environmentInstance"></select>
          </label>
          <label id="environmentRemoteUrlField" class="full environment-step-connection">
            URL
            <input id="environmentRemoteUrl" type="text" placeholder="https://my-instance.app.n8n.cloud" />
          </label>
          <label id="environmentApiKeyField" class="full environment-step-connection">
            API key
            <input id="environmentApiKey" type="password" placeholder="Leave empty if already stored locally" />
          </label>
          <p id="environmentConnectionStatus" class="form-note full environment-step-connection hidden"></p>
          <button id="loadEnvironmentProjects" class="secondary full environment-step-connection" type="button">Next</button>
          <div id="environmentProjectRow" class="field-row full environment-step-settings">
          <label>
            Project
            <select id="environmentProject"></select>
          </label>
          </div>
          <label id="environmentSyncField" class="full environment-step-settings">
            Sync root folder
            <input id="environmentSync" type="text" placeholder="workflows" />
          </label>
        </div>
      </div>
      <div class="modal-foot">
        <button id="cancelEnvironmentModal" class="secondary">Cancel</button>
        <button id="environmentBack" class="secondary" type="button">Back</button>
        <button id="saveEnvironment">Save environment</button>
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
        <button id="closeConnectModal" class="secondary icon-button" aria-label="Close connect dialog">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.72 3 3 3.72 7.28 8 3 12.28l.72.72L8 8.72 12.28 13l.72-.72L8.72 8 13 3.72 12.28 3 8 7.28 3.72 3z" /></svg>
        </button>
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
      openManagedInstances: document.getElementById('openManagedInstances'),
      managedInstancesModal: document.getElementById('managedInstancesModal'),
      closeManagedInstances: document.getElementById('closeManagedInstances'),
      addInstance: document.getElementById('addInstance'),
      instanceList: document.getElementById('instanceList'),
      workspaceSync: document.getElementById('workspaceSync'),
      workspaceProject: document.getElementById('workspaceProject'),
      loadProjects: document.getElementById('loadProjects'),
      saveWorkspace: document.getElementById('saveWorkspace'),
      clearWorkspaceSettings: document.getElementById('clearWorkspaceSettings'),
      legacyWorkspaceSyncField: document.getElementById('legacyWorkspaceSyncField'),
      legacyWorkspaceProjectRow: document.getElementById('legacyWorkspaceProjectRow'),
      legacyWorkspaceActions: document.getElementById('legacyWorkspaceActions'),
      targetList: document.getElementById('targetList'),
      targetName: document.getElementById('targetName'),
      targetKind: document.getElementById('targetKind'),
      targetGlobalInstance: document.getElementById('targetGlobalInstance'),
      targetBaseUrl: document.getElementById('targetBaseUrl'),
      saveTarget: document.getElementById('saveTarget'),
      addEnvironment: document.getElementById('addEnvironment'),
      legacyMigrationNotice: document.getElementById('legacyMigrationNotice'),
      legacyMigrationText: document.getElementById('legacyMigrationText'),
      migrateLegacyWorkspace: document.getElementById('migrateLegacyWorkspace'),
      environmentList: document.getElementById('environmentList'),
      environmentModal: document.getElementById('environmentModal'),
      environmentModalTitle: document.getElementById('environmentModalTitle'),
      closeEnvironmentModal: document.getElementById('closeEnvironmentModal'),
      cancelEnvironmentModal: document.getElementById('cancelEnvironmentModal'),
      environmentName: document.getElementById('environmentName'),
      environmentInstanceField: document.getElementById('environmentInstanceField'),
      environmentInstance: document.getElementById('environmentInstance'),
      environmentRemoteUrlField: document.getElementById('environmentRemoteUrlField'),
      environmentRemoteUrl: document.getElementById('environmentRemoteUrl'),
      environmentApiKeyField: document.getElementById('environmentApiKeyField'),
      environmentApiKey: document.getElementById('environmentApiKey'),
      environmentConnectionStatus: document.getElementById('environmentConnectionStatus'),
      environmentProjectRow: document.getElementById('environmentProjectRow'),
      environmentProject: document.getElementById('environmentProject'),
      loadEnvironmentProjects: document.getElementById('loadEnvironmentProjects'),
      environmentSyncField: document.getElementById('environmentSyncField'),
      environmentSync: document.getElementById('environmentSync'),
      manageInstancesFromEnvironment: document.getElementById('manageInstancesFromEnvironment'),
      environmentBack: document.getElementById('environmentBack'),
      saveEnvironment: document.getElementById('saveEnvironment'),
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
    let workspaceProjects = [PERSONAL_PROJECT];
    let environmentProjects = [PERSONAL_PROJECT];
    let projectRequestSeq = 0;
    let latestWorkspaceProjectRequestId = 0;
    let latestEnvironmentProjectRequestId = 0;
    let environmentConnectionReady = false;
    let environmentProjectsAvailable = false;
    let environmentFormStep = 'connection';
    let environmentValidating = false;
    let editingInstanceId = '';
    let editingTargetId = '';
    let editingEnvironmentId = '';
    let workspaceInstanceOverrideId = '';
    let connectingInstanceId = '';
    let credentialValues = { username: '', password: '' };

    function showError(message) {
      els.error.style.display = message ? 'block' : 'none';
      els.error.textContent = message || '';
    }
    function showSaved(message) {
      els.saved.textContent = message || 'Saved.';
      els.saved.classList.add('visible');
      setTimeout(() => { els.saved.classList.remove('visible'); }, 1300);
    }
    function normalizeHost(host) {
      const trimmed = String(host || '').trim();
      return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
    }
    function instances() {
      return state.global?.instances || [];
    }
    function managedInstances() {
      return instances().filter((instance) => instance.mode === 'managed-local-docker');
    }
    function remoteInstances() {
      return instances().filter((instance) => instance.mode === 'existing');
    }
    function providers() {
      return state.providers || [];
    }
    function targets() {
      return state.workspace?.instanceTargets || [];
    }
    function environments() {
      return state.workspace?.environments || [];
    }
    function instanceById(id) {
      return instances().find((instance) => instance.id === id);
    }
    function slug(value) {
      return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'env';
    }
    function syncRootFromFolder(value) {
      let normalized = String(value || '').trim().split('\\\\').join('/');
      while (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
      if (!normalized) return 'workflows';
      const parts = normalized.split('/').filter(Boolean);
      if (parts.length <= 2) return normalized;
      return parts.slice(0, -2).join('/') || 'workflows';
    }
    function projectOptionLabel(project) {
      const label = String(project.displayName || project.name || '').trim();
      if (label && label !== project.id) return label;
      if (project.id === 'personal' || project.type === 'personal') return 'Personal';
      return 'Unnamed project';
    }
    function fallbackProjectLabel(projectId, projectName) {
      const id = String(projectId || '').trim();
      const name = String(projectName || '').trim();
      if (name && name !== id) return name;
      if (id === 'personal') return 'Personal';
      return 'Selected project';
    }
    function normalizeProjectSelection(projectList, selectedId, selectedName) {
      const byId = new Map();
      for (const project of projectList.length ? projectList : [PERSONAL_PROJECT]) {
        if (!project?.id) continue;
        const existing = byId.get(project.id);
        if (!existing || (!existing.name && project.name) || existing.id === 'personal') {
          byId.set(project.id, project);
        }
      }
      const personalProjects = Array.from(byId.values()).filter((project) => project.id === 'personal' || project.type === 'personal');
      if (personalProjects.length > 1) {
        const preferred = personalProjects.find((project) => project.id !== 'personal') || personalProjects[0];
        for (const project of personalProjects) {
          if (project.id !== preferred.id) byId.delete(project.id);
        }
      }
      const projects = Array.from(byId.values());
      let value = selectedId || projects[0]?.id || '';
      if (selectedId === 'personal' && !projects.some((project) => project.id === selectedId)) {
        value = projects.find((project) => project.type === 'personal')?.id || selectedId;
      }
      if (value && !projects.some((project) => project.id === value)) {
        const matchingName = projects.find((project) => projectOptionLabel(project) === fallbackProjectLabel(selectedId, selectedName));
        if (matchingName) value = matchingName.id;
      }
      return { projects, value };
    }
    function isFallbackPersonalProjectList(projectList) {
      return projectList.length === 1 && projectList[0]?.id === 'personal' && projectList[0]?.type === 'personal';
    }
    function environmentConnectionCandidate() {
      const selected = selectedEnvironmentInstance();
      const typedHost = normalizeHost(els.environmentRemoteUrl.value);
      const selectedHost = normalizeHost(selected.baseUrl || '');
      const host = typedHost || selectedHost;
      const typedApiKey = els.environmentApiKey.value.trim();
      const typedHostReplacesStored = Boolean(typedHost && selectedHost && typedHost !== selectedHost);
      const needsApiKey = selected.mode === 'remote' && (
        selected.source === 'manual' || typedHostReplacesStored || (!selected.apiKeyAvailable && !typedApiKey)
      );
      const canValidate = selected.mode === 'managed' || Boolean(host && (!needsApiKey || typedApiKey));
      const shouldSendTypedCredentials = selected.source === 'manual' || Boolean(typedHost || typedApiKey);
      return { selected, typedHost, selectedHost, host, typedApiKey, needsApiKey, canValidate, shouldSendTypedCredentials };
    }
    function setEnvironmentConnectionState(connected, message, options = {}) {
      environmentConnectionReady = connected;
      environmentProjectsAvailable = Boolean(options.projectsAvailable);
      environmentValidating = Boolean(options.validating);
      environmentFormStep = options.step || (connected && options.advance ? 'settings' : connected ? environmentFormStep : 'connection');
      const isSettingsStep = environmentFormStep === 'settings';
      const selected = selectedEnvironmentInstance();
      const isManaged = selected.mode === 'managed';
      document.querySelectorAll('.environment-step-connection').forEach((el) => el.classList.toggle('hidden', isSettingsStep));
      document.querySelectorAll('.environment-step-settings').forEach((el) => el.classList.toggle('hidden', !isSettingsStep));
      els.environmentInstanceField.classList.toggle('hidden', isSettingsStep || Boolean(editingEnvironmentId));
      els.environmentRemoteUrlField.classList.toggle('hidden', isSettingsStep || isManaged);
      els.environmentApiKeyField.classList.toggle('hidden', isSettingsStep || isManaged);
      const hasMessage = Boolean(message);
      els.environmentConnectionStatus.classList.toggle('hidden', !hasMessage);
      els.environmentConnectionStatus.classList.toggle('error', !connected && hasMessage);
      els.environmentConnectionStatus.classList.toggle('warning', connected && hasMessage);
      els.environmentConnectionStatus.textContent = message || '';
      els.environmentProjectRow.classList.toggle('hidden', !isSettingsStep || !connected || !environmentProjectsAvailable);
      els.environmentProject.disabled = !connected || !environmentProjectsAvailable;
      els.loadEnvironmentProjects.textContent = environmentValidating ? 'Validating...' : 'Next';
      els.loadEnvironmentProjects.disabled = environmentValidating || !environmentConnectionCandidate().canValidate;
      els.environmentSync.disabled = !connected;
      els.environmentBack.classList.toggle('hidden', !isSettingsStep);
      els.saveEnvironment.classList.toggle('hidden', !isSettingsStep);
      els.saveEnvironment.disabled = !isSettingsStep || !connected;
    }
    function environmentInstanceChoices() {
      const choices = [{
        value: 'manual:remote',
        source: 'manual',
        id: '',
        mode: 'remote',
        label: 'Enter URL and API key',
        detail: '',
        apiKeyAvailable: false,
        accessStatus: 'manual',
      }];
      const embeddedUrls = new Set();
      for (const target of targets()) {
        if (target.kind === 'embedded' && target.instance?.baseUrl) embeddedUrls.add(normalizeHost(target.instance.baseUrl));
        const linkedInstance = target.kind === 'global-ref' ? instanceById(target.instanceRef) : undefined;
        const isManagedTarget = target.kind === 'global-ref' && linkedInstance?.mode === 'managed-local-docker';
        choices.push({
          value: 'target:' + target.id,
          source: 'target',
          id: target.id,
          mode: isManagedTarget ? 'managed' : 'remote',
          baseUrl: target.kind === 'embedded' ? target.instance?.baseUrl : linkedInstance?.baseUrl || linkedInstance?.host || '',
          label: target.instanceName || target.name || target.id,
          detail: isManagedTarget ? 'managed local instance' : target.kind === 'embedded' ? target.instance?.baseUrl : linkedInstance?.baseUrl || 'local instance missing',
          apiKeyAvailable: Boolean(target.apiKeyAvailable),
          accessStatus: target.accessStatus || (target.apiKeyAvailable ? 'unknown' : 'missing-api-key'),
        });
      }
      for (const instance of managedInstances()) {
        choices.push({
          value: 'global:' + instance.id,
          source: 'global',
          id: instance.id,
          mode: 'managed',
          label: instance.name || instance.id,
          detail: 'managed local instance',
          apiKeyAvailable: Boolean(instance.apiKeyAvailable),
          accessStatus: instance.accessStatus || (instance.apiKeyAvailable ? 'unknown' : 'missing-api-key'),
        });
      }
      for (const instance of remoteInstances()) {
        const baseUrl = normalizeHost(instance.host || instance.baseUrl || '');
        if (!baseUrl || embeddedUrls.has(baseUrl)) continue;
        choices.push({
          value: 'global:' + instance.id,
          source: 'global',
          id: instance.id,
          mode: 'remote',
          baseUrl,
          label: instance.name || instance.id,
          detail: baseUrl,
          apiKeyAvailable: Boolean(instance.apiKeyAvailable),
          accessStatus: instance.accessStatus || (instance.apiKeyAvailable ? 'unknown' : 'missing-api-key'),
        });
      }
      choices.push({
        value: 'action:create-local',
        source: 'action',
        id: 'create-local',
        mode: 'action',
        label: 'Créer une instance local',
        detail: '',
      });
      return choices;
    }
    function selectedEnvironmentInstance() {
      const option = els.environmentInstance.selectedOptions[0];
      return {
        source: option?.dataset.source || '',
        id: option?.dataset.id || '',
        mode: option?.dataset.mode || '',
        baseUrl: option?.dataset.baseUrl || '',
        apiKeyAvailable: option?.dataset.apiKeyAvailable === 'true',
        accessStatus: option?.dataset.accessStatus || '',
      };
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
    function accessBadge(item) {
      const status = item?.accessStatus || (item?.apiKeyAvailable ? 'unknown' : 'missing-api-key');
      if (status === 'ready') return badge('Ready', 'ready');
      if (status === 'missing-api-key') return badge('Missing API key', 'warning');
      if (status === 'invalid-api-key') return badge('Invalid API key', 'error');
      if (status === 'project-inaccessible') return badge('Project inaccessible', 'error');
      if (status === 'insufficient-workflow-permissions') return badge('Insufficient permissions', 'error');
      if (status === 'runtime-unavailable') return badge('Runtime unavailable', 'error');
      if (item?.apiKeyAvailable) return badge('Access configured', 'ready');
      return badge('Access unknown', 'warning');
    }
    function credentialBadge(item) {
      if (item?.credentialSource === 'env') return badge('API key: env', 'ready');
      if (item?.credentialSource === 'workspace-local') return badge('API key: local', 'ready');
      if (item?.credentialSource === 'global') return badge('API key: global', 'ready');
      return undefined;
    }
    function render() {
      const workspace = state.workspace || {};
      const effective = state.effective;
      const isEnvironmentWorkspace = workspace.version === 4;
      workspaceInstanceOverrideId = workspace.activeInstanceId || '';
      els.workspaceSync.value = workspace.syncFolder || '';
      els.legacyWorkspaceSyncField.classList.toggle('hidden', isEnvironmentWorkspace);
      els.legacyWorkspaceProjectRow.classList.toggle('hidden', isEnvironmentWorkspace);
      els.legacyWorkspaceActions.classList.toggle('hidden', isEnvironmentWorkspace);
      els.workspaceSync.disabled = isEnvironmentWorkspace;
      els.saveWorkspace.disabled = isEnvironmentWorkspace;
      els.clearWorkspaceSettings.disabled = isEnvironmentWorkspace;
      renderTargetControls();
      renderTargetList();
      renderEnvironmentControls();
      renderLegacyMigrationNotice();
      renderEnvironmentList();
      renderInstanceList();
      renderProjects(workspace.projectId || effective?.projectId || 'personal', workspace.projectName || effective?.projectName || '');
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
      els.openManagedInstances.classList.toggle('hidden', tab !== 'n8n-instances');
    }
    function renderLegacyMigrationNotice() {
      const legacy = state.legacyMigration;
      els.legacyMigrationNotice.classList.toggle('hidden', !legacy);
      els.addEnvironment.disabled = Boolean(legacy);
      if (!legacy) return;
      const version = legacy.version ? 'v' + legacy.version : 'legacy';
      els.legacyMigrationText.textContent = 'This workspace uses an old ' + version + ' config at ' + legacy.configPath + '. Migration creates a backup, then converts it to n8n environments.';
    }
    function renderInstanceList() {
      els.instanceList.innerHTML = '';
      const list = managedInstances();
      if (!list.length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'No managed local instances yet.';
        els.instanceList.appendChild(empty);
        return;
      }
      for (const instance of list) {
        const isEffective = instance.id === state.effective?.activeInstanceId;
        const row = document.createElement('div');
        row.className = 'instance-row' + (isEffective ? ' selected' : '');
        row.title = 'Managed local instance.';
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
        hint.textContent = 'Local managed instance for environments';
        const actions = document.createElement('div');
        actions.className = 'toolbar';
        const edit = button('Edit', 'secondary compact', () => openModal(instance));
        const addEnvironment = button('Add environment', 'secondary compact', () => {
          const existingTarget = targets().find((target) => target.kind === 'global-ref' && target.instanceRef === instance.id);
          editEnvironment(undefined, existingTarget ? 'target:' + existingTarget.id : 'global:' + instance.id);
        });
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
        actions.append(addEnvironment);
        actions.append(edit);
        actions.append(del);
        foot.append(hint, actions);
        main.append(top, urlLine, foot);
        row.append(main);
        els.instanceList.appendChild(row);
      }
    }
    function renderTargetControls() {
      els.targetGlobalInstance.innerHTML = '';
      for (const instance of instances()) {
        const opt = document.createElement('option');
        opt.value = instance.id;
        opt.textContent = instance.name || instance.id;
        els.targetGlobalInstance.appendChild(opt);
      }
      renderTargetKindFields();
    }
    function renderTargetKindFields() {
      const embedded = els.targetKind.value === 'embedded';
      const globalField = els.targetGlobalInstance.closest('label');
      const baseUrlField = els.targetBaseUrl.closest('label');
      if (globalField) globalField.style.display = embedded ? 'none' : 'grid';
      if (baseUrlField) baseUrlField.style.display = embedded ? 'grid' : 'none';
    }
    function renderTargetList() {
      els.targetList.innerHTML = '';
      if (!targets().length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'No workspace instance targets yet.';
        els.targetList.appendChild(empty);
        return;
      }
      for (const target of targets()) {
        const row = document.createElement('div');
        row.className = 'instance-row';
        const main = document.createElement('div');
        main.className = 'instance-main';
        const top = document.createElement('div');
        top.className = 'instance-top';
        const identity = document.createElement('div');
        identity.className = 'instance-identity';
        const title = document.createElement('div');
        title.className = 'instance-title';
        title.textContent = target.name || target.id;
        const detail = document.createElement('div');
        detail.className = 'instance-mode';
        detail.textContent = target.kind === 'global-ref' ? 'Global ref: ' + target.instanceRef : 'Embedded URL: ' + target.instance?.baseUrl;
        identity.append(title, detail);
        const status = document.createElement('div');
        status.className = 'instance-status';
        status.appendChild(badge(target.kind, target.kind === 'embedded' ? 'warning' : 'ready'));
        status.appendChild(accessBadge(target));
        const targetCredential = credentialBadge(target);
        if (targetCredential) status.appendChild(targetCredential);
        top.append(identity, status);
        const actions = document.createElement('div');
        actions.className = 'toolbar';
        actions.append(button('Edit', 'secondary compact', () => editTarget(target)));
        actions.append(button('Remove', 'danger compact', () => post('deleteInstanceTarget', { targetId: target.id })));
        main.append(top, actions);
        row.append(main);
        els.targetList.appendChild(row);
      }
    }
    function renderEnvironmentControls() {
      els.environmentInstance.innerHTML = '';
      const choices = environmentInstanceChoices();
      if (!choices.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Create or add an instance first';
        els.environmentInstance.appendChild(opt);
        els.environmentInstance.disabled = Boolean(editingEnvironmentId);
        return;
      }
      for (const choice of choices) {
        const opt = document.createElement('option');
        opt.value = choice.value;
        opt.dataset.source = choice.source;
        opt.dataset.id = choice.id;
        opt.dataset.mode = choice.mode || '';
        opt.dataset.baseUrl = choice.baseUrl || '';
        opt.dataset.apiKeyAvailable = choice.apiKeyAvailable ? 'true' : 'false';
        opt.dataset.accessStatus = choice.accessStatus || '';
        opt.textContent = choice.detail ? choice.label + ' (' + choice.detail + ')' : choice.label;
        els.environmentInstance.appendChild(opt);
      }
      els.environmentInstance.disabled = Boolean(editingEnvironmentId);
    }
    function renderEnvironmentList() {
      els.environmentList.innerHTML = '';
      if (state.legacyMigration) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'Migrate this workspace before creating or editing n8n environments.';
        els.environmentList.appendChild(empty);
        return;
      }
      if (!environments().length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'No workspace environments yet.';
        els.environmentList.appendChild(empty);
        return;
      }
      for (const env of environments()) {
        const row = document.createElement('div');
        const active = env.id === state.workspace?.activeEnvironmentId;
        row.className = 'instance-row selectable' + (active ? ' selected' : '');
        row.title = active ? 'Selected for workspace' : 'Select for workspace';
        row.addEventListener('click', () => {
          if (!active) post('pinEnvironment', { environmentId: env.id });
        });
        const main = document.createElement('div');
        main.className = 'instance-main';
        const top = document.createElement('div');
        top.className = 'instance-top';
        const identity = document.createElement('div');
        identity.className = 'instance-identity';
        const title = document.createElement('div');
        title.className = 'instance-title';
        title.textContent = env.name || env.id;
        const target = targets().find((item) => item.id === env.instanceTargetId);
        const detail = document.createElement('div');
        detail.className = 'instance-mode';
        const instanceLabel = env.instanceName || target?.instanceName || target?.name || env.instanceTargetId;
        const projectLabel = env.projectName || env.projectId || 'Default project';
        detail.textContent = '(' + [instanceLabel, projectLabel].filter(Boolean).join(' - ') + ')';
        identity.append(title, detail);
        const status = document.createElement('div');
        status.className = 'instance-status';
        if (active) status.appendChild(badge('Default', 'active'));
        status.appendChild(accessBadge(env));
        const envCredential = credentialBadge(env);
        if (envCredential) status.appendChild(envCredential);
        top.append(identity, status);
        const actions = document.createElement('div');
        actions.className = 'toolbar';
        actions.append(iconButton(
          'Edit environment',
          'secondary icon-button compact',
          '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.3 1.3a1 1 0 0 1 1.4 0l2 2a1 1 0 0 1 0 1.4l-7.9 7.9-3.4.7.7-3.4 7.2-7.2zM10.6 3 3.8 9.8l-.3 1.5 1.5-.3L11.8 4.2 10.6 3z"/></svg>',
          () => editEnvironment(env),
        ));
        actions.append(iconButton(
          'Remove environment',
          'danger icon-button compact',
          '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2h4l1 1h3v1H2V3h3l1-1zm-2 3h8l-.6 8.2a1 1 0 0 1-1 .8H5.6a1 1 0 0 1-1-.8L4 5z"/></svg>',
          () => post('deleteEnvironment', { environmentId: env.id }),
        ));
        main.append(top, actions);
        row.append(main);
        els.environmentList.appendChild(row);
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
        const reasoning = provider.selected && provider.reasoningEffort ? ' · Reasoning: ' + provider.reasoningEffort : '';
        const baseUrl = provider.id === 'openai-compatible' && provider.baseUrl ? ' · ' + provider.baseUrl : '';
        detail.textContent = provider.description + model + reasoning + baseUrl;
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
        ['Workspace', state.workspace?.activeEnvironment?.name || state.workspace?.activeEnvironmentId || state.effective?.activeInstanceName || state.effective?.activeInstanceId || 'No active n8n environment'],
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
    function iconButton(label, cls, svg, onClick) {
      const el = document.createElement('button');
      el.className = cls || 'icon-button';
      el.setAttribute('aria-label', label);
      el.title = label;
      el.innerHTML = svg;
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        onClick(event);
      });
      return el;
    }
    function renderProjects(selectedId, selectedName) {
      els.workspaceProject.innerHTML = '';
      const normalized = normalizeProjectSelection(workspaceProjects, selectedId, selectedName);
      const availableProjects = normalized.projects;
      els.workspaceProject.disabled = false;
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Use instance default project';
      els.workspaceProject.appendChild(empty);
      for (const project of availableProjects) {
        const opt = document.createElement('option');
        opt.value = project.id;
        opt.dataset.projectName = project.name;
        opt.textContent = projectOptionLabel(project);
        opt.title = project.detail || opt.textContent;
        els.workspaceProject.appendChild(opt);
      }
      if (selectedId && !availableProjects.some((project) => project.id === normalized.value)) {
        const opt = document.createElement('option');
        opt.value = selectedId;
        opt.dataset.projectName = selectedName || state.workspace?.projectName || state.effective?.projectName || '';
        opt.textContent = opt.dataset.projectName;
        opt.textContent = fallbackProjectLabel(selectedId, opt.dataset.projectName);
        opt.title = selectedId;
        els.workspaceProject.appendChild(opt);
      }
      els.workspaceProject.value = normalized.value || '';
    }
    function renderEnvironmentProjectOptions(selectedId, selectedName) {
      els.environmentProject.innerHTML = '';
      const normalized = normalizeProjectSelection(environmentProjects, selectedId, selectedName);
      const availableProjects = normalized.projects;
      for (const project of availableProjects) {
        const opt = document.createElement('option');
        opt.value = project.id;
        opt.dataset.projectName = project.name;
        opt.textContent = projectOptionLabel(project);
        opt.title = project.detail || opt.textContent;
        els.environmentProject.appendChild(opt);
      }
      if (selectedId && !availableProjects.some((project) => project.id === normalized.value)) {
        const opt = document.createElement('option');
        opt.value = selectedId;
        opt.dataset.projectName = selectedName || '';
        opt.textContent = fallbackProjectLabel(selectedId, selectedName);
        opt.title = selectedId;
        els.environmentProject.appendChild(opt);
      }
      els.environmentProject.value = normalized.value || '';
    }
    function renderEnvironmentSyncOptions(selectedValue) {
      els.environmentSync.value = syncRootFromFolder(selectedValue || els.environmentSync.value || state.global?.defaultSyncFolder || state.effective?.syncFolder || 'workflows');
    }
    function resetEnvironmentConnection() {
      setEnvironmentConnectionState(false, '', { step: 'connection' });
    }
    function syncEnvironmentRemoteUrlFromSelection() {
      const selected = selectedEnvironmentInstance();
      els.environmentRemoteUrl.placeholder = 'https://my-instance.app.n8n.cloud';
      els.environmentRemoteUrl.value = selected.baseUrl || '';
    }
    function renderEnvironmentInstanceFields() {
      const selected = selectedEnvironmentInstance();
      if (selected.source === 'action' && selected.id === 'create-local') {
        els.environmentInstance.value = 'manual:remote';
        openModal(undefined, { overEnvironment: true });
        return;
      }
      const isManaged = selected.mode === 'managed';
      resetEnvironmentConnection();
    }
    function openModal(instance, options = {}) {
      editingInstanceId = instance?.id || '';
      els.modalTitle.textContent = editingInstanceId ? 'Edit local instance' : 'Create local instance';
      els.modalName.value = instance?.name || '';
      els.modalMode.value = 'managed-local-docker';
      els.modalHost.value = instance?.host || instance?.baseUrl || '';
      els.modalApiKey.value = '';
      els.modalTunnel.value = instance ? (instance.publicUrlEnabled || instance.tunnelPublicUrl || instance.tunnelTargetUrl ? 'yes' : 'no') : 'yes';
      renderModalFields();
      els.modal.classList.toggle('modal-over-environment', Boolean(options.overEnvironment));
      els.modal.classList.remove('hidden');
    }
    function closeModal() {
      editingInstanceId = '';
      els.modal.classList.remove('modal-over-environment');
      els.modal.classList.add('hidden');
    }
    function openManagedInstancesModal() {
      renderInstanceList();
      els.managedInstancesModal.classList.remove('hidden');
    }
    function closeManagedInstancesModal() {
      els.managedInstancesModal.classList.add('hidden');
    }
    function currentWorkspaceInstanceId() {
      return workspaceInstanceOverrideId;
    }
    function editTarget(target) {
      editingTargetId = target?.id || '';
      els.targetName.value = target?.name || '';
      els.targetKind.value = target?.kind || 'global-ref';
      els.targetGlobalInstance.value = target?.instanceRef || '';
      els.targetBaseUrl.value = target?.instance?.baseUrl || '';
      renderTargetKindFields();
    }
    function editEnvironment(env, instanceChoice) {
      editingEnvironmentId = env?.id || '';
      els.environmentModalTitle.textContent = editingEnvironmentId ? 'Edit environment' : 'Add environment';
      els.environmentName.value = env?.name || 'Dev';
      renderEnvironmentControls();
      els.environmentInstance.value = instanceChoice || (env?.instanceTargetId ? 'target:' + env.instanceTargetId : els.environmentInstance.options[0]?.value || '');
      els.environmentInstance.disabled = Boolean(editingEnvironmentId);
      syncEnvironmentRemoteUrlFromSelection();
      els.environmentApiKey.value = '';
      renderEnvironmentInstanceFields();
      renderEnvironmentProjectOptions(env?.projectId || state.effective?.projectId || 'personal', env?.projectName || state.effective?.projectName || '');
      renderEnvironmentSyncOptions(env?.syncFolder || (els.environmentName.value ? 'workflows/' + slug(els.environmentName.value) : 'workflows/dev'));
      els.environmentModal.classList.remove('hidden');
      if (editingEnvironmentId && selectedEnvironmentInstance().mode === 'remote') {
        post('loadEnvironmentEditCredentials', { environmentId: editingEnvironmentId });
      }
    }
    function closeEnvironmentModal() {
      clearEnvironmentForm();
      els.environmentModal.classList.add('hidden');
    }
    function clearTargetForm() {
      editingTargetId = '';
      els.targetName.value = '';
      els.targetBaseUrl.value = '';
      els.targetKind.value = 'global-ref';
      renderTargetKindFields();
    }
    function clearEnvironmentForm() {
      editingEnvironmentId = '';
      els.environmentName.value = '';
      els.environmentInstance.disabled = false;
      els.environmentInstance.value = els.environmentInstance.options[0]?.value || '';
      syncEnvironmentRemoteUrlFromSelection();
      els.environmentRemoteUrl.value = '';
      els.environmentApiKey.value = '';
      renderEnvironmentInstanceFields();
      renderEnvironmentProjectOptions('personal', 'Personal');
      renderEnvironmentSyncOptions('workflows/dev');
    }
    function loadEnvironmentProjects(env) {
      const candidate = environmentConnectionCandidate();
      const selected = candidate.selected;
      if (selected.mode === 'managed') {
        setEnvironmentConnectionState(true, '', { projectsAvailable: false, step: 'settings' });
        return;
      }
      if (!candidate.canValidate) {
        setEnvironmentConnectionState(false, '', { step: 'connection' });
        return;
      }
      const requestId = ++projectRequestSeq;
      latestEnvironmentProjectRequestId = requestId;
      els.loadEnvironmentProjects.disabled = true;
      setEnvironmentConnectionState(false, 'Validating n8n connection...', { validating: true, step: 'connection' });
      post('loadProjects', {
        scope: 'environment',
        requestId,
        instanceId: !candidate.shouldSendTypedCredentials && selected.source === 'global' ? selected.id : '',
        instanceTargetId: !candidate.shouldSendTypedCredentials && selected.source === 'target' ? selected.id : '',
        host: candidate.shouldSendTypedCredentials ? candidate.host : '',
        apiKey: candidate.shouldSendTypedCredentials ? candidate.typedApiKey : '',
        environmentId: editingEnvironmentId || '',
        projectId: env?.projectId || els.environmentProject.value || '',
        projectName: env?.projectName || els.environmentProject.selectedOptions[0]?.dataset.projectName || '',
      });
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
    els.migrateLegacyWorkspace.addEventListener('click', () => post('migrateLegacyWorkspaceConfig'));
    els.tabButtons.forEach((tabButton) => tabButton.addEventListener('click', () => setActiveTab(tabButton.dataset.tab)));
    els.providerSelectModel.addEventListener('click', () => post('selectProviderModel', { provider: providers().find((provider) => provider.selected)?.id || 'openai' }));
    els.openManagedInstances.addEventListener('click', openManagedInstancesModal);
    els.closeManagedInstances.addEventListener('click', closeManagedInstancesModal);
    els.addInstance.addEventListener('click', () => {
      closeManagedInstancesModal();
      openModal(undefined);
    });
    els.addEnvironment.addEventListener('click', () => editEnvironment(undefined));
    els.closeModal.addEventListener('click', closeModal);
    els.cancelModal.addEventListener('click', closeModal);
    els.closeEnvironmentModal.addEventListener('click', closeEnvironmentModal);
    els.cancelEnvironmentModal.addEventListener('click', closeEnvironmentModal);
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
    els.environmentName.addEventListener('input', () => renderEnvironmentSyncOptions(els.environmentSync.value));
    els.environmentRemoteUrl.addEventListener('input', () => {
      renderEnvironmentInstanceFields();
    });
    els.environmentApiKey.addEventListener('input', () => {
      renderEnvironmentInstanceFields();
    });
    els.environmentInstance.addEventListener('change', () => {
      if (selectedEnvironmentInstance().source === 'action') {
        renderEnvironmentInstanceFields();
        return;
      }
      syncEnvironmentRemoteUrlFromSelection();
      renderEnvironmentInstanceFields();
    });
    els.loadEnvironmentProjects.addEventListener('click', () => loadEnvironmentProjects(undefined));
    els.environmentBack.addEventListener('click', () => setEnvironmentConnectionState(false, '', { step: 'connection' }));
    els.manageInstancesFromEnvironment.addEventListener('click', () => {
      openModal(undefined, { overEnvironment: true });
    });
    els.targetKind.addEventListener('change', renderTargetKindFields);
    els.saveTarget.addEventListener('click', () => {
      const embedded = els.targetKind.value === 'embedded';
      post('saveInstanceTarget', {
        targetId: editingTargetId,
        targetKind: els.targetKind.value,
        name: els.targetName.value,
        instanceRef: embedded ? '' : els.targetGlobalInstance.value,
        baseUrl: embedded ? normalizeHost(els.targetBaseUrl.value) : '',
      });
      clearTargetForm();
    });
    els.saveEnvironment.addEventListener('click', () => {
      if (!environmentConnectionReady) return;
      const selected = selectedEnvironmentInstance();
      const selectedProject = els.environmentProject.selectedOptions[0];
      post('saveEnvironment', {
        environmentId: editingEnvironmentId,
        name: els.environmentName.value,
        instanceTargetId: selected.source === 'target' ? selected.id : '',
        instanceId: selected.source === 'global' ? selected.id : '',
        baseUrl: selected.mode === 'remote' ? normalizeHost(els.environmentRemoteUrl.value || selected.baseUrl) : '',
        apiKey: selected.mode === 'remote' ? els.environmentApiKey.value : '',
        projectId: selected.mode === 'managed' ? '' : els.environmentProject.value,
        projectName: selected.mode === 'managed' ? '' : selectedProject?.dataset.projectName || selectedProject?.textContent || els.environmentProject.value,
        syncFolder: els.environmentSync.value,
      });
      closeEnvironmentModal();
    });
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
      const requestId = ++projectRequestSeq;
      latestWorkspaceProjectRequestId = requestId;
      els.loadProjects.disabled = true;
      post('loadProjects', {
        scope: 'workspace',
        requestId,
        instanceId: state.workspace?.version === 4 ? '' : currentWorkspaceInstanceId() || state.global?.activeInstanceId || '',
        instanceTargetId: '',
        environmentId: editingEnvironmentId || '',
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
          legacyMigration: message.legacyMigration,
          effective: message.effective,
          providers: message.providers || [],
          about: message.about || {},
        };
        const initialProjects = state.effective?.projectId
          ? [{ id: state.effective.projectId, name: state.effective.projectName || '', type: state.effective.projectId === 'personal' ? 'personal' : 'unknown' }]
          : [PERSONAL_PROJECT];
        workspaceProjects = initialProjects;
        if (els.environmentModal.classList.contains('hidden')) {
          environmentProjects = initialProjects;
        }
        render();
      } else if (message.type === 'projectsLoaded') {
        const scope = message.scope || 'workspace';
        const requestId = Number(message.requestId || 0);
        const loadedProjects = (message.projects && message.projects.length) ? message.projects : [PERSONAL_PROJECT];
        if (scope === 'environment') {
          if (requestId && requestId !== latestEnvironmentProjectRequestId) return;
          environmentProjects = loadedProjects;
          const projectsAvailable = !isFallbackPersonalProjectList(loadedProjects);
          renderEnvironmentProjectOptions(projectsAvailable ? (message.selectedProjectId || els.environmentProject.value || 'personal') : '', projectsAvailable ? (message.selectedProjectName || '') : '');
          setEnvironmentConnectionState(true, '', { projectsAvailable, step: 'settings' });
        } else {
          if (requestId && requestId !== latestWorkspaceProjectRequestId) return;
          workspaceProjects = loadedProjects;
          els.loadProjects.disabled = false;
          renderProjects(message.selectedProjectId || state.workspace?.projectId || state.effective?.projectId || 'personal', message.selectedProjectName || state.workspace?.projectName || state.effective?.projectName || '');
        }
      } else if (message.type === 'saved') {
        showSaved();
      } else if (message.type === 'legacyMigrationCompleted') {
        showSaved(message.backupPath ? 'Workspace migrated. Backup: ' + message.backupPath : 'Workspace migrated.');
      } else if (message.type === 'copied') {
        showSaved();
      } else if (message.type === 'managedCredentials') {
        openCredentialsModal(message.credentials);
      } else if (message.type === 'environmentEditCredentials') {
        if (message.environmentId !== editingEnvironmentId || els.environmentModal.classList.contains('hidden')) return;
        els.environmentRemoteUrl.value = message.host || els.environmentRemoteUrl.value;
        els.environmentApiKey.value = message.apiKey || '';
        setEnvironmentConnectionState(false, '', { step: 'connection' });
      } else if (message.type === 'error') {
        els.loadProjects.disabled = false;
        els.loadEnvironmentProjects.disabled = false;
        if (!els.environmentModal.classList.contains('hidden')) {
          setEnvironmentConnectionState(false, message.message || 'Connection failed. Check the URL and API key.', { step: 'connection' });
        }
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
