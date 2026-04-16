/**
 * Minimal HTTP server that serves the screenshot panel HTML.
 * Playwright navigates to http://localhost:PORT and interacts with the page.
 *
 * This mirrors what ScreenshotPanel.buildHtml() renders, but as a standalone
 * HTTP page so we don't need a full VS Code instance to test the UI.
 *
 * Run: node tests/e2e/server.cjs
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9876;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_WORKFLOWS = [
    { id: 'wf1', name: 'Email Parser', filename: 'email-parser.workflow.ts', active: true, status: 'TRACKED', isArchived: false },
    { id: 'wf2', name: 'GitHub Trigger', filename: 'github-trigger.workflow.ts', active: true, status: 'CONFLICT', isArchived: false },
    { id: 'wf3', name: 'Daily Report', filename: 'daily-report.workflow.ts', active: false, status: 'MODIFIED-LOCAL', isArchived: false },
    { id: 'wf4', name: 'Old Backup', filename: 'old-backup.workflow.ts', active: false, status: 'TRACKED', isArchived: true },
    { id: 'wf5', name: 'Legacy Import', filename: 'legacy-import.workflow.ts', active: false, status: 'LOCAL-ONLY', isArchived: true },
    { id: 'wf6', name: 'Newsletter', filename: 'newsletter.workflow.ts', active: true, status: 'CLOUD-ONLY', isArchived: false },
];

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

function buildHtml({ filter, workflows, initialized = true } = {}) {
    const f = filter || 'workflows';
    const filterLabels = { workflows: 'Workflows', archived: 'Archived', all: 'All' };
    const isInit = initialized !== false;

    // Apply filter to workflows
    let displayed = workflows;
    if (f === 'workflows') displayed = workflows.filter(w => !w.isArchived);
    else if (f === 'archived') displayed = workflows.filter(w => w.isArchived);

    const dotColor = {
        TRACKED: '#7ff7af', CONFLICT: '#ff7a7a', 'MODIFIED-LOCAL': '#ffe066',
        'MODIFIED-REMOTE': '#66b3ff', 'LOCAL-ONLY': '#b3b3b3', 'CLOUD-ONLY': '#66b3ff',
    };

    const workflowRows = displayed.length === 0
        ? '<tr><td colspan="3" style="padding:12px;color:#888;font-style:italic">No workflows</td></tr>'
        : displayed.map(wf => {
            const badge = wf.isArchived
                ? '<span style="background:#7a3a10;color:#fff;padding:1px 6px;border-radius:3px;font-size:11px">archived</span>'
                : '<span style="background:#2d5a2d;color:#7ff7af;padding:1px 6px;border-radius:3px;font-size:11px">active</span>';
            const dot = `<span style="color:${dotColor[wf.status] ?? '#888'};font-size:16px">●</span>`;
            return `<tr><td style="padding:6px 12px">${dot}</td><td style="padding:6px 12px">${wf.name}</td><td style="padding:6px 12px;text-align:right">${badge}</td></tr>`;
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
        // Update button styles
        document.querySelectorAll('button.filter-btn').forEach(b => {
          b.style.background = b === btn ? '#4a3f6b' : '#2a2a3a';
          b.style.borderColor = b === btn ? '#9b8fc4' : '#555';
        });
        // Reload with new filter
        window.location.href = 'http://localhost:${PORT}/?filter=' + filter;
      });
    });
    window.getState = () => ({ filter: '${f}', workflowCount: ${displayed.length}, initialized: ${isInit} });
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const filter = url.searchParams.get('filter') || 'active';

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buildHtml({ filter, workflows: MOCK_WORKFLOWS }));
});

server.listen(PORT, () => {
    console.log(`[server] n8nac screenshot panel running at http://localhost:${PORT}`);
    console.log(`[server] Available filters: ?filter=active | ?filter=archived | ?filter=all`);
});

process.on('SIGTERM', () => { server.close(); process.exit(0); });
process.on('SIGINT', () => { server.close(); process.exit(0); });
