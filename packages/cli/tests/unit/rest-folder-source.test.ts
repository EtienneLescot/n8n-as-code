import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RestFolderSource } from '../../src/core/services/rest-folder-source.js';

const { mockAxiosGet, mockAxiosPost, mockAxiosCreate } = vi.hoisted(() => ({
    mockAxiosGet: vi.fn(),
    mockAxiosPost: vi.fn(),
    mockAxiosCreate: vi.fn(),
}));

vi.mock('axios', () => {
    mockAxiosCreate.mockImplementation(() => ({ get: mockAxiosGet }));
    return {
        default: Object.assign(vi.fn(), { create: mockAxiosCreate, post: mockAxiosPost }),
    };
});

const HOST = 'https://n8n.local';
const PROJECT = 'proj-1';

/**
 * Simulate n8n's `/rest/workflows`, which caps a page at 100 items regardless of
 * the requested `take` and reports the grand total in `count`. This is the exact
 * shape that broke the original pagination (`skip += take` + `data.length < take`
 * stop): only the first 100 workflows were ever read.
 */
function makeCappedWorkflowsEndpoint(total: number, pageCap = 100) {
    return (params: { take: number; skip: number }) => {
        const { skip } = params;
        const pageSize = Math.min(pageCap, Math.max(0, total - skip));
        const data = Array.from({ length: pageSize }, (_, i) => {
            const n = skip + i;
            return { id: `wf-${n}`, parentFolder: { id: `folder-${n % 5}` } };
        });
        return { data: { data, count: total } };
    };
}

describe('RestFolderSource pagination', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAxiosCreate.mockImplementation(() => ({ get: mockAxiosGet }));
    });

    it('reads every workflow across pages when the server caps page size below `take`', async () => {
        const total = 229; // > 2 pages of 100, with a short final page
        const workflowsEndpoint = makeCappedWorkflowsEndpoint(total);

        mockAxiosGet.mockImplementation((pathname: string, config: { params: { take: number; skip: number } }) => {
            if (pathname.includes('/folders')) {
                return Promise.resolve({ data: { data: [{ id: 'folder-0', name: 'F0' }], count: 1 } });
            }
            return Promise.resolve(workflowsEndpoint(config.params));
        });

        const source = new RestFolderSource(HOST, PROJECT, { cookie: 'n8n-auth=token' });
        const { workflowParentFolderId } = await source.load();

        // The bug stopped after the first 100; the fix must map all 229.
        expect(workflowParentFolderId.size).toBe(total);
        expect(workflowParentFolderId.get('wf-0')).toBe('folder-0');
        expect(workflowParentFolderId.get('wf-150')).toBeDefined();
        expect(workflowParentFolderId.get('wf-228')).toBeDefined();

        // skip must advance by the items actually returned (100), not by `take`,
        // so no page is skipped: skips seen should be 0, 100, 200.
        const workflowSkips = mockAxiosGet.mock.calls
            .filter(([p]) => String(p).includes('/workflows'))
            .map(([, c]) => c.params.skip);
        expect(workflowSkips).toEqual([0, 100, 200]);
    });
});

describe('RestFolderSource.login', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAxiosCreate.mockImplementation(() => ({ get: mockAxiosGet }));
    });

    it('selects the n8n-auth cookie and parses Max-Age into an absolute expiry', async () => {
        const NOW = 1_700_000_000_000;
        mockAxiosPost.mockResolvedValue({
            headers: { 'set-cookie': ['unrelated=x; Path=/', 'n8n-auth=JWT; Max-Age=604800; HttpOnly'] },
        });

        const result = await RestFolderSource.login(HOST, 'you@example.com', 'secret', NOW);

        expect(result.cookie).toBe('n8n-auth=JWT');
        expect(result.expiresAt).toBe(new Date(NOW + 604800 * 1000).toISOString());
        // The password must reach the login body, but nothing persists it here.
        expect(mockAxiosPost).toHaveBeenCalledWith(
            `${HOST}/rest/login`,
            expect.objectContaining({ emailOrLdapLoginId: 'you@example.com', password: 'secret' }),
            expect.anything(),
        );
    });

    it('throws when the login response carries no cookie', async () => {
        mockAxiosPost.mockResolvedValue({ headers: {} });
        await expect(RestFolderSource.login(HOST, 'you@example.com', 'secret')).rejects.toThrow(/no cookie/i);
    });

    it('throws when the response has cookies but none is the n8n-auth session', async () => {
        // A CSRF/routing cookie must not be accepted as a valid folder session.
        mockAxiosPost.mockResolvedValue({ headers: { 'set-cookie': ['n8n-csrf=abc; Path=/', 'route=x'] } });
        await expect(RestFolderSource.login(HOST, 'you@example.com', 'secret')).rejects.toThrow(/no cookie/i);
    });
});

describe('RestFolderSource.load auth + scoping', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAxiosCreate.mockImplementation(() => ({ get: mockAxiosGet }));
    });

    it('scopes /rest/workflows by the configured project id', async () => {
        mockAxiosGet.mockImplementation((pathname: string) => {
            if (pathname.includes('/folders')) {
                return Promise.resolve({ data: { data: [{ id: 'f1', name: 'Reports' }], count: 1 } });
            }
            return Promise.resolve({ data: { data: [{ id: 'wf-1', parentFolder: { id: 'f1' } }], count: 1 } });
        });

        await new RestFolderSource(HOST, PROJECT, { cookie: 'n8n-auth=t' }).load();

        const workflowsCall = mockAxiosGet.mock.calls.find(([p]) => String(p).includes('/workflows'));
        expect(workflowsCall?.[1]?.params?.filter).toBe(JSON.stringify({ projectId: PROJECT }));
        // Folders are read under the same project id.
        expect(mockAxiosGet.mock.calls.some(([p]) => String(p) === `/rest/projects/${PROJECT}/folders`)).toBe(true);
    });

    it('resolves the `personal` placeholder via /rest/projects, preferring the personal project', async () => {
        mockAxiosGet.mockImplementation((pathname: string) => {
            if (pathname === '/rest/projects') {
                return Promise.resolve({ data: { data: [{ id: 'team-1', type: 'team' }, { id: 'personal-1', type: 'personal' }], count: 2 } });
            }
            if (pathname.includes('/folders')) {
                return Promise.resolve({ data: { data: [{ id: 'f1', name: 'Reports' }], count: 1 } });
            }
            return Promise.resolve({ data: { data: [{ id: 'wf-1', parentFolder: { id: 'f1' } }], count: 1 } });
        });

        const { workflowParentFolderId } = await new RestFolderSource(HOST, 'personal', { cookie: 'n8n-auth=t' }).load();

        // Folders + workflows must use the resolved PERSONAL id, never `personal` or the team id.
        expect(mockAxiosGet.mock.calls.some(([p]) => String(p) === '/rest/projects/personal-1/folders')).toBe(true);
        expect(mockAxiosGet.mock.calls.some(([p]) => String(p) === '/rest/projects/team-1/folders')).toBe(false);
        expect(mockAxiosGet.mock.calls.some(([p]) => String(p).includes('/projects/personal/'))).toBe(false);
        const workflowsCall = mockAxiosGet.mock.calls.find(([p]) => String(p) === '/rest/workflows');
        expect(workflowsCall?.[1]?.params?.filter).toBe(JSON.stringify({ projectId: 'personal-1' }));
        expect(workflowParentFolderId.get('wf-1')).toBe('f1');
    });

    it('falls back to the personal home-project when the project list is unavailable', async () => {
        mockAxiosGet.mockImplementation((pathname: string) => {
            if (pathname === '/rest/projects') return Promise.reject({ response: { status: 403 } });
            if (pathname.includes('/folders')) return Promise.resolve({ data: { data: [], count: 0 } });
            // The first workflow belongs to a TEAM project; the personal one must still win.
            return Promise.resolve({ data: { data: [
                { id: 'wf-team', homeProject: { id: 'team-1', type: 'team' }, parentFolder: { id: 'ft' } },
                { id: 'wf-me', homeProject: { id: 'personal-1', type: 'personal' }, parentFolder: { id: 'fp' } },
            ], count: 2 } });
        });

        await new RestFolderSource(HOST, 'personal', { cookie: 'n8n-auth=t' }).load();

        expect(mockAxiosGet.mock.calls.some(([p]) => String(p) === '/rest/projects/personal-1/folders')).toBe(true);
        expect(mockAxiosGet.mock.calls.some(([p]) => String(p) === '/rest/projects/team-1/folders')).toBe(false);
    });

    it('refetches workflows scoped after inferring personal, so the map excludes other projects', async () => {
        mockAxiosGet.mockImplementation((pathname: string, config: any) => {
            if (pathname === '/rest/projects') return Promise.reject({ response: { status: 403 } });
            if (pathname.includes('/folders')) return Promise.resolve({ data: { data: [{ id: 'fp', name: 'P' }], count: 1 } });
            // Unscoped read (id resolution) returns team + personal; the scoped read returns only personal.
            const filter = config?.params?.filter;
            if (!filter) {
                return Promise.resolve({ data: { data: [
                    { id: 'wf-team', homeProject: { id: 'team-1', type: 'team' }, parentFolder: { id: 'ft' } },
                    { id: 'wf-me', homeProject: { id: 'personal-1', type: 'personal' }, parentFolder: { id: 'fp' } },
                ], count: 2 } });
            }
            return Promise.resolve({ data: { data: [{ id: 'wf-me', parentFolder: { id: 'fp' } }], count: 1 } });
        });

        const { workflowParentFolderId } = await new RestFolderSource(HOST, 'personal', { cookie: 'n8n-auth=t' }).load();

        expect(workflowParentFolderId.get('wf-me')).toBe('fp');
        expect(workflowParentFolderId.has('wf-team')).toBe(false); // excluded by the scoped refetch
        const scoped = mockAxiosGet.mock.calls.find(
            ([p, c]) => String(p) === '/rest/workflows' && c?.params?.filter === JSON.stringify({ projectId: 'personal-1' }),
        );
        expect(scoped).toBeTruthy();
    });

    it('fails closed instead of picking a team project when `personal` cannot be resolved', async () => {
        mockAxiosGet.mockImplementation((pathname: string) => {
            if (pathname === '/rest/projects') return Promise.resolve({ data: { data: [{ id: 'team-1', type: 'team' }], count: 1 } });
            if (pathname.includes('/folders')) return Promise.resolve({ data: { data: [], count: 0 } });
            // Only a team workflow is visible — no personal evidence at all.
            return Promise.resolve({ data: { data: [{ id: 'wf-team', homeProject: { id: 'team-1', type: 'team' } }], count: 1 } });
        });

        await expect(new RestFolderSource(HOST, 'personal', { cookie: 'n8n-auth=t' }).load())
            .rejects.toThrow(/could not resolve the personal project id/i);
        // The team project's folders must never be read as a consolation prize.
        expect(mockAxiosGet.mock.calls.some(([p]) => String(p) === '/rest/projects/team-1/folders')).toBe(false);
    });

    it('serializes concurrent loads so they never race on auth state', async () => {
        let mintCount = 0;
        let validCookie: string | null = null;
        mockAxiosPost.mockImplementation(() => {
            mintCount += 1;
            validCookie = `n8n-auth=fresh-${mintCount}`;
            return Promise.resolve({ headers: { 'set-cookie': [`${validCookie}; Max-Age=604800`] } });
        });
        mockAxiosGet.mockImplementation((pathname: string, config: any) => {
            if (config?.headers?.Cookie !== validCookie) return Promise.reject({ response: { status: 401 } });
            return Promise.resolve({ data: { data: [], count: 0 } });
        });

        const source = new RestFolderSource(HOST, PROJECT, { cookie: 'n8n-auth=stale', user: 'u', pass: 'p' });
        const [a, b] = await Promise.allSettled([source.load(), source.load()]);

        // Both succeed (neither loses the single re-login to a concurrent peer); the
        // second reuses the cookie the first minted, so exactly one login happens.
        expect(a.status).toBe('fulfilled');
        expect(b.status).toBe('fulfilled');
        expect(mintCount).toBe(1);
    });

    it('a later concurrent load runs its own fresh doLoad (not a shared/stale result)', async () => {
        let foldersCall = 0;
        mockAxiosGet.mockImplementation((pathname: string) => {
            if (pathname.includes('/folders')) {
                foldersCall += 1;
                const id = `f-${foldersCall}`;
                return Promise.resolve({ data: { data: [{ id, name: id }], count: 1 } });
            }
            return Promise.resolve({ data: { data: [], count: 0 } });
        });

        const source = new RestFolderSource(HOST, PROJECT, { cookie: 'n8n-auth=t' });
        const [r1, r2] = await Promise.all([source.load(), source.load()]);

        // Serialized, each ran its own execution: the second sees a fresh snapshot
        // rather than inheriting the first load's folders (the dedupe-staleness bug).
        expect(r1.folders[0].id).toBe('f-1');
        expect(r2.folders[0].id).toBe('f-2');
        expect(foldersCall).toBe(2);
    });

    it('re-logs in again on a later load (relogin allowance resets per load)', async () => {
        let mintCount = 0;
        let validCookie: string | null = null; // nothing valid at first -> the stored cookie 401s
        mockAxiosPost.mockImplementation(() => {
            mintCount += 1;
            validCookie = `n8n-auth=fresh-${mintCount}`;
            return Promise.resolve({ headers: { 'set-cookie': [`${validCookie}; Max-Age=604800`] } });
        });
        mockAxiosGet.mockImplementation((pathname: string, config: any) => {
            if (config?.headers?.Cookie !== validCookie) return Promise.reject({ response: { status: 401 } });
            return Promise.resolve({ data: { data: [], count: 0 } });
        });

        const source = new RestFolderSource(HOST, PROJECT, { cookie: 'n8n-auth=stale', user: 'u', pass: 'p' });
        await source.load();
        expect(mintCount).toBe(1);

        validCookie = null; // simulate the freshly-minted cookie expiring before the next load
        await source.load();
        expect(mintCount).toBe(2); // a second load can re-login again, not just once per lifetime
    });

    it('re-logs in once on 401 when a stored cookie is rejected and creds are present', async () => {
        let getCalls = 0;
        mockAxiosGet.mockImplementation((pathname: string) => {
            getCalls += 1;
            if (getCalls === 1) return Promise.reject({ response: { status: 401 } });
            if (pathname.includes('/folders')) {
                return Promise.resolve({ data: { data: [], count: 0 } });
            }
            return Promise.resolve({ data: { data: [{ id: 'wf-1', parentFolder: { id: 'f1' } }], count: 1 } });
        });
        mockAxiosPost.mockResolvedValue({ headers: { 'set-cookie': ['n8n-auth=fresh; Max-Age=604800'] } });

        const source = new RestFolderSource(HOST, PROJECT, { cookie: 'n8n-auth=stale', user: 'u', pass: 'p' });
        const { workflowParentFolderId } = await source.load();

        expect(mockAxiosPost).toHaveBeenCalledTimes(1); // exactly one re-login
        expect(workflowParentFolderId.get('wf-1')).toBe('f1');
    });

    it('falls through to the next candidate cookie on 401 without re-logging in', async () => {
        let getCalls = 0;
        const cookiesUsed: string[] = [];
        mockAxiosGet.mockImplementation((pathname: string, config: any) => {
            getCalls += 1;
            cookiesUsed.push(config?.headers?.Cookie);
            if (getCalls === 1) return Promise.reject({ response: { status: 401 } });
            if (pathname.includes('/folders')) return Promise.resolve({ data: { data: [], count: 0 } });
            return Promise.resolve({ data: { data: [{ id: 'wf-1', parentFolder: { id: 'f1' } }], count: 1 } });
        });

        const source = new RestFolderSource(HOST, PROJECT, { cookies: ['n8n-auth=bad', 'n8n-auth=good'] });
        await source.load();

        expect(mockAxiosPost).not.toHaveBeenCalled();
        expect(cookiesUsed[0]).toBe('n8n-auth=bad');
        expect(cookiesUsed).toContain('n8n-auth=good');
    });

    it('throws on 401 when no other cookie or credentials remain', async () => {
        mockAxiosGet.mockRejectedValue({ response: { status: 401 } });
        const source = new RestFolderSource(HOST, PROJECT, { cookie: 'n8n-auth=bad' });
        await expect(source.load()).rejects.toMatchObject({ response: { status: 401 } });
        expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('warns when credentials would travel over non-loopback plain HTTP', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            // Unique host so the module-level "warn once per host" set does not suppress it.
            new RestFolderSource('http://insecure.example.test', PROJECT, { cookie: 'n8n-auth=t' });
            expect(warn).toHaveBeenCalledWith(expect.stringMatching(/plain HTTP/i));
        } finally {
            warn.mockRestore();
        }
    });

    it('degrades with licenseUnavailableReason when the folders endpoint returns 403 (unregistered instance)', async () => {
        mockAxiosGet.mockImplementation((pathname: string) => {
            if (pathname.includes('/folders')) {
                return Promise.reject({ response: { status: 403, data: { message: 'Plan lacks license for this feature' } } });
            }
            return Promise.resolve({ data: { data: [{ id: 'wf-1', name: 'W1' }], count: 1 } });
        });

        const source = new RestFolderSource(HOST, PROJECT, { cookie: 'n8n-auth=t' });
        const result = await source.load();

        expect(result.folders).toEqual([]);
        expect(result.licenseUnavailableReason).toMatch(/register the Community instance/i);
    });

    it('throws when /rest/workflows returns 403 (real auth/permissions failure)', async () => {
        mockAxiosGet.mockImplementation((pathname: string) => {
            if (String(pathname).includes('/workflows')) {
                return Promise.reject({ response: { status: 403 } });
            }
            return Promise.resolve({ data: { data: [], count: 0 } });
        });

        const source = new RestFolderSource(HOST, PROJECT, { cookie: 'n8n-auth=t' });
        await expect(source.load()).rejects.toMatchObject({ response: { status: 403 } });
    });
});
