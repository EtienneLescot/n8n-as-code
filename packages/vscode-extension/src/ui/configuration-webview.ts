import * as vscode from 'vscode';
import { createN8nManagerFacade } from '@n8n-as-code/manager-adapter';
import { getWorkspaceRoot } from '../utils/state-detection.js';
import type { N8nConfigurationController, N8nConfigurationSnapshot } from '../services/n8n-configuration-controller.js';
import { getConfigurationHtml } from './configuration-webview-html.js';

type UiProject = {
  id: string;
  name: string;
  type?: string;
};

const PERSONAL_PROJECT: UiProject = {
  id: 'personal',
  name: 'Personal',
  type: 'personal',
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

function getNonce(): string {
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
  private readonly _configurationController: N8nConfigurationController;
  private readonly _disposables: vscode.Disposable[] = [];
  private _stateVersion = 0;

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    configurationController: N8nConfigurationController,
  ) {
    this._panel = panel;
    this._context = context;
    this._configurationController = configurationController;

    this._panel.onDidDispose(() => {
      for (const disposable of this._disposables) {
        disposable.dispose();
      }
      this._disposables.length = 0;
      ConfigurationWebview.currentPanel = undefined;
    });

    this._panel.webview.options = { enableScripts: true };
    this._panel.webview.onDidReceiveMessage((message) => {
      void this.handleMessage(message);
    });

    this._panel.webview.html = this.getHtmlForWebview();
    void this.postInitialState();
    this._disposables.push(this._configurationController.onDidChangeSnapshot((event) => {
      void this.postInitialState(event.snapshot);
    }));

    this._panel.onDidChangeViewState(() => {
      if (this._panel.visible) {
        void this.postInitialState();
      }
    });
  }

  public static createOrShow(
    context: vscode.ExtensionContext,
    configurationController: N8nConfigurationController,
  ): void {
    const column = vscode.ViewColumn.One;

    if (ConfigurationWebview.currentPanel) {
      ConfigurationWebview.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'n8nConfiguration',
      'n8n: Configure',
      column,
      { enableScripts: true },
    );

    ConfigurationWebview.currentPanel = new ConfigurationWebview(panel, context, configurationController);
  }

  private async handleMessage(message: unknown): Promise<void> {
    try {
      if (!message || typeof message !== 'object') return;
      const payload = message as Record<string, unknown>;
      const workspaceRoot = getWorkspaceRoot();
      const facade = createN8nManagerFacade({ workspaceRoot });

      switch (payload.type) {
        case 'refreshState':
          await this._configurationController.refresh('webview-refresh', { force: true });
          return;

        case 'loadProjects': {
          const instanceId = String(payload.instanceId || '').trim() || undefined;
          const uiProjects = (await facade.listProjects({
            workspaceRoot,
            instanceId,
            syncFolderDefault: 'workspace',
            consumer: 'vscode',
            autoStart: true,
          })).map((project) => ({
            id: project.id,
            name: project.type === 'personal' ? 'Personal' : (project.name || project.id),
            type: project.type,
          }));
          this._panel.webview.postMessage({
            type: 'projectsLoaded',
            projects: uiProjects,
            selectedProjectId: String(payload.projectId || ''),
            selectedProjectName: String(payload.projectName || ''),
          });
          return;
        }

        case 'saveGlobalInstance':
          const warnings = await this.saveGlobalInstance(payload, facade);
          await this._configurationController.refresh('webview-save-global-instance', { force: true });
          this._panel.webview.postMessage({ type: 'saved' });
          if (warnings.length) {
            this._panel.webview.postMessage({ type: 'error', message: warnings.join('\n') });
          }
          return;

        case 'setGlobalActiveInstance': {
          const instanceId = String(payload.instanceId || '').trim();
          if (!instanceId) throw new Error('Instance is required.');
          await facade.setGlobalActiveInstance(instanceId);
          await this._configurationController.refresh('webview-set-global-active', { force: true });
          this._panel.webview.postMessage({ type: 'saved' });
          return;
        }

        case 'manageInstanceRuntime': {
          const instanceId = String(payload.instanceId || '').trim();
          const action = String(payload.action || '').trim();
          if (!instanceId) throw new Error('Instance is required.');
          if (!['start', 'stop', 'restart'].includes(action)) throw new Error('Unsupported instance action.');
          const actionLabel = action === 'start' ? 'Starting' : action === 'stop' ? 'Stopping' : 'Restarting';
          await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `${actionLabel} n8n instance`,
            cancellable: false,
          }, async () => {
            if (action === 'start') await facade.startInstance(instanceId);
            if (action === 'stop') await facade.stopInstance(instanceId);
            if (action === 'restart') await facade.restartInstance(instanceId);
          });
          await this._configurationController.refresh(`webview-${action}-instance`, { force: true });
          this._panel.webview.postMessage({ type: 'saved' });
          return;
        }

        case 'refreshPublicUrl': {
          const instanceId = String(payload.instanceId || '').trim();
          if (!instanceId) throw new Error('Instance is required.');
          const access = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Refreshing public URL',
            cancellable: false,
          }, () => facade.resolveInstanceAccess({
            workspaceRoot,
            instanceId,
            syncFolderDefault: 'workspace',
            consumer: 'vscode',
            mode: 'reconcile',
          }));
          await this._configurationController.refresh('webview-refresh-public-url', { force: true });
          this._panel.webview.postMessage({ type: 'saved' });
          if (access.warnings.length) {
            this._panel.webview.postMessage({ type: 'error', message: access.warnings.join('\n') });
          }
          return;
        }

        case 'openExternal': {
          const url = String(payload.url || '').trim();
          if (!url) return;
          await vscode.env.openExternal(vscode.Uri.parse(url));
          return;
        }

        case 'saveWorkspaceContext': {
          if (!workspaceRoot) throw new Error('Open a workspace before saving workspace n8n settings.');
          const syncFolder = String(payload.syncFolder || '').trim();
          await facade.writeWorkspaceOverrides({
            version: 3,
            activeInstanceId: String(payload.activeInstanceId || '').trim() || undefined,
            syncFolder: syncFolder || undefined,
            projectId: String(payload.projectId || '').trim() || undefined,
            projectName: String(payload.projectName || '').trim() || undefined,
            folderSync: Boolean(payload.folderSync),
          }, workspaceRoot);
          await clearLegacyWorkspaceSettings();
          await this._context.workspaceState.update('n8n.suppressSettingsChangedOnce', true);
          await this._configurationController.refresh('webview-save-workspace-context', { force: true });
          this._panel.webview.postMessage({ type: 'saved' });
          return;
        }

        case 'deleteInstance': {
          const instanceId = String(payload.instanceId || '').trim();
          if (!instanceId) throw new Error('Instance is required.');
          const instanceName = String(payload.instanceName || instanceId).trim();
          const confirmation = await vscode.window.showWarningMessage(
            `Delete global n8n instance "${instanceName}"?`,
            { modal: true },
            'Delete',
          );
          if (confirmation !== 'Delete') {
            this._panel.webview.postMessage({ type: 'cancelled' });
            return;
          }
          const workspaceOverrides = workspaceRoot ? await facade.readWorkspaceOverrides(workspaceRoot) : undefined;
          await facade.deleteInstance(instanceId);
          if (workspaceRoot && workspaceOverrides?.activeInstanceId === instanceId) {
            await facade.writeWorkspaceOverrides({
              ...workspaceOverrides,
              activeInstanceId: undefined,
            }, workspaceRoot);
          }
          await this._configurationController.refresh('webview-delete-instance', { force: true });
          this._panel.webview.postMessage({ type: 'instanceDeleted', instanceId });
          return;
        }

        case 'openSettings':
          await vscode.commands.executeCommand('n8n.openSettings');
          return;
      }
    } catch (error: any) {
      await this._configurationController.refresh('webview-error-refresh', { force: true }).catch(() => undefined);
      this._panel.webview.postMessage({
        type: 'error',
        message: error?.message || 'Unexpected error',
      });
    }
  }

  private async saveGlobalInstance(
    payload: Record<string, unknown>,
    facade: ReturnType<typeof createN8nManagerFacade>,
  ): Promise<string[]> {
    const mode = String(payload.mode || 'existing').trim();
    const host = normalizeHost(String(payload.host || ''));
    const apiKey = String(payload.apiKey || '').trim();
    const instanceId = String(payload.instanceId || '').trim() || undefined;
    const instanceName = String(payload.instanceName || '').trim() || undefined;
    const setActive = Boolean(payload.setActive);

    if (mode === 'managed-local-docker') {
      const previousActive = await facade.getGlobalActiveInstance();
      const instance = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Preparing managed local n8n',
        cancellable: false,
      }, () => facade.setup({
        mode: 'managed-local',
        instanceId,
        instanceName,
        tunnel: Boolean(payload.tunnel),
      }));

      if (instanceName) {
        await facade.upsertInstance({ id: instance.id, name: instanceName, publicUrlEnabled: Boolean(payload.tunnel) }, { setActive });
      }
      if (!setActive && previousActive?.id && previousActive.id !== instance.id) {
        await facade.setGlobalActiveInstance(previousActive.id);
      }
      return Array.isArray(instance.warnings) ? instance.warnings : [];
    }

    if (mode === 'existing' && !instanceId && (!host || !apiKey)) {
      throw new Error('Host and API key are required for a new existing n8n instance.');
    }

    await facade.upsertInstance({
      id: instanceId,
      name: instanceName,
      mode: mode === 'generation-only' ? 'generation-only' : 'existing',
      baseUrl: host || undefined,
      apiKey: apiKey || undefined,
    }, { setActive });
    return [];
  }

  private async postInitialState(snapshot?: N8nConfigurationSnapshot): Promise<void> {
    const stateVersion = ++this._stateVersion;
    const currentSnapshot = snapshot ?? this._configurationController.getSnapshot()
      ?? await this._configurationController.refresh('webview-open', { force: true });
    const workspaceRoot = getWorkspaceRoot();
    const facade = createN8nManagerFacade({ workspaceRoot });
    const globalConfig = currentSnapshot.global;
    const workspaceOverrides = currentSnapshot.workspace;
    const effectiveContext = currentSnapshot.effective;
    const instances = await Promise.all(globalConfig.instances.map(async (instance) => {
      try {
        const runtime = await facade.status({ instanceId: instance.id });
        const access = await facade.resolveInstanceAccess({ instanceId: instance.id, workspaceRoot, mode: 'observe' });
        const displayUrl = access.authUrl || (access.publicUrlEnabled ? '' : access.apiBaseUrl || '');
        return {
          ...instance,
          host: displayUrl,
          displayUrl,
          authBridgePublicUrl: access.authUrl,
          verificationStatus: instance.verification?.status || 'unverified',
          verificationLabel: instance.verification?.status === 'verified'
            ? 'Verified'
            : instance.verification?.status === 'failed'
              ? 'Verification failed'
              : 'Not verified yet',
          runtimeStatus: runtime.status,
          runtimeReady: 'ready' in runtime ? runtime.ready : runtime.status === 'ready',
          runtimeBlockedCode: 'blocked' in runtime ? runtime.blocked?.code : undefined,
          runtimeBlockedMessage: 'blocked' in runtime ? runtime.blocked?.message : undefined,
          runtimeWarnings: access.warnings.length ? access.warnings : ('warnings' in runtime ? runtime.warnings : undefined),
          tunnelRunning: access.tunnel?.running,
          tunnelPublicUrl: access.publicN8nUrl || instance.tunnelPublicUrl,
          access,
        };
      } catch (error: any) {
        return {
          ...instance,
          host: instance.tunnelPublicUrl || instance.baseUrl || '',
          verificationStatus: instance.verification?.status || 'unverified',
          verificationLabel: instance.verification?.status === 'verified'
            ? 'Verified'
            : instance.verification?.status === 'failed'
              ? 'Verification failed'
              : 'Not verified yet',
          runtimeStatus: 'unknown',
          runtimeReady: false,
          runtimeBlockedMessage: error?.message || 'Runtime status unavailable.',
        };
      }
    }));

    this._panel.webview.postMessage({
      type: 'init',
      stateVersion,
      global: {
        activeInstanceId: globalConfig.activeInstanceId || '',
        defaultSyncFolder: globalConfig.defaultSyncFolder,
        instances,
      },
      workspace: workspaceOverrides,
      effective: effectiveContext ? {
        activeInstanceId: effectiveContext.activeInstanceId,
        activeInstanceName: effectiveContext.activeInstanceName,
        host: effectiveContext.host,
        apiBaseUrl: effectiveContext.apiBaseUrl ?? effectiveContext.host,
        publicBaseUrl: effectiveContext.publicBaseUrl || '',
        syncFolder: effectiveContext.syncFolder,
        projectId: effectiveContext.projectId || '',
        projectName: effectiveContext.projectName || '',
        sources: effectiveContext.sources,
      } : undefined,
    });
  }

  private getHtmlForWebview(): string {
    return getConfigurationHtml(getNonce());
  }
}
