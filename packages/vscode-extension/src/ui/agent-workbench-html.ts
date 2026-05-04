export interface AgentWorkbenchHtmlInput {
    workflowId: string;
    workflowName: string;
    workflowUrl?: string;
    workflowReloadUrl?: string;
}

const AGENT_WORKBENCH_CHAT_BUILD = '2026.05.04.8';

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
            --text: var(--vscode-editor-foreground, #d4d4d4);
            --accent: var(--vscode-button-background, #0e639c);
            --accent-text: var(--vscode-button-foreground, #ffffff);
            --input: var(--vscode-input-background, #2a2a2a);
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
        .workbench {
            display: grid;
            grid-template-columns: ${hasWorkflow ? 'minmax(320px, 36%) minmax(420px, 1fr)' : 'minmax(320px, 760px)'};
            justify-content: ${hasWorkflow ? 'stretch' : 'center'};
            height: 100vh;
            width: 100vw;
        }
        .chat {
            display: grid;
            grid-template-rows: auto 1fr auto;
            min-width: 0;
            min-height: 0;
            border-right: 1px solid var(--border);
            background: var(--panel);
        }
        .header {
            padding: 14px 16px 12px;
            border-bottom: 1px solid var(--border);
        }
        .kicker {
            color: var(--muted);
            font-size: 11px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            margin-bottom: 6px;
        }
        .title {
            font-size: 15px;
            font-weight: 650;
            line-height: 1.35;
        }
        .build-marker {
            margin-top: 4px;
            color: var(--muted);
            font-size: 11px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        }
        .bridge-status {
            margin-top: 3px;
            color: var(--muted);
            font-size: 11px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        }
        .bridge-status.connected {
            color: var(--vscode-testing-iconPassed, #73c991);
        }
        .subtitle {
            margin-top: 6px;
            color: var(--muted);
            font-size: 12px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .header-actions {
            margin-top: 10px;
        }
        .feed {
            overflow: auto;
            min-height: 0;
            padding: 14px;
        }
        .message, .operation {
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 10px 11px;
            margin-bottom: 10px;
            background: color-mix(in srgb, var(--bg) 78%, transparent);
            white-space: pre-wrap;
            line-height: 1.45;
            font-size: 13px;
        }
        .message.user {
            border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
        }
        .role {
            color: var(--muted);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.06em;
            margin-bottom: 5px;
            text-transform: uppercase;
        }
        .operation {
            color: var(--muted);
            font-size: 12px;
        }
        .operation.running { border-color: var(--accent); }
        .operation.error { border-color: var(--vscode-errorForeground, #f85149); color: var(--vscode-errorForeground, #f85149); }
        .composer {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 8px;
            padding: 12px;
            border-top: 1px solid var(--border);
            background: var(--panel);
        }
        .composer-input {
            display: grid;
            gap: 6px;
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
        textarea {
            resize: none;
            min-height: 42px;
            max-height: 140px;
            border: 1px solid var(--vscode-input-border, transparent);
            border-radius: 8px;
            background: var(--input);
            color: var(--text);
            padding: 9px 10px;
            font: inherit;
            line-height: 1.35;
            outline: none;
        }
        .actions {
            display: grid;
            gap: 8px;
            align-content: end;
        }
        button {
            border: none;
            border-radius: 8px;
            padding: 8px 11px;
            color: var(--accent-text);
            background: var(--accent);
            cursor: pointer;
            font: inherit;
            font-size: 12px;
        }
        button.secondary {
            color: var(--vscode-button-secondaryForeground, var(--text));
            background: var(--vscode-button-secondaryBackground, #3a3d41);
        }
        button:disabled {
            cursor: not-allowed;
            opacity: 0.55;
        }
        .workflow {
            position: relative;
            min-width: 0;
            min-height: 0;
            background: var(--bg);
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
        @media (max-width: 860px) {
            .workbench {
                grid-template-columns: 1fr;
                grid-template-rows: minmax(280px, 45%) 1fr;
            }
            .chat {
                border-right: 0;
                border-bottom: 1px solid var(--border);
            }
        }
    </style>
</head>
<body>
    <main class="workbench">
        <section class="chat" aria-label="Agent chat">
            <header class="header">
                <div class="kicker">n8n Agent Workbench</div>
                <div class="title">Workflow Architect</div>
                <div class="build-marker">Chat build ${AGENT_WORKBENCH_CHAT_BUILD}</div>
                <div id="bridge-status" class="bridge-status">n8n bridge pending</div>
                <div class="subtitle" title="${safeWorkflowName}">${safeWorkflowName}${safeWorkflowId ? ` · ${safeWorkflowId}` : ' · new workflow chat'}</div>
                <div class="header-actions"><button id="select-model" class="secondary" type="button">Provider / Model</button></div>
            </header>
            <div id="feed" class="feed">
                <div class="message system">
                    <div class="role">System</div>
                    Agent workbench is ready. Ask for a workflow inspection, generation plan, validation pass, or deployment step.
                </div>
            </div>
            <form id="composer" class="composer">
                <div class="composer-input">
                    <div id="node-context-badge" class="node-context-badge" title=""></div>
                    <textarea id="prompt" placeholder="Ask the n8n agent what to do with this workflow..." rows="2"></textarea>
                </div>
                <div class="actions">
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
        let activeAssistantMessage = null;
        let currentNodeContext = null;

        const feed = document.getElementById('feed');
        const form = document.getElementById('composer');
        const promptInput = document.getElementById('prompt');
        const sendButton = document.getElementById('send');
        const stopButton = document.getElementById('stop');
        const selectModelButton = document.getElementById('select-model');
        const frame = document.getElementById('workflow-frame');
        const refreshPill = document.getElementById('refresh-pill');
        const nodeContextBadge = document.getElementById('node-context-badge');
        const bridgeStatus = document.getElementById('bridge-status');

        function appendMessage(role, content) {
            const el = document.createElement('div');
            el.className = 'message ' + role;
            const label = document.createElement('div');
            label.className = 'role';
            label.textContent = role;
            const body = document.createElement('div');
            body.textContent = content || '';
            el.append(label, body);
            feed.appendChild(el);
            feed.scrollTop = feed.scrollHeight;
            return body;
        }

        function appendOperation(label, status, detail) {
            const el = document.createElement('div');
            el.className = 'operation ' + status;
            el.textContent = detail ? label + ': ' + detail : label;
            feed.appendChild(el);
            feed.scrollTop = feed.scrollHeight;
        }

        function setRunning(running) {
            isRunning = running;
            sendButton.disabled = running;
            stopButton.disabled = !running;
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

        function updateBridgeStatus(text, connected) {
            if (!bridgeStatus) return;
            bridgeStatus.textContent = text;
            bridgeStatus.classList.toggle('connected', Boolean(connected));
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

        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const text = promptInput.value.trim();
            if (!text || isRunning) return;
            promptInput.value = '';
            activeAssistantMessage = null;
            appendMessage('user', text);
            vscode.postMessage({ type: 'agent.send', text, workflowId, nodeContext: currentNodeContext });
        });

        promptInput.addEventListener('keydown', (event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                form.requestSubmit();
            }
        });

        stopButton.addEventListener('click', () => {
            vscode.postMessage({ type: 'agent.stop' });
        });

        selectModelButton.addEventListener('click', () => {
            vscode.postMessage({ type: 'agent.selectModel' });
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
                updateBridgeStatus('n8n bridge pending', false);
                if (frame) frame.src = workflowUrl;
                return;
            }

            if (message.type === 'n8n-bridge-ready') {
                if (!isWorkflowFrameEvent(event)) return;
                updateBridgeStatus('n8n bridge ' + (message.build || 'connected') + (message.pageKind ? ' · ' + message.pageKind : '') + (message.nodeName ? ' · saw ' + message.nodeName : ''), true);
                return;
            }

            if (message.type === 'n8n-ui-click') {
                if (!isWorkflowFrameEvent(event)) return;
                updateBridgeStatus('n8n bridge ' + (message.build || 'connected') + ' · click ' + (message.nodeName || message.target || 'ui'), true);
                return;
            }

            if (message.type === 'n8n-ui-change') {
                if (!isWorkflowFrameEvent(event)) return;
                updateBridgeStatus('n8n bridge ' + (message.build || 'connected') + ' · ui changed ' + (message.nodeName || message.count || ''), true);
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

            if (message.type === 'agent.message') {
                activeAssistantMessage = appendMessage(message.role || 'assistant', message.content || '');
                return;
            }

            if (message.type === 'agent.delta') {
                if (!activeAssistantMessage) {
                    activeAssistantMessage = appendMessage('assistant', '');
                }
                activeAssistantMessage.textContent += message.content || '';
                feed.scrollTop = feed.scrollHeight;
                return;
            }

            if (message.type === 'agent.operation') {
                appendOperation(message.label || 'Operation', message.status || 'running', message.detail || '');
                return;
            }

            if (message.type === 'agent.error') {
                appendOperation('Error', 'error', message.message || 'Unknown error');
                return;
            }

            if (message.type === 'agent.done') {
                setRunning(false);
                return;
            }
        });
    </script>
</body>
</html>`;
}
