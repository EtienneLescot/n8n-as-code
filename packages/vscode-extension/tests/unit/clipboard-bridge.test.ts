import test from 'node:test';
import assert from 'node:assert';

// ---------------------------------------------------------------------------
// Clipboard bridge unit tests
//
// Coverage targets (per review comment on PR #238):
//   1. macOS-only activation  – bridge script is only injected on macOS
//   2. No static secret in bridge script – nonce must not be embedded in the
//      code that runs inside the n8n iframe
//   3. Message validation in parent webview – origin check, rate-limiting,
//      and one-time grant tokens
//   4. Panel reuse / nonce-refresh – createOrShow with an existing panel must
//      call update() so the parent-webview HTML reflects the new URL / origin
// ---------------------------------------------------------------------------

// ── 1 & 2 : bridge script content ──────────────────────────────────────────

test('Bridge script: does not embed a static NONCE variable', () => {
    const { ProxyService } = require('../../src/services/proxy-service.js');
    const script: string = ProxyService.buildBridgeScript();

    assert.ok(
        !script.includes('var NONCE'),
        'Bridge script must not declare a static NONCE variable readable by iframe scripts'
    );
    assert.ok(
        !script.includes('nonce:'),
        'Bridge script must not include a nonce field in any postMessage call'
    );
});

test('Bridge script: intercepts Cmd+V via metaKey (macOS-only)', () => {
    const { ProxyService } = require('../../src/services/proxy-service.js');
    const script: string = ProxyService.buildBridgeScript();

    assert.ok(script.includes('e.metaKey'), 'keydown handler must check e.metaKey');
    assert.ok(script.includes('"v"'), 'keydown handler must check for the "v" key');
    assert.ok(
        !script.includes('e.ctrlKey && e.key === "v"'),
        'Bridge script must not intercept Ctrl+V (Windows/Linux key) — macOS only'
    );
});

test('Bridge script: sends n8n-paste-request message type', () => {
    const { ProxyService } = require('../../src/services/proxy-service.js');
    const script: string = ProxyService.buildBridgeScript();
    assert.ok(script.includes('"n8n-paste-request"'), 'Must use correct paste-request message type');
});

test('Bridge script: sends n8n-clipboard-write message type for copy', () => {
    const { ProxyService } = require('../../src/services/proxy-service.js');
    const script: string = ProxyService.buildBridgeScript();
    assert.ok(script.includes('"n8n-clipboard-write"'), 'Must use correct clipboard-write message type');
});

test('Bridge script: sends node detail opened messages', () => {
    const { ProxyService } = require('../../src/services/proxy-service.js');
    const script: string = ProxyService.buildBridgeScript(false);

    assert.ok(script.includes('CLIPBOARD_BRIDGE_ENABLED = false'), 'Clipboard bridge can be disabled for non-macOS injection');
    assert.ok(script.includes('"n8n-bridge-ready"'), 'Must publish bridge ready events');
    assert.ok(script.includes('2026.05.04.8'), 'Must expose the bridge build marker');
    assert.ok(script.includes('NODE_BRIDGE_ENABLED'), 'Must support disabling node detection on auth routes');
    assert.ok(script.includes('pageKind'), 'Must publish bridge page kind diagnostics');
    assert.ok(script.includes('"n8n-ui-click"'), 'Must publish iframe click diagnostics');
    assert.ok(script.includes('"n8n-ui-change"'), 'Must publish iframe mutation diagnostics');
    assert.ok(script.includes('"n8n-node-context-cleared"'), 'Must publish node context clear events');
    assert.ok(script.includes('isCanvasSurfaceElement'), 'Must detect canvas background clicks');
    assert.ok(script.includes('findNodeDetailTitleByPanelText'), 'Must scan visible panel titles for node context');
    assert.ok(script.includes('readNodeTitleFromPanelTopBand'), 'Must scan the top band of visible n8n panels');
    assert.ok(script.includes('"n8n-node-detail-opened"'), 'Must publish node detail open events');
    assert.ok(script.includes('MutationObserver'), 'Must observe n8n UI changes');
    assert.ok(script.includes('"dblclick"'), 'Must detect node detail opening from canvas double-clicks');
    assert.ok(script.includes('readNodeFromElement'), 'Must extract node context from canvas elements');
});

test('Bridge script: relays popup openings to the parent webview', () => {
    const { ProxyService } = require('../../src/services/proxy-service.js');
    const script: string = ProxyService.buildBridgeScript();

    assert.ok(script.includes('"n8n-open-external"'), 'Must publish popup-open requests');
    assert.ok(script.includes('window.open = function(url, target, features)'), 'Must intercept window.open calls');
    assert.ok(script.includes('target.closest("a[href]")'), 'Must intercept target=_blank anchor clicks');
    assert.ok(script.includes('isAnchorPopupTarget(anchor.getAttribute("target") || "")'), 'Must not intercept ordinary same-frame anchor clicks');
    assert.ok(script.includes('new URL(url, window.location.href)'), 'Must resolve relative popup URLs against the proxied page');
    assert.ok(script.includes('absoluteUrl.protocol !== "http:" && absoluteUrl.protocol !== "https:"'), 'Must only relay browser-safe URL schemes');
});

test('Bridge script: does not validate nonce on incoming paste message', () => {
    // The n8n-clipboard-paste handler in the iframe should accept the message
    // without a nonce check — security is enforced in the parent webview layer.
    const { ProxyService } = require('../../src/services/proxy-service.js');
    const script: string = ProxyService.buildBridgeScript();

    assert.ok(script.includes('"n8n-clipboard-paste"'), 'Must handle n8n-clipboard-paste');
    assert.ok(
        !script.includes('msg.nonce'),
        'Bridge script must not gate incoming paste data on a nonce — parent webview handles that'
    );
});

// ── injectClipboardBridge HTML injection ────────────────────────────────────

test('injectClipboardBridge: injects before </head>', () => {
    const { ProxyService } = require('../../src/services/proxy-service.js');
    const service = new ProxyService();
    const html = '<html><head><title>n8n</title></head><body></body></html>';
    const result: string = (service as any).injectClipboardBridge(html);

    assert.ok(result.includes('<script>'), 'Result must include injected script tag');
    const scriptIdx = result.indexOf('<script>');
    const headIdx = result.indexOf('</head>');
    assert.ok(scriptIdx < headIdx, 'Script must be injected before </head>');
});

test('injectClipboardBridge: can inject UI bridge with clipboard disabled', () => {
    const { ProxyService } = require('../../src/services/proxy-service.js');
    const service = new ProxyService();
    const html = '<html><head><title>n8n login route</title></head><body></body></html>';
    const result: string = (service as any).injectClipboardBridge(html, false, false, 'auth-route');

    assert.ok(result.includes('"n8n-bridge-ready"'), 'Injected route HTML must publish bridge readiness');
    assert.ok(result.includes('CLIPBOARD_BRIDGE_ENABLED = false'), 'Clipboard bridge must be disabled when requested');
    assert.ok(result.includes('NODE_BRIDGE_ENABLED = false'), 'Node bridge must be disabled on auth routes');
    assert.ok(result.includes('auth-route'), 'Auth routes must identify their bridge page kind');
});

test('injectClipboardBridge: falls back to </body> when no </head>', () => {
    const { ProxyService } = require('../../src/services/proxy-service.js');
    const service = new ProxyService();
    const html = '<html><body>content</body></html>';
    const result: string = (service as any).injectClipboardBridge(html);

    const scriptIdx = result.indexOf('<script>');
    const bodyCloseIdx = result.indexOf('</body>');
    assert.ok(scriptIdx < bodyCloseIdx, 'Script must be injected before </body> as fallback');
});

test('injectClipboardBridge: appends script when no </head> or </body>', () => {
    const { ProxyService } = require('../../src/services/proxy-service.js');
    const service = new ProxyService();
    const html = '<html>no closing tags</html>';
    const result: string = (service as any).injectClipboardBridge(html);
    assert.ok(result.includes('<script>'), 'Script must still be appended when no standard closing tag found');
});

test('ProxyService: registered HTML routes are normalized by pathname', () => {
    const { ProxyService } = require('../../src/services/proxy-service.js');
    const service = new ProxyService();
    service.registerHtmlRoute('/__n8n-manager/open-workflow/wf-1', '<html>login</html>');

    assert.equal(
        (service as any).getRegisteredHtmlRoute('/__n8n-manager/open-workflow/wf-1?x=1'),
        '<html>login</html>',
    );
});

test('ProxyService: redirects use configured public proxy base URL', () => {
    const { ProxyService } = require('../../src/services/proxy-service.js');
    const service = new ProxyService();
    (service as any).target = 'http://n8n.internal:5678';
    (service as any).port = 25444;
    service.setPublicBaseUrl('https://code.example.test/proxy/25444/');

    assert.equal(
        (service as any).rewriteProxyLocation('http://n8n.internal:5678/workflow/wf-1'),
        'https://code.example.test/proxy/25444/workflow/wf-1',
    );
    assert.equal(
        (service as any).rewriteProxyLocation('/signin'),
        'https://code.example.test/proxy/25444/signin',
    );
    assert.equal(
        (service as any).rewriteProxyLocation('https://other.example.test/path'),
        'https://other.example.test/path',
    );
    assert.equal(
        (service as any).rewriteProxyLocation('http://n8n.internal:56789/workflow/wf-1'),
        'http://n8n.internal:56789/workflow/wf-1',
    );
    assert.equal(
        (service as any).rewriteProxyLocation('//other.example.test/signin'),
        '//other.example.test/signin',
    );
});

test('ProxyService: redirects match target base paths on URL boundaries', () => {
    const { ProxyService } = require('../../src/services/proxy-service.js');
    const service = new ProxyService();
    (service as any).target = 'https://n8n.example.test/base';
    service.setPublicBaseUrl('https://code.example.test/proxy/25444');

    assert.equal(
        (service as any).rewriteProxyLocation('https://n8n.example.test/base/workflow/wf-1?x=1#node'),
        'https://code.example.test/proxy/25444/workflow/wf-1?x=1#node',
    );
    assert.equal(
        (service as any).rewriteProxyLocation('/base/workflow/wf-1?x=1#node'),
        'https://code.example.test/proxy/25444/workflow/wf-1?x=1#node',
    );
    assert.equal(
        (service as any).rewriteProxyLocation('/base?x=1'),
        'https://code.example.test/proxy/25444?x=1',
    );
    assert.equal(
        (service as any).rewriteProxyLocation('https://n8n.example.test/baseline/workflow/wf-1'),
        'https://n8n.example.test/baseline/workflow/wf-1',
    );
    assert.equal(
        (service as any).rewriteProxyLocation('/baseline/workflow/wf-1'),
        'https://code.example.test/proxy/25444/baseline/workflow/wf-1',
    );
});

test('ProxyService: external n8n redirects create browser auth handoff URLs', () => {
    const { ProxyService } = require('../../src/services/proxy-service.js');
    const service = new ProxyService();
    (service as any).target = 'https://n8n.example.test';
    service.setPublicBaseUrl('https://code.example.test/proxy/25444');

    const handoff = (service as any).createExternalAuthHandoff(
        'https://idp.example.test/sso?state=abc',
        'https://code.example.test/proxy/25444/workflow/wf-1',
    );

    assert.ok(handoff, 'External redirects should produce a handoff page');
    assert.ok(
        handoff.authProxyUrl.startsWith('https://code.example.test/proxy/25444/__n8nac-external-auth/'),
        'Auth URL should stay on the workflow proxy so callback cookies can be captured',
    );
    assert.ok(
        handoff.authProxyUrl.includes(encodeURIComponent('https://idp.example.test/sso?state=abc')),
        'Auth URL should carry the external SSO target',
    );
    assert.ok(handoff.html.includes('Continue n8n sign-in in your browser'), 'Handoff page should explain the browser sign-in step');
});

test('ProxyService: external auth redirects remain proxied until n8n callback returns', () => {
    const { ProxyService } = require('../../src/services/proxy-service.js');
    const service = new ProxyService();
    (service as any).target = 'https://n8n.example.test';
    service.setPublicBaseUrl('https://code.example.test/proxy/25444');
    const token = (service as any).createExternalAuthSession('https://idp.example.test/login');

    const nextIdpUrl = (service as any).rewriteProxyLocation(
        '/oauth/authorize?next=1',
        'https://idp.example.test/login',
        token,
    );
    assert.ok(
        nextIdpUrl.startsWith('https://code.example.test/proxy/25444/__n8nac-external-auth/'),
        'Relative IdP redirects should continue through the auth proxy',
    );
    assert.ok(
        nextIdpUrl.includes(encodeURIComponent('https://idp.example.test/oauth/authorize?next=1')),
        'Relative IdP redirects should resolve against the current IdP origin',
    );
    assert.ok(
        (service as any).rewriteProxyLocation('//idp.example.test/factor', 'https://idp.example.test/login', token)
            .includes(encodeURIComponent('https://idp.example.test/factor')),
        'Protocol-relative IdP redirects should remain in the auth proxy flow',
    );
    const absoluteIdpUrl = (service as any).rewriteProxyLocation(
        'https://idp.example.test/consent?step=2',
        'https://idp.example.test/login',
        token,
    );
    assert.ok(
        absoluteIdpUrl.startsWith('https://code.example.test/proxy/25444/__n8nac-external-auth/'),
        'Absolute IdP redirects should continue through the auth proxy',
    );
    assert.ok(
        absoluteIdpUrl.includes(encodeURIComponent('https://idp.example.test/consent?step=2')),
        'Absolute IdP redirects should carry the exact IdP URL',
    );

    assert.equal(
        (service as any).rewriteProxyLocation('https://n8n.example.test/workflow/wf-1', 'https://idp.example.test/login', token),
        'https://code.example.test/proxy/25444/workflow/wf-1',
        'n8n callbacks should return to the normal workflow proxy route',
    );
});

test('ProxyService: external auth tokens only proxy their expected target URL', () => {
    const { ProxyService } = require('../../src/services/proxy-service.js');
    const service = new ProxyService();
    (service as any).target = 'https://n8n.example.test';
    service.setPublicBaseUrl('https://code.example.test/proxy/25444');

    const token = (service as any).createExternalAuthSession('https://idp.example.test/login?state=abc');

    assert.deepEqual(
        (service as any).parseExternalAuthProxyRequest(`/__n8nac-external-auth/${token}?url=${encodeURIComponent('https://idp.example.test/login?state=abc')}`),
        { token, targetUrl: 'https://idp.example.test/login?state=abc' },
    );
    assert.equal(
        (service as any).parseExternalAuthProxyRequest(`/__n8nac-external-auth/${token}?url=${encodeURIComponent('https://evil.example.test/steal')}`),
        undefined,
        'A valid token must not be reusable for arbitrary external URLs',
    );

    const nextUrl = (service as any).rewriteProxyLocation('https://idp.example.test/consent', 'https://idp.example.test/login?state=abc', token);
    assert.ok(nextUrl.includes(encodeURIComponent('https://idp.example.test/consent')), 'Trusted redirects advance the expected target URL');
    assert.equal(
        (service as any).parseExternalAuthProxyRequest(`/__n8nac-external-auth/${token}?url=${encodeURIComponent('https://idp.example.test/login?state=abc')}`),
        undefined,
        'The previous IdP URL should no longer be accepted after the redirect target advances',
    );
    assert.deepEqual(
        (service as any).parseExternalAuthProxyRequest(`/__n8nac-external-auth/${token}?url=${encodeURIComponent('https://idp.example.test/consent')}`),
        { token, targetUrl: 'https://idp.example.test/consent' },
    );
});

test('ProxyService: external auth handoff retries the last workflow URL', () => {
    const { ProxyService } = require('../../src/services/proxy-service.js');
    const service = new ProxyService();
    (service as any).target = 'https://n8n.example.test';
    (service as any).port = 25444;
    service.setPublicBaseUrl('https://code.example.test/proxy/25444');

    (service as any).rememberWorkflowProxyUrl('/workflow/wf-1?_n8nacBridge=123');
    const retryFromMemory = (service as any).getWorkflowRetryUrl({
        url: '/sso/saml/login',
        headers: {},
    });
    assert.equal(
        retryFromMemory,
        'https://code.example.test/proxy/25444/workflow/wf-1?_n8nacBridge=123',
        'Retry should prefer the remembered workflow URL over the SSO endpoint',
    );

    const retryFromReferrer = (service as any).getWorkflowRetryUrl({
        url: '/sso/saml/login',
        headers: {
            referer: 'https://code.example.test/proxy/25444/workflow/wf-2?_n8nacBridge=456',
        },
    });
    assert.equal(
        retryFromReferrer,
        'https://code.example.test/proxy/25444/workflow/wf-2?_n8nacBridge=456',
        'Retry should use a workflow referrer when available',
    );
});

// ── 3 : parent webview HTML — grant token & rate-limit markers ──────────────
// buildWebviewHtml is a pure function (no vscode dependency) that generates
// the parent-webview HTML. We assert on the security-relevant parts of the
// output without needing a live VS Code environment.

test('Parent webview HTML: includes per-request one-time grant token logic', () => {
    const { buildWebviewHtml } = require('../../src/ui/webview-html.js');
    const html: string = buildWebviewHtml('wf-1', 'http://localhost:5678/workflow/wf-1');

    assert.ok(html.includes('issuePasteGrant'), 'Must include issuePasteGrant function');
    assert.ok(html.includes('consumeGrant'), 'Must include consumeGrant function');
    assert.ok(html.includes('_pendingGrants'), 'Must track pending grant tokens');
});

test('Parent webview HTML: includes paste rate limiting', () => {
    const { buildWebviewHtml } = require('../../src/ui/webview-html.js');
    const html: string = buildWebviewHtml('wf-1', 'http://localhost:5678/workflow/wf-1');

    assert.ok(html.includes('PASTE_RATE_LIMIT_MS'), 'Must define a paste rate-limit constant');
    assert.ok(html.includes('_lastPasteMs'), 'Must track last paste timestamp');
});

test('Parent webview HTML: validates event.origin against iframeOrigin', () => {
    const { buildWebviewHtml } = require('../../src/ui/webview-html.js');
    const html: string = buildWebviewHtml('wf-1', 'http://localhost:5678/workflow/wf-1');

    assert.ok(html.includes('iframeOrigin'), 'Must declare iframeOrigin');
    assert.ok(html.includes('event.origin !== iframeOrigin'), 'Must reject messages from unknown origins');
});

test('Parent webview HTML: relays iframe popup requests after origin validation', () => {
    const { buildWebviewHtml } = require('../../src/ui/webview-html.js');
    const html: string = buildWebviewHtml('wf-1', 'http://localhost:5678/workflow/wf-1');

    assert.ok(html.includes("message.type === 'n8n-open-external'"), 'Must handle popup bridge messages');
    assert.ok(html.includes('function isActiveFrameEvent(event)'), 'Must centralize active iframe validation for popup relays');
    assert.ok(html.includes('event.origin === iframeOrigin'), 'Must validate iframe origin before relaying popup URLs');
    assert.ok(html.includes('event.source === activeFrame.contentWindow'), 'Must reject popup requests from stale hidden iframes');
    assert.ok(html.includes("if (!isActiveFrameEvent(event)) return;"), 'Must require an active iframe event before relaying popup URLs');
    assert.ok(html.includes("vscode.postMessage({ type: 'open-external', url: message.url });"), 'Must relay popup URL to the extension host');
});

test('Parent webview HTML: does not embed a static NONCE', () => {
    const { buildWebviewHtml } = require('../../src/ui/webview-html.js');
    const html: string = buildWebviewHtml('wf-1', 'http://localhost:5678/workflow/wf-1');

    assert.ok(
        !html.includes('var NONCE'),
        'Parent webview HTML must not embed a static session NONCE'
    );
});

test('Parent webview HTML: iframeOrigin reflects the supplied URL (panel reuse)', () => {
    // Verifies that URL / origin updates are reflected in regenerated HTML.
    // WorkflowWebview.update() calls buildWebviewHtml with the new URL; this
    // test confirms the output differs as expected — proving that stale origins
    // cannot survive across panel reuse.
    const { buildWebviewHtml } = require('../../src/ui/webview-html.js');
    const url1 = 'http://localhost:5000/workflow/wf-1';
    const url2 = 'http://localhost:9000/workflow/wf-2';

    const html1: string = buildWebviewHtml('wf-1', url1);
    const html2: string = buildWebviewHtml('wf-2', url2);

    assert.ok(html1.includes('http://localhost:5000'), 'First HTML must embed origin from first URL');
    assert.ok(html2.includes('http://localhost:9000'), 'Second HTML must embed origin from second URL');
    assert.ok(!html2.includes('http://localhost:5000'), 'Second HTML must not contain stale origin from first URL');
});

test('Parent webview HTML: seamless reload forces iframe navigation', () => {
    const { buildWebviewHtml } = require('../../src/ui/webview-html.js');
    const html: string = buildWebviewHtml('wf-1', 'http://localhost:5678/workflow/wf-1');

    assert.ok(html.includes('message.type === "n8nac.workflow.reload"'), 'Reload command must use a namespaced extension message');
    assert.ok(!html.includes("message.type === 'reload'"), 'Generic iframe reload messages must not trigger a parent reload');
    assert.ok(html.includes('_n8nacRefresh'), 'Reload must add a cache-busting query param');
    assert.ok(html.includes('pendingFrame.src = reloadUrl.toString()'), 'Reload must assign a fresh iframe URL');
});

// ── 4 : macOS-only activation ───────────────────────────────────────────────

test('registerClipboardHandler: guard skips registration on non-darwin platforms', () => {
    // isClipboardBridgeRequired is the pure helper that gates registerClipboardHandler.
    // Testing it directly exercises the production guard rather than a mock.
    const { isClipboardBridgeRequired } = require('../../src/utils/clipboard-utils.js');
    if (process.platform === 'darwin') {
        assert.strictEqual(isClipboardBridgeRequired(), true,
            'Must return true on macOS (darwin)');
        return;
    }
    assert.strictEqual(
        isClipboardBridgeRequired(),
        false,
        'Must return false on non-macOS platforms — handler must not be registered'
    );
});
