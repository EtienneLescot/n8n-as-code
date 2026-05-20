export interface AgentWorkbenchHtmlInput {
    workflowId: string;
    workflowName: string;
    workflowAttached?: boolean;
    workflowUrl?: string;
    workflowReloadUrl?: string;
    providerModelLabel: string;
}

export const AGENT_WORKBENCH_BUILD = 'awb-2026.05.20.5-latency-probe';

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
    const hasWorkflow = Boolean(input.workflowAttached || input.workflowUrl);
    const hasWorkflowUi = Boolean(input.workflowUrl);
    const safeWorkflowName = escapeHtml(input.workflowName);
    const safeWorkflowId = escapeHtml(input.workflowId);
    const initialWorkflowLabel = hasWorkflow ? safeWorkflowName : 'No workflow context';
    const safeWorkflowUrl = escapeHtml(input.workflowUrl || '');
    const safeProviderModelLabel = escapeHtml(input.providerModelLabel);
    const safeWorkbenchBuild = escapeHtml(AGENT_WORKBENCH_BUILD);
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
    const lucideIcon = (paths: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
    const newConversationIcon = lucideIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v6"/><path d="M9 10h6"/>');
    const historyIcon = lucideIcon('<path d="M3 12a9 9 0 1 0 9-9 9.8 9.8 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>');
    const trashIcon = lucideIcon('<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>');
    const compactIcon = lucideIcon('<path d="M6 12h12"/><path d="m8 4 4 4 4-4"/><path d="m8 20 4-4 4 4"/>');
    const checkpointIcon = lucideIcon('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>');
    const rewindIcon = lucideIcon('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>');
    const copyIcon = lucideIcon('<rect width="12" height="12" x="8" y="8" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>');
    const stopIcon = lucideIcon('<rect width="10" height="10" x="7" y="7" rx="1.5"/>');
    const sendIcon = lucideIcon('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>');
    const readOpIcon = lucideIcon('<path d="M12 7v10"/><path d="M17 12H7"/>');
    const writeOpIcon = lucideIcon('<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>');
    const shellOpIcon = lucideIcon('<path d="m4 17 6-5-6-5"/><path d="M12 19h8"/>');
    const webOpIcon = lucideIcon('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18"/><path d="M12 3a15 15 0 0 0 0 18"/>');
    const toolOpIcon = lucideIcon('<path d="M14.7 6.3a4 4 0 0 0-5.66 5.66L4 17v3h3l5.04-5.04A4 4 0 0 0 17.7 9.3l-2 2-3-3 2-2Z"/>');
    const agentOpIcon = lucideIcon('<path d="M12 3 4 7v5c0 5 3.4 9.4 8 10 4.6-.6 8-5 8-10V7l-8-4Z"/><path d="M9.5 12.5 11 14l3.5-3.5"/>');
    const phaseOpIcon = lucideIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>');
    const thinkingOpIcon = lucideIcon('<path d="M9.5 9a3 3 0 1 1 5 2.2c-.8.7-1.5 1.2-1.5 2.3"/><path d="M12 17h.01"/><path d="M7 4.8A9 9 0 1 0 17 4.8"/>');
    const todoOpIcon = lucideIcon('<path d="M9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>');
    const statusRunningIcon = lucideIcon('<path d="M21 12a9 9 0 1 1-6.22-8.56"/><path d="M21 3v6h-6"/>');
    const statusDoneIcon = lucideIcon('<path d="M20 6 9 17l-5-5"/>');
    const statusErrorIcon = lucideIcon('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>');

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
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: flex-start;
            gap: 6px;
        }
        .session-item.active {
            border-color: color-mix(in srgb, var(--accent) 58%, var(--border));
            box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 42%, transparent);
        }
        button.session-select {
            display: grid;
            min-width: 0;
            gap: 6px;
            padding: 0;
            border: 0;
            border-radius: 6px;
            background: transparent;
            color: var(--text);
            text-align: left;
        }
        button.session-select:focus-visible {
            outline: 1px solid var(--vscode-focusBorder, var(--accent));
            outline-offset: 2px;
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
            align-items: center;
            flex: 0 0 auto;
        }
        .session-delete {
            width: 26px;
            height: 26px;
            min-width: 26px;
            padding: 0;
            border-radius: 6px;
            color: var(--muted);
        }
        .session-delete:hover:not(:disabled) {
            color: var(--error);
            border-color: color-mix(in srgb, var(--error) 58%, var(--border));
            background: color-mix(in srgb, var(--error) 12%, transparent);
        }
        .session-delete svg {
            width: 14px;
            height: 14px;
            stroke: currentColor;
            fill: none;
            stroke-width: 1.8;
            stroke-linecap: round;
            stroke-linejoin: round;
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
        .checkpoint-item {
            border: 1px solid var(--border);
            border-radius: 10px;
            background: color-mix(in srgb, var(--bg) 82%, transparent);
            padding: 10px;
            display: grid;
            gap: 8px;
        }
        .checkpoint-item-head,
        .checkpoint-item-foot {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            align-items: flex-start;
        }
        .checkpoint-item-title {
            font-size: 13px;
            font-weight: 650;
            line-height: 1.35;
            overflow-wrap: anywhere;
        }
        .checkpoint-item-meta {
            color: var(--muted);
            font-size: 11px;
            line-height: 1.4;
        }
        .checkpoint-actions {
            display: flex;
            gap: 7px;
            justify-content: flex-end;
            flex-wrap: wrap;
        }
        .history-overlay,
        .checkpoint-overlay {
            position: fixed;
            inset: 0;
            z-index: 10;
            display: none;
            align-items: flex-start;
            justify-content: center;
            padding-top: 42px;
            background: rgba(0, 0, 0, .28);
        }
        .history-overlay.open,
        .checkpoint-overlay.open { display: flex; }
        .history-modal,
        .checkpoint-modal {
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
        .checkpoint-modal { grid-template-rows: auto 1fr auto; }
        .history-head,
        .history-controls,
        .history-foot,
        .checkpoint-head,
        .checkpoint-foot {
            padding: 12px;
            border-bottom: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
        }
        .history-head,
        .checkpoint-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
        }
        .history-title,
        .checkpoint-title {
            font-size: 14px;
            font-weight: 650;
        }
        .history-list,
        .checkpoint-list {
            overflow: auto;
            min-height: 0;
            padding: 10px 12px;
        }
        .history-foot,
        .checkpoint-foot {
            border-bottom: 0;
            border-top: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }
        #checkpoint-open,
        #checkpoint-overlay,
        .checkpoint-item .checkpoint-actions {
            display: none !important;
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
        .chat-head-main {
            min-width: 0;
            display: grid;
            gap: 8px;
            flex: 1 1 auto;
        }
        .chat-title-row {
            display: flex;
            align-items: baseline;
            gap: 10px;
            min-width: 0;
        }
        .conversation-title {
            min-width: 0;
            color: var(--muted);
            font-size: 12px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .workbench-build {
            color: var(--muted);
            font-size: 10px;
            line-height: 1;
            opacity: .72;
            flex: 0 0 auto;
            user-select: text;
        }
        .context-actions {
            display: flex;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
            min-width: 0;
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
            position: relative;
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
            justify-self: start;
            padding: 10px 14px 18px;
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
        .entry.user {
            border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
        }
        .entry.system { color: var(--muted); }
        .entry.assistant.streaming { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent); }
        .entry.operation, .entry.compaction, .entry.context { background: color-mix(in srgb, var(--elevated) 90%, transparent); }
        .entry-body {
            white-space: pre-wrap;
        }
        .message-group {
            display: grid;
            gap: 6px;
        }
        .message-actions {
            display: flex;
            justify-content: flex-end;
            gap: 14px;
            padding-right: 1px;
        }
        .message-action {
            display: inline-grid;
            place-items: center;
            width: 18px;
            height: 18px;
            border: 0;
            border-radius: 4px;
            background: transparent;
            color: var(--muted);
            cursor: pointer;
            padding: 0;
        }
        .message-action:hover:not(:disabled) {
            color: var(--text);
            background: color-mix(in srgb, var(--elevated) 70%, transparent);
        }
        .message-action:disabled {
            opacity: 0.55;
            cursor: default;
        }
        .message-action svg {
            width: 14px;
            height: 14px;
            stroke: currentColor;
            fill: none;
            stroke-width: 1.7;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
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
        .entry-kind-icon {
            display: inline-grid;
            place-items: center;
            width: 18px;
            height: 18px;
            color: var(--muted);
            flex: 0 0 auto;
        }
        .entry-kind-icon svg {
            width: 15px;
            height: 15px;
            stroke: currentColor;
            fill: none;
            stroke-width: 1.9;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .entry-subtle {
            color: var(--muted);
            font-size: 11px;
        }
        .entry-status {
            color: var(--muted);
            font-size: 11px;
            display: inline-grid;
            place-items: center;
            width: 18px;
            height: 18px;
            flex: 0 0 auto;
        }
        .entry-status svg {
            width: 15px;
            height: 15px;
            stroke: currentColor;
            fill: none;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
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
        .operation-compact {
            display: grid;
            gap: 6px;
            margin-top: 2px;
        }
        .operation-row {
            display: grid;
            grid-template-columns: 68px minmax(0, 1fr);
            gap: 8px;
            align-items: baseline;
            min-width: 0;
            font-size: 12px;
        }
        .operation-label {
            color: var(--muted);
            font-size: 11px;
            text-transform: uppercase;
        }
        .operation-value {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .operation-code {
            font-family: var(--vscode-editor-font-family, var(--vscode-font-family, monospace));
        }
        .todo-list {
            display: grid;
            gap: 4px;
        }
        .todo-checklist {
            display: grid;
            gap: 5px;
            margin-top: 4px;
        }
        .todo-item {
            display: grid;
            grid-template-columns: 16px minmax(0, 1fr);
            gap: 7px;
            align-items: start;
            color: var(--text);
            font-size: 12px;
        }
        .todo-box {
            display: inline-grid;
            place-items: center;
            width: 13px;
            height: 13px;
            margin-top: 2px;
            border: 1px solid color-mix(in srgb, var(--muted) 72%, transparent);
            border-radius: 3px;
            color: var(--accent-text);
            background: transparent;
            font-size: 10px;
            line-height: 1;
        }
        .todo-item.completed .todo-box {
            border-color: var(--success);
            background: color-mix(in srgb, var(--success) 72%, transparent);
        }
        .todo-item.in-progress .todo-box {
            border-color: var(--warning);
            background: color-mix(in srgb, var(--warning) 18%, transparent);
        }
        .todo-text {
            min-width: 0;
            overflow-wrap: anywhere;
        }
        .todo-item.completed .todo-text {
            color: var(--muted);
            text-decoration: line-through;
        }
        .todo-line {
            display: grid;
            grid-template-columns: 86px minmax(0, 1fr);
            gap: 8px;
        }
        .todo-status {
            color: var(--muted);
            text-transform: capitalize;
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
        .pending-prompt {
            display: none;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 8px;
            align-items: center;
            padding: 6px 7px 6px 9px;
            border: 1px solid color-mix(in srgb, var(--accent) 42%, var(--border));
            border-radius: 7px;
            background: color-mix(in srgb, var(--accent) 14%, transparent);
            color: var(--text);
            font-size: 12px;
        }
        .pending-prompt.open { display: grid; }
        .runtime-finalizing {
            display: none;
            color: var(--muted);
            font-size: 11px;
            line-height: 1.25;
            padding: 0 2px;
        }
        .runtime-finalizing.open {
            display: block;
        }
        .pending-prompt-main {
            display: flex;
            gap: 7px;
            align-items: center;
            min-width: 0;
        }
        .pending-prompt-label {
            flex: 0 0 auto;
            color: var(--muted);
            text-transform: uppercase;
            font-size: 10px;
            letter-spacing: 0;
        }
        .pending-prompt-text {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .pending-prompt button {
            min-height: 24px;
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 11px;
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
            position: relative;
            display: flex;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
            min-width: 0;
        }
        .inline-popover {
            position: absolute;
            left: 0;
            bottom: calc(100% + 8px);
            z-index: 8;
            display: none;
            width: min(390px, calc(100vw - 28px));
            max-height: min(420px, calc(100vh - 96px));
            overflow: hidden;
            border: 1px solid var(--border);
            border-radius: 10px;
            background: color-mix(in srgb, var(--panel) 96%, black 6%);
            box-shadow: 0 16px 42px rgba(0, 0, 0, .42);
            grid-template-rows: auto auto auto minmax(0, 1fr) auto;
        }
        .inline-popover.open { display: grid; }
        .inline-popover.reasoning {
            left: auto;
            right: 0;
            width: 220px;
        }
        .inline-popover.new-session {
            left: auto;
            right: 0;
            top: calc(100% + 8px);
            bottom: auto;
            width: min(340px, calc(100vw - 28px));
        }
        .inline-popover-head {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            align-items: center;
            padding: 9px 10px;
            border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
            color: var(--muted);
            font-size: 12px;
        }
        .inline-popover-head strong {
            color: var(--text);
            font-weight: 650;
        }
        .inline-back {
            display: flex;
            align-items: center;
            gap: 6px;
            width: 100%;
            padding: 9px 10px;
            border: 0;
            border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
            border-radius: 0;
            color: var(--text);
            background: color-mix(in srgb, var(--accent) 16%, transparent);
            text-align: left;
            font-size: 12px;
            font-weight: 650;
        }
        .inline-back:hover {
            background: color-mix(in srgb, var(--accent) 24%, transparent);
        }
        .inline-search-wrap {
            padding: 8px 9px;
            border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
        }
        .inline-search {
            min-height: 30px;
            padding: 6px 8px;
            border-radius: 7px;
            font-size: 12px;
        }
        .inline-popover-list {
            overflow: auto;
            min-height: 0;
            padding: 4px;
        }
        .inline-popover-foot {
            padding: 7px 10px;
            border-top: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
        }
        .inline-divider {
            height: 1px;
            margin: 4px 6px;
            background: color-mix(in srgb, var(--border) 72%, transparent);
        }
        .inline-link {
            width: auto;
            min-height: 0;
            padding: 0;
            border: 0;
            color: var(--muted);
            background: transparent;
            font-size: 12px;
            text-align: left;
        }
        .inline-link:hover {
            color: var(--text);
            text-decoration: underline;
        }
        .inline-option {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 4px 10px;
            width: 100%;
            padding: 8px 9px;
            border: 0;
            border-radius: 7px;
            background: transparent;
            color: var(--text);
            text-align: left;
        }
        .inline-option:hover,
        .inline-option.active {
            background: color-mix(in srgb, var(--accent) 18%, transparent);
        }
        .inline-option .main {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .inline-option .sub,
        .inline-option .mark {
            color: var(--muted);
            font-size: 11px;
        }
        .inline-option .mark { align-self: center; }
        .inline-option.provider {
            font-weight: 650;
        }
        .context-badges {
            display: flex;
            gap: 6px;
            align-items: center;
            flex-wrap: wrap;
            min-width: 0;
        }
        .context-badge {
            display: inline-flex;
            gap: 6px;
            align-items: center;
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
        .context-badge.workflow {
            border-color: color-mix(in srgb, var(--warning) 60%, var(--border));
            color: var(--text);
            background: color-mix(in srgb, var(--warning) 30%, transparent);
        }
        .context-badge button {
            border: 0;
            background: transparent;
            color: inherit;
            cursor: pointer;
            padding: 0 1px;
            line-height: 1;
        }
        .mention-menu {
            display: none;
            max-height: 220px;
            overflow: auto;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: color-mix(in srgb, var(--panel) 96%, black 4%);
            box-shadow: 0 10px 28px rgba(0, 0, 0, .32);
        }
        .mention-menu.open { display: grid; }
        .mention-option {
            display: grid;
            gap: 2px;
            padding: 8px 10px;
            border: 0;
            border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
            background: transparent;
            color: var(--text);
            text-align: left;
            cursor: pointer;
        }
        .mention-option:hover { background: color-mix(in srgb, var(--accent) 18%, transparent); }
        .mention-option small { color: var(--muted); }
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
        button.icon-button {
            display: inline-grid;
            place-items: center;
            width: 30px;
            min-width: 30px;
            height: 30px;
            padding: 0;
        }
        button.icon-button svg {
            width: 15px;
            height: 15px;
            stroke: currentColor;
            fill: none;
            stroke-width: 1.8;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .composer button.small,
        .composer .send-button,
        .composer .stop-button {
            min-height: 28px;
            padding: 4px 8px;
            border-radius: 6px;
        }
        .send-button,
        .stop-button.active {
            display: inline-grid;
            place-items: center;
            width: 32px;
            min-width: 32px;
            height: 32px;
            padding: 0;
            border-radius: 9px;
            line-height: 1;
            box-shadow: 0 1px 0 color-mix(in srgb, white 18%, transparent) inset;
        }
        .send-button svg,
        .stop-button svg {
            width: 15px;
            height: 15px;
            stroke: currentColor;
            fill: none;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .stop-button {
            display: none;
        }
        .stop-button.active {
            color: var(--error);
            background: transparent;
            border: 1px solid color-mix(in srgb, var(--error) 55%, var(--border));
            box-shadow: none;
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
                        <div class="chat-title-row">
                            <div class="chat-title">Workflow Architect</div>
                            <div id="conversation-title" class="conversation-title"></div>
                            <div class="workbench-build" title="Agent Workbench build">${safeWorkbenchBuild}</div>
                        </div>
                        <div class="context-actions">
                            <div id="context-pill" class="context-pill" title="Context usage">
                                <span id="context-label">Context</span>
                                <span class="context-meter" aria-hidden="true"><span id="context-meter-fill" class="context-meter-fill"></span></span>
                            </div>
                            <button id="compact-context" class="ghost small icon-button" type="button" title="Compact context" aria-label="Compact context">${compactIcon}</button>
                        </div>
                    </div>
                    <div class="header-actions">
                        <button id="checkpoint-open" class="ghost small icon-button" type="button" title="Checkpoints" aria-label="Checkpoints">${checkpointIcon}</button>
                        <button id="history-open" class="ghost small icon-button" type="button" title="Conversation history" aria-label="Conversation history">${historyIcon}</button>
                        <button id="new-session-header" class="ghost small icon-button" type="button" title="New conversation" aria-label="New conversation">${newConversationIcon}</button>
                        <div id="new-session-menu" class="inline-popover new-session" role="menu" aria-label="Start new conversation"></div>
                    </div>
                </div>
            </header>
            <div id="feed" class="feed"></div>
            <div id="run-indicator" class="run-indicator" aria-label="Agent running" title="Agent running">
                <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
            </div>
            <form id="composer" class="composer">
                <div class="composer-input">
                    <div id="context-badges" class="context-badges"></div>
                    <div id="pending-prompt" class="pending-prompt" aria-live="polite"></div>
                    <div id="runtime-finalizing" class="runtime-finalizing" aria-live="polite">Finalizing context before the next run...</div>
                    <div id="mention-menu" class="mention-menu"></div>
                    <textarea id="prompt" placeholder="Ask the n8n agent what to do with this workflow..." rows="2"></textarea>
                    <div class="composer-toolbar">
                        <div class="composer-provider">
                            <button id="select-model" class="secondary small" type="button" title="${safeProviderModelLabel}">${safeProviderModelLabel}</button>
                            <button id="select-reasoning" class="secondary small" type="button">Reasoning</button>
                            <div id="provider-menu" class="inline-popover" role="menu"></div>
                            <div id="reasoning-menu" class="inline-popover reasoning" role="menu"></div>
                        </div>
                        <div class="composer-actions">
                            <button id="stop" class="ghost stop-button" type="button" title="Stop" aria-label="Stop" disabled>${stopIcon}</button>
                            <button id="send" class="send-button" type="submit" title="Send" aria-label="Send">${sendIcon}</button>
                        </div>
                    </div>
                </div>
            </form>
        </section>
        ${hasWorkflow ? `<section class="workflow" aria-label="n8n workflow">
            <div id="refresh-pill" class="refresh-pill">Refreshing n8n...</div>
            ${hasWorkflowUi ? `<iframe
                id="workflow-frame"
                src="${safeWorkflowUrl}"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation allow-top-navigation-by-user-activation"
                allow="${iframeAllowPolicy}">
            </iframe>` : `<div class="empty-workflow"><div><strong>Workflow UI unavailable</strong><br>Push this workflow to n8n to preview and interact with its UI here.</div></div>`}
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
                    </select>
                </div>
                <div id="session-list" class="sessions history-list"></div>
                <div class="history-foot">
                    <button id="new-session" class="secondary small" type="button">New chat</button>
                </div>
            </div>
        </div>
        <div id="checkpoint-overlay" class="checkpoint-overlay" role="dialog" aria-modal="true" aria-label="Checkpoints">
            <div class="checkpoint-modal">
                <div class="checkpoint-head">
                    <div>
                        <div class="checkpoint-title">Checkpoints</div>
                        <div class="meta-text">Save, restore, or delete checkpoints for this conversation.</div>
                    </div>
                    <button id="checkpoint-close" class="ghost small" type="button" aria-label="Close checkpoints">Close</button>
                </div>
                <div id="checkpoint-list" class="checkpoint-list sessions"></div>
                <div class="checkpoint-foot">
                    <button id="checkpoint-save" class="secondary small" type="button">Save checkpoint</button>
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
        let currentWorkflowContext = null;
        let currentNodeContexts = [];
        let activeFilter = 'current';
        let state = null;
        let providerModelCache = {};
        let providerMenuOpen = false;
        let providerMenuMode = 'models';
        let providerMenuProvider = '';
        let modelSearchQuery = '';
        let reasoningMenuOpen = false;
        let newSessionMenuOpen = false;
        let autoScrollFeed = true;
        let pendingPrompt = null;
        let runtimeFinalizing = false;
        let lastStateSequence = 0;
        const rewoundMessageIds = new Set();
        const expandedDetailKeys = new Set();

        const OP_ICONS = {
            'file-read': ${JSON.stringify(readOpIcon)},
            'file-write': ${JSON.stringify(writeOpIcon)},
            shell: ${JSON.stringify(shellOpIcon)},
            web: ${JSON.stringify(webOpIcon)},
            tool: ${JSON.stringify(toolOpIcon)},
            agent: ${JSON.stringify(agentOpIcon)},
            phase: ${JSON.stringify(phaseOpIcon)},
            thinking: ${JSON.stringify(thinkingOpIcon)},
            todo: ${JSON.stringify(todoOpIcon)}
        };

        const STATUS_ICONS = {
            running: ${JSON.stringify(statusRunningIcon)},
            done: ${JSON.stringify(statusDoneIcon)},
            error: ${JSON.stringify(statusErrorIcon)}
        };

        const feed = document.getElementById('feed');
        const form = document.getElementById('composer');
        const promptInput = document.getElementById('prompt');
        const pendingPromptEl = document.getElementById('pending-prompt');
        const runtimeFinalizingEl = document.getElementById('runtime-finalizing');
        const sendButton = document.getElementById('send');
        const stopButton = document.getElementById('stop');
        const selectModelButton = document.getElementById('select-model');
        const selectReasoningButton = document.getElementById('select-reasoning');
        const providerMenu = document.getElementById('provider-menu');
        const reasoningMenu = document.getElementById('reasoning-menu');
        const frame = document.getElementById('workflow-frame');
        const refreshPill = document.getElementById('refresh-pill');
        const contextBadges = document.getElementById('context-badges');
        const mentionMenu = document.getElementById('mention-menu');
        const conversationTitle = document.getElementById('conversation-title');
        const sessionList = document.getElementById('session-list');
        const sessionFilter = document.getElementById('session-filter');
        const contextPill = document.getElementById('context-pill');
        const contextLabel = document.getElementById('context-label');
        const contextMeterFill = document.getElementById('context-meter-fill');
        const newSessionButton = document.getElementById('new-session');
        const newSessionHeaderButton = document.getElementById('new-session-header');
        const newSessionMenu = document.getElementById('new-session-menu');
        const checkpointOpenButton = document.getElementById('checkpoint-open');
        const checkpointCloseButton = document.getElementById('checkpoint-close');
        const checkpointOverlay = document.getElementById('checkpoint-overlay');
        const checkpointList = document.getElementById('checkpoint-list');
        const checkpointSaveButton = document.getElementById('checkpoint-save');
        const historyOpenButton = document.getElementById('history-open');
        const historyCloseButton = document.getElementById('history-close');
        const historyOverlay = document.getElementById('history-overlay');
        const runIndicator = document.getElementById('run-indicator');
        const compactContextButton = document.getElementById('compact-context');

        function on(element, eventName, handler) {
            if (element) element.addEventListener(eventName, handler);
        }

        function isFeedNearBottom() {
            if (!feed) return true;
            return feed.scrollHeight - feed.scrollTop - feed.clientHeight <= 48;
        }

        function setRunning(running) {
            isRunning = running;
            sendButton.disabled = false;
            stopButton.disabled = !running;
            stopButton.classList.toggle('active', running);
            newSessionButton.disabled = running;
            newSessionHeaderButton.disabled = running;
            checkpointOpenButton.disabled = running;
            checkpointSaveButton.disabled = running;
            compactContextButton.disabled = running;
            if (runIndicator) runIndicator.classList.toggle('active', running);
            renderRuntimeFinalizing();
            renderCheckpoints();
            renderFeed();
        }

        function renderPendingPrompt() {
            if (!pendingPromptEl) return;
            if (!pendingPrompt) {
                pendingPromptEl.classList.remove('open');
                pendingPromptEl.innerHTML = '';
                return;
            }
            pendingPromptEl.classList.add('open');
            pendingPromptEl.innerHTML =
                '<div class="pending-prompt-main">' +
                    '<span class="pending-prompt-label">' + (pendingPrompt.mode === 'steering' ? 'Steering' : 'Pending') + '</span>' +
                    '<span class="pending-prompt-text" title="' + escapeHtml(pendingPrompt.text) + '">' + escapeHtml(pendingPrompt.text) + '</span>' +
                '</div>' +
                '<button id="pending-steer" class="secondary small" type="button"' + (pendingPrompt.mode === 'steering' ? ' disabled' : '') + '>Steer</button>';
            const steerButton = document.getElementById('pending-steer');
            on(steerButton, 'click', () => {
                if (!pendingPrompt || !state) return;
                pendingPrompt = { ...pendingPrompt, mode: 'steering' };
                renderPendingPrompt();
                vscode.postMessage({ type: 'agent.steer', text: pendingPrompt.text, workflowId, nodeContexts: currentNodeContexts, sessionId: state.activeSessionId });
            });
        }

        function renderRuntimeFinalizing() {
            if (!runtimeFinalizingEl) return;
            runtimeFinalizingEl.classList.toggle('open', Boolean(runtimeFinalizing));
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

        function sameNode(a, b) {
            return a && b && a.name === b.name && (a.type || '') === (b.type || '') && (a.id || '') === (b.id || '');
        }

        function setNodeContexts(nodes, notify) {
            const next = [];
            for (const value of Array.isArray(nodes) ? nodes : (nodes ? [nodes] : [])) {
                const node = sanitizeNodeContext(value);
                if (!node || next.some((existing) => sameNode(existing, node))) continue;
                next.push(node);
            }
            currentNodeContexts = currentWorkflowContext ? next : [];
            renderContextBadges();
            if (notify && state) {
                vscode.postMessage({ type: 'agent.nodeDetailChanged', workflowId, nodeContexts: currentNodeContexts, sessionId: state.activeSessionId });
            }
        }

        function addNodeContext(node, notify) {
            if (!currentWorkflowContext) return;
            const normalized = sanitizeNodeContext(node);
            if (!normalized || currentNodeContexts.some((existing) => sameNode(existing, normalized))) return;
            setNodeContexts([...currentNodeContexts, normalized], notify);
        }

        function renderContextBadges() {
            if (!contextBadges) return;
            contextBadges.innerHTML = '';
            if (currentWorkflowContext) {
                contextBadges.appendChild(contextBadge('@workflow ' + currentWorkflowContext.name, 'workflow', 'Detach workflow context', () => {
                    currentWorkflowContext = null;
                    currentNodeContexts = [];
                    renderContextBadges();
                    if (state) vscode.postMessage({ type: 'agent.context.workflow.clear', sessionId: state.activeSessionId });
                }));
            }
            for (const node of currentNodeContexts) {
                contextBadges.appendChild(contextBadge('@node ' + node.name, 'node', 'Remove node context', () => {
                    setNodeContexts(currentNodeContexts.filter((candidate) => !sameNode(candidate, node)), true);
                }));
            }
        }

        function contextBadge(text, type, label, onClose) {
            const badge = document.createElement('span');
            badge.className = 'context-badge ' + type;
            const title = document.createElement('span');
            title.textContent = text;
            const close = document.createElement('button');
            close.type = 'button';
            close.setAttribute('aria-label', label);
            close.title = label;
            close.textContent = '×';
            close.addEventListener('click', onClose);
            badge.append(title, close);
            return badge;
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
                const activeWorkflowKey = currentWorkflowContext && (currentWorkflowContext.id || currentWorkflowContext.filename || currentWorkflowContext.name);
                if (!activeWorkflowKey) return !session.workflowContext;
                const sessionWorkflow = session.workflowContext || {};
                return sessionWorkflow.id === activeWorkflowKey || sessionWorkflow.filename === activeWorkflowKey || sessionWorkflow.name === activeWorkflowKey;
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
                const item = document.createElement('div');
                item.className = 'session-item' + (session.isActive ? ' active' : '');
                const selectButton = document.createElement('button');
                selectButton.type = 'button';
                selectButton.className = 'session-select';
                selectButton.setAttribute('aria-label', 'Open conversation ' + session.title);
                const selectSession = () => {
                    closeHistory();
                    vscode.postMessage({ type: 'agent.session.select', sessionId: session.id });
                };
                selectButton.addEventListener('click', selectSession);

                const head = document.createElement('div');
                head.className = 'session-item-head';
                const title = document.createElement('div');
                title.className = 'session-item-title';
                title.textContent = session.title;

                const badges = document.createElement('div');
                badges.className = 'session-item-badges';
                if (session.isActive) badges.appendChild(badge('Active', 'active'));
                if (session.checkpointCount) badges.appendChild(badge(session.checkpointCount + ' cp', 'success'));
                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.className = 'ghost session-delete';
                deleteButton.title = 'Delete conversation';
                deleteButton.setAttribute('aria-label', 'Delete conversation ' + session.title);
                deleteButton.innerHTML = ${JSON.stringify(trashIcon)};
                deleteButton.disabled = Boolean(isRunning && session.isActive);
                deleteButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (deleteButton.disabled) return;
                    const confirmed = window.confirm('Delete this conversation? This cannot be undone.');
                    if (!confirmed) return;
                    vscode.postMessage({ type: 'agent.session.delete', sessionId: session.id });
                });
                badges.appendChild(deleteButton);
                head.appendChild(title);

                const foot = document.createElement('div');
                foot.className = 'session-item-foot';
                const attachment = document.createElement('span');
                attachment.textContent = session.workflowLabel;
                const updated = document.createElement('span');
                updated.textContent = formatDate(session.updatedAt);
                foot.append(attachment, updated);

                selectButton.append(head, foot);
                item.append(selectButton, badges);
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

        function renderCheckpoints() {
            if (!checkpointList) return;
            checkpointList.innerHTML = '';
            const session = getActiveSession();
            const checkpoints = session && Array.isArray(session.checkpoints) ? session.checkpoints : [];
            if (!checkpoints.length) {
                const empty = document.createElement('div');
                empty.className = 'empty-note';
                empty.textContent = 'No checkpoints for this conversation yet.';
                checkpointList.appendChild(empty);
                return;
            }
            for (const checkpoint of checkpoints) {
                const item = document.createElement('div');
                item.className = 'checkpoint-item';

                const head = document.createElement('div');
                head.className = 'checkpoint-item-head';
                const titleWrap = document.createElement('div');
                const title = document.createElement('div');
                title.className = 'checkpoint-item-title';
                title.textContent = checkpoint.label || checkpoint.summary || 'Checkpoint';
                const meta = document.createElement('div');
                meta.className = 'checkpoint-item-meta';
                const metaParts = [formatDate(checkpoint.createdAt), (checkpoint.messageCount || 0) + ' messages'];
                if (checkpoint.restoredAt) metaParts.push('Restored ' + formatDate(checkpoint.restoredAt));
                meta.textContent = metaParts.join(' · ');
                titleWrap.append(title, meta);
                head.appendChild(titleWrap);
                if (checkpoint.reason) head.appendChild(badge(checkpoint.reason, 'success'));

                const foot = document.createElement('div');
                foot.className = 'checkpoint-item-foot';
                const summary = document.createElement('div');
                summary.className = 'checkpoint-item-meta';
                summary.textContent = checkpoint.summary || '';
                const actions = document.createElement('div');
                actions.className = 'checkpoint-actions';
                const restore = document.createElement('button');
                restore.type = 'button';
                restore.className = 'secondary small';
                restore.textContent = 'Restore';
                restore.disabled = isRunning;
                restore.addEventListener('click', () => {
                    if (!state || !state.activeSessionId) return;
                    if (!window.confirm('Restore this checkpoint? The agent runtime and saved Workbench surface state will be restored.')) return;
                    closeCheckpointPanel();
                    vscode.postMessage({ type: 'agent.checkpoint.restore', sessionId: state.activeSessionId, checkpointId: checkpoint.id });
                });
                const del = document.createElement('button');
                del.type = 'button';
                del.className = 'ghost small';
                del.textContent = 'Delete';
                del.disabled = isRunning;
                del.addEventListener('click', () => {
                    if (!state || !state.activeSessionId) return;
                    if (!window.confirm('Delete this checkpoint? This cannot be undone.')) return;
                    vscode.postMessage({ type: 'agent.checkpoint.delete', sessionId: state.activeSessionId, checkpointId: checkpoint.id });
                });
                actions.append(restore, del);
                foot.append(summary, actions);
                item.append(head, foot);
                checkpointList.appendChild(item);
            }
        }

        function openCheckpointPanel() {
            closeHistory();
            renderCheckpoints();
            checkpointOverlay.classList.add('open');
        }

        function closeCheckpointPanel() {
            checkpointOverlay.classList.remove('open');
        }

        function closeInlineMenus() {
            providerMenuOpen = false;
            reasoningMenuOpen = false;
            newSessionMenuOpen = false;
            if (providerMenu) providerMenu.classList.remove('open');
            if (reasoningMenu) reasoningMenu.classList.remove('open');
            if (newSessionMenu) newSessionMenu.classList.remove('open');
        }

        function workflowKey(workflow) {
            return workflow && (workflow.id || workflow.filename || workflow.name || '');
        }

        function renderNewSessionMenu() {
            if (!newSessionMenu || !state) return;
            newSessionMenu.innerHTML = '';

            const head = document.createElement('div');
            head.className = 'inline-popover-head';
            head.innerHTML = '<strong>New conversation</strong><span>Select context</span>';
            newSessionMenu.appendChild(head);

            const list = document.createElement('div');
            list.className = 'inline-popover-list';
            if (currentWorkflowContext) {
                const current = inlineOption('This workflow', currentWorkflowContext.name || 'Current workflow', 'Current', 'workflow');
                current.disabled = isRunning;
                current.addEventListener('click', () => startNewSession(currentWorkflowContext));
                list.appendChild(current);
            }

            const blank = inlineOption('New workflow', 'Start without workflow context', '', 'workflow');
            blank.disabled = isRunning;
            blank.addEventListener('click', () => startNewSession(null));
            list.appendChild(blank);

            const workflows = Array.isArray(state.availableWorkflows) ? state.availableWorkflows : [];
            if (workflows.length) {
                const divider = document.createElement('div');
                divider.className = 'inline-divider';
                list.appendChild(divider);
            }
            const currentKey = workflowKey(currentWorkflowContext);
            for (const workflow of workflows) {
                const key = workflowKey(workflow);
                if (currentKey && key && key === currentKey) continue;
                const label = workflow.name || workflow.id || workflow.filename || 'Workflow';
                const detail = [workflow.filename, workflow.id].filter(Boolean).join(' · ') || 'Existing workflow';
                const option = inlineOption(label, detail, '', 'workflow');
                option.disabled = isRunning;
                option.addEventListener('click', () => startNewSession(workflow));
                list.appendChild(option);
            }

            newSessionMenu.appendChild(list);
            newSessionMenu.classList.toggle('open', newSessionMenuOpen);
        }

        function openNewSessionMenu() {
            closeHistory();
            closeCheckpointPanel();
            providerMenuOpen = false;
            reasoningMenuOpen = false;
            newSessionMenuOpen = !newSessionMenuOpen;
            if (providerMenu) providerMenu.classList.remove('open');
            if (reasoningMenu) reasoningMenu.classList.remove('open');
            renderNewSessionMenu();
        }

        function connectedProviders() {
            const providers = Array.isArray(state && state.providerOptions) ? [...state.providerOptions] : [];
            if (state && state.provider && !providers.some((provider) => provider.id === state.provider)) {
                providers.unshift({
                    id: state.provider,
                    label: state.provider,
                    description: 'Current provider',
                    selected: true,
                    connected: true,
                    model: state.model,
                });
            }
            return providers.filter((provider) => provider.connected || provider.selected);
        }

        function renderProviderMenu() {
            if (!providerMenu || !state) return;
            const providers = connectedProviders();
            const selectedProvider = state.provider || '';
            const activeProvider = providerMenuProvider || selectedProvider;
            providerMenu.innerHTML = '';
            if (providerMenuMode === 'providers') {
                renderProviderPicker(providers, selectedProvider);
            } else {
                renderModelPicker(providers, activeProvider, selectedProvider);
            }
            providerMenu.classList.toggle('open', providerMenuOpen);
        }

        function renderProviderPicker(providers, selectedProvider) {
            const head = document.createElement('div');
            head.className = 'inline-popover-head';
            head.innerHTML = '<strong>Connected providers</strong><span>' + escapeHtml(providers.length ? providers.length + ' connected' : 'none connected') + '</span>';
            providerMenu.appendChild(head);
            const list = document.createElement('div');
            list.className = 'inline-popover-list';
            if (!providers.length) {
                const empty = document.createElement('div');
                empty.className = 'empty-note';
                empty.textContent = 'No connected providers.';
                list.appendChild(empty);
            }
            for (const provider of providers) {
                const providerButton = inlineOption(provider.label || provider.id, provider.description || '', provider.id === selectedProvider ? 'Selected' : '', 'provider');
                providerButton.addEventListener('click', () => {
                    providerMenuMode = 'models';
                    providerMenuProvider = provider.id;
                    modelSearchQuery = '';
                    renderProviderMenu();
                    vscode.postMessage({ type: 'agent.selectModel', provider: provider.id });
                });
                list.appendChild(providerButton);
            }
            providerMenu.appendChild(list);
            appendProviderMenuFooter();
        }

        function renderModelPicker(providers, activeProvider, selectedProvider) {
            const provider = providers.find((candidate) => candidate.id === activeProvider) || providers.find((candidate) => candidate.id === selectedProvider) || providers[0] || { id: selectedProvider, label: selectedProvider || 'Provider' };
            if (!providerMenuProvider && provider.id) providerMenuProvider = provider.id;
            const back = document.createElement('button');
            back.type = 'button';
            back.className = 'inline-back';
            back.textContent = '← Providers';
            back.addEventListener('click', () => {
                providerMenuMode = 'providers';
                modelSearchQuery = '';
                renderProviderMenu();
            });
            providerMenu.appendChild(back);

            const head = document.createElement('div');
            head.className = 'inline-popover-head';
            head.innerHTML = '<strong>' + escapeHtml(provider.label || provider.id || 'Provider') + '</strong><span>Models</span>';
            providerMenu.appendChild(head);

            const searchWrap = document.createElement('div');
            searchWrap.className = 'inline-search-wrap';
            const search = document.createElement('input');
            search.className = 'inline-search';
            search.type = 'text';
            search.placeholder = 'Search models...';
            search.value = modelSearchQuery;
            search.addEventListener('input', () => {
                modelSearchQuery = search.value || '';
                renderProviderMenu();
                const nextSearch = providerMenu.querySelector('.inline-search');
                if (nextSearch) {
                    nextSearch.focus();
                    nextSearch.selectionStart = nextSearch.selectionEnd = nextSearch.value.length;
                }
            });
            searchWrap.appendChild(search);
            providerMenu.appendChild(searchWrap);

            const list = document.createElement('div');
            list.className = 'inline-popover-list';
            const allModels = providerModelCache[provider.id] || (provider.id === selectedProvider ? state.modelOptions || [] : []);
            const query = modelSearchQuery.trim().toLowerCase();
            const models = allModels.filter((model) => !query || String(model.label || model.id || '').toLowerCase().includes(query));
            if (!allModels.length) {
                const loading = document.createElement('div');
                loading.className = 'empty-note';
                loading.textContent = 'Loading models...';
                list.appendChild(loading);
                if (provider.id) vscode.postMessage({ type: 'agent.selectModel', provider: provider.id });
            } else if (!models.length) {
                const empty = document.createElement('div');
                empty.className = 'empty-note';
                empty.textContent = 'No models match this search.';
                list.appendChild(empty);
            }
            for (const model of models) {
                const modelButton = inlineOption(model.label || model.id, model.fallback ? 'Known/default model' : provider.label || provider.id, model.selected ? 'Active' : '', 'model');
                modelButton.addEventListener('click', () => {
                    closeInlineMenus();
                    vscode.postMessage({ type: 'agent.providerModel.select', provider: provider.id, model: model.id || model.label });
                });
                list.appendChild(modelButton);
            }
            providerMenu.appendChild(list);
            appendProviderMenuFooter();
        }

        function appendProviderMenuFooter() {
            const foot = document.createElement('div');
            foot.className = 'inline-popover-foot';
            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'inline-link';
            add.textContent = 'Add more providers...';
            add.addEventListener('click', () => {
                closeInlineMenus();
                vscode.postMessage({ type: 'agent.providers.configure' });
            });
            foot.appendChild(add);
            providerMenu.appendChild(foot);
        }

        function renderReasoningMenu() {
            if (!reasoningMenu || !state) return;
            reasoningMenu.innerHTML = '';
            const head = document.createElement('div');
            head.className = 'inline-popover-head';
            head.textContent = 'Reasoning effort';
            reasoningMenu.appendChild(head);
            const list = document.createElement('div');
            list.className = 'inline-popover-list';
            const options = Array.isArray(state.reasoningOptions) ? state.reasoningOptions : [];
            for (const option of options) {
                const button = inlineOption(option.label || option.id, '', option.selected ? 'Active' : '', '');
                button.addEventListener('click', () => {
                    closeInlineMenus();
                    vscode.postMessage({ type: 'agent.selectReasoningEffort', effort: option.id || option.label });
                });
                list.appendChild(button);
            }
            reasoningMenu.appendChild(list);
            reasoningMenu.classList.toggle('open', reasoningMenuOpen && state.supportsReasoningEffort);
        }

        function inlineOption(label, sub, mark, klass) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'inline-option' + (klass ? ' ' + klass : '') + (mark ? ' active' : '');
            const main = document.createElement('span');
            main.className = 'main';
            main.textContent = label || '';
            const marker = document.createElement('span');
            marker.className = 'mark';
            marker.textContent = mark || '';
            button.append(main, marker);
            if (sub) {
                const detail = document.createElement('span');
                detail.className = 'sub';
                detail.textContent = sub;
                button.appendChild(detail);
            }
            return button;
        }

        function renderChatMeta() {
            if (!state) return;
            if (conversationTitle) {
                const title = state.session && state.session.title ? state.session.title : '';
                conversationTitle.textContent = title;
                conversationTitle.title = title;
            }
            const providerLabel = (state.provider || 'provider') + (state.model ? ' / ' + state.model : '');
            selectModelButton.textContent = providerLabel;
            selectModelButton.title = providerLabel;
            if (state.provider && Array.isArray(state.modelOptions)) providerModelCache[state.provider] = state.modelOptions;
            selectReasoningButton.textContent = state.reasoningEffort ? 'Reasoning ' + state.reasoningEffort : 'Reasoning';
            selectReasoningButton.style.display = state.supportsReasoningEffort ? 'inline-block' : 'none';
            renderProviderMenu();
            renderReasoningMenu();
            renderNewSessionMenu();
            const usage = state.session && state.session.contextUsage;
            if (!usage || usage.source !== 'api') {
                contextPill.classList.remove('active');
                contextLabel.textContent = 'Context';
                contextMeterFill.style.width = '0%';
                contextPill.title = 'Context usage unavailable';
                return;
            }
            const percent = Math.max(0, Math.min(100, Number(usage.fillPercent) || 0));
            contextPill.classList.add('active');
            contextLabel.textContent = percent + '% context';
            contextPill.title = percent + '% of ' + usage.contextWindowTokens + ' tokens · prompt ' + usage.promptTokens + ' · completion ' + usage.completionTokens + ' · ' + usage.source;
            contextMeterFill.style.width = percent + '%';
        }

        function renderFeed() {
            const shouldStickToBottom = autoScrollFeed || isFeedNearBottom();
            const previousScrollTop = feed.scrollTop;
            feed.innerHTML = '';
            const visibleEntries = state && state.session && Array.isArray(state.session.entries)
                ? state.session.entries.filter((entry) => entry.kind !== 'context-usage' && entry.kind !== 'workflow-context' && entry.kind !== 'node-context')
                : [];
            if (!visibleEntries.length) {
                return;
            }
            for (let idx = 0; idx < visibleEntries.length; idx += 1) {
                feed.appendChild(renderEntry(visibleEntries[idx], idx));
            }
            if (shouldStickToBottom) {
                feed.scrollTop = feed.scrollHeight;
                autoScrollFeed = true;
            } else {
                feed.scrollTop = previousScrollTop;
            }
        }

        function renderEntry(entry, index) {
            if (entry.kind === 'user-message') {
                return userMessageEntry(entry);
            }
            if (entry.kind === 'system-notice') {
                return textEntry('system', entry.text);
            }
            if (entry.kind === 'assistant-body') {
                return assistantMessageEntry(entry);
            }
            if (entry.kind === 'context-usage') return document.createComment('context usage');
            if (entry.kind === 'workflow-context' || entry.kind === 'node-context') return document.createComment('context marker');
            if (entry.kind === 'compaction') {
                const el = document.createElement('div');
                el.className = 'entry compaction';
                const isFallback = entry.event.source === 'fallback';
                const title = isFallback ? 'Context compacted with fallback' : 'Context compacted';
                const detailText =
                    'Source: ' + escapeText(entry.event.source) + '\\n' +
                    'Messages compacted: ' + escapeText(entry.event.messagesCompacted) + '\\n' +
                    'Preserved recent messages: ' + escapeText(entry.event.preservedRecentMessages) +
                    (entry.event.estimatedTokens ? '\\nEstimated tokens: ' + escapeText(entry.event.estimatedTokens) : '') +
                    (entry.event.thresholdTokens ? '\\nThreshold tokens: ' + escapeText(entry.event.thresholdTokens) : '') +
                    (entry.event.fallbackReason ? '\\nFallback reason: ' + escapeText(entry.event.fallbackReason) : '');
                const details = createPersistentDetails(getEntryDetailKey(entry, index), 'Show compaction details', detailText);
                el.innerHTML = '<div class="entry-head"><div class="entry-title">' + escapeHtml(title) + '</div><div class="entry-subtle">' + escapeHtml(new Date(entry.timestamp).toLocaleTimeString()) + '</div></div><div>' + escapeHtml(entry.event.summary) + '</div>';
                el.appendChild(details);
                return el;
            }
            if (entry.kind === 'operation') {
                const el = document.createElement('div');
                el.className = 'entry operation';
                const icon = OP_ICONS[entry.category || 'tool'] || OP_ICONS.tool;
                const statusClass = entry.status ? ' ' + entry.status : '';
                const statusLabel = entry.status || entry.tone || '';
                const statusIcon = STATUS_ICONS[entry.status] || '';
                const title = entry.title || 'Operation';
                const compactHtml = formatOperationCompactHtml(entry);
                el.innerHTML = '<div class="entry-head">' +
                    '<div class="entry-title">' +
                    '<span class="entry-kind-icon" aria-hidden="true">' + icon + '</span>' +
                    '<span>' + escapeHtml(title) + '</span></div>' +
                    '<div class="entry-status' + escapeHtml(statusClass) + '" title="' + escapeHtml(statusLabel) + '" aria-label="' + escapeHtml(statusLabel) + '">' + statusIcon + '<span class="sr-only">' + escapeHtml(statusLabel) + '</span></div>' +
                    '</div>' +
                    compactHtml;
                if (entry.body || entry.summary) {
                    el.appendChild(createPersistentDetails(getEntryDetailKey(entry, index), 'Show details', formatOperationDetailsBody(entry)));
                }
                return el;
            }
            return textEntry('system', 'Unsupported entry');
        }

        function getEntryDetailKey(entry, index) {
            return (entry && entry.id ? entry.id : (entry.kind || 'entry') + ':' + index) + ':details';
        }

        function createPersistentDetails(key, label, body) {
            const details = document.createElement('details');
            details.className = 'details';
            details.open = expandedDetailKeys.has(key);
            details.addEventListener('toggle', () => {
                if (details.open) expandedDetailKeys.add(key);
                else expandedDetailKeys.delete(key);
            });
            const summary = document.createElement('summary');
            summary.textContent = label;
            const content = document.createElement('div');
            content.className = 'details-body';
            content.textContent = escapeText(body);
            details.append(summary, content);
            return details;
        }

        function formatOperationCompactHtml(entry) {
            if (entry.category === 'todo') return formatTodoCompactHtml(entry);
            const command = getOperationCommand(entry);
            const filePath = getOperationFilePath(entry);
            const result = formatOperationResultPreview(entry, command);
            const fileLabel = isPlanFileOperation(entry, filePath) ? 'Plan' : 'File';
            if (!command && !filePath && !result) return '';
            return '<div class="operation-compact">' +
                (command ? operationRowHtml('Command', command, true) : '') +
                (filePath ? operationRowHtml(fileLabel, filePath, true) : '') +
                (result ? operationRowHtml(entry.category === 'file-read' ? 'Preview' : 'Output', result, false) : '') +
                '</div>';
        }

        function operationRowHtml(label, value, code) {
            return '<div class="operation-row"><span class="operation-label">' + escapeHtml(label) + '</span><' + (code ? 'code' : 'span') + ' class="operation-value' + (code ? ' operation-code' : '') + '">' + escapeHtml(value) + '</' + (code ? 'code' : 'span') + '></div>';
        }

        function getOperationCommand(entry) {
            if (entry.category !== 'shell') return '';
            for (const value of [entry.summary, entry.detail, entry.body]) {
                const text = String(value || '').trim();
                if (text.startsWith('$ ')) return text.slice(2).trim();
            }
            return '';
        }

        function getOperationFilePath(entry) {
            if (entry.category !== 'file-read' && entry.category !== 'file-write') return '';
            for (const value of [entry.summary, entry.detail, entry.body, entry.title]) {
                const parsed = extractFilePathFromValue(value);
                if (parsed) return parsed;
            }
            return '';
        }

        function extractFilePathFromValue(value) {
            const seen = new Set();
            function visit(candidate) {
                if (candidate == null) return '';
                if (typeof candidate === 'string') {
                    const trimmed = candidate.trim();
                    if (!trimmed) return '';
                    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && !seen.has(trimmed)) {
                        seen.add(trimmed);
                        try { return visit(JSON.parse(trimmed)); } catch (e) { /* fall through */ }
                    }
                    const quoted = trimmed.match(/['"]([^'"]+\\/[^'"]+)['"]/);
                    if (quoted) return quoted[1];
                    const afterVerb = trimmed.match(/^(?:Read|Write|Edit)\\s+(.+)$/i);
                    if (afterVerb && afterVerb[1].includes('/')) return afterVerb[1].trim();
                    if (trimmed.startsWith('/') && !trimmed.includes('\\n')) return trimmed;
                    return '';
                }
                if (Array.isArray(candidate)) {
                    for (const item of candidate) {
                        const filePath = visit(item);
                        if (filePath) return filePath;
                    }
                    return '';
                }
                if (typeof candidate === 'object') {
                    for (const key of ['file_path', 'filePath', 'path']) {
                        if (typeof candidate[key] === 'string' && candidate[key].trim()) return candidate[key].trim();
                    }
                    for (const key of ['input', 'args', 'kwargs', 'update']) {
                        const filePath = visit(candidate[key]);
                        if (filePath) return filePath;
                    }
                }
                return '';
            }
            return visit(value);
        }

        function isPlanFileOperation(entry, filePath) {
            if (!filePath || !/\\.md$/i.test(filePath)) return false;
            return /plan|planning|spec|proposal|implementation/i.test(filePath + ' ' + (entry.title || '') + ' ' + (entry.summary || ''));
        }

        function formatOperationResultPreview(entry, command) {
            const raw = entry.category === 'shell'
                ? (entry.body && String(entry.body).trim() !== ('$ ' + command) ? entry.body : '')
                : (entry.detail || entry.summary || '');
            const extracted = extractReadableToolText(raw);
            if (extracted) return truncateCompactText(extracted);
            if (looksLikeStructuredPayload(raw)) return '';
            return truncateCompactText(raw);
        }

        function formatOperationDetailsBody(entry) {
            if (entry.category === 'todo') {
                const todoText = formatTodosText(extractTodosFromValue(entry.body || entry.summary || entry.detail));
                if (todoText) return todoText;
            }
            const raw = entry.body || entry.summary || '';
            const extracted = extractReadableToolText(raw);
            return extracted || raw;
        }

        function formatTodoCompactHtml(entry) {
            const todos = extractTodosFromValue(entry.body || entry.summary || entry.detail);
            if (!todos.length) {
                const result = formatOperationResultPreview(entry, '');
                return result ? '<div class="operation-compact">' + operationRowHtml('Todos', result, false) + '</div>' : '';
            }
            const counts = todos.reduce((acc, todo) => {
                const status = String(todo.status || 'pending');
                acc[status] = (acc[status] || 0) + 1;
                return acc;
            }, {});
            const active = todos.find((todo) => todo.status === 'in_progress') || todos.find((todo) => todo.status === 'pending') || todos[0];
            const summary = [
                todos.length + ' item' + (todos.length === 1 ? '' : 's'),
                counts.in_progress ? counts.in_progress + ' in progress' : '',
                counts.pending ? counts.pending + ' pending' : '',
                counts.completed ? counts.completed + ' completed' : '',
            ].filter(Boolean).join(' · ');
            return '<div class="operation-compact">' +
                operationRowHtml('Todos', summary, false) +
                (active && active.content ? operationRowHtml(active.status === 'in_progress' ? 'Current' : 'Next', String(active.content), false) : '') +
                formatTodoChecklistHtml(todos) +
                '</div>';
        }

        function formatTodoChecklistHtml(todos) {
            if (!todos.length) return '';
            return '<div class="todo-checklist">' + todos.map((todo) => {
                const status = String(todo.status || 'pending');
                const normalized = status.replace(/_/g, '-');
                const checked = status === 'completed';
                const marker = checked ? '✓' : status === 'in_progress' ? '·' : '';
                return '<div class="todo-item ' + escapeHtml(normalized) + '">' +
                    '<span class="todo-box" aria-hidden="true">' + escapeHtml(marker) + '</span>' +
                    '<span class="todo-text">' + escapeHtml(String(todo.content || '')) + '</span>' +
                    '</div>';
            }).join('') + '</div>';
        }

        function extractTodosFromValue(value) {
            const seen = new Set();
            function visit(candidate) {
                if (candidate == null) return [];
                if (typeof candidate === 'string') {
                    const trimmed = candidate.trim();
                    if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('[')) || seen.has(trimmed)) return [];
                    seen.add(trimmed);
                    try { return visit(JSON.parse(trimmed)); } catch (e) { return []; }
                }
                if (Array.isArray(candidate)) {
                    if (candidate.every((item) => item && typeof item === 'object' && 'content' in item)) return candidate;
                    return candidate.flatMap(visit);
                }
                if (typeof candidate === 'object') {
                    if (Array.isArray(candidate.todos)) return visit(candidate.todos);
                    for (const key of ['update', 'input', 'args', 'kwargs']) {
                        const todos = visit(candidate[key]);
                        if (todos.length) return todos;
                    }
                }
                return [];
            }
            return visit(value);
        }

        function formatTodosText(todos) {
            if (!todos.length) return '';
            return todos.map((todo) => '[' + String(todo.status || 'pending').replace(/_/g, ' ') + '] ' + String(todo.content || '')).join('\\n');
        }

        function truncateCompactText(value) {
            const normalized = String(value || '').replace(/\\s+/g, ' ').trim();
            if (!normalized) return '';
            return normalized.length > 220 ? normalized.slice(0, 220) + '...' : normalized;
        }

        function looksLikeStructuredPayload(value) {
            const text = String(value || '').trim();
            return text.startsWith('{') || text.startsWith('[') || text.includes('"lc":') || text.includes('"kwargs":') || text.includes('ToolMessage');
        }

        function extractReadableToolText(value) {
            const seen = new Set();
            function visit(candidate) {
                if (candidate == null) return '';
                if (typeof candidate === 'string') {
                    const trimmed = candidate.trim();
                    if (!trimmed) return '';
                    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && !seen.has(trimmed)) {
                        seen.add(trimmed);
                        try {
                            return visit(JSON.parse(trimmed));
                        } catch (e) {
                            return looksLikeStructuredPayload(trimmed) ? '' : trimmed;
                        }
                    }
                    return looksLikeStructuredPayload(trimmed) ? '' : trimmed;
                }
                if (Array.isArray(candidate)) {
                    return candidate.map(visit).filter(Boolean).join('\\n');
                }
                if (typeof candidate === 'object') {
                    if (candidate.kwargs && typeof candidate.kwargs.content === 'string') return visit(candidate.kwargs.content);
                    if (typeof candidate.text === 'string') return visit(candidate.text);
                    if (typeof candidate.content === 'string') return visit(candidate.content);
                    if (Array.isArray(candidate.content)) return visit(candidate.content);
                    if (candidate.kwargs) return visit(candidate.kwargs);
                    if (candidate.update) return visit(candidate.update);
                    if (candidate.output) return visit(candidate.output);
                }
                return '';
            }
            return visit(value);
        }

        function textEntry(kind, text) {
            const el = document.createElement('div');
            el.className = 'entry ' + kind;
            el.textContent = text || '';
            return el;
        }

        function userMessageEntry(entry) {
            const wrap = document.createElement('div');
            wrap.className = 'message-group user-message';
            const el = document.createElement('div');
            el.className = 'entry user';
            const body = document.createElement('div');
            body.className = 'entry-body';
            body.textContent = entry.text || '';
            el.appendChild(body);
            wrap.appendChild(el);

            const checkpointId = entry.checkpoint && entry.checkpoint.workbenchCheckpointId;
            if (checkpointId) {
                const actions = document.createElement('div');
                actions.className = 'message-actions';
                const rewind = document.createElement('button');
                rewind.type = 'button';
                rewind.className = 'message-action message-rewind';
                rewind.title = 'Rewind to before this message';
                rewind.setAttribute('aria-label', 'Rewind to before this message');
                rewind.disabled = isRunning;
                rewind.innerHTML = '${rewindIcon}';
                rewind.addEventListener('click', () => {
                    if (!state || !state.activeSessionId || isRunning) return;
                    rewindMessageOptimistically(entry);
                    vscode.postMessage({
                        type: 'agent.message.rewind',
                        sessionId: state.activeSessionId,
                        messageId: entry.id,
                    });
                });
                const copy = document.createElement('button');
                copy.type = 'button';
                copy.className = 'message-action';
                copy.title = 'Copy message';
                copy.setAttribute('aria-label', 'Copy message');
                copy.innerHTML = '${copyIcon}';
                copy.addEventListener('click', () => {
                    vscode.postMessage({ type: 'clipboard-write', text: entry.text || '' });
                });
                actions.append(rewind, copy);
                wrap.appendChild(actions);
            }
            return wrap;
        }

        function assistantMessageEntry(entry) {
            const wrap = document.createElement('div');
            wrap.className = 'message-group assistant-message';
            const el = textEntry('assistant' + (entry.streaming ? ' streaming' : ''), entry.text || '');
            wrap.appendChild(el);
            if (!entry.streaming && entry.text) {
                const actions = document.createElement('div');
                actions.className = 'message-actions';
                const copy = document.createElement('button');
                copy.type = 'button';
                copy.className = 'message-action';
                copy.title = 'Copy response';
                copy.setAttribute('aria-label', 'Copy response');
                copy.innerHTML = '${copyIcon}';
                copy.addEventListener('click', () => {
                    vscode.postMessage({ type: 'clipboard-write', text: entry.text || '' });
                });
                actions.append(copy);
                wrap.appendChild(actions);
            }
            return wrap;
        }

        function rewindMessageOptimistically(entry) {
            if (!state || !state.session || !Array.isArray(state.session.entries)) return;
            const entries = state.session.entries;
            const idx = entries.findIndex((candidate) => candidate && candidate.kind === 'user-message' && candidate.id === entry.id);
            if (idx < 0) return;
            rewoundMessageIds.add(entry.id);
            state.session.entries = entries.slice(0, idx);
            state.session.contextUsage = undefined;
            pendingPrompt = null;
            renderPendingPrompt();
            promptInput.value = entry.text || '';
            renderAll();
            promptInput.focus();
            promptInput.selectionStart = promptInput.selectionEnd = promptInput.value.length;
        }

        function renderAll() {
            currentWorkflowContext = state && state.session ? state.session.workflowContext || null : null;
            setNodeContexts(state && state.session ? state.session.nodeContexts || [] : [], false);
            renderSessions();
            renderChatMeta();
            renderFeed();
            renderMentionMenu();
            if (checkpointOverlay && checkpointOverlay.classList.contains('open')) renderCheckpoints();
        }

        function incomingStateContainsRewoundMessage(nextState) {
            if (!nextState || !nextState.session || !Array.isArray(nextState.session.entries) || !rewoundMessageIds.size) return false;
            return nextState.session.entries.some((entry) => entry && entry.kind === 'user-message' && rewoundMessageIds.has(entry.id));
        }

        function incomingStateDropsLiveEntries(nextState) {
            if (!state || !state.session || !nextState || !nextState.session) return false;
            if (state.activeSessionId !== nextState.activeSessionId) return false;
            const currentEntries = Array.isArray(state.session.entries) ? state.session.entries : [];
            const nextEntries = Array.isArray(nextState.session.entries) ? nextState.session.entries : [];
            if (nextEntries.length >= currentEntries.length) return false;
            const hasLiveEntry = currentEntries.some((entry) =>
                entry && ((entry.kind === 'assistant-body' && entry.streaming) || (entry.kind === 'operation' && entry.status === 'running'))
            );
            return isRunning || runtimeFinalizing || hasLiveEntry;
        }

        function acceptIncomingStateMessage(message) {
            const sequence = Number(message.stateSequence || 0);
            if (sequence && sequence < lastStateSequence) return false;
            if (incomingStateContainsRewoundMessage(message.state)) return false;
            if (incomingStateDropsLiveEntries(message.state)) return false;
            if (sequence) lastStateSequence = sequence;
            return true;
        }

        function getMentionQuery() {
            if (!promptInput) return null;
            const cursor = promptInput.selectionStart || 0;
            const before = promptInput.value.slice(0, cursor);
            const lower = before.toLowerCase();
            const workflowIndex = lower.lastIndexOf('@workflow');
            const nodeIndex = lower.lastIndexOf('@node');
            const start = Math.max(workflowIndex, nodeIndex);
            if (start < 0) return null;
            if (start > 0 && !' \t'.includes(before[start - 1])) return null;
            const kind = start === workflowIndex ? 'workflow' : 'node';
            const tokenLength = kind === 'workflow' ? '@workflow'.length : '@node'.length;
            const queryText = before.slice(start + tokenLength);
            if (queryText.includes(String.fromCharCode(10))) return null;
            return {
                kind,
                query: queryText.trim().toLowerCase(),
                start,
                end: cursor,
            };
        }

        function renderMentionMenu() {
            if (!mentionMenu) return;
            const mention = getMentionQuery();
            if (!mention || !state) {
                mentionMenu.classList.remove('open');
                mentionMenu.innerHTML = '';
                return;
            }
            if (mention.kind === 'node' && !currentWorkflowContext) {
                mentionMenu.classList.remove('open');
                mentionMenu.innerHTML = '';
                return;
            }
            const source = mention.kind === 'workflow' ? state.availableWorkflows || [] : state.availableNodes || [];
            const options = source.filter((item) => {
                const label = String(item.name || item.id || item.filename || '').toLowerCase();
                return !mention.query || label.includes(mention.query);
            }).slice(0, 12);
            mentionMenu.innerHTML = '';
            if (!options.length) {
                mentionMenu.classList.remove('open');
                return;
            }
            for (const option of options) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'mention-option';
                const label = document.createElement('span');
                label.textContent = option.name || option.id || option.filename || 'Workflow';
                const detail = document.createElement('small');
                detail.textContent = mention.kind === 'workflow'
                    ? [option.filename, option.id].filter(Boolean).join(' · ') || 'Workflow'
                    : [option.type, option.id].filter(Boolean).join(' · ') || 'Node';
                button.append(label, detail);
                button.addEventListener('click', () => applyMentionSelection(mention, option));
                mentionMenu.appendChild(button);
            }
            mentionMenu.classList.add('open');
        }

        function applyMentionSelection(mention, option) {
            const before = promptInput.value.slice(0, mention.start);
            const after = promptInput.value.slice(mention.end);
            promptInput.value = (before + after).replace(/ {2,}/g, ' ');
            promptInput.focus();
            promptInput.selectionStart = promptInput.selectionEnd = before.length;
            mentionMenu.classList.remove('open');
            if (mention.kind === 'workflow') {
                currentWorkflowContext = option;
                currentNodeContexts = [];
                renderContextBadges();
                if (state) vscode.postMessage({ type: 'agent.context.workflow.set', sessionId: state.activeSessionId, workflow: option });
                return;
            }
            addNodeContext(option, true);
        }

        function normalizeOperationKind(category, title) {
            const value = String(category || title || '').toLowerCase().replace(/_/g, '-');
            if (value === 'read-file' || value === 'file-read' || value === 'read') return 'file-read';
            if (value === 'write-file' || value === 'file-write' || value === 'write') return 'file-write';
            if (value.includes('shell')) return 'shell';
            if (value.includes('web')) return 'web';
            return value;
        }

        function findMatchingPendingOperationIndex(entries, operationId, title, category) {
            const exactIndex = entries.findIndex((entry) => entry.kind === 'operation' && entry.id === operationId);
            if (exactIndex >= 0) return exactIndex;
            const targetKind = normalizeOperationKind(category, title);
            for (let idx = entries.length - 1; idx >= 0; idx -= 1) {
                const entry = entries[idx];
                if (!entry || entry.kind !== 'operation') continue;
                if (entry.status !== 'running') continue;
                const entryKind = normalizeOperationKind(entry.category, entry.title);
                if (entryKind && targetKind && entryKind === targetKind) return idx;
                if ((entry.title || '') !== (title || '')) continue;
                const entryCategory = String(entry.category || '').toLowerCase();
                const targetCategory = String(category || '').toLowerCase();
                if (entryCategory && targetCategory && entryCategory !== targetCategory && entryCategory !== 'phase') continue;
                return idx;
            }
            return -1;
        }

        function finalizePendingOperations(entries, status) {
            return entries.map((entry) => {
                if (!entry || entry.kind !== 'operation' || entry.status !== 'running') return entry;
                return {
                    ...entry,
                    tone: status === 'error' ? 'error' : 'success',
                    status: status === 'error' ? 'error' : 'done',
                    endedAt: entry.endedAt || Date.now(),
                };
            });
        }

        function stopRunOptimistically() {
            if (!state || !state.session || !Array.isArray(state.session.entries)) return;
            let entries = finalizePendingOperations([...state.session.entries], 'done');
            const last = entries[entries.length - 1];
            if (!last || last.kind !== 'system-notice' || last.text !== 'Run stopped.') {
                entries.push({ kind: 'system-notice', id: crypto.randomUUID(), text: 'Run stopped.', timestamp: Date.now() });
            }
            state.session.entries = entries;
            pendingPrompt = null;
            renderPendingPrompt();
            setRunning(false);
            renderAll();
        }

        function stripEnvironmentDetails(text) {
            let value = String(text || '');
            const openTag = '<environment_details>';
            const closeTag = '</environment_details>';
            for (;;) {
                const start = value.toLowerCase().indexOf(openTag);
                if (start < 0) break;
                const end = value.toLowerCase().indexOf(closeTag, start + openTag.length);
                if (end < 0) {
                    value = value.slice(0, start);
                    break;
                }
                value = value.slice(0, start) + value.slice(end + closeTag.length);
            }
            return value.trim();
        }

        function lastUserMessageIndex(entries) {
            for (let idx = entries.length - 1; idx >= 0; idx -= 1) {
                if (entries[idx] && entries[idx].kind === 'user-message') return idx;
            }
            return -1;
        }

        function consolidateFinalAssistant(entries, response, finalState) {
            const userIdx = lastUserMessageIndex(entries);
            const finalText = stripEnvironmentDetails(response);
            let chosenText = finalText;
            const assistantTexts = [];
            let firstAssistantIdx = -1;
            for (let idx = userIdx + 1; idx < entries.length; idx += 1) {
                const entry = entries[idx];
                if (entry && entry.kind === 'assistant-body' && stripEnvironmentDetails(entry.text)) {
                    if (firstAssistantIdx < 0) firstAssistantIdx = idx;
                    assistantTexts.push(stripEnvironmentDetails(entry.text));
                }
            }
            for (const text of assistantTexts) {
                if (finalText.includes(text) && text.length >= Math.max(80, finalText.length * 0.6)) {
                    chosenText = text;
                }
            }
            const result = [];
            let inserted = false;
            for (let idx = 0; idx < entries.length; idx += 1) {
                const entry = entries[idx];
                if (idx > userIdx && entry.kind === 'assistant-body') {
                    if (!inserted && chosenText && idx === firstAssistantIdx) {
                        result.push({ kind: 'assistant-body', id: entry.id || crypto.randomUUID(), text: chosenText, streaming: false, finalState: finalState });
                        inserted = true;
                    }
                    continue;
                }
                result.push(entry);
            }
            if (!inserted && chosenText) {
                result.push({ kind: 'assistant-body', id: crypto.randomUUID(), text: chosenText, streaming: false, finalState: finalState });
            }
            return result;
        }

        function applyStreamEvent(event) {
            if (!state || !state.session) return;
            let entries = Array.isArray(state.session.entries) ? [...state.session.entries] : [];
            if (event.type === 'start') {
                entries = entries.filter((entry) => entry.kind !== 'context-usage');
                state.session.contextUsage = undefined;
                state.activeSessionId = event.sessionId;
                if (pendingPrompt && pendingPrompt.text === event.message) {
                    pendingPrompt = null;
                    renderPendingPrompt();
                }
                const last = entries[entries.length - 1];
                if (!last || last.kind !== 'user-message' || last.text !== event.message) {
                    entries.push({ kind: 'user-message', id: crypto.randomUUID(), text: event.message || '', timestamp: Date.now() });
                }
            } else if (event.type === 'text-delta') {
                let streamingIdx = -1;
                for (let idx = entries.length - 1; idx >= 0; idx -= 1) {
                    if (entries[idx] && entries[idx].kind === 'assistant-body' && entries[idx].streaming) {
                        streamingIdx = idx;
                        break;
                    }
                }
                if (streamingIdx >= 0) {
                    entries[streamingIdx].text += event.delta || '';
                } else {
                    entries.push({ kind: 'assistant-body', id: crypto.randomUUID(), text: event.delta || '', streaming: true });
                }
            } else if (event.type === 'final') {
                entries = finalizePendingOperations(entries, 'done');
                entries = consolidateFinalAssistant(entries, event.response || '', event.finalState);
                runtimeFinalizing = Boolean(event.runtimeFinalizing);
                setRunning(false);
                renderRuntimeFinalizing();
            } else if (event.type === 'operation') {
                const idx = findMatchingPendingOperationIndex(entries, event.operationId, event.label, event.category);
                const existing = idx >= 0 && entries[idx] && entries[idx].kind === 'operation' ? entries[idx] : null;
                const opEntry = {
                    kind: 'operation',
                    id: event.operationId || (existing && existing.id) || crypto.randomUUID(),
                    tone: event.status === 'error' ? 'error' : event.status === 'done' ? 'success' : 'info',
                    title: event.label,
                    detail: event.category === 'shell' && existing && existing.summary ? existing.summary : event.summary,
                    category: event.category,
                    status: event.status,
                    body: event.body || (existing && existing.body),
                    summary: event.category === 'shell' && existing && existing.summary ? existing.summary : event.summary,
                    startedAt: event.startedAt,
                    endedAt: event.endedAt,
                };
                if (idx >= 0) entries[idx] = opEntry;
                else entries.push(opEntry);
            } else if (event.type === 'progress') {
                const idx = findMatchingPendingOperationIndex(entries, '', event.title, event.phase || 'phase');
                const progressEntry = {
                    kind: 'operation',
                    id: idx >= 0 && entries[idx] && entries[idx].kind === 'operation' ? entries[idx].id : crypto.randomUUID(),
                    tone: event.tone,
                    title: event.title,
                    detail: event.detail,
                    category: event.phase || 'phase',
                    status: event.tone === 'error' ? 'error' : 'running',
                };
                if (idx >= 0) entries[idx] = progressEntry;
                else entries.push(progressEntry);
            } else if (event.type === 'compaction') {
                const compactionEntry = { kind: 'compaction', id: crypto.randomUUID(), timestamp: Date.now(), event: event };
                entries.push(compactionEntry);
                state.session.lastCompaction = event;
                state.session.totalCompactions = (state.session.totalCompactions || 0) + 1;
            } else if (event.type === 'context-usage') {
                if (event.source !== 'api') {
                    renderAll();
                    return;
                }
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
                entries = finalizePendingOperations(entries, 'error');
                entries.push({ kind: 'system-notice', id: crypto.randomUUID(), text: 'Error: ' + event.error, timestamp: Date.now() });
            }
            state.session.entries = entries;
            renderAll();
        }

        function sendPrompt() {
            const text = promptInput.value.trim();
            if (!text || !state) return;
            promptInput.value = '';
            if (isRunning || runtimeFinalizing) {
                pendingPrompt = { text, mode: 'pending' };
                renderPendingPrompt();
                vscode.postMessage({ type: 'agent.queue', text, workflowId, nodeContexts: currentNodeContexts, sessionId: state.activeSessionId });
                return;
            }
            vscode.postMessage({ type: 'agent.send', text, workflowId, nodeContexts: currentNodeContexts, sessionId: state.activeSessionId });
        }

        on(form, 'submit', (event) => {
            event.preventDefault();
            autoScrollFeed = true;
            sendPrompt();
        });

        on(promptInput, 'keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendPrompt();
            }
        });
        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeInlineMenus();
                if (mentionMenu) mentionMenu.classList.remove('open');
                if (historyOverlay && historyOverlay.classList.contains('open')) closeHistory();
                if (checkpointOverlay && checkpointOverlay.classList.contains('open')) closeCheckpointPanel();
            }
        });
        window.addEventListener('pointerdown', (event) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (providerMenu && (providerMenu.contains(target) || selectModelButton.contains(target))) return;
            if (reasoningMenu && (reasoningMenu.contains(target) || selectReasoningButton.contains(target))) return;
            if (newSessionMenu && (newSessionMenu.contains(target) || newSessionHeaderButton.contains(target))) return;
            closeInlineMenus();
        }, true);
        on(promptInput, 'input', renderMentionMenu);
        on(promptInput, 'keyup', renderMentionMenu);
        on(feed, 'scroll', () => {
            autoScrollFeed = isFeedNearBottom();
        });

        on(stopButton, 'click', () => {
            stopButton.disabled = true;
            stopRunOptimistically();
            vscode.postMessage({ type: 'agent.stop' });
        });
        on(historyOpenButton, 'click', openHistory);
        on(historyCloseButton, 'click', closeHistory);
        on(historyOverlay, 'click', (event) => {
            if (event.target === historyOverlay) closeHistory();
        });
        on(checkpointOpenButton, 'click', openCheckpointPanel);
        on(checkpointCloseButton, 'click', closeCheckpointPanel);
        on(checkpointOverlay, 'click', (event) => {
            if (event.target === checkpointOverlay) closeCheckpointPanel();
        });
        on(selectModelButton, 'click', () => {
            providerMenuOpen = !providerMenuOpen;
            reasoningMenuOpen = false;
            providerMenuMode = 'models';
            providerMenuProvider = state && state.provider ? state.provider : providerMenuProvider;
            if (providerMenuOpen) modelSearchQuery = '';
            renderProviderMenu();
            renderReasoningMenu();
            if (providerMenuOpen) vscode.postMessage({ type: 'agent.providers.refresh' });
        });
        on(selectReasoningButton, 'click', () => {
            reasoningMenuOpen = !reasoningMenuOpen;
            providerMenuOpen = false;
            renderProviderMenu();
            renderReasoningMenu();
        });
        function startNewSession(workflow) {
            if (isRunning) return;
            closeHistory();
            closeCheckpointPanel();
            closeInlineMenus();
            vscode.postMessage({ type: 'agent.session.new', workflow });
        }

        on(newSessionButton, 'click', openNewSessionMenu);
        on(newSessionHeaderButton, 'click', openNewSessionMenu);
        on(checkpointSaveButton, 'click', () => {
            if (!state || !state.activeSessionId || isRunning) return;
            vscode.postMessage({ type: 'agent.checkpoint.save', sessionId: state.activeSessionId });
        });
        on(compactContextButton, 'click', () => state && vscode.postMessage({ type: 'agent.context.compact', sessionId: state.activeSessionId }));
        on(sessionFilter, 'change', () => {
            activeFilter = sessionFilter.value || 'current';
            renderSessions();
        });

        window.addEventListener('message', (event) => {
            const message = event.data;
            if (!message || typeof message !== 'object') return;

            if (message.type === 'panel.visibility') {
                const isVisible = Boolean(message.visible);
                if (!isVisible) {
                    if (frame && frame.src !== 'about:blank') {
                        frame.src = 'about:blank';
                    }
                } else {
                    if (frame && frame.src !== workflowUrl && workflowUrl) {
                        frame.src = workflowUrl;
                    }
                }
                return;
            }

            if (message.type === 'workflow.reload') {
                vscode.postMessage({ type: 'workflow.reloadAck', workflowId, hasFrame: Boolean(frame), url: workflowReloadUrl || workflowUrl || '' });
                reloadWorkflowFrame();
                return;
            }

            if (message.type === 'workflow.update' && typeof message.url === 'string') {
                const nextWorkflowUrl = message.url;
                const shouldUpdateFrame = nextWorkflowUrl !== workflowUrl;
                workflowId = String(message.workflowId || workflowId);
                workflowUrl = nextWorkflowUrl;
                workflowReloadUrl = typeof message.reloadUrl === 'string' && message.reloadUrl ? message.reloadUrl : workflowUrl;
                try { iframeOrigin = new URL(workflowUrl).origin; } catch (e) { iframeOrigin = 'src'; }
                if (frame && shouldUpdateFrame) frame.src = workflowUrl;
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
                addNodeContext(message.node, true);
                return;
            }

            if (message.type === 'n8n-node-context-cleared') {
                if (!isWorkflowFrameEvent(event)) return;
                setNodeContexts([], true);
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
                if (message.status === 'idle') runtimeFinalizing = false;
                setRunning(message.status === 'running');
                renderRuntimeFinalizing();
                return;
            }

            if (message.type === 'agent.error') {
                pendingPrompt = null;
                renderPendingPrompt();
                return;
            }

            if (message.type === 'agent.messageRewind') {
                pendingPrompt = null;
                renderPendingPrompt();
                promptInput.value = typeof message.prompt === 'string' ? message.prompt : '';
                promptInput.focus();
                promptInput.selectionStart = promptInput.selectionEnd = promptInput.value.length;
                return;
            }

            if (message.type === 'agent.state') {
                if (!acceptIncomingStateMessage(message)) return;
                state = message.state || null;
                renderAll();
                return;
            }

            if (message.type === 'agent.providerModels') {
                providerModelCache[String(message.provider || '')] = Array.isArray(message.models) ? message.models : [];
                providerMenuOpen = true;
                renderProviderMenu();
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
