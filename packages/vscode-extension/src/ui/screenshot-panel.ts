/**
 * ScreenshotPanel — a minimal webview that renders the current state of the
 * n8n workflow tree for visual regression testing.
 *
 * It is NOT part of the normal extension UI; it only exists to be screenshot'd
 * by the Playwright test runner.
 *
 * To open: `vscode.commands.executeCommand('n8nac.screenshot.open')`
 */

import * as vscode from 'vscode';
import { store, selectAllWorkflows, selectArchiveFilter } from '../services/workflow-store.js';
import { EnhancedWorkflowTreeProvider } from './enhanced-workflow-tree-provider.js';
import { ExtensionState } from '../types.js';

export class ScreenshotPanel {
    public static readonly viewType = 'n8nac.screenshot';
    private static currentPanel: ScreenshotPanel | undefined;
    private static treeProvider: EnhancedWorkflowTreeProvider | undefined;

    private readonly panel: vscode.WebviewPanel;
    private readonly subscriptions: vscode.Disposable[] = [];
    private storeUnsubscribe: (() => void) | undefined;

    private constructor(panel: vscode.WebviewPanel) {
        this.panel = panel;
        this.panel.title = 'n8nac — screenshot panel';
        this.panel.webview.options = { enableScripts: true, localResourceRoots: [] };

        this.subscriptions.push(this.panel.onDidDispose(() => this.dispose()));
        this.storeUnsubscribe = store.subscribe(() => this.render());

        this.panel.webview.onDidReceiveMessage((msg: { type: string; filter?: string }) => {
            if (msg.type === 'setFilter' && msg.filter) {
                const cmd: Record<string, string> = { active: 'n8n.showActive', archived: 'n8n.showArchived', all: 'n8n.showAll' };
                if (cmd[msg.filter]) vscode.commands.executeCommand(cmd[msg.filter]);
            }
        });

        this.render();
    }

    /** Register the 'n8nac.screenshot.open' command (called from extension.ts) */
    static register(treeProvider: EnhancedWorkflowTreeProvider): void {
        ScreenshotPanel.treeProvider = treeProvider;

        vscode.commands.registerCommand('n8nac.screenshot.open', () => {
            ScreenshotPanel.createOrShow();
        });
    }

    static createOrShow(): void {
        if (ScreenshotPanel.currentPanel) {
            ScreenshotPanel.currentPanel.panel.reveal(undefined, true);
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            this.viewType,
            'n8nac — screenshot',
            { preserveFocus: true, viewColumn: vscode.ViewColumn.Beside },
            { enableScripts: true }
        );
        ScreenshotPanel.currentPanel = new ScreenshotPanel(panel);
    }

    private render(): void {
        if (!this.panel) return;
        const state = store.getState();
        const workflows = selectAllWorkflows(state);
        const filter = selectArchiveFilter(state);
        const extState = ScreenshotPanel.treeProvider?.getExtensionState() ?? ExtensionState.UNINITIALIZED;

        this.panel.webview.html = this.buildHtml({ workflows, filter, extState });
    }

    private buildHtml(data: { workflows: any[]; filter: string; extState: ExtensionState }): string {
        const { workflows, filter, extState } = data;
        const filterLabels: Record<string, string> = { live: 'Live', archived: 'Archived', all: 'All' };
        const isInitialized = extState === ExtensionState.INITIALIZED;

        const workflowRows = workflows.length === 0
            ? '<tr><td colspan="3" style="padding:12px;color:#888;font-style:italic">No workflows</td></tr>'
            : workflows.map(wf => {
                const badge = wf.isArchived
                    ? '<span style="background:#7a3a10;color:#fff;padding:1px 6px;border-radius:3px;font-size:11px">archived</span>'
                    : '<span style="background:#2d5a2d;color:#7ff7af;padding:1px 6px;border-radius:3px;font-size:11px">active</span>';
                const dotColor: Record<string, string> = {
                    TRACKED: '#7ff7af', CONFLICT: '#ff7a7a', 'MODIFIED-LOCAL': '#ffe066',
                    'MODIFIED-REMOTE': '#66b3ff', 'LOCAL-ONLY': '#b3b3b3', 'CLOUD-ONLY': '#66b3ff',
                };
                const dot = `<span style="color:${dotColor[wf.status] ?? '#888'};font-size:16px">●</span>`;
                const name = wf.name ?? wf.filename ?? '?';
                return `<tr><td style="padding:6px 12px">${dot}</td><td style="padding:6px 12px">${name}</td><td style="padding:6px 12px;text-align:right">${badge}</td></tr>`;
            }).join('');

        const filterButtons = (['live', 'archived', 'all'] as const).map(f => {
            const active = filter === f;
            const style = active
                ? 'background:#4a3f6b;border-color:#9b8fc4'
                : 'background:#2a2a3a;border-color:#555';
            return `<button class="filter-btn" data-filter="${f}" style="padding:4px 12px;border-radius:4px;color:#e0e0e0;cursor:pointer;font-size:12px;border:1px solid;${style}">${filterLabels[f]}</button>`;
        }).join(' ');

        const stateLabel = isInitialized ? 'Initialized'
            : extState === ExtensionState.INITIALIZING ? 'Initializing...'
            : extState === ExtensionState.CONFIGURING ? 'Needs configuration'
            : 'Not initialized';

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e2e; color: #cdd6f4; padding: 16px; min-width: 400px; }
  h2 { font-size: 14px; color: #cdd6f4; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .badge { background: #4a3f6b; color: #cdd6f4; padding: 2px 8px; border-radius: 10px; font-size: 11px; }
  .filter-bar { display: flex; gap: 6px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; color: #888; padding: 4px 12px 8px; border-bottom: 1px solid #333; }
  tr:hover td { background: #2a2a3a; }
  .state-bar { margin-top: 12px; font-size: 11px; color: #666; display: flex; gap: 16px; flex-wrap: wrap; }
  .state-bar span { display: flex; align-items: center; gap: 4px; }
  .state-dot { width: 8px; height: 8px; border-radius: 50%; background: #7ff7af; }
  .state-dot.offline { background: #ff7a7a; }
  .state-dot.warning { background: #ffe066; }
</style>
</head>
<body>
  <h2>⚡ n8n Workflow Explorer <span class="badge">v${'__N8NAC_VERSION__'}</span></h2>

  <div class="filter-bar">${filterButtons}</div>

  <table>
    <thead><tr><th style="width:24px"></th><th>Name</th><th style="text-align:right">Status</th></tr></thead>
    <tbody>${workflowRows}</tbody>
  </table>

  <div class="state-bar">
    <span><span class="state-dot ${isInitialized ? '' : 'offline'}"></span> ${stateLabel}</span>
    <span>Filter: <strong>${filterLabels[filter]}</strong></span>
    <span>${workflows.length} workflow${workflows.length !== 1 ? 's' : ''}</span>
  </div>

  <script>
    document.querySelectorAll('button.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-filter');
        // Tell extension host to change filter
        acquireVsCodeApi().postMessage({ type: 'setFilter', filter });
        // Update button styles locally
        document.querySelectorAll('button.filter-btn').forEach(b => {
          b.style.background = b === btn ? '#4a3f6b' : '#2a2a3a';
          b.style.borderColor = b === btn ? '#9b8fc4' : '#555';
        });
      });
    });

    window.getState = () => ({
      filter: '${filter}',
      workflowCount: ${workflows.length},
      initialized: ${isInitialized},
    });
  </script>
</body>
</html>`;
    }

    dispose(): void {
        ScreenshotPanel.currentPanel = undefined;
        this.subscriptions.forEach(d => d.dispose());
        this.storeUnsubscribe?.();
    }
}
