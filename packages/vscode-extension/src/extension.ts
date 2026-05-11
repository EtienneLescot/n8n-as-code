import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Injected at build time by esbuild (see esbuild.config.js)
declare const __N8NAC_VERSION__: string;
declare const __N8NAC_CLI_SEMVER__: string;
import {
    SyncManager, CliApi, N8nApiClient, IN8nCredentials, WorkflowSyncStatus, ConfigService,
    resolveInstanceIdentifier, isCanonicalUserInstanceIdentifier, SYNC_EVENT_JOURNAL_FILENAME, type SyncEvent
} from 'n8nac';
import { AiContextGenerator, getN8nacDevConfigFilenames } from '@n8n-as-code/skills';

import { StatusBar } from './ui/status-bar.js';
import { EnhancedWorkflowTreeProvider } from './ui/enhanced-workflow-tree-provider.js';
import { WorkflowWebview } from './ui/workflow-webview.js';
import { AgentWorkbenchWebview } from './ui/agent-workbench-webview.js';
import { ConfigurationWebview } from './ui/configuration-webview.js';
import { WorkflowDecorationProvider } from './ui/workflow-decoration-provider.js';

import { ProxyService } from './services/proxy-service.js';
import { AgentRuntimeController } from './services/agent-runtime-controller.js';
import type { AgentWorkflowContext } from './services/agent-runtime-controller.js';
import {
    YagrProviderService,
    YAGR_PROVIDER_DEFINITIONS,
    YAGR_REASONING_EFFORTS,
    YAGR_SELECTABLE_PROVIDERS,
    normalizeYagrProviderId,
    providerSupportsReasoningEffort,
    type YagrModelProvider,
    type YagrReasoningEffort,
} from './services/yagr-provider-service.js';
import {
    N8nConfigurationController,
    type N8nConfigurationChangeEvent,
} from './services/n8n-configuration-controller.js';
import { runWorkspaceMigrationFromVscode } from './services/workspace-migration-runner.js';
import { workflowWebviewRegistry } from './services/workflow-webview-registry.js';
import { createN8nManagerFacade } from '@n8n-as-code/manager-adapter';
import { createTelemetryClient, type TelemetryClient } from '@n8n-as-code/telemetry';
import { ExtensionState } from './types.js';
import { getN8nConfig, getResolvedN8nConfig, validateN8nConfig, getWorkspaceRoot } from './utils/state-detection.js';
import { NO_WORKSPACE_ERROR_MESSAGE, OPEN_FOLDER_ACTION } from './constants/workspace.js';
import { buildWorkflowQuickPickItems } from './utils/workflow-finder.js';
import { isClipboardBridgeRequired } from './utils/clipboard-utils.js';
import { getCanonicalProjectName, getProjectDetail, getProjectDisplayLabel } from './utils/project-display.js';
import { IWorkflowStatus } from 'n8nac';

import {
    store,
    setSyncManager,
    clearSyncManager,
    setWorkflows,
    selectAllWorkflows,
    selectArchiveFilter,
    addConflict,
    removeConflict,
    clearConflicts,
    setArchiveFilter,
    loadWorkflows,
} from './services/workflow-store.js';

// ------- Clipboard bridge for macOS -------
/**
 * Register the clipboard paste handler on n8n iframe host panels.
 * Only active on macOS where Electron intercepts Cmd+V at the native menu level.
 * When the n8n iframe intercepts Cmd+V, it sends a postMessage chain up to the
 * extension host. This handler reads the system clipboard and sends the text
 * back down to the iframe via the proxy's clipboard bridge script.
 */
function registerClipboardHandler(): void {
    if (!isClipboardBridgeRequired()) return;
    WorkflowWebview.onClipboardPasteRequest(async (panel, grantToken) => {
        try {
            const text = await vscode.env.clipboard.readText();
            panel.webview.postMessage({ type: 'clipboard-paste', text, grantToken });
        } catch (error) {
            console.error('[Clipboard] Failed to read clipboard for paste request', error);
            panel.webview.postMessage({ type: 'clipboard-error', grantToken });
        }
    });
    AgentWorkbenchWebview.onClipboardPasteRequest(async (panel, grantToken) => {
        try {
            const text = await vscode.env.clipboard.readText();
            panel.webview.postMessage({ type: 'clipboard-paste', text, grantToken });
        } catch (error) {
            console.error('[Clipboard] Failed to read clipboard for paste request', error);
            panel.webview.postMessage({ type: 'clipboard-error', grantToken });
        }
    });
}

// ------- Module-level singletons -------
let syncManager: SyncManager | undefined;
/** CliApi wraps SyncManager and exposes the same four commands as the CLI binary:
 *  list, fetch, pull, push. This is the only object the command handlers touch. */
let cli: CliApi | undefined;
let initializingPromise: Promise<void> | undefined;
let runtimeDisposables: vscode.Disposable[] = [];
let configurationController: N8nConfigurationController | undefined;
let agentRuntimeController: AgentRuntimeController | undefined;
let yagrProviderService: YagrProviderService | undefined;
let suppressNextConfigurationReaction = false;
let failedAutoInitRuntimeSignature: string | undefined;
let failedAutoInitConnectionKey: string | undefined;

const statusBar = new StatusBar();
const proxyService = new ProxyService();
const enhancedTreeProvider = new EnhancedWorkflowTreeProvider();

const decorationProvider = new WorkflowDecorationProvider();
const outputChannel = vscode.window.createOutputChannel("n8n-as-code");
let workflowsTreeView: vscode.TreeView<any> | undefined;
let telemetryClient: TelemetryClient | undefined;

const conflictStore = new Map<string, string>();
const processedSyncEventIds = new Set<string>();

async function processSyncEventJournal(journalUri: vscode.Uri, source: string, markOnly = false): Promise<void> {
    if (!fs.existsSync(journalUri.fsPath)) return;
    let raw: Uint8Array;
    try {
        raw = await vscode.workspace.fs.readFile(journalUri);
    } catch (err) {
        console.error('[n8n] Failed to read sync event journal', err);
        return;
    }

    const lines = Buffer.from(raw).toString('utf8').split('\n').filter(Boolean);
    for (const line of lines) {
        let event: SyncEvent;
        try {
            event = JSON.parse(line) as SyncEvent;
        } catch {
            continue;
        }
        if (!event.id) continue;
        if (markOnly) {
            processedSyncEventIds.add(event.id);
            continue;
        }
        if (processedSyncEventIds.has(event.id)) continue;
        processedSyncEventIds.add(event.id);
        trimProcessedSyncEvents();

        if (event.op !== 'workflow.push') continue;
        if (event.status !== 'success' || !event.remoteChanged || !event.workflowId) {
            outputChannel.appendLine(`[n8n-agent-debug] ${source} push event status=${event.status} workflowId=${event.workflowId || 'none'} reload=false reason=${event.reason || ''}`);
            continue;
        }
        const reloaded = workflowWebviewRegistry.reloadIfMatching(event.workflowId);
        outputChannel.appendLine(`[n8n-agent-debug] ${source} push success workflowId=${event.workflowId} filename=${event.filename || 'none'} reloaded=${reloaded}`);
    }
}

function trimProcessedSyncEvents(): void {
    while (processedSyncEventIds.size > 1000) {
        const first = processedSyncEventIds.values().next().value;
        if (!first) return;
        processedSyncEventIds.delete(first);
    }
}

type SwitchInstanceCommandArgs = {
    instanceId?: string;
    environmentId?: string;
    silent?: boolean;
};

type DeleteInstanceCommandArgs = {
    instanceId?: string;
    skipConfirm?: boolean;
    silent?: boolean;
};

type InstanceQuickPickItem = vscode.QuickPickItem & {
    instanceId: string;
};

type EnvironmentQuickPickItem = vscode.QuickPickItem & {
    environmentId: string;
};

function findWorkflowByCommandArg(arg: any): IWorkflowStatus | undefined {
    const candidate = arg?.workflow ? arg.workflow : arg;
    if (!candidate) return undefined;
    if (typeof candidate === 'string') {
        return selectAllWorkflows(store.getState()).find((workflow) => (
            workflow.id === candidate || workflow.filename === candidate
        ));
    }
    return candidate;
}

async function refreshWorkflowList(): Promise<IWorkflowStatus[]> {
    if (!cli) return [];
    const workflows = await cli.list();
    store.dispatch(setWorkflows(workflows));
    enhancedTreeProvider.refresh();
    return workflows;
}

export async function activate(context: vscode.ExtensionContext) {
    outputChannel.show(true);
    outputChannel.appendLine('🔌 Activation of "n8n-as-code"...');
    telemetryClient = createTelemetryClient({
        facade: 'vscode',
        version: String(context.extension.packageJSON?.version ?? __N8NAC_CLI_SEMVER__ ?? ''),
        forceDisabled: !vscode.env.isTelemetryEnabled,
    });
    telemetryClient.track('vscode_extension_activated', {
        vscode_version: vscode.version,
        extension_version: String(context.extension.packageJSON?.version ?? ''),
        has_workspace: Boolean(vscode.workspace.workspaceFolders?.length),
    });
    context.subscriptions.push(vscode.env.onDidChangeTelemetryEnabled((enabled) => {
        telemetryClient = createTelemetryClient({
            facade: 'vscode',
            version: String(context.extension.packageJSON?.version ?? __N8NAC_CLI_SEMVER__ ?? ''),
            forceDisabled: !enabled,
        });
    }));

    const registerTelemetryCommand = (command: string, callback: (...args: any[]) => any): vscode.Disposable => (
        vscode.commands.registerCommand(command, async (...args: any[]) => {
            const telemetry = telemetryClient;
            if (!telemetry) {
                return callback(...args);
            }

            const result = await telemetry.withTelemetry('vscode_command_completed', {
                command,
                has_workspace: Boolean(vscode.workspace.workspaceFolders?.length),
                extension_state: String(enhancedTreeProvider.getExtensionState?.() ?? 'unknown'),
            }, async () => callback(...args));
            telemetry.trackActive({ activation_source_event: 'vscode_command_completed' });
            return result;
        })
    );

    // Register Remote Content Provider for Diffs
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('n8n-remote', {
            provideTextDocumentContent(uri: vscode.Uri): string {
                return conflictStore.get(uri.toString()) || '';
            }
        })
    );

    workflowsTreeView = vscode.window.createTreeView('n8n-explorer.workflows', {
        treeDataProvider: enhancedTreeProvider,
        showCollapseAll: false,
    });
    context.subscriptions.push(workflowsTreeView);

    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(decorationProvider)
    );

    proxyService.setOutputChannel(outputChannel);
    proxyService.setSecrets(context.secrets);
    agentRuntimeController = new AgentRuntimeController(context, outputChannel);
    yagrProviderService = new YagrProviderService(context);
    context.subscriptions.push(agentRuntimeController);
    configurationController = new N8nConfigurationController(outputChannel);
    context.subscriptions.push(
        configurationController,
        configurationController.onDidChangeSnapshot((event) => {
            void handleConfigurationSnapshotChanged(context, event);
        }),
    );

    // ── Register Commands ──────────────────────────────────────────────────────
    // Commands are registered early so they are available during activation.
    // Handlers that need `cli` guard against it being undefined.

    context.subscriptions.push(
        registerTelemetryCommand('n8n.init', async () => {
            await handleInitializeCommand(context);
        }),

        registerTelemetryCommand('n8n.configure', async () => {
            ConfigurationWebview.createOrShow(context, requireConfigurationController());
        }),

        registerTelemetryCommand('n8n.migrateWorkspaceConfiguration', async () => {
            await migrateWorkspaceConfiguration(context);
        }),

        registerTelemetryCommand('n8n.migrateLegacyWorkspace', async () => {
            await migrateWorkspaceConfiguration(context);
        }),

        registerTelemetryCommand('n8n.migrateGlobalInstancesToEnvironments', async () => {
            await migrateWorkspaceConfiguration(context);
        }),

        registerTelemetryCommand('n8n.switchInstance', async (args?: SwitchInstanceCommandArgs) => {
            await switchWorkspaceInstance(context, args);
        }),

        registerTelemetryCommand('n8n.pinWorkspaceInstance', async (args?: SwitchInstanceCommandArgs) => {
            await pinWorkspaceInstance(context, args);
        }),

        registerTelemetryCommand('n8n.clearWorkspaceInstance', async () => {
            await clearWorkspaceInstancePin(context);
        }),

        registerTelemetryCommand('n8n.deleteInstance', async (args?: DeleteInstanceCommandArgs) => {
            await deleteWorkspaceInstance(context, args);
        }),

        registerTelemetryCommand('n8n.applySettings', async () => {
            outputChannel.appendLine('[n8n] Applying new settings...');
            await reinitializeSyncManager(context);
            updateContextKeys();
        }),

        registerTelemetryCommand('n8n.showActive', async () => {
            store.dispatch(setArchiveFilter('workflows'));
            if (workflowsTreeView) workflowsTreeView.title = 'Workflows';
            await store.dispatch(loadWorkflows());
        }),

        registerTelemetryCommand('n8n.showArchived', async () => {
            store.dispatch(setArchiveFilter('archived'));
            if (workflowsTreeView) workflowsTreeView.title = 'Archived Workflows';
            await store.dispatch(loadWorkflows());
        }),

        registerTelemetryCommand('n8n.showAll', async () => {
            store.dispatch(setArchiveFilter('all'));
            if (workflowsTreeView) workflowsTreeView.title = 'All Workflows';
            await store.dispatch(loadWorkflows());
        }),

        registerTelemetryCommand('n8n.openBoard', async (arg: any) => {
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf) return;
            telemetryClient?.track('vscode_workflow_view_opened', { mode: 'board', workflow_state: 'unknown' });
            await openWorkflowBoard(wf);
        }),

        registerTelemetryCommand('n8n.openJson', async (arg: any) => {
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf || !syncManager) return;
            telemetryClient?.track('vscode_workflow_view_opened', { mode: 'json', workflow_state: 'unknown' });
            const uri = getExistingWorkflowFileUri(wf);
            if (uri) {
                try {
                    const doc = await vscode.workspace.openTextDocument(uri);
                    await vscode.window.showTextDocument(doc);
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Could not open file: ${e.message}`);
                }
            } else if (wf.id) {
                vscode.window.showInformationMessage(`No local file found for "${wf.name}".`);
            }
        }),

        registerTelemetryCommand('n8n.openSplit', async (arg: any) => {
            const wf = await resolveWorkflowForSplitView(arg);
            if (!wf || !syncManager) return;
            telemetryClient?.track('vscode_workflow_view_opened', { mode: 'split', workflow_state: 'unknown' });
            const uri = getExistingWorkflowFileUri(wf);
            if (uri) {
                try {
                    const doc = await vscode.workspace.openTextDocument(uri);
                    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One });
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Could not open file: ${e.message}`);
                }
            }
            await openWorkflowBoard(wf, vscode.ViewColumn.Two);
        }),

        registerTelemetryCommand('n8n.openAgentWorkbench', async (arg: any) => {
            const runtime = requireAgentRuntimeController();
            const wf = findWorkflowByCommandArg(arg);
            if (wf) {
                const sessionId = await getOrCreateAgentSessionForWorkflow(wf);
                telemetryClient?.track('vscode_workflow_view_opened', { mode: 'agent-workbench', workflow_state: 'workflow-context' });
                await openAgentWorkbench(context, wf, sessionId);
                return;
            }
            if (arg === 'new') {
                const state = await runtime.createSession({ workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath });
                telemetryClient?.track('vscode_workflow_view_opened', { mode: 'agent-workbench', workflow_state: 'new' });
                await openAgentWorkbench(context, undefined, state.activeSessionId);
                return;
            }
            telemetryClient?.track('vscode_workflow_view_opened', { mode: 'agent-workbench', workflow_state: 'latest' });
            await openAgentWorkbench(context, undefined, await runtime.getLatestSessionId());
        }),

        registerTelemetryCommand('n8n.openAgentManager', async () => {
            ConfigurationWebview.createOrShow(context, requireConfigurationController(), 'agent-providers');
        }),

        registerTelemetryCommand('n8n.agent.setupProvider', async () => {
            await setupAgentProvider(context);
        }),

        registerTelemetryCommand('n8n.agent.selectModel', async () => {
            await selectAgentModel();
        }),

        registerTelemetryCommand('n8n.agent.selectReasoningEffort', async () => {
            await selectAgentReasoningEffort();
        }),

        // n8nac push <path>
        registerTelemetryCommand('n8n.pushWorkflow', async (arg: any) => {
            if (enhancedTreeProvider.getExtensionState() === ExtensionState.SETTINGS_CHANGED) {
                vscode.window.showWarningMessage('n8n: Settings changed. Click "Apply Changes" to resume syncing.');
                return;
            }
            const wf = findWorkflowByCommandArg(arg);
            if (!cli || !syncManager) {
                vscode.window.showWarningMessage('n8n is not initialized yet.');
                outputChannel.appendLine('[n8n] Push skipped: CLI or sync manager is not initialized.');
                return;
            }
            if (!wf?.filename) {
                vscode.window.showWarningMessage('Cannot push: no local workflow file is available.');
                outputChannel.appendLine(`[n8n] Push skipped: invalid workflow argument ${JSON.stringify(arg)}`);
                return;
            }

            const workflowPath = path.join(syncManager.getInstanceDirectory(), wf.filename);

            statusBar.showSyncing();
            try {
                const pushedId = await cli.push(workflowPath);
                const workflows = await refreshWorkflowList();
                const updatedWorkflow = workflows.find(candidate => candidate.filename === wf.filename);
                const workflowId = updatedWorkflow?.id ?? pushedId ?? wf.id;
                await processSyncEventJournal(vscode.Uri.file(await syncManager.getSyncEventJournalPath()), 'command push journal');

                outputChannel.appendLine(`[n8n] Push successful: ${wf.name} (${workflowId ?? 'unknown id'})`);
                statusBar.showSynced();
                vscode.window.showInformationMessage(`✅ Pushed "${wf.name}"`);
            } catch (e: any) {
                const isOcc = e.message?.includes('Push rejected') || e.message?.includes('modified in the n8n UI');
                if (isOcc) {
                    statusBar.showError('Conflict');
                    await vscode.commands.executeCommand('n8n.resolveConflict', { workflow: wf, choice: undefined });
                    await refreshWorkflowList();
                    statusBar.showSynced();
                } else {
                    statusBar.showError(e.message);
                    vscode.window.showErrorMessage(`Push Error: ${e.message}`);
                }
            }
        }),

        // n8nac pull <id>
        registerTelemetryCommand('n8n.pullWorkflow', async (arg: any) => {
            if (enhancedTreeProvider.getExtensionState() === ExtensionState.SETTINGS_CHANGED) {
                vscode.window.showWarningMessage('n8n: Settings changed. Click "Apply Changes" to resume syncing.');
                return;
            }
            const wf = findWorkflowByCommandArg(arg);
            if (!cli || !syncManager) {
                vscode.window.showWarningMessage('n8n is not initialized yet.');
                outputChannel.appendLine('[n8n] Pull skipped: CLI or sync manager is not initialized.');
                return;
            }
            if (!wf?.id) {
                vscode.window.showWarningMessage('Cannot pull: no remote workflow ID is available.');
                outputChannel.appendLine(`[n8n] Pull skipped: invalid workflow argument ${JSON.stringify(arg)}`);
                return;
            }

            if (wf.filename) {
                const workflowStatus = await cli.getSingleWorkflowDetailedStatus(wf.id, wf.filename);
                
                const hasConflict = workflowStatus.status === WorkflowSyncStatus.CONFLICT;
                const hasLocalChanges = !!(workflowStatus.localHash && workflowStatus.lastSyncedHash && workflowStatus.localHash !== workflowStatus.lastSyncedHash);

                if (hasConflict || hasLocalChanges) {
                    statusBar.showError('Conflict');
                    await vscode.commands.executeCommand('n8n.resolveConflict', { workflow: wf, choice: undefined });
                    await refreshWorkflowList();
                    statusBar.showSynced();
                    return; // Conflict resolution handles the pull/push
                }
            }

            statusBar.showSyncing();
            try {
                outputChannel.appendLine(`[n8n] Pulling workflow: ${wf.name} (${wf.id})`);
                await cli.pull(wf.id);
                await refreshWorkflowList();
                statusBar.showSynced();
                outputChannel.appendLine(`[n8n] Pull successful: ${wf.name} (${wf.id})`);
                vscode.window.showInformationMessage(`✅ Pulled "${wf.name}"`);
            } catch (e: any) {
                statusBar.showError(e.message);
                vscode.window.showErrorMessage(`Pull Error: ${e.message}`);
            }
        }),

        // n8nac fetch <id>
        registerTelemetryCommand('n8n.fetchWorkflow', async (arg: any) => {
            if (enhancedTreeProvider.getExtensionState() === ExtensionState.SETTINGS_CHANGED) {
                vscode.window.showWarningMessage('n8n: Settings changed. Click "Apply Changes" to resume syncing.');
                return;
            }
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf || !cli || !wf.id) return;

            statusBar.showSyncing();
            try {
                const found = await cli.fetch(wf.id);
                if (found) {
                    outputChannel.appendLine(`[n8n] Fetched remote state for: ${wf.name} (${wf.id})`);
                    const workflows = await cli.list();
                    store.dispatch(setWorkflows(workflows));
                    enhancedTreeProvider.refresh();
                    statusBar.showSynced();
                    vscode.window.showInformationMessage(`✅ Fetched "${wf.name}"`);
                } else {
                    statusBar.showSynced();
                    vscode.window.showWarningMessage(`⚠️ "${wf.name}" not found on remote — may have been deleted`);
                }
            } catch (e: any) {
                statusBar.showError(e.message);
                vscode.window.showErrorMessage(`Fetch Error: ${e.message}`);
            }
        }),

        // n8nac list (global refresh — calls list with fresh remote fetch)
        registerTelemetryCommand('n8n.refresh', async () => {
            outputChannel.appendLine('[n8n] Manual refresh — running list...');
            if (!cli) {
                vscode.window.showErrorMessage('n8n as code is not initialized. Please configure and initialize first.');
                enhancedTreeProvider.refresh();
                return;
            }
            statusBar.showSyncing();
            try {
                const workflows = await cli.list({ fetchRemote: true });
                store.dispatch(setWorkflows(workflows));
                outputChannel.appendLine(`[n8n] List refreshed. ${workflows.length} workflows.`);
                vscode.window.showInformationMessage(`Refreshed workflow list (${workflows.length} workflows)`);
                statusBar.showSynced();
            } catch (error: any) {
                statusBar.showError(error.message);
                vscode.window.showErrorMessage(`Refresh failed: ${error.message}`);
            }
            enhancedTreeProvider.refresh();
        }),

        registerTelemetryCommand('n8n.findWorkflow', async () => {
            if (enhancedTreeProvider.getExtensionState() === ExtensionState.SETTINGS_CHANGED) {
                vscode.window.showWarningMessage('n8n: Settings changed. Click "Apply Changes" to resume syncing.');
                return;
            }

            // Always search across ALL workflows, regardless of current archive filter.
            // The current filter tab should not limit searchability of workflows.
            let workflows = cli ? await cli.list({ fetchRemote: true, includeArchived: true }) : [];
            if (workflows.length) {
                store.dispatch(setWorkflows(workflows));
                enhancedTreeProvider.refresh();
            }

            if (!workflows.length) {
                const message = cli
                    ? 'No workflows available to search.'
                    : 'n8n as code is not initialized. Run "Initialize n8n as code" or configure your settings first.';
                vscode.window.showInformationMessage(message);
                return;
            }

            const picked = await vscode.window.showQuickPick(
                buildWorkflowQuickPickItems(workflows),
                {
                    title: `Find Workflow (${workflows.length})`,
                    placeHolder: 'Search by workflow name, ID, or local filename',
                    ignoreFocusOut: true,
                    matchOnDescription: true,
                    matchOnDetail: true,
                }
            );

            if (!picked) {
                return;
            }

            await revealWorkflowInTree(picked.workflow);
            await openWorkflowFromFinder(picked.workflow);
        }),

        registerTelemetryCommand('n8n.initializeAI', async (options?: { silent?: boolean }) => {
            if (!vscode.workspace.workspaceFolders?.length) {
                if (!options?.silent) await showNoWorkspaceError();
                return;
            }
            const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const connection = resolveAiContextConnection(rootPath);
            const runInit = (progress?: vscode.Progress<{ message?: string }>) => generateAiContextForWorkspace(
                context,
                connection.client,
                rootPath,
                { silent: options?.silent, progress, host: connection.host }
            );
            try {
                if (options?.silent) {
                    await runInit();
                } else {
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: 'n8n: Initializing AI Context...',
                        cancellable: false
                    }, runInit);
                }
            } catch (error: any) {
                if (options?.silent) {
                    outputChannel.appendLine(`[n8n] Silent AI Init failed: ${error.message}`);
                } else {
                    vscode.window.showErrorMessage(`AI Init Failed: ${error.message}`);
                }
            }
        }),

        registerTelemetryCommand('n8n.agent.setApiKey', async () => {
            await setAgentProviderApiKey(context);
        }),

        registerTelemetryCommand('n8n.openSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'n8n');
        }),

        registerTelemetryCommand('n8n.resolveConflict', async (arg: any) => {
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf || !cli || !syncManager) return;

            let conflict = enhancedTreeProvider.getConflict(wf.id);
            if (!conflict && wf.filename) {
                try {
                    const client = new N8nApiClient(getN8nConfig());
                    const remoteWorkflow = await client.getWorkflow(wf.id);
                    conflict = { id: wf.id, filename: wf.filename, remoteContent: remoteWorkflow };
                    store.dispatch(addConflict(conflict));
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Failed to fetch remote workflow: ${e.message}`);
                    return;
                }
            }
            if (!conflict) {
                vscode.window.showInformationMessage('No conflict data found for this workflow.');
                return;
            }

            const { id, filename, remoteContent } = conflict;
            let choice = arg?.choice;
            if (!choice) {
                choice = await vscode.window.showWarningMessage(
                    `⚠️ Conflict on "${filename}": local and remote versions differ.`,
                    'Show Diff', 'Keep Current (local)', 'Keep Incoming (remote)'
                );
            }

            if (choice === 'Show Diff') {
                const remoteUri = vscode.Uri.parse(`n8n-remote:${filename}?id=${id}`);
                const localUri = vscode.Uri.file(path.join(syncManager.getInstanceDirectory(), filename));
                conflictStore.set(remoteUri.toString(), JSON.stringify(remoteContent, null, 2));
                await vscode.commands.executeCommand('vscode.diff', localUri, remoteUri, `${filename} ← n8n Remote (read-only)`);
            } else if (choice === 'Keep Current (local)') {
                await cli.resolveConflict(id, filename, 'keep-current');
                await new Promise(r => setTimeout(r, 500));
                store.dispatch(setWorkflows(await cli.list()));
                store.dispatch(removeConflict(id));
                await processSyncEventJournal(vscode.Uri.file(await syncManager.getSyncEventJournalPath()), 'conflict resolution journal');
                vscode.window.showInformationMessage('✅ Pushed — remote overwritten with your local version.');
                enhancedTreeProvider.refresh();
            } else if (choice === 'Keep Incoming (remote)') {
                await cli.resolveConflict(id, filename, 'keep-incoming');
                await new Promise(r => setTimeout(r, 500));
                store.dispatch(setWorkflows(await cli.list()));
                store.dispatch(removeConflict(id));
                vscode.window.showInformationMessage('✅ Pulled — local file updated from n8n.');
                enhancedTreeProvider.refresh();
            }
        }),
    );

    // ── Backend configuration snapshot initialization ────────────────────────
    configurationController.start();

    // ── Settings change listener ───────────────────────────────────────────
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async e => {
            const suppressOnce = context.workspaceState.get<boolean>('n8n.suppressSettingsChangedOnce');
            if (suppressOnce) {
                await context.workspaceState.update('n8n.suppressSettingsChangedOnce', false);
                return;
            }
            if (
                e.affectsConfiguration('n8n.host') ||
                e.affectsConfiguration('n8n.apiKey') ||
                e.affectsConfiguration('n8n.syncFolder') ||
                e.affectsConfiguration('n8n.projectId') ||
                e.affectsConfiguration('n8n.projectName')
            ) {
                outputChannel.appendLine('[n8n] Critical settings changed. Pausing until applied.');
                if (syncManager) {
                    enhancedTreeProvider.setExtensionState(ExtensionState.SETTINGS_CHANGED);
                    statusBar.showSettingsChanged();
                } else {
                    const root = getWorkspaceRoot();
                    const hasUnifiedConfig = root ? fs.existsSync(path.join(root, 'n8nac-config.json')) : false;
                    const valid = validateN8nConfig().isValid;
                    if (!hasUnifiedConfig || !valid) {
                        resetExtensionRuntimeState();
                        enhancedTreeProvider.setExtensionState(ExtensionState.CONFIGURING);
                        statusBar.showConfiguring();
                    } else {
                        enhancedTreeProvider.setExtensionState(ExtensionState.UNINITIALIZED);
                        statusBar.showNotInitialized();
                    }
                }
                updateContextKeys();
            }
        })
    );
}

function getExistingWorkflowFileUri(workflow: IWorkflowStatus): vscode.Uri | undefined {
    if (!syncManager || !workflow.filename) {
        return undefined;
    }

    const filePath = path.join(syncManager.getInstanceDirectory(), workflow.filename);
    return fs.existsSync(filePath) ? vscode.Uri.file(filePath) : undefined;
}

async function revealWorkflowInTree(workflow: IWorkflowStatus): Promise<void> {
    if (!workflowsTreeView) {
        return;
    }

    // Ensure the workflow is visible: if it's archived but the current filter is 'workflows',
    // switch to 'all' so the item appears in the tree before we try to reveal it.
    const currentFilter = selectArchiveFilter(store.getState());
    if (workflow.isArchived && currentFilter === 'workflows') {
        store.dispatch(setArchiveFilter('all'));
        if (workflowsTreeView) workflowsTreeView.title = 'All Workflows';
    }

    const item = await enhancedTreeProvider.getWorkflowItem(workflow);
    if (!item) {
        return;
    }

    try {
        await workflowsTreeView.reveal(item, {
            select: true,
            focus: true,
            expand: true,
        });
    } catch (error: any) {
        outputChannel.appendLine(`[n8n] Unable to reveal workflow ${workflow.name}: ${error.message}`);
    }
}

async function openWorkflowFromFinder(workflow: IWorkflowStatus): Promise<void> {
    const localUri = getExistingWorkflowFileUri(workflow);

    if (localUri) {
        await vscode.commands.executeCommand('n8n.openJson', workflow);
        return;
    }

    if (workflow.id) {
        await vscode.commands.executeCommand('n8n.openBoard', workflow);
        return;
    }

    vscode.window.showWarningMessage(`Cannot open workflow "${workflow.name}": no local file or remote ID is available.`);
}

type AgentWorkbenchTarget = IWorkflowStatus | 'new';

async function resolveWorkflowForAgentWorkbench(arg: any): Promise<AgentWorkbenchTarget | undefined> {
    const workflow = findWorkflowByCommandArg(arg);
    if (workflow) {
        return workflow;
    }

    if (!cli) {
        vscode.window.showWarningMessage('n8n as code is not initialized. Configure and initialize n8n before opening the Agent Workbench.');
        return undefined;
    }

    const workflows = await cli.list({ fetchRemote: true, includeArchived: true });
    if (workflows.length) {
        store.dispatch(setWorkflows(workflows));
        enhancedTreeProvider.refresh();
    }

    const picked = await vscode.window.showQuickPick(
        [
            {
                label: 'New workflow chat',
                description: 'Start without an attached workflow',
                detail: 'Use this to design and create a new n8n workflow with the agent.',
                workflow: 'new' as const,
            },
            ...buildWorkflowQuickPickItems(workflows),
        ],
        {
            title: `Open Agent Workbench${workflows.length ? ` (${workflows.length})` : ''}`,
            placeHolder: 'Start new workflow chat or select an external-instance workflow',
            ignoreFocusOut: true,
            matchOnDescription: true,
            matchOnDetail: true,
        },
    );

    return picked?.workflow;
}

async function openWorkflowBoard(workflow: IWorkflowStatus, viewColumn?: vscode.ViewColumn): Promise<void> {
    if (!workflow.id) {
        vscode.window.showWarningMessage(`Cannot open workflow "${workflow.name}": no remote ID is available.`);
        return;
    }

    try {
        const openTarget = await resolveWorkflowWebviewTarget(workflow);
        WorkflowWebview.createOrShow(workflow, openTarget.url, viewColumn);
        registerClipboardHandler();
    } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to open n8n workflow: ${e.message}`);
    }
}

async function resolveWorkflowForSplitView(arg: any): Promise<IWorkflowStatus | undefined> {
    const workflow = findWorkflowByCommandArg(arg);
    if (workflow) {
        return workflow;
    }

    if (!cli) {
        vscode.window.showWarningMessage('n8n as code is not initialized. Configure and initialize n8n before opening Split View.');
        return undefined;
    }

    const workflows = await cli.list({ fetchRemote: true, includeArchived: true });
    if (!workflows.length) {
        vscode.window.showInformationMessage('No workflows available for Split View.');
        return undefined;
    }

    store.dispatch(setWorkflows(workflows));
    enhancedTreeProvider.refresh();

    const picked = await vscode.window.showQuickPick(
        buildWorkflowQuickPickItems(workflows),
        {
            title: `Open Split View (${workflows.length})`,
            placeHolder: 'Select the workflow to open as JSON plus n8n board',
            ignoreFocusOut: true,
            matchOnDescription: true,
            matchOnDetail: true,
        },
    );

    return picked?.workflow;
}

async function openAgentWorkbench(context: vscode.ExtensionContext, workflow?: IWorkflowStatus, initialSessionId?: string): Promise<void> {
    try {
        const openTarget = workflow?.id ? await resolveWorkflowWebviewTarget(workflow) : undefined;
        const workflowFilePath = workflow ? getExistingWorkflowFileUri(workflow)?.fsPath : undefined;
        const providerModelLabel = getSelectedAgentProviderModelLabel();
        AgentWorkbenchWebview.createOrShow(
            context,
            workflow,
            workflowFilePath,
            openTarget?.url,
            openTarget?.targetUrl,
            providerModelLabel,
            requireAgentRuntimeController(),
            outputChannel,
            {
                listWorkflows: listAgentWorkflowOptions,
                resolveWorkflow: resolveAgentWorkflowTarget,
                listWorkflowNodes: listAgentWorkflowNodes,
                listProviderOptions: listAgentProviderOptions,
                listModelOptions: listAgentModelOptions,
                selectProviderModel: selectAgentProviderModel,
                selectReasoningEffort: selectInlineAgentReasoningEffort,
            },
            initialSessionId,
            vscode.ViewColumn.One,
        );
        if (openTarget?.url) {
            registerClipboardHandler();
        }
    } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to open n8n Agent Workbench: ${e.message}`);
    }
}

async function getOrCreateAgentSessionForWorkflow(workflow: IWorkflowStatus): Promise<string> {
    const workflowFilePath = getExistingWorkflowFileUri(workflow)?.fsPath;
    const workflowContext: AgentWorkflowContext = {
        id: workflow.id || undefined,
        name: workflow.name || workflow.id || workflow.filename || 'Workflow',
        filename: workflow.filename || undefined,
        filePath: workflowFilePath,
    };
    const runtime = requireAgentRuntimeController();
    const existingSessionId = await runtime.getLatestSessionIdForWorkflow(workflowContext);
    if (existingSessionId) return existingSessionId;
    return runtime.createSessionForWorkflow(workflowContext, {
        workflowId: workflow.id || undefined,
        workflowName: workflow.name,
        workflowFilename: workflow.filename,
        workflowFilePath,
        workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    });
}

async function listAgentWorkflowOptions(): Promise<IWorkflowStatus[]> {
    if (cli) {
        const workflows = await cli.list({ fetchRemote: true, includeArchived: true });
        store.dispatch(setWorkflows(workflows));
        enhancedTreeProvider.refresh();
        return workflows;
    }
    return selectAllWorkflows(store.getState());
}

async function resolveAgentWorkflowTarget(workflowContext: AgentWorkflowContext): Promise<{ workflow?: IWorkflowStatus; workflowFilePath?: string; workflowUrl?: string; workflowReloadUrl?: string }> {
    const workflows = await listAgentWorkflowOptions();
    const workflow = workflows.find((candidate) => (
        Boolean(workflowContext.id && candidate.id === workflowContext.id)
        || Boolean(workflowContext.filename && candidate.filename === workflowContext.filename)
        || candidate.name === workflowContext.name
    ));
    const effectiveWorkflow = workflow || ({
        id: workflowContext.id || '',
        name: workflowContext.name,
        filename: workflowContext.filename || '',
    } as IWorkflowStatus);
    const workflowFilePath = getExistingWorkflowFileUri(effectiveWorkflow)?.fsPath || workflowContext.filePath;
    if (!effectiveWorkflow.id) {
        return { workflow: effectiveWorkflow, workflowFilePath };
    }
    try {
        const openTarget = await resolveWorkflowWebviewTarget(effectiveWorkflow);
        return {
            workflow: effectiveWorkflow,
            workflowFilePath,
            workflowUrl: openTarget.url,
            workflowReloadUrl: openTarget.targetUrl,
        };
    } catch {
        return { workflow: effectiveWorkflow, workflowFilePath };
    }
}

async function listAgentWorkflowNodes(workflowContext: AgentWorkflowContext): Promise<Array<{ name: string; type?: string; id?: string }>> {
    if (!workflowContext.id) return [];
    const config = getN8nConfig();
    if (!config.host || !config.apiKey) return [];
    const client = new N8nApiClient(config);
    const workflow = await client.getWorkflow(workflowContext.id);
    const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
    const result: Array<{ name: string; type?: string; id?: string }> = [];
    for (const node of nodes) {
        const name = typeof node?.name === 'string' ? node.name.trim() : '';
        if (!name) continue;
        const type = typeof node.type === 'string' ? node.type.trim() : '';
        const id = typeof node.id === 'string' ? node.id.trim() : '';
        result.push({ name, type: type || undefined, id: id || undefined });
    }
    return result;
}

async function listAgentProviderOptions(): Promise<Array<Record<string, unknown>>> {
    const states = await requireYagrProviderService().listProviderConnectionStates();
    return states.filter((state) => state.connected || state.selected).map((state) => ({
        id: state.id,
        label: state.label,
        description: state.description,
        connected: state.connected,
        selected: state.selected,
        model: state.model,
        defaultModel: state.defaultModel,
        supportsReasoningEffort: state.supportsReasoningEffort,
    }));
}

async function listAgentModelOptions(providerId: string): Promise<Array<Record<string, unknown>>> {
    const provider = normalizeYagrProviderId(providerId) || 'openai';
    const definition = YAGR_PROVIDER_DEFINITIONS[provider];
    const config = vscode.workspace.getConfiguration('n8n.agent');
    const selectedProvider = normalizeYagrProviderId(String(config.get<string>('provider') || 'openai')) || 'openai';
    const currentModel = String(config.get<string>('model') || '').trim() || definition.defaultModel;
    const liveModels = await requireYagrProviderService().fetchAvailableModels(provider).catch(() => []);
    return [...new Set([...(liveModels.length ? liveModels : []), definition.defaultModel, currentModel].filter(Boolean))]
        .map((model) => ({
            id: model,
            label: model,
            provider,
            providerLabel: definition.label,
            selected: provider === selectedProvider && model === currentModel,
            fallback: !liveModels.length,
        }));
}

async function selectAgentProviderModel(providerId: string, model: string): Promise<void> {
    const provider = normalizeYagrProviderId(providerId) || 'openai';
    const trimmedModel = model.trim() || YAGR_PROVIDER_DEFINITIONS[provider].defaultModel;
    const config = vscode.workspace.getConfiguration('n8n.agent');
    await config.update('provider', provider, vscode.ConfigurationTarget.Global);
    await config.update('model', trimmedModel, vscode.ConfigurationTarget.Global);
    await requireYagrProviderService().syncReasoningEffortConfiguration(provider, trimmedModel);
}

async function selectInlineAgentReasoningEffort(effort: string): Promise<void> {
    const normalized = YAGR_REASONING_EFFORTS.includes(effort as YagrReasoningEffort) ? effort as YagrReasoningEffort : undefined;
    if (!normalized) return;
    const config = vscode.workspace.getConfiguration('n8n.agent');
    const provider = normalizeYagrProviderId(String(config.get<string>('provider') || 'openai')) || 'openai';
    const model = String(config.get<string>('model') || '').trim() || undefined;
    if (!providerSupportsReasoningEffort(provider, model)) {
        await config.update('reasoningEffort', undefined, vscode.ConfigurationTarget.Global);
        return;
    }
    await config.update('reasoningEffort', normalized, vscode.ConfigurationTarget.Global);
}

function getSelectedAgentProviderModelLabel(): string {
    const config = vscode.workspace.getConfiguration('n8n.agent');
    const provider = String(config.get<string>('provider') || 'openai').trim() || 'openai';
    const model = String(config.get<string>('model') || '').trim();
    return model ? `${provider} / ${model}` : provider;
}

async function resolveWorkflowWebviewTarget(workflow: IWorkflowStatus): Promise<{ url: string; targetUrl: string }> {
    if (!workflow.id) {
        throw new Error(`Workflow "${workflow.name}" does not have a remote ID.`);
    }

    const workspaceRoot = getWorkspaceRoot();
    const facade = createN8nManagerFacade({ workspaceRoot });
    if (workspaceRoot) {
        const configService = new ConfigService(workspaceRoot);
        const workspaceConfig = configService.getWorkspaceConfig();
        if (workspaceConfig.version === 4) {
            const environment = await configService.prepareEnvironment();
            const n8nBaseUrl = environment.host;
            const proxyUrl = await proxyService.start(n8nBaseUrl);
            const workflowUrl = new URL(`/workflow/${encodeURIComponent(workflow.id)}`, n8nBaseUrl.endsWith('/') ? n8nBaseUrl : `${n8nBaseUrl}/`);
            workflowUrl.searchParams.set('_n8nacBridge', String(Date.now()));
            if (environment.sourceKind === 'managed-instance') {
                const openTarget = await facade.resolveWorkflowWebviewOpen({
                    workflowId: workflow.id,
                    proxyBaseUrl: proxyUrl,
                    workspaceRoot,
                    workflowUrl: workflowUrl.toString(),
                    instanceId: environment.managedInstanceId,
                });
                if (openTarget.routePath && openTarget.autoLoginPageHtml) {
                    proxyService.registerHtmlRoute(openTarget.routePath, openTarget.autoLoginPageHtml);
                    outputChannel.appendLine(`[n8n] Opening workflow ${workflow.id} in environment ${environment.environmentName} through managed auto-login route.`);
                } else {
                    outputChannel.appendLine(`[n8n] Opening workflow ${workflow.id} in environment ${environment.environmentName} through direct route.`);
                }
                return { url: openTarget.url, targetUrl: openTarget.targetUrl };
            }
            outputChannel.appendLine(`[n8n] Opening workflow ${workflow.id} in external-instance workspace environment ${environment.environmentName}.`);
            return { url: `${proxyUrl}/workflow/${encodeURIComponent(workflow.id)}?${workflowUrl.searchParams.toString()}`, targetUrl: workflowUrl.toString() };
        }
    }
    const prepared = await facade.prepareEffectiveContext({
        workspaceRoot,
        syncFolderDefault: workspaceRoot ? 'workspace' : 'global',
        consumer: 'vscode',
        autoStart: true,
    });
    if (prepared.runtime.blocked) {
        throw new Error(prepared.runtime.blocked.message);
    }
    const effective = prepared.context;
    const n8nBaseUrl = effective.apiBaseUrl ?? effective.host;
    const proxyUrl = await proxyService.start(n8nBaseUrl);
    const workflowUrl = new URL(`/workflow/${encodeURIComponent(workflow.id)}`, n8nBaseUrl.endsWith('/') ? n8nBaseUrl : `${n8nBaseUrl}/`);
    workflowUrl.searchParams.set('_n8nacBridge', String(Date.now()));
    const openTarget = await facade.resolveWorkflowWebviewOpen({
        workflowId: workflow.id,
        proxyBaseUrl: proxyUrl,
        workspaceRoot,
        workflowUrl: workflowUrl.toString(),
    });

    if (openTarget.routePath && openTarget.autoLoginPageHtml) {
        proxyService.registerHtmlRoute(openTarget.routePath, openTarget.autoLoginPageHtml);
        outputChannel.appendLine(`[n8n] Opening workflow ${workflow.id} through managed auto-login webview route.`);
    } else {
        outputChannel.appendLine(`[n8n] Opening workflow ${workflow.id} through direct webview route.`);
    }

    return { url: openTarget.url, targetUrl: openTarget.targetUrl };
}

function updateContextKeys() {
    const state = enhancedTreeProvider.getExtensionState();
    vscode.commands.executeCommand('setContext', 'n8n.state', state);
    vscode.commands.executeCommand('setContext', 'n8n.initialized', state === ExtensionState.INITIALIZED);
}

function requireConfigurationController(): N8nConfigurationController {
    if (!configurationController) {
        throw new Error('n8n configuration controller is not initialized.');
    }
    return configurationController;
}

async function migrateWorkspaceConfiguration(context: vscode.ExtensionContext): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        vscode.window.showWarningMessage(NO_WORKSPACE_ERROR_MESSAGE, OPEN_FOLDER_ACTION).then((selection) => {
            if (selection === OPEN_FOLDER_ACTION) void vscode.commands.executeCommand('vscode.openFolder');
        });
        return;
    }

    const result = await runWorkspaceMigrationFromVscode(context, workspaceRoot);
    if (result.outcome === 'not-needed') {
        await vscode.window.showInformationMessage('No migration required.');
        await requireConfigurationController().refresh('migration-not-needed', { force: true });
        return;
    }
    if (result.outcome === 'cancelled') return;

    await requireConfigurationController().refresh('migrate-workspace-configuration-command', { force: true });
    await determineInitialState(context);
    updateContextKeys();
    const backupPath = result.report.backupPath || '';
    const migratedEnvironmentCount = result.report.migratedEnvironmentIds?.length || 0;
    const suffix = backupPath ? ` Backup: ${backupPath}` : migratedEnvironmentCount ? ` ${migratedEnvironmentCount} environment${migratedEnvironmentCount === 1 ? '' : 's'} created.` : '';
    await vscode.window.showInformationMessage(`Migration complete.${suffix}`);
}

function requireAgentRuntimeController(): AgentRuntimeController {
    if (!agentRuntimeController) {
        throw new Error('n8n agent runtime controller is not initialized.');
    }
    return agentRuntimeController;
}

function requireYagrProviderService(): YagrProviderService {
    if (!yagrProviderService) {
        throw new Error('n8n Yagr provider service is not initialized.');
    }
    return yagrProviderService;
}

async function setAgentProviderApiKey(context: vscode.ExtensionContext): Promise<void> {
    await setupAgentProvider(context);
}

async function setupAgentProvider(context: vscode.ExtensionContext): Promise<void> {
    const service = requireYagrProviderService();
    const config = vscode.workspace.getConfiguration('n8n.agent');
    const currentProvider = normalizeYagrProviderId(String(config.get<string>('provider') || 'openai')) || 'openai';
    const picked = await vscode.window.showQuickPick(
        YAGR_SELECTABLE_PROVIDERS.map((provider) => ({
            provider,
            label: YAGR_PROVIDER_DEFINITIONS[provider].label,
            description: YAGR_PROVIDER_DEFINITIONS[provider].description,
            detail: YAGR_PROVIDER_DEFINITIONS[provider].authKind === 'oauth-device'
                ? 'OAuth device flow'
                : YAGR_PROVIDER_DEFINITIONS[provider].requiresApiKey
                    ? 'API key'
                    : 'Account credential',
            picked: provider === currentProvider,
        })),
        {
            title: 'Set up n8n Agent provider',
            placeHolder: 'Providers and credentials are stored separately; model selection is fetched live.',
            ignoreFocusOut: true,
        },
    );

    if (!picked) {
        return;
    }

    try {
        const configured = await service.setupProvider(picked.provider as YagrModelProvider);
        if (!configured) return;
        await service.selectModel(picked.provider as YagrModelProvider);
        vscode.window.showInformationMessage(`Configured n8n Agent provider: ${picked.label}.`);
    } catch (error: any) {
        vscode.window.showErrorMessage(`Provider setup failed: ${error?.message || String(error)}`);
    }
}

async function selectAgentModel(): Promise<void> {
    const service = requireYagrProviderService();
    const config = vscode.workspace.getConfiguration('n8n.agent');
    const currentProvider = normalizeYagrProviderId(String(config.get<string>('provider') || 'openai')) || 'openai';
    const pickedProvider = await vscode.window.showQuickPick(
        YAGR_SELECTABLE_PROVIDERS.map((provider) => ({
            provider,
            label: YAGR_PROVIDER_DEFINITIONS[provider].label,
            description: YAGR_PROVIDER_DEFINITIONS[provider].description,
            picked: provider === currentProvider,
        })),
        {
            title: 'Select provider for this n8n Agent session',
            placeHolder: 'Choose a configured provider, then choose a live model.',
            ignoreFocusOut: true,
        },
    );
    if (!pickedProvider) return;
    const provider = pickedProvider.provider as YagrModelProvider;
    try {
        await config.update('provider', provider, vscode.ConfigurationTarget.Global);
        await service.selectModel(provider);
    } catch (error: any) {
        vscode.window.showErrorMessage(`Model selection failed: ${error?.message || String(error)}`);
    }
}

async function selectAgentReasoningEffort(): Promise<void> {
    const service = requireYagrProviderService();
    const config = vscode.workspace.getConfiguration('n8n.agent');
    const provider = normalizeYagrProviderId(String(config.get<string>('provider') || 'openai')) || 'openai';
    const model = String(config.get<string>('model') || '').trim() || undefined;
    try {
        await service.selectReasoningEffort(provider, model);
    } catch (error: any) {
        vscode.window.showErrorMessage(`Reasoning effort selection failed: ${error?.message || String(error)}`);
    }
}

function getAutoInitConnectionKey(workspaceRoot?: string): string {
    const resolved = getResolvedN8nConfig(workspaceRoot);
    return JSON.stringify({
        workspaceRoot: workspaceRoot || '',
        activeInstanceId: resolved.activeInstanceId || '',
        host: resolved.host || '',
        hasApiKey: Boolean(resolved.apiKey),
        syncFolder: resolved.syncFolder || '',
        projectId: resolved.projectId || '',
        projectName: resolved.projectName || '',
    });
}

async function handleConfigurationSnapshotChanged(
    context: vscode.ExtensionContext,
    event: N8nConfigurationChangeEvent,
): Promise<void> {
    if (suppressNextConfigurationReaction) {
        return;
    }

    if (initializingPromise) {
        outputChannel.appendLine(`[n8n] Configuration changed (${event.reason}) while initialization is running.`);
        return;
    }

    const runtimeChanged = Boolean(
        event.previous
        && event.previous.runtimeSignature !== event.snapshot.runtimeSignature,
    );
    if (runtimeChanged) {
        failedAutoInitRuntimeSignature = undefined;
    }
    if (runtimeChanged || event.reason.includes('secret') || event.reason.includes('save')) {
        failedAutoInitConnectionKey = undefined;
    }

    if (syncManager && runtimeChanged) {
        const workspaceRoot = getWorkspaceRoot();
        const hasUnifiedConfig = workspaceRoot
            ? fs.existsSync(path.join(workspaceRoot, 'n8nac-config.json'))
            : false;
        if (!hasUnifiedConfig) {
            resetExtensionRuntimeState();
            await determineInitialState(context);
            return;
        }

        if (event.snapshot.hasValidConnection) {
            await reinitializeSyncManager(context, { silent: event.reason !== 'manual' });
        } else {
            resetExtensionRuntimeState();
            await determineInitialState(context);
        }
        return;
    }

    if (syncManager) {
        updateContextKeys();
        return;
    }

    await determineInitialState(context);
}

async function refreshConfigurationSnapshotAfterHandledMutation(reason: string): Promise<void> {
    const controller = configurationController;
    if (!controller) {
        return;
    }

    suppressNextConfigurationReaction = true;
    try {
        await controller.refresh(reason, { force: true });
    } finally {
        suppressNextConfigurationReaction = false;
    }
}

function disposeRuntimeDisposables(): void {
    for (const disposable of runtimeDisposables) {
        disposable.dispose();
    }
    runtimeDisposables = [];
}

function toInstanceQuickPickItem(
    instance: { id: string; name: string; host?: string; projectName?: string; verification?: { status?: string } },
    activeInstanceId?: string
): InstanceQuickPickItem {
    const verificationDetail = instance.verification?.status === 'verified'
        ? 'Verified'
        : instance.verification?.status === 'failed'
            ? 'Verification failed'
            : undefined;
    return {
        label: instance.name,
        description: instance.host || 'Host not configured',
        detail: instance.projectName || verificationDetail || (instance.id === activeInstanceId ? 'Currently active' : ''),
        picked: instance.id === activeInstanceId,
        instanceId: instance.id,
    };
}

function toEnvironmentQuickPickItem(
    environment: { id: string; name: string; environmentTargetId: string; projectName?: string; syncFolder?: string },
    activeEnvironmentId?: string,
): EnvironmentQuickPickItem {
    return {
        label: environment.name,
        description: environment.projectName || environment.environmentTargetId,
        detail: environment.syncFolder || (environment.id === activeEnvironmentId ? 'Currently active' : ''),
        picked: environment.id === activeEnvironmentId,
        environmentId: environment.id,
    };
}

async function switchWorkspaceInstance(
    context: vscode.ExtensionContext,
    args: SwitchInstanceCommandArgs = {}
): Promise<string | undefined> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        vscode.window.showErrorMessage(NO_WORKSPACE_ERROR_MESSAGE);
        return undefined;
    }

    const configService = new ConfigService(workspaceRoot);
    const workspaceConfig = configService.getWorkspaceConfig();
    if (workspaceConfig.version !== 4) {
        const instances = configService.listInstances();
        if (!instances.length) {
            vscode.window.showWarningMessage('No configured n8n instances found.');
            return undefined;
        }

        const activeInstanceId = configService.getActiveInstanceId();
        let targetInstanceId = args.instanceId?.trim();
        if (!targetInstanceId) {
            const picked = await vscode.window.showQuickPick(
                instances.map((instance) => toInstanceQuickPickItem(instance, activeInstanceId)),
                {
                    title: 'Select the active workspace instance',
                    ignoreFocusOut: true,
                }
            );
            if (!picked) {
                return undefined;
            }
            targetInstanceId = picked.instanceId;
        }

        if (targetInstanceId === activeInstanceId) {
            return targetInstanceId;
        }

        const selectedInstance = configService.pinWorkspaceInstance(targetInstanceId);
        if (syncManager) {
            await reinitializeSyncManager(context);
        } else {
            await determineInitialState(context);
        }
        await refreshConfigurationSnapshotAfterHandledMutation('command-switch-workspace-instance');
        updateContextKeys();

        if (!args.silent) {
            vscode.window.showInformationMessage(`Active n8n instance: ${selectedInstance.name}`);
        }

        return selectedInstance.id;
    }

    const environments = configService.listEnvironments();
    if (!environments.length) {
        vscode.window.showWarningMessage('No workspace environments found. Create one in n8n: Configure.');
        return undefined;
    }

    const activeEnvironmentId = workspaceConfig.activeEnvironmentId;
    let targetEnvironmentId = args.environmentId?.trim() || args.instanceId?.trim();

    if (!targetEnvironmentId) {
        const picked = await vscode.window.showQuickPick(
            environments.map((environment) => toEnvironmentQuickPickItem(environment, activeEnvironmentId)),
            {
                title: 'Select the active workspace environment',
                ignoreFocusOut: true,
            }
        );

        if (!picked) {
            return undefined;
        }

        targetEnvironmentId = picked.environmentId;
    }

    if (targetEnvironmentId === activeEnvironmentId) {
        return targetEnvironmentId;
    }

    const selectedEnvironment = configService.pinEnvironment(targetEnvironmentId);

    if (syncManager) {
        await reinitializeSyncManager(context);
    } else {
        await determineInitialState(context);
    }
    await refreshConfigurationSnapshotAfterHandledMutation('command-switch-workspace-environment');

    updateContextKeys();

    if (!args.silent) {
        vscode.window.showInformationMessage(`Active n8n environment: ${selectedEnvironment.name}`);
    }

    return selectedEnvironment.id;
}

async function pinWorkspaceInstance(
    context: vscode.ExtensionContext,
    args: SwitchInstanceCommandArgs = {}
): Promise<string | undefined> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        vscode.window.showErrorMessage(NO_WORKSPACE_ERROR_MESSAGE);
        return undefined;
    }

    const configService = new ConfigService(workspaceRoot);
    const workspaceConfig = configService.getWorkspaceConfig();
    if (workspaceConfig.version !== 4) {
        const instances = configService.listInstances();
        if (!instances.length) {
            vscode.window.showWarningMessage('No configured n8n instances found.');
            return undefined;
        }

        let targetInstanceId = args.instanceId?.trim();
        if (!targetInstanceId) {
            const activeInstanceId = configService.getActiveInstanceId();
            const picked = await vscode.window.showQuickPick(
                instances.map((instance) => toInstanceQuickPickItem(instance, activeInstanceId)),
                {
                    title: 'Pin workspace instance',
                    ignoreFocusOut: true,
                }
            );
            if (!picked) {
                return undefined;
            }
            targetInstanceId = picked.instanceId;
        }

        const selectedInstance = configService.pinWorkspaceInstance(targetInstanceId);
        if (syncManager) {
            await reinitializeSyncManager(context);
        } else {
            await determineInitialState(context);
        }
        await refreshConfigurationSnapshotAfterHandledMutation('command-pin-workspace-instance');
        updateContextKeys();

        if (!args.silent) {
            vscode.window.showInformationMessage(`Workspace instance pinned: ${selectedInstance.name}`);
        }

        return selectedInstance.id;
    }

    const environments = configService.listEnvironments();
    if (!environments.length) {
        vscode.window.showWarningMessage('No workspace environments found. Create one in n8n: Configure.');
        return undefined;
    }

    let targetEnvironmentId = args.environmentId?.trim() || args.instanceId?.trim();
    if (!targetEnvironmentId) {
        const activeEnvironmentId = workspaceConfig.activeEnvironmentId;
        const picked = await vscode.window.showQuickPick(
            environments.map((environment) => toEnvironmentQuickPickItem(environment, activeEnvironmentId)),
            {
                title: 'Pin workspace environment',
                ignoreFocusOut: true,
            }
        );
        if (!picked) {
            return undefined;
        }
        targetEnvironmentId = picked.environmentId;
    }

    const selectedEnvironment = configService.pinEnvironment(targetEnvironmentId);
    if (syncManager) {
        await reinitializeSyncManager(context);
    } else {
        await determineInitialState(context);
    }
    await refreshConfigurationSnapshotAfterHandledMutation('command-pin-workspace-environment');
    updateContextKeys();

    if (!args.silent) {
        vscode.window.showInformationMessage(`Workspace environment pinned: ${selectedEnvironment.name}`);
    }

    return selectedEnvironment.id;
}

async function clearWorkspaceInstancePin(context: vscode.ExtensionContext): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        vscode.window.showErrorMessage(NO_WORKSPACE_ERROR_MESSAGE);
        return;
    }

    const configService = new ConfigService(workspaceRoot);
    const workspaceConfig = configService.getWorkspaceConfig();
    if (workspaceConfig.version !== 4) {
        configService.clearWorkspaceInstanceOverride();
        if (syncManager) {
            await reinitializeSyncManager(context);
        } else {
            await determineInitialState(context);
        }
        await refreshConfigurationSnapshotAfterHandledMutation('command-clear-workspace-instance');
        updateContextKeys();
        vscode.window.showInformationMessage('Workspace instance override cleared.');
        return;
    }

    vscode.window.showInformationMessage('This workspace uses environments. Use "Pin workspace environment" to change the default target.');
}

async function deleteWorkspaceInstance(
    context: vscode.ExtensionContext,
    args: DeleteInstanceCommandArgs = {}
): Promise<string | undefined> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        vscode.window.showErrorMessage(NO_WORKSPACE_ERROR_MESSAGE);
        return undefined;
    }

    const configService = new ConfigService(workspaceRoot);
    const instances = configService.listInstances();
    if (!instances.length) {
        vscode.window.showWarningMessage('No configured n8n instances found.');
        return undefined;
    }

    const activeInstanceId = configService.getActiveInstanceId();
    let targetInstanceId = args.instanceId?.trim();

    if (!targetInstanceId) {
        const picked = await vscode.window.showQuickPick(
            instances.map((instance) => toInstanceQuickPickItem(instance, activeInstanceId)),
            {
                title: 'Select the n8n instance to delete',
                ignoreFocusOut: true,
            }
        );

        if (!picked) {
            return undefined;
        }

        targetInstanceId = picked.instanceId;
    }

    const targetInstance = instances.find((instance) => instance.id === targetInstanceId);
    if (!targetInstance) {
        vscode.window.showErrorMessage(`Unknown instance: ${targetInstanceId}`);
        return undefined;
    }

    if (!args.skipConfirm) {
        const confirmation = await vscode.window.showWarningMessage(
            `Delete instance "${targetInstance.name}"?`,
            { modal: true },
            'Delete'
        );

        if (confirmation !== 'Delete') {
            return undefined;
        }
    }

    const wasActive = targetInstance.id === activeInstanceId;
    const result = configService.deleteInstance(targetInstance.id);

    const refreshAfterDelete = async () => {
        if (!wasActive) {
            await refreshConfigurationSnapshotAfterHandledMutation('command-delete-instance');
            updateContextKeys();
            return;
        }

        if (result.activeInstance) {
            await reinitializeSyncManager(context);
        } else {
            await determineInitialState(context);
        }
        await refreshConfigurationSnapshotAfterHandledMutation('command-delete-instance');
        updateContextKeys();
    };

    try {
        if (args.silent) {
            void refreshAfterDelete().catch((error: any) => {
                outputChannel.appendLine(`[n8n] Failed to refresh after deleting instance: ${error?.message || error}`);
            });
        } else {
            await refreshAfterDelete();
        }
    } catch (error: any) {
        outputChannel.appendLine(`[n8n] Instance deleted but refresh failed: ${error?.message || error}`);
        if (!args.silent) {
            vscode.window.showWarningMessage(
                `Deleted instance "${result.deletedInstance.name}", but the extension state needs a refresh: ${error?.message || error}`
            );
        }
    }

    if (!args.silent) {
        const message = result.activeInstance
            ? `Deleted instance "${result.deletedInstance.name}". Current instance: ${result.activeInstance.name}`
            : `Deleted instance "${result.deletedInstance.name}". No instance is currently configured.`;
        vscode.window.showInformationMessage(message);
    }

    return result.deletedInstance.id;
}

function resetExtensionRuntimeState(): void {
    if (syncManager) {
        syncManager.removeAllListeners();
    }

    disposeRuntimeDisposables();

    syncManager = undefined;
    cli = undefined;
    conflictStore.clear();
    enhancedTreeProvider.setSyncManager(undefined);
    clearSyncManager();
    store.dispatch(setWorkflows([]));
    store.dispatch(clearConflicts());
}

async function determineInitialState(context: vscode.ExtensionContext) {
    const configValidation = validateN8nConfig();
    const workspaceRoot = getWorkspaceRoot();
    const snapshot = configurationController?.getSnapshot();

    if (!workspaceRoot) {
        resetExtensionRuntimeState();
        enhancedTreeProvider.setExtensionState(ExtensionState.UNINITIALIZED);
        statusBar.hide();
        updateContextKeys();
        return;
    }

    const hasUnifiedConfig = fs.existsSync(path.join(workspaceRoot, 'n8nac-config.json'))
        || (snapshot?.workspaceRoot === workspaceRoot && snapshot.hasWorkspaceConfig);
    if (!hasUnifiedConfig) {
        resetExtensionRuntimeState();
        enhancedTreeProvider.setExtensionState(ExtensionState.CONFIGURING);
        statusBar.showConfiguring();
        updateContextKeys();
        return;
    }

    const hasValidConnection = configValidation.isValid
        || Boolean(snapshot?.workspaceRoot === workspaceRoot && snapshot.hasWorkspaceConfig && snapshot.hasValidConnection);

    if (hasValidConnection) {
        const autoInitConnectionKey = getAutoInitConnectionKey(workspaceRoot);
        if (failedAutoInitConnectionKey === autoInitConnectionKey) {
            outputChannel.appendLine('[n8n] Skipping automatic sync initialization for unchanged connection after previous failure.');
            updateContextKeys();
            return;
        }

        const runtimeSignature = configurationController?.getSnapshot()?.runtimeSignature;
        if (runtimeSignature && failedAutoInitRuntimeSignature === runtimeSignature) {
            outputChannel.appendLine('[n8n] Skipping automatic sync initialization for unchanged config after previous failure.');
            updateContextKeys();
            return;
        }

        outputChannel.appendLine('[n8n] Valid effective n8n config detected. Loading sync manager...');
        enhancedTreeProvider.setExtensionState(ExtensionState.INITIALIZING);
        updateContextKeys();
        statusBar.showLoading();
        try {
            initializingPromise = initializeSyncManager(context);
            await initializingPromise;
            failedAutoInitRuntimeSignature = undefined;
            failedAutoInitConnectionKey = undefined;
            enhancedTreeProvider.setExtensionState(ExtensionState.INITIALIZED);
            statusBar.showSynced();
        } catch (error: any) {
            failedAutoInitRuntimeSignature = runtimeSignature;
            failedAutoInitConnectionKey = autoInitConnectionKey;
            outputChannel.appendLine(`[n8n] Auto-load failed: ${error.message}`);
            enhancedTreeProvider.setExtensionState(ExtensionState.ERROR, error.message);
            statusBar.showError(error.message);
        } finally {
            initializingPromise = undefined;
        }
    } else if (!configValidation.isValid || snapshot?.error) {
        enhancedTreeProvider.setExtensionState(ExtensionState.CONFIGURING);
        statusBar.showConfiguring();
    }
    updateContextKeys();
}

async function handleInitializeCommand(context: vscode.ExtensionContext) {
    if (initializingPromise) {
        outputChannel.appendLine('[n8n] Initialization already in progress, waiting...');
        try {
            await initializingPromise;
            vscode.window.showInformationMessage('✅ n8n as code initialized successfully!');
        } catch (error: any) {
            vscode.window.showErrorMessage(`Initialization failed: ${error.message}`);
        }
        return;
    }

    if (!vscode.workspace.workspaceFolders?.length) {
        await showNoWorkspaceError();
        return;
    }

    const configValidation = validateN8nConfig();
    if (!configValidation.isValid) {
        vscode.window.showErrorMessage(`Missing configuration: ${configValidation.missing.join(', ')}`);
        ConfigurationWebview.createOrShow(context, requireConfigurationController());
        return;
    }

    enhancedTreeProvider.setExtensionState(ExtensionState.INITIALIZING);
    updateContextKeys();
    statusBar.showLoading();

    try {
        failedAutoInitRuntimeSignature = undefined;
        failedAutoInitConnectionKey = undefined;
        initializingPromise = initializeSyncManager(context);
        await initializingPromise;
        failedAutoInitRuntimeSignature = undefined;
        failedAutoInitConnectionKey = undefined;
        enhancedTreeProvider.setExtensionState(ExtensionState.INITIALIZED);
        updateContextKeys();
        statusBar.showSynced();
        vscode.window.showInformationMessage('✅ n8n as code initialized successfully!');
    } catch (error: any) {
        failedAutoInitRuntimeSignature = configurationController?.getSnapshot()?.runtimeSignature;
        failedAutoInitConnectionKey = getAutoInitConnectionKey(getWorkspaceRoot());
        outputChannel.appendLine(`[n8n] Initialization failed: ${error.message}`);
        enhancedTreeProvider.setExtensionState(ExtensionState.ERROR, error.message);
        statusBar.showError(error.message);
        vscode.window.showErrorMessage(`Initialization failed: ${error.message}`);
    } finally {
        initializingPromise = undefined;
    }
}

async function showNoWorkspaceError() {
    const action = await vscode.window.showErrorMessage(NO_WORKSPACE_ERROR_MESSAGE, OPEN_FOLDER_ACTION);
    if (action === OPEN_FOLDER_ACTION) {
        await vscode.commands.executeCommand('vscode.openFolder');
    }
}

function getHttpStatus(error: any): number | undefined {
    return error?.response?.status;
}

function formatN8nApiError(error: any, host: string): string {
    const status = getHttpStatus(error);
    if (status === 401) {
        return `Cannot authenticate to n8n at "${host}". Check the API key for the effective instance.`;
    }
    if (status === 403) {
        return `The API key reached n8n at "${host}", but it cannot access workflows. Check the API key permissions.`;
    }
    if (status === 404) {
        return `The n8n workflows API is not available at "${host}". Check the instance URL.`;
    }
    if (!error?.response) {
        return `Cannot connect to n8n at "${host}": ${error?.message || error}`;
    }
    return `n8n API request failed at "${host}" with status ${status}: ${error?.message || error}`;
}

async function assertN8nApiAccess(client: N8nApiClient, host: string): Promise<void> {
    try {
        await client.assertApiAccess();
    } catch (error: any) {
        throw new Error(formatN8nApiError(error, host));
    }
}

async function generateAiContextForWorkspace(
    context: vscode.ExtensionContext,
    client: N8nApiClient | undefined,
    workspaceRoot: string,
    options: {
        host?: string;
        progress?: vscode.Progress<{ message?: string }>;
        silent?: boolean;
        versionHint?: string;
    } = {},
): Promise<string> {
    const version = options.versionHint
        || await resolveAiContextVersion(context, client, options.host, options.silent);
    options.progress?.report({ message: 'Generating AGENTS.md...' });

    const distTag = (typeof __N8NAC_VERSION__ !== 'undefined' && __N8NAC_VERSION__ === 'next') ? 'next' : undefined;
    const cliVersion = (typeof __N8NAC_CLI_SEMVER__ !== 'undefined' && __N8NAC_CLI_SEMVER__) ? __N8NAC_CLI_SEMVER__ : undefined;
    await new AiContextGenerator().generate(workspaceRoot, version, distTag, {
        cliVersion,
        cliCommandOverride: resolveAiContextCliCommandOverride(context, workspaceRoot),
        managerCommandOverride: resolveAiContextManagerCommandOverride(context),
    });
    await context.workspaceState.update('n8n.lastInitVersion', version);
    enhancedTreeProvider.setAIContextInfo(version, false);

    if (!options.silent) {
        vscode.window.showInformationMessage(`✨ n8n AI Context Initialized! (v${version})`);
    }

    return version;
}

function resolveAiContextConnection(workspaceRoot: string): { client?: N8nApiClient; host?: string } {
    const fromEffectiveContext = (() => {
        try {
            const effective = new ConfigService(workspaceRoot).getEffectiveContext();
            const host = effective?.apiBaseUrl || effective?.host || effective?.baseUrl || '';
            const apiKey = effective?.apiKey || '';
            return { host, apiKey };
        } catch {
            return undefined;
        }
    })();

    const credentials = fromEffectiveContext?.host || fromEffectiveContext?.apiKey
        ? fromEffectiveContext
        : getN8nConfig();
    const host = credentials?.host || '';
    const apiKey = credentials?.apiKey || '';
    return {
        host,
        client: host && apiKey ? new N8nApiClient({ host, apiKey }) : undefined,
    };
}

async function resolveAiContextVersion(
    context: vscode.ExtensionContext,
    client: N8nApiClient | undefined,
    host?: string,
    silent?: boolean,
): Promise<string> {
    if (client) {
        try {
            return (await client.getHealth()).version;
        } catch (error: any) {
            const message = host
                ? `Could not fetch n8n version from "${host}"; generating AI context with fallback version.`
                : 'Could not fetch n8n version; generating AI context with fallback version.';
            outputChannel.appendLine(`[n8n] ${message} ${error?.message || error}`);
            if (!silent) {
                vscode.window.showWarningMessage(`n8n: ${message}`);
            }
        }
    }

    return context.workspaceState.get<string>('n8n.lastInitVersion') || 'Unknown';
}

function resolveAiContextCliCommandOverride(context: vscode.ExtensionContext, workspaceRoot: string): string | undefined {
    if (process.env.N8NAC_COMMAND) {
        return undefined;
    }
    if (getN8nacDevConfigFilenames().some((filename) => fs.existsSync(path.join(workspaceRoot, filename)))) {
        return undefined;
    }
    if (context.extensionMode !== vscode.ExtensionMode.Development) {
        return undefined;
    }

    const localCliPath = path.resolve(context.extensionPath, '..', 'cli', 'dist', 'index.js');
    if (!fs.existsSync(localCliPath)) {
        return undefined;
    }
    return `node ${quoteShellArg(localCliPath)}`;
}

function resolveAiContextManagerCommandOverride(context: vscode.ExtensionContext): string | undefined {
    if (process.env.N8N_MANAGER_COMMAND) {
        return process.env.N8N_MANAGER_COMMAND;
    }
    if (context.extensionMode !== vscode.ExtensionMode.Development) {
        return undefined;
    }

    const siblingManagerCliPath = path.resolve(context.extensionPath, '..', '..', '..', 'n8n-manager', 'packages', 'cli', 'dist', 'index.js');
    if (!fs.existsSync(siblingManagerCliPath)) {
        return undefined;
    }
    return `node ${quoteShellArg(siblingManagerCliPath)}`;
}

function quoteShellArg(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function updateAiContextAfterSyncInitialization(
    context: vscode.ExtensionContext,
    client: N8nApiClient,
    workspaceRoot: string,
    versionHint?: string,
): Promise<void> {
    const currentVersion = versionHint || await resolveAiContextVersion(context, client, undefined, true);
    const lastVersion = context.workspaceState.get<string>('n8n.lastInitVersion');
    const missingAgentsFile = !fs.existsSync(path.join(workspaceRoot, 'AGENTS.md'));
    const needsUpdate = missingAgentsFile || Boolean(currentVersion && lastVersion && currentVersion !== lastVersion);

    enhancedTreeProvider.setAIContextInfo(currentVersion, needsUpdate);
    if (!needsUpdate) {
        return;
    }

    try {
        outputChannel.appendLine('[n8n] Updating AI context after sync initialization...');
        await generateAiContextForWorkspace(context, client, workspaceRoot, {
            silent: true,
            versionHint: currentVersion,
        });
    } catch (error: any) {
        outputChannel.appendLine(`[n8n] Failed to auto-generate AI context: ${error.message}`);
    }
}

async function initializeSyncManager(context: vscode.ExtensionContext) {
    resetExtensionRuntimeState();

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceRoot) throw new Error(NO_WORKSPACE_ERROR_MESSAGE);

    const facade = createN8nManagerFacade({ workspaceRoot });
    const configService = new ConfigService(workspaceRoot);
    const workspaceConfig = configService.getWorkspaceConfig();
    const environment = workspaceConfig.version === 4
        ? await configService.prepareEnvironment()
        : undefined;
    const prepared = environment ? undefined : await facade.prepareEffectiveContext({
        workspaceRoot,
        syncFolderDefault: 'workspace',
        consumer: 'vscode',
        autoStart: true,
    });
    if (prepared?.runtime.blocked) {
        throw new Error(prepared.runtime.blocked.message);
    }

    const effective = prepared?.context;
    const resolvedConfig = {
        ...getResolvedN8nConfig(workspaceRoot),
        activeInstanceId: environment?.activeInstanceId || effective?.activeInstanceId || '',
        host: environment?.host || effective?.apiBaseUrl || effective?.host || '',
        apiKey: environment?.apiKey || effective?.apiKey || '',
        syncFolder: environment?.syncFolder || effective?.syncFolder || 'workflows',
        projectId: environment?.projectId || effective?.projectId || '',
        projectName: environment?.projectName || effective?.projectName || '',
    };

    const { host, apiKey } = resolvedConfig;
    const folder = resolvedConfig.syncFolder || 'workflows';
    let projectId = resolvedConfig.projectId || undefined;
    let projectName = resolvedConfig.projectName || undefined;
    if (!host || !apiKey) throw new Error('Host/API Key missing. Please configure n8n.');

    const credentials: IN8nCredentials = { host, apiKey };
    const client = new N8nApiClient(credentials);
    await assertN8nApiAccess(client, host);
    const health = await client.getHealth();

    if (environment && (!projectId || !projectName)) {
        throw new Error(`Environment "${environment.environmentName}" is missing project configuration. Set it in n8n: Configure or run n8nac env update ${environment.environmentId} --project-id <id> --project-name <name>.`);
    }

    if (!projectId || !projectName) {
        const projects = environment ? await client.getProjects() : await facade.listProjects({
            workspaceRoot,
            syncFolderDefault: 'workspace',
            consumer: 'vscode',
            autoStart: true,
        });
        if (!projects.length) throw new Error('No projects found. Cannot initialize sync.');

        let selectedProject = projects.length === 1 ? projects[0] : undefined;

        if (!selectedProject) {
            const picked = await vscode.window.showQuickPick(
                projects.map((p: any) => ({
                    label: getProjectDisplayLabel(p),
                    description: p.type,
                    detail: getProjectDetail(p),
                    project: p
                })),
                { title: 'Select the n8n project to sync', ignoreFocusOut: true }
            );
            if (!picked) throw new Error('Project selection cancelled.');
            selectedProject = (picked as any).project;
        }

        if (!selectedProject) throw new Error('No project selected.');
        projectId = selectedProject.id;
        projectName = getCanonicalProjectName(selectedProject);
        outputChannel.appendLine(`[n8n] Selected project: ${getProjectDisplayLabel(selectedProject)} (${projectId})`);
    }

    const absDirectory = path.isAbsolute(folder) ? folder : path.resolve(workspaceRoot, folder);

    let instanceIdentifier: string;
    try {
        const resolution = await resolveInstanceIdentifier(credentials, {
            client,
        });
        instanceIdentifier = resolution.identifier;
        outputChannel.appendLine(`[n8n] Instance identifier: ${instanceIdentifier}`);
        const currentIdentifier = environment?.instanceIdentifier || effective?.instance.instanceIdentifier;
        if (!environment && !isCanonicalUserInstanceIdentifier(currentIdentifier)) {
            await facade.upsertInstance({
                id: effective?.activeInstanceId,
                instanceIdentifier,
            }, { setActive: false });
        }
    } catch (error: any) {
        throw new Error(`Cannot connect to n8n instance at "${host}". Please check if n8n is running.`);
    }

    // Create SyncManager (the stateful engine: WorkflowStateTracker, events, etc.)
    syncManager = new SyncManager(client, {
        directory: absDirectory,
        syncInactive: true,
        ignoredTags: [],
        instanceIdentifier,
        instanceConfigPath: path.join(workspaceRoot, 'n8nac-config.json'),
        projectId: projectId!,
        projectName: projectName!,
        environmentId: environment?.environmentId,
        environmentName: environment?.environmentName,
        environmentTargetId: environment?.environmentTargetId,
        environmentTargetName: environment?.environmentTargetName,
        sourceKind: environment?.sourceKind,
    });

    // Create CliApi — the thin facade that all command handlers use.
    // This mirrors exactly: n8nac list / fetch / pull / push
    cli = new CliApi(syncManager);

    enhancedTreeProvider.setSyncManager(syncManager);
    setSyncManager(syncManager);
    enhancedTreeProvider.subscribeToStore(store);

    // ── Event wiring ─────────────────────────────────────────────────────────
    syncManager.on('connection-lost', (error: Error) => {
        outputChannel.appendLine(`[n8n] CONNECTION LOST: ${error.message}`);
        enhancedTreeProvider.setExtensionState(ExtensionState.ERROR, error.message);
        statusBar.showError('Connection lost');
        vscode.window.showErrorMessage(
            'Lost connection to n8n instance.',
            'Retry Connection', 'Open Settings'
        ).then(choice => {
            if (choice === 'Retry Connection') reinitializeSyncManager(context);
            else if (choice === 'Open Settings') vscode.commands.executeCommand('n8n.openSettings');
        });
    });

    syncManager.on('error', (msg: any) => {
        outputChannel.appendLine(`[n8n] Error: ${msg}`);
        vscode.window.showErrorMessage(`n8n Error: ${msg}`);
    });

    syncManager.on('log', (msg: string) => {
        outputChannel.appendLine(msg);
        if (msg.includes('Sync complete') || msg.includes('Push complete')) {
            vscode.window.showInformationMessage(msg.replace(/^📥 |^📤 |^🔄 |^✅ /, ''));
        }
    });

    syncManager.on('remote-updated', (data: { workflowId: string; filename: string }) => {
        const reloaded = workflowWebviewRegistry.reloadIfMatching(data.workflowId);
        outputChannel.appendLine(`[n8n-agent-debug] syncManager remote-updated workflowId=${data.workflowId} filename=${data.filename} reloaded=${reloaded}`);
    });

    // ── Lightweight UI watchers ──────────────────────────────────────────────
    //
    // 1. VS Code native FS watcher on *.workflow.ts: detects new/deleted files → refreshes list.
    //    Change events are deliberately ignored — local modifications are detected via hash
    //    comparison in getSingleWorkflowDetailedStatus() only when an operation requires it.
    // 2. Sync event journal watcher: written by CLI after successful remote mutations.
    // 3. Remote polling every 60s: discovers workflows created/deleted on the n8n instance.
    if (vscode.workspace.workspaceFolders?.length) {
        const pattern = path.isAbsolute(folder)
            ? new vscode.RelativePattern(vscode.Uri.file(absDirectory), '**/*.workflow.ts')
            : new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], `${folder}/**/*.workflow.ts`);
        const fileWatcher = vscode.workspace.createFileSystemWatcher(pattern, false, true, false);
        const reloadList = async () => {
            if (!syncManager) return;
            try {
                await store.dispatch(loadWorkflows());
                enhancedTreeProvider.refresh();
            } catch (err) {
                console.error('[n8n] FS watcher: failed to refresh list', err);
            }
        };
        fileWatcher.onDidCreate(reloadList);
        fileWatcher.onDidDelete(reloadList);
        runtimeDisposables.push(fileWatcher);
    }

    // Remote polling — lightweight `list` every 60 seconds to surface new/deleted remote workflows.
    const pollingInterval = setInterval(async () => {
        if (!cli) return;
        try {
            store.dispatch(setWorkflows(await cli.list({ fetchRemote: true })));
            enhancedTreeProvider.refresh();
        } catch (err) {
            console.error('[n8n] Polling: failed to refresh list', err);
        }
    }, 60_000);
    runtimeDisposables.push({ dispose: () => clearInterval(pollingInterval) });

    statusBar.setWatchMode(false);

    // Initial list — uses cli.list(fetchRemote: true) which mirrors `n8nac list`
    outputChannel.appendLine('[n8n] Loading workflow list...');
    try {
        const workflows = await cli.list({ fetchRemote: true });
        store.dispatch(setWorkflows(workflows));
        outputChannel.appendLine(`[n8n] Found ${workflows.length} workflows.`);
    } catch (error: any) {
        resetExtensionRuntimeState();
        outputChannel.appendLine(`[n8n] Failed to load workflows: ${error.message}`);
        throw error;
    }

    // 2. Sync event journal watcher: JSONL is the SSOT for push outcomes.
    //    Register after the initial list so SyncManager internals are initialized.
    //    The webview reloads only for new workflow.push success events with remoteChanged=true.
    if (vscode.workspace.workspaceFolders?.length && syncManager) {
        const journalPattern = path.isAbsolute(folder)
            ? new vscode.RelativePattern(vscode.Uri.file(absDirectory), `**/${SYNC_EVENT_JOURNAL_FILENAME}`)
            : new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], `${folder}/**/${SYNC_EVENT_JOURNAL_FILENAME}`);
        const journalUri = vscode.Uri.file(await syncManager.getSyncEventJournalPath());
        await processSyncEventJournal(journalUri, 'sync journal seed', true);

        const journalWatcher = vscode.workspace.createFileSystemWatcher(journalPattern, false, false, true);
        const handleJournalWrite = async (changedUri: vscode.Uri) => {
            if (!cli) return;
            try {
                outputChannel.appendLine(`[n8n-agent-debug] syncEventJournal change path=${changedUri.fsPath}`);
                store.dispatch(setWorkflows(await cli.list()));
                enhancedTreeProvider.refresh();
                await processSyncEventJournal(changedUri, 'syncEventWatcher');
            } catch (err) {
                console.error('[n8n] Sync event watcher: failed to refresh after CLI operation', err);
            }
        };
        journalWatcher.onDidCreate(handleJournalWrite);
        journalWatcher.onDidChange(handleJournalWrite);
        runtimeDisposables.push(journalWatcher);

        const journalPollingInterval = setInterval(() => {
            void processSyncEventJournal(journalUri, 'syncEventPoll').catch((err) => {
                console.error('[n8n] Sync event poll: failed to process journal', err);
            });
        }, 2_000);
        runtimeDisposables.push({ dispose: () => clearInterval(journalPollingInterval) });
    }

    await updateAiContextAfterSyncInitialization(context, client, workspaceRoot, health.version);
}

async function reinitializeSyncManager(
    context: vscode.ExtensionContext,
    options: { silent?: boolean } = {},
) {
    if (!syncManager) return;
    if (initializingPromise) {
        await initializingPromise;
        return;
    }

    outputChannel.appendLine('[n8n] Reinitializing with new settings...');
    try {
        syncManager.removeAllListeners();
        initializingPromise = initializeSyncManager(context);
        await initializingPromise;
        enhancedTreeProvider.setExtensionState(ExtensionState.INITIALIZED);
        updateContextKeys();
        enhancedTreeProvider.refresh();
        if (!options.silent) {
            vscode.window.showInformationMessage('✅ n8n settings updated successfully.');
        }
    } catch (error: any) {
        failedAutoInitRuntimeSignature = configurationController?.getSnapshot()?.runtimeSignature;
        failedAutoInitConnectionKey = getAutoInitConnectionKey(getWorkspaceRoot());
        outputChannel.appendLine(`[n8n] Failed to reinitialize: ${error.message}`);
        enhancedTreeProvider.setExtensionState(ExtensionState.ERROR, error.message);
        updateContextKeys();
        if (!options.silent) {
            vscode.window.showErrorMessage(`Failed to update settings: ${error.message}`);
        }
    } finally {
        initializingPromise = undefined;
    }
}

export async function deactivate(): Promise<void> {
    await telemetryClient?.flush(1000);
    agentRuntimeController?.dispose();
    agentRuntimeController = undefined;
    disposeRuntimeDisposables();
    proxyService.stop();
}
