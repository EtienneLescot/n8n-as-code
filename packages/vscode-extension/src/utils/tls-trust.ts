import { installExtraCaCertificates, type IExtraCaCertificateInstallation } from 'n8nac';

/**
 * Extra TLS trust anchors for the extension host.
 *
 * The extension host is an Electron process: it ignores `NODE_EXTRA_CA_CERTS` and cannot be
 * given `--use-system-ca`, so an n8n instance behind a private CA fails to verify even when
 * the terminal CLI works. Reading the certificates here and appending them to every secure
 * context restores parity for axios, the global `fetch` the n8n manager uses for health and
 * project calls, `ws`, and the workflow proxy alike.
 */

export interface ITlsTrustConfiguration {
    /** PEM bundle paths, absolute or relative to `workspaceRoot`. */
    certificateAuthorities?: string[];
    /** Mirrors Node's `--use-system-ca`. Off by default; see below for why. */
    useSystemCertificateAuthorities?: boolean;
    workspaceRoot?: string;
}

export type TlsTrustInstaller = typeof installExtraCaCertificates;

export function applyTlsTrust(
    configuration: ITlsTrustConfiguration,
    log: (message: string) => void,
    install: TlsTrustInstaller = installExtraCaCertificates,
): IExtraCaCertificateInstallation {
    // The OS store holds ~100+ anchors and each one is re-applied to every secure context the
    // process builds, which costs ~18 ms per TLS handshake against ~0.4 ms without it. Pointing
    // `certificateAuthorities` at a bundle is both cheaper and more precise, so the store is
    // opt-in for the rare case where the CA is only reachable from there.
    const result = install({
        caFiles: configuration.certificateAuthorities ?? [],
        useSystemCertificateAuthorities: configuration.useSystemCertificateAuthorities ?? false,
        baseDir: configuration.workspaceRoot,
    });

    if (result.certificates.length) {
        log(`[n8n] Trusting ${result.certificates.length} extra CA certificate(s): ${result.sources.join(', ')}`);
    }
    for (const error of result.errors) {
        // A host without a system trust store API is expected, not fatal: report and carry on.
        log(`[n8n] TLS trust: ${error}`);
    }

    return result;
}
