import * as vscode from 'vscode';
import { N8nApiClient, ConfigService, type IN8nCredentials } from 'n8nac';
import { getResolvedN8nConfig, getWorkspaceRoot, isFolderPreviouslyInitialized } from '../utils/state-detection.js';
import { writeUnifiedWorkspaceConfig } from '../utils/unified-config.js';

type UiProject = {
  id: string;
  name: string;
  type?: string;
};

type UiInstance = {
  id: string;
  name: string;
  host: string;
  apiKey: string;
  syncFolder: string;
  projectId: string;
  projectName: string;
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
                setActive: true,
              });

              await clearLegacyWorkspaceSettings();
            }

            if (host && apiKey) {
              if (shouldAutoApply) {
                await vscode.commands.executeCommand('n8n.applySettings');
                await vscode.window.showInformationMessage('✅ Settings applied. Sync resumed.');
              } else {
                await vscode.commands.executeCommand('n8n.init');
              }
            } else {
              await vscode.window.showInformationMessage('✅ Settings saved.');
            }

            await this.postInitialState();
            this._panel.webview.postMessage({ type: 'saved' });
            return;
          }

          case 'switchInstance': {
            const workspaceRoot = getWorkspaceRoot();
            const instanceId = (message.instanceId || '').trim();
            if (!workspaceRoot || !instanceId) {
              return;
            }

            const configService = new ConfigService(workspaceRoot);
            configService.setActiveInstance(instanceId);
            await this.postInitialState();
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
    const workspaceRoot = getWorkspaceRoot();
    const resolved = getResolvedN8nConfig(workspaceRoot);
    const configService = new ConfigService(workspaceRoot);
    const workspaceConfig = workspaceRoot ? configService.getWorkspaceConfig() : { instances: [], activeInstanceId: undefined };
    const activeInstance = configService.getActiveInstance();

    const instances: UiInstance[] = workspaceRoot
      ? workspaceConfig.instances.map((instance) => ({
          id: instance.id,
          name: instance.name,
          host: normalizeHost(instance.host || ''),
          apiKey: instance.host ? (configService.getApiKey(instance.host, instance.id) || '') : '',
          syncFolder: instance.syncFolder || 'workflows',
          projectId: instance.projectId || '',
          projectName: instance.projectName || '',
        }))
      : [];

    const activeApiKey = activeInstance?.host
      ? (configService.getApiKey(activeInstance.host, activeInstance.id) || '')
      : resolved.apiKey;

    this._panel.webview.postMessage({
      type: 'init',
      config: {
        instanceId: activeInstance?.id || resolved.activeInstanceId || '',
        instanceName: activeInstance?.name || resolved.activeInstanceName || '',
        host: normalizeHost(activeInstance?.host || resolved.host),
        apiKey: activeApiKey.trim(),
        projectId: activeInstance?.projectId || resolved.projectId,
        projectName: activeInstance?.projectName || resolved.projectName,
        syncFolder: activeInstance?.syncFolder || resolved.syncFolder,
      },
      instances,
    });

    if ((activeInstance?.host || resolved.host) && activeApiKey) {
      try {
        const host = activeInstance?.host || resolved.host;
        const client = new N8nApiClient({ host, apiKey: activeApiKey } as IN8nCredentials);
        const projects = (await client.getProjects()) as any[];

        const uiProjects: UiProject[] = projects.map((project) => ({
          id: project.id,
          name: project.name,
          type: project.type,
        }));

        this._panel.webview.postMessage({
          type: 'projectsLoaded',
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
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
    h2 { margin: 0 0 8px; }
    .muted { color: var(--vscode-descriptionForeground); }
    .container { display: grid; grid-template-columns: 1fr; gap: 12px; }
    .card { border: 1px solid var(--vscode-input-border); border-radius: 8px; padding: 12px; background: var(--vscode-panel-background); }
    .card-header { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
    .card-title { font-weight: 600; }
    .grid { display: flex; gap: 12px; flex-wrap: wrap; }
    .field { display: flex; flex-direction: column; gap: 6px; margin: 8px 0; flex: 1; min-width: 240px; }
    label { font-size: 12px; color: var(--vscode-descriptionForeground); }
    input, select { padding: 8px; border-radius: 4px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); }
    input[type=password] { font-family: var(--vscode-editor-font-family); }
    .actions { display: flex; gap: 8px; margin-top: 12px; justify-content:flex-end; }
    .toolbar { display:flex; gap:8px; margin-top:8px; }
    button { padding: 8px 10px; border-radius: 4px; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); cursor: pointer; }
    button.secondary { background: transparent; color: var(--vscode-foreground); border: 1px solid var(--vscode-input-border); }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .error { margin-top: 12px; color: var(--vscode-errorForeground); white-space: pre-wrap; }
    .ok { margin-top: 12px; color: var(--vscode-charts-green); }
    .muted.small { font-size: 12px; }
    .accordion { margin-top: 8px; }
    .accordion-toggle { background: transparent; border: none; color: var(--vscode-button-foreground); cursor: pointer; padding: 4px; display:flex; gap:8px; align-items:center; }
    .accordion-content { margin-top: 6px; display:none; border-top:1px dashed var(--vscode-input-border); padding-top:8px; }
  </style>
</head>
<body>
  <h2>n8n as code</h2>
  <div class="muted">Maintain a library of n8n instances and choose which one is active for this workspace.</div>

  <div class="container">
    <div class="card">
      <div class="card-header">
        <div class="card-title">Instances</div>
      </div>
      <div class="grid">
        <div class="field">
          <label for="instanceSelect">Saved instance profiles</label>
          <select id="instanceSelect"></select>
          <div class="muted small">Saving a profile makes it the active instance for this workspace.</div>
        </div>
        <div class="field">
          <label for="instanceName">Instance profile name</label>
          <input id="instanceName" type="text" placeholder="Production" />
        </div>
      </div>
      <div class="toolbar">
        <button id="newInstance" class="secondary">New instance</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">Connection</div>
      </div>
      <div class="grid">
        <div class="field">
          <label for="host">n8n Host URL</label>
          <input id="host" type="text" placeholder="https://my-instance.app.n8n.cloud" />
          <div class="muted small">Include protocol (https://) and omit trailing slash.</div>
        </div>
        <div class="field">
          <label for="apiKey">API Key</label>
          <input id="apiKey" type="password" placeholder="n8n API Key" />
        </div>
      </div>
      <div class="toolbar">
        <button id="loadProjects" class="secondary">Load projects</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">Project</div>
      </div>
      <div class="field">
        <label for="project">Select project to sync</label>
        <select id="project" disabled>
          <option value="">Load projects to select…</option>
        </select>
        <div class="muted small">Projects are loaded from the n8n API for the currently selected instance.</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">Sync settings</div>
      </div>
      <div class="field">
        <label for="syncFolder">Sync Folder (relative to workspace)</label>
        <input id="syncFolder" type="text" placeholder="workflows" />
        <div class="muted small">Example: <code>workflows</code> or <code>n8n/workflows</code></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">Actions</div>
      </div>
      <div class="actions">
        <button id="save">Save settings</button>
      </div>
      <div class="accordion">
        <button id="accordionToggle" class="accordion-toggle">Show advanced options</button>
        <div id="accordionContent" class="accordion-content">
          <div class="muted small">Advanced settings are available in VS Code settings. Use the button above to jump there.</div>
        </div>
      </div>
    </div>
  </div>

  <div id="message" class="error" style="display:none;"></div>
  <div id="saved" class="ok" style="display:none;">Saved.</div>

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
    const accordionToggle = document.getElementById('accordionToggle');
    const accordionContent = document.getElementById('accordionContent');
    const messageEl = document.getElementById('message');
    const savedEl = document.getElementById('saved');

    let instances = [];
    let projects = [];
    let currentConfig = {
      instanceId: '',
      instanceName: '',
      host: '',
      apiKey: '',
      projectId: '',
      projectName: '',
      syncFolder: 'workflows'
    };

    let autoLoadTimer = null;
    let lastLoadRequest = { host: '', apiKey: '' };

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

    function resetProjectsUi() {
      projects = [];
      projectEl.disabled = true;
      projectEl.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Load projects to select…';
      projectEl.appendChild(opt);
    }

    function applyConfig(config) {
      currentConfig = {
        instanceId: config.instanceId || '',
        instanceName: config.instanceName || '',
        host: config.host || '',
        apiKey: config.apiKey || '',
        projectId: config.projectId || '',
        projectName: config.projectName || '',
        syncFolder: config.syncFolder || 'workflows'
      };

      instanceNameEl.value = currentConfig.instanceName;
      hostEl.value = currentConfig.host;
      apiKeyEl.value = currentConfig.apiKey;
      syncFolderEl.value = currentConfig.syncFolder || 'workflows';
    }

    function renderInstances(selectedId) {
      instanceSelectEl.innerHTML = '';

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = instances.length ? 'Select an instance profile…' : 'No saved instances yet';
      instanceSelectEl.appendChild(placeholder);

      for (const instance of instances) {
        const opt = document.createElement('option');
        opt.value = instance.id;
        opt.textContent = instance.name + (instance.host ? ' - ' + instance.host : '');
        instanceSelectEl.appendChild(opt);
      }

      if (selectedId && instances.some((instance) => instance.id === selectedId)) {
        instanceSelectEl.value = selectedId;
      } else {
        instanceSelectEl.value = '';
      }
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

    function requestProjectsLoad(force = false) {
      const host = normalizeHost(hostEl.value);
      const apiKey = (apiKeyEl.value || '').trim();

      if (!host || !apiKey) {
        lastLoadRequest = { host: '', apiKey: '' };
        resetProjectsUi();
        return;
      }

      if (!force && lastLoadRequest.host === host && lastLoadRequest.apiKey === apiKey) {
        renderProjects(currentConfig.projectId || '');
        return;
      }

      lastLoadRequest = { host, apiKey };
      setError('');
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
      const selectedId = instanceSelectEl.value;
      if (!selectedId) {
        return;
      }

      const selectedInstance = instances.find((instance) => instance.id === selectedId);
      if (!selectedInstance) {
        return;
      }

      applyConfig({
        instanceId: selectedInstance.id,
        instanceName: selectedInstance.name,
        host: selectedInstance.host,
        apiKey: selectedInstance.apiKey,
        projectId: selectedInstance.projectId,
        projectName: selectedInstance.projectName,
        syncFolder: selectedInstance.syncFolder,
      });
      vscode.postMessage({ type: 'switchInstance', instanceId: selectedId });
      requestProjectsLoad(true);
    });

    newInstanceBtn.addEventListener('click', () => {
      renderInstances('');
      applyConfig({
        instanceId: '',
        instanceName: '',
        host: '',
        apiKey: '',
        projectId: '',
        projectName: '',
        syncFolder: 'workflows',
      });
      lastLoadRequest = { host: '', apiKey: '' };
      resetProjectsUi();
      setError('');
    });

    loadBtn.addEventListener('click', () => {
      requestProjectsLoad(true);
    });

    hostEl.addEventListener('input', scheduleAutoLoadProjects);
    apiKeyEl.addEventListener('input', scheduleAutoLoadProjects);
    hostEl.addEventListener('blur', () => requestProjectsLoad(false));
    apiKeyEl.addEventListener('blur', () => requestProjectsLoad(false));

    saveBtn.addEventListener('click', () => {
      setError('');
      const host = normalizeHost(hostEl.value);
      const apiKey = (apiKeyEl.value || '').trim();
      const syncFolder = (syncFolderEl.value || '').trim();
      const instanceName = (instanceNameEl.value || '').trim();

      let projectId = projectEl.value || '';
      let projectName = '';
      const selectedOption = projectEl.options[projectEl.selectedIndex];
      if (selectedOption && selectedOption.dataset && selectedOption.dataset.projectName) {
        projectName = selectedOption.dataset.projectName;
      }

      vscode.postMessage({
        type: 'saveSettings',
        instanceId: currentConfig.instanceId || '',
        instanceName,
        host,
        apiKey,
        projectId,
        projectName,
        syncFolder,
      });
    });

    if (accordionToggle) {
      accordionToggle.addEventListener('click', () => {
        vscode.postMessage({ type: 'openSettings' });
        if (!accordionContent) return;
        const isHidden = !accordionContent.style.display || accordionContent.style.display === 'none';
        accordionContent.style.display = isHidden ? 'block' : 'none';
        accordionToggle.textContent = isHidden ? 'Open VS Code settings' : 'Show advanced options';
      });
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || typeof message !== 'object') return;

      if (message.type === 'init') {
        instances = message.instances || [];
        applyConfig(message.config || currentConfig);
        renderInstances(currentConfig.instanceId || '');
        return;
      }

      if (message.type === 'projectsLoaded') {
        projects = message.projects || [];
        const selectedId = message.selectedProjectId || currentConfig.projectId || '';
        renderProjects(selectedId);
        return;
      }

      if (message.type === 'saved') {
        setSaved(true);
        return;
      }

      if (message.type === 'error') {
        setError(message.message || 'Error');
        return;
      }
    });
  </script>
</body>
</html>`;
  }
}
