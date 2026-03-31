import * as vscode from 'vscode';
import { N8nApiClient, ConfigService, type IN8nCredentials } from 'n8nac';
import { getResolvedN8nConfig, getWorkspaceRoot, isFolderPreviouslyInitialized } from '../utils/state-detection.js';
import { writeUnifiedWorkspaceConfig } from '../utils/unified-config.js';
import { buildConfigurationInitState } from './configuration-state.js';

type UiProject = {
  id: string;
  name: string;
  type?: string;
};

function normalizeHost(host: string): string {
  const trimmed = (host || '').trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

async function clearLegacyWorkspaceSettings(): Promise<void> {
  const config = vscode.workspace.getConfiguration('n8n');
  const keys: Array<'host' | 'apiKey' | 'syncFolder' | 'projectId' | 'projectName'> = [
    'host',
    'apiKey',
    'syncFolder',
    'projectId',
    'projectName',
  ];

  for (const key of keys) {
    const inspected = config.inspect<string>(key);
    if (inspected?.workspaceValue !== undefined) {
      await config.update(key, undefined, vscode.ConfigurationTarget.Workspace);
    }
    if (inspected?.workspaceFolderValue !== undefined) {
      await config.update(key, undefined, vscode.ConfigurationTarget.WorkspaceFolder);
    }
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export class ConfigurationWebview {
  public static currentPanel: ConfigurationWebview | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private _stateVersion = 0;

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._context = context;

    this._panel.onDidDispose(() => {
      ConfigurationWebview.currentPanel = undefined;
    });

    this._panel.webview.options = {
      enableScripts: true,
    };

    this._panel.webview.onDidReceiveMessage(async (message) => {
      try {
        if (!message || typeof message !== 'object') return;

        switch (message.type) {
          case 'loadProjects': {
            const host = normalizeHost(message.host);
            const apiKey = (message.apiKey || '').trim();
            const selectedProjectId = (message.projectId || '').trim();
            const selectedProjectName = (message.projectName || '').trim();

            if (!host || !apiKey) {
              this._panel.webview.postMessage({
                type: 'error',
                message: 'Host and API key are required to load projects.',
              });
              return;
            }

            const client = new N8nApiClient({ host, apiKey } as IN8nCredentials);
            const projects = (await client.getProjects()) as any[];

            const uiProjects: UiProject[] = projects.map((project) => ({
              id: project.id,
              name: project.name,
              type: project.type,
            }));

            this._panel.webview.postMessage({
              type: 'projectsLoaded',
              projects: uiProjects,
              selectedProjectId,
              selectedProjectName,
            });
            return;
          }

          case 'saveSettings': {
            const host = normalizeHost(message.host);
            const apiKey = (message.apiKey || '').trim();
            const syncFolder = (message.syncFolder || '').trim();
            const instanceId = (message.instanceId || '').trim() || undefined;
            const instanceName = (message.instanceName || '').trim() || undefined;
            const createNew = !!message.createNew;

            const workspaceRoot = getWorkspaceRoot();
            const shouldAutoApply = !!workspaceRoot && isFolderPreviouslyInitialized(workspaceRoot);
            if (workspaceRoot) {
              await this._context.workspaceState.update('n8n.suppressSettingsChangedOnce', true);
            }

            let projectId = (message.projectId || '').trim();
            let projectName = (message.projectName || '').trim();

            if (host && apiKey && (!projectId || !projectName)) {
              const client = new N8nApiClient({ host, apiKey } as IN8nCredentials);
              const projects = (await client.getProjects()) as any[];
              const personal = projects.find((project) => project.type === 'personal');
              const fallback = personal || (projects.length === 1 ? projects[0] : undefined);
              if (fallback) {
                projectId = fallback.id;
                projectName = fallback.type === 'personal' ? 'Personal' : fallback.name;
              }
            }

            if (workspaceRoot) {
              await writeUnifiedWorkspaceConfig({
                workspaceRoot,
                host,
                apiKey,
                syncFolder: syncFolder || 'workflows',
                projectId,
                projectName,
                instanceId,
                instanceName,
                createNew,
                setActive: true,
              });

              await clearLegacyWorkspaceSettings();
            }

            await this.postInitialState();
            this._panel.webview.postMessage({ type: 'saved' });

            void (async () => {
              try {
                if (host && apiKey) {
                  if (shouldAutoApply) {
                    await vscode.commands.executeCommand('n8n.applySettings');
                    await vscode.window.showInformationMessage('✅ Settings applied. Sync resumed.');
                  } else {
                    await vscode.commands.executeCommand('n8n.init');
                  }

                  await this.postInitialState();
                } else {
                  await vscode.window.showInformationMessage('✅ Settings saved.');
                }
              } catch (error: any) {
                this._panel.webview.postMessage({
                  type: 'error',
                  message: error?.message || 'Failed to apply saved settings.',
                });
              }
            })();
            return;
          }

          case 'switchInstance': {
            const workspaceRoot = getWorkspaceRoot();
            const instanceId = (message.instanceId || '').trim();
            if (!workspaceRoot || !instanceId) {
              return;
            }

            await vscode.commands.executeCommand('n8n.switchInstance', {
              instanceId,
              silent: true,
            });
            await this.postInitialState();
            return;
          }

          case 'deleteInstance': {
            const workspaceRoot = getWorkspaceRoot();
            const instanceId = (message.instanceId || '').trim();
            const skipConfirm = !!message.skipConfirm;
            if (!workspaceRoot || !instanceId) {
              return;
            }

            const deletedInstanceId = await vscode.commands.executeCommand('n8n.deleteInstance', {
              instanceId,
              skipConfirm,
              silent: true,
            });
            if (deletedInstanceId) {
              this._panel.webview.postMessage({
                type: 'instanceDeleted',
                instanceId: deletedInstanceId,
              });
              await this.postInitialState();
              this._panel.webview.postMessage({ type: 'saved' });
            } else {
              this._panel.webview.postMessage({ type: 'cancelled' });
            }
            return;
          }

          case 'openSettings': {
            await vscode.commands.executeCommand('n8n.openSettings');
            return;
          }
        }
      } catch (error: any) {
        this._panel.webview.postMessage({
          type: 'error',
          message: error?.message || 'Unexpected error',
        });
      }
    });

    this._panel.webview.html = this.getHtmlForWebview();
    void this.postInitialState();

    this._panel.onDidChangeViewState(() => {
      if (this._panel.visible) {
        void this.postInitialState();
      }
    });
  }

  public static createOrShow(context: vscode.ExtensionContext) {
    const column = vscode.ViewColumn.One;

    if (ConfigurationWebview.currentPanel) {
      ConfigurationWebview.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'n8nConfiguration',
      'n8n: Configure',
      column,
      { enableScripts: true }
    );

    ConfigurationWebview.currentPanel = new ConfigurationWebview(panel, context);
  }

  private async postInitialState() {
    const stateVersion = ++this._stateVersion;
    const workspaceRoot = getWorkspaceRoot();
    const resolved = getResolvedN8nConfig(workspaceRoot);
    const configService = new ConfigService(workspaceRoot);
    const workspaceConfig = workspaceRoot ? configService.getWorkspaceConfig() : { instances: [], activeInstanceId: undefined };
    const activeInstance = configService.getActiveInstance();

    const initState = buildConfigurationInitState({
      workspaceConfig,
      activeInstance,
      resolved,
      getApiKey: (host, instanceId) => configService.getApiKey(host, instanceId),
      normalizeHost,
    });

    this._panel.webview.postMessage({
      type: 'init',
      stateVersion,
      ...initState,
    });

    if ((activeInstance?.host || resolved.host) && initState.config.apiKey) {
      try {
        const host = activeInstance?.host || resolved.host;
        const client = new N8nApiClient({ host, apiKey: initState.config.apiKey } as IN8nCredentials);
        const projects = (await client.getProjects()) as any[];

        const uiProjects: UiProject[] = projects.map((project) => ({
          id: project.id,
          name: project.name,
          type: project.type,
        }));

        this._panel.webview.postMessage({
          type: 'projectsLoaded',
          stateVersion,
          projects: uiProjects,
          selectedProjectId: activeInstance?.projectId || resolved.projectId,
          selectedProjectName: activeInstance?.projectName || resolved.projectName,
        });
      } catch (error: any) {
        this._panel.webview.postMessage({
          type: 'error',
          message: `Failed to load projects: ${error?.message || 'unknown error'}`,
        });
      }
    }
  }

  private getHtmlForWebview() {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>n8n Configure</title>
  <style>
    :root {
      --surface: color-mix(in srgb, var(--vscode-editor-background) 84%, transparent);
      --surface-strong: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-input-background));
      --surface-muted: color-mix(in srgb, var(--vscode-panel-border, var(--vscode-input-border)) 25%, transparent);
      --accent: var(--vscode-button-background);
      --accent-soft: color-mix(in srgb, var(--accent) 18%, transparent);
      --border: color-mix(in srgb, var(--vscode-input-border) 80%, transparent);
      --shadow: 0 14px 36px rgba(0, 0, 0, 0.16);
      --radius: 18px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background:
        radial-gradient(circle at top left, var(--accent-soft), transparent 34%),
        linear-gradient(180deg, color-mix(in srgb, var(--vscode-editor-background) 96%, transparent), var(--vscode-editor-background));
    }
    .page {
      max-width: 1040px;
      margin: 0 auto;
      padding: 24px 18px 32px;
    }
    .hero {
      margin-bottom: 16px;
      padding: 22px 24px;
      border: 1px solid var(--border);
      border-radius: calc(var(--radius) + 4px);
      background: linear-gradient(180deg, var(--surface-strong), var(--surface));
      box-shadow: var(--shadow);
    }
    h1 {
      margin: 0 0 10px;
      font-size: 30px;
      line-height: 1.1;
      font-weight: 700;
    }
    .hero p {
      margin: 0;
      max-width: 760px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.55;
    }
    .layout {
      display: grid;
      gap: 14px;
    }
    .card {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 18px;
      background: linear-gradient(180deg, var(--surface), var(--surface-strong));
      box-shadow: var(--shadow);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 14px;
    }
    .card-title {
      margin: 0;
      font-size: 18px;
      font-weight: 650;
    }
    .card-copy {
      margin: 6px 0 0;
      color: var(--vscode-descriptionForeground);
      line-height: 1.45;
      max-width: 720px;
    }
    .instance-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.95fr);
      gap: 18px;
    }
    .stack {
      display: grid;
      gap: 12px;
    }
    .field-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .field.full {
      grid-column: 1 / -1;
    }
    label {
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      letter-spacing: 0.01em;
    }
    input, select {
      width: 100%;
      min-height: 40px;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      transition: border-color 120ms ease, box-shadow 120ms ease;
    }
    input:focus, select:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent-soft);
    }
    input[type=password] {
      font-family: var(--vscode-editor-font-family);
    }
    .hint {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.45;
    }
    .selector-panel {
      padding: 14px;
      border-radius: 16px;
      background: var(--surface-muted);
      border: 1px solid var(--border);
    }
    .selector-panel h3,
    .mode-block h3 {
      margin: 0 0 8px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--vscode-descriptionForeground);
    }
    .summary {
      min-height: 56px;
      padding: 12px 14px;
      border-radius: 14px;
      background: color-mix(in srgb, var(--surface-strong) 82%, transparent);
      border: 1px solid var(--border);
      line-height: 1.45;
    }
    .summary strong {
      display: block;
      margin-bottom: 4px;
      font-size: 14px;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 4px;
    }
    button {
      min-height: 40px;
      padding: 0 14px;
      border-radius: 12px;
      border: 1px solid transparent;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-weight: 600;
    }
    button.secondary {
      background: transparent;
      color: var(--vscode-foreground);
      border-color: var(--border);
    }
    button.ghost {
      background: color-mix(in srgb, var(--surface-strong) 72%, transparent);
      color: var(--vscode-foreground);
      border-color: var(--border);
    }
    button.danger {
      background: color-mix(in srgb, var(--vscode-errorForeground) 14%, transparent);
      color: var(--vscode-errorForeground);
      border-color: color-mix(in srgb, var(--vscode-errorForeground) 36%, transparent);
    }
    button:disabled {
      opacity: 0.58;
      cursor: not-allowed;
    }
    .project-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.5fr) minmax(220px, 0.7fr);
      gap: 12px;
    }
    .project-selector-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 10px;
      align-items: end;
    }
    .project-load {
      white-space: nowrap;
    }
    .section-divider {
      margin: 18px 0 14px;
      border-top: 1px solid var(--border);
    }
    .subsection-title {
      margin: 0 0 4px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--vscode-descriptionForeground);
    }
    .subsection-copy {
      margin: 0 0 12px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.45;
    }
    .footer-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
      margin-top: 6px;
    }
    .message {
      margin-top: 14px;
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid transparent;
      white-space: pre-wrap;
      line-height: 1.45;
    }
    .message.error {
      display: none;
      color: var(--vscode-errorForeground);
      background: color-mix(in srgb, var(--vscode-inputValidation-errorBackground, transparent) 70%, transparent);
      border-color: color-mix(in srgb, var(--vscode-errorForeground) 40%, transparent);
    }
    .message.ok {
      display: none;
      color: var(--vscode-foreground);
      background: color-mix(in srgb, var(--vscode-testing-iconPassed, var(--vscode-charts-green)) 20%, transparent);
      border-color: color-mix(in srgb, var(--vscode-testing-iconPassed, var(--vscode-charts-green)) 40%, transparent);
    }
    @media (max-width: 860px) {
      .instance-layout,
      .project-grid,
      .field-grid {
        grid-template-columns: 1fr;
      }
      .page {
        padding: 16px 12px 24px;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <h1>n8n-as-code config</h1>
      <p>
        Connect this workspace to existing n8n instances using their URL and API key. You can save multiple instance configs and choose which one is active.
      </p>
    </section>

    <div class="layout">
      <section class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Instance</h2>
            <p class="card-copy">Enter the URL and API key of an existing n8n instance. Select a saved instance to edit it, then save to make it active in this workspace.</p>
          </div>
          <button id="newInstance" class="secondary">Add instance</button>
        </div>

        <div class="instance-layout">
          <div class="stack">
            <div class="field-grid">
              <div class="field full">
                <label for="host">n8n host URL</label>
                <input id="host" type="text" placeholder="https://my-instance.app.n8n.cloud" />
                <div class="hint">Include the protocol and omit the trailing slash.</div>
              </div>
              <div class="field">
                <label for="apiKey">API key</label>
                <input id="apiKey" type="password" placeholder="n8n API key" />
              </div>
              <div class="field">
                <label for="instanceName">Instance name</label>
                <input id="instanceName" type="text" placeholder="Production" />
              </div>
            </div>
          </div>

          <div class="stack">
            <div class="selector-panel">
              <h3>Select instance</h3>
              <div class="field">
                <label for="instanceSelect">Select instance</label>
                <select id="instanceSelect"></select>
              </div>
              <div id="switchHelp" class="hint"></div>
              <div class="toolbar">
                <button id="deleteInstance" class="danger">Delete config</button>
              </div>
            </div>

            <div class="summary">
              <strong id="activeSummaryTitle">Active instance</strong>
              <div id="activeSummaryName">No active instance.</div>
              <div id="activeSummaryHost" class="hint"></div>
            </div>
          </div>
        </div>

        <div class="section-divider"></div>

        <div>
          <h3 class="subsection-title">Project and Sync</h3>
          <p class="subsection-copy">Load projects from this instance and choose the folder to sync.</p>
        </div>

        <div class="project-grid">
          <div class="field">
            <label for="project">Project to sync</label>
            <div class="project-selector-row">
              <button id="loadProjects" class="ghost project-load">Load projects</button>
              <select id="project" disabled>
                <option value="">Load projects to select…</option>
              </select>
            </div>
            <div class="hint">Use “Load projects” after entering a valid URL and API key.</div>
          </div>

          <div class="field">
            <label for="syncFolder">Sync folder</label>
            <input id="syncFolder" type="text" placeholder="workflows" />
            <div class="hint">Example: <code>workflows</code> or <code>n8n/workflows</code>.</div>
          </div>
        </div>

        <div class="footer-actions">
          <button id="save">Save and activate config</button>
        </div>
      </section>
    </div>
    <div id="message" class="message error"></div>
    <div id="saved" class="message ok">Saved.</div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const instanceSelectEl = document.getElementById('instanceSelect');
    const instanceNameEl = document.getElementById('instanceName');
    const newInstanceBtn = document.getElementById('newInstance');
    const hostEl = document.getElementById('host');
    const apiKeyEl = document.getElementById('apiKey');
    const projectEl = document.getElementById('project');
    const syncFolderEl = document.getElementById('syncFolder');
    const loadBtn = document.getElementById('loadProjects');
    const saveBtn = document.getElementById('save');
    const deleteBtn = document.getElementById('deleteInstance');
    const activeSummaryTitleEl = document.getElementById('activeSummaryTitle');
    const activeSummaryNameEl = document.getElementById('activeSummaryName');
    const activeSummaryHostEl = document.getElementById('activeSummaryHost');
    const switchHelpEl = document.getElementById('switchHelp');
    const messageEl = document.getElementById('message');
    const savedEl = document.getElementById('saved');

    let instances = [];
    let projects = [];
    let activeInstanceId = '';
    let activeInstanceName = '';
    let selectedInstanceId = '';
    let draftMode = false;
    let draftSourceInstanceId = '';
    let activeConfig = createEmptyConfig();
    let currentConfig = createEmptyConfig();
    let pendingAction = '';
    let latestStateVersion = 0;
    let autoLoadTimer = null;
    let lastLoadRequest = { host: '', apiKey: '' };

    function createEmptyConfig(overrides = {}) {
      return {
        instanceId: '',
        instanceName: '',
        host: '',
        apiKey: '',
        projectId: '',
        projectName: '',
        syncFolder: 'workflows',
        ...overrides
      };
    }

    function normalizeHost(host) {
      const trimmed = (host || '').trim();
      return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
    }

    function setError(text) {
      if (!text) {
        messageEl.style.display = 'none';
        messageEl.textContent = '';
        return;
      }
      messageEl.style.display = 'block';
      messageEl.textContent = text;
    }

    function setSaved(visible) {
      savedEl.style.display = visible ? 'block' : 'none';
      if (visible) {
        setTimeout(() => { savedEl.style.display = 'none'; }, 1500);
      }
    }

    function setPendingAction(action) {
      pendingAction = action || '';
      updateModeUi();
    }

    function clearPendingAction() {
      pendingAction = '';
      updateModeUi();
    }

    function resetProjectsUi(emptyLabel = 'Load projects to select…') {
      projects = [];
      projectEl.disabled = true;
      projectEl.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = emptyLabel;
      projectEl.appendChild(opt);
    }

    function cloneConfig(config) {
      return createEmptyConfig(config || {});
    }

    function isOutdatedStateMessage(message) {
      if (!message || typeof message.stateVersion !== 'number') {
        return false;
      }
      return message.stateVersion < latestStateVersion;
    }

    function rememberStateVersion(message) {
      if (message && typeof message.stateVersion === 'number') {
        latestStateVersion = Math.max(latestStateVersion, message.stateVersion);
      }
    }

    function readSelectedProjectName() {
      const selectedOption = projectEl.options[projectEl.selectedIndex];
      if (selectedOption && selectedOption.dataset && selectedOption.dataset.projectName) {
        return selectedOption.dataset.projectName;
      }
      return '';
    }

    function readFormState() {
      return {
        instanceId: draftMode ? '' : (selectedInstanceId || ''),
        instanceName: (instanceNameEl.value || '').trim(),
        host: normalizeHost(hostEl.value),
        apiKey: (apiKeyEl.value || '').trim(),
        projectId: projectEl.value || '',
        projectName: readSelectedProjectName() || currentConfig.projectName || '',
        syncFolder: (syncFolderEl.value || '').trim() || 'workflows'
      };
    }

    function applyConfig(config) {
      currentConfig = cloneConfig(config);
      instanceNameEl.value = currentConfig.instanceName;
      hostEl.value = currentConfig.host;
      apiKeyEl.value = currentConfig.apiKey;
      syncFolderEl.value = currentConfig.syncFolder || 'workflows';
      setError('');
      updateModeUi();
    }

    function isDirty() {
      const form = readFormState();
      return JSON.stringify(form) !== JSON.stringify(currentConfig);
    }

    function updateModeUi() {
      const savedCount = instances.length;
      const activeLabel = activeInstanceName || activeConfig.instanceName || 'No active instance';
      const isBusy = pendingAction !== '';

      saveBtn.textContent = pendingAction === 'save'
        ? (draftMode ? 'Adding...' : 'Saving...')
        : 'Save and activate config';
      newInstanceBtn.textContent = draftMode ? 'Cancel add' : 'Add instance';
      loadBtn.textContent = pendingAction === 'loadProjects' ? 'Loading...' : 'Load projects';
      deleteBtn.textContent = pendingAction === 'deleteInstance' ? 'Deleting...' : 'Delete config';
      loadBtn.disabled = isBusy || !normalizeHost(hostEl.value) || !(apiKeyEl.value || '').trim();
      saveBtn.disabled = isBusy;
      newInstanceBtn.disabled = isBusy;
      deleteBtn.disabled = isBusy || draftMode || !selectedInstanceId;
      instanceSelectEl.disabled = isBusy || !instances.length;
      hostEl.disabled = isBusy;
      apiKeyEl.disabled = isBusy;
      instanceNameEl.disabled = isBusy;
      syncFolderEl.disabled = isBusy;
      projectEl.disabled = isBusy || !projects.length;

      activeSummaryTitleEl.textContent = 'Active instance';
      activeSummaryNameEl.textContent = activeLabel;
      activeSummaryHostEl.textContent = activeConfig.host
        ? activeConfig.host
        : 'Save and activate an instance to use it in this workspace.';

      switchHelpEl.textContent = savedCount
        ? 'Choose a saved instance to edit. It becomes active when you save.'
        : 'Add your first instance to start configuring this workspace.';
    }

    function renderInstances(selectedId) {
      instanceSelectEl.innerHTML = '';

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = instances.length ? 'Select instance…' : 'No saved configs yet';
      instanceSelectEl.appendChild(placeholder);

      for (const instance of instances) {
        const opt = document.createElement('option');
        opt.value = instance.id;
        const activeSuffix = instance.id === activeInstanceId ? ' (active)' : '';
        opt.textContent = instance.name + activeSuffix + (instance.host ? ' - ' + instance.host : '');
        instanceSelectEl.appendChild(opt);
      }

      if (selectedId && instances.some((instance) => instance.id === selectedId)) {
        instanceSelectEl.value = selectedId;
      } else {
        instanceSelectEl.value = instances.length ? (selectedInstanceId || '') : '';
      }

      updateModeUi();
    }

    function renderProjects(selectedId) {
      projectEl.innerHTML = '';

      if (!projects.length) {
        projectEl.disabled = true;
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No projects found';
        projectEl.appendChild(opt);
        return;
      }

      projectEl.disabled = false;

      let defaultId = selectedId;
      if (!defaultId) {
        const personal = projects.find((project) => project.type === 'personal');
        defaultId = personal ? personal.id : projects[0].id;
      }

      for (const project of projects) {
        const opt = document.createElement('option');
        opt.value = project.id;
        opt.textContent = project.type === 'personal' ? 'Personal' : project.name;
        opt.dataset.projectName = project.type === 'personal' ? 'Personal' : project.name;
        projectEl.appendChild(opt);
      }

      projectEl.value = defaultId;

      const selected = projects.find((project) => project.id === defaultId);
      if (selected) {
        currentConfig.projectId = selected.id;
        currentConfig.projectName = selected.type === 'personal' ? 'Personal' : selected.name;
      }
    }

    function createDraftFromActiveConfig() {
      const draft = createEmptyConfig({
        syncFolder: currentConfig.syncFolder || activeConfig.syncFolder || 'workflows'
      });
      draftSourceInstanceId = selectedInstanceId;
      selectedInstanceId = '';
      draftMode = true;
      applyConfig(draft);
      resetProjectsUi();
      lastLoadRequest = { host: '', apiKey: '' };
      renderInstances(selectedInstanceId);
    }

    function applyDeletedInstanceLocally(instanceId) {
      if (!instanceId) {
        return;
      }

      instances = instances.filter((instance) => instance.id !== instanceId);

      if (activeInstanceId === instanceId) {
        const nextActive = instances[0];
        activeInstanceId = nextActive ? nextActive.id : '';
        activeInstanceName = nextActive ? nextActive.name : '';
        activeConfig = nextActive
          ? cloneConfig({
              instanceId: nextActive.id,
              instanceName: nextActive.name,
              host: nextActive.host,
              apiKey: nextActive.apiKey,
              projectId: nextActive.projectId,
              projectName: nextActive.projectName,
              syncFolder: nextActive.syncFolder,
            })
          : createEmptyConfig();
      }

      if (selectedInstanceId === instanceId) {
        const fallbackSelectedId = activeInstanceId || instances[0]?.id || '';
        selectedInstanceId = fallbackSelectedId;
      }

      if (draftSourceInstanceId === instanceId) {
        draftSourceInstanceId = activeInstanceId || instances[0]?.id || '';
      }

      if (!draftMode) {
        const nextSelected = instances.find((instance) => instance.id === selectedInstanceId);
        if (nextSelected) {
          selectInstanceForEditing(nextSelected.id);
          return;
        }

        applyConfig(createEmptyConfig());
        resetProjectsUi();
      }

      renderInstances(selectedInstanceId);
    }

    function selectInstanceForEditing(instanceId, options = { loadProjects: true }) {
      const selectedInstance = instances.find((instance) => instance.id === instanceId);
      if (!selectedInstance) {
        return;
      }

      selectedInstanceId = selectedInstance.id;
      draftMode = false;
      draftSourceInstanceId = '';
      applyConfig({
        instanceId: selectedInstance.id,
        instanceName: selectedInstance.name,
        host: selectedInstance.host,
        apiKey: selectedInstance.apiKey,
        projectId: selectedInstance.projectId,
        projectName: selectedInstance.projectName,
        syncFolder: selectedInstance.syncFolder,
      });
      renderInstances(selectedInstanceId);

      if (options.loadProjects && selectedInstance.host && selectedInstance.apiKey) {
        requestProjectsLoad(true);
      } else if (!selectedInstance.host || !selectedInstance.apiKey) {
        resetProjectsUi();
      }
    }

    function requestProjectsLoad(force = false) {
      if (pendingAction) {
        return;
      }

      const host = normalizeHost(hostEl.value);
      const apiKey = (apiKeyEl.value || '').trim();

      if (!host || !apiKey) {
        lastLoadRequest = { host: '', apiKey: '' };
        resetProjectsUi('Enter a host and API key to load projects…');
        updateModeUi();
        return;
      }

      if (!force && lastLoadRequest.host === host && lastLoadRequest.apiKey === apiKey) {
        renderProjects(currentConfig.projectId || '');
        return;
      }

      lastLoadRequest = { host, apiKey };
      setError('');
      setPendingAction('loadProjects');
      vscode.postMessage({
        type: 'loadProjects',
        host,
        apiKey,
        projectId: currentConfig.projectId || '',
        projectName: currentConfig.projectName || '',
      });
    }

    function scheduleAutoLoadProjects() {
      if (autoLoadTimer) clearTimeout(autoLoadTimer);
      autoLoadTimer = setTimeout(() => {
        requestProjectsLoad(false);
      }, 500);
    }

    instanceSelectEl.addEventListener('change', () => {
      if (pendingAction) {
        return;
      }

      const selectedId = instanceSelectEl.value;
      if (!selectedId || selectedId === selectedInstanceId) {
        renderInstances(selectedInstanceId);
        return;
      }

      if (isDirty() && !window.confirm('Selecting another instance will discard unsaved changes in this form. Continue?')) {
        renderInstances(selectedInstanceId);
        return;
      }

      setError('');
      selectInstanceForEditing(selectedId);
    });

    newInstanceBtn.addEventListener('click', () => {
      if (pendingAction) {
        return;
      }

      if (draftMode) {
        if (isDirty() && !window.confirm('Discard this new config draft?')) {
          return;
        }
        const restoreId = draftSourceInstanceId || activeInstanceId || instances[0]?.id || '';
        draftMode = false;
        draftSourceInstanceId = '';
        if (restoreId) {
          selectInstanceForEditing(restoreId);
        } else {
          selectedInstanceId = '';
          applyConfig(activeConfig);
          renderInstances(selectedInstanceId);
          if (activeConfig.host && activeConfig.apiKey) {
            requestProjectsLoad(true);
          } else {
            resetProjectsUi();
          }
        }
        return;
      }

      if (isDirty() && !window.confirm('Start a new config and discard unsaved changes to the current form?')) {
        return;
      }

      createDraftFromActiveConfig();
    });

    loadBtn.addEventListener('click', () => {
      requestProjectsLoad(true);
    });

    hostEl.addEventListener('input', () => {
      updateModeUi();
      scheduleAutoLoadProjects();
    });
    apiKeyEl.addEventListener('input', () => {
      updateModeUi();
      scheduleAutoLoadProjects();
    });
    syncFolderEl.addEventListener('input', updateModeUi);
    instanceNameEl.addEventListener('input', updateModeUi);
    hostEl.addEventListener('blur', () => requestProjectsLoad(false));
    apiKeyEl.addEventListener('blur', () => requestProjectsLoad(false));
    projectEl.addEventListener('change', updateModeUi);

    saveBtn.addEventListener('click', () => {
      if (pendingAction) {
        return;
      }

      setError('');
      const form = readFormState();
      const host = form.host;
      const apiKey = form.apiKey;

      if (!host || !apiKey) {
        setError('Host and API key are required to save this instance.');
        return;
      }

      setPendingAction('save');
      vscode.postMessage({
        type: 'saveSettings',
        instanceId: draftMode ? '' : (selectedInstanceId || ''),
        instanceName: form.instanceName,
        createNew: draftMode,
        host,
        apiKey,
        projectId: form.projectId,
        projectName: form.projectName,
        syncFolder: form.syncFolder,
      });
    });

    deleteBtn.addEventListener('click', () => {
      if (pendingAction || draftMode || !selectedInstanceId) {
        return;
      }
      const targetInstanceId = selectedInstanceId;
      setError('');
      applyDeletedInstanceLocally(targetInstanceId);
      setPendingAction('deleteInstance');
      vscode.postMessage({
        type: 'deleteInstance',
        instanceId: targetInstanceId,
        skipConfirm: true,
      });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || typeof message !== 'object') return;

      if (message.type === 'init') {
        if (isOutdatedStateMessage(message)) {
          return;
        }
        rememberStateVersion(message);
        clearPendingAction();
        instances = message.instances || [];
        const nextActiveInstanceId = message.activeInstanceId || (message.config && message.config.instanceId) || '';
        const hasVisibleActiveInstance = instances.some((instance) => instance.id === nextActiveInstanceId);
        if (hasVisibleActiveInstance) {
          activeInstanceId = nextActiveInstanceId;
          activeInstanceName = message.activeInstanceName || (message.config && message.config.instanceName) || '';
          activeConfig = cloneConfig(message.config || createEmptyConfig());
        } else if (!instances.length) {
          activeInstanceId = '';
          activeInstanceName = '';
          activeConfig = createEmptyConfig();
        }
        draftMode = false;
        draftSourceInstanceId = '';
        selectedInstanceId = instances.some((instance) => instance.id === activeInstanceId)
          ? activeInstanceId
          : (instances[0]?.id || '');
        const selectedInstance = instances.find((instance) => instance.id === selectedInstanceId);
        applyConfig(selectedInstance ? {
          instanceId: selectedInstance.id,
          instanceName: selectedInstance.name,
          host: selectedInstance.host,
          apiKey: selectedInstance.apiKey,
          projectId: selectedInstance.projectId,
          projectName: selectedInstance.projectName,
          syncFolder: selectedInstance.syncFolder,
        } : activeConfig);
        renderInstances(selectedInstanceId);
        return;
      }

      if (message.type === 'projectsLoaded') {
        if (isOutdatedStateMessage(message)) {
          return;
        }
        rememberStateVersion(message);
        clearPendingAction();
        projects = message.projects || [];
        const selectedId = message.selectedProjectId || currentConfig.projectId || '';
        renderProjects(selectedId);
        return;
      }

      if (message.type === 'saved') {
        clearPendingAction();
        setSaved(true);
        return;
      }

      if (message.type === 'instanceDeleted') {
        clearPendingAction();
        return;
      }

      if (message.type === 'error') {
        clearPendingAction();
        setError(message.message || 'Error');
        return;
      }

      if (message.type === 'cancelled') {
        clearPendingAction();
        return;
      }
    });

    resetProjectsUi();
    updateModeUi();
  </script>
</body>
</html>`;
  }
}
