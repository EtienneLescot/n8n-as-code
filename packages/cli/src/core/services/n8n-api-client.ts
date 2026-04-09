import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { IN8nCredentials, IWorkflow, IProject, ITag, ITriggerInfo, ITestPlan, ITestResult, TriggerType, IInferredPayload, IInferredPayloadField, IExecutionDetails, IExecutionList, IExecutionSummary, ExecutionStatus } from '../types.js';

export class N8nApiClient {
    private client: AxiosInstance;
    private apiKey: string;
    private projectsCache: Map<string, IProject> | null = null;
    private projectsCachePromise: Promise<Map<string, IProject>> | null = null;
    private static readonly PERSONAL_PROJECT_PLACEHOLDER_ID = 'personal';
    /** Shared HTTPS agent – allows self-signed certs in local/dev environments */
    private httpsAgent: https.Agent;

    constructor(credentials: IN8nCredentials) {
        this.apiKey = credentials.apiKey;
        let host = credentials.host;
        if (host.endsWith('/')) {
            host = host.slice(0, -1);
        }

        // Allow self-signed certificates by default to avoid issues in local environments.
        // The same agent is reused for webhook test calls so TLS behaviour is consistent.
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });

        this.client = axios.create({
            baseURL: host,
            headers: {
                'X-N8N-API-KEY': this.apiKey,
                'Content-Type': 'application/json',
                'User-Agent': 'n8n-as-code'
            },
            httpsAgent: this.httpsAgent,
        });
    }

    private extractUserIdFromApiKey(): string | null {
        try {
            if (!this.apiKey || !this.apiKey.includes('.')) return null;

            const parts = this.apiKey.split('.');
            if (parts.length !== 3) return null;

            const payload = parts[1];
            
            let decoded: string;
            try {
                // Try base64url first (available in modern Node.js)
                decoded = Buffer.from(payload, 'base64url' as BufferEncoding).toString('utf8');
            } catch {
                // Manual normalization as fallback
                const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
                const paddedPayload = normalizedPayload.padEnd(
                    normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
                    '=',
                );
                decoded = Buffer.from(paddedPayload, 'base64').toString('utf8');
            }

            const parsed = JSON.parse(decoded);
            return parsed.sub || null;
        } catch {
            return null;
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.client.get('/api/v1/users'); // Simple endpoint to test auth
            return true;
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    }

    async getCurrentUser(): Promise<{ id: string; email?: string; firstName?: string; lastName?: string; } | null> {
        // 1. Try to extract userId from API key (JWT sub claim)
        const jwtUserId = this.extractUserIdFromApiKey();
        if (jwtUserId) {
            if (process.env.DEBUG) console.debug(`[N8nApiClient] getCurrentUser: Extracted userId ${jwtUserId} from API key`);
            try {
                const res = await this.client.get(`/api/v1/users/${jwtUserId}`);
                if (res.data && res.data.id) {
                    if (process.env.DEBUG) console.debug('[N8nApiClient] getCurrentUser: Successfully retrieved specific user details');
                    return {
                        id: res.data.id,
                        email: res.data.email,
                        firstName: res.data.firstName,
                        lastName: res.data.lastName
                    };
                }
            } catch (error: any) {
                if (process.env.DEBUG) console.debug(`[N8nApiClient] getCurrentUser: Fetching specific user ${jwtUserId} failed:`, error.message);
                
                // If it's a connection error, throw immediately
                if (!error.response) throw error;

                // If it's a 403 or 404, we have the ID from JWT but can't get details.
                // Return the ID at least to ensure correct instance identification.
                if (error.response.status === 403 || error.response.status === 404) {
                    return { id: jwtUserId };
                }
            }
        }

        // 2. Fallback: Try /me (not in official public API spec but kept for compatibility)
        try {
            const res = await this.client.get('/api/v1/users/me');
            if (process.env.DEBUG) console.debug('[N8nApiClient] getCurrentUser: Successfully retrieved user from /me endpoint');
            if (res.data && res.data.id) {
                return {
                    id: res.data.id,
                    email: res.data.email,
                    firstName: res.data.firstName,
                    lastName: res.data.lastName
                };
            }
        } catch (error: any) {
            if (process.env.DEBUG) console.debug('[N8nApiClient] getCurrentUser: /me endpoint failed:', error.message);
            // If it's a connection error, throw immediately
            if (!error.response) throw error;
        }

        // 3. Last resort: get all users and take the first one
        // Note: This is unreliable on multi-user instances and only reached if JWT extraction failed.
        if (process.env.DEBUG) console.debug('[N8nApiClient] getCurrentUser: Trying /api/v1/users endpoint as last resort');
        try {
            const res = await this.client.get('/api/v1/users');
            if (res.data && res.data.data && res.data.data.length > 0) {
                if (process.env.DEBUG) console.debug('[N8nApiClient] getCurrentUser: Found', res.data.data.length, 'users, taking first');
                const user = res.data.data[0];
                return {
                    id: user.id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName
                };
            }
        } catch (error: any) {
            if (process.env.DEBUG) console.debug('[N8nApiClient] getCurrentUser: /api/v1/users endpoint failed:', error.message);
            // If it's a connection error, throw immediately
            if (!error.response) throw error;
        }
        
        if (process.env.DEBUG) console.debug('[N8nApiClient] getCurrentUser: All attempts failed, returning null');
        return null;
    }

    private shouldUsePersonalProjectFallback(error: any): boolean {
        const status = error?.response?.status;
        return status === 403 || status === 404;
    }

    private createProjectFallback(projectId: string, name: string, type: string = 'unknown'): IProject {
        return {
            id: projectId,
            name,
            type,
        };
    }

    private createPersonalProject(projectId: string = N8nApiClient.PERSONAL_PROJECT_PLACEHOLDER_ID): IProject {
        return this.createProjectFallback(projectId, 'Personal', 'personal');
    }

    private isPlaceholderPersonalProjectId(projectId?: string): boolean {
        return projectId === N8nApiClient.PERSONAL_PROJECT_PLACEHOLDER_ID;
    }

    /**
     * Fetches all projects from n8n.
     * Public method for CLI/UI to show project selection.
     * 
     * @returns Array of IProject
     */
    async getProjects(): Promise<IProject[]> {
        try {
            const res = await this.client.get('/api/v1/projects');
            const projects = res.data.data || [];
            return projects.map((p: any) => ({
                id: p.id,
                name: p.name,
                type: p.type,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt
            }));
        } catch (error: any) {
            if (this.shouldUsePersonalProjectFallback(error)) {
                console.warn('[N8nApiClient] Projects API unavailable or restricted. Using placeholder Personal project fallback.');
                return [this.createPersonalProject()];
            }
            
            console.error(`[N8nApiClient] Failed to fetch projects: ${error.message}`);
            return [];
        }
    }

    /**
     * Fetches all projects from n8n and caches them.
     * Returns a Map of projectId -> IProject for quick lookups.
     * 
     * The cache is populated on first call and reused for subsequent calls.
     * If the API call fails, returns an empty cache to allow graceful degradation.
     * 
     * @returns Map of projectId to IProject
     */
    private async getProjectsCache(): Promise<Map<string, IProject>> {
        if (this.projectsCache !== null) {
            return this.projectsCache;
        }
        // Memoize the in-flight promise so concurrent calls (e.g. Promise.all over workflows)
        // don't each trigger their own API call and log the license warning N times.
        if (this.projectsCachePromise !== null) {
            return this.projectsCachePromise;
        }
        this.projectsCachePromise = this._fetchProjectsCache();
        return this.projectsCachePromise;
    }

    private async _fetchProjectsCache(): Promise<Map<string, IProject>> {
        try {
            const res = await this.client.get('/api/v1/projects');
            const projects = res.data.data || [];
            
            this.projectsCache = new Map();
            for (const project of projects) {
                this.projectsCache.set(project.id, {
                    id: project.id,
                    name: project.name,
                    type: project.type,
                    createdAt: project.createdAt,
                    updatedAt: project.updatedAt
                });
            }
            
            // Only log in debug mode to avoid noise
            if (process.env.DEBUG) {
                console.debug(`[N8nApiClient] Cached ${this.projectsCache.size} projects`);
            }
            this.projectsCachePromise = null;
            return this.projectsCache;
        } catch (error: any) {
            if (this.shouldUsePersonalProjectFallback(error)) {
                console.warn('[N8nApiClient] Projects API unavailable or restricted. Using placeholder Personal project fallback in cache.');
                this.projectsCache = new Map();
                const personalProject = this.createPersonalProject();
                this.projectsCache.set(personalProject.id, personalProject);
                this.projectsCachePromise = null;
                return this.projectsCache;
            }
            
            // Graceful degradation: workflows will have projectId but no homeProject/projectName
            console.warn(`[N8nApiClient] Failed to fetch projects: ${error.message}. Workflows will not have project names.`);
            this.projectsCache = new Map();
            this.projectsCachePromise = null;
            return this.projectsCache;
        }
    }

    async getAllWorkflows(projectId?: string): Promise<IWorkflow[]> {
        try {
            const collected: any[] = [];
            const seenIds = new Set<string>();

            const addItems = (items: any[]) => {
                for (const it of items) {
                    if (!it || !it.id) continue;
                    if (seenIds.has(it.id)) continue;
                    seenIds.add(it.id);
                    collected.push(it);
                }
            };

            const normalize = (res: any) => {
                const data = res.data && res.data.data ? res.data.data : (Array.isArray(res.data) ? res.data : (res.data || []));
                const total = res.data && res.data.meta && (res.data.meta.total || res.data.meta.count) ? (res.data.meta.total || res.data.meta.count) :
                    (res.headers && (res.headers['x-total-count'] || res.headers['x-total']) ? parseInt(res.headers['x-total-count'] || res.headers['x-total'], 10) : undefined);
                const nextCursor = res.data?.nextCursor;
                return { items: Array.isArray(data) ? data : [], total, nextCursor };
            };

            const log = (...args: unknown[]) => {
                if (process.env.DEBUG) {
                    console.debug('[N8nApiClient:getAllWorkflows]', ...args);
                }
            };

            const firstRes = await this.client.get('/api/v1/workflows');
            const first = normalize(firstRes);
            log('initial-fetch', {
                items: first.items.length,
                total: first.total,
                nextCursor: first.nextCursor,
                projectId,
            });
            addItems(first.items);

            const pageSizeGuess = first.items.length || 100;

            if (first.total && seenIds.size >= first.total) {
                const workflows = collected.slice();
                const filtered = projectId && !this.isPlaceholderPersonalProjectId(projectId)
                    ? workflows.filter((wf: any) => wf.shared && Array.isArray(wf.shared) && wf.shared.length > 0 && wf.shared[0].projectId === projectId)
                    : workflows;
                const enriched = await Promise.all(filtered.map((wf: any) => this.enrichWorkflowMetadata(wf)));
                return enriched;
            }

            const paginateWithCursor = async (initialCursor: string) => {
                let cursor: string | undefined = initialCursor;
                const CURSOR_MAX = 1000;
                let iterations = 0;

                while (cursor && iterations++ < CURSOR_MAX) {
                    const res = await this.client.get('/api/v1/workflows', { params: { cursor } });
                    const cursorResult = normalize(res);
                    log('cursor-page', {
                        cursor,
                        items: cursorResult.items.length,
                        nextCursor: cursorResult.nextCursor
                    });
                    addItems(cursorResult.items);
                    cursor = cursorResult.nextCursor;
                }
            };

            if (first.nextCursor) {
                await paginateWithCursor(first.nextCursor);
            } else {
                const strategies: Array<{ name: string; probeParams: (opts: any) => any; buildParams: (opts: any) => any; }> = [
                    { name: 'limit-offset', probeParams: (opts: any) => ({ limit: 1, offset: opts.offset }), buildParams: (opts: any) => ({ limit: opts.pageSize, offset: opts.offset }) },
                    { name: 'page-per_page', probeParams: (opts: any) => ({ page: opts.page, per_page: opts.pageSize }), buildParams: (opts: any) => ({ page: opts.page, per_page: opts.pageSize }) },
                    { name: 'page-perPage', probeParams: (opts: any) => ({ page: opts.page, perPage: opts.pageSize }), buildParams: (opts: any) => ({ page: opts.page, perPage: opts.pageSize }) },
                    { name: 'page-limit', probeParams: (opts: any) => ({ page: opts.page, limit: opts.pageSize }), buildParams: (opts: any) => ({ page: opts.page, limit: opts.pageSize }) }
                ];

                const pageSize = Math.max(100, pageSizeGuess);
                let selectedStrategy: typeof strategies[number] | null = null;

                for (const strat of strategies) {
                    const offset = collected.length;
                    const page = Math.floor(collected.length / pageSize) + 1;
                    const probeParams = strat.probeParams({ offset, page, pageSize });
                    try {
                        const probeRes = await this.client.get('/api/v1/workflows', { params: probeParams });
                        const probeNorm = normalize(probeRes);
                        log('probe-result', strat.name, {
                            params: probeParams,
                            total: probeNorm.total,
                            items: probeNorm.items.length
                        });
                        if (probeNorm.items && probeNorm.items.length > 0) {
                            selectedStrategy = strat;
                            log('selected-strategy', strat.name, probeParams);
                            break;
                        }
                    } catch (e) {
                        log('probe-failed', strat.name, (e && (e as Error).message) || e);
                    }
                }

                log('selected-strategy', selectedStrategy?.name || 'none', { collected: collected.length });

                if (selectedStrategy) {
                    const MAX_ITER = 10000;
                    let iterations = 0;
                    let page = 1;
                    let offset = 0;

                    while (iterations++ < MAX_ITER) {
                        const params = selectedStrategy.buildParams({ page, offset, pageSize });
                        let res: any;
                        try {
                            res = await this.client.get('/api/v1/workflows', { params });
                        } catch (e) {
                            log('pagination-fetch-failed', selectedStrategy.name, {
                                params,
                                error: (e && (e as Error).message) || e
                            });
                            break;
                        }
                        const n = normalize(res);
                        log('paginate', selectedStrategy.name, {
                            page,
                            offset,
                            items: n.items.length,
                            total: n.total
                        });
                        if (!n.items || n.items.length === 0) break;
                        addItems(n.items);
                        if (n.total && seenIds.size >= n.total) break;
                        if (n.items.length < pageSize) break;
                        page += 1;
                        offset += pageSize;
                    }
                }
            }

            const workflows = collected.slice();
            const filtered = projectId && !this.isPlaceholderPersonalProjectId(projectId)
                ? workflows.filter((wf: any) => wf.shared && Array.isArray(wf.shared) && wf.shared.length > 0 && wf.shared[0].projectId === projectId)
                : workflows;
            const enriched = await Promise.all(
                filtered.map((wf: any) => this.enrichWorkflowMetadata(wf))
            );

            return enriched;
        } catch (error: any) {
            console.error('Failed to get workflows:', error.message);
            throw error;
        }
    }

    async getWorkflow(id: string): Promise<IWorkflow | null> {
        try {
            const res = await this.client.get(`/api/v1/workflows/${id}`);
            const workflow = res.data;

            // Tag payloads have varied across n8n versions and endpoints.
            // Fetch the dedicated workflow-tags endpoint so pull stays consistent.
            try {
                workflow.tags = await this.getWorkflowTags(id);
            } catch {
                // Keep the workflow payload if the dedicated tags endpoint is unavailable.
            }

            // Enrich with organization metadata
            return await this.enrichWorkflowMetadata(workflow);
        } catch (error: any) {
            // 404 is expected if workflow deleted remotely
            if (error.response && error.response.status === 404) {
                return null;
            }
            // Re-throw other errors (connection, 500, etc.)
            throw error;
        }
    }
    
    /**
     * Enriches a workflow with organization metadata extracted from the API response.
     * This metadata includes project information and archived status.
     * 
     * @param workflow Raw workflow from n8n API
     * @returns Workflow with organization metadata
     */
    private async enrichWorkflowMetadata(workflow: any): Promise<IWorkflow> {
        const enriched: IWorkflow = { ...workflow };
        
        // Get projects cache
        const projectsCache = await this.getProjectsCache();
        
        // Extract project information from shared array
        // n8n stores projectId in workflow.shared[0].projectId
        if (workflow.shared && Array.isArray(workflow.shared) && workflow.shared.length > 0) {
            const firstShare = workflow.shared[0];
            
            if (firstShare.projectId) {
                enriched.projectId = firstShare.projectId;
                
                // Look up project details in cache
                const project = projectsCache.get(firstShare.projectId);
                if (project) {
                    enriched.homeProject = project;
                    enriched.projectName = project.name;
                } else {
                    if (process.env.DEBUG) console.debug(`[N8nApiClient] Project ${firstShare.projectId} not found in cache`);
                }
            }
        }
        
        // Extract archived status (direct property)
        if (workflow.isArchived !== undefined) {
            enriched.isArchived = workflow.isArchived;
        }
        
        return enriched;
    }

    async createWorkflow(payload: Partial<IWorkflow>): Promise<IWorkflow> {
        const res = await this.client.post('/api/v1/workflows', payload);
        return res.data;
    }

    async getTags(): Promise<ITag[]> {
        const tags: ITag[] = [];
        let cursor: string | undefined;

        do {
            const res = await this.client.get('/api/v1/tags', {
                params: cursor ? { cursor } : undefined
            });

            const data = Array.isArray(res.data?.data) ? res.data.data : [];
            for (const tag of data) {
                if (tag?.id && tag?.name) {
                    tags.push({ id: tag.id, name: tag.name });
                }
            }

            cursor = res.data?.nextCursor || undefined;
        } while (cursor);

        return tags;
    }

    async createTag(name: string): Promise<ITag> {
        try {
            const res = await this.client.post('/api/v1/tags', { name });
            return {
                id: res.data.id,
                name: res.data.name
            };
        } catch (error: any) {
            if (error.response?.status === 409) {
                const existing = (await this.getTags()).find((tag) => tag.name === name);
                if (existing) {
                    return existing;
                }
            }

            throw error;
        }
    }

    async deleteTag(id: string): Promise<boolean> {
        try {
            await this.client.delete(`/api/v1/tags/${id}`);
            return true;
        } catch (error) {
            console.error(`Failed to delete tag ${id}:`, error);
            return false;
        }
    }

    async getWorkflowTags(id: string): Promise<ITag[]> {
        const res = await this.client.get(`/api/v1/workflows/${id}/tags`);
        const tags = Array.isArray(res.data) ? res.data : [];

        return tags
            .filter((tag: any) => tag?.id && tag?.name)
            .map((tag: any) => ({ id: tag.id, name: tag.name }));
    }

    async updateWorkflowTags(id: string, tags: Array<Pick<ITag, 'id'>>): Promise<ITag[]> {
        const res = await this.client.put(
            `/api/v1/workflows/${id}/tags`,
            tags.map((tag) => ({ id: tag.id }))
        );

        const updatedTags = Array.isArray(res.data) ? res.data : [];
        return updatedTags
            .filter((tag: any) => tag?.id && tag?.name)
            .map((tag: any) => ({ id: tag.id, name: tag.name }));
    }

    async updateWorkflow(id: string, payload: Partial<IWorkflow>): Promise<IWorkflow> {
        // Use console.warn to be more visible in some environments
        console.warn(`[N8nApiClient] Starting PUT /api/v1/workflows/${id}`);
        const startTime = Date.now();
        
        try {
            const res = await this.client.put(`/api/v1/workflows/${id}`, payload);
            const duration = Date.now() - startTime;
            console.warn(`[N8nApiClient] PUT finished in ${duration}ms. Status: ${res.status}`);
            return res.data;
        } catch (error: any) {
            const duration = Date.now() - startTime;
            console.error(`[N8nApiClient] PUT failed after ${duration}ms: ${error.message}`);
            if (error.response) {
                console.error(`[N8nApiClient] Error data:`, error.response.data);
            }
            throw error;
        }
    }

    async deleteWorkflow(id: string): Promise<boolean> {
        try {
            await this.client.delete(`/api/v1/workflows/${id}`);
            return true;
        } catch (error) {
            console.error(`Failed to delete workflow ${id}:`, error);
            return false;
        }
    }

    async activateWorkflow(id: string, active: boolean): Promise<IWorkflow | null> {
        try {
            const endpoint = active ? 'activate' : 'deactivate';
            const res = await this.client.post(`/api/v1/workflows/${id}/${endpoint}`);
            if (res.data && typeof res.data === 'object') {
                return res.data as IWorkflow;
            }
            return await this.getWorkflow(id);
        } catch (error) {
            return null;
        }
    }

    // ─── Credentials ────────────────────────────────────────────────────────────

    async getCredentialSchema(typeName: string): Promise<Record<string, unknown>> {
        const res = await this.client.get(`/api/v1/credentials/schema/${typeName}`);
        return res.data;
    }

    async listCredentials(): Promise<Array<Record<string, unknown>>> {
        const results: Array<Record<string, unknown>> = [];
        let cursor: string | undefined;
        do {
            const params: Record<string, string> = cursor ? { cursor } : {};
            const res = await this.client.get('/api/v1/credentials', { params });
            const page = res.data;
            results.push(...(page.data ?? []));
            cursor = page.nextCursor;
        } while (cursor);
        return results;
    }

    async getCredential(id: string): Promise<Record<string, unknown>> {
        const res = await this.client.get(`/api/v1/credentials/${id}`);
        return res.data;
    }

    async createCredential(payload: {
        type: string;
        name: string;
        data: Record<string, unknown>;
        projectId?: string;
    }): Promise<Record<string, unknown>> {
        const res = await this.client.post('/api/v1/credentials', payload);
        return res.data;
    }

    async deleteCredential(id: string): Promise<boolean> {
        try {
            await this.client.delete(`/api/v1/credentials/${id}`);
            return true;
        } catch (error) {
            return false;
        }
    }

    // ─── Executions ───────────────────────────────────────────────────────────

    async listExecutions(options: {
        workflowId?: string;
        status?: ExecutionStatus;
        projectId?: string;
        limit?: number;
        cursor?: string;
        includeData?: boolean;
    } = {}): Promise<IExecutionList> {
        const params: Record<string, string | number | boolean> = {};
        if (options.workflowId) params.workflowId = options.workflowId;
        if (options.status) params.status = options.status;
        if (options.projectId) params.projectId = options.projectId;
        if (options.limit !== undefined) params.limit = options.limit;
        if (options.cursor) params.cursor = options.cursor;
        if (options.includeData) params.includeData = true;

        const res = await this.client.get('/api/v1/executions', { params });
        const page = res.data ?? {};

        return {
            data: (page.data ?? []).map((execution: any): IExecutionSummary => ({
                id: String(execution.id),
                finished: Boolean(execution.finished),
                mode: String(execution.mode ?? ''),
                retryOf: execution.retryOf != null ? String(execution.retryOf) : null,
                retrySuccessId: execution.retrySuccessId != null ? String(execution.retrySuccessId) : null,
                startedAt: String(execution.startedAt ?? ''),
                stoppedAt: execution.stoppedAt != null ? String(execution.stoppedAt) : null,
                workflowId: String(execution.workflowId ?? ''),
                waitTill: execution.waitTill != null ? String(execution.waitTill) : null,
                customData: execution.customData,
                status: String(execution.status ?? 'unknown') as ExecutionStatus,
            })),
            nextCursor: page.nextCursor ?? null,
        };
    }

    async getExecution(id: string, options: { includeData?: boolean } = {}): Promise<IExecutionDetails> {
        const params: Record<string, boolean> = {};
        if (options.includeData) params.includeData = true;

        const res = await this.client.get(`/api/v1/executions/${id}`, { params });
        const execution = res.data ?? {};

        return {
            id: String(execution.id),
            finished: Boolean(execution.finished),
            mode: String(execution.mode ?? ''),
            retryOf: execution.retryOf != null ? String(execution.retryOf) : null,
            retrySuccessId: execution.retrySuccessId != null ? String(execution.retrySuccessId) : null,
            startedAt: String(execution.startedAt ?? ''),
            stoppedAt: execution.stoppedAt != null ? String(execution.stoppedAt) : null,
            workflowId: String(execution.workflowId ?? ''),
            waitTill: execution.waitTill != null ? String(execution.waitTill) : null,
            customData: execution.customData,
            status: String(execution.status ?? 'unknown') as ExecutionStatus,
            data: execution.data,
            workflowData: execution.workflowData,
            executedNode: execution.executedNode,
            triggerNode: execution.triggerNode,
        };
    }

    async getHealth(): Promise<{ version: string }> {
        try {
            // 1. Try public endpoint if available (some versions)
            try {
                const res = await this.client.get('/healthz');
                if (res.data && res.data.version) return { version: res.data.version };
            } catch { }

            // 2. Scraping Root Page as fallback (Using raw axios to avoid API headers)
            const baseURL = this.client.defaults.baseURL;
            const res = await axios.get(`${baseURL}/`);
            const html = res.data;

            // Look for "release":"n8n@X.Y.Z" probably inside n8n:config:sentry meta (Base64 encoded)
            const sentryMatch = html.match(/name="n8n:config:sentry"\s+content="([^"]+)"/);
            if (sentryMatch && sentryMatch[1]) {
                const decoded = Buffer.from(sentryMatch[1], 'base64').toString('utf-8');
                const releaseMatch = decoded.match(/"release":"n8n@([^"]+)"/);
                if (releaseMatch && releaseMatch[1]) {
                    return { version: releaseMatch[1] };
                }
            }

            // Fallback: Check plain text just in case
            const releaseRegex = /"release":"n8n@([^"]+)"/;
            const plainMatch = html.match(releaseRegex);
            if (plainMatch && plainMatch[1]) return { version: plainMatch[1] };

            // Look for other common patterns
            const metaMatch = html.match(/n8n version: ([0-9.]+)/i);
            if (metaMatch && metaMatch[1]) return { version: metaMatch[1] };

            return { version: '1.0+' };
        } catch {
            return { version: 'Unknown' };
        }
    }

    async getNodeTypes(): Promise<any[]> {
        try {
            // Unofficial/Internal endpoint often used by frontend
            const res = await this.client.get('/rest/node-types');
            return res.data;
        } catch {
            // Fallback: If REST API not accessible, return empty
            return [];
        }
    }

    // ── Trigger detection & test execution ───────────────────────────────────

    /**
     * Inspects a workflow's nodes and returns information about its trigger node,
     * following the same approach as czlonkowski/n8n-mcp:
     *   1. Fetch the workflow via the public API.
     *   2. Identify the trigger node by its type name.
     *   3. Extract the webhook path (explicit path → webhookId → nodeId).
     *
     * n8n's public API has NO endpoint to launch a new execution, so the only
     * way to test a webhook-driven workflow programmatically is to call the
     * /webhook-test/{path} URL directly.
     */
    detectTrigger(workflow: IWorkflow): ITriggerInfo | null {
        const nodes: any[] = workflow.nodes ?? [];

        for (const node of nodes) {
            // Skip disabled nodes — their webhooks are not active
            if (node.disabled) continue;

            const rawType: string = (node.type ?? '').toLowerCase();
            // Strip package prefix, e.g. "@n8n/n8n-nodes-langchain.chatTrigger" → "chattrigger"
            const shortType = rawType.includes('.') ? rawType.split('.').pop()! : rawType;

            let triggerType: TriggerType | null = null;

            if (shortType === 'webhook' || shortType === 'webhooktrigger') {
                triggerType = 'webhook';
            } else if (shortType === 'formtrigger') {
                // Note: 'form' (without suffix) is the form-step/response node, NOT the trigger.
                // Only 'formTrigger' (type ends with 'Trigger') is the actual trigger node.
                triggerType = 'form';
            } else if (shortType === 'chattrigger') {
                triggerType = 'chat';
            } else if (shortType === 'scheduletrigger' || shortType === 'cron' || shortType === 'interval') {
                triggerType = 'schedule';
            } else if (shortType.endsWith('trigger') || shortType.endsWith('poll')) {
                // Generic trigger / polling trigger — not directly hittable via HTTP
                triggerType = 'unknown';
            }

            if (triggerType === null) continue;

            const params = node.parameters ?? {};
            const webhookId: string | undefined =
                typeof node.webhookId === 'string' && node.webhookId ? node.webhookId : undefined;

            // Priority: explicit path param → webhookId → node id
            // Guard node.id: it must be a non-empty string, otherwise leave undefined
            const nodeIdString: string | undefined =
                typeof node.id === 'string' && node.id ? node.id : undefined;

            const hasExplicitPath = typeof params.path === 'string' && params.path.length > 0;
            const rawPath: string | undefined = hasExplicitPath
                ? params.path
                : webhookId ?? nodeIdString;
            const pathSource: ITriggerInfo['pathSource'] =
                hasExplicitPath ? 'explicit' : webhookId ? 'webhookId' : 'nodeId';

            const httpMethod: string =
                typeof params.httpMethod === 'string'
                    ? params.httpMethod.toUpperCase()
                    : 'GET';

            return {
                type: triggerType,
                workflowId: workflow.id,
                nodeId: node.id ?? '',
                nodeName: node.name ?? '',
                webhookId,
                webhookPath: triggerType !== 'schedule' && triggerType !== 'unknown' ? rawPath : undefined,
                pathSource: triggerType !== 'schedule' && triggerType !== 'unknown' ? pathSource : undefined,
                httpMethod: triggerType === 'webhook' ? httpMethod : undefined,
            };
        }

        return null;
    }

    /**
     * Normalises a raw webhook path: strips leading slashes and percent-encodes
     * each segment so the result is safe to embed in a URL.
     */
    private normalizeWebhookPath(webhookPath: string | undefined): string {
        const raw = webhookPath ?? '';
        return raw
            .replace(/^\/+/, '') // strip leading slashes
            .split('/')
            .filter((segment) => segment.length > 0)
            .map((segment) => encodeURIComponent(segment))
            .join('/');
    }

    private resolveWebhookPath(trigger: ITriggerInfo): string {
        const rawPath = (trigger.webhookPath ?? '').replace(/^\/+|\/+$/g, '');
        if (!rawPath) return '';

        const encodedRawPath = this.normalizeWebhookPath(rawPath);
        if (!encodedRawPath) return '';

        if (trigger.pathSource !== 'explicit') {
            return encodedRawPath;
        }

        // n8n only uses {webhookId}/{path} routing for dynamic paths (containing ':' segments).
        // Static explicit paths (e.g. "capital-finder") are always routed as {path} alone,
        // matching the WebhookEntity.uniquePath logic in n8n core.
        const hasDynamicSegments = rawPath.includes(':');
        if (!hasDynamicSegments) {
            return encodedRawPath;
        }

        if (trigger.webhookId) {
            const encodedWebhookId = encodeURIComponent(trigger.webhookId);
            if (rawPath === trigger.webhookId || rawPath.startsWith(`${trigger.webhookId}/`)) {
                return encodedRawPath;
            }
            return `${encodedWebhookId}/${encodedRawPath}`;
        }

        if (trigger.workflowId && trigger.nodeName) {
            const encodedWorkflowId = encodeURIComponent(trigger.workflowId);
            const encodedNodeName = encodeURIComponent(trigger.nodeName.toLowerCase());
            if (rawPath === trigger.workflowId || rawPath.startsWith(`${trigger.workflowId}/`)) {
                return encodedRawPath;
            }
            return `${encodedWorkflowId}/${encodedNodeName}/${encodedRawPath}`;
        }

        return encodedRawPath;
    }

    /**
     * Build the test-mode URL for a given trigger.
     *
     * n8n test URLs:
     *   webhook  → {base}/webhook-test/{path}
     *   form     → {base}/form-test/{path}
     *   chat     → {base}/webhook-test/{path}/chat
     */
    buildTestUrl(trigger: ITriggerInfo): string {
        const base = (this.client.defaults.baseURL ?? '').replace(/\/$/, '');
        const encodedPath = this.resolveWebhookPath(trigger);

        switch (trigger.type) {
            case 'webhook':
                return `${base}/webhook-test/${encodedPath}`;
            case 'form':
                return `${base}/form-test/${encodedPath}`;
            case 'chat':
                // When encodedPath is empty, omit the separator to avoid double-slash
                return encodedPath
                    ? `${base}/webhook-test/${encodedPath}/chat`
                    : `${base}/webhook-test/chat`;
            default:
                return '';
        }
    }

    /**
     * Build the production URL for a given trigger.
     *
     * Production URLs (same scheme as test, different path prefix):
     *   webhook  → {base}/webhook/{path}
     *   form     → {base}/form/{path}
     *   chat     → {base}/webhook/{path}/chat
     *
     * Note: this rebuilds the URL from scratch rather than doing a string
     * replacement on buildTestUrl()'s output, which would break when n8n is
     * hosted under a sub-path containing the same prefix string.
     */
    buildProductionUrl(trigger: ITriggerInfo): string {
        const base = (this.client.defaults.baseURL ?? '').replace(/\/$/, '');
        const encodedPath = this.resolveWebhookPath(trigger);

        switch (trigger.type) {
            case 'webhook':
                return `${base}/webhook/${encodedPath}`;
            case 'form':
                return `${base}/form/${encodedPath}`;
            case 'chat':
                return encodedPath
                    ? `${base}/webhook/${encodedPath}/chat`
                    : `${base}/webhook/chat`;
            default:
                return '';
        }
    }

    async getTestPlan(workflowId: string): Promise<ITestPlan> {
        let workflow: IWorkflow | null;
        try {
            workflow = await this.getWorkflow(workflowId);
        } catch (err: any) {
            return {
                workflowId,
                testable: false,
                reason: `Failed to fetch workflow ${workflowId}: ${String(err?.message ?? err)}`,
                triggerInfo: null,
                endpoints: {},
                payload: null,
            };
        }

        if (!workflow) {
            return {
                workflowId,
                testable: false,
                reason: `Workflow ${workflowId} not found`,
                triggerInfo: null,
                endpoints: {},
                payload: null,
            };
        }

        const triggerInfo = this.detectTrigger(workflow);
        if (!triggerInfo) {
            return {
                workflowId,
                workflowName: workflow.name,
                testable: false,
                reason: 'No trigger node found in this workflow.',
                triggerInfo: null,
                endpoints: {},
                payload: null,
            };
        }

        if (triggerInfo.type === 'schedule' || triggerInfo.type === 'unknown') {
            return {
                workflowId,
                workflowName: workflow.name,
                testable: false,
                reason: `Trigger type "${triggerInfo.type}" cannot be invoked via HTTP.`,
                triggerInfo,
                endpoints: {},
                payload: null,
            };
        }

        const payload = this.inferExpectedPayload(workflow);
        if (triggerInfo.type === 'webhook' || triggerInfo.type === 'form') {
            payload.notes.push(
                'For classic Webhook/Form triggers, the test URL often requires a manual arm step in the n8n editor before it will accept a request.',
            );
            payload.notes.push(
                'Use the production URL only after the workflow is active/published.',
            );
        }

        return {
            workflowId,
            workflowName: workflow.name,
            testable: true,
            reason: null,
            triggerInfo,
            endpoints: {
                testUrl: this.buildTestUrl(triggerInfo),
                productionUrl: this.buildProductionUrl(triggerInfo),
            },
            payload,
        };
    }

    /**
     * Runs a workflow in test mode by:
     *   1. Fetching the workflow to detect its trigger.
     *   2. Calling the test webhook URL directly.
     *
     * Returns an ITestResult that classifies the outcome:
     *   • success + responseData  → workflow ran and responded
     *   • config-gap              → missing creds, model, env vars (inform user)
     *   • wiring-error            → bad expression, HTTP failure (agent should fix)
     */
    async testWorkflow(
        workflowId: string,
        options?: { data?: unknown; query?: unknown; prod?: boolean }
    ): Promise<ITestResult> {
        // 1. Fetch workflow
        let workflow: IWorkflow | null;
        try {
            workflow = await this.getWorkflow(workflowId);
        } catch (err: any) {
            return {
                success: false,
                triggerInfo: null,
                errorMessage: `Failed to fetch workflow ${workflowId}: ${String(err?.message ?? err)}`,
                errorClass: 'wiring-error',
            };
        }

        if (!workflow) {
            return {
                success: false,
                triggerInfo: null,
                errorMessage: `Workflow ${workflowId} not found`,
                errorClass: 'wiring-error',
            };
        }

        // 2. Detect trigger
        const triggerInfo = this.detectTrigger(workflow);

        if (!triggerInfo) {
            return {
                success: false,
                triggerInfo: null,
                errorMessage: 'No trigger node found in this workflow.',
                errorClass: null,
                notes: ['This workflow has no trigger node and cannot be tested via HTTP.'],
            };
        }

        if (triggerInfo.type === 'schedule' || triggerInfo.type === 'unknown') {
            return {
                success: false,
                triggerInfo,
                errorMessage: `Trigger type "${triggerInfo.type}" cannot be called via HTTP.`,
                errorClass: null,
                notes: [
                    `The trigger "${triggerInfo.nodeName}" (${triggerInfo.type}) is not a webhook/form/chat trigger.`,
                    'Schedule and polling triggers must be activated and run by n8n at their configured intervals.',
                    'Use `n8nac push` to upload, then activate the workflow in the n8n UI.',
                ],
            };
        }

        // 3. Build URL
        const prod = options?.prod ?? false;
        const url = prod
            ? this.buildProductionUrl(triggerInfo)
            : this.buildTestUrl(triggerInfo);

        if (!url) {
            return {
                success: false,
                triggerInfo,
                errorMessage: 'Could not build webhook URL for this trigger type.',
                errorClass: null,
            };
        }

        // 4. Call the webhook
        const method = (triggerInfo.httpMethod ?? 'POST').toUpperCase();
        const body = options?.data ?? {};
        const query = options?.query;

        try {
            const requestConfig: any = {
                method,
                url,
                data: ['GET', 'HEAD'].includes(method) ? undefined : body,
                params: query ?? (['GET', 'HEAD'].includes(method) ? (body as any) : undefined),
                validateStatus: () => true, // Don't throw on non-2xx
                timeout: 30_000,             // Prevent indefinite hangs (e.g. chat trigger awaiting first message)
                // Reuse the shared httpsAgent (same TLS policy as API calls).
                httpsAgent: this.httpsAgent,
                // Do NOT send the n8n API key when hitting the webhook URL.
                // The webhook is a public endpoint and the API key header would
                // be forwarded as workflow input data, which is wrong.
                headers: { 'Content-Type': 'application/json', 'User-Agent': 'n8n-as-code' },
            };

            const res = await axios(requestConfig);
            const statusCode = res.status;
            const responseData = res.data;

            if (statusCode >= 200 && statusCode < 300) {
                return {
                    success: true,
                    triggerInfo,
                    webhookUrl: url,
                    statusCode,
                    responseData,
                    errorClass: null,
                };
            }

            // Non-2xx — classify the error
            const errorMessage = typeof responseData === 'object' && responseData !== null
                ? (responseData as any).message ?? JSON.stringify(responseData)
                : String(responseData);

            const errorClass = this.classifyTestError(statusCode, errorMessage, responseData);
            const notes = errorClass === 'runtime-state'
                ? this.buildRuntimeStateNotes(triggerInfo, !!prod, responseData)
                : undefined;

            return {
                success: false,
                triggerInfo,
                webhookUrl: url,
                statusCode,
                responseData,
                errorMessage,
                errorClass,
                notes,
            };
        } catch (err: any) {
            return {
                success: false,
                triggerInfo,
                webhookUrl: url,
                errorMessage: String(err?.message ?? err),
                errorClass: 'wiring-error',
            };
        }
    }

    /**
     * Heuristically classify a non-2xx test response as a config-gap or wiring-error.
     *
     * Class A (config-gap): missing credentials, unset LLM model, missing env vars.
     *   → Inform the user, do NOT iterate.
     *
     * Class B (wiring-error): bad expression, wrong field reference, HTTP failure.
     *   → Agent should fix and re-test.
     */
    private classifyTestError(
        statusCode: number,
        message: string,
        data: unknown,
    ): 'config-gap' | 'runtime-state' | 'wiring-error' {
        const lc = message.toLowerCase();
        const hint =
            data && typeof data === 'object' && typeof (data as any).hint === 'string'
                ? String((data as any).hint).toLowerCase()
                : '';

        const configGapPatterns = [
            'credential',
            'credentials',
            'api key',
            'authorization',
            'no model',
            'model not set',
            'environment variable',
            'env var',
            'secret',
            'token not',
            'not authenticated',
            'authentication failed',
            'not found in credentials',
        ];

        for (const pattern of configGapPatterns) {
            if (lc.includes(pattern)) return 'config-gap';
        }

        // 401 indicates an authentication/credential issue (config gap)
        if (statusCode === 401) return 'config-gap';
        // 404 webhook-not-registered is usually not a workflow wiring bug:
        // - test URL => webhook was not armed in the editor
        // - production URL => workflow is not active/published yet, or n8n has not registered it
        if (
            statusCode === 404 &&
            lc.includes('requested webhook') &&
            (hint.includes("click the 'execute workflow' button") ||
                hint.includes('workflow must be active for a production url to run successfully') ||
                lc.includes('is not registered'))
        ) {
            return 'runtime-state';
        }
        // 403 from n8n's webhook-test typically means the workflow is not currently
        // open in the n8n editor (test-mode webhooks are only active while the
        // workflow is open). This is a wiring/state concern, not a credential gap.
        if (statusCode === 403 && hint.includes("click the 'execute workflow' button")) {
            return 'runtime-state';
        }

        return 'wiring-error';
    }

    private buildRuntimeStateNotes(
        triggerInfo: ITriggerInfo,
        prod: boolean,
        data: unknown,
    ): string[] {
        const notes: string[] = [];
        const hint =
            data && typeof data === 'object' && typeof (data as any).hint === 'string'
                ? String((data as any).hint)
                : '';

        if (!prod && (triggerInfo.type === 'webhook' || triggerInfo.type === 'form')) {
            notes.push(
                'The test URL for this trigger is temporary. n8n only registers it after you click "Execute workflow" or "Listen for test event" in the editor.',
            );
            notes.push(
                'This arm/listen step is manual. n8n-as-code does not have a documented public API to register test webhooks on your behalf.',
            );
            notes.push('Do not edit or re-push the workflow just because this test URL returned 404/403.');
            notes.push('Once the workflow is armed in the editor, retry the same test request once.');
        } else if (prod) {
            notes.push('The production webhook should exist only when the workflow is active/published in n8n.');
            notes.push(
                'If `workflow activate` already succeeded but the production URL still says the webhook is not registered, treat this as a publish/runtime-state issue rather than a workflow-code bug.',
            );
            notes.push('Do not keep editing the workflow blindly. Confirm the workflow is active in n8n before retrying.');
        } else {
            notes.push('This looks like a runtime-state issue in n8n rather than a bug in the workflow code.');
        }

        if (hint) {
            notes.push(`n8n hint: ${hint}`);
        }

        notes.push('No workflow execution started yet, so `execution list/get` will not help until the trigger is accepted.');
        return notes;
    }

    private inferExpectedPayload(workflow: IWorkflow): IInferredPayload {
        const fields = new Map<string, IInferredPayloadField>();
        const nodes: any[] = workflow.nodes ?? [];

        const ensureField = (source: IInferredPayloadField['source'], path: string, evidence: string) => {
            const key = `${source}:${path}`;
            const existing = fields.get(key);
            if (existing) {
                if (!existing.evidence.includes(evidence)) {
                    existing.evidence.push(evidence);
                }
                return;
            }

            fields.set(key, {
                path,
                source,
                required: true,
                example: this.getExampleValueForPath(path),
                evidence: [evidence],
            });
        };

        for (const node of nodes) {
            const params = node?.parameters ?? {};
            const serialized = JSON.stringify(params, null, 2);
            const sources: Array<{ source: IInferredPayloadField['source']; regex: RegExp }> = [
                { source: 'body', regex: /\$json(?:\.body|\[['"]body['"]\])(?:\.([A-Za-z0-9_.-]+)|\[['"]([^'"[\]]+)['"]\])/g },
                { source: 'query', regex: /\$json(?:\.query|\[['"]query['"]\])(?:\.([A-Za-z0-9_.-]+)|\[['"]([^'"[\]]+)['"]\])/g },
                { source: 'headers', regex: /\$json(?:\.headers|\[['"]headers['"]\])(?:\.([A-Za-z0-9_.-]+)|\[['"]([^'"[\]]+)['"]\])/g },
                { source: 'root', regex: /\$json\.([A-Za-z0-9_.-]+)/g },
            ];

            for (const { source, regex } of sources) {
                for (const match of serialized.matchAll(regex)) {
                    const path = match[1] || match[2];
                    if (!path) continue;
                    if (source === 'root' && ['body', 'query', 'headers'].includes(path.split('.')[0])) continue;
                    ensureField(source, path, `${node.name}: ${match[0]}`);
                }
            }
        }

        const sortedFields = Array.from(fields.values()).sort((a, b) => {
            const sourceOrder = ['body', 'query', 'headers', 'root'];
            const sourceDiff = sourceOrder.indexOf(a.source) - sourceOrder.indexOf(b.source);
            return sourceDiff !== 0 ? sourceDiff : a.path.localeCompare(b.path);
        });

        const inferred = sortedFields.length > 0
            ? this.buildInferredPayloadObject(sortedFields)
            : {};

        return {
            inferred,
            confidence: sortedFields.length >= 3 ? 'medium' : sortedFields.length > 0 ? 'low' : 'low',
            fields: sortedFields,
            notes: sortedFields.length > 0
                ? [
                    'Payload is inferred heuristically from workflow expressions.',
                    'Review the trigger node and downstream expressions before relying on this payload.',
                ]
                : [
                    'No payload fields were inferred from workflow expressions.',
                    'The workflow may still accept an empty JSON object or rely on query parameters/headers not referenced statically.',
                ],
        };
    }

    private buildInferredPayloadObject(fields: IInferredPayloadField[]): Record<string, unknown> {
        const payload: Record<string, unknown> = {};

        for (const field of fields) {
            const rootKey = field.source === 'root' ? field.path : `${field.source}.${field.path}`;
            this.setNestedValue(payload, rootKey, field.example);
        }

        return payload;
    }

    private setNestedValue(target: Record<string, unknown>, dottedPath: string, value: unknown): void {
        const parts = dottedPath.split('.').filter(Boolean);
        if (parts.length === 0) return;

        let cursor: any = target;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) {
                cursor[part] = {};
            }
            cursor = cursor[part];
        }
        cursor[parts[parts.length - 1]] = value;
    }

    private getExampleValueForPath(path: string): unknown {
        const last = path.split('.').pop()?.toLowerCase() ?? '';
        if (last.includes('email')) return 'user@example.com';
        if (last.includes('name')) return 'Example User';
        if (last.includes('id')) return 'example-id';
        if (last.includes('phone')) return '+33123456789';
        if (last.includes('date')) return '2026-01-01';
        if (last.includes('time')) return '09:00';
        if (last.includes('url')) return 'https://example.com';
        if (last.includes('token') || last.includes('key') || last.includes('secret')) return 'example-secret';
        if (last.includes('count') || last.includes('limit') || last.includes('size')) return 1;
        if (last.includes('enabled') || last.startsWith('is') || last.startsWith('has')) return true;
        if (last.includes('message') || last.includes('text') || last.includes('prompt')) return 'example message';
        return 'example';
    }
}
