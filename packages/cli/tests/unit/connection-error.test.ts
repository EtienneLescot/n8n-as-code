import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'events';
import { captureEmittedErrors, formatConnectionError, formatErrorDetails } from '../../src/commands/base.js';
import { CERTIFICATE_TRUST_HINT_CLI, N8NAC_EXTRA_CA_CERTS_ENV, N8NAC_INSECURE_TLS_ENV } from '../../src/core/services/tls-certificates.js';

/** An axios-shaped rejection, which is what every n8n API call produces. */
function axiosError(status: number, data?: unknown): any {
    return Object.assign(new Error(`Request failed with status code ${status}`), {
        response: { status, data },
    });
}

describe('formatErrorDetails', () => {
    it('prefers the remote message and status when the request reached n8n', () => {
        expect(formatErrorDetails(axiosError(400, { message: 'workflow is archived' })))
            .toBe('HTTP 400: workflow is archived');
    });

    it('handles a string body, an object body, and a bare status', () => {
        expect(formatErrorDetails(axiosError(502, 'upstream down'))).toBe('HTTP 502: upstream down');
        expect(formatErrorDetails(axiosError(422, { errors: ['bad node'] }))).toBe('HTTP 422: {"errors":["bad node"]}');
        expect(formatErrorDetails(axiosError(500))).toBe('HTTP 500');
    });

    it('falls back to the transport message when there is no response', () => {
        expect(formatErrorDetails(new Error('unable to verify the first certificate')))
            .toBe('unable to verify the first certificate');
        expect(formatErrorDetails('plain string')).toBe('plain string');
    });
});

describe('formatConnectionError', () => {
    it('joins the label and the details', () => {
        // A response with a status but no body reports the status, not axios's generic message.
        expect(formatConnectionError('Failed to list workflows', axiosError(401)))
            .toBe('Failed to list workflows: HTTP 401');
        expect(formatConnectionError('Failed to list workflows', new Error('socket hang up')))
            .toBe('Failed to list workflows: socket hang up');
    });

    it('returns the bare label when no error is supplied', () => {
        expect(formatConnectionError('Workflow not found')).toBe('Workflow not found');
    });

    // SyncManager emits `Failed to fetch workflow X: <cause>`, which already contains the label
    // the command would prefix, so a naive join reads "Failed to fetch workflow X: Failed to
    // fetch workflow X: ...".
    it('does not repeat a label the error message already starts with', () => {
        const emitted = new Error('Failed to fetch workflow abc: Error: unable to verify the first certificate');
        expect(formatConnectionError('Failed to fetch workflow abc', emitted).split('\n')[0])
            .toBe('Failed to fetch workflow abc: Error: unable to verify the first certificate');
    });

    it('appends the trust hint for a certificate failure recognised by code', () => {
        const message = formatConnectionError('Pull failed', { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' });
        expect(message).toContain(CERTIFICATE_TRUST_HINT_CLI);
    });

    it('appends the trust hint for a certificate failure recognised by message', () => {
        const message = formatConnectionError('Failed to list workflows', new Error('unable to verify the first certificate'));
        expect(message).toContain(CERTIFICATE_TRUST_HINT_CLI);
    });

    it('appends the trust hint when the cause is nested, as undici reports it', () => {
        const error = Object.assign(new TypeError('fetch failed'), {
            cause: { code: 'SELF_SIGNED_CERT_IN_CHAIN' },
        });
        expect(formatConnectionError('Push failed', error)).toContain(CERTIFICATE_TRUST_HINT_CLI);
    });

    it('keeps the first line unchanged so the existing wording stays greppable', () => {
        const message = formatConnectionError('Failed to list workflows', new Error('unable to verify the first certificate'));
        expect(message.split('\n')[0]).toBe('Failed to list workflows: unable to verify the first certificate');
    });

    // The hint is only useful because it is rare. An auth or transport failure that picked it up
    // would train users to ignore it, so these must stay clean.
    it('does not append the hint to failures that have nothing to do with trust', () => {
        for (const error of [
            axiosError(401),
            axiosError(403, { message: 'forbidden' }),
            { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:5678' },
            new Error('Promotion aborted by user.'),
        ]) {
            expect(formatConnectionError('Failed', error)).not.toContain(CERTIFICATE_TRUST_HINT_CLI);
        }
    });
});

describe('captureEmittedErrors', () => {
    it('returns undefined until something is emitted, then the most recent error', () => {
        const emitter = new EventEmitter();
        const last = captureEmittedErrors(emitter);
        expect(last()).toBeUndefined();

        emitter.emit('error', new Error('first'));
        expect(last()?.message).toBe('first');

        emitter.emit('error', new Error('second'));
        expect(last()?.message).toBe('second');
    });

    // Without a listener, Node turns an `error` event into an uncaught exception and the process
    // dies before any command-level catch runs. This is the regression that matters.
    it('stops an emitted error from becoming an uncaught exception', () => {
        const emitter = new EventEmitter();
        expect(() => emitter.emit('error', new Error('boom'))).toThrow('boom');

        const guarded = new EventEmitter();
        captureEmittedErrors(guarded);
        expect(() => guarded.emit('error', new Error('boom'))).not.toThrow();
    });

    it('feeds the captured cause into the formatted message, hint included', () => {
        const emitter = new EventEmitter();
        const last = captureEmittedErrors(emitter);
        emitter.emit('error', Object.assign(new Error('Failed to fetch workflow abc'), {
            code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
        }));
        expect(formatConnectionError('Fetch failed', last())).toContain(CERTIFICATE_TRUST_HINT_CLI);
    });
});

describe('CERTIFICATE_TRUST_HINT_CLI', () => {
    it('names the levers a CLI user actually has', () => {
        expect(CERTIFICATE_TRUST_HINT_CLI).toContain(N8NAC_EXTRA_CA_CERTS_ENV);
        expect(CERTIFICATE_TRUST_HINT_CLI).toContain('NODE_EXTRA_CA_CERTS');
        expect(CERTIFICATE_TRUST_HINT_CLI).toContain(N8NAC_INSECURE_TLS_ENV);
    });

    // The VS Code hint tells users to set "n8n.tls.certificateAuthorities" and explains
    // extension-host behaviour. Neither exists on the command line, so reusing it here would
    // send someone to a setting they have no way to set.
    it('does not send CLI users to the VS Code setting', () => {
        expect(CERTIFICATE_TRUST_HINT_CLI).not.toContain('n8n.tls.certificateAuthorities');
        expect(CERTIFICATE_TRUST_HINT_CLI).not.toContain('VS Code');
    });
});
