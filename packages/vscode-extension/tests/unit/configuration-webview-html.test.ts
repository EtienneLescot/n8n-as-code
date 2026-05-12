import test from 'node:test';
import assert from 'node:assert';

test('Configuration webview HTML: renders bundled React shell with CSP nonce', () => {
    const { getConfigurationHtml } = require('../../src/ui/configuration-webview-html.js');
    const html: string = getConfigurationHtml('nonce', 'vscode-resource://settings-webview.js');

    assert.ok(html.includes("script-src 'nonce-nonce'"), 'CSP must require the generated nonce');
    assert.ok(html.includes("style-src 'nonce-nonce'"), 'CSP must require the generated nonce for styles');
    assert.ok(html.includes('<style nonce="nonce">'), 'Inline styles must carry the CSP nonce');
    assert.ok(html.includes('<div id="root"></div>'), 'React root must be present');
    assert.ok(html.includes('<script nonce="nonce" src="vscode-resource://settings-webview.js"></script>'), 'Bundled webview script must be loaded with nonce');
    assert.ok(!html.includes('external instance'), 'Shell must not expose legacy external instance copy');
    assert.ok(!html.includes('existing instance'), 'Shell must not expose legacy existing instance copy');
});
