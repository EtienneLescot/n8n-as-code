import axios, { AxiosInstance } from 'axios';
import { IFolder } from '../types.js';

/**
 * Folder-auth material for the internal `/rest` API. Provide one or more
 * previously-stored session cookies (`n8n-auth=<jwt>`, valid until their server-issued expiry) and/or raw
 * `user`/`pass` to log in with. Cookies are tried in order; `user`/`pass` are
 * used to mint a fresh cookie when none is present, and to silently re-login once
 * if every supplied cookie is rejected (401).
 */
export interface RestFolderAuth {
    /** Single cookie (convenience). Merged after {@link cookies}. */
    cookie?: string;
    /** Ordered candidate cookies, tried in turn on 401 before re-login. */
    cookies?: string[];
    user?: string;
    pass?: string;
}

export interface RestFolderLoginResult {
    /** Cookie header value, e.g. `n8n-auth=<jwt>`. */
    cookie: string;
    /** ISO expiry parsed from the Set-Cookie (Max-Age/Expires), if available. */
    expiresAt?: string;
}

export interface RestFolderData {
    /** Raw folder tree (feeds {@link FolderPathResolver}). */
    folders: IFolder[];
    /** `workflowId -> parentFolderId` for every foldered workflow. */
    workflowParentFolderId: Map<string, string>;
}

/** n8n's placeholder id for the current user's personal project. */
const PERSONAL_PROJECT_PLACEHOLDER = 'personal';

/** Reduce a Set-Cookie array to the `n8n-auth=<value>` cookie pair (only). */
function extractAuthCookie(setCookie: string[] | undefined): string | undefined {
    if (!setCookie?.length) return undefined;
    // Require the actual auth cookie: an unrelated CSRF/routing cookie is not a session.
    const auth = setCookie.find((c) => c.startsWith('n8n-auth='));
    return auth ? auth.split(';')[0] : undefined;
}

/** Parse an absolute expiry from the `n8n-auth` Set-Cookie entry's Max-Age/Expires. */
function parseCookieExpiry(setCookie: string[] | undefined, now: number): string | undefined {
    const auth = setCookie?.find((c) => c.startsWith('n8n-auth='));
    if (!auth) return undefined;
    const maxAge = /max-age=(\d+)/i.exec(auth)?.[1];
    if (maxAge) return new Date(now + Number(maxAge) * 1000).toISOString();
    const expires = /expires=([^;]+)/i.exec(auth)?.[1];
    if (expires) {
        const ts = Date.parse(expires);
        if (!Number.isNaN(ts)) return new Date(ts).toISOString();
    }
    return undefined;
}

/** Hosts we've already warned about sending credentials over cleartext (warn once each). */
const warnedInsecureHosts = new Set<string>();

/** True for loopback hosts, where plain HTTP does not leave the machine. */
function isLoopbackHost(hostname: string): boolean {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

/**
 * Warn (once per host) when session credentials — the password on login and the
 * cookie on every request — would travel over non-loopback cleartext HTTP.
 */
function warnIfInsecureHost(host: string): void {
    let url: URL;
    try {
        url = new URL(host);
    } catch {
        return;
    }
    if (url.protocol !== 'http:' || isLoopbackHost(url.hostname)) return;
    if (warnedInsecureHosts.has(url.host)) return;
    warnedInsecureHosts.add(url.host);
    console.warn(
        `[RestFolderSource] Sending folder-login credentials and session cookie over plain HTTP to ${url.host}. ` +
        `Use HTTPS for any non-loopback host so they are not exposed on the network.`,
    );
}

/**
 * Reads the n8n folder hierarchy over the INTERNAL `/rest` API using session
 * (cookie) authentication.
 *
 * Rationale: n8n's public workflow API omits a workflow's folder ownership on
 * every edition (`parentFolderId` is `writeOnly` in the spec and no endpoint maps
 * workflows to folders), and `GET /api/v1/projects/{id}/folders` is license-gated
 * on Community (403). So the public folder path cannot reconstruct a nested layout
 * on `pull`. The n8n UI itself uses these `/rest` endpoints with a login cookie,
 * which work on every edition. This source replicates that path so `folderSync`
 * can mirror the real folder tree.
 *
 * It only fetches data; folder→path resolution is delegated to the existing
 * {@link FolderPathResolver} so behavior matches the public-API code path.
 */
export class RestFolderSource {
    private readonly client: AxiosInstance;
    private readonly cookieCandidates: string[];
    private cookieIndex = 0;
    private cookie?: string;
    private reloggedIn = false;
    private loadChain: Promise<unknown> = Promise.resolve();

    constructor(
        private readonly host: string,
        private readonly projectId: string,
        private readonly auth: RestFolderAuth,
    ) {
        this.client = axios.create({
            baseURL: host.replace(/\/+$/, ''),
            timeout: 30000,
        });
        // De-duplicated, ordered candidate cookies: explicit list first, then the
        // single-cookie convenience field. A stale-but-unexpired stored cookie can
        // then fall through to an env-provided token instead of masking it.
        this.cookieCandidates = [...(auth.cookies ?? []), ...(auth.cookie ? [auth.cookie] : [])]
            .filter((c, i, arr) => c && arr.indexOf(c) === i);
        this.cookie = this.cookieCandidates[0];
        warnIfInsecureHost(host);
    }

    /**
     * Log in once and return the session cookie + its expiry. Used by the
     * `env auth folder-login` command to mint a token to store, and internally
     * to refresh an expired one.
     */
    static async login(host: string, user: string, pass: string, now = Date.now()): Promise<RestFolderLoginResult> {
        warnIfInsecureHost(host);
        const res = await axios.post(
            `${host.replace(/\/+$/, '')}/rest/login`,
            { emailOrLdapLoginId: user, password: pass },
            { headers: { 'Content-Type': 'application/json' }, timeout: 30000 },
        );
        const setCookie: string[] | undefined = res.headers?.['set-cookie'];
        const cookie = extractAuthCookie(setCookie);
        if (!cookie) throw new Error('session login returned no cookie');
        return { cookie, expiresAt: parseCookieExpiry(setCookie, now) };
    }

    /** Fetch the folder tree and the workflow→folder mapping in one shot. */
    async load(): Promise<RestFolderData> {
        // Serialize loads on this source: two loads must never run concurrently, or
        // they would race on the mutable auth state (cookie index / one-shot re-login).
        // Chaining (rather than sharing one in-flight promise) also means a later
        // caller runs its OWN doLoad after the earlier one finishes, so it reads a
        // fresh snapshot instead of inheriting the earlier load's result.
        const run = this.loadChain.then(() => this.doLoad(), () => this.doLoad());
        // Keep the chain alive regardless of this run's outcome, so the next load waits.
        this.loadChain = run.then(() => undefined, () => undefined);
        return run;
    }

    private async doLoad(): Promise<RestFolderData> {
        this.reloggedIn = false; // allow one fresh re-login per load, not once per lifetime
        let projectId: string | undefined = this.projectId;

        if (!projectId || projectId === PERSONAL_PROJECT_PLACEHOLDER) {
            // The folders endpoint won't accept the `personal` alias, so resolve a real
            // id. Prefer the project list (unambiguous: pick type === 'personal') and
            // only fall back to inferring the personal project from workflows.
            projectId = await this.resolvePersonalProjectId();
            if (!projectId) {
                // Unscoped read used ONLY to infer the personal project id; the workflow
                // list is (re)fetched scoped below, so the map can never include another
                // project's workflows.
                const sample = await this.getAll<any>('/rest/workflows');
                projectId = this.personalProjectIdFromWorkflows(sample);
            }
            if (!projectId) {
                // Do NOT guess a team project — fail with an actionable error so the
                // caller's fail-closed policy applies instead of pulling the wrong tree.
                throw new Error(
                    'could not resolve the personal project id over /rest (the configured ' +
                    'projectId is the "personal" placeholder). Set a concrete projectId on the ' +
                    'environment, or ensure the folder-login account can list its projects.',
                );
            }
        }

        const resolvedProjectId = projectId as string;
        // Always scope the workflow read to the resolved project — matches the n8n
        // editor, avoids paginating every workflow visible to the account, and keeps
        // the map to this project's workflows (never a team project's).
        const workflows = await this.getAll<any>('/rest/workflows', { filter: JSON.stringify({ projectId: resolvedProjectId }) });
        const folders = await this.getAll<IFolder>(`/rest/projects/${encodeURIComponent(resolvedProjectId)}/folders`);

        const workflowParentFolderId = new Map<string, string>();
        for (const wf of workflows) {
            if (!wf?.id) continue;
            const folderId = wf.parentFolder?.id ?? wf.parentFolderId ?? null;
            if (folderId) workflowParentFolderId.set(wf.id, folderId);
        }

        return { folders, workflowParentFolderId };
    }

    /** The user's personal project id from `/rest/projects` (type === 'personal'); undefined if unavailable. */
    private async resolvePersonalProjectId(): Promise<string | undefined> {
        try {
            const projects = await this.getAll<any>('/rest/projects');
            const personal = projects.find((p) => p?.type === 'personal');
            return personal?.id ?? undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * The personal project id inferred from workflows, for the `personal` placeholder
     * when the project list is unavailable. Returns ONLY a project whose workflow home
     * project is typed `personal` — never an arbitrary (possibly team) project, so a
     * misresolved `personal` fails closed rather than pulling the wrong folder tree.
     */
    private personalProjectIdFromWorkflows(workflows: any[]): string | undefined {
        for (const wf of workflows) {
            const home = wf?.homeProject;
            if (home?.type === 'personal' && home.id) return home.id;
        }
        return undefined;
    }

    private async ensureCookie(): Promise<void> {
        if (this.cookie) return;
        if (this.auth.user && this.auth.pass) {
            this.reloggedIn = true;
            this.cookie = (await RestFolderSource.login(this.host, this.auth.user, this.auth.pass)).cookie;
            return;
        }
        throw new Error('no folder-login cookie or credentials available');
    }

    /**
     * On 401: advance to the next candidate cookie, or (once) mint a fresh cookie
     * from credentials. Returns false when there is nothing left to try.
     */
    private async advanceAuth(): Promise<boolean> {
        if (this.cookieIndex + 1 < this.cookieCandidates.length) {
            this.cookieIndex += 1;
            this.cookie = this.cookieCandidates[this.cookieIndex];
            return true;
        }
        if (this.auth.user && this.auth.pass && !this.reloggedIn) {
            this.reloggedIn = true;
            this.cookie = (await RestFolderSource.login(this.host, this.auth.user, this.auth.pass)).cookie;
            return true;
        }
        return false;
    }

    /** Paginated GET that retries on 401 with the next candidate cookie / a re-login. */
    private async getAll<T>(pathname: string, extraParams: Record<string, unknown> = {}): Promise<T[]> {
        for (;;) {
            try {
                return await this.fetchAllPages<T>(pathname, extraParams);
            } catch (error: any) {
                if (error?.response?.status !== 401) throw error;
                if (await this.advanceAuth()) continue;
                throw error;
            }
        }
    }

    private async fetchAllPages<T>(pathname: string, extraParams: Record<string, unknown>): Promise<T[]> {
        await this.ensureCookie();
        const all: T[] = [];
        const take = 100;
        let skip = 0;
        for (;;) {
            const res = await this.client.get(pathname, {
                params: { ...extraParams, take, skip },
                headers: { Cookie: this.cookie ?? '' },
            });
            const body = res.data;
            const data: T[] = Array.isArray(body?.data)
                ? body.data
                : Array.isArray(body)
                ? body
                : [];
            all.push(...data);
            const count: number | undefined =
                typeof body?.count === 'number' ? body.count : undefined;
            if (data.length === 0) break;
            if (count !== undefined && all.length >= count) break;
            // Advance by what the server actually returned: n8n's /rest endpoints
            // cap page size (100) regardless of the requested `take`, so neither
            // `skip += take` nor a `data.length < take` stop are safe — they'd
            // skip pages or stop after the first short page.
            skip += data.length;
            // Last-resort stop only when the server gives no count to page against.
            if (count === undefined && data.length < take) break;
        }
        return all;
    }
}
