import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Injected at build time by esbuild (see esbuild.config.js)
declare const __N8NAC_VERSION__: string;
import {
    SyncManager, CliApi, N8nApiClient, IN8nCredentials, WorkflowSyncStatus,
    createInstanceIdentifier, createFallbackInstanceIdentifier
} from 'n8nac';
import { AiContextGenerator, SnippetGenerator } from '@n8n-as-code/skills';

import { StatusBar } from './ui/status-bar.js';
import { EnhancedWorkflowTreeProvider } from './ui/enhanced-workflow-tree-provider.js';
import { WorkflowWebview } from './ui/workflow-webview.js';
import { ConfigurationWebview } from './ui/configuration-webview.js';
import { WorkflowDecorationProvider } from './ui/workflow-decoration-provider.js';
import { ProxyService } from './services/proxy-service.js';
import { ExtensionState } from './types.js';
import { validateN8nConfig, getWorkspaceRoot, isFolderPreviouslyInitialized } from './utils/state-detection.js';

import {
    store,
    setSyncManager,
    setWorkflows,
    addConflict,
    removeConflict
} from './services/workflow-store.js';

// ------- Module-level singletons -------
let syncManager: SyncManager | undefined;
/** CliApi wraps SyncManager and exposes the same four commands as the CLI binary:
 *  list, fetch, pull, push. This is the only object the command handlers touch. */
let cli: CliApi | undefined;
let initializingPromise: Promise<void> | undefined;

const statusBar = new StatusBar();
const proxyService = new ProxyService();
const enhancedTreeProvider = new EnhancedWorkflowTreeProvider();
const decorationProvider = new WorkflowDecorationProvider();
const outputChannel = vscode.window.createOutputChannel("n8n-as-code");

const conflictStore = new Map<string, string>();

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

    vscode.window.registerTreeDataProvider('n8n-explorer.workflows', enhancedTreeProvider);

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
                    WorkflowWebview.createOrShow(wf, `${proxyUrl}/workflow/${wf.id}`);
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
            if (wf.filename) {
                const uri = vscode.Uri.file(path.join(syncManager.getInstanceDirectory(), wf.filename));
                try {
                    const doc = await vscode.workspace.openTextDocument(uri);
                    await vscode.window.showTextDocument(doc);
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Could not open file: ${e.message}`);
                }
            }
        }),

        vscode.commands.registerCommand('n8n.openSplit', async (arg: any) => {
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf || !syncManager) return;
            const { host } = getN8nConfig();
            if (wf.filename) {
                const uri = vscode.Uri.file(path.join(syncManager.getInstanceDirectory(), wf.filename));
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
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Failed to start proxy: ${e.message}`);
                }
            }
        }),

        // n8nac push <id>
        vscode.commands.registerCommand('n8n.pushWorkflow', async (arg: any) => {
            if (enhancedTreeProvider.getExtensionState() === ExtensionState.SETTINGS_CHANGED) {
                vscode.window.showWarningMessage('n8n: Settings changed. Click "Apply Changes" to resume syncing.');
                return;
            }
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf || !cli || !syncManager) return;

            statusBar.showSyncing();
            try {
                // Pass wf.filename so SyncManager can handle both new (no-ID) and existing workflows.
                // IDs are the canonical identifier — names are NOT unique in n8n.
                await cli.push(wf.id, wf.filename);
                if (wf.id) WorkflowWebview.reloadIfMatching(wf.id, outputChannel);
                outputChannel.appendLine(`[n8n] Push successful: ${wf.name} (${wf.id})`);
                const workflows = await cli.list();
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
                
                const hasLocalChanges =
                    workflowStatus.status === WorkflowSyncStatus.CONFLICT;

                if (hasLocalChanges) {
                    statusBar.showError('Conflict');
                    await vscode.commands.executeCommand('n8n.resolveConflict', { workflow: wf, choice: undefined });
                    const workflows = await cli.list();
                    store.dispatch(setWorkflows(workflows));
                    enhancedTreeProvider.refresh();
                    statusBar.showSynced();
                    return; // Early return as conflict resolution handles the pull/push
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

        vscode.commands.registerCommand('n8n.initializeAI', async (options?: { silent?: boolean }) => {
            if (!vscode.workspace.workspaceFolders?.length) {
                if (!options?.silent) vscode.window.showErrorMessage('No workspace open.');
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
                    const distTag = (typeof __N8NAC_VERSION__ !== 'undefined' && __N8NAC_VERSION__?.includes('-')) ? __N8NAC_VERSION__ : undefined;
                    await new AiContextGenerator().generate(rootPath, version, distTag);
                    progress?.report({ message: 'Generating Snippets...' });
                    await new SnippetGenerator().generate(rootPath);
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
                    syncManager.stopWatch();
                    enhancedTreeProvider.setExtensionState(ExtensionState.SETTINGS_CHANGED);
                    statusBar.showSettingsChanged();
                } else {
                    const valid = validateN8nConfig().isValid;
                    const root = getWorkspaceRoot();
                    const wasInit = root ? isFolderPreviouslyInitialized(root) : false;
                    if (valid && wasInit) {
                        enhancedTreeProvider.setExtensionState(ExtensionState.UNINITIALIZED);
                        statusBar.showNotInitialized();
                    } else if (!valid) {
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

function updateContextKeys() {
    const state = enhancedTreeProvider.getExtensionState();
    vscode.commands.executeCommand('setContext', 'n8n.state', state);
    vscode.commands.executeCommand('setContext', 'n8n.initialized', state === ExtensionState.INITIALIZED);
}

async function determineInitialState(context: vscode.ExtensionContext) {
    const configValidation = validateN8nConfig();
    const workspaceRoot = getWorkspaceRoot();

    if (!workspaceRoot) {
        enhancedTreeProvider.setExtensionState(ExtensionState.UNINITIALIZED);
        statusBar.hide();
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
        await initializeSyncManager(context);
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
    }
}

function getN8nConfig(): { host: string; apiKey: string } {
    const config = vscode.workspace.getConfiguration('n8n');
    let host = config.get<string>('host') || process.env.N8N_HOST || '';
    const apiKey = config.get<string>('apiKey') || process.env.N8N_API_KEY || '';
    if (host.endsWith('/')) host = host.slice(0, -1);
    return { host, apiKey };
}

async function initializeSyncManager(context: vscode.ExtensionContext) {
    if (syncManager) {
        syncManager.stopWatch();
        syncManager.removeAllListeners();
    }

    const { host, apiKey } = getN8nConfig();
    const config = vscode.workspace.getConfiguration('n8n');
    const folder = config.get<string>('syncFolder') || 'workflows';
    let projectId = config.get<string>('projectId');
    let projectName = config.get<string>('projectName');

    if (!host || !apiKey) throw new Error('Host/API Key missing. Please check Settings.');

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
        await config.update('projectId', projectId, vscode.ConfigurationTarget.Workspace);
        await config.update('projectName', projectName, vscode.ConfigurationTarget.Workspace);
        outputChannel.appendLine(`[n8n] Selected project: ${projectName} (${projectId})`);
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceRoot) throw new Error('No workspace open');

    const absDirectory = path.join(workspaceRoot, folder);

    let instanceIdentifier: string;
    try {
        const user = await client.getCurrentUser();
        if (user) {
            instanceIdentifier = createInstanceIdentifier(host, user);
            outputChannel.appendLine(`[n8n] Instance identifier: ${instanceIdentifier}`);
        } else {
            instanceIdentifier = createFallbackInstanceIdentifier(host, apiKey);
        }
    } catch (error: any) {
        const isConnectionError = !error.response ||
            error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT';
        if (isConnectionError) {
            throw new Error(`Cannot connect to n8n instance at "${host}". Please check if n8n is running.`);
        }
        instanceIdentifier = createFallbackInstanceIdentifier(host, apiKey);
        outputChannel.appendLine(`[n8n] Instance identifier (fallback): ${instanceIdentifier}`);
    }

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
        syncManager!.stopWatch();
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

    // ── Lightweight UI watchers (replaces the heavy chokidar-based WorkflowStateTracker watcher) ──
    //
    // 1. VS Code native FS watcher: detects new/deleted .workflow.ts files and refreshes the list.
    //    We deliberately ignore 'change' events — 'modified locally' is no longer a tracked status.
    // 2. Remote polling every 60s: discovers workflows created/deleted on the n8n instance.
    if (vscode.workspace.workspaceFolders?.length) {
        const syncFolder = config.get<string>('syncFolder') || 'workflows';
        const pattern = new vscode.RelativePattern(
            vscode.workspace.workspaceFolders[0],
            `${syncFolder}/**/*.workflow.ts`
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
        context.subscriptions.push(fileWatcher);
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
    context.subscriptions.push({ dispose: () => clearInterval(pollingInterval) });

    statusBar.setWatchMode(false);
    // NOTE: syncManager.startWatch() is intentionally NOT called.
    // The heavy chokidar-based watcher is replaced by the two lightweight UI watchers above.

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
    const aiFiles = [
        path.join(workspaceRoot, 'AGENTS.md'),
        path.join(workspaceRoot, '.vscode', 'n8n.code-snippets')
    ];
    const missingAny = aiFiles.some(f => !fs.existsSync(f));
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
    outputChannel.appendLine('[n8n] Reinitializing with new settings...');
    try {
        syncManager.stopWatch();
        syncManager.removeAllListeners();
        await initializeSyncManager(context);
        enhancedTreeProvider.setExtensionState(ExtensionState.INITIALIZED);
        updateContextKeys();
        enhancedTreeProvider.refresh();
        vscode.window.showInformationMessage('✅ n8n settings updated successfully.');
    } catch (error: any) {
        outputChannel.appendLine(`[n8n] Failed to reinitialize: ${error.message}`);
        enhancedTreeProvider.setExtensionState(ExtensionState.ERROR, error.message);
        updateContextKeys();
        vscode.window.showErrorMessage(`Failed to update settings: ${error.message}`);
    }
}

export function deactivate() {
    proxyService.stop();
}
