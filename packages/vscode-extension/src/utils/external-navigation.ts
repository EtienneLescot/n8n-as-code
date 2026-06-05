import type * as vscode from 'vscode';

export type ExternalNavigationReason =
    | 'popup'
    | 'delayed-popup'
    | 'form-trigger'
    | 'webhook'
    | 'chat-trigger'
    | 'oauth'
    | 'download'
    | 'docs'
    | 'top-navigation'
    | 'custom-protocol'
    | 'unknown';

export interface ExternalNavigationSource {
    panelKind?: 'workflow-board' | 'agent-workbench' | 'proxy' | 'unknown';
    workflowId?: string;
    workflowName?: string;
    sessionId?: string;
    nodeId?: string;
    nodeName?: string;
    iframeHref?: string;
    bridgeBuild?: string;
    opener?: string;
    pageKind?: string;
}

export interface ExternalNavigationRequest {
    url: string;
    reason?: ExternalNavigationReason | string;
    source?: ExternalNavigationSource;
    target?: string;
    features?: string;
}

export interface ExternalNavigationDecision {
    allowed: boolean;
    normalizedUrl?: string;
    scheme?: string;
    reason: ExternalNavigationReason;
    blockedReason?: string;
}

export interface OpenExternalNavigationOptions {
    outputChannel?: vscode.OutputChannel;
    logPrefix?: string;
    dedupeMs?: number;
    opener?: (url: string) => Promise<boolean> | boolean;
}

const BROWSER_SCHEMES = new Set(['http:', 'https:']);
const RECENT_OPEN_WINDOW_MS = 1200;
const recentExternalOpens = new Map<string, number>();

export function isN8nPublicEndpointPath(pathname: string): boolean {
    return isPathOrChild(pathname, '/form-test')
        || isPathOrChild(pathname, '/form')
        || isPathOrChild(pathname, '/webhook-test')
        || isPathOrChild(pathname, '/webhook');
}

export function inferExternalNavigationReason(url: string, fallback: ExternalNavigationReason = 'unknown'): ExternalNavigationReason {
    try {
        const parsed = new URL(url);
        if (isPathOrChild(parsed.pathname, '/form-test') || isPathOrChild(parsed.pathname, '/form')) return 'form-trigger';
        if (isPathOrChild(parsed.pathname, '/webhook-test') || isPathOrChild(parsed.pathname, '/webhook')) return 'webhook';
    } catch {
        // Keep the caller-provided reason for non-absolute or invalid URLs.
    }
    return fallback;
}

export function classifyExternalNavigationUrl(url: string, reason: ExternalNavigationReason | string = 'unknown'): ExternalNavigationDecision {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return { allowed: false, reason: normalizeExternalNavigationReason(reason), blockedReason: 'invalid-url' };
    }

    const normalizedReason = inferExternalNavigationReason(parsed.toString(), normalizeExternalNavigationReason(reason));
    if (!BROWSER_SCHEMES.has(parsed.protocol)) {
        return {
            allowed: false,
            scheme: parsed.protocol,
            reason: normalizedReason,
            blockedReason: `blocked-scheme:${parsed.protocol}`,
        };
    }

    return {
        allowed: true,
        normalizedUrl: parsed.toString(),
        scheme: parsed.protocol,
        reason: normalizedReason,
    };
}

export async function openExternalNavigation(request: ExternalNavigationRequest, options: OpenExternalNavigationOptions = {}): Promise<boolean> {
    const decision = classifyExternalNavigationUrl(request.url, request.reason);
    const prefix = options.logPrefix || '[n8n-nav]';
    if (!decision.allowed || !decision.normalizedUrl) {
        options.outputChannel?.appendLine(`${prefix} blocked reason=${decision.reason} detail=${decision.blockedReason || 'unknown'} url=${request.url}`);
        return false;
    }

    const dedupeMs = options.dedupeMs ?? RECENT_OPEN_WINDOW_MS;
    const source = request.source || {};
    const dedupeKey = [decision.normalizedUrl, decision.reason, source.panelKind || '', source.workflowId || '', source.sessionId || ''].join('|');
    const now = Date.now();
    const cutoff = now - Math.max(dedupeMs, RECENT_OPEN_WINDOW_MS);
    for (const [key, timestamp] of recentExternalOpens) {
        if (timestamp < cutoff) {
            recentExternalOpens.delete(key);
        }
    }
    const lastOpenAt = recentExternalOpens.get(dedupeKey) || 0;
    if (dedupeMs > 0 && now - lastOpenAt < dedupeMs) {
        options.outputChannel?.appendLine(`${prefix} deduped reason=${decision.reason} panel=${source.panelKind || 'unknown'} workflow=${source.workflowId || 'none'} url=${decision.normalizedUrl}`);
        return false;
    }
    recentExternalOpens.set(dedupeKey, now);

    options.outputChannel?.appendLine(`${prefix} openExternal reason=${decision.reason} panel=${source.panelKind || 'unknown'} workflow=${source.workflowId || 'none'} node=${source.nodeName || source.nodeId || 'none'} url=${decision.normalizedUrl}`);

    if (options.opener) {
        return Boolean(await options.opener(decision.normalizedUrl));
    }

    try {
        const vscodeRuntime = await import('vscode');
        await vscodeRuntime.env.openExternal(vscodeRuntime.Uri.parse(decision.normalizedUrl));
        return true;
    } catch (error: any) {
        options.outputChannel?.appendLine(`${prefix} failed reason=${decision.reason} detail=${error?.message || String(error)} url=${decision.normalizedUrl}`);
        return false;
    }
}

export function normalizeExternalNavigationReason(reason: ExternalNavigationReason | string | undefined): ExternalNavigationReason {
    switch (reason) {
        case 'popup':
        case 'delayed-popup':
        case 'form-trigger':
        case 'webhook':
        case 'chat-trigger':
        case 'oauth':
        case 'download':
        case 'docs':
        case 'top-navigation':
        case 'custom-protocol':
            return reason;
        default:
            return 'unknown';
    }
}

function isPathOrChild(pathname: string, prefix: string): boolean {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
