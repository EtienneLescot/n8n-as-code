export interface AgentWorkbenchHtmlInput {
    workflowId: string;
    workflowName: string;
    workflowUrl?: string;
    workflowReloadUrl?: string;
    providerModelLabel: string;
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

export function buildAgentWorkbenchHtml(input: AgentWorkbenchHtmlInput): string {
    const nonce = getNonce();
    const hasWorkflow = Boolean(input.workflowUrl);
    const safeWorkflowName = escapeHtml(input.workflowName);
    const safeWorkflowId = escapeHtml(input.workflowId);
    const initialWorkflowLabel = hasWorkflow ? safeWorkflowName : 'New workflow chat';
    const safeWorkflowUrl = escapeHtml(input.workflowUrl || '');
    const safeProviderModelLabel = escapeHtml(input.providerModelLabel);
    const workflowIdJs = JSON.stringify(input.workflowId);
    const workflowUrlJs = JSON.stringify(input.workflowUrl || '');
    const workflowReloadUrlJs = JSON.stringify(input.workflowReloadUrl || input.workflowUrl || '');

    let iframePermissionOrigin = 'src';
    try {
        iframePermissionOrigin = input.workflowUrl ? new URL(input.workflowUrl).origin : 'src';
    } catch {
        // Fallback to iframe's own source origin behavior if URL parsing fails.
    }
    const iframeAllowPolicy = `clipboard-read ${iframePermissionOrigin}; clipboard-write ${iframePermissionOrigin}; geolocation ${iframePermissionOrigin}; microphone ${iframePermissionOrigin}; camera ${iframePermissionOrigin}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src *; connect-src *; img-src * data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>n8n Agent Workbench: ${safeWorkflowName}</title>
    <style>
        :root {
            color-scheme: light dark;
            --border: var(--vscode-panel-border, #2f3337);
            --muted: var(--vscode-descriptionForeground, #8b949e);
            --bg: var(--vscode-editor-background, #1e1e1e);
            --panel: var(--vscode-sideBar-background, #181818);
            --elevated: color-mix(in srgb, var(--panel) 88%, white 4%);
            --text: var(--vscode-editor-foreground, #d4d4d4);
            --accent: var(--vscode-button-background, #0e639c);
            --accent-text: var(--vscode-button-foreground, #ffffff);
            --input: var(--vscode-input-background, #2a2a2a);
            --success: var(--vscode-testing-iconPassed, #3fb950);
            --error: var(--vscode-errorForeground, #f85149);
            --warning: var(--vscode-editorWarning-foreground, #d29922);
        }
        html, body {
            height: 100%;
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: var(--bg);
            color: var(--text);
            font-family: var(--vscode-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
        }
        * { box-sizing: border-box; }
        button, input, select, textarea { font: inherit; }
        .workbench {
            display: grid;
            grid-template-columns: ${hasWorkflow ? 'minmax(360px, .95fr) minmax(420px, 1.05fr)' : 'minmax(420px, 1fr)'};
            height: 100vh;
            width: 100vw;
            min-width: 0;
            min-height: 0;
        }
        .chat {
            min-width: 0;
            min-height: 0;
            background: var(--panel);
        }
        .chat {
            display: grid;
            grid-template-rows: auto 1fr auto;
            border-right: ${hasWorkflow ? '1px solid var(--border)' : '0'};
        }
        .workflow {
            position: relative;
            min-width: 0;
            min-height: 0;
            background: var(--bg);
        }
        .chat-head {
            padding: 12px 14px;
        }
        .chat-head {
            border-bottom: 1px solid var(--border);
        }
        .chat-title {
            font-size: 14px;
            font-weight: 700;
        }
        .chat-subtitle, .meta-text {
            color: var(--muted);
            font-size: 12px;
            line-height: 1.4;
        }
        .toolbar {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 10px;
        }
        .toolbar.compact {
            margin-top: 0;
        }
        .meta-grid {
            display: grid;
            gap: 6px;
        }
        .meta-row {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            align-items: baseline;
        }
        .meta-row code {
            color: var(--text);
            overflow-wrap: anywhere;
        }
        .sessions {
            overflow: auto;
            min-height: 0;
            padding: 8px 0 0;
            display: grid;
            gap: 8px;
        }
        .session-item {
            border: 1px solid var(--border);
            border-radius: 10px;
            background: color-mix(in srgb, var(--bg) 82%, transparent);
            padding: 10px;
            display: grid;
            gap: 6px;
            cursor: pointer;
        }
        .session-item.active {
            border-color: color-mix(in srgb, var(--accent) 58%, var(--border));
            box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 42%, transparent);
        }
        .session-item-head {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            align-items: flex-start;
        }
        .session-item-title {
            font-size: 13px;
            font-weight: 650;
            line-height: 1.35;
            overflow-wrap: anywhere;
        }
        .session-item-badges {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            justify-content: flex-end;
        }
        .badge {
            border: 1px solid var(--border);
            border-radius: 999px;
            padding: 2px 7px;
            font-size: 11px;
            color: var(--muted);
        }
        .badge.active {
            color: var(--accent-text);
            background: var(--accent);
            border-color: var(--accent);
        }
        .badge.error {
            color: var(--error);
            border-color: color-mix(in srgb, var(--error) 55%, var(--border));
        }
        .badge.success {
            color: var(--success);
            border-color: color-mix(in srgb, var(--success) 55%, var(--border));
        }
        .session-item-foot {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            color: var(--muted);
            font-size: 11px;
        }
        .history-overlay {
            position: fixed;
            inset: 0;
            z-index: 10;
            display: none;
            align-items: flex-start;
            justify-content: center;
            padding-top: 42px;
            background: rgba(0, 0, 0, .28);
        }
        .history-overlay.open { display: flex; }
        .history-modal {
            width: min(560px, calc(100vw - 28px));
            max-height: min(640px, calc(100vh - 84px));
            display: grid;
            grid-template-rows: auto auto 1fr auto;
            border: 1px solid var(--border);
            border-radius: 12px;
            background: color-mix(in srgb, var(--panel) 96%, black 8%);
            box-shadow: 0 18px 48px rgba(0, 0, 0, .45);
            overflow: hidden;
        }
        .history-head,
        .history-controls,
        .history-foot {
            padding: 12px;
            border-bottom: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
        }
        .history-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
        }
        .history-title {
            font-size: 14px;
            font-weight: 650;
        }
        .history-list {
            overflow: auto;
            min-height: 0;
            padding: 10px 12px;
        }
        .history-foot {
            border-bottom: 0;
            border-top: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }
        .chat-head {
            display: grid;
            gap: 10px;
        }
        .chat-head-row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            align-items: center;
        }
        .chat-head-main {
            min-width: 0;
            display: grid;
            gap: 4px;
        }
        .workflow-selector {
            width: fit-content;
            max-width: 100%;
            min-height: 0;
            padding: 0;
            color: var(--muted);
            background: transparent;
            border: 0;
            border-radius: 0;
            text-align: left;
            font-size: 12px;
            line-height: 1.4;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .workflow-selector:hover {
            color: var(--text);
            text-decoration: underline;
        }
        .header-actions {
            display: flex;
            gap: 8px;
            align-items: center;
            justify-content: flex-end;
            min-width: 0;
        }
        .run-indicator {
            display: none;
            width: 15px;
            height: 15px;
            grid-template-columns: repeat(3, 1fr);
            gap: 2px;
            align-items: center;
            margin-top: 2px;
        }
        .run-indicator.active { display: grid; }
        .run-indicator span {
            width: 3px;
            height: 3px;
            background: var(--muted);
            opacity: .35;
            animation: pixelPulse 900ms infinite ease-in-out;
        }
        .run-indicator span:nth-child(2) { animation-delay: 90ms; }
        .run-indicator span:nth-child(3) { animation-delay: 180ms; }
        .run-indicator span:nth-child(4) { animation-delay: 270ms; }
        .run-indicator span:nth-child(5) { animation-delay: 360ms; background: var(--accent); }
        .run-indicator span:nth-child(6) { animation-delay: 450ms; }
        .run-indicator span:nth-child(7) { animation-delay: 540ms; }
        .run-indicator span:nth-child(8) { animation-delay: 630ms; }
        .run-indicator span:nth-child(9) { animation-delay: 720ms; }
        @keyframes pixelPulse {
            0%, 100% { opacity: .25; transform: scale(.8); }
            50% { opacity: 1; transform: scale(1.15); }
        }
        .chat-meta {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            align-items: center;
        }
        .context-pill {
            display: none;
            gap: 7px;
            align-items: center;
            max-width: 230px;
            border: 1px solid var(--border);
            border-radius: 999px;
            padding: 4px 8px;
            color: var(--muted);
            font-size: 12px;
            line-height: 1.2;
            white-space: nowrap;
        }
        .context-pill.active { display: inline-flex; }
        .context-meter {
            width: 42px;
            height: 4px;
            border-radius: 999px;
            background: color-mix(in srgb, var(--border) 70%, transparent);
            overflow: hidden;
        }
        .context-meter-fill {
            display: block;
            width: 0;
            height: 100%;
            background: var(--accent);
        }
        .feed {
            overflow: auto;
            min-height: 0;
            padding: 14px 14px 8px;
            display: grid;
            gap: 10px;
            align-content: start;
        }
        .entry {
            border: 1px solid var(--border);
            border-radius: 12px;
            background: color-mix(in srgb, var(--bg) 84%, transparent);
            padding: 10px 11px;
            white-space: pre-wrap;
            line-height: 1.45;
            font-size: 13px;
            overflow-wrap: anywhere;
        }
        .entry.user { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); }
        .entry.system { color: var(--muted); }
        .entry.assistant.streaming { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent); }
        .entry.operation, .entry.compaction, .entry.context { background: color-mix(in srgb, var(--elevated) 90%, transparent); }
        .entry-head {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            align-items: center;
            margin-bottom: 6px;
        }
        .entry-title {
            display: flex;
            gap: 8px;
            align-items: center;
            font-weight: 650;
        }
        .entry-subtle {
            color: var(--muted);
            font-size: 11px;
        }
        .entry-status {
            color: var(--muted);
            font-size: 11px;
        }
        .entry-status.running { color: var(--warning); }
        .entry-status.done { color: var(--success); }
        .entry-status.error { color: var(--error); }
        .details {
            margin-top: 8px;
            border-top: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
            padding-top: 8px;
        }
        .details summary {
            cursor: pointer;
            color: var(--muted);
            font-size: 12px;
        }
        .details-body {
            margin-top: 8px;
            padding: 8px;
            border-radius: 8px;
            background: color-mix(in srgb, var(--bg) 76%, transparent);
            white-space: pre-wrap;
            font-family: var(--vscode-editor-font-family, var(--vscode-font-family, monospace));
            font-size: 12px;
        }
        .composer {
            display: grid;
            gap: 6px;
            margin: 8px 12px 12px;
            padding: 8px;
            border: 1px solid var(--vscode-input-border, var(--border));
            border-radius: 8px;
            background: var(--input);
            box-shadow: 0 0 0 1px color-mix(in srgb, var(--border) 45%, transparent);
        }
        .composer-input {
            display: grid;
            gap: 4px;
            min-width: 0;
        }
        .composer-meta {
            display: flex;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
        }
        .composer-toolbar {
            display: flex;
            gap: 8px;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            min-height: 30px;
        }
        .composer-provider {
            display: flex;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
            min-width: 0;
        }
        .node-context-badge {
            display: none;
            width: fit-content;
            max-width: 100%;
            padding: 3px 8px;
            border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
            border-radius: 999px;
            color: var(--accent-text);
            background: color-mix(in srgb, var(--accent) 60%, transparent);
            font-size: 12px;
            line-height: 1.25;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .composer-actions {
            display: flex;
            gap: 8px;
            align-items: center;
            margin-left: auto;
        }
        textarea, input[type="text"], select {
            width: 100%;
            min-height: 36px;
            border: 1px solid var(--vscode-input-border, transparent);
            border-radius: 8px;
            background: var(--input);
            color: var(--text);
            padding: 9px 10px;
            outline: none;
        }
        textarea {
            resize: none;
            min-height: 72px;
            max-height: 160px;
            line-height: 1.4;
            border: 0;
            border-radius: 0;
            background: transparent;
            padding: 4px 2px;
        }
        button {
            border: none;
            border-radius: 8px;
            padding: 8px 11px;
            color: var(--accent-text);
            background: var(--accent);
            cursor: pointer;
        }
        button.secondary {
            color: var(--vscode-button-secondaryForeground, var(--text));
            background: var(--vscode-button-secondaryBackground, #3a3d41);
        }
        button.ghost {
            color: var(--muted);
            background: transparent;
            border: 1px solid var(--border);
        }
        button.small {
            padding: 5px 8px;
            font-size: 12px;
            min-height: 30px;
        }
        .composer button.small,
        .composer .send-button,
        .composer .stop-button {
            min-height: 28px;
            padding: 4px 8px;
            border-radius: 6px;
        }
        .send-button {
            min-width: 30px;
            font-size: 13px;
            line-height: 1;
        }
        .stop-button {
            display: none;
        }
        .stop-button.active {
            display: inline-block;
        }
        button:disabled {
            cursor: not-allowed;
            opacity: .55;
        }
        .session-item {
            color: var(--text);
            text-align: left;
            background: color-mix(in srgb, var(--bg) 82%, transparent);
            border: 1px solid var(--border);
        }
        iframe {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            border: 0;
        }
        .empty-workflow {
            position: absolute;
            inset: 0;
            display: grid;
            place-items: center;
            padding: 24px;
            text-align: center;
            color: var(--muted);
        }
        .refresh-pill {
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 2;
            display: none;
            padding: 5px 9px;
            border-radius: 999px;
            background: var(--accent);
            color: var(--accent-text);
            font-size: 12px;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
        }
        .empty-note {
            color: var(--muted);
            font-size: 12px;
            line-height: 1.5;
            padding: 12px 14px;
        }
        @media (max-width: 1200px) {
            .workbench {
                grid-template-columns: 1fr;
                grid-template-rows: ${hasWorkflow ? 'minmax(360px, 48%) 1fr' : '1fr'};
            }
            .chat {
                border-right: 0;
            }
            .workflow {
                grid-column: 1 / -1;
                border-top: 1px solid var(--border);
            }
        }
        @media (max-width: 900px) {
            .workbench {
                grid-template-columns: 1fr;
                grid-template-rows: auto ${hasWorkflow ? 'minmax(280px, 42%)' : ''};
            }
            .chat {
                border-right: 0;
                border-bottom: 1px solid var(--border);
            }
            .composer { margin: 8px; }
        }
    </style>
</head>
<body>
    <main id="workbench" class="workbench">
        <section class="chat" aria-label="Agent chat">
            <header class="chat-head">
                <div class="chat-head-row">
                    <div class="chat-head-main">
                        <div class="chat-title">Workflow Architect</div>
                        <button id="workflow-selector" class="workflow-selector" type="button" title="${initialWorkflowLabel}">${initialWorkflowLabel}${safeWorkflowId ? ` · ${safeWorkflowId}` : ''}</button>
                    </div>
                    <div class="header-actions">
                        <button id="history-open" class="ghost small" type="button" title="Conversation history">History</button>
                        <div id="context-pill" class="context-pill" title="Context usage">
                            <span id="context-label">Context</span>
                            <span class="context-meter" aria-hidden="true"><span id="context-meter-fill" class="context-meter-fill"></span></span>
                        </div>
                        <button id="compact-context" class="ghost small" type="button" title="Compact context" aria-label="Compact context">Compact</button>
                        <div id="run-indicator" class="run-indicator" aria-label="Agent running" title="Agent running">
                            <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
                        </div>
                    </div>
                </div>
            </header>
            <div id="feed" class="feed"></div>
            <form id="composer" class="composer">
                <div class="composer-input">
                    <div class="composer-meta">
                        <div id="node-context-badge" class="node-context-badge" title=""></div>
                    </div>
                    <textarea id="prompt" placeholder="Ask the n8n agent what to do with this workflow..." rows="2"></textarea>
                    <div class="composer-toolbar">
                        <div class="composer-provider">
                            <button id="select-model" class="secondary small" type="button" title="${safeProviderModelLabel}">${safeProviderModelLabel}</button>
                            <button id="select-reasoning" class="secondary small" type="button">Reasoning</button>
                        </div>
                        <div class="composer-actions">
                            <button id="stop" class="ghost stop-button" type="button" disabled>Stop</button>
                            <button id="send" class="send-button" type="submit" title="Send" aria-label="Send">▶</button>
                        </div>
                    </div>
                </div>
            </form>
        </section>
        ${hasWorkflow ? `<section class="workflow" aria-label="n8n workflow">
            <div id="refresh-pill" class="refresh-pill">Refreshing n8n...</div>
            <iframe
                id="workflow-frame"
                src="${safeWorkflowUrl}"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation allow-top-navigation-by-user-activation"
                allow="${iframeAllowPolicy}">
            </iframe>
        </section>` : ''}
        <div id="history-overlay" class="history-overlay" role="dialog" aria-modal="true" aria-label="Conversation history">
            <div class="history-modal">
                <div class="history-head">
                    <div>
                        <div class="history-title">Conversation History</div>
                        <div class="meta-text">Open a previous chat or start a new one.</div>
                    </div>
                    <button id="history-close" class="ghost small" type="button" aria-label="Close history">Close</button>
                </div>
                <div class="history-controls">
                    <select id="session-filter" aria-label="Filter conversations">
                        <option value="current">Current workflow</option>
                        <option value="all">All conversations</option>
                        <option value="unattached">New workflow chats</option>
                    </select>
                </div>
                <div id="session-list" class="sessions history-list"></div>
                <div class="history-foot">
                    <button id="new-session" class="secondary small" type="button">New chat</button>
                </div>
            </div>
        </div>
    </main>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let workflowId = ${workflowIdJs};
        let workflowUrl = ${workflowUrlJs};
        let workflowReloadUrl = ${workflowReloadUrlJs};
        let iframeOrigin = ${JSON.stringify(iframePermissionOrigin)};
        const PASTE_RATE_LIMIT_MS = 1000;
        const GRANT_TTL_MS = 5000;
        let lastPasteMs = 0;
        const pendingGrants = new Map();
        let isRunning = false;
        let currentNodeContext = null;
        let activeFilter = 'current';
        let state = null;

        const OP_ICONS = {
            'file-read': 'Read',
            'file-write': 'Write',
            shell: 'Shell',
            web: 'Web',
            tool: 'Tool',
            agent: 'Agent',
            phase: 'Phase',
            thinking: 'Thinking'
        };

        const feed = document.getElementById('feed');
        const form = document.getElementById('composer');
        const promptInput = document.getElementById('prompt');
        const sendButton = document.getElementById('send');
        const stopButton = document.getElementById('stop');
        const selectModelButton = document.getElementById('select-model');
        const selectReasoningButton = document.getElementById('select-reasoning');
        const frame = document.getElementById('workflow-frame');
        const refreshPill = document.getElementById('refresh-pill');
        const nodeContextBadge = document.getElementById('node-context-badge');
        const sessionList = document.getElementById('session-list');
        const sessionFilter = document.getElementById('session-filter');
        const workflowSelector = document.getElementById('workflow-selector');
        const contextPill = document.getElementById('context-pill');
        const contextLabel = document.getElementById('context-label');
        const contextMeterFill = document.getElementById('context-meter-fill');
        const newSessionButton = document.getElementById('new-session');
        const historyOpenButton = document.getElementById('history-open');
        const historyCloseButton = document.getElementById('history-close');
        const historyOverlay = document.getElementById('history-overlay');
        const runIndicator = document.getElementById('run-indicator');
        const compactContextButton = document.getElementById('compact-context');

        function setRunning(running) {
            isRunning = running;
            sendButton.disabled = running;
            stopButton.disabled = !running;
            stopButton.classList.toggle('active', running);
            newSessionButton.disabled = running;
            compactContextButton.disabled = running;
            if (runIndicator) runIndicator.classList.toggle('active', running);
        }

        function escapeText(value) {
            return value == null ? '' : String(value);
        }

        function escapeHtml(value) {
            return escapeText(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function formatDate(value) {
            try { return new Date(value).toLocaleString(); } catch (e) { return String(value || ''); }
        }

        function sanitizeNodeContext(value) {
            if (!value || typeof value !== 'object') return null;
            const name = typeof value.name === 'string' ? value.name.trim() : '';
            if (!name) return null;
            return {
                name,
                type: typeof value.type === 'string' ? value.type.trim() : '',
                id: typeof value.id === 'string' ? value.id.trim() : '',
            };
        }

        function updateNodeContextBadge(node) {
            currentNodeContext = sanitizeNodeContext(node);
            if (!nodeContextBadge) return;
            if (!currentNodeContext) {
                nodeContextBadge.style.display = 'none';
                nodeContextBadge.textContent = '';
                nodeContextBadge.title = '';
                return;
            }
            nodeContextBadge.textContent = '@' + currentNodeContext.name;
            nodeContextBadge.title = currentNodeContext.type
                ? currentNodeContext.name + ' · ' + currentNodeContext.type
                : currentNodeContext.name;
            nodeContextBadge.style.display = 'block';
        }

        function isWorkflowFrameEvent(event) {
            if (!frame || event.source !== frame.contentWindow) return false;
            return event.origin === iframeOrigin || event.origin === 'null';
        }

        function reloadWorkflowFrame() {
            if (!frame || !refreshPill) return;
            refreshPill.style.display = 'block';
            const currentSrc = workflowReloadUrl || frame.src || workflowUrl;
            frame.onload = () => {
                refreshPill.style.display = 'none';
                frame.onload = null;
            };
            try {
                const reloadUrl = new URL(currentSrc);
                reloadUrl.searchParams.set('_n8nacRefresh', String(Date.now()));
                frame.src = reloadUrl.toString();
            } catch (e) {
                frame.src = currentSrc;
            }
        }

        function issuePasteGrant() {
            const token = crypto.randomUUID();
            pendingGrants.set(token, Date.now() + GRANT_TTL_MS);
            setTimeout(() => pendingGrants.delete(token), GRANT_TTL_MS);
            return token;
        }

        function consumeGrant(token) {
            const expiry = pendingGrants.get(token);
            if (!expiry || Date.now() > expiry) return false;
            pendingGrants.delete(token);
            return true;
        }

        function filteredSessions() {
            const sessions = (state && state.sessions) || [];
            if (activeFilter === 'all') return sessions;
            if (activeFilter === 'unattached') return sessions.filter((session) => !session.workflowId);
            return sessions.filter((session) => {
                if (!workflowId) return !session.workflowId;
                return session.workflowId === workflowId;
            });
        }

        function getActiveSession() {
            return state && state.session ? state.session : null;
        }

        function renderSessions() {
            sessionList.innerHTML = '';
            const sessions = filteredSessions();
            if (!sessions.length) {
                const empty = document.createElement('div');
                empty.className = 'empty-note';
                empty.textContent = activeFilter === 'all'
                    ? 'No sessions yet.'
                    : activeFilter === 'unattached'
                        ? 'No new workflow chats.'
                        : 'No sessions for this workflow yet.';
                sessionList.appendChild(empty);
                return;
            }

            for (const session of sessions) {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'session-item' + (session.isActive ? ' active' : '');
                item.addEventListener('click', () => {
                    closeHistory();
                    vscode.postMessage({ type: 'agent.session.select', sessionId: session.id });
                });

                const head = document.createElement('div');
                head.className = 'session-item-head';
                const title = document.createElement('div');
                title.className = 'session-item-title';
                title.textContent = session.title;

                const badges = document.createElement('div');
                badges.className = 'session-item-badges';
                if (session.isActive) badges.appendChild(badge('Active', 'active'));
                if (session.checkpointCount) badges.appendChild(badge(session.checkpointCount + ' cp', 'success'));
                if (session.totalCompactions) badges.appendChild(badge(session.totalCompactions + ' compact', ''));
                head.append(title, badges);

                const foot = document.createElement('div');
                foot.className = 'session-item-foot';
                const attachment = document.createElement('span');
                attachment.textContent = session.workflowLabel;
                const updated = document.createElement('span');
                updated.textContent = formatDate(session.updatedAt);
                foot.append(attachment, updated);

                item.append(head, foot);
                sessionList.appendChild(item);
            }
        }

        function badge(text, klass) {
            const el = document.createElement('span');
            el.className = 'badge' + (klass ? ' ' + klass : '');
            el.textContent = text;
            return el;
        }

        function openHistory() {
            renderSessions();
            historyOverlay.classList.add('open');
        }

        function closeHistory() {
            historyOverlay.classList.remove('open');
        }

        function renderChatMeta() {
            if (!state) return;
            const providerLabel = (state.provider || 'provider') + (state.model ? ' / ' + state.model : '');
            selectModelButton.textContent = providerLabel;
            selectModelButton.title = providerLabel;
            selectReasoningButton.textContent = state.reasoningEffort ? 'Reasoning ' + state.reasoningEffort : 'Reasoning';
            selectReasoningButton.style.display = state.supportsReasoningEffort ? 'inline-block' : 'none';
            const usage = state.session && state.session.contextUsage;
            if (!usage) {
                contextPill.classList.remove('active');
                contextLabel.textContent = 'Context';
                contextMeterFill.style.width = '0%';
                return;
            }
            const percent = Math.max(0, Math.min(100, Number(usage.fillPercent) || 0));
            contextPill.classList.add('active');
            contextLabel.textContent = percent + '% context';
            contextPill.title = percent + '% of ' + usage.contextWindowTokens + ' tokens · prompt ' + usage.promptTokens + ' · completion ' + usage.completionTokens + ' · ' + usage.source;
            contextMeterFill.style.width = percent + '%';
        }

        function renderFeed() {
            feed.innerHTML = '';
            const visibleEntries = state && state.session && Array.isArray(state.session.entries)
                ? state.session.entries.filter((entry) => entry.kind !== 'context-usage')
                : [];
            if (!visibleEntries.length) {
                return;
            }
            for (const entry of visibleEntries) {
                feed.appendChild(renderEntry(entry));
            }
            feed.scrollTop = feed.scrollHeight;
        }

        function renderEntry(entry) {
            if (entry.kind === 'user-message') {
                return textEntry('user', entry.text);
            }
            if (entry.kind === 'system-notice') {
                return textEntry('system', entry.text);
            }
            if (entry.kind === 'assistant-body') {
                return textEntry('assistant' + (entry.streaming ? ' streaming' : ''), entry.text || '');
            }
            if (entry.kind === 'context-usage') return document.createComment('context usage');
            if (entry.kind === 'compaction') {
                const el = document.createElement('div');
                el.className = 'entry compaction';
                const details = document.createElement('details');
                details.className = 'details';
                details.innerHTML = '<summary>Show compaction details</summary>' +
                    '<div class="details-body">' +
                    'Source: ' + escapeHtml(entry.event.source) + '\\n' +
                    'Messages compacted: ' + escapeHtml(entry.event.messagesCompacted) + '\\n' +
                    'Preserved recent messages: ' + escapeHtml(entry.event.preservedRecentMessages) +
                    (entry.event.estimatedTokens ? '\\nEstimated tokens: ' + escapeHtml(entry.event.estimatedTokens) : '') +
                    (entry.event.thresholdTokens ? '\\nThreshold tokens: ' + escapeHtml(entry.event.thresholdTokens) : '') +
                    (entry.event.fallbackReason ? '\\nFallback reason: ' + escapeHtml(entry.event.fallbackReason) : '') +
                    '</div>';
                el.innerHTML = '<div class="entry-head"><div class="entry-title">Context compacted</div><div class="entry-subtle">' + escapeHtml(new Date(entry.timestamp).toLocaleTimeString()) + '</div></div><div>' + escapeHtml(entry.event.summary) + '</div>';
                el.appendChild(details);
                return el;
            }
            if (entry.kind === 'operation') {
                const el = document.createElement('div');
                el.className = 'entry operation';
                const icon = OP_ICONS[entry.category || 'tool'] || 'Tool';
                const statusClass = entry.status ? ' ' + entry.status : '';
                el.innerHTML = '<div class="entry-head">' +
                    '<div class="entry-title"><span>' + escapeHtml(icon) + '</span><span>' + escapeHtml(entry.title || 'Operation') + '</span></div>' +
                    '<div class="entry-status' + escapeHtml(statusClass) + '">' + escapeHtml(entry.status || entry.tone || '') + '</div>' +
                    '</div>' +
                    (entry.detail ? '<div>' + escapeHtml(entry.detail) + '</div>' : '');
                if (entry.body || entry.summary) {
                    const details = document.createElement('details');
                    details.className = 'details';
                    details.innerHTML = '<summary>Show details</summary><div class="details-body">' + escapeHtml(entry.body || entry.summary || '') + '</div>';
                    el.appendChild(details);
                }
                return el;
            }
            return textEntry('system', 'Unsupported entry');
        }

        function textEntry(kind, text) {
            const el = document.createElement('div');
            el.className = 'entry ' + kind;
            el.textContent = text || '';
            return el;
        }

        function renderAll() {
            renderSessions();
            renderChatMeta();
            renderFeed();
            if (state && state.workflow) {
                workflowSelector.textContent = state.workflow.name
                    ? state.workflow.name + (state.workflow.id ? ' · ' + state.workflow.id : '')
                    : 'New workflow chat';
                workflowSelector.title = workflowSelector.textContent;
            }
        }

        function applyStreamEvent(event) {
            if (!state || !state.session) return;
            const entries = Array.isArray(state.session.entries) ? [...state.session.entries] : [];
            if (event.type === 'start') {
                state.activeSessionId = event.sessionId;
            } else if (event.type === 'text-delta') {
                const last = entries[entries.length - 1];
                if (last && last.kind === 'assistant-body' && last.streaming) {
                    last.text += event.delta || '';
                } else {
                    entries.push({ kind: 'assistant-body', id: crypto.randomUUID(), text: event.delta || '', streaming: true });
                }
            } else if (event.type === 'final') {
                const last = entries[entries.length - 1];
                if (last && last.kind === 'assistant-body') {
                    last.streaming = false;
                    last.finalState = event.finalState;
                    if (!last.text) last.text = event.response || '';
                } else {
                    entries.push({ kind: 'assistant-body', id: crypto.randomUUID(), text: event.response || '', streaming: false, finalState: event.finalState });
                }
            } else if (event.type === 'operation') {
                const idx = entries.findIndex((entry) => entry.kind === 'operation' && entry.id === event.operationId);
                const opEntry = {
                    kind: 'operation',
                    id: event.operationId,
                    tone: event.status === 'error' ? 'error' : event.status === 'done' ? 'success' : 'info',
                    title: event.label,
                    detail: event.summary,
                    category: event.category,
                    status: event.status,
                    body: event.body,
                    summary: event.summary,
                    startedAt: event.startedAt,
                    endedAt: event.endedAt,
                };
                if (idx >= 0) entries[idx] = opEntry;
                else entries.push(opEntry);
            } else if (event.type === 'progress') {
                entries.push({ kind: 'operation', id: crypto.randomUUID(), tone: event.tone, title: event.title, detail: event.detail, category: event.phase || 'phase', status: event.tone === 'error' ? 'error' : 'running' });
            } else if (event.type === 'compaction') {
                const compactionEntry = { kind: 'compaction', id: crypto.randomUUID(), timestamp: Date.now(), event: event };
                entries.push(compactionEntry);
                state.session.lastCompaction = event;
                state.session.totalCompactions = (state.session.totalCompactions || 0) + 1;
            } else if (event.type === 'context-usage') {
                state.session.contextUsage = {
                    promptTokens: event.promptTokens,
                    completionTokens: event.completionTokens,
                    contextWindowTokens: event.contextWindowTokens,
                    fillPercent: event.fillPercent,
                    source: event.source,
                };
                renderAll();
                return;
            } else if (event.type === 'error') {
                entries.push({ kind: 'system-notice', id: crypto.randomUUID(), text: 'Error: ' + event.error, timestamp: Date.now() });
            }
            state.session.entries = entries;
            renderAll();
        }

        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const text = promptInput.value.trim();
            if (!text || isRunning || !state) return;
            promptInput.value = '';
            vscode.postMessage({ type: 'agent.send', text, workflowId, nodeContext: currentNodeContext, sessionId: state.activeSessionId });
        });

        promptInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                form.requestSubmit();
            }
        });

        stopButton.addEventListener('click', () => vscode.postMessage({ type: 'agent.stop' }));
        workflowSelector.addEventListener('click', () => vscode.postMessage({ type: 'agent.workflow.select' }));
        historyOpenButton.addEventListener('click', openHistory);
        historyCloseButton.addEventListener('click', closeHistory);
        historyOverlay.addEventListener('click', (event) => {
            if (event.target === historyOverlay) closeHistory();
        });
        selectModelButton.addEventListener('click', () => vscode.postMessage({ type: 'agent.selectModel' }));
        selectReasoningButton.addEventListener('click', () => vscode.postMessage({ type: 'agent.selectReasoningEffort' }));
        newSessionButton.addEventListener('click', () => {
            closeHistory();
            vscode.postMessage({ type: 'agent.session.new' });
        });
        compactContextButton.addEventListener('click', () => state && vscode.postMessage({ type: 'agent.context.compact', sessionId: state.activeSessionId }));
        sessionFilter.addEventListener('change', () => {
            activeFilter = sessionFilter.value || 'current';
            renderSessions();
        });

        window.addEventListener('message', (event) => {
            const message = event.data;
            if (!message || typeof message !== 'object') return;

            if (message.type === 'workflow.reload') {
                reloadWorkflowFrame();
                return;
            }

            if (message.type === 'workflow.update' && typeof message.url === 'string') {
                workflowId = String(message.workflowId || workflowId);
                workflowUrl = message.url;
                workflowReloadUrl = typeof message.reloadUrl === 'string' && message.reloadUrl ? message.reloadUrl : workflowUrl;
                try { iframeOrigin = new URL(workflowUrl).origin; } catch (e) { iframeOrigin = 'src'; }
                if (frame) frame.src = workflowUrl;
                return;
            }

            if (message.type === 'n8n-paste-request') {
                if (!isWorkflowFrameEvent(event)) return;
                const now = Date.now();
                if (now - lastPasteMs < PASTE_RATE_LIMIT_MS) return;
                lastPasteMs = now;
                vscode.postMessage({ type: 'clipboard-paste-request', grantToken: issuePasteGrant() });
                return;
            }

            if (message.type === 'n8n-node-detail-opened') {
                if (!isWorkflowFrameEvent(event)) return;
                updateNodeContextBadge(message.node);
                if (currentNodeContext) {
                    vscode.postMessage({ type: 'agent.nodeDetailChanged', workflowId, nodeContext: currentNodeContext });
                }
                return;
            }

            if (message.type === 'n8n-node-context-cleared') {
                if (!isWorkflowFrameEvent(event)) return;
                updateNodeContextBadge(null);
                vscode.postMessage({ type: 'agent.nodeDetailChanged', workflowId, nodeContext: null });
                return;
            }

            if (message.type === 'n8n-clipboard-write' && typeof message.text === 'string') {
                if (!isWorkflowFrameEvent(event)) return;
                vscode.postMessage({ type: 'clipboard-write', text: message.text });
                return;
            }

            if (message.type === 'clipboard-error' && typeof message.grantToken === 'string') {
                consumeGrant(message.grantToken);
                return;
            }

            if (message.type === 'clipboard-paste' && typeof message.text === 'string' && typeof message.grantToken === 'string') {
                if (event.origin !== window.origin) return;
                if (!consumeGrant(message.grantToken)) return;
                try {
                    if (frame.contentWindow) {
                        frame.contentWindow.postMessage({ type: 'n8n-clipboard-paste', text: message.text }, iframeOrigin);
                    }
                } catch (e) {}
                return;
            }

            if (message.type === 'agent.status') {
                setRunning(message.status === 'running' || message.status === 'stopping');
                return;
            }

            if (message.type === 'agent.state') {
                state = message.state || null;
                if (state && state.currentNodeContext) {
                    updateNodeContextBadge(state.currentNodeContext);
                }
                renderAll();
                return;
            }

            if (message.type === 'agent.streamEvent') {
                applyStreamEvent(message.event || {});
                return;
            }
        });

        vscode.postMessage({ type: 'agent.ready' });
    </script>
</body>
</html>`;
}
