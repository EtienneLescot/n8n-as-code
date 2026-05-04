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
    private htmlRoutes = new Map<string, string>();

    constructor() { }

    public setSecrets(secrets: vscode.SecretStorage) {
        this.secrets = secrets;
    }

    public setOutputChannel(channel: vscode.OutputChannel) {
        this.outputChannel = channel;
    }

    public registerHtmlRoute(routePath: string, html: string): void {
        this.htmlRoutes.set(this.normalizeRoutePath(routePath), html);
    }

    /**
     * Check whether a WebSocket close code is valid for sending in a close frame.
     * Codes 1004, 1005, 1006, and 1015 are reserved and MUST NOT be set as a
     * status code in a Close control frame (RFC 6455 §7.4.1).
     */
    private isSendableCloseCode(code: number): boolean {
        if (code >= 3000 && code <= 4999) { return true; }
        if (code >= 1000 && code <= 1003) { return true; }
        if (code >= 1007 && code <= 1014) { return true; }
        return false;
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
        this.htmlRoutes.clear();
        this.target = normalizedTarget;
        this.port = stablePort;

        const isMacOS = os.platform() === 'darwin';

        // Load persisted cookies
        await this.loadCookies();

        this.proxy = httpProxy.createProxyServer({
            target: this.target,
            changeOrigin: true,
            secure: false,
            // Intercept HTML responses so we can inject the n8n UI bridge.
            selfHandleResponse: true,
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
                        html = this.injectClipboardBridge(html, isMacOS);
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
            const routeHtml = this.getRegisteredHtmlRoute(req.url);
            if (routeHtml && req.method === 'GET') {
                res.writeHead(200, {
                    'content-type': 'text/html; charset=utf-8',
                    'cache-control': 'no-store',
                });
                res.end(this.injectClipboardBridge(routeHtml, isMacOS, false, 'auth-route'));
                return;
            }

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
                // Request uncompressed responses so HTML bridge injection can safely mutate the body.
                delete req.headers['accept-encoding'];

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
                                if (this.isSendableCloseCode(code)) {
                                    clientWs.close(code, reason);
                                } else {
                                    clientWs.close();
                                }
                            } else {
                                clientWs.terminate();
                            }
                        });

                        clientWs.on('close', (code, reason) => {
                            clearPing();
                            if (upstreamWs.readyState === WebSocket.OPEN || upstreamWs.readyState === WebSocket.CONNECTING) {
                                if (this.isSendableCloseCode(code)) {
                                    upstreamWs.close(code, reason);
                                } else {
                                    upstreamWs.close();
                                }
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
    static buildBridgeScript(clipboardBridgeEnabled = true, nodeBridgeEnabled = true, pageKind = 'n8n'): string {
        return `<script>
(function(){
  var CLIPBOARD_BRIDGE_ENABLED = ${JSON.stringify(clipboardBridgeEnabled)};
  var NODE_BRIDGE_ENABLED = ${JSON.stringify(nodeBridgeEnabled)};
  var N8NAC_BRIDGE_PAGE_KIND = ${JSON.stringify(pageKind)};
  var N8NAC_BRIDGE_BUILD = "2026.05.04.8";
  var _pasteInProgress = false;
  var _lastNodeDetailSignature = "";
  var _lastCanvasNode = null;
  var _uiMutationTimer = null;
  var _uiMutationCount = 0;

  function postBridgeReady() {
    window.parent.postMessage({ type: "n8n-bridge-ready", build: N8NAC_BRIDGE_BUILD, pageKind: N8NAC_BRIDGE_PAGE_KIND, href: window.location.href }, "*");
  }

  function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  }

  function cleanText(value) {
    if (typeof value !== "string") return "";
    return value.replace(/\\s+/g, " ").trim();
  }

  function coerceNode(value) {
    var record = asRecord(value);
    if (!record) return null;
    var name = cleanText(record.name || record.displayName || record.label || record.title || "");
    if (!name) return null;
    return {
      name: name,
      type: cleanText(record.type || record.nodeType || record.typeVersion || ""),
      id: cleanText(record.id || record.nodeId || "")
    };
  }

  function describeElement(element) {
    if (!element || element.nodeType !== 1) return "unknown";
    var tag = cleanText(element.tagName || "element").toLowerCase();
    var testId = element.getAttribute && cleanText(element.getAttribute("data-test-id") || "");
    var label = element.getAttribute && cleanText(element.getAttribute("aria-label") || element.getAttribute("title") || "");
    var text = cleanText(element.textContent || "");
    if (text.length > 60) text = text.slice(0, 57) + "...";
    return [tag, testId || label || text].filter(Boolean).join(": ");
  }

  function postUiClick(event) {
    var target = event.target;
    var nodeRoot = findCanvasNodeElement(target);
    var canvasSurface = isCanvasSurfaceElement(target);
    var node = null;
    if (nodeRoot) {
      try { node = readNodeFromElement(target); } catch (e) {}
      window.setTimeout(function() {
        publishNodeDetail(node || readNodeFromStore());
      }, 50);
    } else if (canvasSurface) {
      clearNodeContext();
    }
    window.parent.postMessage({
      type: "n8n-ui-click",
      build: N8NAC_BRIDGE_BUILD,
      target: describeElement(event.target),
      nodeName: node && node.name
    }, "*");
  }

  function postUiChangedSoon() {
    _uiMutationCount += 1;
    if (_uiMutationTimer) return;
    _uiMutationTimer = window.setTimeout(function() {
      _uiMutationTimer = null;
      window.parent.postMessage({
        type: "n8n-ui-change",
        build: N8NAC_BRIDGE_BUILD,
        count: _uiMutationCount
      }, "*");
    }, 250);
  }

  function firstUsefulText(root) {
    if (!root) return "";
    var selectors = ["[data-test-id='node-title']", "[data-test-id*='node-name']", "[data-test-id*='nodeName']", "[class*='node-name']", "[class*='nodeName']", "[class*='node-title']", "[class*='nodeTitle']", "[class*='modal-title']", "[class*='ModalTitle']", ".el-dialog__title", "header [class*='title']", "header [class*='Title']", "[title]", "[aria-label]", "[role='heading']", "h1", "h2", "h3"];
    for (var i = 0; i < selectors.length; i++) {
      try {
        var candidate = root.matches && root.matches(selectors[i]) ? root : root.querySelector && root.querySelector(selectors[i]);
        var text = cleanText((candidate && (candidate.getAttribute("title") || candidate.getAttribute("aria-label") || candidate.textContent)) || "");
        if (text && text.length <= 120 && text !== "Parameters" && text !== "Settings") return text;
      } catch (e) {}
    }
    var fallback = cleanText(root.textContent || "");
    if (!fallback || fallback.length > 160) return "";
    return fallback;
  }

  function looksLikeNodeDetailPanel(root) {
    if (!root || !isVisible(root)) return false;
    var text = cleanText(root.textContent || "");
    if (!text) return false;
    if (/\\b(Parameters|Settings)\\b/.test(text) && /\\b(Execute step|INPUT|OUTPUT|Source for Prompt|Options)\\b/.test(text)) return true;
    if (/\\b(Node|Credential|Parameter|Execute step)\\b/.test(text) && /\\b(INPUT|OUTPUT|Parameters|Settings)\\b/.test(text)) return true;
    return false;
  }

  function isLikelyNodeTitleText(text) {
    text = cleanText(text);
    if (!text || text.length < 2 || text.length > 120) return false;
      if (/^(Parameters|Settings|INPUT|OUTPUT|Docs|Execute step|Execute previous nodes|No input data|No output data|Options|Add Option|Tool|Memory|Chat Model|Logs)$/i.test(text)) return false;
      if (/^(Tip:|Source for Prompt|Prompt \\(|Require Specific|Enable Fallback|Connected Chat Trigger Node)/i.test(text)) return false;
    if (/^[+×x\-–—|•·]+$/.test(text)) return false;
    return true;
  }

  function readNodeTitleFromPanelTopBand(root) {
    if (!root || !isVisible(root)) return null;
    var rootRect = root.getBoundingClientRect();
    var selectors = "div,span,h1,h2,h3,[role='heading'],[title],[aria-label]";
    var candidates = [];
    try { candidates = Array.prototype.slice.call(root.querySelectorAll(selectors)); } catch (e) { candidates = []; }
    if (root.matches && root.matches(selectors)) candidates.unshift(root);

    var best = null;
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (!isVisible(el)) continue;
      var rect = el.getBoundingClientRect();
      if (rect.top < rootRect.top - 2 || rect.top > rootRect.top + 80) continue;
      if (rect.left < rootRect.left - 2 || rect.left > rootRect.left + Math.max(220, rootRect.width * 0.45)) continue;
      var text = cleanText(el.getAttribute && (el.getAttribute("title") || el.getAttribute("aria-label")) || el.textContent || "");
      if (!isLikelyNodeTitleText(text)) continue;
      var score = (rect.top - rootRect.top) * 1000 + (rect.left - rootRect.left) + Math.max(0, text.length - 60) * 10;
      if (!best || score < best.score) best = { score: score, text: text };
    }
    return best ? { name: best.text, type: "", id: "" } : null;
  }

  function findNodeDetailRootByTextScan() {
    var candidates = [];
    try { candidates = Array.prototype.slice.call(document.querySelectorAll("[role='dialog'],[aria-modal='true'],section,aside,main,div")); } catch (e) { candidates = []; }
    var best = null;
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (!isVisible(el)) continue;
      var rect = el.getBoundingClientRect();
      if (rect.width < 300 || rect.height < 180) continue;
      var text = cleanText(el.textContent || "");
      if (!/\\bParameters\\b/.test(text) || !/\\bSettings\\b/.test(text) || !/\\bExecute step\\b/.test(text)) continue;
      var title = readNodeTitleFromPanelTopBand(el);
      if (!title) continue;
      var area = rect.width * rect.height;
      if (!best || area < best.area) best = { area: area, element: el };
    }
    return best ? best.element : null;
  }

  function findNodeDetailTitleByPanelText() {
    var titleSelectors = ["[data-test-id='node-title']", "[data-test-id*='node-name']", "[data-test-id*='nodeName']", "[class*='node-name']", "[class*='nodeName']", "[class*='modal-title']", "[class*='ModalTitle']", ".el-dialog__title", "header [class*='title']", "header [class*='Title']", "h1", "h2", "h3", "[role='heading']"];
    for (var i = 0; i < titleSelectors.length; i++) {
      var titles = [];
      try { titles = Array.prototype.slice.call(document.querySelectorAll(titleSelectors[i])); } catch (e) { titles = []; }
      for (var j = 0; j < titles.length; j++) {
        var title = titles[j];
        if (!isVisible(title)) continue;
        var name = cleanText(title.textContent || title.getAttribute("title") || title.getAttribute("aria-label") || "");
        if (!isLikelyNodeTitleText(name)) continue;

        var cursor = title;
        for (var depth = 0; cursor && depth < 8; depth++) {
          var text = cleanText(cursor.textContent || "");
          if (/\\bParameters\\b/.test(text) && /\\bSettings\\b/.test(text) && /\\bExecute step\\b/.test(text)) {
            return { name: name, type: "", id: "" };
          }
          cursor = cursor.parentElement;
        }
      }
    }
    return null;
  }

  function readNodeFromElement(element) {
    if (!element || !element.closest) return null;
    var root = findCanvasNodeElement(element);
    if (!root) return null;
    var attrHost = root.matches && (root.matches("[data-node-name]") || root.matches("[data-name]"))
      ? root
      : root.querySelector && root.querySelector("[data-node-name], [data-name]");
    var attrName = attrHost && cleanText(attrHost.getAttribute("data-node-name") || attrHost.getAttribute("data-name") || "");
    var name = attrName || firstUsefulText(root);
    if (!name) return null;
    return {
      name: name,
      type: cleanText((attrHost && (attrHost.getAttribute("data-node-type") || attrHost.getAttribute("data-type"))) || root.getAttribute && (root.getAttribute("data-node-type") || root.getAttribute("data-type")) || ""),
      id: cleanText((attrHost && (attrHost.getAttribute("data-node-id") || attrHost.getAttribute("data-id"))) || root.getAttribute && (root.getAttribute("data-node-id") || root.getAttribute("data-id")) || "")
    };
  }

  function findCanvasNodeElement(element) {
    if (!element || !element.closest) return null;
    var selectors = [
      "[data-test-id='canvas-node']",
      "[data-test-id*='canvas-node']",
      "[data-test-id*='workflow-node']",
      "[data-test-id*='node-view-node']",
      "[data-node-name]",
      "[data-name]",
      "[class*='canvas-node']",
      "[class*='CanvasNode']",
      "[class*='workflow-node']",
      "[class*='node-box']"
    ];
    for (var i = 0; i < selectors.length; i++) {
      try {
        var match = element.closest(selectors[i]);
        if (match && isVisible(match)) return match;
      } catch (e) {}
    }
    return null;
  }

  function isCanvasSurfaceElement(element) {
    if (!element || !element.closest) return false;
    if (findCanvasNodeElement(element)) return false;
    if (findNodeDetailRoot() && element.closest && element.closest("[role='dialog'],[aria-modal='true'],[class*='node-parameters'],[class*='NodeParameters'],[class*='modal'],[class*='Modal'],[class*='drawer'],[class*='Drawer']")) return false;
    var selectors = [
      "[data-test-id='canvas']",
      "[data-test-id*='canvas']",
      "[data-test-id*='node-view']",
      "[data-test-id*='workflow']",
      "[class*='canvas']",
      "[class*='Canvas']",
      "[class*='node-view']",
      "[class*='NodeView']",
      ".vue-flow",
      ".react-flow"
    ];
    for (var i = 0; i < selectors.length; i++) {
      try {
        var match = element.closest(selectors[i]);
        if (match && isVisible(match)) return true;
      } catch (e) {}
    }
    return false;
  }

  function readNodeFromStore() {
    try {
      var app = document.querySelector("#app");
      var vue = app && app.__vue__;
      var store = vue && vue.$store;
      if (!store) return null;
      var getters = store.getters || {};
      var getterKeys = ["ndv/activeNode", "nodeView/selectedNode", "workflows/getSelectedNode", "workflows/selectedNode"];
      for (var i = 0; i < getterKeys.length; i++) {
        var fromGetter = coerceNode(getters[getterKeys[i]]);
        if (fromGetter) return fromGetter;
      }
      var state = store.state || {};
      var candidates = [
        state.ndv && state.ndv.activeNode,
        state.ndv && state.ndv.node,
        state.nodeView && state.nodeView.selectedNode,
        state.workflows && state.workflows.selectedNode,
        state.workflows && state.workflows.activeNode
      ];
      for (var j = 0; j < candidates.length; j++) {
        var fromState = coerceNode(candidates[j]);
        if (fromState) return fromState;
      }
    } catch (e) {}
    return null;
  }

  function isVisible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect && el.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return false;
    var style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    return !style || (style.visibility !== "hidden" && style.display !== "none");
  }

  function findNodeDetailRoot() {
    var selectors = [
      "[data-test-id='ndv']",
      "[data-test-id='node-parameters']",
      "[data-test-id*='node-parameters']",
      "[data-test-id*='node-creator']",
      "[data-test-id*='node-detail']",
      "[data-test-id*='nodeDetail']",
      "[role='dialog']",
      "[aria-modal='true']",
      "[class*='node-parameters']",
      "[class*='NodeParameters']",
      "[class*='node-detail']",
      "[class*='NodeDetail']",
      "[class*='node-settings']",
      "[class*='NodeSettings']",
      "[class*='modal']",
      "[class*='Modal']",
      "[class*='dialog']",
      "[class*='Dialog']",
      "[class*='drawer']",
      "[class*='Drawer']",
      "[class*='ndv']",
      "[class*='NDV']"
    ];
    for (var i = 0; i < selectors.length; i++) {
      try {
        var nodes = document.querySelectorAll(selectors[i]);
        for (var j = 0; j < nodes.length; j++) {
          if (looksLikeNodeDetailPanel(nodes[j])) return nodes[j];
        }
      } catch (e) {}
    }
    return null;
  }

  function readNodeFromDom(root) {
    if (!root) return null;
    var attrHost = root.matches && root.matches("[data-node-name]") ? root : root.querySelector && root.querySelector("[data-node-name]");
    var attrName = attrHost && cleanText(attrHost.getAttribute("data-node-name") || "");
    if (attrName) {
      return {
        name: attrName,
        type: cleanText((attrHost && attrHost.getAttribute("data-node-type")) || ""),
        id: cleanText((attrHost && attrHost.getAttribute("data-node-id")) || "")
      };
    }
    var titleSelectors = ["[data-test-id='node-title']", "[data-test-id*='node-name']", "[data-test-id*='nodeName']", "[class*='node-name']", "[class*='nodeName']", "[class*='modal-title']", "[class*='ModalTitle']", ".el-dialog__title", "header [class*='title']", "header [class*='Title']", "h1", "h2", "h3", "[role='heading']"];
    for (var i = 0; i < titleSelectors.length; i++) {
      try {
        var title = root.querySelector(titleSelectors[i]);
        var text = cleanText(title && title.textContent || "");
        if (text && text !== "Parameters" && text !== "Settings" && text !== "INPUT" && text !== "OUTPUT" && text.length <= 120) {
          return { name: text, type: "", id: "" };
        }
      } catch (e) {}
    }
    return null;
  }

  function readNodeFromUrl() {
    try {
      var url = new URL(window.location.href);
      var name = cleanText(url.searchParams.get("node") || url.searchParams.get("nodeName") || "");
      var id = cleanText(url.searchParams.get("nodeId") || url.searchParams.get("selectedNode") || "");
      return name ? { name: name, type: "", id: id } : null;
    } catch (e) {
      return null;
    }
  }

  function publishNodeDetailIfOpen() {
    if (!NODE_BRIDGE_ENABLED) return;
    var root = findNodeDetailRoot();
    var node = readNodeFromStore() || (root ? readNodeFromDom(root) : null) || (root ? readNodeTitleFromPanelTopBand(root) : null) || findNodeDetailTitleByPanelText() || readNodeFromUrl() || (root ? _lastCanvasNode : null);
    publishNodeDetail(node);
  }

  function publishNodeDetail(node) {
    if (!NODE_BRIDGE_ENABLED) return;
    if (!node || !node.name) return;
    var signature = [node.name, node.type || "", node.id || ""].join("|");
    if (signature === _lastNodeDetailSignature) return;
    _lastNodeDetailSignature = signature;
    window.parent.postMessage({ type: "n8n-node-detail-opened", build: N8NAC_BRIDGE_BUILD, node: node }, "*");
  }

  function clearNodeContext() {
    _lastNodeDetailSignature = "";
    _lastCanvasNode = null;
    window.parent.postMessage({ type: "n8n-node-context-cleared", build: N8NAC_BRIDGE_BUILD }, "*");
  }

  function installNodeDetailObserver() {
    postBridgeReady();
    if (!NODE_BRIDGE_ENABLED) return;
    document.addEventListener("pointerdown", function(e) {
      var node = readNodeFromElement(e.target);
      if (node) _lastCanvasNode = node;
    }, true);
    document.addEventListener("click", function(e) {
      postUiClick(e);
    }, true);
    document.addEventListener("dblclick", function(e) {
      var node = readNodeFromElement(e.target) || _lastCanvasNode;
      if (!node) return;
      _lastCanvasNode = node;
      window.setTimeout(function() {
        publishNodeDetail(node || readNodeFromStore());
      }, 200);
    }, true);
    try {
      var observer = new MutationObserver(function() { postUiChangedSoon(); });
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true, attributes: true });
    } catch (e) {}
    window.setInterval(postBridgeReady, 5000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installNodeDetailObserver, { once: true });
  } else {
    installNodeDetailObserver();
  }

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
    if (!CLIPBOARD_BRIDGE_ENABLED) return;
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
    if (CLIPBOARD_BRIDGE_ENABLED && msg.type === "n8n-clipboard-paste" && typeof msg.text === "string") {
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
    private injectClipboardBridge(html: string, clipboardBridgeEnabled = true, nodeBridgeEnabled = true, pageKind = 'n8n'): string {
        const bridgeScript = ProxyService.buildBridgeScript(clipboardBridgeEnabled, nodeBridgeEnabled, pageKind);

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

    private getRegisteredHtmlRoute(requestUrl?: string): string | undefined {
        try {
            const url = new URL(requestUrl ?? '/', `http://localhost:${this.port || 0}`);
            return this.htmlRoutes.get(this.normalizeRoutePath(url.pathname));
        } catch {
            return undefined;
        }
    }

    private normalizeRoutePath(routePath: string): string {
        const trimmed = routePath.trim();
        if (!trimmed) return '/';
        try {
            return new URL(trimmed, 'http://localhost').pathname;
        } catch {
            return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
        }
    }
}
