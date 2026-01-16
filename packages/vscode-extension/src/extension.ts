import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SyncManager, N8nApiClient, IN8nCredentials, IWorkflowStatus, SchemaGenerator, WorkflowSyncStatus } from '@n8n-as-code/core';
import { AiContextGenerator, SnippetGenerator } from '@n8n-as-code/agent-cli';

import { StatusBar } from './ui/status-bar.js';
import { EnhancedWorkflowTreeProvider } from './ui/enhanced-workflow-tree-provider.js';
import { WorkflowWebview } from './ui/workflow-webview.js';
import { WorkflowDetailWebview } from './ui/workflow-detail-webview.js';
import { ProxyService } from './services/proxy-service.js';
import { ExtensionState } from './types.js';
import { validateN8nConfig, getWorkspaceRoot, isFolderPreviouslyInitialized } from './utils/state-detection.js';

import {
    store,
    setSyncManager,
    loadWorkflows,
    syncDown,
    syncUp,
    setWorkflows,
    updateWorkflow,
    removeWorkflow,
    addPendingDeletion,
    removePendingDeletion,
    addConflict,
    removeConflict
} from './services/workflow-store.js';

let syncManager: SyncManager | undefined;
let watchModeActive = false;
const statusBar = new StatusBar();
const proxyService = new ProxyService();
const enhancedTreeProvider = new EnhancedWorkflowTreeProvider();
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

    // Pass output channel to proxy service
    proxyService.setOutputChannel(outputChannel);
    proxyService.setSecrets(context.secrets);

    // 1. Determine initial state
    await determineInitialState(context);

    // Initial context keys update
    updateContextKeys();

    // 2. Register Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('n8n.init', async () => {
            await handleInitializeCommand(context);
        }),

        vscode.commands.registerCommand('n8n.applySettings', async () => {
            outputChannel.appendLine('[n8n] Applying new settings...');
            await reinitializeSyncManager(context);
            updateContextKeys();
        }),

        vscode.commands.registerCommand('n8n.pull', async () => {
            if (!syncManager) {
                vscode.window.showWarningMessage('n8n: Not initialized.');
                return;
            }

            statusBar.showSyncing();

            try {
                // Use Redux Thunk
                await store.dispatch(syncDown()).unwrap();

                // UI updates automatically via store subscription
                statusBar.showSynced();
            } catch (e: any) {
                statusBar.showError(e.message);
                vscode.window.showErrorMessage(`n8n Pull Error: ${e.message}`);
            }
        }),

        vscode.commands.registerCommand('n8n.push', async () => {
            if (!syncManager) {
                vscode.window.showWarningMessage('n8n: Not initialized.');
                return;
            }

            statusBar.showSyncing();

            try {
                // Use Redux Thunk
                await store.dispatch(syncUp()).unwrap();

                // Handle deletions manually (for when Watcher is off)
                const deletions = await syncManager.getLocalDeletions();
                if (deletions.length > 0) {
                    for (const del of deletions) {
                        store.dispatch(addPendingDeletion(del.id));
                    }
                    vscode.window.showInformationMessage(`Found ${deletions.length} pending deletions. Please check the tree view.`);
                }

                statusBar.showSynced();
            } catch (e: any) {
                statusBar.showError(e.message);
                vscode.window.showErrorMessage(`n8n Push Error: ${e.message}`);
            }
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

        vscode.commands.registerCommand('n8n.openWorkflowDetail', async (arg: any) => {
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf || !syncManager) return;

            const extensionUri = context.extensionUri;
            WorkflowDetailWebview.createOrShow(extensionUri, wf, syncManager);
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
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf || !syncManager || !wf.filename) return;

            statusBar.showSyncing();
            try {
                const instanceDirectory = syncManager.getInstanceDirectory();
                const absPath = path.join(instanceDirectory, wf.filename);
                await syncManager.handleLocalFileChange(absPath);

                outputChannel.appendLine(`[n8n] Push successful for: ${wf.name} (${wf.id})`);
                enhancedTreeProvider.refresh();
                statusBar.showSynced();
                vscode.window.showInformationMessage(`✅ Pushed "${wf.name}"`);
            } catch (e: any) {
                statusBar.showError(e.message);
                vscode.window.showErrorMessage(`Push Error: ${e.message}`);
            }
        }),

        vscode.commands.registerCommand('n8n.pullWorkflow', async (arg: any) => {
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf || !syncManager || !wf.id) return;

            statusBar.showSyncing();
            try {
                if (wf.filename) {
                    await syncManager.pullWorkflow(wf.filename, wf.id);
                    enhancedTreeProvider.refresh();
                    statusBar.showSynced();
                    vscode.window.showInformationMessage(`✅ Pulled "${wf.name}"`);
                }
            } catch (e: any) {
                statusBar.showError(e.message);
                vscode.window.showErrorMessage(`Pull Error: ${e.message}`);
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

                    progress?.report({ message: `Generating Schema (n8n v${version})...` });
                    const schemaGen = new SchemaGenerator();
                    await schemaGen.generateSchema(path.join(rootPath, 'n8n-schema.json'));

                    progress?.report({ message: "Generating AGENTS.md..." });
                    const contextGen = new AiContextGenerator();
                    await contextGen.generate(rootPath, version);

                    progress?.report({ message: "Generating Snippets..." });
                    const indexPath = path.join(context.extensionPath, 'assets', 'n8n-nodes-index.json');
                    const snippetGen = new SnippetGenerator(indexPath);
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
            outputChannel.appendLine(`[n8n] deleteWorkflow command called.`);
            const wf = arg?.workflow ? arg.workflow : arg;

            if (!syncManager || !wf || !wf.filename) return;

            try {
                const instanceDirectory = syncManager.getInstanceDirectory();
                const absPath = path.join(instanceDirectory, wf.filename);

                if (fs.existsSync(absPath)) {
                    // 1. Optimistic UI update via Redux
                    store.dispatch(addPendingDeletion(wf.id));

                    // 2. Delete file
                    await fs.promises.unlink(absPath);

                    // 3. Notify
                    vscode.window.showInformationMessage(`🗑️ Local file "${wf.filename}" deleted. Right-click to confirm remote deletion or restore.`);
                }
            } catch (e: any) {
                outputChannel.appendLine(`[n8n] Delete Error: ${e.message}`);
                vscode.window.showErrorMessage(`Delete Error: ${e.message}`);
                store.dispatch(removePendingDeletion(wf.id));
            }
        }),

        vscode.commands.registerCommand('n8n.spacer', () => {
            // Dummy command for spacing
        }),

        vscode.commands.registerCommand('n8n.resolveConflict', async (arg: any) => {
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf || !syncManager) return;

            const conflict = enhancedTreeProvider.getConflict(wf.id);
            if (!conflict) {
                vscode.window.showInformationMessage('No conflict data found for this workflow.');
                return;
            }

            const { id, filename, remoteContent } = conflict;

            let choice = arg?.choice;

            if (!choice) {
                choice = await vscode.window.showWarningMessage(
                    `Resolve conflict for "${filename}"?`,
                    'Show Diff',
                    'Overwrite Remote (Use Local)',
                    'Overwrite Local (Use Remote)'
                );
            }

            if (choice === 'Show Diff') {
                const remoteUri = vscode.Uri.parse(`n8n-remote:${filename}?id=${id}`);
                const localUri = vscode.Uri.file(path.join(syncManager.getInstanceDirectory(), filename));
                conflictStore.set(remoteUri.toString(), JSON.stringify(remoteContent, null, 2));
                await vscode.commands.executeCommand('vscode.diff', localUri, remoteUri, `${filename} (Local ↔ n8n Remote)`);
            } else if (choice === 'Overwrite Remote (Use Local)') {
                // Force push
                syncManager['stateManager']?.updateWorkflowState(id, remoteContent);
                const absPath = path.join(syncManager.getInstanceDirectory(), filename);
                await syncManager.handleLocalFileChange(absPath);

                // Update Store
                store.dispatch(removeConflict(id));
                store.dispatch(updateWorkflow({ id, updates: { status: WorkflowSyncStatus.SYNCED } }));

                vscode.window.showInformationMessage(`✅ Resolved: Remote overwritten by Local.`);
            } else if (choice === 'Overwrite Local (Use Remote)') {
                // Force pull
                await syncManager.pullWorkflow(filename, id, true);

                // Update Store
                store.dispatch(removeConflict(id));
                store.dispatch(updateWorkflow({ id, updates: { status: WorkflowSyncStatus.SYNCED } }));

                vscode.window.showInformationMessage(`✅ Resolved: Local overwritten by Remote.`);
            }
        }),

        vscode.commands.registerCommand('n8n.confirmDeletion', async (arg: any) => {
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf || !syncManager) return;

            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to DELETE "${wf.name}" from n8n?`,
                { modal: true },
                'Delete Remote Workflow'
            );

            if (confirm === 'Delete Remote Workflow') {
                const success = await syncManager.deleteRemoteWorkflow(wf.id, wf.filename);
                if (success) {
                    store.dispatch(removePendingDeletion(wf.id));
                    store.dispatch(removeWorkflow(wf.id));

                    vscode.window.showInformationMessage(`✅ Deleted "${wf.name}" from n8n.`);
                } else {
                    vscode.window.showErrorMessage(`❌ Failed to delete "${wf.name}".`);
                }
            }
        }),

        vscode.commands.registerCommand('n8n.restoreDeletion', async (arg: any) => {
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf || !syncManager) return;

            const success = await syncManager.restoreLocalFile(wf.id, wf.filename);
            if (success) {
                store.dispatch(removePendingDeletion(wf.id));
                store.dispatch(updateWorkflow({ id: wf.id, updates: { status: WorkflowSyncStatus.SYNCED } }));

                vscode.window.showInformationMessage(`✅ Restored "${wf.name}" locally.`);
            } else {
                vscode.window.showErrorMessage(`❌ Failed to restore "${wf.name}".`);
            }
        })
    );

    // 2b. Listen for Config Changes (but don't auto-initialize)
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (
                e.affectsConfiguration('n8n.host') ||
                e.affectsConfiguration('n8n.apiKey') ||
                e.affectsConfiguration('n8n.syncFolder')
            ) {
                // Critical settings changed: host, API key, or folder
                outputChannel.appendLine('[n8n] Critical settings changed (host/apiKey/folder). Pausing sync until applied.');

                if (syncManager) {
                    enhancedTreeProvider.setExtensionState(ExtensionState.SETTINGS_CHANGED);
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
            } else if (
                e.affectsConfiguration('n8n.syncMode') ||
                e.affectsConfiguration('n8n.pollInterval')
            ) {
                // Non-critical settings: syncMode or pollInterval
                outputChannel.appendLine('[n8n] Non-critical settings changed (syncMode/pollInterval). Auto-applying...');

                if (syncManager) {
                    try {
                        await reinitializeSyncManager(context);
                        vscode.window.showInformationMessage('✅ Sync mode / interval updated.');
                    } catch (error: any) {
                        outputChannel.appendLine(`[n8n] Failed to auto-apply settings: ${error.message}`);
                    }
                }
                // No UI state change needed
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
            await initializeSyncManager(context);
            enhancedTreeProvider.setExtensionState(ExtensionState.INITIALIZED);
            statusBar.showSynced();
        } catch (error: any) {
            outputChannel.appendLine(`[n8n] Auto-load failed: ${error.message}`);
            enhancedTreeProvider.setExtensionState(ExtensionState.ERROR, error.message);
            statusBar.showError(error.message);
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
    const configValidation = validateN8nConfig();

    if (!configValidation.isValid) {
        vscode.window.showErrorMessage(`Missing configuration: ${configValidation.missing.join(', ')}`);
        vscode.commands.executeCommand('n8n.openSettings');
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
    const pollIntervalMs = config.get<number>('pollInterval') || 3000;

    if (!host || !apiKey) {
        throw new Error('Host/API Key missing. Please check Settings.');
    }

    const credentials: IN8nCredentials = { host, apiKey };
    const client = new N8nApiClient(credentials);

    // Resolve Absolute Path
    let workspaceRoot = '';
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    } else {
        throw new Error('No workspace open');
    }

    const absDirectory = path.join(workspaceRoot, folder);

    syncManager = new SyncManager(client, {
        directory: absDirectory,
        pollIntervalMs: pollIntervalMs,
        syncInactive: true,
        ignoredTags: [],
        instanceConfigPath: path.join(workspaceRoot, 'n8n-as-code-instance.json'),
        syncMode: (config.get<string>('syncMode') || 'auto') as 'auto' | 'manual'
    });

    // Pass syncManager to enhanced tree provider
    enhancedTreeProvider.setSyncManager(syncManager);

    // Initialize Redux store with SyncManager
    setSyncManager(syncManager);
    enhancedTreeProvider.subscribeToStore(store);

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
        outputChannel.appendLine(`[n8n] Change detected: ${ev.type} (${ev.filename})`);

        // Reload workflows into store
        try {
            const workflows = await syncManager!.getWorkflowsStatus();
            store.dispatch(setWorkflows(workflows));
        } catch (error) {
            console.error('Failed to reload workflows:', error);
        }

        // ONLY reload webview automatically on PUSH (local-to-remote)
        if (ev.id && ev.type === 'local-to-remote') {
            WorkflowWebview.reloadIfMatching(ev.id, outputChannel);
        }

        // Notify user about remote deletion
        if (ev.type === 'remote-deletion') {
            vscode.window.showInformationMessage(`🗑️ Remote workflow "${ev.filename}" was deleted. Local file moved to .archive.`);
        }
    });

    // Handle Conflicts using Redux store
    syncManager.on('conflict', (conflict: any) => {
        const { id, filename } = conflict;
        outputChannel.appendLine(`[n8n] CONFLICT detected for: ${filename}`);

        store.dispatch(addConflict({
            id: conflict.id,
            filename: conflict.filename,
            remoteContent: conflict.remoteContent
        }));

        vscode.window.showWarningMessage(
            `Conflict detected for "${filename}". Right-click in tree view to Resolve.`
        );
    });

    // Handle Local Deletion using Redux store
    syncManager.on('local-deletion', (data: { id: string, filename: string }) => {
        outputChannel.appendLine(`[n8n] LOCAL DELETION detected for: ${data.filename}`);

        store.dispatch(addPendingDeletion(data.id));

        vscode.window.showInformationMessage(
            `Local file "${data.filename}" deleted. Right-click in tree view to Confirm or Restore.`
        );
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

    // Start Internal Watcher (Always active now, logic inside determines behavior)
    const mode = config.get<string>('syncMode') || 'auto';
    statusBar.setWatchMode(mode === 'auto');
    await syncManager.startWatch();

    // Load workflows for store
    try {
        const workflows = await syncManager.getWorkflowsStatus();
        store.dispatch(setWorkflows(workflows));
        // Also keep local tree provider method if needed for fallback, 
        // but it should be subscribing to store now.
        // enhancedTreeProvider.setWorkflows(workflows); 
    } catch (error: any) {
        outputChannel.appendLine(`[n8n] Failed to load workflows: ${error.message}`);
    }

    // Check AI context
    const aiFiles = [
        path.join(workspaceRoot, 'AGENTS.md'),
        path.join(workspaceRoot, 'n8n-schema.json'),
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

