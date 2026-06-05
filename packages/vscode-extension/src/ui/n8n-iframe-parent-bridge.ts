export interface N8nExternalNavigationClientScriptOptions {
    panelKind: 'workflow-board' | 'agent-workbench';
    workflowIdExpression: string;
    workflowNameExpression?: string;
    sessionIdExpression?: string;
    iframeHrefExpression: string;
    endpointsExpression: string;
}

export function buildN8nExternalNavigationClientScript(options: N8nExternalNavigationClientScriptOptions): string {
    const panelKind = JSON.stringify(options.panelKind);
    const workflowNameExpression = options.workflowNameExpression || "''";
    const sessionIdExpression = options.sessionIdExpression || "''";

    return `
        function resolveN8nExternalNavigationUrl(url) {
            if (!url || typeof url !== 'string') return '';
            try {
                return new URL(url, ${options.iframeHrefExpression} || window.location.href).toString();
            } catch (e) {
                return '';
            }
        }

        function inferN8nExternalNavigationReason(url, fallback) {
            var normalizedUrl = resolveN8nExternalNavigationUrl(url);
            if (!normalizedUrl) return fallback || 'unknown';
            try {
                var parsed = new URL(normalizedUrl);
                if (parsed.pathname === '/form-test' || parsed.pathname.indexOf('/form-test/') === 0
                        || parsed.pathname === '/form' || parsed.pathname.indexOf('/form/') === 0) return 'form-trigger';
                if (parsed.pathname === '/webhook-test' || parsed.pathname.indexOf('/webhook-test/') === 0
                        || parsed.pathname === '/webhook' || parsed.pathname.indexOf('/webhook/') === 0) return 'webhook';
            } catch (e) {}
            return fallback || 'unknown';
        }

        function readN8nEndpointUrl(reason) {
            var endpoints = ${options.endpointsExpression} || {};
            if (reason === 'form-trigger') return endpoints.formTestUrl || endpoints.testUrl || '';
            if (reason === 'webhook') return endpoints.webhookTestUrl || endpoints.testUrl || '';
            if (reason === 'chat-trigger') return endpoints.chatTestUrl || endpoints.testUrl || '';
            return '';
        }

        function buildN8nExternalNavigationSource(message) {
            var source = message && typeof message.source === 'object' && message.source ? message.source : {};
            return Object.assign({}, source, {
                panelKind: ${panelKind},
                workflowId: String(${options.workflowIdExpression} || ''),
                workflowName: String(${workflowNameExpression} || ''),
                sessionId: String(${sessionIdExpression} || ''),
                iframeHref: String(${options.iframeHrefExpression} || ''),
                bridgeBuild: message && message.build ? String(message.build) : source.bridgeBuild
            });
        }

        function postN8nExternalNavigation(url, reason, message) {
            var normalizedUrl = resolveN8nExternalNavigationUrl(url);
            if (!normalizedUrl) return false;
            vscode.postMessage({
                type: 'open-external',
                url: normalizedUrl,
                reason: reason || inferN8nExternalNavigationReason(normalizedUrl, 'unknown'),
                source: buildN8nExternalNavigationSource(message),
                target: message && typeof message.target === 'string' ? message.target : undefined,
                features: message && typeof message.features === 'string' ? message.features : undefined
            });
            return true;
        }
    `;
}
