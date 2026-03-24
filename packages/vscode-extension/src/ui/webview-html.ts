/**
 * Pure function that generates the parent-webview HTML for a given workflow.
 *
 * Lives in a separate module so it can be unit-tested without importing vscode.
 * WorkflowWebview delegates to this function internally.
 *
 * Security model for the clipboard bridge:
 *   - No static secret (nonce) is embedded here or in the injected bridge
 *     script that runs inside the n8n iframe.  Any constant reachable by
 *     iframe JavaScript could be read and replayed by hostile scripts.
 *   - Origin validation, per-request one-time grant tokens, and rate-limiting
 *     are all enforced in the parent-webview JavaScript (this file), which is
 *     extension-controlled and inaccessible to iframe code.
 */
export function buildWebviewHtml(workflowId: string, url: string): string {
    // Escape workflowId for safe interpolation in HTML and JS contexts
    const htmlSafe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const safeWorkflowIdHtml = htmlSafe(workflowId);
    const safeWorkflowIdJs = JSON.stringify(workflowId);

    // url is the proxy URL pointing to the n8n workflow
    let iframePermissionOrigin = 'src';
    try {
        iframePermissionOrigin = new URL(url).origin;
    } catch {
        // Fallback to iframe's own source origin behavior if URL parsing fails
    }
    const iframeAllowPolicy = `clipboard-read ${iframePermissionOrigin}; clipboard-write ${iframePermissionOrigin}; geolocation ${iframePermissionOrigin}; microphone ${iframePermissionOrigin}; camera ${iframePermissionOrigin}`;

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'; frame-src *; connect-src *; img-src * data:; style-src * 'unsafe-inline';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>n8n: ${safeWorkflowIdHtml}</title>
            <style>
                body, html { 
                    margin: 0; 
                    padding: 0; 
                    height: 100%; 
                    overflow: hidden; 
                    background: var(--vscode-editor-background, #1e1e1e);
                }
                .iframe-container {
                    position: relative;
                    width: 100%;
                    height: 100%;
                }
                iframe { 
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%; 
                    height: 100%; 
                    border: none; 
                    display: block;
                    transition: opacity 0.3s ease;
                }
                iframe.hidden {
                    opacity: 0;
                    pointer-events: none;
                }
                .loading-overlay {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    padding: 5px 10px;
                    background: var(--vscode-button-background, #007acc);
                    color: var(--vscode-button-foreground, #ffffff);
                    font-family: system-ui, -apple-system, sans-serif;
                    font-size: 12px;
                    border-radius: 4px;
                    display: none;
                    z-index: 100;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }
                .initial-loading {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    font-family: system-ui, -apple-system, sans-serif;
                    color: #666;
                    text-align: center;
                }
            </style>
        </head>
        <body>
            <div id="loading-overlay" class="loading-overlay">Refreshing n8n...</div>
            <div id="initial-loading" class="initial-loading">Loading n8n workflow...</div>
            
            <div class="iframe-container">
                <iframe 
                    id="frame-1"
                    src="${url}" 
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation allow-top-navigation-by-user-activation"
                    allow="${iframeAllowPolicy}">
                </iframe>
                <iframe 
                    id="frame-2"
                    class="hidden"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation allow-top-navigation-by-user-activation"
                    allow="${iframeAllowPolicy}">
                </iframe>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let activeFrame = document.getElementById('frame-1');
                let pendingFrame = document.getElementById('frame-2');
                const loadingOverlay = document.getElementById('loading-overlay');
                const initialLoading = document.getElementById('initial-loading');
                const workflowId = ${safeWorkflowIdJs};
                
                function focusActiveFrame() {
                    try {
                        if (document.activeElement !== activeFrame) {
                            activeFrame.focus();
                        }
                    } catch (e) {
                        // ignore focus errors
                    }
                }

                // Hide initial loading when first iframe is ready
                activeFrame.onload = () => {
                    initialLoading.style.display = 'none';
                    focusActiveFrame();
                };

                /**
                 * Attempt a "Soft Refresh" by finding n8n's Vue instance and triggering a workflow load.
                 */
                function attemptSoftRefresh() {
                    try {
                        const win = activeFrame.contentWindow;
                        // n8n uses Vue 2, usually reachable via #app
                        const app = win.document.querySelector('#app');
                        if (app && app.__vue__) {
                            const vueInstance = app.__vue__;
                            const store = vueInstance.$store;
                            
                            if (store && store.dispatch) {
                                store.dispatch('workflows/getWorkflow', workflowId);
                                return true;
                            }
                        }
                    } catch (e) {
                        // console.warn('[Webview] Soft Refresh failed or cross-origin blocked:', e);
                    }
                    return false;
                }

                /**
                 * Perform a "Seamless Refresh" using double buffering.
                 */
                function performSeamlessRefresh() {
                    loadingOverlay.style.display = 'block';

                    pendingFrame.onload = () => {
                        // Swap frames
                        activeFrame.classList.add('hidden');
                        pendingFrame.classList.remove('hidden');

                        // Update references
                        const temp = activeFrame;
                        activeFrame = pendingFrame;
                        pendingFrame = temp;

                        focusActiveFrame();
                        loadingOverlay.style.display = 'none';
                    };

                    // Trigger load in pending frame
                    pendingFrame.src = activeFrame.src;
                }

                // Handle messages from the extension and iframe
                // Security:
                //   - iframeOrigin is used to validate that paste/copy messages come
                //     from the legitimate n8n iframe, not an unrelated window.
                //   - Per-request one-time grant tokens (generated here, never in the
                //     iframe) prevent a static secret from being embedded in the
                //     iframe page where hostile scripts could read and replay it.
                //   - Rate limiting caps clipboard reads to one per PASTE_RATE_LIMIT_MS
                //     to bound the worst-case exfiltration window.
                var iframeOrigin = ${JSON.stringify(iframePermissionOrigin)};
                var PASTE_RATE_LIMIT_MS = 1000;
                var _lastPasteMs = 0;
                var _pendingGrants = new Map();
                var GRANT_TTL_MS = 5000;

                function issuePasteGrant() {
                    var token = crypto.randomUUID();
                    var expiry = Date.now() + GRANT_TTL_MS;
                    _pendingGrants.set(token, expiry);
                    // Auto-expire
                    setTimeout(function() { _pendingGrants.delete(token); }, GRANT_TTL_MS);
                    return token;
                }

                function consumeGrant(token) {
                    var expiry = _pendingGrants.get(token);
                    if (!expiry || Date.now() > expiry) return false;
                    _pendingGrants.delete(token);
                    return true;
                }

                window.addEventListener('message', (event) => {
                    const message = event.data;
                    if (!message || typeof message !== 'object') return;

                    if (message.type === 'reload') {
                        const softRefreshWorked = attemptSoftRefresh();
                        if (!softRefreshWorked) {
                            performSeamlessRefresh();
                        }
                        return;
                    }

                    // Clipboard bridge: iframe requests paste data -> forward to extension host
                    // Validate origin, apply rate limit, issue a one-time grant token.
                    if (message.type === 'n8n-paste-request') {
                        if (event.origin !== iframeOrigin) return;
                        var now = Date.now();
                        if (now - _lastPasteMs < PASTE_RATE_LIMIT_MS) return;
                        _lastPasteMs = now;
                        var grantToken = issuePasteGrant();
                        vscode.postMessage({ type: 'clipboard-paste-request', grantToken: grantToken });
                        return;
                    }

                    // Clipboard bridge: iframe sends copied text -> write to system clipboard
                    if (message.type === 'n8n-clipboard-write' && typeof message.text === 'string') {
                        if (event.origin !== iframeOrigin) return;
                        vscode.postMessage({ type: 'clipboard-write', text: message.text });
                        return;
                    }

                    // Clipboard bridge: extension reports clipboard read failure — consume the grant.
                    if (message.type === 'clipboard-error' && typeof message.grantToken === 'string') {
                        consumeGrant(message.grantToken);
                        return;
                    }

                    // Clipboard bridge: extension sends paste data back -> forward to iframe
                    // Reject messages that did not originate from the extension host
                    // (i.e. reject any attempt by the iframe to spoof this path).
                    // Then consume the one-time grant token before forwarding.
                    if (message.type === 'clipboard-paste' && typeof message.text === 'string'
                            && typeof message.grantToken === 'string') {
                        if (event.origin !== window.origin) return;
                        if (!consumeGrant(message.grantToken)) return;
                        try {
                            var iframeWin = activeFrame.contentWindow;
                            if (iframeWin) iframeWin.postMessage({ type: 'n8n-clipboard-paste', text: message.text }, iframeOrigin);
                        } catch(e) {}
                        return;
                    }
                });

                window.addEventListener('pointerdown', () => focusActiveFrame(), true);
            </script>
        </body>
        </html>`;
}
