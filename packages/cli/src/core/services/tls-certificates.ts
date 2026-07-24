import * as fs from 'fs';
import { createRequire } from 'module';
import * as path from 'path';
import * as tls from 'tls';

/**
 * Additional trust anchors for outbound HTTPS.
 *
 * Node honours `NODE_EXTRA_CA_CERTS` and `--use-system-ca` when it builds the default
 * TLS trust store, but only when the process is a stock Node build that is started with
 * those settings. The VS Code extension host is neither: it is an Electron process
 * (BoringSSL, no `NODE_EXTRA_CA_CERTS` support) that users cannot pass Node flags to.
 * The same gap exists for anything reaching n8n through the global `fetch`
 * (`@n8n-as-code/n8n-manager-core` health probes, project listing, credential REST calls),
 * because `fetch` ignores `https.Agent` options entirely.
 *
 * So we read the certificates ourselves and append them to every secure context the
 * process creates, which covers axios, `fetch`, `ws` and `http-proxy` in one place.
 */

const PEM_CERTIFICATE_PATTERN = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;

/** Read in addition to Node's own `NODE_EXTRA_CA_CERTS`; accepts several paths. */
export const N8NAC_EXTRA_CA_CERTS_ENV = 'N8NAC_EXTRA_CA_CERTS';

export interface IExtraCaCertificateOptions {
    /** Explicit PEM bundle paths, e.g. from the `n8n.tls.certificateAuthorities` setting. */
    caFiles?: string[];
    /** Mirror Node's `--use-system-ca` by adding the OS trust store when the host exposes it. */
    useSystemCertificateAuthorities?: boolean;
    /** Directory used to resolve relative paths. Defaults to `process.cwd()`. */
    baseDir?: string;
    env?: NodeJS.ProcessEnv;
}

export interface IExtraCaCertificateResolution {
    /** Deduplicated PEM certificate blocks, in discovery order. */
    certificates: string[];
    /** Human-readable description of every source that contributed certificates. */
    sources: string[];
    /** Non-fatal problems (missing file, unreadable file, file without any PEM block). */
    errors: string[];
    /**
     * `true` when the user actually pointed us at trust anchors — a setting or one of the
     * environment variables. The OS trust store alone does not count: it exists on nearly every
     * machine, so treating it as configuration would silently turn on strict verification for
     * people who never asked for it.
     */
    hasConfiguredAnchors: boolean;
}

export interface IExtraCaCertificateInstallation extends IExtraCaCertificateResolution {
    /** `true` once secure contexts in this process carry the extra certificates. */
    installed: boolean;
}

/** The subset of the `tls` module the installer touches, so tests can supply a stub. */
export interface ISecureContextHost {
    createSecureContext(options?: tls.SecureContextOptions): tls.SecureContext;
}

interface IPatchState {
    original: ISecureContextHost['createSecureContext'];
    certificates: string[];
}

const patchedHosts = new WeakMap<ISecureContextHost, IPatchState>();

let defaultSecureContextHost: ISecureContextHost | undefined;

/**
 * The mutable `tls` module object.
 *
 * `import * as tls` yields a frozen module namespace, so the patch has to go through the
 * CommonJS export object that `https`, `ws` and undici's `fetch` all read from.
 */
function getDefaultSecureContextHost(): ISecureContextHost {
    defaultSecureContextHost ??= createRequire(import.meta.url)('tls') as ISecureContextHost;
    return defaultSecureContextHost;
}

/**
 * Split a path list. Accepts the platform delimiter, commas and newlines so a single
 * setting works whether it was copied from a shell variable or typed by hand.
 */
export function splitCertificatePathList(value: string): string[] {
    return value
        .split(new RegExp(`[${escapeForCharacterClass(path.delimiter)},\\r\\n]`))
        .map((entry) => entry.trim().replace(/^["']|["']$/g, ''))
        .filter((entry) => entry.length > 0);
}

function escapeForCharacterClass(value: string): string {
    return value.replace(/[\\\]^-]/g, '\\$&');
}

/** Extract every PEM certificate block from a bundle, ignoring keys and comments. */
export function extractPemCertificates(contents: string): string[] {
    return contents.match(PEM_CERTIFICATE_PATTERN) ?? [];
}

function readCertificateFile(filePath: string, resolution: IExtraCaCertificateResolution, label: string): void {
    let contents: string;
    try {
        contents = fs.readFileSync(filePath, 'utf8');
    } catch (error: any) {
        resolution.errors.push(`${label}: cannot read "${filePath}" (${error?.code || error?.message || error})`);
        return;
    }

    const certificates = extractPemCertificates(contents);
    if (!certificates.length) {
        resolution.errors.push(`${label}: "${filePath}" does not contain any PEM certificate`);
        return;
    }

    resolution.hasConfiguredAnchors = true;
    addCertificates(resolution, certificates, `${label}: ${filePath}`);
}

function addCertificates(resolution: IExtraCaCertificateResolution, certificates: string[], source: string): void {
    let added = 0;
    for (const certificate of certificates) {
        const normalized = certificate.trim();
        if (!normalized || resolution.certificates.includes(normalized)) continue;
        resolution.certificates.push(normalized);
        added++;
    }
    if (added > 0) {
        resolution.sources.push(`${source} (${added})`);
    }
}

function readSystemCertificates(resolution: IExtraCaCertificateResolution): void {
    // Node 22.15+/24 only. Older hosts (and Electron) simply do not expose it, which is the
    // expected state rather than a misconfiguration, so it is not reported as an error.
    const getCACertificates = (tls as unknown as {
        getCACertificates?: (type: string) => string[];
    }).getCACertificates;
    if (typeof getCACertificates !== 'function') {
        return;
    }

    try {
        addCertificates(resolution, getCACertificates('system'), 'system trust store');
    } catch (error: any) {
        resolution.errors.push(`system trust store: ${error?.message || error}`);
    }
}

/**
 * Collect the extra trust anchors from settings, `N8NAC_EXTRA_CA_CERTS`,
 * `NODE_EXTRA_CA_CERTS` and — on request — the OS trust store.
 */
export function resolveExtraCaCertificates(options: IExtraCaCertificateOptions = {}): IExtraCaCertificateResolution {
    const env = options.env ?? process.env;
    const baseDir = options.baseDir ?? process.cwd();
    const resolution: IExtraCaCertificateResolution = {
        certificates: [],
        sources: [],
        errors: [],
        hasConfiguredAnchors: false,
    };

    const resolvePath = (candidate: string) => (path.isAbsolute(candidate) ? candidate : path.resolve(baseDir, candidate));

    for (const candidate of options.caFiles ?? []) {
        for (const filePath of splitCertificatePathList(candidate)) {
            readCertificateFile(resolvePath(filePath), resolution, 'setting');
        }
    }

    for (const filePath of splitCertificatePathList(env[N8NAC_EXTRA_CA_CERTS_ENV] ?? '')) {
        readCertificateFile(resolvePath(filePath), resolution, N8NAC_EXTRA_CA_CERTS_ENV);
    }

    for (const filePath of splitCertificatePathList(env.NODE_EXTRA_CA_CERTS ?? '')) {
        readCertificateFile(resolvePath(filePath), resolution, 'NODE_EXTRA_CA_CERTS');
    }

    if (options.useSystemCertificateAuthorities) {
        readSystemCertificates(resolution);
    }

    return resolution;
}

/**
 * Append the resolved certificates to every secure context created from now on.
 *
 * Idempotent: calling it again replaces the certificate set instead of stacking another
 * wrapper, so it is safe to re-run whenever the configuration changes.
 */
export function installExtraCaCertificates(
    options: IExtraCaCertificateOptions = {},
    host: ISecureContextHost = getDefaultSecureContextHost(),
): IExtraCaCertificateInstallation {
    const resolution = resolveExtraCaCertificates(options);

    const existing = patchedHosts.get(host);
    if (existing) {
        existing.certificates = resolution.certificates;
        return { ...resolution, installed: resolution.certificates.length > 0 };
    }

    if (!resolution.certificates.length) {
        // Nothing to trust yet — leave the runtime untouched rather than wrapping it for nothing.
        return { ...resolution, installed: false };
    }

    const state: IPatchState = {
        original: host.createSecureContext,
        certificates: resolution.certificates,
    };
    patchedHosts.set(host, state);

    host.createSecureContext = (contextOptions?: tls.SecureContextOptions) => {
        const context = state.original.call(host, contextOptions);
        const nativeContext = (context as unknown as { context?: { addCACert?: (pem: string) => void } }).context;
        if (typeof nativeContext?.addCACert !== 'function') {
            return context;
        }
        for (const certificate of state.certificates) {
            try {
                nativeContext.addCACert(certificate);
            } catch {
                // A malformed or duplicate anchor must not break the whole handshake.
            }
        }
        return context;
    };

    return { ...resolution, installed: true };
}

/** Certificates currently appended by the installer, for diagnostics and tests. */
export function getInstalledExtraCaCertificates(host: ISecureContextHost = getDefaultSecureContextHost()): string[] {
    return [...(patchedHosts.get(host)?.certificates ?? [])];
}

/** Restore the untouched `createSecureContext`. Intended for tests. */
export function uninstallExtraCaCertificates(host: ISecureContextHost = getDefaultSecureContextHost()): void {
    const state = patchedHosts.get(host);
    if (!state) return;
    host.createSecureContext = state.original;
    patchedHosts.delete(host);
}

/** Set to 1/true/yes to skip certificate verification outright. Last resort, see below. */
export const N8NAC_INSECURE_TLS_ENV = 'N8NAC_INSECURE_TLS';

const PRIVATE_HOSTNAME_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

/** Pull the host out of a URL by hand, for the inputs `URL` refuses (an IPv6 zone id). */
function stripUrlDecorations(value: string): string {
    const bare = value
        .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
        .replace(/^[^@/]*@/, '')
        .replace(/[/?#].*$/, '');

    const bracketed = /^\[([^\]]*)\]/.exec(bare);
    if (bracketed) return bracketed[1];
    // A bare IPv6 literal holds several colons; a `host:port` pair holds exactly one.
    return bare.split(':').length === 2 ? bare.replace(/:\d*$/, '') : bare;
}

/** Strip the scheme, port, brackets, IPv6 zone id and trailing dot from a configured host. */
function normalizeHostname(hostOrUrl: string): string {
    const value = hostOrUrl.trim();
    if (!value) return '';

    let hostname: string;
    try {
        hostname = new URL(value.includes('://') ? value : `https://${value}`).hostname;
    } catch {
        hostname = stripUrlDecorations(value);
    }

    return hostname
        .toLowerCase()
        .replace(/^\[|\]$/g, '')
        .replace(/%.*$/, '')
        .replace(/\.$/, '');
}

function isPrivateIpv4(hostname: string): boolean {
    const octets = hostname.split('.').map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
        return false;
    }
    const [first, second] = octets;
    if (first === 0) return true; // "this host on this network"
    if (first === 10) return true; // RFC 1918
    if (first === 127) return true; // loopback
    if (first === 169 && second === 254) return true; // link-local
    if (first === 172 && second >= 16 && second <= 31) return true; // RFC 1918
    if (first === 192 && second === 168) return true; // RFC 1918
    if (first === 100 && second >= 64 && second <= 127) return true; // CGNAT, incl. Tailscale
    return false;
}

function isPrivateIpv6(hostname: string): boolean {
    if (hostname === '::1' || hostname === '::') return true;
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(hostname);
    if (mapped) return isPrivateIpv4(mapped[1]);
    // `URL` rewrites an IPv4-mapped address to its hex form (`::ffff:c0a8:10a`), so the
    // embedded IPv4 address has to be read back out of the last two groups.
    const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(hostname);
    if (mappedHex) {
        const high = parseInt(mappedHex[1], 16);
        const low = parseInt(mappedHex[2], 16);
        return isPrivateIpv4([high >> 8, high & 0xff, low >> 8, low & 0xff].join('.'));
    }
    if (/^f[cd][0-9a-f]{2}:/.test(hostname)) return true; // fc00::/7 unique local
    if (/^fe[89ab][0-9a-f]:/.test(hostname)) return true; // fe80::/10 link-local
    return false;
}

/**
 * `true` when the host can only be reached from this machine or a private network.
 *
 * These are precisely the destinations a public CA will not issue a certificate for, so they
 * are the ones where a self-signed certificate is the normal setup rather than an attack.
 * Anything else — a real domain name — is treated as public, which is the safe default: an
 * unrecognised host fails closed into verification.
 */
export function isPrivateNetworkHost(hostOrUrl: string): boolean {
    const hostname = normalizeHostname(hostOrUrl);
    if (!hostname) return false;
    if (hostname === 'localhost') return true;
    if (PRIVATE_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return true;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return isPrivateIpv4(hostname);
    if (hostname.includes(':')) return isPrivateIpv6(hostname);
    // A single-label name ("n8n-box") is an intranet name: it has no public DNS entry and no
    // public CA will certify it.
    return !hostname.includes('.');
}

export interface ICertificateVerificationPolicy {
    /** The configured n8n base URL, or a bare host. */
    host: string;
    /** From {@link resolveExtraCaCertificates}. */
    hasConfiguredAnchors: boolean;
    env?: NodeJS.ProcessEnv;
}

/**
 * Whether the server certificate has to verify for this destination.
 *
 * Verification is the default. It is relaxed only where the historical zero-configuration
 * behaviour is actually needed — a private or loopback address, which cannot hold a publicly
 * trusted certificate — and only while the user has not configured any anchor of their own.
 * Configuring an anchor still means "verify everywhere", so a private host does not become a
 * hole for someone who did set the certificates up.
 *
 * The remaining case, a self-signed certificate on a public host name, has to opt out through
 * {@link N8NAC_INSECURE_TLS_ENV}, because it is indistinguishable from an interception.
 */
export function shouldVerifyServerCertificate(policy: ICertificateVerificationPolicy): boolean {
    const env = policy.env ?? process.env;
    if (/^(1|true|yes)$/i.test((env[N8NAC_INSECURE_TLS_ENV] ?? '').trim())) return false;
    if (policy.hasConfiguredAnchors) return true;
    return !isPrivateNetworkHost(policy.host);
}

/** `true` when the error is a TLS trust failure rather than a transport or HTTP error. */
export function isCertificateTrustError(error: any): boolean {
    const code = typeof error?.code === 'string' ? error.code : '';
    if (code.startsWith('UNABLE_TO_') || code.startsWith('SELF_SIGNED') || code.startsWith('DEPTH_ZERO_')) {
        return true;
    }
    if (code === 'CERT_HAS_EXPIRED' || code === 'ERR_TLS_CERT_ALTNAME_INVALID' || code === 'CERT_SIGNATURE_FAILURE') {
        return true;
    }
    if (error?.cause && error.cause !== error && isCertificateTrustError(error.cause)) {
        return true;
    }
    const message = String(error?.message ?? error ?? '');
    return /unable to (get|verify)|self[- ]signed certificate|certificate has expired|CERT_/i.test(message);
}

/** Guidance appended to connection errors caused by an untrusted certificate. */
export const CERTIFICATE_TRUST_HINT =
    'The certificate is not trusted by this process. Point "n8n.tls.certificateAuthorities" '
    + '(or the NODE_EXTRA_CA_CERTS environment variable) at the PEM bundle holding your root CA, then retry. '
    + 'The VS Code extension host cannot read Node\'s --use-system-ca flag, so the setting is the reliable path there.';

/**
 * The same guidance for someone running `n8nac` in a terminal.
 *
 * Deliberately not {@link CERTIFICATE_TRUST_HINT}: that one points at the
 * `n8n.tls.certificateAuthorities` VS Code setting and explains extension-host behaviour, and
 * neither exists on the command line — following it would send a CLI user to a setting they
 * have no way to set. The environment variables are the CLI's actual levers, and
 * `N8NAC_EXTRA_CA_CERTS` is named first because it accepts several paths while Node's own
 * variable takes exactly one.
 */
export const CERTIFICATE_TRUST_HINT_CLI =
    'The certificate presented by the n8n instance is not trusted by this process. Point '
    + `${N8NAC_EXTRA_CA_CERTS_ENV} (accepts several paths) or NODE_EXTRA_CA_CERTS at the PEM bundle `
    + 'holding your root CA, then retry. If the instance is genuinely only reachable over a '
    + `self-signed certificate and you accept the risk, set ${N8NAC_INSECURE_TLS_ENV}=1 to skip verification.`;
