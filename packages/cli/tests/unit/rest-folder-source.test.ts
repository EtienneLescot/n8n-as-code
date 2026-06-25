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
