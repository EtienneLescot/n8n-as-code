import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Injected at build time by esbuild (see esbuild.config.js)
declare const __N8NAC_VERSION__: string;
import {
    SyncManager, CliApi, N8nApiClient, IN8nCredentials, WorkflowSyncStatus, ConfigService,
    resolveInstanceIdentifier
} from 'n8nac';
import { AiContextGenerator } from '@n8n-as-code/skills';

import { StatusBar } from './ui/status-bar.js';
import { EnhancedWorkflowTreeProvider } from './ui/enhanced-workflow-tree-provider.js';
import { WorkflowWebview } from './ui/workflow-webview.js';
import { ConfigurationWebview } from './ui/configuration-webview.js';
import { WorkflowDecorationProvider } from './ui/workflow-decoration-provider.js';
import { ProxyService } from './services/proxy-service.js';
import { ExtensionState } from './types.js';
import { getN8nConfig, getResolvedN8nConfig, validateN8nConfig, getWorkspaceRoot, isFolderPreviouslyInitialized } from './utils/state-detection.js';
import { NO_WORKSPACE_ERROR_MESSAGE, OPEN_FOLDER_ACTION } from './constants/workspace.js';
import { writeUnifiedWorkspaceConfig } from './utils/unified-config.js';
import { buildWorkflowQuickPickItems } from './utils/workflow-finder.js';
import { isClipboardBridgeRequired } from './utils/clipboard-utils.js';
import { IWorkflowStatus } from 'n8nac';

import {
    store,
    setSyncManager,
    clearSyncManager,
    setWorkflows,
    selectAllWorkflows,
    addConflict,
    removeConflict,
    clearConflicts
} from './services/workflow-store.js';

// ------- Clipboard bridge for macOS -------
/**
 * Register the clipboard paste handler on the current WorkflowWebview panel.
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
}

// ------- Module-level singletons -------
let syncManager: SyncManager | undefined;
/** CliApi wraps SyncManager and exposes the same four commands as the CLI binary:
 *  list, fetch, pull, push. This is the only object the command handlers touch. */
let cli: CliApi | undefined;
let initializingPromise: Promise<void> | undefined;
let lastConfigRefreshSignature: string | undefined;
let runtimeDisposables: vscode.Disposable[] = [];

const statusBar = new StatusBar();
const proxyService = new ProxyService();
const enhancedTreeProvider = new EnhancedWorkflowTreeProvider();
const decorationProvider = new WorkflowDecorationProvider();
const outputChannel = vscode.window.createOutputChannel("n8n-as-code");
let workflowsTreeView: vscode.TreeView<any> | undefined;

const conflictStore = new Map<string, string>();

type SwitchInstanceCommandArgs = {
    instanceId?: string;
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

export async function activate(context: vscode.ExtensionContext) {
    outputChannel.show(true);
    outputChannel.appendLine('🔌 Activation of "n8n-as-code"...');

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

    // ── Register Commands ──────────────────────────────────────────────────────
    // Commands are registered early so they are available during activation.
    // Handlers that need `cli` guard against it being undefined.

    context.subscriptions.push(
        vscode.commands.registerCommand('n8n.init', async () => {
            await handleInitializeCommand(context);
        }),

        vscode.commands.registerCommand('n8n.configure', async () => {
            ConfigurationWebview.createOrShow(context);
        }),

        vscode.commands.registerCommand('n8n.switchInstance', async (args?: SwitchInstanceCommandArgs) => {
            await switchWorkspaceInstance(context, args);
        }),

        vscode.commands.registerCommand('n8n.deleteInstance', async (args?: DeleteInstanceCommandArgs) => {
            await deleteWorkspaceInstance(context, args);
        }),

        vscode.commands.registerCommand('n8n.applySettings', async () => {
            outputChannel.appendLine('[n8n] Applying new settings...');
            await reinitializeSyncManager(context);
            updateContextKeys();
        }),

        vscode.commands.registerCommand('n8n.openBoard', async (arg: any) => {
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf) return;
            const { host } = getN8nConfig();
            if (host) {
                try {
                    const proxyUrl = await proxyService.start(host);
                    WorkflowWebview.createOrShow(wf, `${proxyUrl}/workflow/${wf.id}`, undefined);
                    registerClipboardHandler();
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Failed to start proxy: ${e.message}`);
                }
            } else {
                vscode.window.showErrorMessage('n8n Host not configured.');
            }
        }),

        vscode.commands.registerCommand('n8n.openJson', async (arg: any) => {
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf || !syncManager) return;
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

        vscode.commands.registerCommand('n8n.openSplit', async (arg: any) => {
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf || !syncManager) return;
            const { host } = getN8nConfig();
            const uri = getExistingWorkflowFileUri(wf);
            if (uri) {
                try {
                    const doc = await vscode.workspace.openTextDocument(uri);
                    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One });
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Could not open file: ${e.message}`);
                }
            }
            if (host) {
                try {
                    const proxyUrl = await proxyService.start(host);
                    WorkflowWebview.createOrShow(wf, `${proxyUrl}/workflow/${wf.id}`, vscode.ViewColumn.Two);
                    registerClipboardHandler();
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Failed to start proxy: ${e.message}`);
                }
            }
        }),

        // n8nac push <filename>
        vscode.commands.registerCommand('n8n.pushWorkflow', async (arg: any) => {
            if (enhancedTreeProvider.getExtensionState() === ExtensionState.SETTINGS_CHANGED) {
                vscode.window.showWarningMessage('n8n: Settings changed. Click "Apply Changes" to resume syncing.');
                return;
            }
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf || !cli || !syncManager) return;

            statusBar.showSyncing();
            try {
                const pushedId = await cli.push(wf.filename);
                const workflows = await cli.list();
                const updatedWorkflow = workflows.find(candidate => candidate.filename === wf.filename);
                const workflowId = updatedWorkflow?.id ?? pushedId ?? wf.id;

                if (workflowId) {
                    WorkflowWebview.reloadIfMatching(workflowId, outputChannel);
                }

                outputChannel.appendLine(`[n8n] Push successful: ${wf.name} (${workflowId ?? 'unknown id'})`);
                store.dispatch(setWorkflows(workflows));
                enhancedTreeProvider.refresh();
                statusBar.showSynced();
                vscode.window.showInformationMessage(`✅ Pushed "${wf.name}"`);
            } catch (e: any) {
                const isOcc = e.message?.includes('Push rejected') || e.message?.includes('modified in the n8n UI');
                if (isOcc) {
                    statusBar.showError('Conflict');
                    await vscode.commands.executeCommand('n8n.resolveConflict', { workflow: wf, choice: undefined });
                    const workflows = await cli.list();
                    store.dispatch(setWorkflows(workflows));
                    enhancedTreeProvider.refresh();
                    statusBar.showSynced();
                } else {
                    statusBar.showError(e.message);
                    vscode.window.showErrorMessage(`Push Error: ${e.message}`);
                }
            }
        }),

        // n8nac pull <id>
        vscode.commands.registerCommand('n8n.pullWorkflow', async (arg: any) => {
            if (enhancedTreeProvider.getExtensionState() === ExtensionState.SETTINGS_CHANGED) {
                vscode.window.showWarningMessage('n8n: Settings changed. Click "Apply Changes" to resume syncing.');
                return;
            }
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf || !cli || !syncManager || !wf.id) return;

            if (wf.filename) {
                const workflowStatus = await cli.getSingleWorkflowDetailedStatus(wf.id, wf.filename);
                
                const hasConflict = workflowStatus.status === WorkflowSyncStatus.CONFLICT;
                const hasLocalChanges = !!(workflowStatus.localHash && workflowStatus.lastSyncedHash && workflowStatus.localHash !== workflowStatus.lastSyncedHash);

                if (hasConflict || hasLocalChanges) {
                    statusBar.showError('Conflict');
                    await vscode.commands.executeCommand('n8n.resolveConflict', { workflow: wf, choice: undefined });
                    const workflows = await cli.list();
                    store.dispatch(setWorkflows(workflows));
                    enhancedTreeProvider.refresh();
                    statusBar.showSynced();
                    return; // Conflict resolution handles the pull/push
                }
            }

            statusBar.showSyncing();
            try {
                await cli.pull(wf.id);
                const workflows = await cli.list();
                store.dispatch(setWorkflows(workflows));
                enhancedTreeProvider.refresh();
                statusBar.showSynced();
                vscode.window.showInformationMessage(`✅ Pulled "${wf.name}"`);
            } catch (e: any) {
                statusBar.showError(e.message);
                vscode.window.showErrorMessage(`Pull Error: ${e.message}`);
            }
        }),

        // n8nac fetch <id>
        vscode.commands.registerCommand('n8n.fetchWorkflow', async (arg: any) => {
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
        vscode.commands.registerCommand('n8n.refresh', async () => {
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

        vscode.commands.registerCommand('n8n.findWorkflow', async () => {
            if (enhancedTreeProvider.getExtensionState() === ExtensionState.SETTINGS_CHANGED) {
                vscode.window.showWarningMessage('n8n: Settings changed. Click "Apply Changes" to resume syncing.');
                return;
            }

            let workflows = selectAllWorkflows(store.getState());
            if (!workflows.length && cli) {
                try {
                    workflows = await cli.list({ fetchRemote: true });
                    store.dispatch(setWorkflows(workflows));
                    enhancedTreeProvider.refresh();
                } catch (error: any) {
                    vscode.window.showErrorMessage(`Unable to load workflows: ${error.message}`);
                    return;
                }
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

        vscode.commands.registerCommand('n8n.initializeAI', async (options?: { silent?: boolean }) => {
            if (!vscode.workspace.workspaceFolders?.length) {
                if (!options?.silent) await showNoWorkspaceError();
                return;
            }
            if (!syncManager) {
                if (!options?.silent) vscode.window.showWarningMessage('n8n: Not initialized.');
                return;
            }
            const { host, apiKey } = getN8nConfig();
            if (!host || !apiKey) {
                if (!options?.silent) vscode.window.showErrorMessage('n8n: Host/API Key missing.');
                return;
            }
            const client = new N8nApiClient({ host, apiKey });
            const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const runInit = async (progress?: vscode.Progress<{ message?: string }>) => {
                try {
                    const health = await client.getHealth();
                    const version = health.version;
                    progress?.report({ message: 'Generating AGENTS.md...' });
                    const distTag = (typeof __N8NAC_VERSION__ !== 'undefined' && __N8NAC_VERSION__ === 'next') ? 'next' : undefined;
                    await new AiContextGenerator().generate(rootPath, version, distTag);
                    context.workspaceState.update('n8n.lastInitVersion', version);
                    enhancedTreeProvider.setAIContextInfo(version, false);
                    if (!options?.silent) vscode.window.showInformationMessage(`✨ n8n AI Context Initialized! (v${version})`);
                } catch (e: any) {
                    if (!options?.silent) vscode.window.showErrorMessage(`AI Init Failed: ${e.message}`);
                    else outputChannel.appendLine(`[n8n] Silent AI Init failed: ${e.message}`);
                }
            };
            if (options?.silent) {
                await runInit();
            } else {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'n8n: Initializing AI Context...',
                    cancellable: false
                }, runInit);
            }
        }),

        vscode.commands.registerCommand('n8n.openSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'n8n');
        }),

        vscode.commands.registerCommand('n8n.spacer', () => { /* spacing dummy */ }),

        vscode.commands.registerCommand('n8n.resolveConflict', async (arg: any) => {
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
                WorkflowWebview.reloadIfMatching(id, outputChannel);
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

    // ── Background initialization (fire-and-forget) ────────────────────────
    determineInitialState(context).then(() => {
        updateContextKeys();
    }).catch(err => {
        outputChannel.appendLine(`[n8n] Background initialization error: ${err?.message}`);
        updateContextKeys();
    });

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

    if (vscode.workspace.workspaceFolders?.length) {
        const configWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], 'n8nac-config.json'),
            false,
            false,
            false
        );

        const refreshFromConfigFile = async () => {
            outputChannel.appendLine('[n8n] Workspace config changed. Refreshing extension state...');
            await refreshStateFromWorkspaceConfig(context);
        };

        configWatcher.onDidCreate(refreshFromConfigFile);
        configWatcher.onDidChange(refreshFromConfigFile);
        configWatcher.onDidDelete(refreshFromConfigFile);
        context.subscriptions.push(configWatcher);
    }
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

function updateContextKeys() {
    const state = enhancedTreeProvider.getExtensionState();
    vscode.commands.executeCommand('setContext', 'n8n.state', state);
    vscode.commands.executeCommand('setContext', 'n8n.initialized', state === ExtensionState.INITIALIZED);
}

function disposeRuntimeDisposables(): void {
    for (const disposable of runtimeDisposables) {
        disposable.dispose();
    }
    runtimeDisposables = [];
}

function toInstanceQuickPickItem(
    instance: { id: string; name: string; host?: string; projectName?: string },
    activeInstanceId?: string
): InstanceQuickPickItem {
    return {
        label: instance.name,
        description: instance.host || 'Host not configured',
        detail: instance.projectName || (instance.id === activeInstanceId ? 'Currently active' : ''),
        picked: instance.id === activeInstanceId,
        instanceId: instance.id,
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
                title: 'Select the active n8n instance',
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

    const selectedInstance = configService.selectInstance(targetInstanceId);

    if (syncManager) {
        await reinitializeSyncManager(context);
    } else {
        await refreshStateFromWorkspaceConfig(context);
    }

    updateContextKeys();

    if (!args.silent) {
        vscode.window.showInformationMessage(`Active n8n instance: ${selectedInstance.name}`);
    }

    return selectedInstance.id;
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
            return;
        }

        if (result.activeInstance) {
            await reinitializeSyncManager(context);
        } else {
            await refreshStateFromWorkspaceConfig(context);
        }
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

function getConfigRefreshSignature(workspaceRoot?: string): string {
    if (!workspaceRoot) {
        return 'no-workspace';
    }

    const configPath = path.join(workspaceRoot, 'n8nac-config.json');
    if (!fs.existsSync(configPath)) {
        return 'missing-config';
    }

    const resolvedConfig = getResolvedN8nConfig(workspaceRoot);
    return JSON.stringify({
        activeInstanceId: resolvedConfig.activeInstanceId,
        host: resolvedConfig.host,
        hasApiKey: Boolean(resolvedConfig.apiKey),
        syncFolder: resolvedConfig.syncFolder,
        projectId: resolvedConfig.projectId,
        projectName: resolvedConfig.projectName,
    });
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

async function refreshStateFromWorkspaceConfig(context: vscode.ExtensionContext): Promise<void> {
    if (initializingPromise) {
        outputChannel.appendLine('[n8n] Ignoring config refresh while initialization is already in progress.');
        return;
    }

    const workspaceRoot = getWorkspaceRoot();
    const nextSignature = getConfigRefreshSignature(workspaceRoot);
    if (lastConfigRefreshSignature === nextSignature) {
        return;
    }
    lastConfigRefreshSignature = nextSignature;

    if (!workspaceRoot) {
        resetExtensionRuntimeState();
        enhancedTreeProvider.setExtensionState(ExtensionState.UNINITIALIZED);
        statusBar.hide();
        updateContextKeys();
        return;
    }

    const hasUnifiedConfig = fs.existsSync(path.join(workspaceRoot, 'n8nac-config.json'));
    if (!hasUnifiedConfig) {
        resetExtensionRuntimeState();
        enhancedTreeProvider.setExtensionState(ExtensionState.CONFIGURING);
        statusBar.showConfiguring();
        updateContextKeys();
        return;
    }

    await determineInitialState(context);
}

async function determineInitialState(context: vscode.ExtensionContext) {
    const configValidation = validateN8nConfig();
    const workspaceRoot = getWorkspaceRoot();
    lastConfigRefreshSignature = getConfigRefreshSignature(workspaceRoot);

    if (!workspaceRoot) {
        resetExtensionRuntimeState();
        enhancedTreeProvider.setExtensionState(ExtensionState.UNINITIALIZED);
        statusBar.hide();
        updateContextKeys();
        return;
    }

    const hasUnifiedConfig = fs.existsSync(path.join(workspaceRoot, 'n8nac-config.json'));
    if (!hasUnifiedConfig) {
        resetExtensionRuntimeState();
        enhancedTreeProvider.setExtensionState(ExtensionState.CONFIGURING);
        statusBar.showConfiguring();
        updateContextKeys();
        return;
    }

    const previouslyInitialized = isFolderPreviouslyInitialized(workspaceRoot);

    if (previouslyInitialized && configValidation.isValid) {
        outputChannel.appendLine('[n8n] Previously initialized folder detected. Auto-loading...');
        enhancedTreeProvider.setExtensionState(ExtensionState.INITIALIZING);
        updateContextKeys();
        statusBar.showLoading();
        try {
            initializingPromise = initializeSyncManager(context);
            await initializingPromise;
            enhancedTreeProvider.setExtensionState(ExtensionState.INITIALIZED);
            statusBar.showSynced();
        } catch (error: any) {
            outputChannel.appendLine(`[n8n] Auto-load failed: ${error.message}`);
            enhancedTreeProvider.setExtensionState(ExtensionState.ERROR, error.message);
            statusBar.showError(error.message);
        } finally {
            initializingPromise = undefined;
        }
    } else if (!configValidation.isValid) {
        enhancedTreeProvider.setExtensionState(ExtensionState.CONFIGURING);
        statusBar.showConfiguring();
    } else {
        enhancedTreeProvider.setExtensionState(ExtensionState.UNINITIALIZED);
        statusBar.showNotInitialized();
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
        ConfigurationWebview.createOrShow(context);
        return;
    }

    enhancedTreeProvider.setExtensionState(ExtensionState.INITIALIZING);
    updateContextKeys();
    statusBar.showLoading();

    try {
        initializingPromise = initializeSyncManager(context);
        await initializingPromise;
        enhancedTreeProvider.setExtensionState(ExtensionState.INITIALIZED);
        updateContextKeys();
        statusBar.showSynced();
        outputChannel.appendLine('[n8n] Auto-initializing AI context...');
        await vscode.commands.executeCommand('n8n.initializeAI', { silent: true });
        vscode.window.showInformationMessage('✅ n8n as code initialized successfully!');
    } catch (error: any) {
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

async function initializeSyncManager(context: vscode.ExtensionContext) {
    if (syncManager) {
        syncManager.removeAllListeners();
    }
    disposeRuntimeDisposables();

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceRoot) throw new Error(NO_WORKSPACE_ERROR_MESSAGE);

    const resolvedConfig = getResolvedN8nConfig(workspaceRoot);
    const { host, apiKey } = resolvedConfig;
    const folder = resolvedConfig.syncFolder || 'workflows';
    let projectId = resolvedConfig.projectId || undefined;
    let projectName = resolvedConfig.projectName || undefined;
    const activeInstanceId = resolvedConfig.activeInstanceId || undefined;
    const activeInstanceName = resolvedConfig.activeInstanceName || undefined;

    if (!host || !apiKey) throw new Error('Host/API Key missing. Please configure n8n.');

    const credentials: IN8nCredentials = { host, apiKey };
    const client = new N8nApiClient(credentials);

    if (!projectId || !projectName) {
        const projects = await client.getProjects();
        if (!projects.length) throw new Error('No projects found. Cannot initialize sync.');

        let selectedProject = projects.find((p: any) => p.type === 'personal');
        if (!selectedProject && projects.length === 1) selectedProject = projects[0];

        if (!selectedProject) {
            const picked = await vscode.window.showQuickPick(
                projects.map((p: any) => ({
                    label: p.type === 'personal' ? 'Personal' : p.name,
                    description: p.type,
                    detail: p.id,
                    project: p
                })),
                { title: 'Select the n8n project to sync', ignoreFocusOut: true }
            );
            if (!picked) throw new Error('Project selection cancelled.');
            selectedProject = (picked as any).project;
        }

        if (!selectedProject) throw new Error('No project selected.');
        projectId = selectedProject.id;
        projectName = selectedProject.type === 'personal' ? 'Personal' : selectedProject.name;
        outputChannel.appendLine(`[n8n] Selected project: ${projectName} (${projectId})`);
    }

    const absDirectory = path.join(workspaceRoot, folder);

    let instanceIdentifier: string;
    try {
        const resolution = await resolveInstanceIdentifier(credentials, {
            client,
            throwOnConnectionError: true
        });
        instanceIdentifier = resolution.identifier;
        outputChannel.appendLine(
            resolution.usedFallback
                ? `[n8n] Instance identifier (fallback): ${instanceIdentifier}`
                : `[n8n] Instance identifier: ${instanceIdentifier}`
        );
    } catch (error: any) {
        throw new Error(`Cannot connect to n8n instance at "${host}". Please check if n8n is running.`);
    }

    await writeUnifiedWorkspaceConfig({
        workspaceRoot,
        host,
        apiKey,
        syncFolder: folder,
        projectId: projectId!,
        projectName: projectName!,
        instanceIdentifier,
        instanceId: activeInstanceId,
        instanceName: activeInstanceName,
        setActive: true,
    });
    lastConfigRefreshSignature = getConfigRefreshSignature(workspaceRoot);

    // Create SyncManager (the stateful engine: WorkflowStateTracker, events, etc.)
    syncManager = new SyncManager(client, {
        directory: absDirectory,
        syncInactive: true,
        ignoredTags: [],
        instanceIdentifier,
        instanceConfigPath: path.join(workspaceRoot, 'n8nac-config.json'),
        projectId: projectId!,
        projectName: projectName!
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
        WorkflowWebview.reloadIfMatching(data.workflowId, outputChannel);
    });

    // ── Lightweight UI watchers ──────────────────────────────────────────────
    //
    // 1. VS Code native FS watcher on *.workflow.ts: detects new/deleted files → refreshes list.
    //    Change events are deliberately ignored — local modifications are detected via hash
    //    comparison in getSingleWorkflowDetailedStatus() only when an operation requires it.
    // 2. State file watcher on .n8n-state.json: written by CLI after every push/pull/resolve →
    //    refreshes list and reloads the open webview (handles agent-driven CLI operations).
    // 3. Remote polling every 60s: discovers workflows created/deleted on the n8n instance.
    if (vscode.workspace.workspaceFolders?.length) {
        const pattern = new vscode.RelativePattern(
            vscode.workspace.workspaceFolders[0],
            `${folder}/**/*.workflow.ts`
        );
        const fileWatcher = vscode.workspace.createFileSystemWatcher(pattern, false, true, false);
        const reloadList = async () => {
            if (!cli) return;
            try {
                store.dispatch(setWorkflows(await cli.list()));
                enhancedTreeProvider.refresh();
            } catch (err) {
                console.error('[n8n] FS watcher: failed to refresh list', err);
            }
        };
        fileWatcher.onDidCreate(reloadList);
        fileWatcher.onDidDelete(reloadList);
        runtimeDisposables.push(fileWatcher);
    }

    // 3. State file watcher: .n8n-state.json is written by the CLI after every push/pull/resolve.
    //    Watching it lets the UI react to CLI operations (agent-driven workflow).
    //    IMPORTANT: cli.list() here has NO fetchRemote option → purely local (readdirSync +
    //    in-memory remoteIds populated at init). No network call on every state change.
    //    The webview is only reloaded when the workflow it is currently displaying is the one
    //    whose lastSyncedAt changed — unrelated operations do not trigger a reload.
    if (vscode.workspace.workspaceFolders?.length) {
        const statePattern = new vscode.RelativePattern(
            vscode.workspace.workspaceFolders[0],
            `${folder}/**/.n8n-state.json`
        );
        // ignoreCreate=true, ignoreChange=false, ignoreDelete=true — only react to writes
        const stateWatcher = vscode.workspace.createFileSystemWatcher(statePattern, true, false, true);
        // Snapshot of workflowId → lastSyncedAt: used to detect which workflow was actually touched.
        const stateSnapshot = new Map<string, string>();
        stateWatcher.onDidChange(async (changedUri) => {
            if (!cli) return;
            try {
                store.dispatch(setWorkflows(await cli.list()));
                enhancedTreeProvider.refresh();
                // Only reload the webview if the currently displayed workflow was affected.
                // Read the state file to find which workflow IDs changed since last write.
                const raw = await vscode.workspace.fs.readFile(changedUri);
                const state = JSON.parse(Buffer.from(raw).toString('utf8')) as {
                    workflows: Record<string, { lastSyncedAt?: string }>;
                };
                for (const [id, entry] of Object.entries(state.workflows ?? {})) {
                    if (entry.lastSyncedAt && entry.lastSyncedAt !== stateSnapshot.get(id)) {
                        stateSnapshot.set(id, entry.lastSyncedAt);
                        WorkflowWebview.reloadIfMatching(id, outputChannel);
                    }
                }
            } catch (err) {
                console.error('[n8n] State watcher: failed to refresh after CLI operation', err);
            }
        });
        runtimeDisposables.push(stateWatcher);
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
        outputChannel.appendLine(`[n8n] Failed to load workflows: ${error.message}`);
    }

    // AI context check
    const missingAny = !fs.existsSync(path.join(workspaceRoot, 'AGENTS.md'));
    const lastVersion = context.workspaceState.get<string>('n8n.lastInitVersion');
    let currentVersion: string | undefined;
    try { currentVersion = (await client.getHealth()).version; } catch { }

    const needsUpdate = missingAny || (currentVersion && lastVersion && currentVersion !== lastVersion);
    enhancedTreeProvider.setAIContextInfo(currentVersion, !!needsUpdate);

    if (needsUpdate && missingAny && !lastVersion) {
        try {
            await vscode.commands.executeCommand('n8n.initializeAI', { silent: true });
            enhancedTreeProvider.setAIContextInfo(
                context.workspaceState.get<string>('n8n.lastInitVersion') || currentVersion,
                false
            );
        } catch (error: any) {
            outputChannel.appendLine(`[n8n] Failed to auto-generate AI context: ${error.message}`);
        }
    }
}

async function reinitializeSyncManager(context: vscode.ExtensionContext) {
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
        vscode.window.showInformationMessage('✅ n8n settings updated successfully.');
    } catch (error: any) {
        outputChannel.appendLine(`[n8n] Failed to reinitialize: ${error.message}`);
        enhancedTreeProvider.setExtensionState(ExtensionState.ERROR, error.message);
        updateContextKeys();
        vscode.window.showErrorMessage(`Failed to update settings: ${error.message}`);
    } finally {
        initializingPromise = undefined;
    }
}

export function deactivate() {
    disposeRuntimeDisposables();
    proxyService.stop();
}
