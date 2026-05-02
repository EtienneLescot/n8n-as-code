export interface AgentManagerHtmlInput {
    provider: string;
    model?: string;
    baseUrl?: string;
    hasStoredApiKey: boolean;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
}

export function buildAgentManagerHtml(input: AgentManagerHtmlInput): string {
    const nonce = getNonce();
    const provider = escapeHtml(input.provider);
    const model = escapeHtml(input.model || 'provider default');
    const baseUrl = escapeHtml(input.baseUrl || 'provider default');
    const keyStatus = input.hasStoredApiKey ? 'Stored in VS Code Secret Storage' : 'Not stored yet';
    const profiles = [
        ['Workflow Architect', 'Design, generate, validate, and refactor workflows.'],
        ['Workflow Operator', 'Push, activate, execute, and inspect workflows after approval.'],
        ['Workflow Debugger', 'Diagnose failed executions and repair workflow code.'],
        ['Credential Assistant', 'Guide and provision credentials through n8n-manager APIs.'],
    ];

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>n8n Agent Manager</title>
    <style>
        :root {
            --bg: var(--vscode-editor-background, #1e1e1e);
            --panel: var(--vscode-sideBar-background, #181818);
            --text: var(--vscode-editor-foreground, #d4d4d4);
            --muted: var(--vscode-descriptionForeground, #8b949e);
            --border: var(--vscode-panel-border, #2f3337);
            --accent: var(--vscode-button-background, #0e639c);
            --accent-text: var(--vscode-button-foreground, #ffffff);
        }
        body {
            margin: 0;
            background: var(--bg);
            color: var(--text);
            font-family: var(--vscode-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
        }
        main {
            max-width: 980px;
            margin: 0 auto;
            padding: 28px;
        }
        .hero {
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 22px;
            background: linear-gradient(135deg, color-mix(in srgb, var(--panel) 84%, var(--accent)), var(--panel));
        }
        .kicker {
            color: var(--muted);
            font-size: 11px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }
        h1 {
            margin: 8px 0 8px;
            font-size: 28px;
        }
        p {
            color: var(--muted);
            line-height: 1.5;
        }
        .actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 16px;
        }
        button {
            border: none;
            border-radius: 8px;
            padding: 9px 12px;
            color: var(--accent-text);
            background: var(--accent);
            cursor: pointer;
            font: inherit;
        }
        button.secondary {
            color: var(--vscode-button-secondaryForeground, var(--text));
            background: var(--vscode-button-secondaryBackground, #3a3d41);
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 12px;
            margin-top: 18px;
        }
        .card {
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 14px;
            background: var(--panel);
        }
        .card h2 {
            font-size: 15px;
            margin: 0 0 8px;
        }
        .meta {
            display: grid;
            gap: 8px;
            margin-top: 16px;
            color: var(--muted);
            font-size: 13px;
        }
        code {
            color: var(--text);
        }
    </style>
</head>
<body>
    <main>
        <section class="hero">
            <div class="kicker">n8n Agent Manager</div>
            <h1>Embedded workflow agents</h1>
            <p>Manage the first-party agents that power the n8n Agent Workbench. Built-in profiles are read-only for now; custom profile editing will build on this surface.</p>
            <div class="meta">
                <div>Provider: <code>${provider}</code></div>
                <div>Model: <code>${model}</code></div>
                <div>Base URL: <code>${baseUrl}</code></div>
                <div>API key: <code>${keyStatus}</code></div>
            </div>
            <div class="actions">
                <button id="set-key" type="button">Set Provider API Key</button>
                <button id="open-settings" class="secondary" type="button">Open Agent Settings</button>
            </div>
        </section>
        <section class="grid">
            ${profiles.map(([name, description]) => `
            <article class="card">
                <h2>${escapeHtml(name)}</h2>
                <p>${escapeHtml(description)}</p>
            </article>`).join('')}
        </section>
    </main>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        document.getElementById('set-key').addEventListener('click', () => vscode.postMessage({ type: 'setApiKey' }));
        document.getElementById('open-settings').addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));
    </script>
</body>
</html>`;
}
