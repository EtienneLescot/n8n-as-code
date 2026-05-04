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
    const safeWorkflowName = escapeHtml(input.workflowName);
    const safeWorkflowId = escapeHtml(input.workflowId);
    const safeWorkflowUrl = escapeHtml(input.workflowUrl || '');
    const safeProviderModelLabel = escapeHtml(input.providerModelLabel);
    const workflowIdJs = JSON.stringify(input.workflowId);
    const workflowUrlJs = JSON.stringify(input.workflowUrl || '');
    const workflowReloadUrlJs = JSON.stringify(input.workflowReloadUrl || input.workflowUrl || '');
    const hasWorkflow = Boolean(input.workflowUrl);

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
            grid-template-columns: 290px ${hasWorkflow ? 'minmax(360px, .95fr) minmax(420px, 1.05fr)' : 'minmax(420px, 1fr)'};
            height: 100vh;
            width: 100vw;
            min-width: 0;
            min-height: 0;
        }
        .sidebar, .chat {
            min-width: 0;
            min-height: 0;
            background: var(--panel);
        }
        .sidebar {
            display: grid;
            grid-template-rows: auto auto 1fr auto;
            border-right: 1px solid var(--border);
        }
        .chat {
            display: grid;
            grid-template-rows: auto auto 1fr auto;
            border-right: ${hasWorkflow ? '1px solid var(--border)' : '0'};
        }
        .workflow {
            position: relative;
            min-width: 0;
            min-height: 0;
            background: var(--bg);
        }
        .section-head, .chat-head, .composer {
            padding: 12px 14px;
        }
        .section-head, .chat-head {
            border-bottom: 1px solid var(--border);
        }
        .sidebar-title, .chat-title {
            font-size: 14px;
            font-weight: 700;
        }
        .sidebar-subtitle, .chat-subtitle, .meta-text {
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
        .session-filters, .session-actions, .session-meta, .checkpoint-panel {
            padding: 12px 14px;
            border-bottom: 1px solid var(--border);
        }
        .session-meta, .checkpoint-panel {
            display: grid;
            gap: 8px;
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
            padding: 10px;
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
        .chat-head {
            display: grid;
            gap: 10px;
        }
        .chat-head-row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            align-items: flex-start;
        }
        .chat-meta {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            align-items: center;
        }
        .feed {
            overflow: auto;
            min-height: 0;
            padding: 14px;
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
            grid-template-columns: 1fr auto;
            gap: 8px;
            border-top: 1px solid var(--border);
            background: var(--panel);
        }
        .composer-input {
            display: grid;
            gap: 8px;
            min-width: 0;
        }
        .composer-meta {
            display: flex;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
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
        .agent-run-indicator {
            display: none;
            align-items: center;
            gap: 8px;
            color: var(--muted);
            font-size: 12px;
        }
        .agent-run-indicator.active {
            display: inline-flex;
        }
        .pixel-spinner {
            display: grid;
            grid-template-columns: repeat(2, 5px);
            grid-template-rows: repeat(2, 5px);
            gap: 2px;
        }
        .pixel-spinner span {
            width: 5px;
            height: 5px;
            border-radius: 1px;
            background: color-mix(in srgb, var(--accent) 75%, transparent);
            animation: pixel-spinner-blink 0.85s steps(1) infinite;
        }
        .pixel-spinner span:nth-child(2) { animation-delay: 0.18s; }
        .pixel-spinner span:nth-child(3) { animation-delay: 0.36s; }
        .pixel-spinner span:nth-child(4) { animation-delay: 0.54s; }
        @keyframes pixel-spinner-blink {
            0%, 100% { opacity: 0.28; transform: scale(0.92); }
            50% { opacity: 1; transform: scale(1); }
        }
        .composer-actions {
            display: grid;
            gap: 8px;
            align-content: end;
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
            min-height: 46px;
            max-height: 160px;
            line-height: 1.4;
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
                grid-template-columns: 280px 1fr;
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
                grid-template-rows: auto auto ${hasWorkflow ? 'minmax(280px, 42%)' : ''};
            }
            .sidebar, .chat {
                border-right: 0;
                border-bottom: 1px solid var(--border);
            }
            .composer {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <main class="workbench">
        <aside class="sidebar" aria-label="Agent sessions">
            <div class="section-head">
                <div class="sidebar-title">Sessions</div>
                <div class="sidebar-subtitle">Persisted Yagr-backed conversations, checkpoints, and workflow attachment.</div>
                <div class="toolbar compact">
                    <button id="new-session" class="small">New session</button>
                </div>
            </div>
            <div class="session-filters">
                <div class="meta-text">Filter</div>
                <select id="session-filter">
                    <option value="current">Current workflow</option>
                    <option value="all">All sessions</option>
                    <option value="unattached">Unattached</option>
                </select>
            </div>
            <div id="session-list" class="sessions"></div>
            <div class="checkpoint-panel">
                <div class="meta-grid" id="session-meta"></div>
                <div class="toolbar compact">
                    <button id="rename-session" class="secondary small" type="button">Rename</button>
                    <button id="attach-session" class="secondary small" type="button">Attach</button>
                    <button id="detach-session" class="secondary small" type="button">Detach</button>
                    <button id="delete-session" class="ghost small" type="button">Delete</button>
                </div>
                <div class="meta-text">Checkpoints</div>
                <div class="toolbar compact">
                    <button id="save-checkpoint" class="secondary small" type="button">Save checkpoint</button>
                </div>
                <div id="checkpoint-list" class="meta-grid"></div>
            </div>
        </aside>
        <section class="chat" aria-label="Agent chat">
            <header class="chat-head">
                <div class="chat-head-row">
                    <div>
                        <div class="chat-title">Workflow Architect</div>
                        <div id="chat-subtitle" class="chat-subtitle" title="${safeWorkflowName}">${safeWorkflowName}${safeWorkflowId ? ` · ${safeWorkflowId}` : ' · new workflow chat'}</div>
                    </div>
                    <div class="toolbar compact">
                        <button id="select-model" class="secondary small" type="button" title="${safeProviderModelLabel}">${safeProviderModelLabel}</button>
                        <button id="select-reasoning" class="secondary small" type="button">Reasoning</button>
                    </div>
                </div>
                <div id="chat-meta" class="chat-meta"></div>
            </header>
            <div id="feed" class="feed"></div>
            <form id="composer" class="composer">
                <div class="composer-input">
                    <div class="composer-meta">
                        <div id="node-context-badge" class="node-context-badge" title=""></div>
                        <div id="agent-run-indicator" class="agent-run-indicator" aria-live="polite">
                            <div class="pixel-spinner" aria-hidden="true">
                                <span></span>
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                            <span>Agent running</span>
                        </div>
                    </div>
                    <textarea id="prompt" placeholder="Ask the n8n agent what to do with this workflow..." rows="2"></textarea>
                </div>
                <div class="composer-actions">
                    <button id="send" type="submit">Send</button>
                    <button id="stop" class="secondary" type="button" disabled>Stop</button>
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
        const agentRunIndicator = document.getElementById('agent-run-indicator');
        const sessionList = document.getElementById('session-list');
        const sessionFilter = document.getElementById('session-filter');
        const sessionMeta = document.getElementById('session-meta');
        const checkpointList = document.getElementById('checkpoint-list');
        const chatSubtitle = document.getElementById('chat-subtitle');
        const chatMeta = document.getElementById('chat-meta');
        const newSessionButton = document.getElementById('new-session');
        const renameSessionButton = document.getElementById('rename-session');
        const attachSessionButton = document.getElementById('attach-session');
        const detachSessionButton = document.getElementById('detach-session');
        const deleteSessionButton = document.getElementById('delete-session');
        const saveCheckpointButton = document.getElementById('save-checkpoint');

        function setRunning(running) {
            isRunning = running;
            sendButton.disabled = running;
            stopButton.disabled = !running;
            if (agentRunIndicator) {
                agentRunIndicator.classList.toggle('active', running);
            }
            newSessionButton.disabled = running;
            renameSessionButton.disabled = running;
            attachSessionButton.disabled = running;
            detachSessionButton.disabled = running;
            deleteSessionButton.disabled = running;
            saveCheckpointButton.disabled = running;
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
                        ? 'No unattached sessions.'
                        : 'No sessions for this workflow yet.';
                sessionList.appendChild(empty);
                return;
            }

            for (const session of sessions) {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'session-item' + (session.isActive ? ' active' : '');
                item.addEventListener('click', () => vscode.postMessage({ type: 'agent.session.select', sessionId: session.id }));

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

        function renderMeta() {
            sessionMeta.innerHTML = '';
            checkpointList.innerHTML = '';
            if (!state || !state.session) {
                sessionMeta.textContent = '';
                return;
            }

            const session = state.session;
            const rows = [
                ['Session', session.title],
                ['Attached', session.workflowLabel],
                ['Checkpoints', String(session.checkpoints.length)],
                ['Compactions', String(session.totalCompactions)],
                ['Context', session.contextUsage ? session.contextUsage.fillPercent + '% of ' + session.contextUsage.contextWindowTokens + ' tokens' : 'No estimate yet'],
            ];
            for (const [label, value] of rows) {
                const row = document.createElement('div');
                row.className = 'meta-row';
                const left = document.createElement('span');
                left.className = 'meta-text';
                left.textContent = label;
                const right = document.createElement('code');
                right.textContent = value;
                row.append(left, right);
                sessionMeta.appendChild(row);
            }

            if (!session.checkpoints.length) {
                const empty = document.createElement('div');
                empty.className = 'meta-text';
                empty.textContent = 'No checkpoints saved for this session.';
                checkpointList.appendChild(empty);
            } else {
                for (const checkpoint of session.checkpoints) {
                    const row = document.createElement('div');
                    row.className = 'session-item';
                    const head = document.createElement('div');
                    head.className = 'session-item-head';
                    const title = document.createElement('div');
                    title.className = 'session-item-title';
                    title.textContent = checkpoint.id;
                    const summary = document.createElement('div');
                    summary.className = 'session-item-foot';
                    const left = document.createElement('span');
                    left.textContent = checkpoint.messageCount + ' msgs';
                    const right = document.createElement('span');
                    right.textContent = formatDate(checkpoint.createdAt);
                    summary.append(left, right);
                    head.append(title);
                    row.append(head, summary);

                    const actions = document.createElement('div');
                    actions.className = 'toolbar compact';
                    const restore = document.createElement('button');
                    restore.className = 'secondary small';
                    restore.type = 'button';
                    restore.textContent = 'Restore';
                    restore.disabled = isRunning;
                    restore.addEventListener('click', () => vscode.postMessage({ type: 'agent.checkpoint.restore', sessionId: session.sessionId, checkpointId: checkpoint.id }));
                    const del = document.createElement('button');
                    del.className = 'ghost small';
                    del.type = 'button';
                    del.textContent = 'Delete';
                    del.disabled = isRunning;
                    del.addEventListener('click', () => vscode.postMessage({ type: 'agent.checkpoint.delete', sessionId: session.sessionId, checkpointId: checkpoint.id }));
                    actions.append(restore, del);
                    row.append(actions);
                    checkpointList.appendChild(row);
                }
            }

            attachSessionButton.disabled = isRunning || !workflowId || session.workflowId === workflowId;
            detachSessionButton.disabled = isRunning || !session.workflowId;
        }

        function renderChatMeta() {
            chatMeta.innerHTML = '';
            if (!state) return;
            const bits = [];
            bits.push(badge((state.provider || 'provider') + (state.model ? ' / ' + state.model : ''), ''));
            if (state.reasoningEffort) bits.push(badge('Reasoning ' + state.reasoningEffort, ''));
            if (state.session && state.session.workflowLabel) bits.push(badge(state.session.workflowLabel, ''));
            if (state.session && state.session.lastCompaction) bits.push(badge('Compacted', 'success'));
            bits.forEach((el) => chatMeta.appendChild(el));
            selectReasoningButton.style.display = state.supportsReasoningEffort ? 'inline-block' : 'none';
        }

        function renderFeed() {
            feed.innerHTML = '';
            if (!state || !state.session || !state.session.entries.length) {
                const empty = document.createElement('div');
                empty.className = 'entry system';
                empty.textContent = 'Ask for a workflow inspection, create a new session, or attach a saved conversation to this workflow.';
                feed.appendChild(empty);
                return;
            }
            for (const entry of state.session.entries) {
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
            if (entry.kind === 'context-usage') {
                const el = document.createElement('div');
                el.className = 'entry context';
                el.innerHTML = '<div class="entry-head"><div class="entry-title">Context usage</div><div class="entry-subtle">' + escapeHtml(entry.usage.source) + '</div></div>' +
                    '<div>' + escapeHtml(entry.usage.fillPercent + '% of ' + entry.usage.contextWindowTokens + ' tokens · prompt ' + entry.usage.promptTokens + ' · completion ' + entry.usage.completionTokens) + '</div>';
                return el;
            }
            if (entry.kind === 'compaction') {
                const el = document.createElement('div');
                el.className = 'entry compaction';
                const details = document.createElement('details');
                details.className = 'details';
                details.innerHTML = '<summary>Show compaction details</summary>' +
                    '<div class="details-body">' +
                    'Source: ' + escapeHtml(entry.event.source) + '\n' +
                    'Messages compacted: ' + escapeHtml(entry.event.messagesCompacted) + '\n' +
                    'Preserved recent messages: ' + escapeHtml(entry.event.preservedRecentMessages) +
                    (entry.event.estimatedTokens ? '\nEstimated tokens: ' + escapeHtml(entry.event.estimatedTokens) : '') +
                    (entry.event.thresholdTokens ? '\nThreshold tokens: ' + escapeHtml(entry.event.thresholdTokens) : '') +
                    (entry.event.fallbackReason ? '\nFallback reason: ' + escapeHtml(entry.event.fallbackReason) : '') +
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
            renderMeta();
            renderChatMeta();
            renderFeed();
            if (state && state.workflow) {
                chatSubtitle.textContent = state.workflow.name
                    ? state.workflow.name + (state.workflow.id ? ' · ' + state.workflow.id : '')
                    : 'New workflow chat';
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
                const filtered = entries.filter((entry) => entry.kind !== 'context-usage');
                filtered.push({ kind: 'context-usage', id: crypto.randomUUID(), timestamp: Date.now(), usage: state.session.contextUsage });
                state.session.entries = filtered;
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
        selectModelButton.addEventListener('click', () => vscode.postMessage({ type: 'agent.selectModel' }));
        selectReasoningButton.addEventListener('click', () => vscode.postMessage({ type: 'agent.selectReasoningEffort' }));
        newSessionButton.addEventListener('click', () => vscode.postMessage({ type: 'agent.session.new' }));
        saveCheckpointButton.addEventListener('click', () => state && vscode.postMessage({ type: 'agent.checkpoint.save', sessionId: state.activeSessionId }));
        renameSessionButton.addEventListener('click', () => {
            if (!state || !state.session) return;
            const title = window.prompt('Rename session', state.session.title);
            if (typeof title === 'string' && title.trim()) {
                vscode.postMessage({ type: 'agent.session.rename', sessionId: state.activeSessionId, title: title.trim() });
            }
        });
        attachSessionButton.addEventListener('click', () => state && vscode.postMessage({ type: 'agent.session.attach', sessionId: state.activeSessionId }));
        detachSessionButton.addEventListener('click', () => state && vscode.postMessage({ type: 'agent.session.detach', sessionId: state.activeSessionId }));
        deleteSessionButton.addEventListener('click', () => {
            if (!state || !state.session) return;
            const confirmed = window.confirm('Delete session "' + state.session.title + '"?');
            if (confirmed) {
                vscode.postMessage({ type: 'agent.session.delete', sessionId: state.activeSessionId });
            }
        });
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
