import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type * as tls from 'tls';
import {
    CERTIFICATE_TRUST_HINT,
    N8NAC_EXTRA_CA_CERTS_ENV,
    N8NAC_INSECURE_TLS_ENV,
    extractPemCertificates,
    getInstalledExtraCaCertificates,
    installExtraCaCertificates,
    isCertificateTrustError,
    isPrivateNetworkHost,
    resolveExtraCaCertificates,
    shouldVerifyServerCertificate,
    splitCertificatePathList,
    uninstallExtraCaCertificates,
    type ISecureContextHost,
} from '../../src/core/services/tls-certificates.js';

function pem(label: string): string {
    return `-----BEGIN CERTIFICATE-----\n${label}\n-----END CERTIFICATE-----`;
}

/** Stands in for the `tls` module so the assertions never touch the real process trust store. */
function createSecureContextHost(): { host: ISecureContextHost; added: string[]; createdWith: unknown[] } {
    const added: string[] = [];
    const createdWith: unknown[] = [];
    const host: ISecureContextHost = {
        createSecureContext(options?: tls.SecureContextOptions) {
            createdWith.push(options);
            return { context: { addCACert: (certificate: string) => { added.push(certificate); } } } as unknown as tls.SecureContext;
        },
    };
    return { host, added, createdWith };
}

describe('tls-certificates', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-tls-'));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    function writeBundle(name: string, ...labels: string[]): string {
        const filePath = path.join(tempDir, name);
        fs.writeFileSync(filePath, labels.map(pem).join('\n'), 'utf8');
        return filePath;
    }

    describe('splitCertificatePathList', () => {
        it('splits on the platform delimiter, commas and newlines, and strips quotes', () => {
            const value = `"/a/first.pem"${path.delimiter}/b/second.pem,/c/third.pem\n/d/fourth.pem`;
            expect(splitCertificatePathList(value)).toEqual([
                '/a/first.pem',
                '/b/second.pem',
                '/c/third.pem',
                '/d/fourth.pem',
            ]);
        });

        it('drops empty segments', () => {
            expect(splitCertificatePathList(`  ${path.delimiter},,\n `)).toEqual([]);
        });
    });

    describe('extractPemCertificates', () => {
        it('keeps only certificate blocks', () => {
            const bundle = [
                '# comment line',
                pem('AAA'),
                '-----BEGIN PRIVATE KEY-----\nSECRET\n-----END PRIVATE KEY-----',
                pem('BBB'),
            ].join('\n');

            expect(extractPemCertificates(bundle)).toEqual([pem('AAA'), pem('BBB')]);
        });

        it('returns an empty list when nothing matches', () => {
            expect(extractPemCertificates('not a certificate')).toEqual([]);
        });
    });

    describe('resolveExtraCaCertificates', () => {
        it('reads NODE_EXTRA_CA_CERTS even when the runtime ignored it', () => {
            const bundle = writeBundle('root.pem', 'ROOT');

            const resolution = resolveExtraCaCertificates({ env: { NODE_EXTRA_CA_CERTS: bundle } });

            expect(resolution.certificates).toEqual([pem('ROOT')]);
            expect(resolution.sources).toEqual([`NODE_EXTRA_CA_CERTS: ${bundle} (1)`]);
            expect(resolution.errors).toEqual([]);
        });

        it('merges settings, N8NAC_EXTRA_CA_CERTS and NODE_EXTRA_CA_CERTS without duplicates', () => {
            const settingBundle = writeBundle('setting.pem', 'ALPHA');
            const n8nacBundle = writeBundle('n8nac.pem', 'BETA', 'ALPHA');
            const nodeBundle = writeBundle('node.pem', 'GAMMA');

            const resolution = resolveExtraCaCertificates({
                caFiles: [settingBundle],
                env: { [N8NAC_EXTRA_CA_CERTS_ENV]: n8nacBundle, NODE_EXTRA_CA_CERTS: nodeBundle },
            });

            expect(resolution.certificates).toEqual([pem('ALPHA'), pem('BETA'), pem('GAMMA')]);
        });

        it('resolves relative paths against baseDir', () => {
            writeBundle('workspace-ca.pem', 'WORKSPACE');

            const resolution = resolveExtraCaCertificates({ caFiles: ['workspace-ca.pem'], baseDir: tempDir, env: {} });

            expect(resolution.certificates).toEqual([pem('WORKSPACE')]);
        });

        it('accepts several paths inside a single setting entry', () => {
            const first = writeBundle('first.pem', 'FIRST');
            const second = writeBundle('second.pem', 'SECOND');

            const resolution = resolveExtraCaCertificates({ caFiles: [`${first}${path.delimiter}${second}`], env: {} });

            expect(resolution.certificates).toEqual([pem('FIRST'), pem('SECOND')]);
        });

        it('reports unreadable files without discarding the ones that worked', () => {
            const bundle = writeBundle('good.pem', 'GOOD');
            const missing = path.join(tempDir, 'missing.pem');

            const resolution = resolveExtraCaCertificates({ caFiles: [missing, bundle], env: {} });

            expect(resolution.certificates).toEqual([pem('GOOD')]);
            expect(resolution.errors).toHaveLength(1);
            expect(resolution.errors[0]).toContain(missing);
        });

        it('reports a file that holds no certificate', () => {
            const filePath = path.join(tempDir, 'empty.pem');
            fs.writeFileSync(filePath, 'nothing here', 'utf8');

            const resolution = resolveExtraCaCertificates({ caFiles: [filePath], env: {} });

            expect(resolution.certificates).toEqual([]);
            expect(resolution.errors[0]).toContain('does not contain any PEM certificate');
        });
    });

    describe('installExtraCaCertificates', () => {
        it('appends the certificates to every secure context created afterwards', () => {
            const bundle = writeBundle('root.pem', 'ROOT', 'INTERMEDIATE');
            const { host, added } = createSecureContextHost();

            const result = installExtraCaCertificates({ caFiles: [bundle], env: {} }, host);
            host.createSecureContext({});

            expect(result.installed).toBe(true);
            expect(added).toEqual([pem('ROOT'), pem('INTERMEDIATE')]);
        });

        it('forwards the caller options to the original implementation', () => {
            const bundle = writeBundle('root.pem', 'ROOT');
            const { host, createdWith } = createSecureContextHost();

            installExtraCaCertificates({ caFiles: [bundle], env: {} }, host);
            host.createSecureContext({ minVersion: 'TLSv1.2' });

            expect(createdWith).toEqual([{ minVersion: 'TLSv1.2' }]);
        });

        it('leaves the runtime untouched when nothing was resolved', () => {
            const { host } = createSecureContextHost();
            const original = host.createSecureContext;

            const result = installExtraCaCertificates({ env: {} }, host);

            expect(result.installed).toBe(false);
            expect(host.createSecureContext).toBe(original);
        });

        it('replaces the certificate set on re-install instead of stacking wrappers', () => {
            const first = writeBundle('first.pem', 'FIRST');
            const second = writeBundle('second.pem', 'SECOND');
            const { host, added } = createSecureContextHost();

            installExtraCaCertificates({ caFiles: [first], env: {} }, host);
            const patched = host.createSecureContext;
            installExtraCaCertificates({ caFiles: [second], env: {} }, host);

            expect(host.createSecureContext).toBe(patched);

            host.createSecureContext({});
            expect(added).toEqual([pem('SECOND')]);
            expect(getInstalledExtraCaCertificates(host)).toEqual([pem('SECOND')]);
        });

        it('survives a runtime whose secure context cannot take extra anchors', () => {
            const bundle = writeBundle('root.pem', 'ROOT');
            const host: ISecureContextHost = {
                createSecureContext: () => ({}) as tls.SecureContext,
            };

            installExtraCaCertificates({ caFiles: [bundle], env: {} }, host);

            expect(() => host.createSecureContext({})).not.toThrow();
        });

        it('ignores an anchor the runtime rejects', () => {
            const bundle = writeBundle('root.pem', 'BAD', 'GOOD');
            const accepted: string[] = [];
            const host: ISecureContextHost = {
                createSecureContext: () => ({
                    context: {
                        addCACert: (certificate: string) => {
                            if (certificate.includes('BAD')) throw new Error('unsupported certificate');
                            accepted.push(certificate);
                        },
                    },
                }) as unknown as tls.SecureContext,
            };

            installExtraCaCertificates({ caFiles: [bundle], env: {} }, host);
            host.createSecureContext({});

            expect(accepted).toEqual([pem('GOOD')]);
        });

        it('restores the original implementation on uninstall', () => {
            const bundle = writeBundle('root.pem', 'ROOT');
            const { host, added } = createSecureContextHost();
            const original = host.createSecureContext;

            installExtraCaCertificates({ caFiles: [bundle], env: {} }, host);
            uninstallExtraCaCertificates(host);
            host.createSecureContext({});

            expect(host.createSecureContext).toBe(original);
            expect(added).toEqual([]);
            expect(getInstalledExtraCaCertificates(host)).toEqual([]);
        });
    });

    describe('isPrivateNetworkHost', () => {
        it.each([
            'https://localhost:5678',
            'localhost',
            'https://LOCALHOST/',
            'https://n8n.localhost:5678',
            'https://n8n.local',
            'https://n8n.internal',
            'https://n8n.home.arpa',
            'https://n8n-box:5678',
            'https://127.0.0.1:5678',
            'https://127.5.4.3',
            'https://10.1.2.3',
            'https://172.16.0.1',
            'https://172.31.255.254',
            'https://192.168.1.10',
            'https://169.254.10.10',
            'https://100.101.102.103',
            'https://[::1]:5678',
            'https://[fd7a:115c:a1e0::1]',
            'https://[fe80::1%25eth0]',
            'https://[::ffff:192.168.1.10]',
        ])('treats %s as private', (host) => {
            expect(isPrivateNetworkHost(host)).toBe(true);
        });

        it.each([
            'https://n8n.example.com',
            'https://n8n.example.com:8443',
            'n8n.example.com',
            'https://8.8.8.8',
            'https://172.15.0.1',
            'https://172.32.0.1',
            'https://192.169.1.1',
            'https://100.128.0.1',
            'https://local.example.com',
            'https://n8n.local.example.com',
            'https://[2606:4700:4700::1111]',
            '',
        ])('treats %s as public', (host) => {
            expect(isPrivateNetworkHost(host)).toBe(false);
        });

        it('ignores a trailing dot on an absolute name', () => {
            expect(isPrivateNetworkHost('https://n8n.local./')).toBe(true);
            expect(isPrivateNetworkHost('https://n8n.example.com./')).toBe(false);
        });
    });

    describe('shouldVerifyServerCertificate', () => {
        it('verifies a public host even when the user configured nothing', () => {
            const verify = shouldVerifyServerCertificate({
                host: 'https://n8n.example.com',
                hasConfiguredAnchors: false,
                env: {},
            });

            expect(verify).toBe(true);
        });

        it('keeps verification off for an unconfigured loopback host so self-signed instances still work', () => {
            const verify = shouldVerifyServerCertificate({
                host: 'https://localhost:5678',
                hasConfiguredAnchors: false,
                env: {},
            });

            expect(verify).toBe(false);
        });

        it('verifies a private host once the user configured an anchor', () => {
            // Configuring a CA means "check my certificates", including on the LAN — otherwise
            // the anchor would be pointless for the very instance it was added for.
            const verify = shouldVerifyServerCertificate({
                host: 'https://localhost:5678',
                hasConfiguredAnchors: true,
                env: {},
            });

            expect(verify).toBe(true);
        });

        it.each(['1', 'true', 'YES'])('honours %s as an explicit opt-out', (value) => {
            const verify = shouldVerifyServerCertificate({
                host: 'https://n8n.example.com',
                hasConfiguredAnchors: true,
                env: { [N8NAC_INSECURE_TLS_ENV]: value },
            });

            expect(verify).toBe(false);
        });

        it.each(['0', 'false', '', '  '])('does not treat %s as an opt-out', (value) => {
            const verify = shouldVerifyServerCertificate({
                host: 'https://n8n.example.com',
                hasConfiguredAnchors: false,
                env: { [N8NAC_INSECURE_TLS_ENV]: value },
            });

            expect(verify).toBe(true);
        });
    });

    describe('isCertificateTrustError', () => {
        it.each([
            'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
            'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
            'SELF_SIGNED_CERT_IN_CHAIN',
            'DEPTH_ZERO_SELF_SIGNED_CERT',
            'CERT_HAS_EXPIRED',
            'ERR_TLS_CERT_ALTNAME_INVALID',
        ])('recognises %s', (code) => {
            expect(isCertificateTrustError({ code })).toBe(true);
        });

        it('recognises the message undici surfaces without a code', () => {
            expect(isCertificateTrustError(new Error('unable to verify the first certificate'))).toBe(true);
        });

        it('unwraps the cause chain used by fetch failures', () => {
            const error = new Error('fetch failed');
            (error as any).cause = { code: 'SELF_SIGNED_CERT_IN_CHAIN' };

            expect(isCertificateTrustError(error)).toBe(true);
        });

        it('does not flag ordinary transport or HTTP failures', () => {
            expect(isCertificateTrustError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' })).toBe(false);
            expect(isCertificateTrustError(new Error('Request failed with status code 401'))).toBe(false);
            expect(isCertificateTrustError(undefined)).toBe(false);
        });

        it('does not recurse forever on a self-referencing cause', () => {
            const error: any = new Error('boom');
            error.cause = error;

            expect(isCertificateTrustError(error)).toBe(false);
        });
    });

    it('points at both the setting and the environment variable in its hint', () => {
        expect(CERTIFICATE_TRUST_HINT).toContain('n8n.tls.certificateAuthorities');
        expect(CERTIFICATE_TRUST_HINT).toContain('NODE_EXTRA_CA_CERTS');
    });
});
