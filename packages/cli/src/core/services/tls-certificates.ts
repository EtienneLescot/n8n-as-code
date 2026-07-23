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
