import * as vscode from 'vscode';
import { N8nApiClient, ConfigService, type IN8nCredentials } from 'n8nac';
import { createN8nManagerFacade } from '@n8n-as-code/manager-adapter';
import { N8N_FACADE_SETUP_MODES } from '@n8n-as-code/workflow-core';
import { getResolvedN8nConfig, getWorkspaceRoot, isFolderPreviouslyInitialized } from '../utils/state-detection.js';
import { writeUnifiedWorkspaceConfig } from '../utils/unified-config.js';
import { buildConfigurationInitState } from './configuration-state.js';

type UiProject = {
  id: string;
  name: string;
  type?: string;
};

const MANAGED_LOCAL_PROJECT_ID = 'personal';
const MANAGED_LOCAL_PROJECT_NAME = 'Personal';

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

          case 'configureRuntimeMode': {
            const mode = String(message.mode || '').trim();
            if (mode !== 'managed-local' && mode !== 'generation-only') {
              this._panel.webview.postMessage({
                type: 'error',
                message: 'Unsupported runtime mode for direct extension setup.',
              });
              return;
            }

            const facade = createN8nManagerFacade();
            const workspaceRoot = getWorkspaceRoot();
            const syncFolder = String(message.syncFolder || '').trim() || 'workflows';
            this._panel.webview.postMessage({
              type: 'runtimeModeStarted',
              mode,
            });
            const instance = await vscode.window.withProgress({
              location: vscode.ProgressLocation.Notification,
              title: mode === 'managed-local'
                ? 'Preparing local n8n with n8n-manager'
                : 'Saving n8n generation-only mode',
              cancellable: false,
            }, async (progress) => {
              progress.report({
                message: mode === 'managed-local'
                  ? 'Resolving local runtime state...'
                  : 'Saving workspace runtime mode...',
              });
              return facade.setup({
                mode,
                tunnel: !!message.tunnel,
              });
            });

            const status = await facade.status();
            let activatedConfig: { host?: string; syncFolder?: string; projectName?: string } | undefined;

            if (mode === 'managed-local' && status.status === 'ready' && workspaceRoot) {
              const managed = await facade.getManagedInstance();
              if (!managed?.baseUrl || !managed.apiKey) {
                throw new Error('n8n-manager reports local n8n ready, but no managed API key is available yet.');
              }

              const configService = new ConfigService(workspaceRoot);
              const existingManagedInstance = configService
                .listInstances()
                .find((candidate) => normalizeHost(candidate.host || '') === normalizeHost(managed.baseUrl || ''));

              await writeUnifiedWorkspaceConfig({
                workspaceRoot,
                host: managed.baseUrl,
                apiKey: managed.apiKey,
                syncFolder,
                projectId: MANAGED_LOCAL_PROJECT_ID,
                projectName: MANAGED_LOCAL_PROJECT_NAME,
                instanceId: existingManagedInstance?.id,
                instanceName: existingManagedInstance?.name || 'Managed local n8n',
                createNew: !existingManagedInstance,
                setActive: true,
              });

              await clearLegacyWorkspaceSettings();
              await this.postInitialState();

              void vscode.commands.executeCommand('n8n.init');
              activatedConfig = {
                host: managed.baseUrl,
                syncFolder,
                projectName: MANAGED_LOCAL_PROJECT_NAME,
              };
            }

            this._panel.webview.postMessage({
              type: 'runtimeModeSaved',
              mode,
              instance,
              status,
              activatedConfig,
            });
            return;
          }

          case 'loadCredentialInventory': {
            const facade = createN8nManagerFacade();
            const inventory = await facade.getCredentialInventory();
            const recipes = await facade.listCredentialRecipes();
            this._panel.webview.postMessage({
              type: 'credentialInventoryLoaded',
              items: inventory.availableCredentials,
              recipes,
            });
            return;
          }

          case 'ensureCredential': {
            const recipeId = String(message.recipeId || '').trim();
            const credentialName = String(message.credentialName || '').trim();
            const values = typeof message.values === 'object' && message.values ? message.values : {};
            if (!recipeId) {
              throw new Error('Credential recipe is required.');
            }

            const facade = createN8nManagerFacade();
            const ref = await facade.ensureCredential(recipeId, {
              credentialName: credentialName || undefined,
              values,
            });
            const inventory = await facade.getCredentialInventory();
            const recipes = await facade.listCredentialRecipes();
            this._panel.webview.postMessage({
              type: 'credentialSaved',
              credential: ref,
              items: inventory.availableCredentials,
              recipes,
            });
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
        if (message.type === 'deleteInstance') {
          await this.postInitialState();
        }
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
    const configService = workspaceRoot ? new ConfigService(workspaceRoot) : undefined;
    const workspaceConfig = workspaceRoot && configService
      ? configService.getWorkspaceConfig()
      : { instances: [], activeInstanceId: undefined };
    const activeInstance = workspaceRoot && configService ? configService.getActiveInstance() : undefined;

    const initState = buildConfigurationInitState({
      workspaceConfig,
      activeInstance,
      resolved,
      getApiKey: (host, instanceId) => (workspaceRoot && configService ? configService.getApiKey(host, instanceId) : undefined),
      normalizeHost,
    });

    this._panel.webview.postMessage({
      type: 'init',
      stateVersion,
      ...initState,
    });

    if ((activeInstance?.host || resolved.host) && initState.config.apiKey && activeInstance?.projectId !== MANAGED_LOCAL_PROJECT_ID) {
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
    const setupModes = JSON.stringify(N8N_FACADE_SETUP_MODES);

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
    .mode-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    .mode-option {
      display: grid;
      gap: 6px;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: color-mix(in srgb, var(--surface-strong) 80%, transparent);
      min-height: 128px;
      cursor: pointer;
    }
    .mode-option.selected {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent-soft);
      background: color-mix(in srgb, var(--accent-soft) 42%, var(--surface-strong));
    }
    .mode-option input {
      width: auto;
      min-height: auto;
      margin: 0;
    }
    .mode-label {
      font-weight: 650;
      color: var(--vscode-foreground);
    }
    .mode-description {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.45;
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
    .path-panel {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      margin-top: 12px;
      padding: 14px;
      border-radius: 16px;
      background: var(--surface-muted);
      border: 1px solid var(--border);
    }
    .path-title {
      margin: 0 0 6px;
      font-size: 15px;
      font-weight: 650;
    }
    .path-copy {
      margin: 0;
      color: var(--vscode-descriptionForeground);
      line-height: 1.45;
    }
    .path-next {
      margin: 10px 0 0;
      padding-left: 18px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.45;
    }
    .path-next li + li {
      margin-top: 3px;
    }
    .runtime-status {
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: color-mix(in srgb, var(--surface-strong) 82%, transparent);
      color: var(--vscode-descriptionForeground);
      line-height: 1.45;
    }
    .runtime-options {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }
    .runtime-check {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      color: var(--vscode-descriptionForeground);
      line-height: 1.4;
    }
    .runtime-check input {
      width: auto;
      min-height: auto;
      margin-top: 2px;
    }
    .credential-list {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }
    .credential-form {
      display: grid;
      grid-template-columns: minmax(150px, 1fr) minmax(160px, 1fr) minmax(180px, 1.4fr) minmax(120px, 1fr) auto;
      gap: 10px;
      align-items: end;
      margin-top: 12px;
    }
    .credential-row {
      display: grid;
      grid-template-columns: minmax(140px, 1.2fr) minmax(90px, 0.7fr) minmax(90px, 0.7fr) auto;
      gap: 10px;
      align-items: center;
      padding: 10px 0;
      border-top: 1px solid var(--vscode-panel-border);
      font-size: 12px;
    }
    .credential-row:first-child {
      border-top: 0;
    }
    .credential-name {
      color: var(--vscode-foreground);
      font-weight: 600;
    }
    .credential-meta,
    .credential-status {
      color: var(--vscode-descriptionForeground);
    }
    .runtime-status strong {
      display: block;
      color: var(--vscode-foreground);
      margin-bottom: 4px;
    }
    .runtime-status.progress {
      border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    }
    .runtime-status.success {
      border-color: color-mix(in srgb, var(--vscode-testing-iconPassed, var(--vscode-charts-green)) 42%, var(--border));
    }
    .runtime-progress {
      position: relative;
      overflow: hidden;
      height: 4px;
      margin-top: 10px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--border) 70%, transparent);
    }
    .runtime-progress::before {
      content: "";
      position: absolute;
      left: -42%;
      top: 0;
      height: 100%;
      width: 42%;
      border-radius: inherit;
      background: var(--accent);
      animation: runtime-progress 1.1s ease-in-out infinite;
    }
    @keyframes runtime-progress {
      0% { transform: translateX(0); }
      100% { transform: translateX(338%); }
    }
    .hidden {
      display: none !important;
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
      .path-panel,
      .mode-grid,
      .field-grid {
        grid-template-columns: 1fr;
      }
      .credential-form,
      .credential-row {
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
        Choose whether this facade connects to an existing n8n instance, lets n8n-manager prepare runtime access, or stays in generation-only mode.
      </p>
    </section>

    <div class="layout">
      <section class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Runtime mode</h2>
            <p class="card-copy">This choice is shared by CLI, extension, MCP, and agent plugins so every facade exposes the same runtime path.</p>
          </div>
        </div>
        <div id="runtimeModeGrid" class="mode-grid"></div>
        <div id="runtimePathPanel" class="path-panel">
          <div>
            <h3 id="runtimePathTitle" class="path-title">Connect existing n8n</h3>
            <p id="runtimePathCopy" class="path-copy"></p>
            <ol id="runtimePathNext" class="path-next"></ol>
            <div id="runtimeOptions" class="runtime-options">
              <label class="runtime-check">
                <input id="enableTunnel" type="checkbox" />
                <span>Expose local n8n through a Cloudflare tunnel for remote webhooks and external facades.</span>
              </label>
            </div>
            <div id="runtimeStatus" class="runtime-status hidden"></div>
          </div>
          <button id="runtimePrimaryAction">Continue</button>
        </div>
      </section>

      <section id="existingInstanceCard" class="card">
        <div class="card-header">
          <div>
            <h2 id="instanceCardTitle" class="card-title">Instance</h2>
            <p id="instanceCardCopy" class="card-copy">Enter the URL and API key of an existing n8n instance. Select a saved instance to edit it, then save to make it active in this workspace.</p>
          </div>
          <button id="newInstance" class="secondary">Add instance</button>
        </div>

        <div class="instance-layout">
          <div class="stack">
            <div id="connectionFields" class="field-grid">
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
                <label>Verification</label>
                <div id="verificationStatus" class="hint">Not verified yet</div>
              </div>
            </div>
          </div>

          <div class="stack">
            <div id="instanceLibraryPanel" class="selector-panel">
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
              <div id="activeSummaryStatus" class="hint"></div>
            </div>
          </div>
        </div>

        <div class="section-divider"></div>

        <div>
          <h3 class="subsection-title">Project and Sync</h3>
          <p class="subsection-copy">Load projects from this instance and choose the folder to sync.</p>
        </div>

        <div class="project-grid">
          <div id="projectField" class="field">
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

      <section id="credentialsCard" class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Credentials</h2>
            <p class="card-copy">Create or update native n8n LLM provider credentials through n8n-manager.</p>
          </div>
          <button id="loadCredentials" class="secondary">Refresh</button>
        </div>
        <div class="credential-form">
          <div class="field">
            <label for="llmCredentialRecipe">LLM provider</label>
            <select id="llmCredentialRecipe"></select>
          </div>
          <div class="field">
            <label for="llmCredentialName">Credential name</label>
            <input id="llmCredentialName" type="text" placeholder="OpenAI" />
          </div>
          <div class="field">
            <label for="llmApiKey">API key</label>
            <input id="llmApiKey" type="password" placeholder="Provider API key" />
          </div>
          <div id="llmBaseUrlField" class="field">
            <label for="llmBaseUrl">Base URL</label>
            <input id="llmBaseUrl" type="text" placeholder="Optional" />
          </div>
          <button id="setupLlmCredential">Set up</button>
        </div>
        <div id="credentialList" class="credential-list">
          <div class="hint">Prepare a runtime, then refresh credential readiness.</div>
        </div>
      </section>
    </div>
    <div id="message" class="message error"></div>
    <div id="saved" class="message ok">Saved.</div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const setupModes = ${setupModes};

    const instanceSelectEl = document.getElementById('instanceSelect');
    const runtimeModeGridEl = document.getElementById('runtimeModeGrid');
    const runtimePathPanelEl = document.getElementById('runtimePathPanel');
    const runtimePathTitleEl = document.getElementById('runtimePathTitle');
    const runtimePathCopyEl = document.getElementById('runtimePathCopy');
    const runtimePathNextEl = document.getElementById('runtimePathNext');
    const runtimeOptionsEl = document.getElementById('runtimeOptions');
    const enableTunnelEl = document.getElementById('enableTunnel');
    const runtimeStatusEl = document.getElementById('runtimeStatus');
    const runtimePrimaryActionBtn = document.getElementById('runtimePrimaryAction');
    const credentialsCardEl = document.getElementById('credentialsCard');
    const loadCredentialsBtn = document.getElementById('loadCredentials');
    const credentialListEl = document.getElementById('credentialList');
    const llmCredentialRecipeEl = document.getElementById('llmCredentialRecipe');
    const llmCredentialNameEl = document.getElementById('llmCredentialName');
    const llmApiKeyEl = document.getElementById('llmApiKey');
    const llmBaseUrlFieldEl = document.getElementById('llmBaseUrlField');
    const llmBaseUrlEl = document.getElementById('llmBaseUrl');
    const setupLlmCredentialBtn = document.getElementById('setupLlmCredential');
    const existingInstanceCardEl = document.getElementById('existingInstanceCard');
    const instanceCardTitleEl = document.getElementById('instanceCardTitle');
    const instanceCardCopyEl = document.getElementById('instanceCardCopy');
    const connectionFieldsEl = document.getElementById('connectionFields');
    const instanceLibraryPanelEl = document.getElementById('instanceLibraryPanel');
    const newInstanceBtn = document.getElementById('newInstance');
    const hostEl = document.getElementById('host');
    const apiKeyEl = document.getElementById('apiKey');
    const verificationStatusEl = document.getElementById('verificationStatus');
    const projectEl = document.getElementById('project');
    const projectFieldEl = document.getElementById('projectField');
    const syncFolderEl = document.getElementById('syncFolder');
    const loadBtn = document.getElementById('loadProjects');
    const saveBtn = document.getElementById('save');
    const deleteBtn = document.getElementById('deleteInstance');
    const activeSummaryTitleEl = document.getElementById('activeSummaryTitle');
    const activeSummaryNameEl = document.getElementById('activeSummaryName');
    const activeSummaryHostEl = document.getElementById('activeSummaryHost');
    const activeSummaryStatusEl = document.getElementById('activeSummaryStatus');
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
    let runtimeMode = 'connect-existing';
    let credentialRecipes = [];

    function createEmptyConfig(overrides = {}) {
      return {
        instanceId: '',
        instanceName: '',
        host: '',
        apiKey: '',
        projectId: '',
        projectName: '',
        syncFolder: 'workflows',
        verificationStatus: 'unverified',
        verificationLabel: 'Not verified yet',
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

    function setRuntimeStatus(kind, title, detail, showProgress = false) {
      if (!title && !detail) {
        runtimeStatusEl.className = 'runtime-status hidden';
        runtimeStatusEl.innerHTML = '';
        return;
      }

      runtimeStatusEl.className = 'runtime-status ' + (kind || '');
      runtimeStatusEl.innerHTML = '';

      if (title) {
        const strong = document.createElement('strong');
        strong.textContent = title;
        runtimeStatusEl.appendChild(strong);
      }

      if (detail) {
        const body = document.createElement('div');
        body.textContent = detail;
        runtimeStatusEl.appendChild(body);
      }

      if (showProgress) {
        const progress = document.createElement('div');
        progress.className = 'runtime-progress';
        runtimeStatusEl.appendChild(progress);
      }
    }

    function getLlmCredentialRecipes() {
      return credentialRecipes.filter((recipe) =>
        recipe.service === 'llm'
        && recipe.authMethod === 'api-key'
        && recipe.id !== 'llm-proxy'
      );
    }

    function getSelectedLlmRecipe() {
      const selectedId = llmCredentialRecipeEl.value;
      return getLlmCredentialRecipes().find((recipe) => recipe.id === selectedId);
    }

    function renderLlmCredentialRecipes() {
      const recipes = getLlmCredentialRecipes();
      llmCredentialRecipeEl.innerHTML = '';
      for (const recipe of recipes) {
        const option = document.createElement('option');
        option.value = recipe.id;
        option.textContent = recipe.label;
        llmCredentialRecipeEl.appendChild(option);
      }
      if (!llmCredentialNameEl.value && recipes[0]) {
        llmCredentialNameEl.value = recipes[0].label;
      }
      updateLlmCredentialForm();
    }

    function updateLlmCredentialForm() {
      const recipe = getSelectedLlmRecipe();
      if (recipe && !llmCredentialNameEl.value) {
        llmCredentialNameEl.value = recipe.label;
      }
      const supportsBaseUrl = !!recipe && Array.isArray(recipe.requiredInputs)
        && recipe.requiredInputs.some((input) => input.key === 'url');
      llmBaseUrlFieldEl.classList.toggle('hidden', !supportsBaseUrl);
    }

    function renderCredentialInventory(items, recipes) {
      if (Array.isArray(recipes)) {
        credentialRecipes = recipes;
        renderLlmCredentialRecipes();
      }
      credentialListEl.innerHTML = '';
      const credentials = Array.isArray(items) ? items : [];
      if (!credentials.length) {
        const empty = document.createElement('div');
        empty.className = 'hint';
        empty.textContent = 'No credential recipes reported yet.';
        credentialListEl.appendChild(empty);
        return;
      }

      for (const item of credentials) {
        const recipe = credentialRecipes.find((candidate) => candidate.id === item.recipeId);
        const row = document.createElement('div');
        row.className = 'credential-row';

        const name = document.createElement('div');
        name.className = 'credential-name';
        name.textContent = item.credentialName || recipe?.label || item.recipeId || 'Credential';

        const meta = document.createElement('div');
        meta.className = 'credential-meta';
        meta.textContent = item.service ? item.service + ' · ' + item.credentialTypeName : item.credentialTypeName;

        const status = document.createElement('div');
        status.className = 'credential-status';
        status.textContent = item.status + (item.reason ? ' · ' + item.reason : '');

        const action = document.createElement('button');
        action.className = 'ghost';
        action.textContent = recipe?.service === 'llm' && recipe?.authMethod === 'api-key' ? 'Edit' : 'Managed';
        action.disabled = !(recipe?.service === 'llm' && recipe?.authMethod === 'api-key');
        action.addEventListener('click', () => {
          llmCredentialRecipeEl.value = item.recipeId;
          llmCredentialNameEl.value = item.credentialName || recipe?.label || '';
          updateLlmCredentialForm();
          llmApiKeyEl.focus();
        });

        row.appendChild(name);
        row.appendChild(meta);
        row.appendChild(status);
        row.appendChild(action);
        credentialListEl.appendChild(row);
      }
    }

    function setPendingAction(action) {
      pendingAction = action || '';
      updateModeUi();
    }

    function renderRuntimeModes() {
      runtimeModeGridEl.innerHTML = '';
      for (const mode of setupModes) {
        const label = document.createElement('label');
        label.className = 'mode-option';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'runtimeMode';
        input.value = mode.id;
        input.checked = mode.id === runtimeMode;
        input.addEventListener('change', () => {
          runtimeMode = mode.id;
          setError('');
          updateModeUi();
        });

        const title = document.createElement('span');
        title.className = 'mode-label';
        title.textContent = mode.label;

        const description = document.createElement('span');
        description.className = 'mode-description';
        description.textContent = mode.description;

        label.appendChild(input);
        label.appendChild(title);
        label.appendChild(description);
        runtimeModeGridEl.appendChild(label);
      }
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
        instanceName: currentConfig.instanceName || '',
        host: normalizeHost(hostEl.value),
        apiKey: (apiKeyEl.value || '').trim(),
        projectId: projectEl.value || '',
        projectName: readSelectedProjectName() || currentConfig.projectName || '',
        syncFolder: (syncFolderEl.value || '').trim() || 'workflows',
        verificationStatus: currentConfig.verificationStatus || 'unverified',
        verificationLabel: currentConfig.verificationLabel || 'Not verified yet'
      };
    }

    function applyConfig(config) {
      currentConfig = cloneConfig(config);
      hostEl.value = currentConfig.host;
      apiKeyEl.value = currentConfig.apiKey;
      syncFolderEl.value = currentConfig.syncFolder || 'workflows';
      verificationStatusEl.textContent = currentConfig.verificationLabel || 'Not verified yet';
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
      const isConnectExisting = runtimeMode === 'connect-existing';
      const isManagedLocal = runtimeMode === 'managed-local';
      const isGenerationOnly = runtimeMode === 'generation-only';

      saveBtn.textContent = pendingAction === 'save'
        ? (isManagedLocal ? 'Preparing...' : (draftMode ? 'Adding...' : 'Saving...'))
        : isManagedLocal
          ? 'Prepare and activate managed n8n'
          : 'Save and activate config';
      runtimePrimaryActionBtn.textContent = pendingAction === 'save'
        ? (isManagedLocal ? 'Preparing local n8n...' : 'Saving mode...')
        : isManagedLocal
          ? 'Prepare local n8n'
          : isGenerationOnly
            ? 'Use generation-only mode'
            : 'Configure existing instance';
      newInstanceBtn.textContent = draftMode ? 'Cancel add' : 'Add instance';
      loadBtn.textContent = pendingAction === 'loadProjects' ? 'Loading...' : 'Load projects';
      deleteBtn.textContent = pendingAction === 'deleteInstance' ? 'Deleting...' : 'Delete config';
      loadBtn.disabled = isBusy || !normalizeHost(hostEl.value) || !(apiKeyEl.value || '').trim();
      saveBtn.disabled = isBusy;
      runtimePrimaryActionBtn.disabled = isBusy;
      loadCredentialsBtn.disabled = isBusy;
      setupLlmCredentialBtn.disabled = isBusy || !llmCredentialRecipeEl.value || !(llmApiKeyEl.value || '').trim();
      newInstanceBtn.disabled = isBusy || isManagedLocal;
      deleteBtn.disabled = isBusy || draftMode || !selectedInstanceId;
      instanceSelectEl.disabled = isBusy || !instances.length;
      hostEl.disabled = isBusy;
      apiKeyEl.disabled = isBusy;
      syncFolderEl.disabled = isBusy;
      projectEl.disabled = isBusy || !projects.length;
      const runtimeDisabled = !isConnectExisting;
      hostEl.disabled = hostEl.disabled || runtimeDisabled;
      apiKeyEl.disabled = apiKeyEl.disabled || runtimeDisabled;
      loadBtn.disabled = loadBtn.disabled || runtimeDisabled;
      projectFieldEl.classList.toggle('hidden', isManagedLocal);
      saveBtn.disabled = isBusy;
      existingInstanceCardEl.classList.toggle('hidden', isGenerationOnly);
      connectionFieldsEl.classList.toggle('hidden', !isConnectExisting);
      instanceLibraryPanelEl.classList.toggle('hidden', isManagedLocal);
      newInstanceBtn.classList.toggle('hidden', isManagedLocal);
      runtimePrimaryActionBtn.classList.toggle('hidden', isManagedLocal);
      credentialsCardEl.classList.toggle('hidden', isGenerationOnly);
      instanceCardTitleEl.textContent = isManagedLocal ? 'Managed workspace sync' : 'Instance';
      instanceCardCopyEl.textContent = isManagedLocal
        ? 'Choose the local sync folder. n8n-manager supplies the local URL and API key, and the extension saves the active workspace config after setup.'
        : 'Enter the URL and API key of an existing n8n instance. Select a saved instance to edit it, then save to make it active in this workspace.';
      runtimePathPanelEl.classList.toggle('hidden', false);
      runtimeOptionsEl.classList.toggle('hidden', !isManagedLocal);

      activeSummaryTitleEl.textContent = 'Active instance';
      activeSummaryNameEl.textContent = activeLabel;
      activeSummaryHostEl.textContent = activeConfig.host
        ? activeConfig.host
        : 'Save and activate an instance to use it in this workspace.';
      activeSummaryStatusEl.textContent = activeConfig.verificationLabel || '';

      switchHelpEl.textContent = savedCount
        ? 'Choose a saved instance to edit. It becomes active when you save.'
        : 'Add your first instance to start configuring this workspace.';

      if (isManagedLocal) {
        switchHelpEl.textContent = 'n8n-manager will own local runtime setup and starter credential readiness.';
      } else if (isGenerationOnly) {
        switchHelpEl.textContent = 'Workflow generation and validation stay available; runtime actions remain disabled.';
      }

      for (const option of runtimeModeGridEl.querySelectorAll('.mode-option')) {
        const input = option.querySelector('input[name="runtimeMode"]');
        const selected = input && input.value === runtimeMode;
        option.classList.toggle('selected', !!selected);
      }

      renderRuntimePathCopy();
    }

    function renderRuntimePathCopy() {
      runtimePathNextEl.innerHTML = '';
      const steps = [];

      if (runtimeMode === 'managed-local') {
        runtimePathTitleEl.textContent = 'Managed local n8n';
        runtimePathCopyEl.textContent = 'No host or API key is needed here. n8n-manager owns local runtime setup, lifecycle, and starter credential readiness for this facade.';
        steps.push('Prepare the local runtime with n8n-manager.');
        steps.push('The extension stores the managed URL/API key, auto-selects the n8n project, and uses the sync folder value from this form.');
        steps.push('Workflow list and runtime actions become available once initialization completes.');
      } else if (runtimeMode === 'generation-only') {
        runtimePathTitleEl.textContent = 'Generation only';
        runtimePathCopyEl.textContent = 'No live n8n runtime is configured. Workflow generation, validation, documentation, and agent context remain available.';
        steps.push('Save this mode for the workspace.');
        steps.push('Generate and validate workflows without deploy, run, or credential actions.');
        steps.push('Switch to a runtime mode later when execution is needed.');
      } else {
        runtimePathTitleEl.textContent = 'Connect existing n8n';
        runtimePathCopyEl.textContent = 'Use this path when you already have an n8n instance and API key. The extension will store the connection and activate it for this workspace.';
        steps.push('Enter the n8n host URL and API key below.');
        steps.push('Load projects, choose the project and sync folder.');
        steps.push('Save and activate the instance.');
      }

      for (const step of steps) {
        const item = document.createElement('li');
        item.textContent = step;
        runtimePathNextEl.appendChild(item);
      }
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
        const verificationSuffix = instance.verificationStatus === 'verified'
          ? ' [verified]'
          : instance.verificationStatus === 'failed'
            ? ' [unreachable]'
            : '';
        opt.textContent = instance.name + activeSuffix + verificationSuffix + (instance.host ? ' - ' + instance.host : '');
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
              verificationStatus: nextActive.verificationStatus,
              verificationLabel: nextActive.verificationLabel,
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
        verificationStatus: selectedInstance.verificationStatus,
        verificationLabel: selectedInstance.verificationLabel,
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
    hostEl.addEventListener('blur', () => requestProjectsLoad(false));
    apiKeyEl.addEventListener('blur', () => requestProjectsLoad(false));
    projectEl.addEventListener('change', updateModeUi);
    renderRuntimeModes();

    loadCredentialsBtn.addEventListener('click', () => {
      if (pendingAction) {
        return;
      }
      credentialListEl.innerHTML = '<div class="hint">Loading credential readiness...</div>';
      vscode.postMessage({ type: 'loadCredentialInventory' });
    });
    llmCredentialRecipeEl.addEventListener('change', () => {
      const recipe = getSelectedLlmRecipe();
      llmCredentialNameEl.value = recipe?.label || '';
      updateLlmCredentialForm();
      updateModeUi();
    });
    llmApiKeyEl.addEventListener('input', updateModeUi);
    setupLlmCredentialBtn.addEventListener('click', () => {
      if (pendingAction) {
        return;
      }
      const recipe = getSelectedLlmRecipe();
      const apiKey = (llmApiKeyEl.value || '').trim();
      if (!recipe || !apiKey) {
        setError('Choose an LLM provider and enter an API key.');
        return;
      }

      const values = { apiKey };
      if ((llmBaseUrlEl.value || '').trim()) {
        values.url = (llmBaseUrlEl.value || '').trim();
      }

      setError('');
      setPendingAction('credential');
      vscode.postMessage({
        type: 'ensureCredential',
        recipeId: recipe.id,
        credentialName: (llmCredentialNameEl.value || '').trim() || recipe.label,
        values,
      });
    });

    runtimePrimaryActionBtn.addEventListener('click', () => {
      if (pendingAction) {
        return;
      }

      setError('');

      if (runtimeMode === 'connect-existing') {
        setRuntimeStatus('', '', '');
        hostEl.focus();
        existingInstanceCardEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      setRuntimeStatus(
        'progress',
        runtimeMode === 'managed-local' ? 'Preparing local n8n' : 'Saving generation-only mode',
        runtimeMode === 'managed-local'
          ? 'n8n-manager is resolving local runtime state. This can take a moment when provider setup is wired.'
          : 'Saving the workspace runtime mode.',
        true
      );
      setPendingAction('save');
      vscode.postMessage({
        type: 'configureRuntimeMode',
        mode: runtimeMode,
        tunnel: enableTunnelEl.checked,
        syncFolder: (syncFolderEl.value || '').trim() || 'workflows',
      });
    });

    saveBtn.addEventListener('click', () => {
      if (pendingAction) {
        return;
      }

      setError('');
      const form = readFormState();
      const host = form.host;
      const apiKey = form.apiKey;

      if (runtimeMode !== 'connect-existing') {
        setRuntimeStatus(
          'progress',
          runtimeMode === 'managed-local' ? 'Preparing local n8n' : 'Saving generation-only mode',
          runtimeMode === 'managed-local'
            ? 'n8n-manager is resolving local runtime state. This can take a moment when provider setup is wired.'
            : 'Saving the workspace runtime mode.',
          true
        );
        setPendingAction('save');
        vscode.postMessage({
          type: 'configureRuntimeMode',
          mode: runtimeMode,
          tunnel: enableTunnelEl.checked,
          syncFolder: form.syncFolder,
        });
        return;
      }

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
          verificationStatus: selectedInstance.verificationStatus,
          verificationLabel: selectedInstance.verificationLabel,
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

      if (message.type === 'runtimeModeStarted') {
        setPendingAction('save');
        setRuntimeStatus(
          'progress',
          message.mode === 'managed-local' ? 'Preparing local n8n' : 'Saving runtime mode',
          message.mode === 'managed-local'
            ? 'n8n-manager accepted the request and is preparing runtime state.'
            : 'Saving the workspace runtime mode.',
          true
        );
        return;
      }

      if (message.type === 'runtimeModeSaved') {
        clearPendingAction();
        setSaved(true);
        const instance = message.instance || {};
        const status = message.status || {};
        const activated = message.activatedConfig || {};
        if (message.mode === 'managed-local') {
          const checkMessages = Array.isArray(status.checks)
            ? status.checks
                .map((check) => check && check.message ? check.message : '')
                .filter(Boolean)
                .join(' ')
            : '';
          setRuntimeStatus(
            'success',
            'Local n8n is managed by n8n-manager',
            'Status: ' + (status.status || 'unknown')
              + '. URL: ' + (instance.baseUrl || 'not available yet')
              + '. Container: ' + (instance.containerName || instance.id || 'managed-local')
              + '. Sync folder: ' + (activated.syncFolder || 'workflows')
              + '. Project: ' + (activated.projectName || 'auto-selected')
              + '. ' + (checkMessages || 'Next: initialize AI context and use runtime actions.')
          );
          vscode.postMessage({ type: 'loadCredentialInventory' });
        } else {
          setRuntimeStatus(
            'success',
            'Generation-only mode is active',
            'Workflow generation and validation are available. Deploy, run, and credential actions stay disabled until a runtime mode is selected.'
          );
        }
        return;
      }

      if (message.type === 'credentialInventoryLoaded') {
        renderCredentialInventory(message.items || [], message.recipes || []);
        return;
      }

      if (message.type === 'credentialSaved') {
        clearPendingAction();
        setSaved(true);
        llmApiKeyEl.value = '';
        renderCredentialInventory(message.items || [], message.recipes || []);
        return;
      }

      if (message.type === 'instanceDeleted') {
        clearPendingAction();
        return;
      }

      if (message.type === 'error') {
        clearPendingAction();
        setRuntimeStatus('', '', '');
        setError(message.message || 'Error');
        return;
      }

      if (message.type === 'cancelled') {
        clearPendingAction();
        setRuntimeStatus('', '', '');
        return;
      }
    });

    resetProjectsUi();
    vscode.postMessage({ type: 'loadCredentialInventory' });
    updateModeUi();
  </script>
</body>
</html>`;
  }
}
