import * as vscode from 'vscode';
import { N8nApiClient, type IN8nCredentials } from '@n8n-as-code/sync';
import { getWorkspaceRoot, isFolderPreviouslyInitialized } from '../utils/state-detection.js';

type UiProject = {
  id: string;
  name: string;
  type?: string;
};

type UiSyncMode = 'auto' | 'manual';

function normalizeHost(host: string): string {
  const trimmed = (host || '').trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function toDisplayName(project: UiProject): string {
  return project.type === 'personal' ? 'Personal' : project.name;
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

            if (!host || !apiKey) {
              this._panel.webview.postMessage({
                type: 'error',
                message: 'Host and API key are required to load projects.',
              });
              return;
            }

            const client = new N8nApiClient({ host, apiKey } as IN8nCredentials);
            const projects = (await client.getProjects()) as any[];

            const uiProjects: UiProject[] = projects.map((p) => ({
              id: p.id,
              name: p.name,
              type: p.type,
            }));

            const config = vscode.workspace.getConfiguration('n8n');
            const selectedProjectId = (config.get<string>('projectId') || '').trim();
            const selectedProjectName = (config.get<string>('projectName') || '').trim();

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
            const syncMode = ((message.syncMode || '').trim() || 'auto') as UiSyncMode;

            const config = vscode.workspace.getConfiguration('n8n');

            // If the workspace was previously initialized, we can treat "Save" as "Apply":
            // write settings once, then immediately reinitialize sync.
            const workspaceRoot = getWorkspaceRoot();
            const shouldAutoApply = !!workspaceRoot && isFolderPreviouslyInitialized(workspaceRoot);
            if (shouldAutoApply) {
              await this._context.workspaceState.update('n8n.suppressSettingsChangedOnce', true);
            }

            await config.update('host', host, vscode.ConfigurationTarget.Workspace);
            await config.update('apiKey', apiKey, vscode.ConfigurationTarget.Workspace);

            if (syncFolder) {
              await config.update('syncFolder', syncFolder, vscode.ConfigurationTarget.Workspace);
            }
            await config.update('syncMode', syncMode, vscode.ConfigurationTarget.Workspace);

            // Project can be picked from the dropdown, but if missing, we’ll default to Personal.
            let projectId = (message.projectId || '').trim();
            let projectName = (message.projectName || '').trim();

            if (host && apiKey && (!projectId || !projectName)) {
              const client = new N8nApiClient({ host, apiKey } as IN8nCredentials);
              const projects = (await client.getProjects()) as any[];
              const personal = projects.find((p) => p.type === 'personal');
              const fallback = personal || (projects.length === 1 ? projects[0] : undefined);
              if (fallback) {
                projectId = fallback.id;
                projectName = fallback.type === 'personal' ? 'Personal' : fallback.name;
              }
            }

            if (projectId && projectName) {
              await config.update('projectId', projectId, vscode.ConfigurationTarget.Workspace);
              await config.update('projectName', projectName, vscode.ConfigurationTarget.Workspace);
            }

            if (shouldAutoApply) {
              await vscode.commands.executeCommand('n8n.applySettings');
              await vscode.window.showInformationMessage('✅ Settings applied. Sync resumed.');
            } else {
              await vscode.window.showInformationMessage(
                '✅ Settings saved. Click “Initialize n8n as code” in the n8n view to start syncing.'
              );
            }

            this._panel.webview.postMessage({ type: 'saved' });
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

    // Send initial config state.
    void this.postInitialState();
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
    const config = vscode.workspace.getConfiguration('n8n');
    const host = normalizeHost(config.get<string>('host') || process.env.N8N_HOST || '');
    const apiKey = (config.get<string>('apiKey') || process.env.N8N_API_KEY || '').trim();
    const projectId = (config.get<string>('projectId') || '').trim();
    const projectName = (config.get<string>('projectName') || '').trim();
    const syncFolder = (config.get<string>('syncFolder') || 'workflows').trim();
    const syncMode = ((config.get<string>('syncMode') || 'auto').trim() || 'auto') as UiSyncMode;

    this._panel.webview.postMessage({
      type: 'init',
      config: { host, apiKey, projectId, projectName, syncFolder, syncMode },
    });

    // If we already have host + apiKey, proactively load projects.
    if (host && apiKey) {
      try {
        const client = new N8nApiClient({ host, apiKey } as IN8nCredentials);
        const projects = (await client.getProjects()) as any[];

        const uiProjects: UiProject[] = projects.map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
        }));

        this._panel.webview.postMessage({
          type: 'projectsLoaded',
          projects: uiProjects,
          selectedProjectId: projectId,
          selectedProjectName: projectName,
        });
      } catch (e: any) {
        // Non-fatal: the user can still edit host/apiKey and retry.
        this._panel.webview.postMessage({
          type: 'error',
          message: `Failed to load projects: ${e?.message || 'unknown error'}`,
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
    .row { display: flex; gap: 12px; flex-wrap: wrap; }
    .field { display: flex; flex-direction: column; gap: 6px; margin: 12px 0; flex: 1; min-width: 280px; }
    label { font-size: 12px; color: var(--vscode-descriptionForeground); }
    input, select { padding: 8px; border-radius: 4px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); }
    input[type=password] { font-family: var(--vscode-editor-font-family); }
    .buttons { display: flex; gap: 8px; margin-top: 16px; }
    button { padding: 8px 10px; border-radius: 4px; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); cursor: pointer; }
    button.secondary { background: transparent; color: var(--vscode-foreground); border: 1px solid var(--vscode-input-border); }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .error { margin-top: 12px; color: var(--vscode-errorForeground); white-space: pre-wrap; }
    .ok { margin-top: 12px; color: var(--vscode-charts-green); }
  </style>
</head>
<body>
  <h2>n8n as code</h2>
  <div class="muted">Configure your n8n instance and choose which project to sync (default: Personal).</div>

  <div class="row">
    <div class="field">
      <label for="host">n8n Host URL</label>
      <input id="host" type="text" placeholder="https://my-instance.app.n8n.cloud" />
    </div>
    <div class="field">
      <label for="apiKey">API Key</label>
      <input id="apiKey" type="password" placeholder="n8n API Key" />
    </div>
  </div>

  <div class="row">
    <div class="field">
      <label for="project">Project</label>
      <select id="project" disabled>
        <option value="">Load projects to select…</option>
      </select>
      <div class="muted" style="font-size: 12px;">Projects list is loaded from the n8n API once host + API key are valid.</div>
    </div>
  </div>

  <div class="row">
    <div class="field">
      <label for="syncFolder">Sync Folder (relative to workspace)</label>
      <input id="syncFolder" type="text" placeholder="workflows" />
      <div class="muted" style="font-size: 12px;">Example: <code>workflows</code> or <code>n8n/workflows</code></div>
    </div>
    <div class="field">
      <label for="syncMode">Sync Mode</label>
      <select id="syncMode">
        <option value="auto">Auto (Watch)</option>
        <option value="manual">Manual</option>
      </select>
      <div class="muted" style="font-size: 12px;">Auto enables watch mode; Manual shows Push/Pull buttons.</div>
    </div>
  </div>

  <div class="buttons">
    <button id="loadProjects" class="secondary">Load projects</button>
    <button id="save">Apply Changes</button>
    <button id="advanced" class="secondary">Advanced: open VS Code settings</button>
  </div>

  <div id="message" class="error" style="display:none;"></div>
  <div id="saved" class="ok" style="display:none;">Saved.</div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const hostEl = document.getElementById('host');
    const apiKeyEl = document.getElementById('apiKey');
    const projectEl = document.getElementById('project');
    const syncFolderEl = document.getElementById('syncFolder');
    const syncModeEl = document.getElementById('syncMode');
    const loadBtn = document.getElementById('loadProjects');
    const saveBtn = document.getElementById('save');
    const advancedBtn = document.getElementById('advanced');
    const messageEl = document.getElementById('message');
    const savedEl = document.getElementById('saved');

    let projects = [];
    let currentConfig = { host: '', apiKey: '', projectId: '', projectName: '', syncFolder: 'workflows', syncMode: 'auto' };

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

      // Prefer current selection, otherwise Personal, otherwise first.
      let defaultId = selectedId;
      if (!defaultId) {
        const personal = projects.find(p => p.type === 'personal');
        defaultId = personal ? personal.id : projects[0].id;
      }

      for (const p of projects) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.type === 'personal' ? 'Personal' : p.name;
        opt.dataset.projectName = p.type === 'personal' ? 'Personal' : p.name;
        projectEl.appendChild(opt);
      }

      projectEl.value = defaultId;
    }

    loadBtn.addEventListener('click', () => {
      setError('');
      const host = normalizeHost(hostEl.value);
      const apiKey = (apiKeyEl.value || '').trim();
      vscode.postMessage({ type: 'loadProjects', host, apiKey });
    });

    saveBtn.addEventListener('click', () => {
      setError('');
      const host = normalizeHost(hostEl.value);
      const apiKey = (apiKeyEl.value || '').trim();

      const syncFolderEl = document.getElementById('syncFolder');
      const syncModeEl = document.getElementById('syncMode');
      const syncFolder = syncFolderEl ? (syncFolderEl.value || '').trim() : '';
      const syncMode = syncModeEl ? (syncModeEl.value || '').trim() : 'auto';

      let projectId = projectEl.value || '';
      let projectName = '';
      const selectedOption = projectEl.options[projectEl.selectedIndex];
      if (selectedOption && selectedOption.dataset && selectedOption.dataset.projectName) {
        projectName = selectedOption.dataset.projectName;
      }

      vscode.postMessage({ type: 'saveSettings', host, apiKey, projectId, projectName, syncFolder, syncMode });
    });

    advancedBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'openSettings' });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || typeof message !== 'object') return;

      if (message.type === 'init') {
        currentConfig = message.config || currentConfig;
        hostEl.value = currentConfig.host || '';
        apiKeyEl.value = currentConfig.apiKey || '';

        const syncFolderEl = document.getElementById('syncFolder');
        const syncModeEl = document.getElementById('syncMode');
        if (syncFolderEl) syncFolderEl.value = currentConfig.syncFolder || 'workflows';
        if (syncModeEl) syncModeEl.value = currentConfig.syncMode || 'auto';
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
