import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SyncManager, N8nApiClient, IN8nCredentials, IWorkflowStatus, SchemaGenerator, AiContextGenerator, SnippetGenerator, createInstanceIdentifier, createFallbackInstanceIdentifier } from '@n8n-as-code/core';
import { StatusBar } from './ui/status-bar.js';
import { WorkflowTreeProvider } from './ui/workflow-tree-provider.js';
import { WorkflowWebview } from './ui/workflow-webview.js';
import { ProxyService } from './services/proxy-service.js';

let syncManager: SyncManager | undefined;
let watchModeActive = false;
const statusBar = new StatusBar();
const proxyService = new ProxyService();
const treeProvider = new WorkflowTreeProvider();
const outputChannel = vscode.window.createOutputChannel("n8n-as-code");

export async function activate(context: vscode.ExtensionContext) {
    outputChannel.show(true);
    outputChannel.appendLine('🔌 Activation of "n8n-as-code" ...');

    // Register Tree View early
    vscode.window.registerTreeDataProvider('n8n-explorer.workflows', treeProvider);

    // Pass output channel to proxy service
    proxyService.setOutputChannel(outputChannel);
    proxyService.setSecrets(context.secrets);

    // 1. Initial Setup
    await initializeSyncManager(context);

    // 2. Register Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('n8n.pull', async () => {
            if (!syncManager) await initializeSyncManager(context);
            if (syncManager) {
                statusBar.showSyncing();
                try {
                    await syncManager.syncDown();
                    // Refresh tree
                    treeProvider.refresh();

                    statusBar.showSynced();
                    vscode.window.showInformationMessage('✅ n8n: Workflows pulled successfully.');
                } catch (e: any) {
                    statusBar.showError(e.message);
                    vscode.window.showErrorMessage(`n8n Pull Error: ${e.message}`);
                }
            }
        }),

        vscode.commands.registerCommand('n8n.push', async () => {
            if (!syncManager) await initializeSyncManager(context);
            if (syncManager) {
                statusBar.showSyncing();
                try {
                    // Update: use syncUp() for full sync like in CLI
                    await syncManager.syncUp();

                    // Refresh tree
                    treeProvider.refresh();
                    statusBar.showSynced();
                    vscode.window.showInformationMessage('✅ n8n: Pushed missing/updated workflows.');
                } catch (e: any) {
                    statusBar.showError(e.message);
                    vscode.window.showErrorMessage(`n8n Push Error: ${e.message}`);
                }
            }
        }),

        vscode.commands.registerCommand('n8n.openBoard', async (arg: any) => {
            const wf = arg?.workflow ? arg.workflow : arg;
            if (!wf) return;

            const { host } = getN8nConfig();

            outputChannel.appendLine(`[n8n] Opening board for workflow: ${wf.name} (${wf.id})`);
            outputChannel.appendLine(`[n8n] Host configured: ${host}`);

            if (host) {
                try {
                    // Start local proxy to handle authentication cookies
                    outputChannel.appendLine(`[n8n] Starting proxy for ${host}...`);
                    const proxyUrl = await proxyService.start(host);
                    outputChannel.appendLine(`[n8n] Proxy started at: ${proxyUrl}`);

                    const targetUrl = `${proxyUrl}/workflow/${wf.id}`;
                    outputChannel.appendLine(`[n8n] Opening webview with URL: ${targetUrl}`);

                    // Open in embedded webview with proxy
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
                // Use the instance-specific directory, not the base directory
                const instanceDirectory = syncManager['getInstanceDirectory']();
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

            // 1. Open JSON in left column (use instance-specific directory)
            if (wf.filename) {
                const instanceDirectory = syncManager['getInstanceDirectory']();
                const uri = vscode.Uri.file(path.join(instanceDirectory, wf.filename));
                try {
                    const doc = await vscode.workspace.openTextDocument(uri);
                    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One });
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Could not open file: ${e.message}`);
                }
            }

            // 2. Open webview in right column with proxy
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
                // We reuse handleLocalFileChange which does the "Push" (Update/Create) logic
                const instanceDirectory = syncManager['getInstanceDirectory']();
                const absPath = path.join(instanceDirectory, wf.filename);
                await syncManager.handleLocalFileChange(absPath);

                outputChannel.appendLine(`[n8n] Push successful for: ${wf.name} (${wf.id})`);

                treeProvider.refresh();
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

                    treeProvider.refresh();
                    statusBar.showSynced();
                    vscode.window.showInformationMessage(`✅ Pulled "${wf.name}"`);
                }
            } catch (e: any) {
                statusBar.showError(e.message);
                vscode.window.showErrorMessage(`Pull Error: ${e.message}`);
            }
        }),

        vscode.commands.registerCommand('n8n.refresh', () => {
            treeProvider.refresh();
        }),

        vscode.commands.registerCommand('n8n.initializeAI', async (options?: { silent?: boolean }) => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                if (!options?.silent) vscode.window.showErrorMessage('No workspace open.');
                return;
            }

            if (!syncManager) await initializeSyncManager(context);

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
                    const schemaGen = new SchemaGenerator(client);
                    await schemaGen.generateSchema(path.join(rootPath, 'n8n-schema.json'));

                    progress?.report({ message: "Generating AGENTS.md..." });
                    const contextGen = new AiContextGenerator(client);
                    await contextGen.generate(rootPath);

                    progress?.report({ message: "Fetching Snippets..." });
                    const snippetGen = new SnippetGenerator(client);
                    await snippetGen.generate(rootPath);

                    // Store current version to avoid unnecessary refreshes if already aligned
                    context.workspaceState.update('n8n.lastInitVersion', version);

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
        })
    );

    // 2b. Listen for Config Changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (
                e.affectsConfiguration('n8n.host') ||
                e.affectsConfiguration('n8n.apiKey') ||
                e.affectsConfiguration('n8n.syncFolder') ||
                e.affectsConfiguration('n8n.syncMode') ||
                e.affectsConfiguration('n8n.pollInterval')
            ) {
                outputChannel.appendLine('[n8n] Settings changed. Re-initializing SyncManager...');
                await initializeSyncManager(context);
            }
        })
    );
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
    // 1. Cleanup Old Instance
    if (syncManager) {
        syncManager.stopWatch();
        syncManager.removeAllListeners();
    }

    const { host, apiKey } = getN8nConfig();
    const config = vscode.workspace.getConfiguration('n8n');
    const folder = config.get<string>('syncFolder') || 'workflows';
    const pollIntervalMs = config.get<number>('pollInterval') || 3000;

    if (!host || !apiKey) {
        vscode.window.showWarningMessage('n8n: Host/API Key missing. Please check Settings.');
        return;
    }

    const credentials: IN8nCredentials = { host, apiKey };
    const client = new N8nApiClient(credentials);

    // Resolve Absolute Path
    let workspaceRoot = '';
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    } else {
        return; // No workspace open
    }

    const absDirectory = path.join(workspaceRoot, folder);

    // Let SyncManager handle instance identifier internally (centralized in core)
    syncManager = new SyncManager(client, {
        directory: absDirectory,
        pollIntervalMs: pollIntervalMs,
        syncInactive: true,
        ignoredTags: []
        // instanceIdentifier is now handled automatically by SyncManager
    });

    // Pass syncManager to tree provider
    treeProvider.setSyncManager(syncManager);

    // Wire up logs
    syncManager.on('error', (msg) => console.error(msg));
    syncManager.on('log', (msg) => {
        console.log(msg);
        outputChannel.appendLine(msg);
    });

    // Auto-refresh tree & webview on ANY change (Watch or manual)
    syncManager.on('change', (ev: any) => {
        outputChannel.appendLine(`[n8n] Change detected: ${ev.type} (${ev.filename})`);
        vscode.commands.executeCommand('n8n.refresh');

        // ONLY reload webview automatically on PUSH (local-to-remote)
        // This avoids the feedback loop where saving in webview triggers a pull
        if (ev.id && ev.type === 'local-to-remote') {
            WorkflowWebview.reloadIfMatching(ev.id, outputChannel);
        }
    });

    // Start Watcher if in Auto mode
    const mode = config.get<string>('syncMode') || 'auto';
    if (mode === 'auto') {
        statusBar.setWatchMode(true);
        await syncManager.startWatch();
    } else {
        statusBar.setWatchMode(false);
    }

    // Check for AI Context files
    const aiFiles = [
        path.join(workspaceRoot, 'AGENTS.md'),
        path.join(workspaceRoot, 'n8n-schema.json'),
        path.join(workspaceRoot, '.vscode', 'n8n.code-snippets')
    ];

    const missingAny = aiFiles.some(f => !fs.existsSync(f));

    // Check if version changed since last init
    const lastVersion = context.workspaceState.get<string>('n8n.lastInitVersion');
    let currentVersion: string | undefined;

    try {
        const health = await client.getHealth();
        currentVersion = health.version;
    } catch { }

    const versionMismatch = currentVersion && lastVersion && currentVersion !== lastVersion;

    if (missingAny || versionMismatch) {
        outputChannel.appendLine(`[n8n] AI Context out of date or missing (vMismatch: ${versionMismatch}, missing: ${missingAny}). Auto-initializing...`);
        vscode.commands.executeCommand('n8n.initializeAI', { silent: true });
    }
}

export function deactivate() {
    proxyService.stop();
}
