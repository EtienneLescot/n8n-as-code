/**
 * Tell the user when the installed CLI is behind what is published.
 *
 * This exists because of what it replaced. Generated agent instructions used to run
 * `npx --yes n8nac@<tag>`, which re-resolved the dist tag from the registry on every
 * single call, so an agent silently ran the newest publish and nobody had to think
 * about versions. Naming a local install is far faster but pins it, so the invisible
 * update is gone and something has to say so out loud.
 *
 * Everything here is best-effort: it must never fail a command, never block for long,
 * and never reach the network when the user has said not to.
 */

/** The whole document is about 80 bytes, so there is no packument to download. */
const DIST_TAGS_URL = 'https://registry.npmjs.org/-/package/n8nac/dist-tags';
const TIMEOUT_MS = 3000;

/**
 * Reuses the vocabulary the telemetry package already established rather than inventing
 * a variable, plus `NO_UPDATE_NOTIFIER`, the de-facto standard name for this one check.
 */
function optedOut(env: NodeJS.ProcessEnv): boolean {
    return env.CI === 'true'
        || env.DO_NOT_TRACK === '1'
        || Boolean(env.NO_UPDATE_NOTIFIER);
}

/**
 * The version published under `distTag`, when it differs from what is running.
 * Undefined for every other outcome, including every failure.
 */
export async function findNewerPublishedVersion(
    currentVersion: string | undefined,
    distTag: string | undefined,
    env: NodeJS.ProcessEnv = process.env,
    fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
    if (!currentVersion || optedOut(env)) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetchImpl(DIST_TAGS_URL, {
            headers: { 'User-Agent': 'n8n-as-code' },
            signal: controller.signal,
            redirect: 'error',
        });
        if (!response.ok) return undefined;

        const tags = await response.json() as Record<string, unknown>;
        const published = tags?.[distTag ?? 'latest'];

        // Plain inequality, not a semver comparison. The caller skips dev checkouts, which
        // is the only case where the running version can legitimately be ahead of the tag,
        // and a dependency for one string compare would not earn its place.
        return typeof published === 'string' && published !== currentVersion
            ? published
            : undefined;
    } catch {
        // Offline, slow, rate-limited, or a response shaped differently than expected.
        // None of that is the user's problem in the middle of an update-ai.
        return undefined;
    } finally {
        clearTimeout(timer);
    }
}
