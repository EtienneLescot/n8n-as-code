import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { createHash } from 'crypto';
import {
  createN8nManagerFacade,
  resolveN8nManagerConfigurationPaths,
} from '@n8n-as-code/manager-adapter';
import { ConfigService, isCanonicalUserInstanceIdentifier, resolveInstanceIdentifier, type IWorkspaceConfig } from 'n8nac';

type N8nManagerFacade = ReturnType<typeof createN8nManagerFacade>;
type N8nGlobalConfig = Awaited<ReturnType<N8nManagerFacade['getGlobalConfig']>>;
type N8nWorkspaceOverrides = Awaited<ReturnType<N8nManagerFacade['readWorkspaceOverrides']>>;
type WorkspaceSnapshotConfig = IWorkspaceConfig | N8nWorkspaceOverrides;
type PreparedN8nContext = Awaited<ReturnType<N8nManagerFacade['prepareEffectiveContext']>>;
type EffectiveN8nContext = PreparedN8nContext['context'];
type SanitizedEffectiveN8nContext = Omit<EffectiveN8nContext, 'apiKey'> & {
  apiKey?: undefined;
  apiKeyAvailable?: boolean;
};

export interface N8nConfigurationSnapshot {
  workspaceRoot?: string;
  global: N8nGlobalConfig;
  workspace: WorkspaceSnapshotConfig;
  effective?: SanitizedEffectiveN8nContext;
  runtime?: PreparedN8nContext['runtime'];
  diagnostics?: PreparedN8nContext['diagnostics'];
  hasWorkspaceConfig: boolean;
  hasValidConnection: boolean;
  signature: string;
  runtimeSignature: string;
  error?: string;
  legacyMigration?: {
    configPath: string;
    version?: number;
    activeInstanceId?: string;
    instanceCount: number;
    warnings: string[];
  };
  globalInstanceMigration?: {
    configPath: string;
    activeInstanceId?: string;
    instanceCount: number;
    warnings: string[];
  };
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
    const configService = workspaceRoot ? new ConfigService(workspaceRoot) : undefined;
    const hasWorkspaceConfig = workspaceRoot
      ? fs.existsSync(path.join(workspaceRoot, 'n8nac-config.json'))
      : false;

    try {
      let global = await facade.getGlobalConfig();
      const legacyPlan = configService?.detectLegacyWorkspaceConfig();
      const globalInstancePlan = configService?.detectGlobalInstanceWorkspaceMigration();
      if (legacyPlan) {
        return this.buildSnapshot({
          workspaceRoot,
          global,
          workspace: { version: 3 as const },
          hasWorkspaceConfig,
          hasValidConnection: false,
          legacyMigration: {
            configPath: legacyPlan.configPath,
            version: legacyPlan.version,
            activeInstanceId: legacyPlan.activeInstanceId,
            instanceCount: legacyPlan.instances.length,
            warnings: legacyPlan.warnings,
          },
          globalInstanceMigration: globalInstancePlan ? {
            configPath: globalInstancePlan.configPath,
            activeInstanceId: globalInstancePlan.activeInstanceId,
            instanceCount: globalInstancePlan.instances.length,
            warnings: globalInstancePlan.warnings,
          } : undefined,
        });
      }
      const workspace = workspaceRoot && configService ? configService.getWorkspaceConfig() : { version: 3 as const };
      const isEnvironmentWorkspace = workspace.version === 4;
      let prepared = isEnvironmentWorkspace ? undefined : await facade.prepareEffectiveContext({
        workspaceRoot,
        syncFolderDefault: 'workspace',
        consumer: 'vscode',
        autoStart: true,
      }).catch(() => undefined);
      let effective = isEnvironmentWorkspace && configService
        ? await configService.prepareWorkspaceContext({ consumer: 'vscode' }).catch(() => configService.getEffectiveContext())
        : prepared?.context;
      if (prepared) {
        const effectiveHost = prepared.context.apiBaseUrl ?? prepared.context.host;
        if (effectiveHost && prepared.context.apiKey && !isCanonicalUserInstanceIdentifier(prepared.context.instanceIdentifier)) {
          const { identifier } = await resolveInstanceIdentifier({
            host: effectiveHost,
            apiKey: prepared.context.apiKey,
          });
          await facade.upsertInstance({
            id: prepared.context.activeInstanceId,
            instanceIdentifier: identifier,
          }, { setActive: false });
          prepared = {
            ...prepared,
            context: {
              ...prepared.context,
              instanceIdentifier: identifier,
              instance: {
                ...prepared.context.instance,
                instanceIdentifier: identifier,
              },
            },
          };
        }
        global = await facade.getGlobalConfig();
      }
      const hasValidConnection = Boolean((effective?.apiBaseUrl ?? effective?.host) && effective?.apiKey && !prepared?.runtime.blocked);
      return this.buildSnapshot({
        workspaceRoot,
        global,
        workspace,
        effective,
        runtime: prepared?.runtime,
        diagnostics: prepared?.diagnostics,
        hasWorkspaceConfig,
        hasValidConnection,
        globalInstanceMigration: globalInstancePlan ? {
          configPath: globalInstancePlan.configPath,
          activeInstanceId: globalInstancePlan.activeInstanceId,
          instanceCount: globalInstancePlan.instances.length,
          warnings: globalInstancePlan.warnings,
        } : undefined,
      });
    } catch (error: any) {
      const global = await facade.getGlobalConfig().catch(() => ({
        version: 1 as const,
        defaultSyncFolder: '',
        instances: [],
      }));
      const workspace = workspaceRoot && configService
        ? this.readWorkspaceSnapshotConfig(configService)
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
    workspace: WorkspaceSnapshotConfig;
    effective?: EffectiveN8nContext;
    runtime?: PreparedN8nContext['runtime'];
    diagnostics?: PreparedN8nContext['diagnostics'];
    hasWorkspaceConfig: boolean;
    hasValidConnection: boolean;
    error?: string;
    legacyMigration?: N8nConfigurationSnapshot['legacyMigration'];
    globalInstanceMigration?: N8nConfigurationSnapshot['globalInstanceMigration'];
  }): N8nConfigurationSnapshot {
    const workspace = input.workspace as any;
    const effective = input.effective as any;
    const credentialFingerprint = input.effective?.apiKey
      ? createHash('sha256').update(input.effective.apiKey).digest('hex')
      : '';
    const runtimeSignature = JSON.stringify({
      workspaceRoot: input.workspaceRoot || '',
      workspaceVersion: workspace?.version || '',
      activeEnvironmentId: workspace?.activeEnvironmentId || '',
      environmentId: effective?.environmentId || workspace?.activeEnvironment?.id || '',
      environmentName: effective?.environmentName || workspace?.activeEnvironment?.name || '',
      instanceTargetId: effective?.instanceTargetId || workspace?.instanceTargetId || '',
      instanceTargetName: effective?.instanceTargetName || workspace?.instanceTargetName || '',
      targetKind: effective?.targetKind || workspace?.targetKind || '',
      credentialSource: effective?.apiKeySource || workspace?.credentialSource || '',
      credentialFingerprint,
      activeInstanceId: input.effective?.activeInstanceId || '',
      apiBaseUrl: input.effective?.apiBaseUrl ?? input.effective?.host ?? '',
      publicBaseUrl: input.effective?.publicBaseUrl || '',
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
      legacyMigration: input.legacyMigration ? {
        configPath: input.legacyMigration.configPath,
        version: input.legacyMigration.version || '',
        activeInstanceId: input.legacyMigration.activeInstanceId || '',
        instanceCount: input.legacyMigration.instanceCount,
      } : undefined,
      globalInstanceMigration: input.globalInstanceMigration ? {
        configPath: input.globalInstanceMigration.configPath,
        activeInstanceId: input.globalInstanceMigration.activeInstanceId || '',
        instanceCount: input.globalInstanceMigration.instanceCount,
      } : undefined,
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
      effective: this.sanitizeEffectiveContext(input.effective),
      signature,
      runtimeSignature,
      legacyMigration: input.legacyMigration,
      globalInstanceMigration: input.globalInstanceMigration,
    };
  }

  private readWorkspaceSnapshotConfig(configService: ConfigService): WorkspaceSnapshotConfig {
    try {
      return configService.getWorkspaceConfig();
    } catch {
      return { version: 3 as const };
    }
  }

  private sanitizeEffectiveContext(effective?: EffectiveN8nContext): SanitizedEffectiveN8nContext | undefined {
    if (!effective) return undefined;
    const { apiKey: _apiKey, ...safeEffective } = effective as EffectiveN8nContext & { apiKey?: string };
    return {
      ...safeEffective,
      apiKey: undefined,
      apiKeyAvailable: Boolean(effective.apiKey),
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
