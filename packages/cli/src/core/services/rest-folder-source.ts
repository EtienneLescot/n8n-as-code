import axios, { AxiosInstance } from 'axios';
import { IFolder } from '../types.js';

/**
 * Folder-auth material. Either a previously-stored session `cookie`
 * (`n8n-auth=<jwt>`, valid ~7 days) or raw `user`/`pass` to log in with.
 * A cookie is preferred; creds are used to mint one and to silently re-login
 * if the cookie has expired (401).
 */
export interface RestFolderAuth {
    cookie?: string;
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

/** Reduce a Set-Cookie array to the `n8n-auth=<value>` cookie pair. */
function extractAuthCookie(setCookie: string[] | undefined): string | undefined {
    if (!setCookie?.length) return undefined;
    const auth = setCookie.find((c) => c.startsWith('n8n-auth='));
    return (auth ?? setCookie[0]).split(';')[0];
}

/** Parse an absolute expiry from a Set-Cookie entry's Max-Age/Expires. */
function parseCookieExpiry(setCookie: string[] | undefined, now: number): string | undefined {
    const auth = setCookie?.find((c) => c.startsWith('n8n-auth=')) ?? setCookie?.[0];
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

/**
 * Reads the n8n folder hierarchy over the INTERNAL `/rest` API using session
 * (cookie) authentication.
 *
 * Rationale: on Community / sub-Enterprise instances the public API key cannot
 * read folders — `GET /api/v1/projects/{id}/folders` is license-gated (403) and
 * the public workflows API omits `parentFolderId` entirely, so the public folder
 * path falls back to a flat layout. The n8n UI itself uses these `/rest`
 * endpoints with a login cookie, which work on every edition. This source
 * replicates that path so `folderSync` can mirror the real folder tree where the
 * public folder API is unavailable.
 *
 * It only fetches data; folder→path resolution is delegated to the existing
 * {@link FolderPathResolver} so behavior matches the public-API code path.
 */
export class RestFolderSource {
    private readonly client: AxiosInstance;
    private cookie?: string;

    constructor(
        private readonly host: string,
        private readonly projectId: string,
        private readonly auth: RestFolderAuth,
    ) {
        this.client = axios.create({
            baseURL: host.replace(/\/+$/, ''),
            timeout: 30000,
        });
        this.cookie = auth.cookie;
    }

    /**
     * Log in once and return the session cookie + its expiry. Used by the
     * `env auth folder-login` command to mint a token to store, and internally
     * to refresh an expired one.
     */
    static async login(host: string, user: string, pass: string, now = Date.now()): Promise<RestFolderLoginResult> {
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
        await this.ensureCookie();
        const folders = await this.getAll<IFolder>(
            `/rest/projects/${encodeURIComponent(this.projectId)}/folders`,
        );

        const workflowParentFolderId = new Map<string, string>();
        const workflows = await this.getAll<any>('/rest/workflows');
        for (const wf of workflows) {
            if (!wf?.id) continue;
            const folderId = wf.parentFolder?.id ?? wf.parentFolderId ?? null;
            if (folderId) workflowParentFolderId.set(wf.id, folderId);
        }

        return { folders, workflowParentFolderId };
    }

    private async ensureCookie(): Promise<void> {
        if (this.cookie) return;
        if (this.auth.user && this.auth.pass) {
            this.cookie = (await RestFolderSource.login(this.host, this.auth.user, this.auth.pass)).cookie;
            return;
        }
        throw new Error('no folder-login cookie or credentials available');
    }

    /** Paginated GET with one transparent re-login if a stored cookie has expired. */
    private async getAll<T>(pathname: string): Promise<T[]> {
        try {
            return await this.fetchAllPages<T>(pathname);
        } catch (error: any) {
            const status = error?.response?.status;
            const canRelogin = status === 401 && this.auth.user && this.auth.pass;
            if (!canRelogin) throw error;
            // Stored cookie expired/revoked — mint a fresh one and retry once.
            this.cookie = (await RestFolderSource.login(this.host, this.auth.user!, this.auth.pass!)).cookie;
            return await this.fetchAllPages<T>(pathname);
        }
    }

    private async fetchAllPages<T>(pathname: string): Promise<T[]> {
        await this.ensureCookie();
        const all: T[] = [];
        const take = 200;
        let skip = 0;
        for (;;) {
            const res = await this.client.get(pathname, {
                params: { take, skip },
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
            if (data.length < take) break;
            skip += take;
        }
        return all;
    }
}
