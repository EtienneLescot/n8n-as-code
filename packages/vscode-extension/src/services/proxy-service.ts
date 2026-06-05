import * as http from 'http';
import * as os from 'os';
import HttpProxy from 'http-proxy';
import type HttpProxyServer = require('http-proxy');
import type * as vscode from 'vscode';
import { AddressInfo } from 'net';
import { randomUUID } from 'crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { openExternalNavigation } from '../utils/external-navigation.js';

type ExternalAuthRequest = {
    token: string;
    targetUrl: string;
};

type ExternalAuthSession = {
    expiresAt: number;
    expectedTargetUrl: string;
};

export class ProxyService {
    private server: http.Server | undefined;
    private proxy: HttpProxyServer | undefined;
    private wsServer: WebSocketServer | undefined;
    private port: number = 0;
    private target: string = '';
    private publicBaseUrl: string | undefined;
    private outputChannel: vscode.OutputChannel | undefined;
    private secrets: vscode.SecretStorage | undefined;

    private cookieJar = new Map<string, string>();
    private htmlRoutes = new Map<string, string>();
    private externalAuthSessions = new Map<string, ExternalAuthSession>();
    private lastWorkflowProxyUrl: string | undefined;

    private readonly externalAuthRoutePrefix = '/__n8nac-external-auth/';
    private readonly externalAuthSessionTtlMs = 15 * 60 * 1000;

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

    public setPublicBaseUrl(publicBaseUrl: string | undefined): void {
        const trimmed = publicBaseUrl?.trim();
        this.publicBaseUrl = trimmed ? trimmed.replace(/\/$/, '') : undefined;
    }

    private getProxyBaseUrl(): string {
        return this.publicBaseUrl || `http://localhost:${this.port}`;
    }

    private rewriteProxyLocation(location: string, sourceUrl = this.target, externalAuthToken?: string): string {
        const proxyBaseUrl = this.getProxyBaseUrl();
        try {
            const targetUrl = new URL(this.target);
            const targetBasePath = this.trimTrailingSlash(targetUrl.pathname);
            const sourceBaseUrl = new URL(sourceUrl || this.target);

            if (location.startsWith('/') && !location.startsWith('//')) {
                const locationUrl = new URL(location, sourceBaseUrl.origin);
                if (locationUrl.origin !== targetUrl.origin) {
                    return externalAuthToken ? this.buildExternalAuthProxyUrl(locationUrl.toString(), externalAuthToken) : location;
                }
                if (externalAuthToken) {
                    this.externalAuthSessions.delete(externalAuthToken);
                }
                const remainingPath = this.stripTargetBasePath(locationUrl.pathname, targetBasePath);
                return `${proxyBaseUrl}${remainingPath}${locationUrl.search}${locationUrl.hash}`;
            }

            const locationUrl = location.startsWith('//')
                ? new URL(`${sourceBaseUrl.protocol}${location}`)
                : new URL(location);
            if (locationUrl.origin !== targetUrl.origin) {
                return externalAuthToken ? this.buildExternalAuthProxyUrl(locationUrl.toString(), externalAuthToken) : location;
            }

            if (externalAuthToken) {
                this.externalAuthSessions.delete(externalAuthToken);
            }

            if (!this.urlPathMatchesBase(locationUrl.pathname, targetBasePath)) {
                return location;
            }

            const remainingPath = this.stripTargetBasePath(locationUrl.pathname, targetBasePath);
            return `${proxyBaseUrl}${remainingPath}${locationUrl.search}${locationUrl.hash}`;
        } catch {
            return location;
        }
    }

    private trimTrailingSlash(pathname: string): string {
        const trimmed = pathname.replace(/\/$/, '');
        return trimmed === '/' ? '' : trimmed;
    }

    private urlPathMatchesBase(pathname: string, basePath: string): boolean {
        return !basePath || pathname === basePath || pathname.startsWith(`${basePath}/`);
    }

    private stripTargetBasePath(pathname: string, basePath: string): string {
        if (!this.urlPathMatchesBase(pathname, basePath)) {
            return pathname;
        }
        if (!basePath) {
            return pathname === '/' ? '' : pathname;
        }
        return pathname.slice(basePath.length);
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

    private async openExternalUrl(url: string): Promise<void> {
        await openExternalNavigation({
            url,
            reason: 'oauth',
            source: { panelKind: 'proxy' },
        }, { outputChannel: this.outputChannel, logPrefix: '[Proxy]' });
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

    private cleanupExternalAuthSessions(): void {
        const now = Date.now();
        for (const [token, session] of this.externalAuthSessions) {
            if (session.expiresAt <= now) {
                this.externalAuthSessions.delete(token);
            }
        }
    }

    private createExternalAuthSession(expectedTargetUrl: string): string {
        this.cleanupExternalAuthSessions();
        const token = randomUUID();
        this.externalAuthSessions.set(token, {
            expiresAt: Date.now() + this.externalAuthSessionTtlMs,
            expectedTargetUrl: this.normalizeExternalAuthTargetUrl(expectedTargetUrl),
        });
        return token;
    }

    private getExternalAuthSession(token: string): ExternalAuthSession | undefined {
        this.cleanupExternalAuthSessions();
        return token ? this.externalAuthSessions.get(token) : undefined;
    }

    private normalizeExternalAuthTargetUrl(targetUrl: string): string {
        return new URL(targetUrl).toString();
    }

    private buildExternalAuthProxyUrl(targetUrl: string, token?: string): string {
        const normalizedTargetUrl = this.normalizeExternalAuthTargetUrl(targetUrl);
        const sessionToken = token || this.createExternalAuthSession(normalizedTargetUrl);
        const session = this.getExternalAuthSession(sessionToken);
        if (session) {
            session.expectedTargetUrl = normalizedTargetUrl;
        }
        return `${this.getProxyBaseUrl()}${this.externalAuthRoutePrefix}${encodeURIComponent(sessionToken)}?url=${encodeURIComponent(normalizedTargetUrl)}`;
    }

    private parseExternalAuthProxyRequest(requestUrl?: string): ExternalAuthRequest | undefined {
        try {
            const url = new URL(requestUrl ?? '/', `http://localhost:${this.port || 0}`);
            if (!url.pathname.startsWith(this.externalAuthRoutePrefix)) {
                return undefined;
            }

            const token = decodeURIComponent(url.pathname.slice(this.externalAuthRoutePrefix.length));
            const targetUrl = url.searchParams.get('url') || '';
            const session = this.getExternalAuthSession(token);
            if (!session) {
                return undefined;
            }

            const parsedTargetUrl = new URL(targetUrl);
            if (!['http:', 'https:'].includes(parsedTargetUrl.protocol)) {
                return undefined;
            }
            const normalizedTargetUrl = parsedTargetUrl.toString();
            if (normalizedTargetUrl !== session.expectedTargetUrl) {
                return undefined;
            }

            return { token, targetUrl: normalizedTargetUrl };
        } catch {
            return undefined;
        }
    }

    private isExternalN8nRedirect(location: string): boolean {
        try {
            const targetUrl = new URL(this.target);
            const locationUrl = new URL(location, targetUrl.origin);
            return locationUrl.origin !== targetUrl.origin;
        } catch {
            return false;
        }
    }

    private createExternalAuthHandoff(location: string, returnUrl: string): { authProxyUrl: string; html: string } | undefined {
        if (!this.isExternalN8nRedirect(location)) {
            return undefined;
        }

        const targetUrl = new URL(location, new URL(this.target).origin).toString();
        const authProxyUrl = this.buildExternalAuthProxyUrl(targetUrl);
        return {
            authProxyUrl,
            html: this.buildExternalAuthHandoffHtml(authProxyUrl, returnUrl),
        };
    }

    private buildProxyRequestUrl(requestUrl?: string): string {
        const path = requestUrl && requestUrl.startsWith('/') ? requestUrl : `/${requestUrl || ''}`;
        return `${this.getProxyBaseUrl()}${path}`;
    }

    private rememberWorkflowProxyUrl(requestUrl?: string): void {
        try {
            const url = new URL(requestUrl ?? '/', `http://localhost:${this.port || 0}`);
            if (url.pathname.startsWith('/workflow/')) {
                this.lastWorkflowProxyUrl = this.buildProxyRequestUrl(`${url.pathname}${url.search}`);
            }
        } catch {
            // ignore malformed request URLs
        }
    }

    private getWorkflowRetryUrl(req: http.IncomingMessage): string {
        const referrer = typeof req.headers.referer === 'string' ? req.headers.referer : undefined;
        const proxyBaseUrl = new URL(this.getProxyBaseUrl());
        if (referrer) {
            try {
                const referrerUrl = new URL(referrer);
                const proxyBasePath = this.trimTrailingSlash(proxyBaseUrl.pathname);
                const referrerPath = proxyBasePath && referrerUrl.pathname.startsWith(`${proxyBasePath}/`)
                    ? referrerUrl.pathname.slice(proxyBasePath.length)
                    : referrerUrl.pathname;
                if (referrerUrl.origin === proxyBaseUrl.origin && referrerPath.startsWith('/workflow/')) {
                    return referrerUrl.toString();
                }
            } catch {
                // ignore malformed referrers
            }
        }

        return this.lastWorkflowProxyUrl || this.buildProxyRequestUrl(req.url);
    }

    private buildExternalAuthHandoffHtml(authProxyUrl: string, returnUrl: string): string {
        const htmlSafe = (value: string) => value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        const authUrlHtml = htmlSafe(authProxyUrl);
        const returnUrlHtml = htmlSafe(returnUrl);
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>n8n sign-in</title>
  <style>
    html, body { margin: 0; min-height: 100%; background: #1e1e1e; color: #f3f3f3; font-family: system-ui, -apple-system, sans-serif; }
    body { display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
    main { max-width: 520px; text-align: center; }
    h1 { font-size: 20px; line-height: 1.35; margin: 0 0 12px; font-weight: 600; }
    p { margin: 0 0 20px; color: #c8c8c8; line-height: 1.5; }
    a { color: #ffffff; }
    .actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
    .button { display: inline-flex; align-items: center; justify-content: center; min-height: 34px; padding: 0 14px; border-radius: 4px; background: #0e639c; color: #fff; text-decoration: none; font-size: 13px; }
    .secondary { background: #3c3c3c; }
  </style>
</head>
<body>
  <main>
    <h1>Continue n8n sign-in in your browser</h1>
    <p>Your SSO provider needs to run outside the embedded workflow view. After sign-in completes, return here and retry the workflow.</p>
    <div class="actions">
      <a class="button" href="${authUrlHtml}" target="_blank" rel="noreferrer">Open browser sign-in</a>
      <a class="button secondary" href="${returnUrlHtml}">Retry workflow</a>
    </div>
  </main>
</body>
</html>`;
    }

    private handleExternalAuthProxyRequest(req: http.IncomingMessage, res: http.ServerResponse): boolean {
        const authRequest = this.parseExternalAuthProxyRequest(req.url);
        if (!authRequest || !this.proxy) {
            return false;
        }

        const targetUrl = new URL(authRequest.targetUrl);
        (req as http.IncomingMessage & { __n8nacExternalAuth?: ExternalAuthRequest }).__n8nacExternalAuth = authRequest;
        req.url = `${targetUrl.pathname}${targetUrl.search}`;
        delete req.headers['accept-encoding'];
        req.headers['host'] = targetUrl.host;
        req.headers['origin'] = targetUrl.origin;
        res.setHeader('access-control-allow-origin', '*');
        res.setHeader('access-control-allow-credentials', 'true');

        this.proxy.web(req, res, {
            target: targetUrl.origin,
            changeOrigin: true,
            secure: false,
            buffer: undefined,
        });
        return true;
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
        this.externalAuthSessions.clear();
        this.lastWorkflowProxyUrl = undefined;
        this.setPublicBaseUrl(undefined);
        this.target = normalizedTarget;
        this.port = stablePort;

        const isMacOS = os.platform() === 'darwin';

        // Load persisted cookies
        await this.loadCookies();

        this.proxy = HttpProxy.createProxyServer({
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
        this.proxy.on('proxyRes', (proxyRes, req, res) => {
            const externalAuth = (req as http.IncomingMessage & { __n8nacExternalAuth?: ExternalAuthRequest }).__n8nacExternalAuth;
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
                const isRedirect = (proxyRes.statusCode || 0) >= 300 && (proxyRes.statusCode || 0) < 400;
                if (!externalAuth && isRedirect && this.isExternalN8nRedirect(location)) {
                    const returnUrl = this.getWorkflowRetryUrl(req);
                    const handoff = this.createExternalAuthHandoff(location, returnUrl);
                    if (handoff) {
                        const httpRes = res as http.ServerResponse;
                        void this.openExternalUrl(handoff.authProxyUrl);
                        proxyRes.resume();
                        httpRes.writeHead(200, {
                            'content-type': 'text/html; charset=utf-8',
                            'cache-control': 'no-store',
                        });
                        httpRes.end(handoff.html);
                        return;
                    }
                }
                proxyRes.headers['location'] = this.rewriteProxyLocation(
                    location,
                    externalAuth?.targetUrl ?? this.target,
                    externalAuth?.token,
                );
            }

            // CRITICAL: Capture and Fix cookies for iframe/webview context
            if (proxyRes.headers['set-cookie']) {
                proxyRes.headers['set-cookie'] = proxyRes.headers['set-cookie'].map(cookie => {
                    const eqIdx = cookie.indexOf('=');
                    const scIdx = cookie.indexOf(';');
                    if (!externalAuth && eqIdx !== -1) {
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
                        if (!externalAuth) {
                            html = this.injectClipboardBridge(html, isMacOS);
                        }
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
            if (this.handleExternalAuthProxyRequest(req, res)) {
                return;
            }

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
                this.rememberWorkflowProxyUrl(req.url);

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
  var _popupBridgeInstalled = false;
  var _lastFormTestReadyAt = 0;
  var _formTestReadyVisible = false;

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

  function isPopupTarget(target) {
    var normalized = cleanText(target || "_blank").toLowerCase();
    return !normalized || normalized === "_blank" || normalized === "_new";
  }

  function isAnchorPopupTarget(target) {
    var normalized = cleanText(target).toLowerCase();
    return normalized === "_blank" || normalized === "_new";
  }

  function classifyExternalNavigation(url, target, fallbackReason) {
    if (url === undefined || url === null) return false;
    url = String(url);
    if (!url) return false;
    try {
      var absoluteUrl = new URL(url, window.location.href);
      var normalizedTarget = cleanText(target || "").toLowerCase();
      var reason = fallbackReason || "unknown";
      var isEndpoint = false;
      if (absoluteUrl.pathname === "/form-test" || absoluteUrl.pathname.indexOf("/form-test/") === 0
          || absoluteUrl.pathname === "/form" || absoluteUrl.pathname.indexOf("/form/") === 0) {
        reason = "form-trigger";
        isEndpoint = true;
      } else if (absoluteUrl.pathname === "/webhook-test" || absoluteUrl.pathname.indexOf("/webhook-test/") === 0
          || absoluteUrl.pathname === "/webhook" || absoluteUrl.pathname.indexOf("/webhook/") === 0) {
        reason = "webhook";
        isEndpoint = true;
      }
      return {
        url: absoluteUrl,
        reason: reason,
        externalOrigin: absoluteUrl.origin !== window.location.origin,
        endpoint: isEndpoint,
        popupTarget: isPopupTarget(normalizedTarget),
        anchorPopupTarget: isAnchorPopupTarget(normalizedTarget),
        topTarget: normalizedTarget === "_top" || normalizedTarget === "_parent"
      };
    } catch (e) {
      return false;
    }
  }

  function shouldExternalizeNavigation(url, target, fallbackReason) {
    var classified = classifyExternalNavigation(url, target, fallbackReason);
    if (!classified) return false;
    return classified.externalOrigin || classified.endpoint || classified.anchorPopupTarget || classified.topTarget ? classified : false;
  }

  function postOpenExternal(url, target, reason, features, sourceKind) {
    try {
      var classified = classifyExternalNavigation(url, target, reason || "popup");
      if (!classified) return false;
      var absoluteUrl = classified.url;
      if (absoluteUrl.protocol !== "http:" && absoluteUrl.protocol !== "https:") return false;
      window.parent.postMessage({
        type: "n8n-external-navigation",
        build: N8NAC_BRIDGE_BUILD,
        url: absoluteUrl.toString(),
        reason: classified.reason,
        target: typeof target === "string" ? target : "",
        features: typeof features === "string" ? features : "",
        source: {
          opener: sourceKind || "unknown",
          iframeHref: window.location.href,
          pageKind: N8NAC_BRIDGE_PAGE_KIND,
          bridgeBuild: N8NAC_BRIDGE_BUILD
        }
      }, "*");
      return true;
    } catch (e) {
      return false;
    }
  }

  function createPopupBridgeWindow(target) {
    var locationProxy = {
      assign: function(nextUrl) { postOpenExternal(nextUrl, target, "delayed-popup", "", "popup.location.assign"); },
      replace: function(nextUrl) { postOpenExternal(nextUrl, target, "delayed-popup", "", "popup.location.replace"); },
      toString: function() { return ""; }
    };
    var popup = {
      closed: false,
      close: function() { this.closed = true; },
      focus: function() {},
      blur: function() {}
    };

    Object.defineProperty(locationProxy, "href", {
      get: function() { return ""; },
      set: function(nextUrl) { postOpenExternal(nextUrl, target, "delayed-popup", "", "popup.location.href"); }
    });
    Object.defineProperty(popup, "location", {
      get: function() { return locationProxy; },
      set: function(nextUrl) { postOpenExternal(nextUrl, target, "delayed-popup", "", "popup.location"); }
    });

    return popup;
  }

  function installPopupBridge() {
    if (_popupBridgeInstalled) return;
    _popupBridgeInstalled = true;
    var originalWindowOpen = window.open;
    window.open = function(url, target, features) {
      var classified = url === undefined || url === null || !String(url) ? false : shouldExternalizeNavigation(url, target, "popup");
      if (isPopupTarget(target) || classified) {
        var popup = createPopupBridgeWindow(target);
        if (url === undefined || url === null || !String(url)) return popup;
        if (postOpenExternal(url, target, classified ? classified.reason : "popup", features, "window.open")) return popup;
      }
      return originalWindowOpen.apply(window, arguments);
    };

    if (window.HTMLAnchorElement && window.HTMLAnchorElement.prototype) {
      var originalAnchorClick = window.HTMLAnchorElement.prototype.click;
      window.HTMLAnchorElement.prototype.click = function() {
        var href = this && this.getAttribute ? this.getAttribute("href") || "" : "";
        var target = this && this.getAttribute ? this.getAttribute("target") || "" : "";
        var classified = shouldExternalizeNavigation(href, target, "popup");
        if (classified && postOpenExternal(href, target, classified.reason, "", "anchor.click")) return;
        return originalAnchorClick.apply(this, arguments);
      };
    }

    try {
      if (window.Location && window.Location.prototype) {
        var originalLocationAssign = window.Location.prototype.assign;
        var originalLocationReplace = window.Location.prototype.replace;
        window.Location.prototype.assign = function(nextUrl) {
          var classified = shouldExternalizeNavigation(nextUrl, "_self", "unknown");
          if (classified && postOpenExternal(nextUrl, "_self", classified.reason, "", "location.assign")) return;
          return originalLocationAssign.apply(this, arguments);
        };
        window.Location.prototype.replace = function(nextUrl) {
          var classified = shouldExternalizeNavigation(nextUrl, "_self", "unknown");
          if (classified && postOpenExternal(nextUrl, "_self", classified.reason, "", "location.replace")) return;
          return originalLocationReplace.apply(this, arguments);
        };
      }
    } catch (e) {}

    try {
      var originalPushState = history.pushState;
      var originalReplaceState = history.replaceState;
      history.pushState = function(state, title, url) {
        var result = originalPushState.apply(this, arguments);
        if (url !== undefined && url !== null) {
          var classified = shouldExternalizeNavigation(url, "_self", "unknown");
          if (classified) postOpenExternal(url, "_self", classified.reason, "", "history.pushState");
        }
        return result;
      };
      history.replaceState = function(state, title, url) {
        var result = originalReplaceState.apply(this, arguments);
        if (url !== undefined && url !== null) {
          var classified = shouldExternalizeNavigation(url, "_self", "unknown");
          if (classified) postOpenExternal(url, "_self", classified.reason, "", "history.replaceState");
        }
        return result;
      };
    } catch (e) {}

    document.addEventListener("click", function(e) {
      var target = e.target;
      var anchor = target && target.closest ? target.closest("a[href]") : null;
      if (!anchor) return;
      var href = anchor.getAttribute("href") || "";
      var anchorTarget = anchor.getAttribute("target") || "";
      var classified = shouldExternalizeNavigation(href, anchorTarget, "popup");
      if (!classified) return;
      if (anchor.hasAttribute("download")) return;
      if (!postOpenExternal(href, anchorTarget, classified.reason, "", "anchor.click-event")) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }, true);

    document.addEventListener("submit", function(e) {
      var form = e.target;
      if (!form || !form.getAttribute) return;
      var submitter = e.submitter && e.submitter.getAttribute ? e.submitter : null;
      var action = (submitter && submitter.getAttribute("formaction")) || form.getAttribute("action") || window.location.href;
      var target = (submitter && submitter.getAttribute("formtarget")) || form.getAttribute("target") || "";
      var classified = shouldExternalizeNavigation(action, target, "popup");
      if (!classified) return;
      if (!postOpenExternal(action, target, classified.reason, "", "form.submit")) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }, true);
  }

  installPopupBridge();

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
      detectFormTestReady();
      window.parent.postMessage({
        type: "n8n-ui-change",
        build: N8NAC_BRIDGE_BUILD,
        count: _uiMutationCount
      }, "*");
    }, 250);
  }

  function detectFormTestReady() {
    var text = cleanText((document.body && document.body.textContent) || "");
    if (!text) {
      _formTestReadyVisible = false;
      return;
    }
    var looksReady = /Waiting for you to submit the form/i.test(text)
      || /En attente de l'envoi du formulaire/i.test(text)
      || /soumettre le formulaire/i.test(text);
    if (!looksReady) {
      _formTestReadyVisible = false;
      return;
    }
    if (_formTestReadyVisible) return;
    var now = Date.now();
    if (now - _lastFormTestReadyAt < 1200) return;
    _formTestReadyVisible = true;
    _lastFormTestReadyAt = now;
    window.parent.postMessage({
      type: "n8n-form-test-ready",
      build: N8NAC_BRIDGE_BUILD,
      source: {
        opener: "semantic.form-trigger-ready",
        iframeHref: window.location.href,
        pageKind: N8NAC_BRIDGE_PAGE_KIND,
        bridgeBuild: N8NAC_BRIDGE_BUILD
      }
    }, "*");
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
    installPopupBridge();
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
    detectFormTestReady();
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
