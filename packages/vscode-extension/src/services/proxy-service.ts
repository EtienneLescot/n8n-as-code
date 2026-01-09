import * as http from 'http';
import httpProxy = require('http-proxy');
import * as vscode from 'vscode';
import { AddressInfo } from 'net';

export class ProxyService {
    private server: http.Server | undefined;
    private proxy: httpProxy | undefined;
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

        // Load persisted cookies
        await this.loadCookies();

        this.proxy = httpProxy.createProxyServer({
            target: this.target,
            changeOrigin: true,
            secure: false,
            cookieDomainRewrite: "", // Rewrite all domains to match localhost
            preserveHeaderKeyCase: true, // Preserve header casing
            autoRewrite: true, // Automatically rewrite redirects
            xfwd: true // Add x-forwarded headers automatically
        });

        // Strip headers that block iframe embedding and manage cookies
        this.proxy.on('proxyRes', (proxyRes, req, res) => {
            const path = req.url || 'unknown';
            // this.log(`[Proxy] ${req.method} ${path} -> ${proxyRes.statusCode}`);

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

                // this.log(`[Proxy] Redirect: ${location} -> ${newLocation}`);
                proxyRes.headers['location'] = newLocation;
            }

            // CRITICAL: Capture and Fix cookies for iframe/webview context
            if (proxyRes.headers['set-cookie']) {
                proxyRes.headers['set-cookie'] = proxyRes.headers['set-cookie'].map(cookie => {
                    // Update our internal cookie store
                    const eqIdx = cookie.indexOf('=');
                    const scIdx = cookie.indexOf(';');
                    if (eqIdx !== -1) {
                        const key = cookie.substring(0, eqIdx).trim();
                        // Capture the whole cookie string up to attributes
                        const valuePart = cookie.substring(0, scIdx !== -1 ? scIdx : undefined).trim();
                        this.cookieJar.set(key, valuePart);
                        /* if (key === 'n8n-auth') {
                            this.log(`[Proxy] Captured session cookie: ${key}`);
                        } */
                    }

                    // Save cookies whenever we get new ones
                    this.saveCookies();

                    // For localhost proxy, we need to:
                    // 1. Remove Domain so cookie applies to localhost
                    // 2. Remove SameSite restrictions
                    // 3. Remove Secure flag since we're on http://localhost
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
        });

        this.proxy.on('error', (err, req, res) => {
            this.log(`[Proxy] ERROR: ${err.message}`);
            // If it's a websocket error, res is a socket
            if ((res as any).writeHead) {
                const response = res as http.ServerResponse;
                if (!response.headersSent) {
                    response.writeHead(500, { 'Content-Type': 'text/plain' });
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
                const url = req.url || 'unknown';

                // Merge cookies
                const clientCookies = req.headers.cookie;
                let finalCookies: string[] = clientCookies ? [clientCookies] : [];

                if (this.cookieJar.size > 0) {
                    for (const [key, value] of this.cookieJar) {
                        // Avoid duplicates if client already sent this cookie
                        if (!clientCookies || !clientCookies.includes(key + '=')) {
                            finalCookies.push(value);
                        }
                    }
                }

                if (finalCookies.length > 0) {
                    req.headers['cookie'] = finalCookies.join('; ');
                }

                // Add Forwarding Headers - CRITICAL for n8n to know its external URL
                const proxyHost = `localhost:${this.port}`;
                const targetIsHttps = this.target.startsWith('https');
                const proto = targetIsHttps ? 'https' : 'http';

                // IMPORTANT: Use consistent headers to avoid session invalidation
                req.headers['host'] = proxyHost;
                req.headers['x-forwarded-host'] = proxyHost;
                req.headers['x-forwarded-proto'] = proto;
                req.headers['x-forwarded-port'] = this.port.toString();
                req.headers['x-forwarded-for'] = req.socket.remoteAddress;

                // Ensure n8n sees the proxy as the origin to match X-Forwarded-Host
                // For HTTPS targets (cloud), using the target itself as origin often helps bypass CSRF/CORS checks
                req.headers['origin'] = targetIsHttps ? this.target : `${proto}://${proxyHost}`;

                // Keep the referer matching the proxy URL
                if (req.headers['referer']) {
                    req.headers['referer'] = req.headers['referer'].replace(new RegExp(`^http://localhost:[0-9]+`), `${proto}://${proxyHost}`);
                }

                /* if (req.headers['cookie']?.includes('n8n-auth')) {
                    this.log(`[Proxy] Forwarding: ${req.method} ${url} (Cookie injected) [${proto}]`);
                } else {
                    this.log(`[Proxy] Forwarding: ${req.method} ${url} [${proto}]`);
                } */

                // CRITICAL for SSE: Disable buffering
                this.proxy.web(req, res, { buffer: undefined });
            }
        });

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
                if (this.proxy) {
                    // this.log(`[Proxy] Upgrading to WebSocket: ${req.url}`);

                    // Add same headers to WS upgrade request
                    const proxyHost = `localhost:${this.port}`;
                    const targetIsHttps = this.target.startsWith('https');
                    const proto = targetIsHttps ? 'https' : 'http';

                    req.headers['x-forwarded-host'] = proxyHost;
                    req.headers['x-forwarded-proto'] = proto;
                    req.headers['origin'] = targetIsHttps ? this.target : `${proto}://${proxyHost}`;

                    // Inject cookies for WS as well
                    if (this.cookieJar.size > 0) {
                        const clientCookies = req.headers.cookie;
                        let finalCookies: string[] = clientCookies ? [clientCookies] : [];
                        for (const [key, value] of this.cookieJar) {
                            if (!clientCookies || !clientCookies.includes(key + '=')) {
                                finalCookies.push(value);
                            }
                        }
                        if (finalCookies.length > 0) {
                            req.headers['cookie'] = finalCookies.join('; ');
                        }
                    }

                    this.proxy.ws(req, socket, head);
                }
            });

            this.server.on('error', reject);
        });
    }

    public stop() {
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
