import { describe, expect, it, vi } from 'vitest';
import { findNewerPublishedVersion } from '../../src/utils/version-check.js';

const TAGS = { latest: '2.7.0', next: '2.7.1-rc.1' };

/** A fetch that answers with a dist-tags document, and records how it was called. */
function tagsFetch(body: unknown = TAGS, ok = true) {
    return vi.fn(async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
}

describe('findNewerPublishedVersion', () => {
    it('reports the published version for the running dist tag', async () => {
        await expect(findNewerPublishedVersion('2.6.0', undefined, {}, tagsFetch())).resolves.toBe('2.7.0');
        await expect(findNewerPublishedVersion('2.6.0-rc.9', 'next', {}, tagsFetch())).resolves.toBe('2.7.1-rc.1');
    });

    it('stays quiet when the running version is already the published one', async () => {
        await expect(findNewerPublishedVersion('2.7.0', undefined, {}, tagsFetch())).resolves.toBeUndefined();
    });

    it('never reaches the network when the environment has opted out', async () => {
        for (const env of [{ CI: 'true' }, { DO_NOT_TRACK: '1' }, { NO_UPDATE_NOTIFIER: '1' }]) {
            const fetchImpl = tagsFetch();
            await expect(findNewerPublishedVersion('2.6.0', undefined, env, fetchImpl)).resolves.toBeUndefined();
            expect(fetchImpl).not.toHaveBeenCalled();
        }
    });

    it('stays quiet without a version to compare against', async () => {
        const fetchImpl = tagsFetch();
        await expect(findNewerPublishedVersion(undefined, undefined, {}, fetchImpl)).resolves.toBeUndefined();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('swallows a refused, malformed or unreachable registry', async () => {
        const rejects = vi.fn(async () => { throw new Error('ENOTFOUND'); }) as unknown as typeof fetch;

        await expect(findNewerPublishedVersion('2.6.0', undefined, {}, rejects)).resolves.toBeUndefined();
        await expect(findNewerPublishedVersion('2.6.0', undefined, {}, tagsFetch(TAGS, false))).resolves.toBeUndefined();
        await expect(findNewerPublishedVersion('2.6.0', undefined, {}, tagsFetch(null))).resolves.toBeUndefined();
        await expect(findNewerPublishedVersion('2.6.0', undefined, {}, tagsFetch({ latest: 42 }))).resolves.toBeUndefined();
    });

    it('stays quiet when the running dist tag is absent from the document', async () => {
        await expect(findNewerPublishedVersion('2.6.0', 'canary', {}, tagsFetch())).resolves.toBeUndefined();
    });

    it('sends an abort signal, so a hanging registry cannot hold the command open', async () => {
        const fetchImpl = tagsFetch();
        await findNewerPublishedVersion('2.6.0', undefined, {}, fetchImpl);

        const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
        expect(init.signal).toBeInstanceOf(AbortSignal);
    });
});
