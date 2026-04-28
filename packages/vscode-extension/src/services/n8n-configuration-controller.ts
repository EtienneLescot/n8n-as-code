import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  createN8nManagerFacade,
  resolveN8nManagerConfigurationPaths,
} from '@n8n-as-code/manager-adapter';

type N8nManagerFacade = ReturnType<typeof createN8nManagerFacade>;
type N8nGlobalConfig = Awaited<ReturnType<N8nManagerFacade['getGlobalConfig']>>;
type N8nWorkspaceOverrides = Awaited<ReturnType<N8nManagerFacade['readWorkspaceOverrides']>>;
type PreparedN8nContext = Awaited<ReturnType<N8nManagerFacade['prepareEffectiveContext']>>;
type EffectiveN8nContext = PreparedN8nContext['context'];

export interface N8nConfigurationSnapshot {
  workspaceRoot?: string;
  global: N8nGlobalConfig;
  workspace: N8nWorkspaceOverrides;
  effective?: EffectiveN8nContext;
  runtime?: PreparedN8nContext['runtime'];
  diagnostics?: PreparedN8nContext['diagnostics'];
  hasWorkspaceConfig: boolean;
  hasValidConnection: boolean;
  signature: string;
  runtimeSignature: string;
  error?: string;
}

export interface N8nConfigurationChangeEvent {
  snapshot: N8nConfigurationSnapshot;
  previous?: N8nConfigurationSnapshot;
  reason: string;
}

export class N8nConfigurationController implements vscode.Disposable {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<N8nConfigurationChangeEvent>();
  readonly onDidChangeSnapshot = this.onDidChangeEmitter.event;

  private readonly disposables: vscode.Disposable[] = [];
  private readonly watcherDisposables: vscode.Disposable[] = [];
  private refreshTimer?: NodeJS.Timeout;
  private snapshot?: N8nConfigurationSnapshot;

  constructor(
    private readonly outputChannel?: vscode.OutputChannel,
  ) {}

  start(): void {
    this.rebuildWatchers();
    this.disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.rebuildWatchers();
      this.scheduleRefresh('workspace-folders-changed');
    }));
    this.scheduleRefresh('startup');
  }

  getSnapshot(): N8nConfigurationSnapshot | undefined {
    return this.snapshot;
  }

  async refresh(reason = 'manual', options: { force?: boolean } = {}): Promise<N8nConfigurationSnapshot> {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }

    const previous = this.snapshot;
    const next = await this.readSnapshot();
    this.snapshot = next;

    if (options.force || !previous || previous.signature !== next.signature || previous.error !== next.error) {
      this.outputChannel?.appendLine(`[n8n] Configuration snapshot refreshed (${reason}).`);
      this.onDidChangeEmitter.fire({ snapshot: next, previous, reason });
    }

    return next;
  }

  scheduleRefresh(reason = 'watcher'): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.refresh(reason).catch((error: any) => {
        this.outputChannel?.appendLine(`[n8n] Configuration refresh failed: ${error?.message || error}`);
      });
    }, 120);
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    this.disposeWatchers();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.onDidChangeEmitter.dispose();
  }

  private async readSnapshot(): Promise<N8nConfigurationSnapshot> {
    const workspaceRoot = getWorkspaceRoot();
    const facade = createN8nManagerFacade({ workspaceRoot });
    const hasWorkspaceConfig = workspaceRoot
      ? fs.existsSync(path.join(workspaceRoot, 'n8nac-config.json'))
      : false;

    try {
      const global = await facade.getGlobalConfig();
      const workspace = workspaceRoot ? await facade.readWorkspaceOverrides(workspaceRoot) : { version: 3 as const };
      const prepared = await facade.prepareEffectiveContext({
        workspaceRoot,
        syncFolderDefault: 'workspace',
        consumer: 'vscode',
        autoStart: false,
      }).catch(() => undefined);
      const effective = prepared?.context;
      const hasValidConnection = Boolean(effective?.host && effective.apiKey && !prepared?.runtime.blocked);
      return this.buildSnapshot({
        workspaceRoot,
        global,
        workspace,
        effective,
        runtime: prepared?.runtime,
        diagnostics: prepared?.diagnostics,
        hasWorkspaceConfig,
        hasValidConnection,
      });
    } catch (error: any) {
      const global = await facade.getGlobalConfig().catch(() => ({
        version: 1 as const,
        defaultSyncFolder: '',
        instances: [],
      }));
      const workspace = workspaceRoot
        ? await facade.readWorkspaceOverrides(workspaceRoot).catch(() => ({ version: 3 as const }))
        : { version: 3 as const };
      return this.buildSnapshot({
        workspaceRoot,
        global,
        workspace,
        hasWorkspaceConfig,
        hasValidConnection: false,
        error: error?.message || String(error),
      });
    }
  }

  private buildSnapshot(input: {
    workspaceRoot?: string;
    global: N8nGlobalConfig;
    workspace: N8nWorkspaceOverrides;
    effective?: EffectiveN8nContext;
    runtime?: PreparedN8nContext['runtime'];
    diagnostics?: PreparedN8nContext['diagnostics'];
    hasWorkspaceConfig: boolean;
    hasValidConnection: boolean;
    error?: string;
  }): N8nConfigurationSnapshot {
    const runtimeSignature = JSON.stringify({
      workspaceRoot: input.workspaceRoot || '',
      activeInstanceId: input.effective?.activeInstanceId || '',
      host: input.effective?.host || '',
      hasApiKey: Boolean(input.effective?.apiKey),
      syncFolder: input.effective?.syncFolder || '',
      projectId: input.effective?.projectId || '',
      projectName: input.effective?.projectName || '',
      instanceIdentifier: input.effective?.instanceIdentifier || '',
      folderSync: Boolean(input.effective?.folderSync),
      runtimeStatus: input.runtime?.status || '',
      runtimeReady: Boolean(input.runtime?.ready),
      runtimeBlocked: input.runtime?.blocked?.code || '',
      tunnelPublicUrl: input.runtime?.tunnel?.publicUrl || '',
      tunnelRunning: Boolean(input.runtime?.tunnel?.running),
      error: input.error || '',
    });

    const signature = JSON.stringify({
      runtime: runtimeSignature,
      hasWorkspaceConfig: input.hasWorkspaceConfig,
      global: {
        activeInstanceId: input.global.activeInstanceId || '',
        defaultSyncFolder: input.global.defaultSyncFolder || '',
        instances: input.global.instances.map((instance) => ({
          id: instance.id,
          name: instance.name,
          mode: instance.mode,
          baseUrl: instance.baseUrl || '',
          tunnelPublicUrl: instance.tunnelPublicUrl || '',
          apiKeyAvailable: Boolean(instance.apiKeyAvailable),
          defaultProjectId: instance.defaultProject?.id || '',
          defaultProjectName: instance.defaultProject?.name || '',
          instanceIdentifier: instance.instanceIdentifier || '',
          updatedAt: instance.updatedAt || '',
        })),
      },
      workspace: input.workspace,
    });

    return {
      ...input,
      signature,
      runtimeSignature,
    };
  }

  private rebuildWatchers(): void {
    this.disposeWatchers();
    this.watchManagerConfigFiles();
    this.watchWorkspaceConfigFile();
  }

  private watchManagerConfigFiles(): void {
    const paths = resolveN8nManagerConfigurationPaths();
    try {
      fs.mkdirSync(paths.homeDir, { recursive: true });
    } catch {
      // Watcher creation will report failures through the normal refresh path.
    }

    this.watchFile(paths.homeDir, 'instances.json', 'global-instances-changed');
    this.watchFile(paths.homeDir, 'secrets.json', 'global-secrets-changed');
  }

  private watchWorkspaceConfigFile(): void {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      return;
    }
    this.watchFile(workspaceRoot, 'n8nac-config.json', 'workspace-overrides-changed');
  }

  private watchFile(directory: string, fileName: string, reason: string): void {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(directory), fileName),
      false,
      false,
      false,
    );
    const refresh = () => this.scheduleRefresh(reason);
    watcher.onDidCreate(refresh, undefined, this.watcherDisposables);
    watcher.onDidChange(refresh, undefined, this.watcherDisposables);
    watcher.onDidDelete(refresh, undefined, this.watcherDisposables);
    this.watcherDisposables.push(watcher);
  }

  private disposeWatchers(): void {
    for (const disposable of this.watcherDisposables) {
      disposable.dispose();
    }
    this.watcherDisposables.length = 0;
  }
}

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
