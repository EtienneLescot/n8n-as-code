import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SyncManager, N8nApiClient, IN8nCredentials, IWorkflowStatus, SchemaGenerator, AiContextGenerator, SnippetGenerator } from '@n8n-as-code/core';
import { StatusBar } from './ui/status-bar.js';
import { WorkflowTreeProvider } from './ui/workflow-tree-provider.js';
import { WorkflowWebview } from './ui/workflow-webview.js';
import { ProxyService } from './services/proxy-service.js';

let syncManager: SyncManager | undefined;
let watchModeActive = false;
const statusBar = new StatusBar();
const proxyService = new ProxyService();
const outputChannel = vscode.window.createOutputChannel("n8n-as-code");

export async function activate(context: vscode.ExtensionContext) {
    outputChannel.show(true);
    outputChannel.appendLine('🔌 Activation of "n8n-as-code" ...');

    // Pass output channel to proxy service
    proxyService.setOutputChannel(outputChannel);

    // 1. Initial Setup
    await initializeSyncManager();

    // 2. Register Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('n8n.pull', async () => {
            if (!syncManager) await initializeSyncManager();
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
            if (!syncManager) await initializeSyncManager();
            if (syncManager) {
                statusBar.showSyncing();
                try {
                    // Update: use syncUp() for full sync like in CLI
                    await syncManager.syncUp();

                    // Intelligent Refresh: Refresh whatever is currently open if we did a global push
                    WorkflowWebview.reloadCurrent(outputChannel);

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

            const config = vscode.workspace.getConfiguration('n8n');
            const host = config.get<string>('host') || process.env.N8N_HOST || '';

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
                const uri = vscode.Uri.file(path.join(syncManager['config'].directory, wf.filename));
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

            const config = vscode.workspace.getConfiguration('n8n');
            const host = config.get<string>('host') || process.env.N8N_HOST || '';

            // 1. Open JSON in left column
            if (wf.filename) {
                const uri = vscode.Uri.file(path.join(syncManager['config'].directory, wf.filename));
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
                const absPath = path.join(syncManager['config'].directory, wf.filename);
                await syncManager.handleLocalFileChange(absPath);

                outputChannel.appendLine(`[n8n] Push successful for: ${wf.name} (${wf.id})`);
                WorkflowWebview.reloadIfMatching(wf.id, outputChannel);

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

        vscode.commands.registerCommand('n8n.initializeAI', async () => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace open.');
                return;
            }

            // Re-use client from syncManager or init new logic if needed. 
            // We should ensure client is ready.
            if (!syncManager) await initializeSyncManager();

            // We need a client. If initializeSyncManager failed/no creds, we can't proceed properly
            // But actually, we need the credentials.
            const config = vscode.workspace.getConfiguration('n8n');
            const host = config.get<string>('host') || process.env.N8N_HOST || '';
            const apiKey = config.get<string>('apiKey') || process.env.N8N_API_KEY || '';

            if (!host || !apiKey) {
                vscode.window.showErrorMessage('n8n: Host/API Key missing. Cannot initialize AI context.');
                return;
            }

            const client = new N8nApiClient({ host, apiKey });
            const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "n8n: Initializing AI Context...",
                cancellable: false
            }, async (progress) => {
                try {
                    progress.report({ message: "Generating Schema..." });
                    const schemaGen = new SchemaGenerator(client);
                    await schemaGen.generateSchema(path.join(rootPath, 'n8n-schema.json'));

                    progress.report({ message: "Generating AGENTS.md..." });
                    const contextGen = new AiContextGenerator(client);
                    await contextGen.generate(rootPath);

                    progress.report({ message: "Fetching Snippets..." });
                    const snippetGen = new SnippetGenerator(client);
                    await snippetGen.generate(rootPath);

                    vscode.window.showInformationMessage('✨ n8n AI Context Initialized! (AGENTS.md, Schema, Snippets)');
                } catch (e: any) {
                    vscode.window.showErrorMessage(`AI Init Failed: ${e.message}`);
                }
            });
        }),

        vscode.commands.registerCommand('n8n.toggleWatchMode', async () => {
            watchModeActive = !watchModeActive;

            // Set context for UI (menus)
            await vscode.commands.executeCommand('setContext', 'n8n.watchModeActive', watchModeActive);

            if (watchModeActive) {
                if (!syncManager) await initializeSyncManager();
                if (syncManager) {
                    statusBar.setWatchMode(true);

                    // Listen for changes to refresh tree (Optional: SyncManager already emits log/error, 
                    // we might want a 'sync' event or just rely on the interval and tree auto-refresh)
                    // For UI responsiveness, let's refresh tree when SyncManager completes a pull.
                    // We can listen to 'log' for now or add a 'synced' event to SyncManager.

                    await syncManager.startWatch();
                }
            } else {
                statusBar.setWatchMode(false);
                syncManager?.stopWatch();
            }
        })
    );

    // Register Tree View
    const treeProvider = new WorkflowTreeProvider();
    vscode.window.registerTreeDataProvider('n8n-explorer.workflows', treeProvider);

    // Pass syncManager to provider once ready
    if (syncManager) treeProvider.setSyncManager(syncManager);
}

async function initializeSyncManager() {
    const config = vscode.workspace.getConfiguration('n8n');
    const host = config.get<string>('host') || process.env.N8N_HOST || '';
    const apiKey = config.get<string>('apiKey') || process.env.N8N_API_KEY || '';
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

    syncManager = new SyncManager(client, {
        directory: absDirectory,
        pollIntervalMs: pollIntervalMs,
        syncInactive: true,
        ignoredTags: []
    });

    // Wire up logs
    syncManager.on('error', (msg) => console.error(msg));
    syncManager.on('log', (msg) => {
        console.log(msg);
        outputChannel.appendLine(msg);
    });

    // Auto-refresh tree on ANY change (Watch or manual)
    syncManager.on('change', () => {
        vscode.commands.executeCommand('n8n.refresh');
    });

    // Check for AI Context
    const agentsPath = path.join(workspaceRoot, 'AGENTS.md');
    if (!fs.existsSync(agentsPath)) {
        const answer = await vscode.window.showInformationMessage(
            'n8n-as-code: AI Context (AGENTS.md) is missing. Initialize it now for better AI assistance?',
            'Yes', 'No'
        );
        if (answer === 'Yes') {
            vscode.commands.executeCommand('n8n.initializeAI');
        }
    }
}

export function deactivate() {
    proxyService.stop();
}
