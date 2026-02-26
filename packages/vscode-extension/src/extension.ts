import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SyncManager, N8nApiClient, IN8nCredentials, WorkflowSyncStatus, createInstanceIdentifier, createFallbackInstanceIdentifier } from '@n8n-as-code/cli';
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
    removeWorkflow,
    addConflict,
    removeConflict
} from './services/workflow-store.js';

let syncManager: SyncManager | undefined;
let initializingPromise: Promise<void> | undefined;
const statusBar = new StatusBar();
const proxyService = new ProxyService();
const enhancedTreeProvider = new EnhancedWorkflowTreeProvider();
const decorationProvider = new WorkflowDecorationProvider();
const outputChannel = vscode.window.createOutputChannel("n8n-as-code");

const conflictStore = new Map<string, string>();

export async function activate(context: vscode.ExtensionContext) {
    outputChannel.show(true);
    outputChannel.appendLine('🔌 Activation of "n8n-as-code" (new initialization flow)...');

    // Register Remote Content Provider for Diffs
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('n8n-remote', {
            provideTextDocumentContent(uri: vscode.Uri): string {
                return conflictStore.get(uri.toString()) || '';
            }
        })
    );

    // Register Enhanced Tree View early
    vscode.window.registerTreeDataProvider('n8n-explorer.workflows', enhancedTreeProvider);

    // Register File Decoration Provider for visual colorization
    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(decorationProvider)
    );

    // Pass output channel to proxy service
    proxyService.setOutputChannel(outputChannel);
    proxyService.setSecrets(context.secrets);

    // 1. Register Commands (must happen before any async work so commands are always available)
    // Note: determineInitialState is called below and may hang on network I/O; registering
    // commands first ensures e.g. "Configure" works even while the extension is still activating.
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
                    const targetUrl = `${proxyUrl}/workflow/${wf.id}`;
                    outputChannel.appendLine(`[n8n] Opening board: ${wf.name} (${wf.id})`);
                    WorkflowWebview.createOrShow(wf, targetUrl);
                } catch (e: any) {
                    outputChannel.appendLine(`[n8n] ERROR: Failed to start proxy: ${e.message}`);
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
                const instanceDirectory = syncManager.getInstanceDirectory();
                const uri = vscode.Uri.file(path.join(instanceDirectory, wf.filename));
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
                const instanceDirectory = syncManager.getInstanceDirectory();
                const uri = vscode.Uri.file(path.join(instanceDirectory, wf.filename));
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
                    const targetUrl = `${proxyUrl}/workflow/${wf.id}`;
                    WorkflowWebview.createOrShow(wf, targetUrl, vscode.ViewColumn.Two);
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Failed to start proxy: ${e.message}`);
                }
            }
        }),

        vscode.commands.registerCommand('n8n.pushWorkflow', async (arg: any) => {
            if (enhancedTreeProvider.getExtensionState() === ExtensionState.SETTINGS_CHANGED) {
                vscode.window.showWarningMessage('n8n: Settings changed. Click "Apply Changes" to resume syncing.');
                return;
            }
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf || !syncManager || !wf.filename) return;

            statusBar.showSyncing();
            try {
                await syncManager.pushOne(wf.id, wf.filename);
                if (wf.id) { WorkflowWebview.reloadIfMatching(wf.id, outputChannel); }
                outputChannel.appendLine(`[n8n] Push successful for: ${wf.name} (${wf.id})`);
                const workflows = await syncManager.getWorkflowsStatus();
                store.dispatch(setWorkflows(workflows));
                enhancedTreeProvider.refresh();
                statusBar.showSynced();
                vscode.window.showInformationMessage(`✅ Pushed "${wf.name}"`);
            } catch (e: any) {
                const isOcc = e.message?.includes('Push rejected') || e.message?.includes('modified in the n8n UI');
                if (isOcc) {
                    // Remote was changed since last sync — offer conflict resolution
                    statusBar.showError('Conflict');
                    await vscode.commands.executeCommand('n8n.resolveConflict', { workflow: wf, choice: undefined });
                    const workflows = await syncManager.getWorkflowsStatus();
                    store.dispatch(setWorkflows(workflows));
                    enhancedTreeProvider.refresh();
                    statusBar.showSynced();
                } else {
                    statusBar.showError(e.message);
                    vscode.window.showErrorMessage(`Push Error: ${e.message}`);
                }
            }
        }),
        vscode.commands.registerCommand('n8n.pullWorkflow', async (arg: any) => {
            if (enhancedTreeProvider.getExtensionState() === ExtensionState.SETTINGS_CHANGED) {
                vscode.window.showWarningMessage('n8n: Settings changed. Click "Apply Changes" to resume syncing.');
                return;
            }
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf || !syncManager || !wf.id) return;

            // Warn if the workflow has local modifications that will be discarded
            const currentStatuses = await syncManager.getWorkflowsStatus();
            const currentStatus = currentStatuses.find(s => s.id === wf.id);
            const hasLocalChanges = currentStatus?.status === WorkflowSyncStatus.MODIFIED_LOCALLY ||
                                    currentStatus?.status === WorkflowSyncStatus.CONFLICT;
            if (hasLocalChanges) {
                const confirm = await vscode.window.showWarningMessage(
                    `"${wf.name}" has local changes. Pulling will overwrite them with the remote version.`,
                    { modal: true },
                    'Pull (discard local changes)'
                );
                if (confirm !== 'Pull (discard local changes)') {
                    statusBar.showSynced();
                    return;
                }
            }

            statusBar.showSyncing();
            try {
                await syncManager.pullOne(wf.id);
                const workflows = await syncManager.getWorkflowsStatus();
                store.dispatch(setWorkflows(workflows));
                enhancedTreeProvider.refresh();
                statusBar.showSynced();
                vscode.window.showInformationMessage(`✅ Pulled "${wf.name}"`);
            } catch (e: any) {
                statusBar.showError(e.message);
                vscode.window.showErrorMessage(`Pull Error: ${e.message}`);
            }
        }),

        vscode.commands.registerCommand('n8n.fetchWorkflow', async (arg: any) => {
            if (enhancedTreeProvider.getExtensionState() === ExtensionState.SETTINGS_CHANGED) {
                vscode.window.showWarningMessage('n8n: Settings changed. Click "Apply Changes" to resume syncing.');
                return;
            }
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf || !syncManager || !wf.id) return;

            statusBar.showSyncing();
            try {
                // Fetch the latest remote state for this workflow
                const { host, apiKey } = getN8nConfig();
                const client = new N8nApiClient({ host, apiKey });
                const remoteWf = await client.getWorkflow(wf.id);
                
                if (remoteWf) {
                    // Update watcher's remote state cache
                    await syncManager.forceRefresh(); // This will refresh remote state
                    outputChannel.appendLine(`[n8n] Fetched remote state for: ${wf.name} (${wf.id})`);
                    
                    // Refresh workflows status to show updated state
                    const workflows = await syncManager.getWorkflowsStatus();
                    store.dispatch(setWorkflows(workflows));
                    enhancedTreeProvider.refresh();
                    statusBar.showSynced();
                    vscode.window.showInformationMessage(`✅ Fetched "${wf.name}"`);
                }
            } catch (e: any) {
                statusBar.showError(e.message);
                vscode.window.showErrorMessage(`Fetch Error: ${e.message}`);
            }
        }),

        vscode.commands.registerCommand('n8n.refresh', () => {
            outputChannel.appendLine('[n8n] Manual refresh command triggered.');
            enhancedTreeProvider.refresh();
        }),

        vscode.commands.registerCommand('n8n.initializeAI', async (options?: { silent?: boolean }) => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                if (!options?.silent) vscode.window.showErrorMessage('No workspace open.');
                return;
            }

            if (!syncManager) {
                if (!options?.silent) vscode.window.showWarningMessage('n8n: Not initialized. Please click "Init N8N as code" first.');
                return;
            }

            const { host, apiKey } = getN8nConfig();

            if (!host || !apiKey) {
                if (!options?.silent) vscode.window.showErrorMessage('n8n: Host/API Key missing. Cannot initialize AI context.');
                return;
            }

            const client = new N8nApiClient({ host, apiKey });
            const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

            const runInit = async (progress?: vscode.Progress<{ message?: string; increment?: number }>) => {
                try {
                    const health = await client.getHealth();
                    const version = health.version;

                    progress?.report({ message: "Generating AGENTS.md..." });
                    const contextGen = new AiContextGenerator();
                    await contextGen.generate(rootPath, version, context.extensionPath);

                    progress?.report({ message: "Generating Snippets..." });
                    const snippetGen = new SnippetGenerator();
                    await snippetGen.generate(rootPath);

                    context.workspaceState.update('n8n.lastInitVersion', version);
                    enhancedTreeProvider.setAIContextInfo(version, false);

                    if (!options?.silent) {
                        vscode.window.showInformationMessage(`✨ n8n AI Context Initialized! (v${version})`);
                    }
                } catch (e: any) {
                    if (!options?.silent) {
                        vscode.window.showErrorMessage(`AI Init Failed: ${e.message}`);
                    } else {
                        outputChannel.appendLine(`[n8n] Silent AI Init failed: ${e.message}`);
                    }
                }
            };

            if (options?.silent) {
                await runInit();
            } else {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "n8n: Initializing AI Context...",
                    cancellable: false
                }, runInit);
            }
        }),

        vscode.commands.registerCommand('n8n.openSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'n8n');
        }),

        vscode.commands.registerCommand('n8n.deleteWorkflow', async (arg: any) => {
            if (enhancedTreeProvider.getExtensionState() === ExtensionState.SETTINGS_CHANGED) {
                vscode.window.showWarningMessage('n8n: Settings changed. Click “Apply Changes” to resume syncing.');
                return;
            }
            outputChannel.appendLine(`[n8n] deleteWorkflow command called.`);
            const wf = arg?.workflow ? arg.workflow : arg;

            if (!syncManager || !wf || !wf.filename) return;

            try {
                const instanceDirectory = syncManager.getInstanceDirectory();
                const absPath = path.join(instanceDirectory, wf.filename);

                if (fs.existsSync(absPath)) {
                    await fs.promises.unlink(absPath);
                    outputChannel.appendLine(`[n8n] Deleted local file: ${wf.filename}`);
                }
            } catch (e: any) {
                outputChannel.appendLine(`[n8n] Delete Error: ${e.message}`);
                vscode.window.showErrorMessage(`Delete Error: ${e.message}`);
            }
        }),

        vscode.commands.registerCommand('n8n.spacer', () => {
            // Dummy command for spacing
        }),

        vscode.commands.registerCommand('n8n.resolveConflict', async (arg: any) => {
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf || !syncManager) return;

            // Try to get conflict data from store first
            let conflict = enhancedTreeProvider.getConflict(wf.id);

            // If not in store, fetch remote content to create conflict data
            if (!conflict && wf.filename) {
                try {
                    outputChannel.appendLine(`[n8n] Fetching remote content for conflict resolution: ${wf.id}`);
                    const client = new N8nApiClient(getN8nConfig());
                    const remoteWorkflow = await client.getWorkflow(wf.id);
                    conflict = {
                        id: wf.id,
                        filename: wf.filename,
                        remoteContent: remoteWorkflow
                    };
                    store.dispatch(addConflict(conflict));
                } catch (e: any) {
                    outputChannel.appendLine(`[n8n] Failed to fetch remote content: ${e.message}`);
                    vscode.window.showErrorMessage(`Failed to fetch remote workflow: ${e.message}`);
                    return;
                }
            }

            if (!conflict) {
                vscode.window.showInformationMessage('No conflict data found for this workflow.');
                return;
            }

            const { id, filename, remoteContent } = conflict;

            // Allow pre-selecting a choice (e.g. from action item buttons), or prompt the user
            let choice = arg?.choice;

            if (!choice) {
                choice = await vscode.window.showWarningMessage(
                    `⚠️ Conflict on "${filename}": both local and remote versions changed.`,
                    'Show Diff',
                    'Keep Current (local)',
                    'Keep Incoming (remote)',
                    'Mark as Resolved'
                );
            }

            if (choice === 'Show Diff') {
                const remoteUri = vscode.Uri.parse(`n8n-remote:${filename}?id=${id}`);
                const localUri = vscode.Uri.file(path.join(syncManager.getInstanceDirectory(), filename));
                conflictStore.set(remoteUri.toString(), JSON.stringify(remoteContent, null, 2));
                await vscode.commands.executeCommand('vscode.diff', localUri, remoteUri, `${filename} ← n8n Remote (read-only)`);
                // Don't resolve yet — user may still want to pick Keep Current/Keep Incoming/Mark as Resolved
            } else if (choice === 'Keep Current (local)') {
                await syncManager.resolveConflict(id, filename, 'local');
                await new Promise(resolve => setTimeout(resolve, 500));
                const workflows = await syncManager.getWorkflowsStatus();
                store.dispatch(setWorkflows(workflows));
                store.dispatch(removeConflict(id));
                WorkflowWebview.reloadIfMatching(id, outputChannel);
                vscode.window.showInformationMessage(`✅ Pushed — remote overwritten with your local version.`);
                enhancedTreeProvider.refresh();
            } else if (choice === 'Keep Incoming (remote)') {
                await syncManager.resolveConflict(id, filename, 'remote');
                await new Promise(resolve => setTimeout(resolve, 500));
                const workflows = await syncManager.getWorkflowsStatus();
                store.dispatch(setWorkflows(workflows));
                store.dispatch(removeConflict(id));
                vscode.window.showInformationMessage(`✅ Pulled — local file updated from n8n.`);
                enhancedTreeProvider.refresh();
            } else if (choice === 'Mark as Resolved') {
                // User merged manually in the editor — force-push the current local file
                await syncManager.resolveConflict(id, filename, 'local');
                await new Promise(resolve => setTimeout(resolve, 500));
                const workflows = await syncManager.getWorkflowsStatus();
                store.dispatch(setWorkflows(workflows));
                store.dispatch(removeConflict(id));
                WorkflowWebview.reloadIfMatching(id, outputChannel);
                vscode.window.showInformationMessage(`✅ Resolved — merged local version pushed to n8n.`);
                enhancedTreeProvider.refresh();
            }
        }),

    );

    // 2. Determine initial state – fire-and-forget so activate() returns immediately.
    // determineInitialState may perform network I/O (connecting to the n8n instance) which
    // would otherwise keep the extension stuck in "activating..." indefinitely. Commands are
    // already registered above so they work regardless of how long initialization takes.
    determineInitialState(context).then(() => {
        updateContextKeys();
    }).catch((err) => {
        outputChannel.appendLine(`[n8n] Background initialization error: ${err?.message}`);
        updateContextKeys();
    });

    // 3. Listen for Config Changes (but don't auto-initialize)
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            // If the configuration webview triggers a save+apply, suppress the transient
            // SETTINGS_CHANGED state to avoid flicker and duplicate "Apply" moments.
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
                // Critical settings changed: host, API key, folder, or project.
                // Pause watch/sync until the user explicitly applies settings.
                outputChannel.appendLine('[n8n] Critical settings changed (host/apiKey/folder/project). Pausing sync until applied.');

                if (syncManager) {
                    // Actually pause background activity.
                    syncManager.stopWatch();
                    enhancedTreeProvider.setExtensionState(ExtensionState.SETTINGS_CHANGED);
                    statusBar.showSettingsChanged();
                } else {
                    const configValidation = validateN8nConfig();
                    const workspaceRoot = getWorkspaceRoot();
                    const previouslyInitialized = workspaceRoot ? isFolderPreviouslyInitialized(workspaceRoot) : false;

                    if (configValidation.isValid && previouslyInitialized) {
                        enhancedTreeProvider.setExtensionState(ExtensionState.UNINITIALIZED);
                        statusBar.showNotInitialized();
                    } else if (!configValidation.isValid) {
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

/**
 * Update VS Code context keys for use in package.json 'when' clauses
 */
function updateContextKeys() {
    const state = enhancedTreeProvider.getExtensionState();
    vscode.commands.executeCommand('setContext', 'n8n.state', state);
    vscode.commands.executeCommand('setContext', 'n8n.initialized', state === ExtensionState.INITIALIZED);
}

/**
 * Determine initial state based on configuration and folder status
 */
async function determineInitialState(context: vscode.ExtensionContext) {
    const configValidation = validateN8nConfig();
    const workspaceRoot = getWorkspaceRoot();

    if (!workspaceRoot) {
        // No workspace open
        enhancedTreeProvider.setExtensionState(ExtensionState.UNINITIALIZED);
        statusBar.hide();
        updateContextKeys();
        return;
    }

    const previouslyInitialized = isFolderPreviouslyInitialized(workspaceRoot);

    if (previouslyInitialized && configValidation.isValid) {
        // Folder was previously initialized and config is valid - auto-load
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
        // Configuration missing or invalid
        enhancedTreeProvider.setExtensionState(ExtensionState.CONFIGURING);
        statusBar.showConfiguring();
    } else {
        // Valid config but not previously initialized - show init button
        enhancedTreeProvider.setExtensionState(ExtensionState.UNINITIALIZED);
        statusBar.showNotInitialized();
    }
    updateContextKeys();
}

/**
 * Handle initialization command (when user clicks "Init N8N as code")
 */
async function handleInitializeCommand(context: vscode.ExtensionContext) {
    // If auto-load from determineInitialState is already running, wait for it instead of starting a second one
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

        // Initialize AI context immediately after initial sync
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

/**
 * Helper to get normalized n8n configuration
 */
function getN8nConfig(): { host: string, apiKey: string } {
    const config = vscode.workspace.getConfiguration('n8n');
    let host = config.get<string>('host') || process.env.N8N_HOST || '';
    const apiKey = config.get<string>('apiKey') || process.env.N8N_API_KEY || '';

    // Normalize: remove trailing slash
    if (host.endsWith('/')) {
        host = host.slice(0, -1);
    }

    return { host, apiKey };
}

async function initializeSyncManager(context: vscode.ExtensionContext) {
    // Cleanup old instance if exists
    if (syncManager) {
        syncManager.stopWatch();
        syncManager.removeAllListeners();
    }

    const { host, apiKey } = getN8nConfig();
    const config = vscode.workspace.getConfiguration('n8n');
    const folder = config.get<string>('syncFolder') || 'workflows';

    // Project-scoped sync (required)
    let projectId = config.get<string>('projectId');
    let projectName = config.get<string>('projectName');

    if (!host || !apiKey) {
        throw new Error('Host/API Key missing. Please check Settings.');
    }

    const credentials: IN8nCredentials = { host, apiKey };
    const client = new N8nApiClient(credentials);

    // If project isn't configured yet, try to pick a sensible default and persist it.
    if (!projectId || !projectName) {
        const projects = await client.getProjects();
        if (!projects.length) {
            throw new Error('No projects found on this n8n instance. Cannot initialize sync.');
        }

        // Prefer the personal project if available; otherwise, if there is only one project, use it.
        let selectedProject = projects.find((p: any) => p.type === 'personal');
        if (!selectedProject && projects.length === 1) {
            selectedProject = projects[0];
        }

        // Otherwise, ask the user.
        if (!selectedProject) {
            const picked = await vscode.window.showQuickPick(
                projects.map((p: any) => ({
                    label: p.type === 'personal' ? 'Personal' : p.name,
                    description: p.type,
                    detail: p.id,
                    project: p,
                })),
                {
                    title: 'Select the n8n project to sync',
                    ignoreFocusOut: true,
                }
            );

            if (!picked) {
                throw new Error('Project selection cancelled.');
            }

            selectedProject = (picked as any).project;
        }

        if (!selectedProject) {
            throw new Error('No project selected. Cannot initialize sync.');
        }

        projectId = selectedProject.id;
        projectName = selectedProject.type === 'personal' ? 'Personal' : selectedProject.name;

        await config.update('projectId', projectId, vscode.ConfigurationTarget.Workspace);
        await config.update('projectName', projectName, vscode.ConfigurationTarget.Workspace);
        outputChannel.appendLine(`[n8n] Selected project: ${projectName} (${projectId})`);
    }

    // Resolve Absolute Path
    let workspaceRoot = '';
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    } else {
        throw new Error('No workspace open');
    }

    const absDirectory = path.join(workspaceRoot, folder);

    // Generate instance identifier
    // Try to get user info for a more stable identifier, but don't fail if unavailable
    let instanceIdentifier: string;
    try {
        const user = await client.getCurrentUser();
        if (user) {
            instanceIdentifier = createInstanceIdentifier(host, user);
            outputChannel.appendLine(`[n8n] Instance identifier: ${instanceIdentifier} (user: ${user.firstName || user.email})`);
        } else {
            // Fallback: use API key hash if user info unavailable
            instanceIdentifier = createFallbackInstanceIdentifier(host, apiKey);
            outputChannel.appendLine(`[n8n] Instance identifier: ${instanceIdentifier} (fallback)`);
        }
    } catch (error: any) {
        // Check if it's a connection error (no response from server or specific codes)
        const isConnectionError = !error.response ||
            error.code === 'ECONNREFUSED' ||
            error.code === 'ENOTFOUND' ||
            error.code === 'ETIMEDOUT';

        if (isConnectionError) {
            outputChannel.appendLine(`[n8n] Connection test failed: ${error.message}`);
            // Throw a friendly error message immediately to prevent directory creation
            throw new Error(`Cannot connect to n8n instance at "${host}". Please check if n8n is running and the host URL is correct.`);
        }

        // For other errors (like 401 Unauthorized or 403 Forbidden),
        // we can still use the fallback identifier since the instance IS reachable
        instanceIdentifier = createFallbackInstanceIdentifier(host, apiKey);
        outputChannel.appendLine(`[n8n] Instance identifier: ${instanceIdentifier} (fallback - API error: ${error.message})`);
    }

    syncManager = new SyncManager(client, {
        directory: absDirectory,
        syncInactive: true,
        ignoredTags: [],
        instanceIdentifier: instanceIdentifier,
        instanceConfigPath: path.join(workspaceRoot, 'n8nac-instance.json'),
        projectId: projectId!,
        projectName: projectName!
    });

    // Pass syncManager to enhanced tree provider
    enhancedTreeProvider.setSyncManager(syncManager);

    // Initialize Redux store with SyncManager
    setSyncManager(syncManager);
    enhancedTreeProvider.subscribeToStore(store);

    // Wire up event handlers BEFORE starting watch
    // This ensures connection-lost is caught even during initial refresh

    // Handle connection loss (both during startup and runtime)
    syncManager.on('connection-lost', (error: Error) => {
        outputChannel.appendLine(`[n8n] CONNECTION LOST: ${error.message}`);

        // Stop sync manager
        syncManager!.stopWatch();

        // Update UI to error state
        enhancedTreeProvider.setExtensionState(ExtensionState.ERROR, error.message);
        statusBar.showError('Connection lost');

        // Show notification with retry option
        vscode.window.showErrorMessage(
            `Lost connection to n8n instance. The instance may have stopped.`,
            'Retry Connection',
            'Open Settings'
        ).then(choice => {
            if (choice === 'Retry Connection') {
                reinitializeSyncManager(context);
            } else if (choice === 'Open Settings') {
                vscode.commands.executeCommand('n8n.openSettings');
            }
        });
    });

    // Wire up logs
    syncManager.on('error', (msg) => {
        console.error(msg);
        vscode.window.showErrorMessage(`n8n Error: ${msg}`);
    });

    syncManager.on('log', (msg) => {
        console.log(msg);
        outputChannel.appendLine(msg);

        if (msg.includes('Sync complete') || msg.includes('Push complete')) {
            vscode.window.showInformationMessage(msg.replace(/^📥 |^📤 |^🔄 |^✅ /, ''));
        }
    });

    // Auto-refresh tree on changes using Redux store
    syncManager.on('change', async (ev: any) => {
        outputChannel.appendLine(`[n8n] Change detected: ${ev.status} (${ev.filename})`);

        // Reload workflows into store
        try {
            const workflows = await syncManager!.getWorkflowsStatus();
            store.dispatch(setWorkflows(workflows));
        } catch (error) {
            console.error('Failed to reload workflows:', error);
        }

        // Note: Webview reload is handled explicitly in push/pull commands
        // The Watcher doesn't emit 'type' field, only 'status', so we can't
        // reliably determine if remote changed here
    });

    // Handle Conflicts using Redux store
    syncManager.on('conflict', async (conflict: any) => {
        const { filename, id } = conflict;
        outputChannel.appendLine(`[n8n] CONFLICT detected for: ${filename}`);

        store.dispatch(addConflict({
            id: conflict.id,
            filename: conflict.filename,
            remoteContent: conflict.remoteContent
        }));
        enhancedTreeProvider.refresh();

        const choice = await vscode.window.showWarningMessage(
            `⚠️ Conflict: "${filename}" — local and remote versions differ.`,
            'Show Diff',
            'Keep Current (local)',
            'Keep Incoming (remote)',
            'Mark as Resolved'
        );

        if (choice) {
            await vscode.commands.executeCommand('n8n.resolveConflict', {
                workflow: { id, filename: filename, name: filename },
                choice
            });
        }
    });

    // Handle Remote Updated (after auto-sync push) - reload webview
    syncManager.on('remote-updated', (data: { workflowId: string, filename: string }) => {
        outputChannel.appendLine(`[n8n] Remote updated for: ${data.filename} (auto-sync push)`);
        WorkflowWebview.reloadIfMatching(data.workflowId, outputChannel);
    });

    // Global File System Watcher (VS Code side) for Real-Time UI Updates
    // Triggers refresh on Create, Delete, Change in sync folder
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        const syncFolder = config.get<string>('syncFolder') || 'workflows';
        // Use WorkspaceFolder as base for RelativePattern to ensure correct watching
        const pattern = new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], `${syncFolder}/*.json`);

        outputChannel.appendLine(`[n8n] Starting global file watcher. Pattern: ${pattern.pattern}`);
        const fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        // Debounce refresh to avoid API spam on rapid saves
        let refreshTimeout: NodeJS.Timeout | undefined;
        const debouncedRefresh = (e: vscode.Uri) => {
            outputChannel.appendLine(`[n8n] Watcher detected change: ${e.fsPath}`);
            if (refreshTimeout) clearTimeout(refreshTimeout);
            refreshTimeout = setTimeout(() => {
                outputChannel.appendLine('[n8n] Triggering view refresh...');
                enhancedTreeProvider.refresh();
            }, 500);
        };

        fileWatcher.onDidCreate(debouncedRefresh);
        fileWatcher.onDidDelete(debouncedRefresh);
        fileWatcher.onDidChange(debouncedRefresh);

        context.subscriptions.push(fileWatcher);
    }

    // Start Internal Watcher
    statusBar.setWatchMode(false);
    await syncManager.startWatch();

    // Load workflows for store
    try {
        const workflows = await syncManager.getWorkflowsStatus();
        store.dispatch(setWorkflows(workflows));

    } catch (error: any) {
        outputChannel.appendLine(`[n8n] Failed to load workflows: ${error.message}`);
    }

    // Check AI context
    const aiFiles = [
        path.join(workspaceRoot, 'AGENTS.md'),
        path.join(workspaceRoot, '.vscode', 'n8n.code-snippets')
    ];

    const missingAny = aiFiles.some(f => !fs.existsSync(f));
    const lastVersion = context.workspaceState.get<string>('n8n.lastInitVersion');
    let currentVersion: string | undefined;

    try {
        const health = await client.getHealth();
        currentVersion = health.version;
    } catch { }

    const versionMismatch = currentVersion && lastVersion && currentVersion !== lastVersion;
    const needsUpdate = missingAny || versionMismatch;

    enhancedTreeProvider.setAIContextInfo(currentVersion || undefined, !!needsUpdate);

    if (needsUpdate) {
        outputChannel.appendLine(`[n8n] AI Context out of date or missing.`);

        // Auto-generate AI context on first initialization if completely missing
        if (missingAny && !lastVersion) {
            outputChannel.appendLine(`[n8n] Auto-generating AI context for first-time setup...`);
            try {
                // Silent AI initialization
                await vscode.commands.executeCommand('n8n.initializeAI', { silent: true });
                outputChannel.appendLine(`[n8n] AI context auto-generated successfully.`);

                // Update tree provider with new version
                const newVersion = context.workspaceState.get<string>('n8n.lastInitVersion');
                enhancedTreeProvider.setAIContextInfo(newVersion || currentVersion, false);
            } catch (error: any) {
                outputChannel.appendLine(`[n8n] Failed to auto-generate AI context: ${error.message}`);
                // Don't show error to user - they can manually initialize later
            }
        }
    }
}

/**
 * Reinitialize sync manager when settings change
 */
async function reinitializeSyncManager(context: vscode.ExtensionContext) {
    if (!syncManager) {
        return;
    }

    outputChannel.appendLine('[n8n] Reinitializing sync manager with new settings...');

    try {
        const oldManager = syncManager;
        oldManager.stopWatch();
        oldManager.removeAllListeners();

        await initializeSyncManager(context);

        // After successful reinitialization, ensure state is set back to INITIALIZED
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

