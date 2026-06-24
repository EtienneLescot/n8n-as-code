import axios, { AxiosInstance } from 'axios';
import { IFolder } from '../types.js';

export interface RestFolderLogin {
    user: string;
    pass: string;
}

export interface RestFolderData {
    /** Raw folder tree (feeds {@link FolderPathResolver}). */
    folders: IFolder[];
    /** `workflowId -> parentFolderId` for every foldered workflow. */
    workflowParentFolderId: Map<string, string>;
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
        private readonly login: RestFolderLogin,
    ) {
        this.client = axios.create({
            baseURL: host.replace(/\/+$/, ''),
            timeout: 30000,
        });
    }

    /** Fetch the folder tree and the workflow→folder mapping in one shot. */
    async load(): Promise<RestFolderData> {
        await this.authenticate();
        const folders = await this.fetchAll<IFolder>(
            `/rest/projects/${encodeURIComponent(this.projectId)}/folders`,
        );

        const workflowParentFolderId = new Map<string, string>();
        const workflows = await this.fetchAll<any>('/rest/workflows');
        for (const wf of workflows) {
            if (!wf?.id) continue;
            const folderId = wf.parentFolder?.id ?? wf.parentFolderId ?? null;
            if (folderId) workflowParentFolderId.set(wf.id, folderId);
        }

        return { folders, workflowParentFolderId };
    }

    private async authenticate(): Promise<void> {
        const res = await this.client.post(
            '/rest/login',
            { emailOrLdapLoginId: this.login.user, password: this.login.pass },
            { headers: { 'Content-Type': 'application/json' } },
        );
        const setCookie: string[] | undefined = res.headers?.['set-cookie'];
        if (!setCookie || setCookie.length === 0) {
            throw new Error('session login returned no cookie');
        }
        // Keep only the `name=value` part of each Set-Cookie entry.
        this.cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
    }

    /** Paginated GET over an n8n `/rest` collection (`{ count, data }` shape). */
    private async fetchAll<T>(pathname: string): Promise<T[]> {
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
