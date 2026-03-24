import * as http from 'http';
import * as os from 'os';
import httpProxy = require('http-proxy');
import * as vscode from 'vscode';
import { AddressInfo } from 'net';
import { WebSocket, WebSocketServer } from 'ws';

export class ProxyService {
    private server: http.Server | undefined;
    private proxy: httpProxy | undefined;
    private wsServer: WebSocketServer | undefined;
    private port: number = 0;
    private target: string = '';
    private outputChannel: vscode.OutputChannel | undefined;
    private secrets: vscode.SecretStorage | undefined;

    private cookieJar = new Map<string, string>();

    constructor() { }

    public setSecrets(secrets: vscode.SecretStorage) {
        this.secrets = secrets;
    }

    public setOutputChannel(channel: vscode.OutputChannel) {
        this.outputChannel = channel;
    }

    private log(message: string) {
        if (this.outputChannel) {
            this.outputChannel.appendLine(message);
        } else {
            console.log(message);
        }
    }

    private getStorageKey(): string {
        // Use a base64 encoded version of the target URL to avoid issues with special characters in keys
        return `n8n-cookies-${Buffer.from(this.target).toString('base64')}`;
    }

    /**
     * Generate a stable port number between 10000 and 60000 based on the target URL
     */
    private getStablePort(targetUrl: string): number {
        let hash = 0;
        for (let i = 0; i < targetUrl.length; i++) {
            const char = targetUrl.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return 10000 + (Math.abs(hash) % 50000);
    }

    private async saveCookies() {
        if (!this.secrets || !this.target) return;
        try {
            const cookies = Array.from(this.cookieJar.entries());
            await this.secrets.store(this.getStorageKey(), JSON.stringify(cookies));
            // this.log(`[Proxy] Cookies persisted for ${this.target}`);
        } catch (e: any) {
            this.log(`[Proxy] Error persisting cookies: ${e.message}`);
        }
    }

    private async loadCookies() {
        if (!this.secrets || !this.target) return;
        try {
            const stored = await this.secrets.get(this.getStorageKey());
            if (stored) {
                const cookies: [string, string][] = JSON.parse(stored);
                for (const [key, value] of cookies) {
                    this.cookieJar.set(key, value);
                }
                this.log(`[Proxy] Loaded ${this.cookieJar.size} persisted cookies for ${this.target}`);
            }
        } catch (e: any) {
            this.log(`[Proxy] Error loading persisted cookies: ${e.message}`);
        }
    }

    private buildMergedCookieHeader(clientCookies?: string): string | undefined {
        const finalCookies: string[] = clientCookies ? [clientCookies] : [];

        if (this.cookieJar.size > 0) {
            for (const [key, value] of this.cookieJar) {
                if (!clientCookies || !clientCookies.includes(key + '=')) {
                    finalCookies.push(value);
                }
            }
        }

        return finalCookies.length > 0 ? finalCookies.join('; ') : undefined;
    }

    public async start(targetUrl: string): Promise<string> {
        // Ensure targetUrl doesn't have trailing slash for consistency
        const normalizedTarget = targetUrl.endsWith('/') ? targetUrl.slice(0, -1) : targetUrl;
        const stablePort = this.getStablePort(normalizedTarget);

        if (this.server) {
            if (this.target === normalizedTarget && this.port === stablePort) {
                return `http://localhost:${this.port}`;
            }
            this.stop();
        }

        // Reset state
        this.cookieJar.clear();
        this.target = normalizedTarget;
        this.port = stablePort;

        const isMacOS = os.platform() === 'darwin';

        // Load persisted cookies
        await this.loadCookies();

        this.proxy = httpProxy.createProxyServer({
            target: this.target,
            changeOrigin: true,
            secure: false,
            // Only intercept responses on macOS where we need to inject the clipboard bridge
            selfHandleResponse: isMacOS,
            cookieDomainRewrite: "", // Rewrite all domains to match localhost
            preserveHeaderKeyCase: true, // Preserve header casing
            autoRewrite: true, // Automatically rewrite redirects
            xfwd: true // Add x-forwarded headers automatically
        });

        // Strip headers that block iframe embedding and manage cookies
        this.proxy.on('proxyRes', (proxyRes, _req, res) => {
            // Remove headers that prevent iframe embedding
            delete proxyRes.headers['x-frame-options'];
            delete proxyRes.headers['content-security-policy'];
            delete proxyRes.headers['content-security-policy-report-only'];

            // CRITICAL for SSE: Ensure no buffering
            proxyRes.headers['x-accel-buffering'] = 'no';
            proxyRes.headers['cache-control'] = 'no-cache, no-transform';
            proxyRes.headers['connection'] = 'keep-alive';

            // Rewrite Location header for redirects
            if (proxyRes.headers['location']) {
                const location = proxyRes.headers['location'];
                const newLocation = location.startsWith(this.target)
                    ? location.replace(this.target, `http://localhost:${this.port}`)
                    : location.startsWith('/')
                        ? `http://localhost:${this.port}${location}`
                        : location;

                proxyRes.headers['location'] = newLocation;
            }

            // CRITICAL: Capture and Fix cookies for iframe/webview context
            if (proxyRes.headers['set-cookie']) {
                proxyRes.headers['set-cookie'] = proxyRes.headers['set-cookie'].map(cookie => {
                    const eqIdx = cookie.indexOf('=');
                    const scIdx = cookie.indexOf(';');
                    if (eqIdx !== -1) {
                        const key = cookie.substring(0, eqIdx).trim();
                        const valuePart = cookie.substring(0, scIdx !== -1 ? scIdx : undefined).trim();
                        this.cookieJar.set(key, valuePart);
                    }
                    this.saveCookies();
                    return cookie
                        .replace(/; Secure/gi, '')
                        .replace(/; SameSite=None/gi, '')
                        .replace(/; SameSite=Strict/gi, '')
                        .replace(/; SameSite=Lax/gi, '')
                        .replace(/; Domain=[^;]+/gi, '');
                });
            }

            // Inject CORS for the webview
            proxyRes.headers['access-control-allow-origin'] = '*';
            proxyRes.headers['access-control-allow-credentials'] = 'true';
            proxyRes.headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH';
            proxyRes.headers['access-control-allow-headers'] = '*';

            // On non-macOS, selfHandleResponse is false so http-proxy pipes automatically.
            // On macOS, we handle responses ourselves to inject the clipboard bridge.
            if (!isMacOS) return;

            const rawCT = proxyRes.headers['content-type'];
            const contentType = Array.isArray(rawCT) ? rawCT[0] || '' : rawCT || '';
            const isHtml = contentType.includes('text/html');
            const httpRes = res as http.ServerResponse;

            if (isHtml) {
                // Buffer HTML to inject clipboard bridge script
                const chunks: Buffer[] = [];
                proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
                proxyRes.on('end', () => {
                    try {
                        const raw = Buffer.concat(chunks);
                        // Detect charset from Content-Type header (default utf-8)
                        const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
                        const charset = (charsetMatch?.[1] || 'utf-8') as BufferEncoding;
                        let html = raw.toString(charset);
                        html = this.injectClipboardBridge(html);
                        const encoded = Buffer.from(html, charset);
                        delete proxyRes.headers['content-length'];
                        delete proxyRes.headers['content-encoding'];
                        httpRes.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
                        httpRes.end(encoded);
                    } catch {
                        // Injection failed — forward original response
                        httpRes.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
                        httpRes.end(Buffer.concat(chunks));
                    }
                });
            } else {
                // Non-HTML: pipe through directly
                httpRes.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
                proxyRes.pipe(httpRes);
            }
        });

        this.proxy.on('error', (err, _req, res) => {
            this.log(`[Proxy] ERROR: ${err.message}`);
            if ((res as any).writeHead) {
                // HTTP error — send a 502 back to the client
                const response = res as http.ServerResponse;
                if (!response.headersSent) {
                    response.writeHead(502, { 'Content-Type': 'text/plain' });
                }
                response.end('Proxy Error: ' + err.message);
            }
        });

        this.server = http.createServer((req, res) => {
            // Handle CORS preflight
            if (req.method === 'OPTIONS') {
                res.writeHead(200, {
                    'access-control-allow-origin': '*',
                    'access-control-allow-credentials': 'true',
                    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
                    'access-control-allow-headers': '*'
                });
                res.end();
                return;
            }

            if (this.proxy) {
                // On macOS, request uncompressed responses so we can inject the clipboard bridge
                if (isMacOS) {
                    delete req.headers['accept-encoding'];
                }

                const mergedCookies = this.buildMergedCookieHeader(req.headers.cookie);
                if (mergedCookies) {
                    req.headers['cookie'] = mergedCookies;
                }

                // Add Forwarding Headers - CRITICAL for n8n to know its external URL
                const proxyHost = `localhost:${this.port}`;
                const targetIsHttps = this.target.startsWith('https');
                const proto = targetIsHttps ? 'https' : 'http';

                // Reconstruct headers for HTTP
                req.headers['x-forwarded-host'] = proxyHost;
                req.headers['x-forwarded-proto'] = proto;
                req.headers['x-forwarded-port'] = this.port.toString();
                
                // For HTTPS Cloudflare targets, we MUST spoof the host/origin to match target
                if (targetIsHttps) {
                    const targetHost = this.target.replace(/^https?:\/\//, '');
                    req.headers['host'] = targetHost;
                } else {
                    req.headers['host'] = proxyHost;
                }
                
                req.headers['origin'] = targetIsHttps ? this.target : `${proto}://${proxyHost}`;

                // Inject CORS for the webview
                res.setHeader('access-control-allow-origin', '*');
                res.setHeader('access-control-allow-credentials', 'true');
                res.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
                res.setHeader('access-control-allow-headers', '*');

                // CRITICAL for SSE: Disable buffering
                this.proxy.web(req, res, { buffer: undefined, changeOrigin: true, secure: false });
            }
        });

        this.wsServer = new WebSocketServer({ noServer: true, perMessageDeflate: false });

        return new Promise((resolve, reject) => {
            if (!this.server) return reject(new Error('Server not initialized'));

            // Try to listen on the stable port
            this.server.listen(this.port, 'localhost', () => {
                const proxyUrl = `http://localhost:${this.port}`;
                this.log(`🟢 [Proxy] Started: ${proxyUrl} -> ${this.target}`);
                resolve(proxyUrl);
            });

            // If the stable port is taken, fallback to random port (less ideal for persistence but allows proxy to work)
            this.server.on('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    this.log(`⚠️ [Proxy] Port ${this.port} is in use, falling back to random port...`);
                    this.server?.close();
                    this.server = http.createServer(this.server?.listeners('request')[0] as any);
                    this.server.listen(0, 'localhost', () => {
                        const address = this.server?.address() as AddressInfo;
                        this.port = address.port;
                        const proxyUrl = `http://localhost:${this.port}`;
                        this.log(`🟡 [Proxy] Server started on fallback port: ${this.port}`);
                        resolve(proxyUrl);
                    });
                } else {
                    reject(err);
                }
            });

            // Proxy WebSockets for real-time features
            this.server.on('upgrade', (req, socket, head) => {
                if (this.wsServer) {
                    const targetIsHttps = this.target.startsWith('https');
                    const upstreamBaseUrl = this.target.replace(/^http/, 'ws');
                    const upstreamUrl = new URL(req.url ?? '/', `${upstreamBaseUrl}/`).toString();
                    const headers: Record<string, string> = {};

                    for (const [key, value] of Object.entries(req.headers)) {
                        if (value !== undefined && key !== 'sec-websocket-extensions') {
                            headers[key] = Array.isArray(value) ? value.join(', ') : value;
                        }
                    }

                    headers['host'] = this.target.replace(/^https?:\/\//, '');
                    headers['origin'] = this.target;
                    headers['connection'] = 'Upgrade';
                    headers['upgrade'] = 'websocket';
                    delete headers['sec-websocket-extensions'];

                    const mergedCookies = this.buildMergedCookieHeader(headers['cookie']);
                    if (mergedCookies) {
                        headers['cookie'] = mergedCookies;
                    }

                    this.log(`[Proxy] WS Upgrade Request: ${req.url}`);

                    this.wsServer.handleUpgrade(req, socket, head, (clientWs) => {
                        const upstreamWs = new WebSocket(upstreamUrl, {
                            headers,
                            rejectUnauthorized: false,
                            perMessageDeflate: false,
                        });

                        const pingTimer = setInterval(() => {
                            if (upstreamWs.readyState === WebSocket.OPEN) {
                                upstreamWs.ping();
                            }
                        }, 55_000);

                        const clearPing = () => clearInterval(pingTimer);

                        clientWs.on('message', (data, isBinary) => {
                            if (upstreamWs.readyState === WebSocket.OPEN) {
                                upstreamWs.send(data, { binary: isBinary });
                            }
                        });

                        upstreamWs.on('message', (data, isBinary) => {
                            if (clientWs.readyState === WebSocket.OPEN) {
                                clientWs.send(data, { binary: isBinary });
                            }
                        });

                        upstreamWs.on('open', () => {
                            this.log(`[Proxy] WS Connection Open (Upstream)`);
                        });

                        upstreamWs.on('close', (code, reason) => {
                            clearPing();
                            this.log(`[Proxy] WS Connection Closed (Upstream): ${code}${reason.length > 0 ? ` ${reason.toString()}` : ''}`);
                            if (clientWs.readyState === WebSocket.OPEN) {
                                clientWs.close(code, reason);
                            } else {
                                clientWs.terminate();
                            }
                        });

                        clientWs.on('close', (code, reason) => {
                            clearPing();
                            if (upstreamWs.readyState === WebSocket.OPEN || upstreamWs.readyState === WebSocket.CONNECTING) {
                                upstreamWs.close(code, reason);
                            }
                        });

                        upstreamWs.on('error', (err) => {
                            clearPing();
                            this.log(`[Proxy] WS Connection Error (Upstream): ${err.message}`);
                            if (clientWs.readyState === WebSocket.OPEN) {
                                clientWs.close(1011, 'Upstream proxy error');
                            } else {
                                clientWs.terminate();
                            }
                        });

                        clientWs.on('error', (err) => {
                            clearPing();
                            this.log(`[Proxy] WS Connection Error (Client): ${err.message}`);
                            if (upstreamWs.readyState === WebSocket.OPEN || upstreamWs.readyState === WebSocket.CONNECTING) {
                                upstreamWs.terminate();
                            }
                        });
                    });
                }
            });

            this.server.on('error', reject);
        });
    }

    /**
     * Returns the injectable bridge script as a string.
     * Exported as a static helper so it can be unit-tested in isolation.
     *
     * Security model:
     * - The bridge script intentionally carries no static secret because any
     *   constant embedded here is readable by code running inside the iframe.
     * - Origin validation, per-request one-time grant tokens, and rate-limiting
     *   are all enforced in the parent webview (workflow-webview.ts), which is
     *   extension-controlled and not accessible to iframe scripts.
     */
    static buildBridgeScript(): string {
        return `<script>
(function(){
  var _pasteInProgress = false;

  function handlePaste(text) {
    var el = document.activeElement;

    // Input/Textarea: direct value manipulation
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
      var s = el.selectionStart || 0;
      var end = el.selectionEnd || 0;
      el.value = el.value.substring(0, s) + text + el.value.substring(end);
      el.selectionStart = el.selectionEnd = s + text.length;
      el.dispatchEvent(new Event("input", {bubbles:true}));
      el.dispatchEvent(new Event("change", {bubbles:true}));
      return;
    }

    // Monkey-patch clipboard.readText so n8n gets our data
    var origRT = navigator.clipboard && navigator.clipboard.readText;
    try {
      if (navigator.clipboard) {
        navigator.clipboard.readText = function() {
          navigator.clipboard.readText = origRT;
          return Promise.resolve(text);
        };
      }
    } catch(ex) {
      try {
        Object.defineProperty(navigator.clipboard, "readText", {
          value: function() {
            Object.defineProperty(navigator.clipboard, "readText", {
              value: origRT, writable:true, configurable:true
            });
            return Promise.resolve(text);
          }, writable:true, configurable:true
        });
      } catch(ex2) {}
    }

    // Dispatch synthetic keydown Cmd+V (with guard to prevent re-entry)
    _pasteInProgress = true;
    var kbOpts = {key:"v",code:"KeyV",keyCode:86,which:86,metaKey:true,ctrlKey:false,bubbles:true,cancelable:true};
    var tgt = document.activeElement || document.body;
    tgt.dispatchEvent(new KeyboardEvent("keydown", kbOpts));
    document.dispatchEvent(new KeyboardEvent("keydown", kbOpts));

    // Also dispatch paste ClipboardEvent
    try {
      var dt = new DataTransfer();
      dt.setData("text/plain", text);
      tgt.dispatchEvent(new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData:dt}));
      document.dispatchEvent(new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData:dt}));
    } catch(ex) {}

    // Cleanup guard and monkey-patch after n8n has had time to read
    setTimeout(function(){
      _pasteInProgress = false;
      try { if(origRT && navigator.clipboard) navigator.clipboard.readText = origRT; } catch(ex){}
    }, 500);
  }

  // Intercept Cmd+V only (macOS-specific bridge — no static secret here;
  // origin validation and one-time grant tokens are enforced in the parent webview)
  document.addEventListener("keydown", function(e) {
    if (e.metaKey && e.key === "v") {
      if (_pasteInProgress) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      window.parent.postMessage({ type: "n8n-paste-request" }, "*");
    }
    if (e.metaKey && e.key === "c") {
      setTimeout(function() {
        var sel = window.getSelection();
        var text = sel ? sel.toString() : "";
        if (text) {
          window.parent.postMessage({ type: "n8n-clipboard-write", text: text }, "*");
        }
      }, 50);
    }
  }, true);

  // Listen for paste data from parent webview
  // The parent webview validates origin and uses one-time grant tokens;
  // no additional secret is needed on this side.
  window.addEventListener("message", function(e) {
    var msg = e.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "n8n-clipboard-paste" && typeof msg.text === "string") {
      handlePaste(msg.text);
    }
  });
})();
<` + `/script>`;
    }

    /**
     * Inject a clipboard bridge script into n8n's HTML responses.
     *
     * On macOS, Electron intercepts Cmd+C/V/X at the native menu level before
     * keyboard events reach the webview. The Clipboard API also doesn't work
     * inside cross-origin iframes in VS Code webviews.
     *
     * This bridge script:
     * 1. Intercepts Cmd+V keydown in the iframe
     * 2. Requests clipboard data from the parent webview via postMessage
     * 3. Monkey-patches navigator.clipboard.readText so n8n reads our data
     * 4. Dispatches synthetic keyboard and clipboard events to trigger n8n's paste handler
     */
    private injectClipboardBridge(html: string): string {
        const bridgeScript = ProxyService.buildBridgeScript();

        if (html.includes('</head>')) {
            return html.replace('</head>', bridgeScript + '</head>');
        } else if (html.includes('</body>')) {
            return html.replace('</body>', bridgeScript + '</body>');
        }
        return html + bridgeScript;
    }

    public stop() {
        if (this.wsServer) {
            this.wsServer.close();
            this.wsServer = undefined;
        }
        if (this.server) {
            this.server.close();
            this.server = undefined;
        }
        if (this.proxy) {
            this.proxy.close();
            this.proxy = undefined;
        }
    }

    public getProxyUrl(): string {
        return this.port > 0 ? `http://localhost:${this.port}` : '';
    }
}
