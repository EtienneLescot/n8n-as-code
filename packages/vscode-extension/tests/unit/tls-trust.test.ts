import test from 'node:test';
import assert from 'node:assert';

import { applyTlsTrust } from '../../src/utils/tls-trust.js';

type InstallOptions = Parameters<typeof import('n8nac').installExtraCaCertificates>[0];

function createInstaller(result: Partial<ReturnType<typeof import('n8nac').installExtraCaCertificates>> = {}) {
    const calls: InstallOptions[] = [];
    const install = ((options: InstallOptions) => {
        calls.push(options);
        return {
            installed: false,
            certificates: [],
            sources: [],
            errors: [],
            ...result,
        };
    }) as typeof import('n8nac').installExtraCaCertificates;
    return { install, calls };
}

test('TLS trust: forwards the configured bundles and resolves them against the workspace', () => {
    const { install, calls } = createInstaller();

    applyTlsTrust({
        certificateAuthorities: ['certs/root-ca.pem'],
        useSystemCertificateAuthorities: false,
        workspaceRoot: '/workspace/project',
    }, () => {}, install);

    assert.deepStrictEqual(calls, [{
        caFiles: ['certs/root-ca.pem'],
        useSystemCertificateAuthorities: false,
        baseDir: '/workspace/project',
    }]);
});

test('TLS trust: leaves the system store opt-in and tolerates an unconfigured workspace', () => {
    const { install, calls } = createInstaller();

    applyTlsTrust({}, () => {}, install);

    assert.deepStrictEqual(calls, [{
        caFiles: [],
        useSystemCertificateAuthorities: false,
        baseDir: undefined,
    }]);
});

test('TLS trust: reports the anchors it installed', () => {
    const { install } = createInstaller({
        installed: true,
        certificates: ['pem-a', 'pem-b'],
        sources: ['setting: /workspace/project/certs/root-ca.pem (2)'],
    });
    const logs: string[] = [];

    const result = applyTlsTrust({ certificateAuthorities: ['certs/root-ca.pem'] }, (message) => logs.push(message), install);

    assert.strictEqual(result.installed, true);
    assert.deepStrictEqual(logs, ['[n8n] Trusting 2 extra CA certificate(s): setting: /workspace/project/certs/root-ca.pem (2)']);
});

test('TLS trust: surfaces resolution problems without failing activation', () => {
    const { install } = createInstaller({
        errors: [
            'setting: cannot read "/missing.pem" (ENOENT)',
            'setting: "/keys.pem" does not contain any PEM certificate',
        ],
    });
    const logs: string[] = [];

    assert.doesNotThrow(() => applyTlsTrust({ certificateAuthorities: ['/missing.pem'] }, (message) => logs.push(message), install));

    assert.deepStrictEqual(logs, [
        '[n8n] TLS trust: setting: cannot read "/missing.pem" (ENOENT)',
        '[n8n] TLS trust: setting: "/keys.pem" does not contain any PEM certificate',
    ]);
});

test('TLS trust: stays quiet when there is nothing extra to trust', () => {
    const { install } = createInstaller();
    const logs: string[] = [];

    applyTlsTrust({}, (message) => logs.push(message), install);

    assert.deepStrictEqual(logs, []);
});
