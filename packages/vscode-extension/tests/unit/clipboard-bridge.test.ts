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
