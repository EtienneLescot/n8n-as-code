import * as vscode from 'vscode';
import { createN8nManagerFacade } from '@n8n-as-code/manager-adapter';
import { ConfigService, N8nApiClient, resolveInstanceIdentifier } from 'n8nac';
import { getWorkspaceRoot } from '../utils/state-detection.js';
import type { N8nConfigurationController, N8nConfigurationSnapshot } from '../services/n8n-configuration-controller.js';
import { YagrProviderService, normalizeYagrProviderId, type YagrModelProvider } from '../services/yagr-provider-service.js';
import { getConfigurationHtml } from './configuration-webview-html.js';
import { getCanonicalProjectName, getProjectDetail, getProjectDisplayLabel } from '../utils/project-display.js';

type UiProject = {
  id: string;
  name: string;
  type?: string;
  detail?: string;
  displayName?: string;
};

const PERSONAL_PROJECT: UiProject = {
  id: 'personal',
  name: 'Personal',
  type: 'personal',
  detail: 'Type: personal | ID: personal',
  displayName: 'Personal',
};

function toUiProject(project: { id: string; name?: string; title?: string; displayName?: string; label?: string; type?: string; }): UiProject {
  const name = project.name || project.title || project.displayName || project.label || '';
  const displayable = { id: project.id, name, type: project.type };
  return {
    id: project.id,
    name: getCanonicalProjectName(displayable),
    type: project.type,
    detail: getProjectDetail(displayable),
    displayName: getProjectDisplayLabel(displayable),
  };
}

function dedupeUiProjects(projects: UiProject[]): UiProject[] {
  const byId = new Map<string, UiProject>();
  for (const project of projects) {
    if (!project.id) continue;
    const existing = byId.get(project.id);
    if (!existing || (!existing.name && project.name) || existing.id === 'personal') {
      byId.set(project.id, project);
    }
  }

  const personal = [...byId.values()].filter((project) => project.id === 'personal' || project.type === 'personal');
  if (personal.length > 1) {
    const preferred = personal.find((project) => project.id !== 'personal') ?? personal[0];
    for (const project of personal) {
      if (project.id !== preferred.id) byId.delete(project.id);
    }
  }

  return [...byId.values()];
}

async function loadProjectsFromApi(host: string, apiKey: string): Promise<UiProject[]> {
  const client = new N8nApiClient({ host, apiKey });
  await client.assertApiAccess();
  return (await client.getProjects()).map(toUiProject);
}

function normalizeHost(host: string): string {
  const trimmed = (host || '').trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function normalizeSyncRoot(syncRoot: string): string {
  const trimmed = String(syncRoot || '').trim().replace(/\\/g, '/').replace(/\/+$/g, '');
  return trimmed || 'workflows';
}

function envVarSlug(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function readWorkspaceTargetApiKey(targetId: string, targetName: string): string | undefined {
  const candidates = [
    `N8NAC_TARGET_${envVarSlug(targetId)}_API_KEY`,
    `N8NAC_TARGET_${envVarSlug(targetName)}_API_KEY`,
  ];
  for (const key of candidates) {
    const value = process.env[key]?.trim().replace(/^['"]|['"]$/g, '');
    if (value) return value;
  }
  return undefined;
}

async function readLegacyN8nSettings(context: vscode.ExtensionContext): Promise<{ host: string; apiKey: string }> {
  const config = vscode.workspace.getConfiguration('n8n');
  const configuredApiKey = String(config.get<string>('apiKey') || '').trim();
  const apiKey = configuredApiKey || await readLegacySecretApiKey(context);
  return {
    host: normalizeHost(String(config.get<string>('host') || '')),
    apiKey,
  };
}

async function readLegacySecretApiKey(context: vscode.ExtensionContext): Promise<string> {
  const candidates = ['n8n.apiKey', 'apiKey', 'n8n-as-code.apiKey', 'n8nAsCode.apiKey', 'n8nApiKey'];
  for (const key of candidates) {
    const value = (await context.secrets.get(key))?.trim();
    if (value) return value;
  }
  return '';
}

function preserveMigratedLegacyApiKey(configService: ConfigService, settings: { host: string; apiKey: string }, instanceId?: string): void {
  if (!settings.apiKey) return;
  const environment = configService.resolveEnvironment();
  const environmentHost = normalizeHost(environment.host || '');
  if (!environmentHost) return;
  if (settings.host && normalizeHost(settings.host) !== environmentHost) return;
  configService.saveLocalConfig({ host: environmentHost }, {
    instanceId,
    instanceName: environment.activeInstanceName || environment.instanceTargetName,
    createNew: !instanceId,
    setActive: false,
    apiKey: settings.apiKey,
  });
}

async function clearLegacyWorkspaceSettings(): Promise<string[]> {
  const config = vscode.workspace.getConfiguration('n8n');
  const keys: Array<'host' | 'apiKey' | 'syncFolder' | 'projectId' | 'projectName'> = [
    'host',
    'apiKey',
    'syncFolder',
    'projectId',
    'projectName',
  ];
  const cleared: string[] = [];

  for (const key of keys) {
    const inspected = config.inspect<string>(key);
    if (inspected?.workspaceValue !== undefined) {
      await config.update(key, undefined, vscode.ConfigurationTarget.Workspace);
      cleared.push(`n8n.${key}`);
    }
    if (inspected?.workspaceFolderValue !== undefined) {
      await config.update(key, undefined, vscode.ConfigurationTarget.WorkspaceFolder);
      cleared.push(`n8n.${key}`);
    }
  }
  return [...new Set(cleared)];
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
  private readonly _providerService: YagrProviderService;
  private readonly _disposables: vscode.Disposable[] = [];
  private _stateVersion = 0;
  private _initialTab: string | undefined;

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    configurationController: N8nConfigurationController,
    initialTab?: string,
  ) {
    this._panel = panel;
    this._context = context;
    this._configurationController = configurationController;
    this._providerService = new YagrProviderService(context);
    this._initialTab = initialTab;

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
    initialTab?: string,
  ): void {
    const column = vscode.ViewColumn.One;

    if (ConfigurationWebview.currentPanel) {
      ConfigurationWebview.currentPanel._panel.reveal(column);
      if (initialTab) {
        ConfigurationWebview.currentPanel._panel.webview.postMessage({ type: 'activeTab', tab: initialTab });
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'n8nConfiguration',
      'n8n: Configure',
      column,
      { enableScripts: true },
    );

    ConfigurationWebview.currentPanel = new ConfigurationWebview(panel, context, configurationController, initialTab);
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

        case 'migrateLegacyWorkspaceConfig': {
          if (!workspaceRoot) throw new Error('Open a workspace before migrating legacy n8n-as-code config.');
          const configService = new ConfigService(workspaceRoot);
          const plan = configService.detectLegacyWorkspaceConfig();
          if (!plan) {
            this._panel.webview.postMessage({ type: 'saved' });
            await this._configurationController.refresh('webview-migrate-legacy-not-needed', { force: true });
            return;
          }
          const confirmation = await vscode.window.showWarningMessage(
            'Migrate legacy n8n-as-code config? A backup will be created before changing n8nac-config.json.',
            { modal: true },
            'Migrate workspace',
          );
          if (confirmation !== 'Migrate workspace') {
            this._panel.webview.postMessage({ type: 'cancelled' });
            return;
          }
          const legacySettings = await readLegacyN8nSettings(this._context);
          const result = configService.migrateLegacyWorkspaceConfig({ write: true });
          if (result.status === 'migrated') {
            const environmentHost = normalizeHost(configService.resolveEnvironment().host || '');
            const migratedInstance = result.instances.find((instance) => normalizeHost(instance.host || '') === environmentHost);
            preserveMigratedLegacyApiKey(configService, legacySettings, migratedInstance?.id);
          }
          await clearLegacyWorkspaceSettings();
          await this._configurationController.refresh('webview-migrate-legacy', { force: true });
          this._panel.webview.postMessage({
            type: 'legacyMigrationCompleted',
            backupPath: result.status === 'migrated' ? result.backupPath : '',
          });
          return;
        }

        case 'loadProjects': {
          const scope = String(payload.scope || 'workspace');
          const requestId = Number(payload.requestId || 0);
          const selectedProjectId = String(payload.projectId || '');
          const selectedProjectName = String(payload.projectName || '');
          const postProjectsLoaded = (projects: UiProject[], fallbackProjectId = '') => {
            this._panel.webview.postMessage({
              type: 'projectsLoaded',
              scope,
              requestId,
              projects: dedupeUiProjects(projects),
              selectedProjectId: selectedProjectId || fallbackProjectId,
              selectedProjectName: selectedProjectName || (fallbackProjectId === 'personal' ? 'Personal' : ''),
            });
          };
          let instanceId = String(payload.instanceId || '').trim() || undefined;
          const host = normalizeHost(String(payload.host || ''));
          const apiKey = String(payload.apiKey || '').trim();
          if (host) {
            if (!apiKey) {
              if (scope === 'environment') throw new Error('Missing API key. Add an API key before selecting project or sync settings.');
              postProjectsLoaded([PERSONAL_PROJECT], 'personal');
              return;
            }
            postProjectsLoaded(await loadProjectsFromApi(host, apiKey));
            return;
          }
          const instanceTargetId = String(payload.instanceTargetId || '').trim();
          if (!instanceId && workspaceRoot && instanceTargetId) {
            const configService = new ConfigService(workspaceRoot);
            const environmentId = String(payload.environmentId || '').trim();
            const environment = environmentId ? configService.getEnvironment(environmentId) : undefined;
            const targetChanged = Boolean(environment && instanceTargetId && environment.instanceTargetId !== instanceTargetId);
            const target = configService.getInstanceTarget(instanceTargetId || environment?.instanceTargetId || '');
            if (environmentId && !targetChanged) {
              const environment = await configService.prepareEnvironment(environmentId);
              if (!environment.apiKey) throw new Error(`Environment "${environment.environmentName}" needs an API key before projects can be loaded.`);
              postProjectsLoaded(await loadProjectsFromApi(environment.host, environment.apiKey));
              return;
            }
            if (target.kind === 'global-ref') instanceId = target.instanceRef;
            if (target.kind === 'embedded') {
              const apiKey = readWorkspaceTargetApiKey(target.id, target.name) || configService.getApiKey(target.instance.baseUrl);
              if (!apiKey) {
                if (scope === 'environment') throw new Error('Missing API key. Add an API key before selecting project or sync settings.');
                postProjectsLoaded([PERSONAL_PROJECT], 'personal');
                return;
              }
              postProjectsLoaded(await loadProjectsFromApi(target.instance.baseUrl, apiKey));
              return;
            }
          }
          const uiProjects = (await facade.listProjects({
            workspaceRoot,
            instanceId,
            syncFolderDefault: 'workspace',
            consumer: 'vscode',
            autoStart: true,
          })).map(toUiProject);
          postProjectsLoaded(uiProjects);
          return;
        }

        case 'loadEnvironmentEditCredentials': {
          if (!workspaceRoot) throw new Error('Open a workspace before editing workspace environments.');
          const environmentId = String(payload.environmentId || '').trim();
          if (!environmentId) throw new Error('Environment is required.');
          const environment = new ConfigService(workspaceRoot).resolveEnvironment(environmentId);
          this._panel.webview.postMessage({
            type: 'environmentEditCredentials',
            environmentId,
            host: normalizeHost(environment.host || ''),
            apiKey: environment.apiKey || '',
          });
          return;
        }

        case 'saveInstanceTarget': {
          if (!workspaceRoot) throw new Error('Open a workspace before saving workspace instance targets.');
          const configService = new ConfigService(workspaceRoot);
          const targetId = String(payload.targetId || '').trim();
          const requestedKind = String(payload.targetKind || '').trim();
          const input = {
            name: String(payload.name || '').trim(),
            instanceRef: String(payload.instanceRef || '').trim() || undefined,
            baseUrl: normalizeHost(String(payload.baseUrl || '')) || undefined,
            description: String(payload.description || '').trim() || undefined,
          };
          if (targetId) {
            const existing = configService.getInstanceTarget(targetId);
            if (requestedKind && requestedKind !== existing.kind) {
              throw new Error('Changing an instance target type is not supported. Create a new target instead.');
            }
            configService.updateInstanceTarget(targetId, input);
          } else {
            configService.addInstanceTarget(input);
          }
          await clearLegacyWorkspaceSettings();
          await this._configurationController.refresh('webview-save-instance-target', { force: true });
          this._panel.webview.postMessage({ type: 'saved' });
          return;
        }

        case 'deleteInstanceTarget': {
          if (!workspaceRoot) throw new Error('Open a workspace before deleting workspace instance targets.');
          const targetId = String(payload.targetId || '').trim();
          if (!targetId) throw new Error('Instance target is required.');
          const configService = new ConfigService(workspaceRoot);
          const target = configService.getInstanceTarget(targetId);
          const confirmation = await vscode.window.showWarningMessage(
            `Remove workspace instance target "${target.name}"?`,
            { modal: true },
            'Remove',
          );
          if (confirmation !== 'Remove') {
            this._panel.webview.postMessage({ type: 'cancelled' });
            return;
          }
          configService.removeInstanceTarget(targetId);
          await this._configurationController.refresh('webview-delete-instance-target', { force: true });
          this._panel.webview.postMessage({ type: 'saved' });
          return;
        }

        case 'saveEnvironment': {
          if (!workspaceRoot) throw new Error('Open a workspace before saving workspace environments.');
          const configService = new ConfigService(workspaceRoot);
          const environmentId = String(payload.environmentId || '').trim();
          let instanceTargetId = String(payload.instanceTargetId || '').trim();
          let currentEnvironmentTargetUrl = '';
          if (environmentId) {
            const existingEnvironment = configService.getEnvironment(environmentId);
            instanceTargetId = existingEnvironment.instanceTargetId;
            const existingTarget = configService.getInstanceTarget(instanceTargetId);
            if (existingTarget.kind === 'embedded') {
              currentEnvironmentTargetUrl = normalizeHost(existingTarget.instance.baseUrl);
            } else {
              const instance = (await facade.listInstances()).find((item) => item.id === existingTarget.instanceRef);
              currentEnvironmentTargetUrl = normalizeHost(instance?.tunnelPublicUrl || instance?.baseUrl || '');
            }
          }
          const instanceId = String(payload.instanceId || '').trim();
          const baseUrl = normalizeHost(String(payload.baseUrl || ''));
          const apiKey = String(payload.apiKey || '').trim();
          const name = String(payload.name || '').trim();
          const projectId = String(payload.projectId || '').trim();
          const projectName = String(payload.projectName || '').trim() || 'Personal';
          if (environmentId && baseUrl && baseUrl !== currentEnvironmentTargetUrl) {
            if (!apiKey) throw new Error('API key is required when replacing the environment URL.');
            instanceTargetId = this.ensureEmbeddedWorkspaceTarget(configService, {
              name: name || baseUrl,
              baseUrl,
            });
          }
          if (!instanceTargetId && instanceId) {
            const instance = (await facade.listInstances()).find((item) => item.id === instanceId);
            if (!instance) throw new Error(`Unknown n8n instance preset: ${instanceId}`);
            if (instance.mode === 'managed-local-docker') {
              const existingTarget = configService.listInstanceTargets().find((target) => target.kind === 'global-ref' && target.instanceRef === instanceId);
              instanceTargetId = existingTarget?.id || configService.addInstanceTarget({
                name: instance.name || instanceId,
                instanceRef: instanceId,
              }).id;
            } else {
              const targetUrl = normalizeHost(instance.tunnelPublicUrl || instance.baseUrl || baseUrl);
              if (!targetUrl) throw new Error('Remote n8n URL is required for this environment.');
              instanceTargetId = this.ensureEmbeddedWorkspaceTarget(configService, {
                name: instance.name || name || targetUrl,
                baseUrl: targetUrl,
              });
            }
          }
          if (!instanceTargetId && baseUrl) {
            const existingPreset = (await facade.listInstances()).find((instance) => normalizeHost(instance.tunnelPublicUrl || instance.baseUrl || '') === baseUrl && instance.mode !== 'managed-local-docker');
            configService.saveLocalConfig({ host: baseUrl }, {
              instanceId: existingPreset?.id,
              instanceName: existingPreset?.name || name || baseUrl,
              createNew: !existingPreset,
              setActive: false,
              apiKey: apiKey || undefined,
            });
            instanceTargetId = this.ensureEmbeddedWorkspaceTarget(configService, {
              name: name || existingPreset?.name || baseUrl,
              baseUrl,
            });
          }
          if (!environmentId && instanceTargetId && baseUrl) {
            const selectedTarget = configService.getInstanceTarget(instanceTargetId);
            const targetInstance = selectedTarget.kind === 'global-ref'
              ? (await facade.listInstances()).find((instance) => instance.id === selectedTarget.instanceRef)
              : undefined;
            if (selectedTarget.kind === 'global-ref' && targetInstance?.mode !== 'managed-local-docker') {
              instanceTargetId = this.ensureEmbeddedWorkspaceTarget(configService, {
                name: selectedTarget.name || name || baseUrl,
                baseUrl,
              });
            }
          }
          if (instanceTargetId && baseUrl && apiKey) {
            const existingPreset = (await facade.listInstances()).find((instance) => normalizeHost(instance.tunnelPublicUrl || instance.baseUrl || '') === baseUrl && instance.mode !== 'managed-local-docker');
            configService.saveLocalConfig({ host: baseUrl }, {
              instanceId: existingPreset?.id,
              instanceName: existingPreset?.name || name || baseUrl,
              createNew: !existingPreset,
              setActive: false,
              apiKey,
            });
          }
          const syncFolder = normalizeSyncRoot(String(payload.syncFolder || '').trim());
          const folderSync = typeof payload.folderSync === 'boolean' ? payload.folderSync : undefined;
          const input = {
            name,
            instanceTarget: instanceTargetId,
            projectId,
            projectName,
            syncFolder,
            folderSync,
            customNodesPath: String(payload.customNodesPath || '').trim() || undefined,
            description: String(payload.description || '').trim() || undefined,
          };
          if (environmentId) {
            configService.updateEnvironment(environmentId, input);
          } else {
            configService.addEnvironment(input);
          }
          await clearLegacyWorkspaceSettings();
          const snapshot = await this._configurationController.refresh('webview-save-environment', { force: true });
          await this.postInitialState(snapshot);
          this._panel.webview.postMessage({ type: 'saved' });
          return;
        }

        case 'pinEnvironment': {
          if (!workspaceRoot) throw new Error('Open a workspace before pinning workspace environments.');
          const environmentId = String(payload.environmentId || '').trim();
          if (!environmentId) throw new Error('Environment is required.');
          new ConfigService(workspaceRoot).pinEnvironment(environmentId);
          await this._configurationController.refresh('webview-pin-environment', { force: true });
          this._panel.webview.postMessage({ type: 'saved' });
          return;
        }

        case 'deleteEnvironment': {
          if (!workspaceRoot) throw new Error('Open a workspace before deleting workspace environments.');
          const environmentId = String(payload.environmentId || '').trim();
          if (!environmentId) throw new Error('Environment is required.');
          const configService = new ConfigService(workspaceRoot);
          const environment = configService.getEnvironment(environmentId);
          const confirmation = await vscode.window.showWarningMessage(
            `Remove workspace environment "${environment.name}"?`,
            { modal: true },
            'Remove',
          );
          if (confirmation !== 'Remove') {
            this._panel.webview.postMessage({ type: 'cancelled' });
            return;
          }
          configService.removeEnvironment(environmentId);
          await this._configurationController.refresh('webview-delete-environment', { force: true });
          this._panel.webview.postMessage({ type: 'saved' });
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
            refreshPublicUrl: true,
          }));
          await this._configurationController.refresh('webview-refresh-public-url', { force: true });
          this._panel.webview.postMessage({ type: 'saved' });
          if (access.warnings.length) {
            this._panel.webview.postMessage({ type: 'error', message: access.warnings.join('\n') });
          }
          return;
        }

        case 'showManagedCredentials': {
          const instanceId = String(payload.instanceId || '').trim();
          if (!instanceId) throw new Error('Instance is required.');
          const credentials = await facade.getManagedOwnerCredentials(instanceId);
          if (!credentials) throw new Error('Managed owner credentials are not available for this instance.');
          this._panel.webview.postMessage({ type: 'managedCredentials', credentials });
          return;
        }

        case 'copyText': {
          const value = String(payload.value || '');
          if (!value) return;
          await vscode.env.clipboard.writeText(value);
          this._panel.webview.postMessage({ type: 'copied' });
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
          if (new ConfigService(workspaceRoot).getWorkspaceConfig().version === 4) {
            throw new Error('This workspace uses environments. Pin or edit an environment instead of saving legacy workspace settings.');
          }
          const syncFolder = String(payload.syncFolder || '').trim();
          await facade.writeWorkspaceOverrides({
            version: 3,
            activeInstanceId: String(payload.activeInstanceId || '').trim() || undefined,
            syncFolder: syncFolder || undefined,
            projectId: String(payload.projectId || '').trim() || undefined,
            projectName: String(payload.projectName || '').trim() || undefined,
            folderSync: Boolean(payload.folderSync),
          }, workspaceRoot);
          const clearedLegacySettings = await clearLegacyWorkspaceSettings();
          await this._context.workspaceState.update('n8n.suppressSettingsChangedOnce', true);
          await this._configurationController.refresh('webview-save-workspace-context', { force: true });
          if (clearedLegacySettings.length > 0) {
            void vscode.window.showInformationMessage(
              `n8n-as-code moved legacy VS Code workspace settings (${clearedLegacySettings.join(', ')}) into n8n-manager plus n8nac-config.json workspace overrides.`,
            );
          }
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

        case 'connectProvider': {
          const provider = normalizeYagrProviderId(String(payload.provider || ''));
          if (!provider) throw new Error('Unsupported provider.');
          const configured = await this._providerService.setupProvider(provider);
          if (configured) {
            await this._providerService.selectModel(provider);
          }
          await this.postInitialState();
          this._panel.webview.postMessage({ type: 'activeTab', tab: 'agent-providers' });
          this._panel.webview.postMessage({ type: 'saved' });
          return;
        }

        case 'disconnectProvider': {
          const provider = normalizeYagrProviderId(String(payload.provider || ''));
          if (!provider) throw new Error('Unsupported provider.');
          await this._providerService.disconnectProvider(provider);
          await this.postInitialState();
          this._panel.webview.postMessage({ type: 'activeTab', tab: 'agent-providers' });
          this._panel.webview.postMessage({ type: 'saved' });
          return;
        }

        case 'selectProviderModel': {
          const provider = normalizeYagrProviderId(String(payload.provider || ''));
          if (!provider) throw new Error('Unsupported provider.');
          const config = vscode.workspace.getConfiguration('n8n.agent');
          await config.update('provider', provider, vscode.ConfigurationTarget.Global);
          await this._providerService.selectModel(provider as YagrModelProvider);
          await this.postInitialState();
          this._panel.webview.postMessage({ type: 'activeTab', tab: 'agent-providers' });
          this._panel.webview.postMessage({ type: 'saved' });
          return;
        }
      }
    } catch (error: any) {
      await this._configurationController.refresh('webview-error-refresh', { force: true }).catch(() => undefined);
      this._panel.webview.postMessage({
        type: 'error',
        message: error?.message || 'Unexpected error',
      });
    }
  }

  private ensureEmbeddedWorkspaceTarget(configService: ConfigService, input: { name: string; baseUrl: string }): string {
    const baseUrl = normalizeHost(input.baseUrl);
    const existing = configService.listInstanceTargets().find((target) => {
      return target.kind === 'embedded' && normalizeHost(target.instance.baseUrl) === baseUrl;
    });
    if (existing) return existing.id;

    const existingNames = new Set(configService.listInstanceTargets().map((target) => target.name.toLowerCase()));
    const baseName = input.name || baseUrl;
    let name = baseName;
    let counter = 2;
    while (existingNames.has(name.toLowerCase())) {
      name = `${baseName} ${counter}`;
      counter += 1;
    }
    return configService.addInstanceTarget({ name, baseUrl }).id;
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
    const workspaceRoot = getWorkspaceRoot();

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

      if (workspaceRoot && instance.baseUrl) {
        await new ConfigService(workspaceRoot).getOrCreateInstanceIdentifier(instance.baseUrl, instance.id).catch(() => undefined);
      }

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

    const identifierResolution = host && apiKey
      ? await resolveInstanceIdentifier({ host, apiKey })
      : undefined;

    await facade.upsertInstance({
      id: instanceId,
      name: instanceName,
      mode: mode === 'generation-only' ? 'generation-only' : 'existing',
      baseUrl: host || undefined,
      apiKey: apiKey || undefined,
      instanceIdentifier: identifierResolution?.identifier,
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
        const access = await facade.resolveInstanceAccess({
          instanceId: instance.id,
          workspaceRoot,
          mode: 'observe',
        });
        const displayUrl = access.authUrl || access.publicN8nUrl || (access.publicUrlEnabled ? '' : access.apiBaseUrl || '');
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
          ownerCredentialsAvailable: Boolean(runtime.instance?.ownerCredentialsAvailable),
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
      legacyMigration: currentSnapshot.legacyMigration,
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
      providers: await this._providerService.listProviderConnectionStates(),
      about: {
        extensionVersion: String(this._context.extension.packageJSON?.version || ''),
        cliVersion: String(this._context.extension.packageJSON?.dependencies?.n8nac || ''),
      },
    });
    if (this._initialTab) {
      this._panel.webview.postMessage({ type: 'activeTab', tab: this._initialTab });
      this._initialTab = undefined;
    }
  }

  private getHtmlForWebview(): string {
    return getConfigurationHtml(getNonce());
  }
}
