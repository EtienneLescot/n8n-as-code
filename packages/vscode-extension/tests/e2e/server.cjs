/**
 * server.cjs — Real workflow HTTP server
 *
 * Fetches live workflows from the n8n cloud API at startup and serves them
 * as HTML pages mirroring ScreenshotPanel.buildHtml().
 *
 * Playwright navigates to http://localhost:9876 to interact with the real UI.
 *
 * Run: node tests/e2e/server.cjs
 * Env:
 *   N8N_HOST          e.g. https://etiennel.app.n8n.cloud
 *   N8N_API_KEY       e.g. eyJhbGciOiJI...
 *   PORT              default 9876
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = parseInt(process.env.PORT || '9876', 10);
const N8N_HOST = process.env.N8N_HOST || 'https://etiennel.app.n8n.cloud';
const N8N_API_KEY = process.env.N8N_API_KEY || '';

// ---------------------------------------------------------------------------
// Fetch real workflows from n8n API
// ---------------------------------------------------------------------------

async function fetchN8nWorkflows() {
    if (!N8N_API_KEY) {
        console.warn('[server] N8N_API_KEY not set — using mock data');
        return null;
    }

    try {
        console.log(`[server] Fetching workflows from ${N8N_HOST}...`);
        const res = await fetch(`${N8N_HOST}/api/v1/workflows`, {
            headers: {
                'X-N8N-API-KEY': N8N_API_KEY,
                'Accept': 'application/json',
            },
        });

        if (!res.ok) {
            console.warn(`[server] n8n API returned ${res.status} — using mock data`);
            return null;
        }

        const data = await res.json();
        const workflows = (data.data || []).map(w => ({
            id: String(w.id),
            name: w.name || 'Unnamed workflow',
            active: w.active ?? false,
            isArchived: w.settings?.executionMode === 'queue', // n8n archived = settings flag
            status: 'CLOUD-ONLY', // No local file info from API
            filename: undefined,
        }));

        console.log(`[server] Fetched ${workflows.length} workflows from n8n`);
        return workflows;
    } catch (err) {
        console.warn(`[server] Failed to fetch from n8n: ${err.message} — using mock data`);
        return null;
    }
}

// Fallback mock data (realistic n8n workflow names)
const MOCK_WORKFLOWS = [
    { id: 'wf1', name: 'Email Parser', filename: 'email-parser.workflow.ts', active: true, status: 'TRACKED', isArchived: false },
    { id: 'wf2', name: 'GitHub Trigger', filename: 'github-trigger.workflow.ts', active: true, status: 'CONFLICT', isArchived: false },
    { id: 'wf3', name: 'Daily Report', filename: 'daily-report.workflow.ts', active: false, status: 'MODIFIED-LOCAL', isArchived: false },
    { id: 'wf4', name: 'Old Backup', filename: 'old-backup.workflow.ts', active: false, status: 'TRACKED', isArchived: true },
    { id: 'wf5', name: 'Legacy Import', filename: 'legacy-import.workflow.ts', active: false, status: 'LOCAL-ONLY', isArchived: true },
    { id: 'wf6', name: 'Newsletter', filename: 'newsletter.workflow.ts', active: true, status: 'CLOUD-ONLY', isArchived: false },
];

// ---------------------------------------------------------------------------
// HTML builder (mirrors ScreenshotPanel.buildHtml)
// ---------------------------------------------------------------------------

function buildHtml({ filter, workflows, initialized = true } = {}) {
    const f = filter || 'workflows';
    const filterLabels = { workflows: 'Workflows', archived: 'Archived', all: 'All' };
    const isInit = initialized !== false;

    let displayed = workflows;
    if (f === 'workflows') displayed = workflows.filter(w => !w.isArchived);
    else if (f === 'archived') displayed = workflows.filter(w => w.isArchived);

    const iconForStatus = {
        TRACKED: '$(file)',
        CONFLICT: '$(alert)',
        'MODIFIED-LOCAL': '$(diff-modified)',
        'MODIFIED-REMOTE': '$(diff-modified)',
        'LOCAL-ONLY': '$(file-add)',
        'CLOUD-ONLY': '$(cloud)',
    };

    const workflowRows = displayed.length === 0
        ? '<tr><td colspan="3" style="padding:12px;color:#888;font-style:italic">No workflows</td></tr>'
        : displayed.map(wf => {
            const badge = wf.isArchived
                ? '<span style="background:#7a3a10;color:#fff;padding:1px 6px;border-radius:3px;font-size:11px">archived</span>'
                : '<span style="background:#2d5a2d;color:#7ff7af;padding:1px 6px;border-radius:3px;font-size:11px">active</span>';
            const icon = iconForStatus[wf.status] ?? '$(file)';
            const name = wf.name || wf.filename || '?';
            return `<tr><td style="padding:6px 12px;font-size:14px">${icon}</td><td style="padding:6px 12px">${name}</td><td style="padding:6px 12px;text-align:right">${badge}</td></tr>`;
        }).join('');

    const filterButtons = (['workflows', 'archived', 'all']).map(ff => {
        const active = f === ff;
        const style = active ? 'background:#4a3f6b;border-color:#9b8fc4' : 'background:#2a2a3a;border-color:#555';
        return `<button class="filter-btn" data-filter="${ff}" style="padding:4px 12px;border-radius:4px;color:#e0e0e0;cursor:pointer;font-size:12px;border:1px solid;${style}">${filterLabels[ff]}</button>`;
    }).join(' ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e2e; color: #cdd6f4; padding: 16px; min-width: 420px; }
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
  .source-tag { font-size: 10px; padding: 1px 5px; border-radius: 3px; background: #333; color: #aaa; }
</style>
</head>
<body>
  <h2>⚡ n8n Workflow Explorer <span class="badge">v1.0.0</span></h2>
  <div class="filter-bar">${filterButtons}</div>
  <table>
    <thead><tr><th style="width:24px"></th><th>Name</th><th style="text-align:right">Status</th></tr></thead>
    <tbody>${workflowRows}</tbody>
  </table>
  <div class="state-bar">
    <span><span class="state-dot ${isInit ? '' : 'offline'}"></span> ${isInit ? 'Initialized' : 'Not initialized'}</span>
    <span>Filter: <strong>${filterLabels[f]}</strong></span>
    <span>${displayed.length} workflow${displayed.length !== 1 ? 's' : ''}</span>
  </div>
  <script>
    document.querySelectorAll('button.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-filter');
        document.querySelectorAll('button.filter-btn').forEach(b => {
          b.style.background = b === btn ? '#4a3f6b' : '#2a2a3a';
          b.style.borderColor = b === btn ? '#9b8fc4' : '#555';
        });
        window.location.href = 'http://localhost:${PORT}/?filter=' + filter;
      });
    });
    window.getState = () => ({ filter: '${f}', workflowCount: ${displayed.length}, initialized: ${isInit} });
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Bootstrap: load real workflows then start server
// ---------------------------------------------------------------------------

let WORKFLOWS = MOCK_WORKFLOWS;

async function main() {
    const realWorkflows = await fetchN8nWorkflows();
    if (realWorkflows && realWorkflows.length > 0) {
        WORKFLOWS = realWorkflows;
        console.log(`[server] Using ${WORKFLOWS.length} real workflows from n8n`);
    }

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const filter = url.searchParams.get('filter') || 'workflows';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(buildHtml({ filter, workflows: WORKFLOWS }));
    });

    server.listen(PORT, () => {
        console.log(`[server] n8nac screenshot panel running at http://localhost:${PORT}`);
        console.log(`[server] ${WORKFLOWS.length} workflows loaded`);
        console.log(`[server] Filters: ?filter=workflows | ?filter=archived | ?filter=all`);
    });

    process.on('SIGTERM', () => { server.close(); process.exit(0); });
    process.on('SIGINT', () => { server.close(); process.exit(0); });
}

main().catch(err => {
    console.error('[server] Fatal:', err);
    process.exit(1);
});